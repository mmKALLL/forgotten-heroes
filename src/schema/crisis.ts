import { z } from 'zod'
import { BiomeSchema, IdSchema } from './common'
import { CRISIS_ACTS, MAX_LEVEL, RUN_ENDINGS } from './types'

// ---------------------------------------------------------------------------------------------
// The Crisis (Plan 5b, design §10b): every world rolls one villain whose plot has three acts,
// each due about 100 days after the last and played out at its own hidden site.
// Text slots in villain and act texts: {villain}, {land}, {site}, {seat}.
// ---------------------------------------------------------------------------------------------

export const RunEndingSchema = z.enum(RUN_ENDINGS)

export const VillainActSchema = z.object({
  id: IdSchema.describe('Unique within its villain'),
  name: z.string().describe('e.g. "The Opened Graves"'),
  goal: z.string().describe('What the villain means to do, e.g. "wake the dead of the barrows"'),
  site: IdSchema.describe('The poiTypes id of the act site (weight 0, category quest)'),
  biomes: z
    .array(BiomeSchema)
    .default([])
    .describe('Favoured terrain: the act site is placed more often in a land of these biomes'),
  seat: z
    .boolean()
    .default(false)
    .describe("The act site is placed in a kingdom seat's domain (not the start's)"),
  clue: z
    .string()
    .describe('Logged when the act\'s land becomes known, e.g. "{villain}\'s diggers ... {land}."'),
  thwarted: z.string().describe('Logged when the act is thwarted'),
  failed: z.string().describe('Logged when the act fails, and shown on the game-over screen'),
})
export type VillainAct = z.infer<typeof VillainActSchema>

export const VillainSchema = z
  .object({
    id: IdSchema,
    name: z.string().describe('The title, e.g. "The Ashen Prophet"'),
    names: IdSchema.optional().describe(
      'A parts table for the villain\'s own name (e.g. "Morvaine"), put before the title'
    ),
    weight: z.number().min(0).default(1).describe('Relative chance of being rolled for a world'),
    threats: z
      .array(IdSchema)
      .default([])
      .describe('Threat ids: the villain is favoured in worlds where one holds a land'),
    summary: z.string().describe('One line for the Crisis panel'),
    omen: z.string().describe('What a notable person or a rumour says before the plan is known'),
    plan: z.string().describe('Logged in full when the plan is learned'),
    reveal: IdSchema.describe('The poiTypes id of the site where the plan is learned'),
    acts: z.array(VillainActSchema).length(CRISIS_ACTS),
    victory: z.string().describe('Shown when all three acts are thwarted'),
    notes: z.string().optional(),
  })
  .refine((v) => new Set(v.acts.map((a) => a.id)).size === v.acts.length, {
    message: 'act ids must be distinct',
    path: ['acts'],
  })
  .refine((v) => new Set([v.reveal, ...v.acts.map((a) => a.site)]).size === v.acts.length + 1, {
    message: 'the reveal and each act need their own site type',
    path: ['acts'],
  })
export type Villain = z.infer<typeof VillainSchema>

const day = z.number().int().min(1)

/** One act as rolled for this world: its site (a POI id) and its due day. */
export const CrisisActStateSchema = z.object({
  id: IdSchema.describe("The villain's act id"),
  poi: IdSchema.describe('The act site: a POI id in world.pois'),
  due: day,
})
export type CrisisActState = z.infer<typeof CrisisActStateSchema>

/**
 * The world's Crisis: rolled once (the villain, its sites and due days), plus only what the party
 * did. Lateness, failure and the outcome are derived from the day, never stored.
 */
export const CrisisStateSchema = z.object({
  villain: IdSchema.describe('A villains id'),
  name: z.string().describe('The rolled name, e.g. "Morvaine, the Ashen Prophet"'),
  startDay: day,
  reveal: IdSchema.describe('The reveal site: a POI id in world.pois'),
  acts: z.array(CrisisActStateSchema).length(CRISIS_ACTS),
  learned: day.nullable().default(null).describe('The day the plan was learned'),
  clues: z
    .array(z.number().int().min(0))
    .length(CRISIS_ACTS)
    .default([0, 0, 0])
    .describe('Clues found per act (the engine caps them)'),
  thwarted: z
    .array(day.nullable())
    .length(CRISIS_ACTS)
    .default([null, null, null])
    .describe('The day each act was thwarted'),
  endSeen: z
    .boolean()
    .default(false)
    .describe('The won or lost screen was dismissed with "Keep playing"'),
})
export type CrisisState = z.infer<typeof CrisisStateSchema>

/** A run in the Hall of the Fallen (kept by the UI in localStorage; built by the engine). */
export const RunRecordSchema = z.object({
  id: z.string().min(1).describe("The run's id (its game seed), so a record is updated in place"),
  seed: z.number().int(),
  ending: RunEndingSchema.nullable(),
  day,
  villain: z.string().nullable().describe("The villain's rolled name"),
  acts: z.array(z.enum(['thwarted', 'failed']).nullable()).max(CRISIS_ACTS),
  party: z.array(
    z.object({
      name: z.string(),
      ancestry: IdSchema,
      classId: IdSchema,
      level: z.number().int().min(1).max(MAX_LEVEL),
      fallen: z.boolean(),
    })
  ),
  place: z.string().describe('Where the run ended'),
  recorded: z.string().describe('When it was recorded: an ISO date the UI stamps'),
})
export type RunRecord = z.infer<typeof RunRecordSchema>
