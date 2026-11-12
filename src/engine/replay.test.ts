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
  const resumed = deserialize(serialize(half), content)
  expect(resumed).toEqual(half)
  expect(play(resumed!, 15)).toEqual(play(half, 15))
})

test('saving and loading in the middle of an encounter does not change what happens next', () => {
  const started = step(
    play(newGame(11, content), 3),
    { type: 'startEncounter', situationId: 'roadside' },
    content
  )
  const middle = step(started, { type: 'chooseOption', optionId: 'read' }, content) // stays on the stage
  expect(middle.encounter?.stage).toBe('start')
  expect(middle.encounter?.used).toEqual(['start/read'])
  const resumed = deserialize(serialize(middle), content)
  expect(resumed).toEqual(middle)
  const finish = (state: GameState) =>
    play(step(state, { type: 'chooseOption', optionId: 'rob' }, content), 10)
  expect(finish(resumed!)).toEqual(finish(middle))
})
