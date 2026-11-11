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
