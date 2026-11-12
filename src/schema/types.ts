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
] as const
export type ServiceAction = (typeof SERVICE_ACTIONS)[number]

/** Kinds of contract on a notice board (design §8). */
export const CONTRACT_KINDS = ['courier', 'supply', 'escort', 'bounty', 'errand'] as const
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
export const PACES = ['stealthy', 'cautious', 'steady', 'brisk', 'forced'] as const
export type Pace = (typeof PACES)[number]

/**
 * How an encounter treats the party (design §7). A stealthy or cautious party avoids some hostile
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
