import { z } from 'zod'
import { IdSchema } from './common'
import { UPGRADES } from './types'

export const UpgradeIdSchema = z.enum(UPGRADES)

/**
 * A party upgrade (Plan 6c): its name, what it is, its price and who sells it. What each level
 * does is the engine's (town/upgrades.ts), so the odds it changes stay computable.
 */
export const UpgradeDefSchema = z.object({
  id: UpgradeIdSchema,
  name: z.string(),
  description: z
    .string()
    .describe('What it is, in a sentence of flavour (the tooltip adds what each level does)'),
  basePrice: z
    .number()
    .int()
    .min(1)
    .describe('gp: level n costs basePrice × n (a normal base is 100; the company banner 200)'),
  soldBy: z
    .array(IdSchema)
    .min(1)
    .describe('Services (data/original/services.json ids) that sell its next level'),
})
export type UpgradeDef = z.infer<typeof UpgradeDefSchema>
