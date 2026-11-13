import { z } from 'zod'
import { BiomeSchema, IdSchema } from './common'
import { CRISIS_ACTS, CRISIS_BOSS_STYLES, MAX_LEVEL, RUN_ENDINGS } from './types'

// ---------------------------------------------------------------------------------------------
// The Crisis (Plans 5b and 6, design §10b): every world rolls one villain whose plot has three
// acts on a fixed calendar. Each act is an investigation at its lead site, then a prevention at
// its key site, both hidden POIs.
// Text slots in villain and act texts: {villain}, {land}, {site}, {seat}.
// ---------------------------------------------------------------------------------------------

export const RunEndingSchema = z.enum(RUN_ENDINGS)

const cr = z.number().min(0).max(30)

export const VillainActSchema = z.object({
  id: IdSchema.describe('Unique within its villain'),
  name: z.string().describe('e.g. "The Opened Graves"'),
  goal: z.string().describe('What the villain means to do, e.g. "wake the dead of the barrows"'),
  lead: IdSchema.describe(
    "The poiTypes id of the act's lead site (weight 0, category quest): henchmen, and the way to " +
      "the key site. Act I's is where the plan is learned. Acts may share a lead type"
  ),
  site: IdSchema.describe("The poiTypes id of the act's key site (weight 0, category quest)"),
  leadCr: cr.describe(
    "The challenge rating of the lead site's encounter (its DCs, rules/challenge)"
  ),
  keyCr: cr.describe("The challenge rating of the key site's encounter"),
  boss: z
    .string()
    .optional()
    .describe(
      'Who is met at the key site, e.g. "Captain Hask, the Prophet\'s Hand": a finale ' +
        "villain's lieutenant; absent for the villain itself"
    ),
  surge: z
    .boolean()
    .default(false)
    .describe("The world's danger surges in the last days before the act's due day"),
  biomes: z
    .array(BiomeSchema)
    .default([])
    .describe('Favoured terrain: the key site is placed more often in a land of these biomes'),
  seat: z
    .boolean()
    .default(false)
    .describe("The key site is placed in a kingdom seat's domain (not the start's)"),
  clue: z
    .string()
    .describe(
      "Logged when the act's land (its lead's) becomes known, e.g. \"{villain}'s diggers ... {land}.\""
    ),
  open: z.string().optional().describe('Logged on the day the act opens (else a default line)'),
  hurry: z.string().optional().describe('Logged on its hurry day (else a default line)'),
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
    boss: z
      .enum(CRISIS_BOSS_STYLES)
      .default('finale')
      .describe(
        'recurring: the villain is met at every key site, stronger each time; finale: its ' +
          'lieutenants hold acts I and II, and it is met at act III'
      ),
    summary: z.string().describe('One line for the Crisis panel'),
    omen: z.string().describe('What a notable person or a rumour says before the plan is known'),
    plan: z.string().describe("Logged in full when the plan is learned (at act I's lead site)"),
    acts: z.array(VillainActSchema).length(CRISIS_ACTS),
    victory: z.string().describe('Shown when all three acts are thwarted'),
    notes: z.string().optional(),
  })
  .refine((v) => new Set(v.acts.map((a) => a.id)).size === v.acts.length, {
    message: 'act ids must be distinct',
    path: ['acts'],
  })
  .refine(
    (v) =>
      new Set(v.acts.map((a) => a.site)).size === v.acts.length &&
      v.acts.every((a) => !v.acts.some((b) => b.lead === a.site)),
    { message: 'each act needs its own key site type, never used as a lead', path: ['acts'] }
  )
export type Villain = z.infer<typeof VillainSchema>

const day = z.number().int().min(1)

/** One act as rolled for this world: its lead and key sites (POI ids). */
export const CrisisActStateSchema = z.object({
  id: IdSchema.describe("The villain's act id"),
  lead: IdSchema.describe('The lead site: a POI id in world.pois'),
  key: IdSchema.describe('The key site: a POI id in world.pois'),
})
export type CrisisActState = z.infer<typeof CrisisActStateSchema>

/**
 * The world's Crisis: rolled once (the villain and its sites), plus only what the party did. The
 * calendar follows from `startDay` (crisis/calendar.ts); the phases, failure and the outcome are
 * derived from the day, never stored.
 */
export const CrisisStateSchema = z.object({
  villain: IdSchema.describe('A villains id'),
  name: z.string().describe('The rolled name, e.g. "Morvaine, the Ashen Prophet"'),
  startDay: day.describe('Day 1 of the calendar: act n opens on startDay − 1 + 100(n − 1) + 30'),
  acts: z.array(CrisisActStateSchema).length(CRISIS_ACTS),
  leads: z
    .array(day.nullable())
    .length(CRISIS_ACTS)
    .default([null, null, null])
    .describe(
      "The day each act's lead was won (its key site revealed); act I's is the day the plan was learned"
    ),
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
