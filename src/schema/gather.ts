import { z } from 'zod'
import { AbilitySchema, BiomeSchema, GoodSchema, IdSchema, SkillSchema, TierSchema } from './common'

/**
 * What a party can gather for a day in a settlement's domain (Plan 5a, kind `gatherRules`): a
 * good, the lands it is found in, the check and what each tier yields.
 */
export const GatherRuleSchema = z.object({
  id: IdSchema,
  good: GoodSchema,
  label: z.string().describe('The action, e.g. "Cut timber"'),
  text: z.string().optional().describe('A line of flavour'),
  biomes: z
    .array(BiomeSchema.exclude(['sea']))
    .min(1)
    .describe('The lands it is found in (never at sea)'),
  skill: SkillSchema,
  ability: AbilitySchema.optional().describe("Overrides the skill's default ability"),
  dc: z.number().int().min(1).max(30),
  yield: z
    .record(TierSchema, z.number().int().min(0))
    .describe('Units per tier for two workers (more workers gather more)'),
  notes: z.string().optional(),
})
export type GatherRule = z.infer<typeof GatherRuleSchema>
