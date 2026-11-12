import { z } from 'zod'
import { GoodCategorySchema, IdSchema, SkillSchema } from './common'
import { ACCESSORY_PARTS, HOOK_ACTIVITIES } from './types'

// ---------------------------------------------------------------------------------------------
// Rule hooks and accessories (Plan 5a, design §4 and §8). A hook is a small declarative rule
// change the engine interprets (src/engine/gear/hooks.ts). Accessories carry them now; per-party
// modifiers will reuse the same schema, so nothing here is accessory-specific.
// ---------------------------------------------------------------------------------------------

const int = (min: number, max: number) => z.number().int().min(min).max(max)

export const RuleHookSchema = z.discriminatedUnion('hook', [
  z
    .object({ hook: z.literal('skill'), skill: SkillSchema, amount: int(1, 2) })
    .describe("Wearer: + to that skill's checks"),
  z
    .object({
      hook: z.literal('activity'),
      activity: z.enum(HOOK_ACTIVITIES),
      amount: int(1, 3),
    })
    .describe(
      'Wearer: + when they lead that activity (forage, gather, explore, rumours, stowaway)'
    ),
  z
    .object({ hook: z.literal('endurance'), amount: int(1, 3) })
    .describe('Wearer: + to CON checks against exhaustion (hunger, thirst, forced march)'),
  z
    .object({ hook: z.literal('carry'), kg: int(1, 20) })
    .describe('Wearer: + carrying capacity in kg'),
  z
    .object({ hook: z.literal('maxHp'), amount: int(1, 10) })
    .describe('Wearer: + max HP while worn (applied on equip, removed on unequip)'),
  z
    .object({ hook: z.literal('strainFade'), amount: z.literal(1).default(1) })
    .describe('Wearer: Strain fades this many more stacks a day'),
  z
    .object({ hook: z.literal('strainGrace'), amount: z.literal(1).default(1) })
    .describe('Wearer: the daily Strain threshold is this much higher'),
  z
    .object({ hook: z.literal('lucky') })
    .describe("Wearer: once a day, rerolls a natural 1 on the wearer's encounter check"),
  z
    .object({
      hook: z.literal('sellBonus'),
      category: GoodCategorySchema,
      share: z.number().min(0.05).max(0.2),
    })
    .describe('Party: selling goods of that category pays this share more (before rounding)'),
  z
    .object({ hook: z.literal('ward'), share: z.number().min(0.02).max(0.1) })
    .describe("Party: the road's hostile share is this much lower (the best ward counts)"),
])
export type RuleHook = z.infer<typeof RuleHookSchema>
/** One kind of hook, e.g. `RuleHookOf<'skill'>`. */
export type RuleHookOf<K extends RuleHook['hook']> = Extract<RuleHook, { hook: K }>

export const AccessoryTierSchema = z.union([z.literal(1), z.literal(2)])

/**
 * A part an accessory is rolled from (kind `accessoryParts`): a base ("Ring") or an affix
 * ("Fox-eyed", "of the Long Road") with exactly one rule hook.
 */
export const AccessoryPartSchema = z
  .object({
    id: IdSchema,
    part: z.enum(ACCESSORY_PARTS),
    name: z.string().describe('"Ring", "Fox-eyed", "of the Long Road"'),
    weight: z.number().min(0).default(1).describe('Relative chance of being rolled'),
    minTier: AccessoryTierSchema.default(1).describe(
      'Rolled only on accessories of this tier or higher'
    ),
    value: z.number().int().min(0).describe("gp added to the accessory's value"),
    hook: RuleHookSchema.optional().describe('What an affix does; a base has none'),
    bases: z
      .array(IdSchema)
      .min(1)
      .optional()
      .describe('An affix: only on these bases (default any)'),
    notes: z.string().optional(),
  })
  .refine((p) => (p.part === 'base') === (p.hook === undefined), {
    message: 'an affix needs a hook, and a base has none',
    path: ['hook'],
  })
  .refine((p) => p.part !== 'base' || p.bases === undefined, {
    message: 'only affixes are limited to bases',
    path: ['bases'],
  })
export type AccessoryPartDef = z.infer<typeof AccessoryPartSchema>

/**
 * An accessory the party owns (worn or carried): a self-contained snapshot of what it was rolled
 * as, so editing the affix tables never breaks a save.
 */
export const AccessorySchema = z.object({
  id: z.string().min(1),
  name: z.string().describe('"Fox-eyed Ring of the Long Road"'),
  tier: AccessoryTierSchema,
  hooks: z.array(RuleHookSchema),
  value: z.number().int().min(0).describe('gp; shops sell it for this'),
})
export type Accessory = z.infer<typeof AccessorySchema>
