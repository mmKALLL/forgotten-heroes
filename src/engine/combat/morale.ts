import type { CombatState, CombatUnit } from '../../schema/combat'
import type { Character } from '../../schema/state'
import type { Draw } from '../rng'
import { rankActors } from '../rules/character'
import { MORALE_DC_BASE, MORALE_THRESHOLDS } from '../constants'
import { sideUnits } from './line'

// Morale (combat design §6): a group breaks only when nearly wiped out — at most MORALE_THRESHOLDS'
// "left" of it standing — and is tested once, then. Each enemy left saves WIS against DC
// MORALE_DC_BASE + the party's best Intimidation; the group follows the majority, and a tie
// flees.

/** How many enemies left standing trigger the test for a group of this size (null: never). */
export function moraleThreshold(groupSize: number): number | null {
  const row = MORALE_THRESHOLDS.findLast(([group]) => groupSize >= group)
  return row ? row[1] : null
}

/** The morale DC: the base + the best Intimidation among the members still in the fight. */
export function moraleDc(combat: CombatState, party: readonly Character[]): number {
  const fighting = new Set(sideUnits(combat, 'party').map((u) => u.id))
  const best = rankActors(
    party.filter((c) => fighting.has(c.id)),
    'intimidation'
  )[0]
  return MORALE_DC_BASE + (best?.modifier ?? 0)
}

/** The chance one enemy fails its save (natural 1 fails, natural 20 holds). */
const failChance = (wis: number, dc: number): number => {
  let fail = 0
  for (let face = 1; face <= 20; face++)
    if (face === 1 || (face !== 20 && face + wis < dc)) fail += 1 / 20
  return fail
}

/** The chance the group flees if tested now: more failures than holds, or a tie. */
export function fleeChance(units: readonly Pick<CombatUnit, 'wis'>[], dc: number): number {
  // fails[k]: the chance exactly k of the units so far failed.
  let fails = [1]
  for (const u of units) {
    const p = failChance(u.wis, dc)
    const next = new Array(fails.length + 1).fill(0)
    fails.forEach((q, k) => {
      next[k] += q * (1 - p)
      next[k + 1] += q * p
    })
    fails = next
  }
  return fails.reduce((sum, q, k) => (2 * k >= units.length ? sum + q : sum), 0)
}

/** Whether morale is tested now: untested, and the group is down to its threshold. */
export function moraleDue(combat: CombatState): boolean {
  if (combat.morale !== 'untested') return false
  const left = moraleThreshold(combat.groupSize)
  const standing = sideUnits(combat, 'enemy').length
  return left !== null && standing > 0 && standing <= left
}

/** Rolls the test: true when the group flees. */
export function rollMorale(draw: Draw, units: readonly Pick<CombatUnit, 'wis'>[], dc: number) {
  let failed = 0
  for (const u of units) {
    const face = draw.int(1, 20)
    if (face === 1 || (face !== 20 && face + u.wis < dc)) failed++
  }
  return 2 * failed >= units.length
}
