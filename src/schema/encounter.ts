import { z } from 'zod'
import {
  AbilitySchema,
  CreatureTypeSchema,
  IdSchema,
  LogToneSchema,
  PositionSchema,
  SkillSchema,
} from './common'
import { MAX_DC, MIN_DC } from './constants'

// ---------------------------------------------------------------------------------------------
// Effects: what an outcome does to the game. The engine interprets them in applyEffects().
// ---------------------------------------------------------------------------------------------

const amount = z.number().int()

export const EffectSchema = z.discriminatedUnion('effect', [
  z.object({ effect: z.literal('gold'), amount }).describe('Gain or lose gold; gold never drops below 0'),
  z
    .object({ effect: z.literal('hp'), amount, target: z.enum(['actor', 'all', 'random']) })
    .describe('Heal (+) or hurt (−) the acting member, everyone, or one random conscious member'),
  z
    .object({ effect: z.literal('exhaustion'), amount, target: z.enum(['actor', 'all']) })
    .describe('Add (+) or remove (−) exhaustion levels'),
  z.object({ effect: z.literal('inspiration'), amount: z.number().int().min(1) }),
  z.object({ effect: z.literal('days'), amount: z.number().int().min(1) }).describe('Time passes'),
  z
    .object({ effect: z.literal('position'), position: PositionSchema })
    .describe('Edge or Exposed for the next check in this encounter'),
  z
    .object({
      effect: z.literal('followUp'),
      situation: IdSchema,
      after: z.number().int().min(0).default(0).describe('Other encounters that happen first'),
    })
    .describe('Queue a later encounter'),
  z
    .object({ effect: z.literal('nextCheckModifier'), amount })
    .describe("Add to the party's next check in this encounter (e.g. −2 after misreading a situation)"),
  z.object({ effect: z.literal('revealTwist') }).describe('Show the odds of the hidden twist'),
  z.object({ effect: z.literal('log'), text: z.string(), tone: LogToneSchema.default('info') }),
  // Extension point: Plan 4 adds { "effect": "goods", "good": "food", "amount": -2 } here.
])
export type Effect = z.infer<typeof EffectSchema>

// ---------------------------------------------------------------------------------------------
// Requirements: an option is only available when all of them hold.
// ---------------------------------------------------------------------------------------------

export const RequirementSchema = z.discriminatedUnion('req', [
  z.object({ req: z.literal('gold'), min: z.number().int().min(1) }),
  // Extension point: Plan 4 adds { "req": "goods", "good": "healing", "min": 1 }.
])
export type Requirement = z.infer<typeof RequirementSchema>

// ---------------------------------------------------------------------------------------------
// Checks, outcomes and options.
// ---------------------------------------------------------------------------------------------

/** Inside archetypes a DC can be relative to the DC the situation passes in: "dc", "dc+2", "dc-1". */
export const DC_EXPRESSION = /^dc([+-][0-9]+)?$/

export const DcSchema = z
  .union([z.number().int().min(MIN_DC).max(MAX_DC), z.string().regex(DC_EXPRESSION)])
  .describe('A DC from 1 to 40, or inside an archetype "dc", "dc+2" or "dc-1"')

export const CheckSchema = z.object({
  skill: SkillSchema,
  ability: AbilitySchema.optional().describe(
    'Overrides the skill\'s default ability, e.g. "cha" for Intimidation (CHA)'
  ),
  dc: DcSchema,
  combat: z.boolean().optional().describe('Combat checks never grant Inspiration on a natural 20'),
})
export type Check = z.infer<typeof CheckSchema>

const outcomeFields = {
  text: z.string(),
  effects: z.array(EffectSchema).default([]),
  goto: IdSchema.optional().describe('Next stage. Without goto or stay, the encounter ends.'),
  stay: z.boolean().optional().describe('Stay on the current stage'),
}
export const OutcomeBranchSchema = z.object(outcomeFields)
export type OutcomeBranch = z.infer<typeof OutcomeBranchSchema>

export const OutcomeSchema = z.object({
  ...outcomeFields,
  twist: OutcomeBranchSchema.optional().describe('Replaces this outcome when the hidden twist is true'),
})
export type Outcome = z.infer<typeof OutcomeSchema>

const optionFields = {
  id: IdSchema.describe('Unique within its stage'),
  label: z.string(),
  description: z.string().optional(),
  requires: z.array(RequirementSchema).default([]),
  once: z.boolean().optional().describe('Can only be chosen once per encounter'),
}

export const CheckOptionSchema = z.object({
  ...optionFields,
  kind: z.literal('check'),
  check: CheckSchema,
  highStakes: z.boolean().optional().describe('Force the slow, glowing dice roll'),
  outcomes: z.object({
    critFail: OutcomeSchema.optional().describe('Defaults to the fail outcome'),
    fail: OutcomeSchema,
    partial: OutcomeSchema,
    success: OutcomeSchema,
    critSuccess: OutcomeSchema.optional().describe('Defaults to the success outcome'),
  }),
})
export type CheckOption = z.infer<typeof CheckOptionSchema>

export const FixedOptionSchema = z.object({
  ...optionFields,
  kind: z.literal('fixed'),
  outcome: OutcomeSchema,
})
export type FixedOption = z.infer<typeof FixedOptionSchema>

export const OptionSchema = z.discriminatedUnion('kind', [CheckOptionSchema, FixedOptionSchema])
export type Option = z.infer<typeof OptionSchema>

// ---------------------------------------------------------------------------------------------
// Archetypes, stages and situations.
// ---------------------------------------------------------------------------------------------

export const ArchetypeRefSchema = z.object({
  id: IdSchema,
  dc: z.number().int().min(MIN_DC).max(MAX_DC).default(13).describe('What "dc" means in the archetype'),
  reward: z.number().min(0).max(10).default(1).describe('Multiplies every gold amount in the archetype'),
})
export type ArchetypeRef = z.infer<typeof ArchetypeRefSchema>

export const ArchetypeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string(),
  options: z.array(OptionSchema).min(1),
})
export type Archetype = z.infer<typeof ArchetypeSchema>

export const StageSchema = z.object({
  text: z.string(),
  archetype: ArchetypeRefSchema.optional().describe('Its options come first, then this stage\'s own'),
  options: z.array(OptionSchema).default([]),
})
export type Stage = z.infer<typeof StageSchema>

export const SlotSourceSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('table'), table: IdSchema.describe('A parts table id') }),
  z.object({
    from: z.literal('creature'),
    types: z.array(CreatureTypeSchema).default([]).describe('Empty means any type'),
    maxCr: z.number().min(0).optional(),
    form: z.enum(['group', 'name']).default('group'),
  }),
])
export type SlotSource = z.infer<typeof SlotSourceSchema>

export const TwistSchema = z.object({
  chance: z.number().min(0).max(1).describe('Rolled secretly when the encounter starts'),
  what: z.string().describe('Always shown, e.g. "they are bait for an ambush"; Insight reveals the chance'),
})
export type Twist = z.infer<typeof TwistSchema>

const situationFields = {
  id: IdSchema,
  title: z.string(),
  notes: z.string().optional(),
  weight: z.number().min(0).default(1).describe('Relative chance in a random draw'),
  tags: z.array(z.string()).default([]).describe('Biomes and themes, for later plans'),
  slots: z.record(IdSchema, SlotSourceSchema).default({}).describe('Filled when the encounter starts'),
  twist: TwistSchema.optional(),
}

export const SituationSchema = z.object({
  ...situationFields,
  wonder: z.boolean().default(false).describe('One click, flavour only, never a cost'),
  followUpOnly: z.boolean().default(false).describe('Never drawn at random; only queued by followUp'),
  start: IdSchema.default('start'),
  stages: z.record(IdSchema, StageSchema),
})
export type Situation = z.infer<typeof SituationSchema>

/** A one-stage situation: an archetype dressed with parts-table slots. */
export const SituationTemplateSchema = z.object({
  ...situationFields,
  text: z.string(),
  archetype: ArchetypeRefSchema,
})
export type SituationTemplate = z.infer<typeof SituationTemplateSchema>

// ---------------------------------------------------------------------------------------------
// Parts tables and creatures.
// ---------------------------------------------------------------------------------------------

export const PartsTableSchema = z.object({
  id: IdSchema,
  description: z.string(),
  rows: z
    .array(z.object({ text: z.string().describe('May contain {other-table}'), weight: z.number().min(0).default(1) }))
    .min(1),
})
export type PartsTable = z.infer<typeof PartsTableSchema>

export const CreatureSchema = z.object({
  id: IdSchema,
  name: z.string(),
  group: z.string().describe('How a group reads in text, e.g. "a band of bandits"'),
  type: CreatureTypeSchema,
  cr: z.number().min(0),
  description: z.string().describe('One line, in our own words'),
})
export type Creature = z.infer<typeof CreatureSchema>
