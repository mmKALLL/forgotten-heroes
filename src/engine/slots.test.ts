import { expect, test } from 'vitest'
import { slotSummary } from './slots'
import { newGame } from './state'
import { brom, fixtureContent, lyra, makeState } from './test-fixtures'

const content = fixtureContent()

test('a slot summary names the party, their levels, the day, the gold and the place', () => {
  const state = newGame(5, content)
  const summary = slotSummary(state, content)
  expect(summary.party).toEqual(state.party.map((c) => ({ name: c.name, level: c.level })))
  expect(summary.day).toBe(state.day)
  expect(summary.gold).toBe(state.gold)
  expect(summary.place).toBe(state.world.settlements[state.location!].name)
  expect(summary.onRoad).toBe(false)
  expect(summary.ending).toBeNull()
})

test('on the road, the summary gives where the party is headed', () => {
  const state = newGame(5, content)
  const to = Object.keys(state.world.settlements).find((id) => id !== state.location)!
  const travelling = {
    ...state,
    location: null,
    travel: { route: 'r', from: state.location!, to } as unknown as NonNullable<
      typeof state.travel
    >,
  }
  expect(slotSummary(travelling, content)).toMatchObject({
    place: state.world.settlements[to].name,
    onRoad: true,
  })
})

test('a fallen party’s slot says so', () => {
  const party = [brom, lyra].map((c) => ({ ...c, exhaustion: 6 }))
  expect(slotSummary(makeState({ party }), content).ending).toBe('fallen')
})
