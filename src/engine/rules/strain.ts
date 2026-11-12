import { SKILLS, type Skill } from '../../schema/constants'
import type { Character, SkillUse } from '../../schema/state'

/**
 * Design §3: thresholds are inclusive, so the third use of a skill in a day, or the tenth within
 * seven days, adds a stack, and so does every later use.
 */
export const STRAIN_PER_DAY = 3
export const STRAIN_PER_WEEK = 10
export const STRAIN_WEEK_DAYS = 7

/** True when this character's latest use of `skill` (already in `uses`) adds a Strain stack. */
export function strainFrom(
  uses: readonly SkillUse[],
  characterId: string,
  skill: Skill,
  day: number
): boolean {
  const mine = uses.filter((u) => u.characterId === characterId && u.skill === skill)
  const today = mine.filter((u) => u.day === day).length
  const week = mine.filter((u) => u.day > day - STRAIN_WEEK_DAYS && u.day <= day).length
  return today >= STRAIN_PER_DAY || week >= STRAIN_PER_WEEK
}

export const strainOf = (character: Pick<Character, 'strain'>, skill: Skill): number =>
  character.strain?.[skill] ?? 0

export const addStrain = (character: Character, skill: Skill): Character => ({
  ...character,
  strain: { ...character.strain, [skill]: strainOf(character, skill) + 1 },
})

/** A day passes: every strained skill loses one stack. */
export function fadeStrain(character: Character): Character {
  const strain: Character['strain'] = {}
  for (const skill of SKILLS) {
    const left = strainOf(character, skill) - 1
    if (left > 0) strain[skill] = left
  }
  return { ...character, strain }
}
