import { expect, test } from 'vitest'
import type { GameState } from '../schema/state'
import { encounterOptions } from './encounters/preview'
import { deserialize, serialize } from './save'
import { newGame, step } from './state'
import { fixtureContent } from './test-fixtures'
import { routeOptions } from './travel/preview'
import { wander } from './travel/wander'

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

test('a seeded journey replays identically, and another seed differs', () => {
  const run = wander(newGame(2024, content), content, 6)
  expect(run.day).toBeGreaterThan(5)
  expect(wander(newGame(2024, content), content, 6)).toEqual(run)
  expect(wander(newGame(2025, content), content, 6)).not.toEqual(run)
})

test('the wandering party varies its pace from leg to leg', () => {
  const departures = wander(newGame(2024, content), content, 6)
    .log.map((e) =>
      /^The party sets out for .+?( at a \w+ pace| on a forced march)?(, covering its tracks)?: /.exec(
        e.text
      )
    )
    .filter((m) => m !== null)
    .map((m) => `${m[1] ?? 'steady'}${m[2] ?? ''}`)
  // Six legs, but a party left without passage money rests instead of sailing on.
  expect(departures.length).toBeGreaterThanOrEqual(3)
  expect(new Set(departures).size).toBeGreaterThanOrEqual(3)
})

test('saving and loading in the middle of a journey does not change what happens next', () => {
  const start = newGame(9, content)
  const out = step(
    start,
    { type: 'travel', routeId: routeOptions(start, content)[0].routeId },
    content
  )
  const resumed = deserialize(serialize(out), content)
  expect(resumed).toEqual(out)
  expect(wander(resumed!, content, 3)).toEqual(wander(out, content, 3))
})
