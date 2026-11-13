// Shared vocabulary for the schemas and the engine. It lives here so the schemas never import
// the engine; the engine's rules/abilities and rules/checks modules re-export it.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof ABILITIES)[number]

export const SKILLS = [
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
] as const
export type Skill = (typeof SKILLS)[number]

/** A check can test a skill or a raw ability (e.g. a CON check to endure a forced march). */
export type CheckStat = Skill | Ability

/** Check outcome tiers, worst to best. */
export const TIERS = ['critFail', 'fail', 'partial', 'success', 'critSuccess'] as const
export type Tier = (typeof TIERS)[number]

/** DCs are whole numbers in this range; the engine clamps anything else into it. */
export const MIN_DC = 1
export const MAX_DC = 40

/** An encounter's position: Edge gives advantage on the next check, Exposed disadvantage. */
export const POSITIONS = ['normal', 'edge', 'exposed'] as const
export type Position = (typeof POSITIONS)[number]

export const LOG_TONES = ['info', 'good', 'bad', 'crit'] as const
export type LogTone = (typeof LOG_TONES)[number]

/** SRD creature types. */
export const CREATURE_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const
export type CreatureType = (typeof CREATURE_TYPES)[number]

/** Terrain: a region's dominant biome, and a route's terrain ("sea" for a crossing by ship). */
export const BIOMES = [
  'plains',
  'forest',
  'hills',
  'mountains',
  'marsh',
  'desert',
  'jungle',
  'sea',
] as const
export type Biome = (typeof BIOMES)[number]

/**
 * Settlement size tiers, smallest first, as in the prototype. A settlement's tier indexes
 * ServiceDef.presenceThresholdBySize, so there are exactly six.
 */
export const SIZE_TIERS = ['outpost', 'hamlet', 'village', 'town', 'city', 'metropolis'] as const
export type SizeTier = (typeof SIZE_TIERS)[number]

export const ALIGNMENTS = ['LG', 'NG', 'CG', 'LN', 'TN', 'CN', 'LE', 'NE', 'CE'] as const
export type Alignment = (typeof ALIGNMENTS)[number]

/**
 * The 15 goods of design §4, in design order. Goods are tracked as quantities, never as items;
 * a good that is missing from a save counts as 0. Their weight, price and spoilage are content
 * (`goods`), but the list and its categories are fixed by the design.
 */
export const GOODS = [
  'food',
  'water',
  'fuel',
  'healing',
  'alchemicals',
  'arcana',
  'arms',
  'armour',
  'gear',
  'timber',
  'stone',
  'metal',
  'gems',
  'relics',
  'luxuries',
] as const
export type Good = (typeof GOODS)[number]

/** The five categories of goods (design §4). */
export const GOOD_CATEGORIES = [
  'essentials',
  'consumables',
  'equipment',
  'materials',
  'precious',
] as const
export type GoodCategory = (typeof GOOD_CATEGORIES)[number]

/** Each good's category, fixed by the design. Precious goods make up visible wealth. */
export const GOOD_CATEGORY: Readonly<Record<Good, GoodCategory>> = {
  food: 'essentials',
  water: 'essentials',
  fuel: 'essentials',
  healing: 'consumables',
  alchemicals: 'consumables',
  arcana: 'consumables',
  arms: 'equipment',
  armour: 'equipment',
  gear: 'equipment',
  timber: 'materials',
  stone: 'materials',
  metal: 'materials',
  gems: 'precious',
  relics: 'precious',
  luxuries: 'precious',
}

/** What a service is for: the groups of design §5. */
export const SERVICE_FUNCTIONS = ['trade', 'rest', 'hire', 'temple', 'underworld'] as const
export type ServiceFunction = (typeof SERVICE_FUNCTIONS)[number]

/**
 * What the engine can do at a service. A service whose role lists none of these is shown as
 * "coming later".
 */
export const SERVICE_ACTIONS = [
  'market',
  'lodging',
  'heal',
  'bless',
  'animals',
  'rumours',
  'board',
  'passage',
  'news',
  'recruit',
  'accessories',
  /** Stand the party a round (Plan 6): camaraderie, once per arrival. */
  'round',
] as const
export type ServiceAction = (typeof SERVICE_ACTIONS)[number]

/** Kinds of contract on a notice board (design §8). */
export const CONTRACT_KINDS = [
  'courier',
  'freight',
  'procurement',
  'escort',
  'bounty',
  'errand',
] as const
export type ContractKind = (typeof CONTRACT_KINDS)[number]

/** Reputation tiers with a person or a settlement, worst first. Points map to tiers (B2). */
export const STANDINGS = [
  'hated',
  'disliked',
  'stranger',
  'known',
  'liked',
  'trusted',
  'honoured',
] as const
export type Standing = (typeof STANDINGS)[number]

/**
 * Situation tags that visible wealth (precious goods and a heavy purse) makes likelier on the
 * road: thieves and tolls follow money.
 */
export const WEALTH_TAGS = ['thieves', 'toll'] as const

/**
 * Travel pace, chosen per journey (design §7), slowest first. Stealthy covers the party's tracks
 * (pursuers lose the trail). Its tuning (speed, supplies, encounters, ambush footing) lives in
 * src/engine/travel/pace.ts and the constants' Pace section.
 */
export const PACES = ['stealthy', 'steady', 'brisk', 'forced'] as const
export type Pace = (typeof PACES)[number]

/**
 * How an encounter treats the party (design §7). A stealthy party avoids some hostile
 * ones, and a stealthy one meets the rest on better footing; wonders are pleasant or neutral.
 */
export const DISPOSITIONS = ['hostile', 'neutral', 'pleasant'] as const
export type Disposition = (typeof DISPOSITIONS)[number]

/**
 * Kinds of point of interest (design §6): places off the road, found through clues or
 * exploration and visited along their own paths.
 */
export const POI_CATEGORIES = [
  'dungeon',
  'expert',
  'lair',
  'shrine',
  'landmark',
  'wonder',
  'quest',
] as const
export type PoiCategory = (typeof POI_CATEGORIES)[number]

// ---------------------------------------------------------------------------------------------
// Progression and gear (Plan 5a)
// ---------------------------------------------------------------------------------------------

/** The highest level a character reaches (5e's 20; Plan 6). */
export const MAX_LEVEL = 20

/**
 * Kinds of rule hook (design §8): small declarative rule changes the engine interprets. Worn
 * accessories carry them now; per-party modifiers will reuse them.
 */
export const HOOK_KINDS = [
  'skill',
  'activity',
  'endurance',
  'carry',
  'maxHp',
  'strainFade',
  'strainGrace',
  'lucky',
  'sellBonus',
  'ward',
] as const
export type HookKind = (typeof HOOK_KINDS)[number]

/** The town and travel checks an `activity` hook can boost when the wearer leads them. */
export const HOOK_ACTIVITIES = ['forage', 'gather', 'explore', 'rumours', 'stowaway'] as const
export type HookActivity = (typeof HOOK_ACTIVITIES)[number]

/** Accessory tiers: low-end only for now (1 and 2). */
export const ACCESSORY_TIERS = [1, 2] as const
export type AccessoryTier = (typeof ACCESSORY_TIERS)[number]

/** The parts an accessory is rolled from: a base ("Ring") and affixes ("Fox-eyed", "of the Long Road"). */
export const ACCESSORY_PARTS = ['base', 'prefix', 'suffix'] as const
export type AccessoryPart = (typeof ACCESSORY_PARTS)[number]

/**
 * Tags on an encounter option (Plan 6). `retreat`: fleeing or withdrawing from a hostile
 * encounter, which costs camaraderie (CAMARADERIE_RETREAT per living member beyond the first).
 * `surprise`: a check about an ambush or being caught unawares (spotting it coming, reacting in
 * time, or springing one); the scout's kit adds to it (rules/upgrades.ts scoutBonus).
 */
export const OPTION_TAGS = ['retreat', 'surprise'] as const
export type OptionTag = (typeof OPTION_TAGS)[number]

/** The top of the party's camaraderie scale (0–100, design §3; Plan 6 wave 2b, ×2.5 from 0–40). */
export const CAMARADERIE_MAX = 100

/**
 * Party upgrades (Plan 6c, design §4 "Party upgrades"): lasting purchases owned by the party,
 * each bought level by level from 0 to UPGRADE_MAX_LEVEL. What each level does is in
 * src/engine/town/upgrades.ts and the constants' "Party upgrades" section; names, prices and the
 * services that sell them are in data/claude/upgrades.json.
 */
export const UPGRADES = [
  'camp-kit',
  'smugglers-compartment',
  'surveyors-maps',
  'delving-gear',
  'company-banner',
  'scouts-kit',
] as const
export type UpgradeId = (typeof UPGRADES)[number]
/** The highest level of a party upgrade. */
export const UPGRADE_MAX_LEVEL = 5

/** Camaraderie tiers, worst first: a tier holds from its `min` up to the next tier's. */
export const CAMARADERIE_TIERS = [
  { id: 'fractured', min: 0 },
  { id: 'strained', min: 25 },
  { id: 'steady', min: 50 },
  { id: 'close', min: 75 },
  { id: 'sworn', min: 100 },
] as const
export type CamaraderieTier = (typeof CAMARADERIE_TIERS)[number]['id']

// ---------------------------------------------------------------------------------------------
// The Crisis and run end (Plan 5b)
// ---------------------------------------------------------------------------------------------

/** A villain's plot has exactly this many acts, each at its own site (design §10b). */
export const CRISIS_ACTS = 3

/** How a run ended: the Crisis won or lost, or the whole party fallen (a wipe). */
export const RUN_ENDINGS = ['won', 'lost', 'fallen', 'disbanded'] as const
export type RunEnding = (typeof RUN_ENDINGS)[number]

/**
 * Where an act of the Crisis stands (Plan 6, design §10b), derived from the day and what the party
 * did: dormant before it opens, then investigation (find and win its lead site), then prevention
 * (strike at its key site), until thwarted or failed (its due day passed, which loses the Crisis).
 */
export const CRISIS_ACT_PHASES = [
  'dormant',
  'investigation',
  'prevention',
  'thwarted',
  'failed',
] as const
export type CrisisActPhase = (typeof CRISIS_ACT_PHASES)[number]

/**
 * How a villain is met (Plan 6): a recurring boss is met at every key site, stronger each time;
 * a finale villain sends a lieutenant to acts I and II and is met only at act III.
 */
export const CRISIS_BOSS_STYLES = ['recurring', 'finale'] as const
export type CrisisBossStyle = (typeof CRISIS_BOSS_STYLES)[number]
