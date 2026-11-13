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
import {
  ABILITIES,
  CAMARADERIE_MAX,
  LEVEL_CHOICE_KINDS,
  MAX_LEVEL,
  MORAL_ALIGNMENTS,
  RANKS,
  SKILLS,
  TIERS,
  UPGRADE_MAX_LEVEL,
} from './types'
import { CombatStateSchema } from './combat'
import { UpgradeIdSchema } from './upgrades'
import { SituationSchema } from './encounter'
import { CrisisStateSchema } from './crisis'
import { AccessorySchema } from './gear'
import { WorldStateSchema } from './world'

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  ancestry: IdSchema,
  classId: IdSchema,
  level: z.number().int().min(1).max(MAX_LEVEL),
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
  /**
   * Old wounds a recruit came with (Plan 6): each lowers its ability by OLD_WOUND_PENALTY. Most
   * have none, some one; a "level 0" recruit has two (save v16; earlier a single `oldWound`).
   */
  oldWounds: z.array(AbilitySchema).default([]),
  /** The accessory worn (one slot), or null. */
  accessory: AccessorySchema.nullable().default(null),
  /** The weapon and armour carried into a fight (Plan 7), by weapons and armours id; null for none. */
  gear: z
    .object({ weapon: IdSchema.nullable(), armour: IdSchema.nullable() })
    .default({ weapon: null, armour: null }),
  /**
   * Ability and spell uses spent since the last long rest, by ability id or "spell-<level>" (save
   * v24; v23 kept uses left). What is left follows from the level (combat/uses.ts), so a level-up's
   * extra use is there at once. A pool (Lay on Hands) counts the HP spent.
   */
  spent: z.record(z.string(), z.number().int().min(0)).default({}),
  /**
   * Level-up picks made (save v24): a fighter's styles ("two-attack", "single-blow"; each pick
   * counts) and a bard's specialised abilities (ability ids).
   */
  picks: z.array(z.string()).default([]),
  /** Spells known, one per spell level ("1"–"9" → spells id). */
  spells: z.record(z.string().regex(/^[1-9]$/), IdSchema).default({}),
  /** A cleric's alignment (summons); others have none. */
  alignment: z.enum(MORAL_ALIGNMENTS).optional(),
  /** Front or back rank in the formation (set in the party panel); unset follows the weapon. */
  rank: z.enum(RANKS).optional(),
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
  /**
   * A challenge stage's tally (Plan 6 S): set to 0/0 on entering one, null on any other stage.
   * When the challenge ends the encounter, the final tally stays.
   */
  tally: z
    .object({ successes: z.number().int().min(0), failures: z.number().int().min(0) })
    .nullable()
    .default(null),
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
  /**
   * Why the last Continue stopped for the player (went without, a supply warning, no one fit),
   * so auto-travel (design §7) pauses; cleared by the next Continue.
   */
  halt: z.enum(['short', 'supplies', 'unfit']).optional(),
  /**
   * The quiet days the journal's last line sums up, so a one-day Continue (auto-travel) adds to
   * that line instead of writing another; used only while that line is still the last entry.
   */
  quiet: z
    .object({
      days: z.number().int().min(0),
      line: z.string(),
      forage: z
        .object({
          dc: z.number().int(),
          foragers: z.array(z.string()),
          food: z.number().int().min(0),
          water: z.number().int().min(0),
          full: z.boolean(),
          inspired: z.boolean(),
        })
        .nullable(),
    })
    .optional(),
})
export type TravelState = z.infer<typeof TravelStateSchema>
export type JourneyHalt = NonNullable<TravelState['halt']>

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

/**
 * Reputation points with settlements (design §8); standing tiers and a kingdom's reputation are
 * derived. Notable people have none (designer call 2026-11-14).
 */
export const ReputationSchema = z.object({
  settlements: z.record(IdSchema, z.number().int()).default({}),
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
  level: z
    .number()
    .int()
    .min(1)
    .max(MAX_LEVEL)
    .default(1)
    .describe('The level of the work (Plan 6 D1): its pay and DCs scale with it'),
  urgent: z.boolean(),
  reputation: z.number().int().describe("Points with the board's settlement for the gold"),
  /**
   * Its condition was met in time (arrived, cleared, visited): it no longer expires, and is
   * completed at `to` for the reward.
   */
  met: z.boolean().default(false),
})
export type ContractState = z.infer<typeof ContractStateSchema>

/**
 * A delve through an authored dungeon (world/delve.ts): the room being played, or between rooms
 * the next one, and how the room being played ended (set by its outcome's effects).
 */
export const DelveStateSchema = z.object({
  poi: IdSchema.describe('The dungeon site (a POI id)'),
  dungeon: IdSchema.describe('A dungeons id'),
  room: z
    .number()
    .int()
    .min(0)
    .describe("The room being played, or between rooms the next one's index"),
  inRoom: z.boolean().describe("A room's encounter is open"),
  ended: z
    .enum(['driven', 'cleared'])
    .nullable()
    .default(null)
    .describe('Set by the room: driven out (driveOut), or the hoard paid (hoard)'),
  unlit: z
    .boolean()
    .default(false)
    .describe(
      'The room being played is dark, with no fuel to light it and no darkvision: the party is ' +
        'Exposed in every check there, fights included (world/dark.ts; save v25)'
    ),
})
export type DelveState = z.infer<typeof DelveStateSchema>

/**
 * A level-up the player hasn't seen yet (designer call 2026-11-14, rules/progression.ts): one per
 * member, with every level gained since the last acknowledgement merged into it. The level-up
 * dialog shows them; until it is confirmed (`acknowledgeLevelUps`), the game waits.
 */
export const LevelUpSchema = z.object({
  characterId: z.string(),
  from: z.number().int().min(1).max(MAX_LEVEL).describe('The level before'),
  to: z.number().int().min(1).max(MAX_LEVEL).describe('The level reached'),
  gains: z.object({
    maxHp: z.number().int().min(0),
    /** The abilities raised, by how much. */
    abilities: z.partialRecord(AbilitySchema, z.number().int().min(1)).default({}),
    /** How much the proficiency bonus rose (0 most levels). */
    proficiency: z.number().int().min(0).default(0),
  }),
  /**
   * The picks these levels grant (Plan 7 Track C, save v24): each waits for `chooseLevelUp`, and
   * the level-ups can't be acknowledged until every one is chosen. TODO (spell casting): a
   * spell's 1-of-3 pick is a choice here too.
   */
  choices: z
    .array(
      z.object({
        kind: z.enum(LEVEL_CHOICE_KINDS),
        level: z.number().int().min(1).max(MAX_LEVEL).describe('The level that grants it'),
        chosen: z.string().nullable().default(null),
      })
    )
    .default([]),
})
export type LevelUp = z.infer<typeof LevelUpSchema>

export const GameStateSchema = z.object({
  version: z.literal(25),
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
  /** Owned animals and carts by animals id (bought; hired mounts are in travel.hired). */
  animals: z.record(IdSchema, z.number().int().min(0)).default({}),
  reputation: ReputationSchema.default({ settlements: {} }),
  /** Accepted contracts, in progress. */
  contracts: z.array(ContractStateSchema).default([]),
  /** Offer ids accepted, so a board never offers them again. */
  contractsTaken: z.array(z.string()).default([]),
  /** Once-per-arrival actions taken here, e.g. "rumours" or "bless:<service>". Cleared on arrival. */
  doneHere: z.array(z.string()).default([]),
  /** Accessories carried but not worn (weightless). */
  gear: z.array(AccessorySchema).default([]),
  /** The party's camaraderie, 0–100 (tiers in CAMARADERIE_TIERS). 63 is CAMARADERIE_START. */
  camaraderie: z.number().int().min(0).max(CAMARADERIE_MAX).default(63),
  /**
   * The unbroken spell below Fractured's top (Plan 6 wave 2b, town/camaraderie.ts): the day it
   * began and the members lost to it so far (one per full week); null while camaraderie is higher.
   */
  lowSpell: z
    .object({ since: z.number().int().min(1), losses: z.number().int().min(0) })
    .nullable()
    .default(null),
  /** Units gathered recently by domain (settlement id) and good; the land recovers like a market. */
  gathered: z.record(IdSchema, z.partialRecord(GoodSchema, MarketTradeSchema)).default({}),
  /** Recruit offer ids hired, so they are never offered again. */
  recruitsTaken: z.array(z.string()).default([]),
  /**
   * Domains the party knows are fully explored (save v16): a search there succeeded but came up
   * short. It counts only while nothing new is there to find (world/explore.ts).
   */
  explored: z.array(IdSchema).default([]),
  /** Accessory offer ids bought, so they are never offered again. */
  gearTaken: z.array(z.string()).default([]),
  /** The day each wearer's `lucky` hook was last spent, by character id. */
  luckUsed: z.record(z.string(), z.number().int().min(1)).default({}),
  /** This world's Crisis (Plan 5b): null only when no villain fits the content. */
  crisis: CrisisStateSchema.nullable().default(null),
  /** The dungeon being delved, room by room (Plan 6 D3, world/delve.ts); null otherwise. */
  delve: DelveStateSchema.nullable().default(null),
  /**
   * The party's upgrades by id, each at level 1–UPGRADE_MAX_LEVEL (Plan 6c, town/upgrades.ts;
   * save v18). An upgrade not bought yet is missing (level 0).
   */
  upgrades: z
    .partialRecord(UpgradeIdSchema, z.number().int().min(0).max(UPGRADE_MAX_LEVEL))
    .default({}),
  /** Level-ups not yet acknowledged (save v21): while any wait, only acknowledging is played. */
  levelUps: z.array(LevelUpSchema).default([]),
  /** The open fight on the line (Plan 7, combat/); null when there is none (save v22). */
  combat: CombatStateSchema.nullable().default(null),
  /** Weapons and armour carried but not worn, by weapons or armours id (save v24; town/arms.ts). */
  stash: z.array(IdSchema).default([]),
})
export type GameState = z.infer<typeof GameStateSchema>
