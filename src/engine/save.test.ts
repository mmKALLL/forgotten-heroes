import { expect, test } from 'vitest'
import { CURRENT_SAVE_VERSION, deserialize, migrate, serialize } from './save'
import { newGame, step } from './state'
import { fixtureContent } from './test-fixtures'
import type { RollMode } from './rules/checks'

test('round trip', () => {
  const state = newGame(5, fixtureContent())
  expect(deserialize(serialize(state))).toEqual(state)
})

test('garbage and wrong versions load as null', () => {
  expect(deserialize('not json')).toBeNull()
  expect(deserialize(JSON.stringify({ version: 999 }))).toBeNull()
})

test('states produced by step always survive a save round trip, even with odd DCs', () => {
  let state = newGame(11, fixtureContent())
  const dcs = [12.5, 0, -3, 99, Number.NaN, 7.49, 15]
  const modes: RollMode[] = ['normal', 'advantage', 'disadvantage']
  for (let i = 0; i < 21; i++) {
    const dc = dcs[i % dcs.length]
    state = step(state, { type: 'practiceCheck', stat: 'athletics', dc, mode: modes[i % 3] })
    expect(deserialize(serialize(state))).toEqual(state)
  }
  expect(state.lastRoll?.dc).toBe(15)
})

test('practiceCheck clamps DCs to whole numbers in 1..40', () => {
  const start = newGame(11, fixtureContent())
  const dcAfter = (dc: number) =>
    step(start, { type: 'practiceCheck', stat: 'athletics', dc, mode: 'normal' }).lastRoll?.dc
  expect(dcAfter(12.5)).toBe(13)
  expect(dcAfter(0)).toBe(1)
  expect(dcAfter(99)).toBe(40)
  expect(dcAfter(Number.NaN)).toBe(1)
})

test('an out-of-range rng state loads as null', () => {
  const state = newGame(5, fixtureContent())
  expect(deserialize(JSON.stringify({ ...state, rng: { state: -1 } }))).toBeNull()
  expect(deserialize(JSON.stringify({ ...state, rng: { state: 2 ** 32 } }))).toBeNull()
})

test('new games are stamped with the current save version', () => {
  expect(newGame(5, fixtureContent()).version).toBe(CURRENT_SAVE_VERSION)
})

test('migrate passes a current-version save through unchanged', () => {
  const raw = JSON.parse(serialize(newGame(5, fixtureContent())))
  expect(migrate(raw)).toBe(raw)
})

test('migrate refuses unknown or missing versions', () => {
  expect(() => migrate({ version: 999 })).toThrow(/version/)
  expect(() => migrate({ version: 0 })).toThrow(/version/)
  expect(() => migrate({})).toThrow(/version/)
  expect(() => migrate(null)).toThrow(/version/)
  expect(() => migrate([1])).toThrow(/version/)
})
