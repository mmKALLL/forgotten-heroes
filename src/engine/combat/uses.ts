import { sortedEntries, type Content } from '../../content/build'
import type { ClassAbility } from '../../schema/combat'
import type { Character } from '../../schema/state'
import {
  ABILITY_USE_LEVELS,
  CASTER_KIND,
  SPELL_CASTS_FIRST,
  SPELL_CASTS_MAX,
  SPELL_LEVEL_AT,
  SPECIALISE_USES,
} from '../constants'

// Ability and spell uses (Plan 7 Track C, combat design §5): what a long rest gives, and what is
// left. A member keeps what they have *spent* since the last long rest (`Character.spent`), so
// what is left follows from the level: a level-up's extra use is there at once. Lay on Hands is
// a pool of HP (`healPool`), spent as it heals. A long rest (travel/supplies.ts rest) clears it.

/** The class abilities a member has: their class's, gained at their level or below. */
export const knownAbilities = (c: Pick<Character, 'classId' | 'level'>, content: Content) =>
  sortedEntries(content.classAbilities)
    .filter((a) => a.classId === c.classId && a.level <= c.level)
    .sort((a, b) => a.level - b.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/** An ability as the member has it: with their specialisation pick applied. */
export function abilityAsHeld(ability: ClassAbility, c: Pick<Character, 'picks'>): ClassAbility {
  const s = ability.specialised
  if (!s || !specialised(c, ability)) return ability
  return {
    ...ability,
    description: s.description,
    target: s.target ?? ability.target,
    range: s.range ?? ability.range,
    effects: s.effects ?? ability.effects,
  }
}

/** The pool effect of an ability (Lay on Hands), if it has one. */
const poolOf = (ability: ClassAbility) => ability.effects.find((e) => e.effect === 'healPool')

/** Whether the member has specialised this ability (a bard's pick). */
export const specialised = (c: Pick<Character, 'picks'>, ability: ClassAbility): boolean =>
  ability.specialised !== undefined && c.picks.includes(ability.id)

/**
 * Uses a long rest gives: 1 from the level it is gained and 1 more at each of ABILITY_USE_LEVELS
 * above that, and SPECIALISE_USES more once specialised; a pool's HP (perLevel × level). 0 before
 * the level, and for one spending spell uses.
 */
export function maxUses(c: Pick<Character, 'level' | 'picks'>, ability: ClassAbility): number {
  if (c.level < ability.level || ability.spends === 'spell') return 0
  const pool = poolOf(ability)
  if (pool && pool.effect === 'healPool') return pool.perLevel * c.level
  const extra = specialised(c, ability) ? SPECIALISE_USES : 0
  return 1 + extra + ABILITY_USE_LEVELS.filter((l) => l > ability.level && l <= c.level).length
}

/** What is left of an ability's uses (or pool) until the next long rest. */
export const usesLeft = (
  c: Pick<Character, 'level' | 'spent' | 'picks'>,
  ability: ClassAbility
): number => Math.max(0, maxUses(c, ability) - (c.spent[ability.id] ?? 0))

/** The highest spell level a member can cast (0: none), by CASTER_KIND and SPELL_LEVEL_AT. */
export function spellLevel(c: Pick<Character, 'classId' | 'level'>): number {
  const kind = Object.hasOwn(CASTER_KIND, c.classId) ? CASTER_KIND[c.classId] : null
  if (!kind) return 0
  return SPELL_LEVEL_AT[kind].filter((at) => at <= c.level).length
}

/**
 * Spell uses a long rest gives at a spell level ("Decided by Claude", Plan 7): the newest level 1,
 * each lower one 1 more up to SPELL_CASTS_MAX, and level 1 at least SPELL_CASTS_FIRST.
 */
export function spellCasts(c: Pick<Character, 'classId' | 'level'>, level: number): number {
  const top = spellLevel(c)
  if (level < 1 || level > top) return 0
  const casts = Math.min(SPELL_CASTS_MAX, 1 + top - level)
  return level === 1 ? Math.max(SPELL_CASTS_FIRST, casts) : casts
}

/** The `spent` key of a spell level's uses. */
export const spellKey = (level: number): string => `spell-${level}`

/** Spell uses left at a spell level. */
export const spellUsesLeft = (c: Pick<Character, 'classId' | 'level' | 'spent'>, level: number) =>
  Math.max(0, spellCasts(c, level) - (c.spent[spellKey(level)] ?? 0))

/** The lowest spell level with a use left, or null (Smite spends it). */
export function lowestSpellUse(c: Pick<Character, 'classId' | 'level' | 'spent'>): number | null {
  for (let level = 1; level <= spellLevel(c); level++) if (spellUsesLeft(c, level) > 0) return level
  return null
}

/** Spends `amount` of a key (an ability id, or a spell level's key). */
export const spend = (c: Character, key: string, amount = 1): Character => ({
  ...c,
  spent: { ...c.spent, [key]: (c.spent[key] ?? 0) + amount },
})

/** A long rest: every use and pool comes back. */
export const longRest = (c: Character): Character =>
  Object.keys(c.spent).length === 0 ? c : { ...c, spent: {} }
