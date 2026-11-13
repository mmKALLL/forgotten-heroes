import type { Challenge, Option, OutcomeBranch } from '../../schema/encounter'
import type { EncounterState, GameState } from '../../schema/state'
import type { Position } from '../../schema/types'
import { hasLuck } from '../gear/hooks'
import { chooseActor } from '../rules/character'
import { TIERS, normalizeDc, tierOdds, type RollMode, type Tier } from '../rules/checks'
import { onceKey, tierOutcome } from './outcomes'
import { CHALLENGE_MARKS } from '../constants'

// Skill challenges (Plan 6 S; design §7). A stage with a `challenge` is played in rounds: each
// round the player picks one of its options and rolls; the outcome applies as written (wounds,
// costs, Edge or Exposed for the next round) and marks the tally (CHALLENGE_MARKS by tier, or the
// outcome's own `tally`). At `successes` the challenge is won, at `failures` lost, and its `win`
// or `lose` branch applies. The odds of winning come from challengeOdds: an exact optimum over the
// tally, the footing (Edge or Exposed, a next-check modifier) and the once-only options used.

export type Tally = { successes: number; failures: number }

export const NO_TALLY: Tally = { successes: 0, failures: 0 }

/** The challenge of the stage the encounter is on, or null. */
export function challengeOf(
  encounter: Pick<EncounterState, 'situation' | 'stage'>
): Challenge | null {
  const id = encounter.stage
  if (id === null || !Object.hasOwn(encounter.situation.stages, id)) return null
  return encounter.situation.stages[id].challenge ?? null
}

/**
 * What an outcome marks on the tally: its own `tally` when it has one, else a check tier's
 * CHALLENGE_MARKS; a fixed option's outcome (tier null) marks nothing unless it says so.
 */
export function marksOf(branch: Pick<OutcomeBranch, 'tally'>, tier: Tier | null): Tally {
  if (branch.tally) return { successes: branch.tally.successes, failures: branch.tally.failures }
  return tier === null ? NO_TALLY : CHALLENGE_MARKS[tier]
}

/** Choosing the option plays a round of a challenge: a check, or a fixed option that tallies. */
export function playsRound(option: Option): boolean {
  if (option.kind === 'check') return true
  const marks = marksOf(option.outcome, null)
  return marks.successes + marks.failures > 0
}

/** A challenge round's outcome stays on the stage, whatever it says: the tally decides. */
export const asRound = <B extends OutcomeBranch>(branch: B): B => {
  const { goto: _goto, ...rest } = branch
  return { ...rest, stay: true } as B
}

/** The chip a round's outcome shows for its marks, e.g. "+1 success" or "no ground gained". */
export function marksChip(marks: Tally): string {
  const parts = [
    marks.successes > 0 && `+${marks.successes} success${marks.successes > 1 ? 'es' : ''}`,
    marks.failures > 0 && `+${marks.failures} failure${marks.failures > 1 ? 's' : ''}`,
  ].filter((p): p is string => typeof p === 'string')
  return parts.length > 0 ? parts.join(', ') : 'no ground gained'
}

export const addTally = (a: Tally, b: Tally): Tally => ({
  successes: a.successes + b.successes,
  failures: a.failures + b.failures,
})

/** Won, lost, or still open. Successes are checked first. */
export function decided(tally: Tally, need: Pick<Challenge, 'successes' | 'failures'>) {
  if (tally.successes >= need.successes) return 'won' as const
  if (tally.failures >= need.failures) return 'lost' as const
  return null
}

/** One way a round can go: its chance, its marks, and the footing it leaves for the next check. */
export type RoundResult = { p: number; marks: Tally; position: Position; modifier: number }

/** One option a round can be played with. `once` is its `used` key, if it can be chosen once. */
export type RoundChoice = {
  id: string
  once: string | null
  results: (position: Position, modifier: number) => RoundResult[]
}

/** Where a challenge stands: the tally, the footing for the next check, and once keys used. */
export type Footing = {
  tally: Tally
  position: Position
  modifier: number
  used: readonly string[]
}

const MODE: Record<Position, RollMode> = {
  normal: 'normal',
  edge: 'advantage',
  exposed: 'disadvantage',
}

/** The footing an outcome leaves: its last position effect (else normal) and its modifiers. */
function footingAfter(branch: OutcomeBranch): { position: Position; modifier: number } {
  let position: Position = 'normal'
  let modifier = 0
  for (const e of branch.effects) {
    if (e.effect === 'position') position = e.position
    if (e.effect === 'nextCheckModifier') modifier += e.amount
  }
  return { position, modifier }
}

/**
 * The options a round can be played with, as the odds see them: each check by its best actor (the
 * one who acts when the player doesn't pick) at that actor's modifier and luck now, with the
 * footing each outcome leaves (plus any upgrade `bonus`); a fixed option's one outcome for
 * sure. Strain and wounds taken in later rounds are not foreseen. `options` should be the ones available now.
 */
export function roundChoices(
  state: Pick<GameState, 'party' | 'day' | 'luckUsed'>,
  options: readonly Option[],
  stageId: string,
  /**
   * What the party's upgrades add to a round with this option at this footing's roll mode
   * (rules/upgrades.ts checkUpgrades: delving gear in a dungeon room, the scout's kit).
   */
  bonus: (option: Extract<Option, { kind: 'check' }>, mode: RollMode) => number = () => 0
): RoundChoice[] {
  return options.filter(playsRound).flatMap((option): RoundChoice[] => {
    const once = option.once ? onceKey(stageId, option) : null
    if (option.kind === 'fixed') {
      const result = { p: 1, marks: marksOf(option.outcome, null), ...footingAfter(option.outcome) }
      return [{ id: option.id, once, results: () => [result] }]
    }
    const { skill, ability, dc } = option.check
    const actor = chooseActor(state.party, skill, undefined, ability)
    if (!actor) return []
    const lucky = hasLuck(state, actor.characterId)
    const results = (position: Position, modifier: number) => {
      const mode = MODE[position]
      const odds = tierOdds(
        actor.modifier + bonus(option, mode) + modifier,
        normalizeDc(Number(dc)),
        mode,
        lucky
      )
      return TIERS.filter((tier) => odds[tier] > 0).map((tier) => {
        const branch = tierOutcome(option, tier)
        return { p: odds[tier], marks: marksOf(branch, tier), ...footingAfter(branch) }
      })
    }
    return [{ id: option.id, once, results }]
  })
}

/** Value iteration stops when no state's chance moves by more than this. */
const PRECISION = 1e-13
const MAX_SWEEPS = 100_000

/**
 * The chance of winning the challenge from `from` when the best option is picked every round,
 * and the chance with each option picked now (and the best after). Exact: an optimum over every
 * reachable tally, footing and set of once-only options used, solved by value iteration (a
 * partial can leave the tally where it was). With no choice left, the chance is 0.
 */
export function challengeOdds(
  choices: readonly RoundChoice[],
  need: Pick<Challenge, 'successes' | 'failures'>,
  from: Footing
): { chance: number; ifChosen: Record<string, number> } {
  const onceKeys = choices.flatMap((c) => (c.once ? [c.once] : []))
  type Node = { tally: Tally; position: Position; modifier: number; used: number }
  const keyOf = (n: Node) =>
    `${n.tally.successes},${n.tally.failures},${n.position},${n.modifier},${n.used}`
  const bit = (once: string | null) => (once === null ? 0 : 1 << onceKeys.indexOf(once))
  const startUsed = onceKeys.reduce(
    (mask, k, i) => (from.used.includes(k) ? mask | (1 << i) : mask),
    0
  )
  const start: Node = {
    tally: from.tally,
    position: from.position,
    modifier: from.modifier,
    used: startUsed,
  }

  // Every reachable node, with each choice's transitions to other nodes' keys.
  type Edge = { p: number; to: string }
  const nodes = new Map<string, { node: Node; terminal: number | null; moves: Edge[][] }>()
  const queue = [start]
  while (queue.length > 0) {
    const node = queue.pop()!
    const key = keyOf(node)
    if (nodes.has(key)) continue
    const state = decided(node.tally, need)
    if (state !== null) {
      nodes.set(key, { node, terminal: state === 'won' ? 1 : 0, moves: [] })
      continue
    }
    const moves = choices.map((choice): Edge[] => {
      const b = bit(choice.once)
      if (b !== 0 && (node.used & b) !== 0) return []
      return choice.results(node.position, node.modifier).map((r) => {
        const next: Node = {
          tally: addTally(node.tally, r.marks),
          position: r.position,
          modifier: r.modifier,
          used: node.used | b,
        }
        queue.push(next)
        return { p: r.p, to: keyOf(next) }
      })
    })
    nodes.set(key, { node, terminal: null, moves })
  }

  const value = new Map<string, number>()
  for (const [key, n] of nodes) value.set(key, n.terminal ?? 0)
  const worth = (edges: Edge[]) =>
    edges.length === 0 ? -1 : edges.reduce((sum, e) => sum + e.p * value.get(e.to)!, 0)
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let moved = 0
    for (const [key, n] of nodes) {
      if (n.terminal !== null) continue
      const best = Math.max(0, ...n.moves.map(worth))
      moved = Math.max(moved, Math.abs(best - value.get(key)!))
      value.set(key, best)
    }
    if (moved < PRECISION) break
  }
  const root = nodes.get(keyOf(start))!
  const ifChosen: Record<string, number> = {}
  choices.forEach((choice, i) => {
    if (root.terminal !== null) ifChosen[choice.id] = root.terminal
    else if (root.moves[i].length > 0) ifChosen[choice.id] = worth(root.moves[i])
  })
  return { chance: value.get(keyOf(start))!, ifChosen }
}

/**
 * The size a climax's challenge is written at for its CR (Plan 6 S; a content convention the
 * content tests check): 3 successes before 2 failures up to CR 5, 4 before 3 up to CR 12, then
 * 5 before 3.
 */
export function challengeSize(cr: number): Tally {
  if (cr <= 5) return { successes: 3, failures: 2 }
  if (cr <= 12) return { successes: 4, failures: 3 }
  return { successes: 5, failures: 3 }
}
