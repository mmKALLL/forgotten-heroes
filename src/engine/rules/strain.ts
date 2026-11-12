import { SKILLS, type Skill } from '../../schema/constants'
import type { Character, GameState, SkillUse } from '../../schema/state'

/**
 * Design §3: thresholds are inclusive, so the third use of a skill in a day, or the tenth within
 * seven days, adds a stack, and so does every later use.
 */
export const STRAIN_PER_DAY = 3
export const STRAIN_PER_WEEK = 10
export const STRAIN_WEEK_DAYS = 7
/** Skill uses older than this many days are dropped; Strain looks back at most a week. */
export const SKILL_USE_DAYS = 7

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

/**
 * Records one check by one character (encounter rolls, foraging, stowing away), dropping uses
 * older than SKILL_USE_DAYS, and adds a Strain stack when it crosses a threshold. The new stack
 * applies from the next check on. `strained` is the new stack count, or 0 when none was added.
 */
export function useSkill(
  state: Pick<GameState, 'day' | 'party' | 'skillUses'>,
  characterId: string,
  skill: Skill
): { party: Character[]; skillUses: SkillUse[]; strained: number } {
  const skillUses = [
    ...state.skillUses.filter((u) => u.day > state.day - SKILL_USE_DAYS),
    { day: state.day, characterId, skill },
  ]
  if (!strainFrom(skillUses, characterId, skill, state.day)) {
    return { party: state.party, skillUses, strained: 0 }
  }
  const party = state.party.map((c) => (c.id === characterId ? addStrain(c, skill) : c))
  const strained = strainOf(
    party.find((c) => c.id === characterId)!,
    skill
  )
  return { party, skillUses, strained }
}
