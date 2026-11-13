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
// with a generous bound (Plan 6 S measured about 0.30 for novices and 0.39 at level 7 over 40
// seeds; Track B tunes toward "almost never" for novices); the rates print for the notes.

const content = loadBundledContent()
const villains = Object.values(content.villains)
const actOne = villains.flatMap((v) =>
  content.poiTypes[v.acts[0].site].situations.map((id) => ({ id, cr: v.acts[0].keyCr }))
)

/** A new game's party (and gold), every member raised to `level`. */
function partyAt(seed: number, level: number): GameState {
  const state = newGame(seed, content)
  const [party, rng] = withRng(state.rng, (d) => state.party.map((c) => levelTo(c, level, d)))
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

function winRate(level: number, seeds: number): number {
  let wins = 0
  let runs = 0
  for (const { id, cr } of actOne)
    for (let seed = 1; seed <= seeds; seed++) {
      const started = startEncounter(partyAt(seed, level), content, id, undefined, undefined, {
        cr,
      })
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
      console.log(
        `act I key won: novice (levels 1–2) ${novice.toFixed(3)}, level 7 ${meant.toFixed(3)}`
      )
      expect(novice).toBeLessThan(0.4)
      expect(meant).toBeGreaterThan(novice)
    }
  )
})
