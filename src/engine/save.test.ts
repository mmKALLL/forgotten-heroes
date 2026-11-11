import { expect, test } from 'vitest'
import { CURRENT_SAVE_VERSION, deserialize, migrate, serialize } from './save'
import { newGame, step } from './state'
import { fixtureContent, makeCharacter, makeEncounter, makeState } from './test-fixtures'
import type { RollMode } from './rules/checks'

const content = fixtureContent()

test('round trip', () => {
  const state = newGame(5, fixtureContent())
  expect(deserialize(serialize(state))).toEqual(state)
})

test('a v2 save from before nextCheckModifier and its reason existed still loads, with 0 and null', () => {
  const { nextCheckModifier: _dropped, nextCheckReason: _reason, ...older } = makeEncounter()
  const state = makeState({ encounter: makeEncounter() })
  expect(deserialize(JSON.stringify({ ...state, encounter: older }))).toEqual(state)
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
    state = step(
      state,
      { type: 'practiceCheck', stat: 'athletics', dc, mode: modes[i % 3] },
      content
    )
    expect(deserialize(serialize(state))).toEqual(state)
  }
  expect(state.lastRoll?.dc).toBe(15)
})

test('practiceCheck clamps DCs to whole numbers in 1..40', () => {
  const start = newGame(11, fixtureContent())
  const dcAfter = (dc: number) =>
    step(start, { type: 'practiceCheck', stat: 'athletics', dc, mode: 'normal' }, content).lastRoll
      ?.dc
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

/** A save as Plan 1 wrote it. */
const V1_SAVE = {
  version: 1,
  seed: 5,
  rng: { state: 12345 },
  day: 3,
  party: [makeCharacter({ id: 'c-ada', name: 'Ada Stone' })],
  gold: 42,
  inspiration: 1,
  log: [{ day: 1, text: 'Ada Stone set out.', tone: 'info' }],
  lastRoll: null,
}

test('a version 1 save loads as version 2 with no encounter, follow-ups or skill uses', () => {
  expect(CURRENT_SAVE_VERSION).toBe(2)
  expect(deserialize(JSON.stringify(V1_SAVE))).toEqual({
    ...V1_SAVE,
    version: 2,
    encounter: null,
    followUps: [],
    skillUses: [],
  })
})

test('migrating a v1 save does not mutate the parsed object', () => {
  const raw = structuredClone(V1_SAVE)
  migrate(raw)
  expect(raw).toEqual(V1_SAVE)
})
