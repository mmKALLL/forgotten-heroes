import { MAX_LEVEL } from '../../schema/types'
import {
  CR_XP,
  CR_XP_BEYOND,
  FIGHT_DIFFICULTY,
  FIGHT_GROUP_FACTOR,
  FIGHT_LARGE_PARTY,
  FIGHT_SMALL_PARTY,
  FIGHT_XP_PER_MEMBER,
  ROAD_FIGHT_MAX,
} from '../constants'

// The CR budget of a fight (combat design §6, "Composition"), like 5e's encounter XP budgets: the
// party's levels give a budget in XP, a group of enemies costs its creatures' XP times a factor
// for its size, and a road Fight fields as many of its creature as the budget allows. Pure.

export type FightDifficulty = keyof typeof FIGHT_DIFFICULTY

/** The XP a creature of this CR is worth: the last listed CR at or below it, then CR_XP_BEYOND a CR. */
export function crXp(cr: number): number {
  const listed = Object.keys(CR_XP)
    .map(Number)
    .sort((a, b) => a - b)
  const top = listed[listed.length - 1]
  if (cr > top) return CR_XP[top] + Math.floor(cr - top) * CR_XP_BEYOND
  const at = listed.findLast((c) => c <= cr) ?? listed[0]
  return CR_XP[at]
}

/** The factor a group of `count` enemies costs, shifted a row for a small or large party. */
export function groupFactor(count: number, partySize: number): number {
  if (count < 1) return 0
  let row = FIGHT_GROUP_FACTOR.findLastIndex(([least]) => count >= least)
  if (partySize < FIGHT_SMALL_PARTY) row += 1
  else if (partySize >= FIGHT_LARGE_PARTY) row -= 1
  row = Math.max(0, Math.min(FIGHT_GROUP_FACTOR.length - 1, row))
  return FIGHT_GROUP_FACTOR[row][1]
}

/** What a group of enemies (their CRs) costs against a party of `partySize`. */
export function groupXp(crs: readonly number[], partySize: number): number {
  const total = crs.reduce((sum, cr) => sum + crXp(cr), 0)
  return total * groupFactor(crs.length, partySize)
}

/** The party's budget for a fight: each member's XP by level, times the difficulty's share. */
export function fightBudget(levels: readonly number[], difficulty: FightDifficulty): number {
  const perMember = levels.reduce((sum, level) => {
    const l = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)))
    return sum + FIGHT_XP_PER_MEMBER[l - 1]
  }, 0)
  return perMember * FIGHT_DIFFICULTY[difficulty]
}

/**
 * How many of one creature a road Fight fields (the situation's creature slot): the most, up to
 * ROAD_FIGHT_MAX, whose group cost fits the party's budget, and at least one.
 */
export function roadFightCount(
  cr: number,
  levels: readonly number[],
  difficulty: FightDifficulty = 'medium'
): number {
  const budget = fightBudget(levels, difficulty)
  let count = 1
  while (
    count < ROAD_FIGHT_MAX &&
    groupXp(
      Array.from({ length: count + 1 }, () => cr),
      levels.length
    ) <= budget
  )
    count += 1
  return count
}

/**
 * How many henchmen of CR `cr` join a boss of CR `bossCr` (a climax's Fight): the most, up to
 * ROAD_FIGHT_MAX − 1, whose group with the boss fits the budget; 0 when the boss alone fills it.
 */
export function henchmenCount(
  bossCr: number,
  cr: number,
  levels: readonly number[],
  difficulty: FightDifficulty
): number {
  const budget = fightBudget(levels, difficulty)
  let count = 0
  while (
    count < ROAD_FIGHT_MAX - 1 &&
    groupXp([bossCr, ...Array.from({ length: count + 1 }, () => cr)], levels.length) <= budget
  )
    count += 1
  return count
}

/**
 * A group's CR as one foe (a Parley's DC): the highest CR whose XP its group cost (groupXp)
 * reaches, and never below its strongest creature's. Four bandits talk like one CR 1 foe.
 */
export function groupCr(crs: readonly number[], partySize: number): number {
  const xp = groupXp(crs, partySize)
  const listed = Object.keys(CR_XP)
    .map(Number)
    .sort((a, b) => a - b)
  const top = listed[listed.length - 1]
  const reached =
    xp > CR_XP[top]
      ? top + Math.floor((xp - CR_XP[top]) / CR_XP_BEYOND)
      : (listed.findLast((c) => CR_XP[c] <= xp) ?? 0)
  return Math.max(reached, ...crs)
}
