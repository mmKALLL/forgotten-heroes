import { z } from 'zod'
import {
  AbilitySchema,
  AbilityScoresSchema,
  GoodSchema,
  IdSchema,
  LogToneSchema,
  PaceSchema,
  PositionSchema,
  SkillSchema,
  SourceSchema,
} from './common'
import { ABILITIES, SKILLS, TIERS } from './types'
import { SituationSchema } from './encounter'
import { WorldStateSchema } from './world'

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  ancestry: IdSchema,
  classId: IdSchema,
  level: z.number().int().min(1).max(20),
  abilities: AbilityScoresSchema,
  skillProficiencies: z.array(SkillSchema),
  hitDie: z.number().int(),
  hp: z.number().int(),
  maxHp: z.number().int().min(1),
  exhaustion: z.number().int().min(0).max(6),
  /** Strain stacks by skill (design §3): each is −1 to that skill. One stack per skill fades each day. */
  strain: z.partialRecord(SkillSchema, z.number().int().min(1)).default({}),
})
export type Character = z.infer<typeof CharacterSchema>

export const CheckStatSchema = z.enum([...SKILLS, ...ABILITIES])

export const RollRecordSchema = z.object({
  stat: CheckStatSchema,
  /** Set when the check overrides the skill's default ability, e.g. Intimidation (CHA). */
  ability: AbilitySchema.optional(),
  actorId: z.string(),
  dice: z.array(z.number().int().min(1).max(20)),
  kept: z.number().int(),
  keptIndex: z.number().int().min(0),
  modifier: z.number().int(),
  total: z.number().int(),
  dc: z.number().int(),
  mode: z.enum(['normal', 'advantage', 'disadvantage']),
  tier: z.enum(TIERS),
})
export type RollRecord = z.infer<typeof RollRecordSchema>

export const LogEntrySchema = z.object({
  day: z.number().int(),
  text: z.string(),
  tone: LogToneSchema,
})
export type LogEntry = z.infer<typeof LogEntrySchema>

export const EncounterLogEntrySchema = z.object({
  text: z.string(),
  tone: LogToneSchema,
  /** The roll behind this entry, so the UI can animate it. */
  roll: RollRecordSchema.optional(),
  highStakes: z.boolean().optional(),
})
export type EncounterLogEntry = z.infer<typeof EncounterLogEntrySchema>

export const EncounterStateSchema = z.object({
  /** A compiled snapshot (archetypes expanded, DCs numeric), so editing data never breaks a save. */
  situation: SituationSchema,
  source: SourceSchema,
  /** The current stage, or null once the encounter has ended. */
  stage: IdSchema.nullable(),
  position: PositionSchema,
  /** Slot values filled when the encounter started, e.g. { who: "a wary dwarf tinker" }. */
  slots: z.record(z.string(), z.string()),
  /** The hidden twist, rolled at the start. The UI must not show it. */
  twist: z.boolean(),
  twistRevealed: z.boolean(),
  /**
   * The kind drawn from the twist table when the encounter started (its stages joined the
   * situation snapshot), or null for a bespoke twist or none. Hidden until revealed.
   */
  twistKind: z.object({ id: IdSchema, what: z.string() }).nullable().default(null),
  /** Which kind of twist it is has been revealed (a great Insight read, or the twist happened). */
  twistKindRevealed: z.boolean().default(false),
  /** Added to the party's next check in this encounter, then reset to 0 (e.g. −2 after a failed Insight). */
  nextCheckModifier: z.number().int().default(0),
  /** Why the next check is modified, e.g. "misread". The latest reason wins; cleared with the modifier. */
  nextCheckReason: z.string().nullable().default(null),
  /** The point of interest being visited, or null on the road and elsewhere. */
  poi: IdSchema.nullable().default(null),
  /** The domain (settlement id) it happens in, for clues (discoverPoi); null when unknown. */
  domain: IdSchema.nullable().default(null),
  /** "stage/option" keys of `once` options already chosen. */
  used: z.array(z.string()),
  log: z.array(EncounterLogEntrySchema),
})
export type EncounterState = z.infer<typeof EncounterStateSchema>

/** One day on the road and the pace it was walked at, so pursuit can judge "pace since queued". */
export const PaceDaySchema = z.object({
  /** The game day travelled (state.day when the day began). */
  day: z.number().int().min(1),
  pace: PaceSchema,
  coverTracks: z.boolean(),
})
export type PaceDay = z.infer<typeof PaceDaySchema>

export const FollowUpSchema = z.object({
  situationId: IdSchema,
  /** Other encounters that must happen before this one is drawn. */
  wait: z.number().int().min(0),
  /** The game day it was queued: pursuit (design §7) judges the party's pace since then. */
  queuedDay: z.number().int().min(1).optional(),
  /** How many times the party has outrun this pursuit already. */
  escapes: z.number().int().min(1).optional(),
  /** A pursuit's view of journeys finished since it was queued (folded in on arrival). */
  trail: z.array(PaceDaySchema).optional(),
})
export type FollowUp = z.infer<typeof FollowUpSchema>

/** One encounter check by one character. Strain (Plan 3) counts these per day and week. */
export const SkillUseSchema = z.object({
  day: z.number().int().min(1),
  characterId: z.string(),
  skill: SkillSchema,
})
export type SkillUse = z.infer<typeof SkillUseSchema>

/**
 * Goods carried, by good. Only the essentials exist so far (GOODS); Plan 4 adds the rest of the
 * 15, and a good that is missing counts as 0, so saves keep loading.
 */
export const GoodsSchema = z.partialRecord(GoodSchema, z.number().int().min(0))
export type Goods = z.infer<typeof GoodsSchema>

/** A journey along one route or path, between settlements and points of interest. */
export const TravelStateSchema = z.object({
  route: IdSchema,
  from: IdSchema,
  to: IdSchema,
  km: z.number().int().min(1),
  /** Speed at the journey's pace (see travel/pace.ts). */
  kmPerDay: z.number().min(1),
  kmDone: z.number().min(0),
  daysDone: z.number().int().min(0),
  /** The expected length in days, shown before departure. */
  days: z.number().int().min(1),
  /** Journey days (1-based) with an encounter, ascending; drawn at departure. Spent as they happen. */
  encounterDays: z.array(z.number().int().min(1)),
  /** Chosen per journey (design §7). */
  pace: PaceSchema.default('steady'),
  /** Covering tracks (cautious pace only) slows the party but makes pursuers lose the trail. */
  coverTracks: z.boolean().default(false),
  /** Each day travelled so far, oldest first. */
  paceLog: z.array(PaceDaySchema).default([]),
  /** The best-suited member forages for water (and food) each day on land (design §7). */
  forage: z.boolean().default(true),
})
export type TravelState = z.infer<typeof TravelStateSchema>

export const GameStateSchema = z.object({
  version: z.literal(5),
  seed: z.number().int(),
  rng: z.object({ state: z.number().int().min(0).max(0xffffffff) }),
  day: z.number().int().min(1),
  party: z.array(CharacterSchema),
  gold: z.number().int(),
  inspiration: z.number().int().min(0),
  log: z.array(LogEntrySchema),
  lastRoll: RollRecordSchema.nullable(),
  encounter: EncounterStateSchema.nullable(),
  followUps: z.array(FollowUpSchema),
  skillUses: z.array(SkillUseSchema),
  /** The political layer of this world, rolled from its seed (see generateWorld). */
  world: WorldStateSchema,
  /** The settlement or point of interest the party is at; null while on the road. */
  location: IdSchema.nullable(),
  /** The party has visited the site it is at since it arrived: one visit per arrival. */
  visited: z.boolean().default(false),
  travel: TravelStateSchema.nullable(),
  goods: GoodsSchema,
  /** Extra waterskins bought in town, on top of each member's own (WATERSKIN_WATER in engine/constants.ts). */
  waterskins: z.number().int().min(0).default(0),
})
export type GameState = z.infer<typeof GameStateSchema>
