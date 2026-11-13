import type { Content } from '../../content/build'
import type { Character } from '../../schema/state'
import type { Dice } from '../../schema/combat'
import {
  ARMOUR_GRADES,
  MORAL_ALIGNMENTS,
  type Ability,
  type ArmourGrade,
  type FighterStyle,
  type MoralAlignment,
  type Rank,
  type WeaponFamily,
} from '../../schema/types'
import { abilityModifier, proficiencyBonus } from '../rules/abilities'
import { createRng, withRng } from '../rng'
import {
  ABILITY_DC_BASE,
  ARMOUR_AC,
  CASTING_ABILITY,
  CLASS_PROFICIENCIES,
  CLERIC_ALIGNMENT_WEIGHTS,
  FALLBACK_GEAR,
  FALLBACK_PROFICIENCIES,
  STARTING_GEAR,
  STYLE_DAMAGE,
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

/** A class's training (CLASS_PROFICIENCIES; FALLBACK_PROFICIENCIES for any other class). */
export const proficiencies = (classId: string) =>
  Object.hasOwn(CLASS_PROFICIENCIES, classId)
    ? CLASS_PROFICIENCIES[classId]
    : FALLBACK_PROFICIENCIES

/**
 * Proficiency with a weapon family (combat design §5): the class's families, and staffs for every
 * class with a casting ability. Untrained, a member adds no proficiency bonus to hit (5e).
 */
export const proficient = (c: Pick<Character, 'classId'>, family: WeaponFamily): boolean =>
  proficiencies(c.classId).weapons.includes(family) ||
  (family === 'staffs' && Object.hasOwn(CASTING_ABILITY, c.classId))

/**
 * Trained in an armour grade: it is no heavier than the class's heaviest. Untrained, a member's
 * attacks are at disadvantage (5e's rule for attacks; spells come later).
 */
export const armourProficient = (c: Pick<Character, 'classId'>, grade: ArmourGrade): boolean =>
  ARMOUR_GRADES.indexOf(grade) <= ARMOUR_GRADES.indexOf(proficiencies(c.classId).armour)

/** The DC of a member's abilities with a save: ABILITY_DC_BASE + proficiency + casting ability. */
export function abilityDc(c: Character): number {
  const ability = Object.hasOwn(CASTING_ABILITY, c.classId)
    ? CASTING_ABILITY[c.classId]
    : (['int', 'wis', 'cha'] as const).reduce((a, b) => (c.abilities[b] > c.abilities[a] ? b : a))
  return ABILITY_DC_BASE + proficiencyBonus(c.level) + abilityModifier(c.abilities[ability])
}

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
  /** Trained with the weapon (its proficiency bonus counts) and in the armour. */
  weaponTrained: boolean
  armourTrained: boolean
  /** A fighter's style picks for this weapon's kind of full action: damage on each of its attacks. */
  fullDamage: number
}

/** The fighter style a family's full action belongs to: two attacks, or one bigger blow. */
export const styleOf = (family: WeaponFamily): FighterStyle =>
  WEAPON_FAMILY_RULES[family].full.kind === 'second' ? 'two-attack' : 'single-blow'

/** STYLE_DAMAGE for each of the member's picks of the style that fits the weapon. */
export const styleDamage = (c: Pick<Character, 'picks'>, family: WeaponFamily): number =>
  STYLE_DAMAGE * c.picks.filter((p) => p === styleOf(family)).length

/** A member's weapon and armour as they fight: to hit, damage dice, reach, crit face and AC. */
export function memberStats(c: Character, content: Content): MemberStats {
  const weaponId = c.gear.weapon
  const weapon =
    weaponId && Object.hasOwn(content.weapons, weaponId) ? content.weapons[weaponId] : null
  const family = weapon?.family ?? 'daggers'
  const quality = WEAPON_QUALITY_BONUS[weapon?.quality ?? 'plain']
  const rules = WEAPON_FAMILY_RULES[family]
  const mod = abilityModifier(c.abilities[attackAbility(c, family)])
  const weaponTrained = proficient(c, family)
  const prof = weaponTrained ? proficiencyBonus(c.level) : 0
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
    weaponTrained,
    armourTrained: armourProficient(c, grade),
    fullDamage: styleDamage(c, family),
  }
}

/** The member's rank: as set, else the back for bows and staffs, the front for the rest. */
export function rankOf(c: Character, content: Content): Rank {
  if (c.rank) return c.rank
  const family = memberStats(c, content).family
  return family === 'bows' || family === 'staffs' ? 'back' : 'front'
}
