import { z } from 'zod'
import {
  AbilitySchema,
  AbilityScoresSchema,
  ContractKindSchema,
  GoodSchema,
  IdSchema,
  LogToneSchema,
  PaceSchema,
  PositionSchema,
  SkillSchema,
  SourceSchema,
} from './common'
import { ABILITIES, CAMARADERIE_MAX, SKILLS, TIERS } from './types'
import { SituationSchema } from './encounter'
import { CrisisStateSchema } from './crisis'
import { AccessorySchema } from './gear'
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
  /** Total XP earned, never reset; the level follows from the XP table (Plan 5a). */
  xp: z.number().int().min(0).default(0),
  /** Signed on at a service (Plan 5a): may be dismissed and may desert. Founders are not. */
  hired: z.boolean().default(false),
  /** An old wound a recruit came with (Plan 6): this ability is OLD_WOUND_PENALTY lower. */
  oldWound: AbilitySchema.nullable().default(null),
  /** The accessory worn (one slot), or null. */
  accessory: AccessorySchema.nullable().default(null),
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
  /** The world danger share applied to this encounter's snapshot when it started, for display. */
  danger: z.number().min(0).default(0),
  /** "stage/option" keys of `once` options already chosen. */
  used: z.array(z.string()),
  log: z.array(EncounterLogEntrySchema),
})
export type EncounterState = z.infer<typeof EncounterStateSchema>

/** One day on the road and the pace it was walked at, so pursuit can judge "pace since queued". */
export const PaceDaySchema = z.object({
  /** The game day travelled (state.day when the day began). */
  day: z.number().int().min(1),
  /** Stealthy days cover the party's tracks (pursuers lose the trail). */
  pace: PaceSchema,
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

/** Goods carried, by good (all 15 of GOODS). A good that is missing counts as 0. */
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
  /** Each day travelled so far, oldest first. */
  paceLog: z.array(PaceDaySchema).default([]),
  /** The best-suited member forages for water (and food) each day on land (design §7). */
  forage: z.boolean().default(true),
  /** Mounts hired for this journey (one per member), returned on arrival; null when on foot. */
  hired: z
    .object({ animal: IdSchema, count: z.number().int().min(1) })
    .nullable()
    .default(null),
})
export type TravelState = z.infer<typeof TravelStateSchema>

/**
 * The party's net trades with one good in one market, as of `day`: sales positive, purchases
 * negative. How far the market has recovered since is derived (economy/market.ts).
 */
export const MarketTradeSchema = z.object({
  units: z.number().int(),
  day: z.number().int().min(1),
})
export type MarketTrade = z.infer<typeof MarketTradeSchema>

/** A price the party knows: what a market buys (sell to it) and sells (buy from it) for. */
export const KnownPriceSchema = z.object({
  buy: z.number().min(0).nullable().describe('What the party pays per unit; null if not sold'),
  sell: z.number().min(0).nullable().describe('What the party gets per unit; null if not bought'),
})
export type KnownPrice = z.infer<typeof KnownPriceSchema>

/** One market's prices as the party last saw (or heard) them. */
export const PriceBookEntrySchema = z.object({
  /** The day the prices were true: seen on arrival, or dated back by distance when heard. */
  day: z.number().int().min(1),
  /** Heard from rumours or couriers (and maybe wrong), not seen. */
  heard: z.boolean(),
  prices: z.partialRecord(GoodSchema, KnownPriceSchema),
})
export type PriceBookEntry = z.infer<typeof PriceBookEntrySchema>

/** Reputation points with settlements and notable people; standing tiers are derived. */
export const ReputationSchema = z.object({
  settlements: z.record(IdSchema, z.number().int()).default({}),
  people: z.record(IdSchema, z.number().int()).default({}),
})
export type Reputation = z.infer<typeof ReputationSchema>

/** An accepted contract (design §8). */
export const ContractStateSchema = z.object({
  /** The offer id, e.g. "c-norrikk-2-w3-1" (settlement, week, slot). */
  id: z.string(),
  template: IdSchema,
  kind: ContractKindSchema,
  patron: IdSchema.describe('The person who posted it'),
  from: IdSchema.describe('The settlement it was taken in'),
  to: IdSchema.describe('Where it is delivered or reported: a bounty or errand reports to `from`'),
  good: GoodSchema.nullable(),
  amount: z.number().int().min(0),
  poi: IdSchema.nullable().describe('The site a bounty or errand sends the party to'),
  passengers: z.number().int().min(0),
  accepted: z.number().int().min(1).describe('The day it was accepted'),
  deadline: z.number().int().min(1).describe('The last day it can be completed'),
  pay: z.number().int().min(0).describe('gp on completion'),
  urgent: z.boolean(),
  reputation: z.object({ patron: z.number().int(), settlement: z.number().int() }),
  /**
   * Its condition was met in time (arrived, cleared, visited): it no longer expires, and is
   * completed at `to` for the reward.
   */
  met: z.boolean().default(false),
})
export type ContractState = z.infer<typeof ContractStateSchema>

export const GameStateSchema = z.object({
  version: z.literal(12),
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
  /** The party's net trades by market (settlement id) and good. */
  markets: z.record(IdSchema, z.partialRecord(GoodSchema, MarketTradeSchema)).default({}),
  /** The prices the party knows, by settlement id. */
  priceBook: z.record(IdSchema, PriceBookEntrySchema).default({}),
  /** The fraction of a unit of each good that has spoiled but not yet been lost (0–1). */
  spoilage: z.partialRecord(GoodSchema, z.number().min(0).max(1)).default({}),
  /** Owned animals and carts by animals id (bought; hired mounts are in travel.hired). */
  animals: z.record(IdSchema, z.number().int().min(0)).default({}),
  /** Upkeep for owned animals (gp) that went unpaid for lack of coin. */
  upkeepOwed: z.number().min(0).default(0),
  reputation: ReputationSchema.default({ settlements: {}, people: {} }),
  /** Accepted contracts, in progress. */
  contracts: z.array(ContractStateSchema).default([]),
  /** Offer ids accepted, so a board never offers them again. */
  contractsTaken: z.array(z.string()).default([]),
  /** Once-per-arrival actions taken here, e.g. "rumours" or "bless:<service>". Cleared on arrival. */
  doneHere: z.array(z.string()).default([]),
  /** Accessories carried but not worn (weightless). */
  gear: z.array(AccessorySchema).default([]),
  /** The party's camaraderie, 0–40 (tiers in CAMARADERIE_TIERS). 25 is CAMARADERIE_START. */
  camaraderie: z.number().int().min(0).max(CAMARADERIE_MAX).default(25),
  /** Units gathered recently by domain (settlement id) and good; the land recovers like a market. */
  gathered: z.record(IdSchema, z.partialRecord(GoodSchema, MarketTradeSchema)).default({}),
  /** Recruit offer ids hired, so they are never offered again. */
  recruitsTaken: z.array(z.string()).default([]),
  /** Accessory offer ids bought, so they are never offered again. */
  gearTaken: z.array(z.string()).default([]),
  /** The day each wearer's `lucky` hook was last spent, by character id. */
  luckUsed: z.record(z.string(), z.number().int().min(1)).default({}),
  /** This world's Crisis (Plan 5b): null only when no villain fits the content. */
  crisis: CrisisStateSchema.nullable().default(null),
})
export type GameState = z.infer<typeof GameStateSchema>
