import { expect, test } from 'vitest'
import type { GameState } from '../schema/state'
import { encounterOptions } from './encounters/preview'
import { deserialize, serialize } from './save'
import { newGame, step } from './state'
import { fixtureContent } from './test-fixtures'

const content = fixtureContent()

/** A fixed policy: draw an encounter, take the first available option until it ends, close it. */
function play(start: GameState, encounters: number): GameState {
  let state = start
  for (let i = 0; i < encounters; i++) {
    state = step(state, { type: 'drawEncounter' }, content)
    for (let guard = 0; state.encounter && state.encounter.stage !== null && guard < 20; guard++) {
      const option = encounterOptions(state).find((o) => o.available)
      if (!option) break
      state = step(state, { type: 'chooseOption', optionId: option.id }, content)
    }
    state = step(state, { type: 'closeEncounter' }, content)
  }
  return state
}

test('a seeded run replays identically, and another seed differs', () => {
  const run = play(newGame(2024, content), 30)
  expect(run.log.length).toBeGreaterThan(60)
  expect(play(newGame(2024, content), 30)).toEqual(run)
  expect(play(newGame(2025, content), 30)).not.toEqual(run)
})

test('saving and loading mid-run does not change what happens next', () => {
  const half = play(newGame(7, content), 15)
  const resumed = deserialize(serialize(half))
  expect(resumed).toEqual(half)
  expect(play(resumed!, 15)).toEqual(play(half, 15))
})
