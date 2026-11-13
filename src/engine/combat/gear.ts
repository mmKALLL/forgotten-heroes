import type { Content } from '../../content/build'
import type { Character } from '../../schema/state'
import type { Dice } from '../../schema/combat'
import {
  MORAL_ALIGNMENTS,
  type Ability,
  type ArmourGrade,
  type MoralAlignment,
  type Rank,
  type WeaponFamily,
} from '../../schema/types'
import { abilityModifier, proficiencyBonus } from '../rules/abilities'
import { createRng, withRng } from '../rng'
import {
  ARMOUR_AC,
  CASTING_ABILITY,
  CLERIC_ALIGNMENT_WEIGHTS,
  FALLBACK_GEAR,
  STARTING_GEAR,
  WEAPON_FAMILY_RULES,
  WEAPON_QUALITY_BONUS,
} from '../constants'

// A member's fighting stats from their gear (Plan 7, combat design §4–§5): the weapon's family
// and quality, the armour's grade, and the abilities behind them. A missing or unknown weapon
// fights as a plain dagger, missing armour as cloth.

/** 2024 rules: each exhaustion level is −2 to d20 tests (as rules/character.ts). */
const EXHAUSTION_PENALTY = 2

/** A founder's (or migrated member's) plain weapon and armour by class (STARTING_GEAR). */
export const startingGear = (classId: string): Character['gear'] => ({
  ...(Object.hasOwn(STARTING_GEAR, classId) ? STARTING_GEAR[classId] : FALLBACK_GEAR),
})

/**
 * A cleric's alignment, rolled from the character's id by CLERIC_ALIGNMENT_WEIGHTS on its own
 * keyed stream (FNV-1a), so it never shifts the game's RNG; undefined for other classes.
 */
export function rollAlignment(c: Pick<Character, 'id' | 'classId'>): MoralAlignment | undefined {
  if (c.classId !== 'cleric') return undefined
  let h = 0x811c9dc5
  const key = `${c.id}/alignment`
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  const [alignment] = withRng(createRng(h >>> 0), (d) =>
    d.weighted(MORAL_ALIGNMENTS, (a) => CLERIC_ALIGNMENT_WEIGHTS[a])
  )
  return alignment
}

/** Proficiency with a weapon family: every class for now (Track C adds the class tables). */
export const proficient = (_c: Character, _family: WeaponFamily): boolean => true

/** The ability a family attacks with: finesse daggers and thrown the better of STR and DEX. */
export function attackAbility(c: Character, family: WeaponFamily): Ability {
  const better = (a: Ability, b: Ability): Ability => (c.abilities[b] > c.abilities[a] ? b : a)
  switch (family) {
    case 'daggers':
    case 'thrown':
      return better('str', 'dex')
    case 'bows':
      return 'dex'
    case 'staffs':
      return Object.hasOwn(CASTING_ABILITY, c.classId)
        ? CASTING_ABILITY[c.classId]
        : better(better('int', 'wis'), 'cha')
    default:
      return 'str'
  }
}

export type MemberStats = {
  family: WeaponFamily
  toHit: number
  damage: Dice
  reach: [number, number]
  critMin: number
  ac: number
  grade: ArmourGrade
}

/** A member's weapon and armour as they fight: to hit, damage dice, reach, crit face and AC. */
export function memberStats(c: Character, content: Content): MemberStats {
  const weaponId = c.gear.weapon
  const weapon =
    weaponId && Object.hasOwn(content.weapons, weaponId) ? content.weapons[weaponId] : null
  const family = weapon?.family ?? 'daggers'
  const quality = WEAPON_QUALITY_BONUS[weapon?.quality ?? 'plain']
  const rules = WEAPON_FAMILY_RULES[family]
  const mod = abilityModifier(c.abilities[attackAbility(c, family)])
  const prof = proficient(c, family) ? proficiencyBonus(c.level) : 0
  const armourId = c.gear.armour
  const armour =
    armourId && Object.hasOwn(content.armours, armourId) ? content.armours[armourId] : null
  const grade = armour?.grade ?? 'cloth'
  const { base, dexCap } = ARMOUR_AC[grade]
  const dex = abilityModifier(c.abilities.dex)
  return {
    family,
    toHit: mod + prof + quality.toHit - EXHAUSTION_PENALTY * c.exhaustion,
    damage: { count: 1, die: rules.die, bonus: mod + quality.damage },
    reach: [rules.reach[0], rules.reach[1]],
    critMin: rules.critMin,
    ac: base + (dexCap === null ? dex : Math.min(dexCap, dex)),
    grade,
  }
}

/** The member's rank: as set, else the back for bows and staffs, the front for the rest. */
export function rankOf(c: Character, content: Content): Rank {
  if (c.rank) return c.rank
  const family = memberStats(c, content).family
  return family === 'bows' || family === 'staffs' ? 'back' : 'front'
}
