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
 * The goods tracked so far: the essentials consumed every day. Plan 4 adds the other 13 goods
 * (design §4) to this list. Saves keep loading, because a good that is missing counts as 0.
 */
export const GOODS = ['food', 'water'] as const
export type Good = (typeof GOODS)[number]

/**
 * Travel pace, chosen per journey (design §7), slowest first. Its tuning (speed, supplies,
 * encounters, ambush footing) lives in src/engine/travel/pace.ts.
 */
export const PACES = ['cautious', 'steady', 'brisk', 'forced'] as const
export type Pace = (typeof PACES)[number]

/**
 * How an encounter treats the party (design §7). A cautious party avoids some hostile ones and
 * meets the rest on better footing; wonders are pleasant or neutral.
 */
export const DISPOSITIONS = ['hostile', 'neutral', 'pleasant'] as const
export type Disposition = (typeof DISPOSITIONS)[number]
