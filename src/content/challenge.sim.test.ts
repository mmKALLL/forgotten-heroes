import { describe, expect, test } from 'vitest'
import { challengeOf, decided } from '../engine/encounters/challenge'
import { challengePreview, encounterOptions } from '../engine/encounters/preview'
import { currentOptions, startEncounter } from '../engine/encounters/run'
import { withRng } from '../engine/rng'
import { levelTo } from '../engine/rules/progression'
import { newGame, step } from '../engine/state'
import type { GameState } from '../schema/state'
import { loadBundledContent } from './bundled'

// Plan 6 S: a climax should be hard for a low-level party. Act I's key situations are played from
// their start at their CR by a fresh party at a given level, picking the likeliest check (never
// leaving) and, in the finale's challenge, the round with the best chance of winning it. A guard
// with a generous bound (Plan 6 Track B measured 0.22 for a novice pair, 0.28 for a level-7 pair and
// 0.45 for a level-7 party of four; see docs/notes/crisis-report.md); the rates print for the notes.

const content = loadBundledContent()
const villains = Object.values(content.villains)
const actOne = villains.flatMap((v) =>
  content.poiTypes[v.acts[0].site].situations.map((id) => ({ id, cr: v.acts[0].keyCr }))
)

/**
 * A new game's party (and gold), every member raised to `level`; with `size` 4, another world's
 * founders join as two hired members (as a party of that level would have recruited).
 */
function partyAt(seed: number, level: number, size = 2): GameState {
  const state = newGame(seed, content)
  const extra =
    size > 2
      ? newGame(seed + 1000, content)
          .party.slice(0, size - 2)
          .map((c, i) => ({ ...c, id: `hired-${i}`, hired: true }))
      : []
  const [party, rng] = withRng(state.rng, (d) =>
    [...state.party, ...extra].map((c) => levelTo(c, level, d))
  )
  return { ...state, rng, party: party.map((c) => ({ ...c, hp: c.maxHp })), gold: 50 }
}

/** Plays the open encounter to its end; true when its challenge was won. */
function playOut(start: GameState): boolean {
  let state = start
  for (let guard = 0; guard < 60 && state.encounter?.stage; guard++) {
    const round = challengePreview(state)?.best
    const raw = currentOptions(state.encounter!)
    const leaves = (id: string) => {
      const o = raw.find((x) => x.id === id)
      return o?.kind === 'fixed' && !o.outcome.goto && !o.outcome.tally
    }
    const options = encounterOptions(state).filter((o) => o.available && !leaves(o.id))
    const checks = options
      .filter((o) => o.check)
      .sort((a, b) => b.check!.successChance - a.check!.successChance)
    const pick = round ?? options.find((o) => o.kind === 'fixed')?.id ?? checks[0]?.id
    if (!pick) break
    const before = state.encounter!
    state = step(state, { type: 'chooseOption', optionId: pick }, content)
    const challenge = challengeOf(before)
    const tally = state.encounter?.tally
    if (challenge && tally && decided(tally, challenge) !== null)
      return decided(tally, challenge) === 'won'
  }
  return false
}

function winRate(level: number, seeds: number, size = 2): number {
  let wins = 0
  let runs = 0
  for (const { id, cr } of actOne)
    for (let seed = 1; seed <= seeds; seed++) {
      const started = startEncounter(
        partyAt(seed, level, size),
        content,
        id,
        undefined,
        undefined,
        {
          cr,
        }
      )
      runs++
      if (playOut(started)) wins++
    }
  return wins / runs
}

describe("act I's key challenge", () => {
  test(
    'a novice party (level 1–2) wins it less often than one of its level',
    { timeout: 60_000 },
    () => {
      const novice = (winRate(1, 25) + winRate(2, 25)) / 2
      const meant = winRate(7, 25)
      const party = winRate(7, 25, 4)
      console.log(
        `act I key won: novice pair (levels 1–2) ${novice.toFixed(3)}, level-3 pair ` +
          `${winRate(3, 25).toFixed(3)}, level-7 pair ${meant.toFixed(3)}, level-7 party of four ` +
          `${party.toFixed(3)}`
      )
      expect(novice).toBeLessThan(0.4)
      expect(meant).toBeGreaterThan(novice)
    }
  )
})
