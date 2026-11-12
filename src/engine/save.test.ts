import { expect, test } from 'vitest'
import { CURRENT_SAVE_VERSION, deserialize, migrate, serialize } from './save'
import { newGame, step } from './state'
import { fixtureContent, makeCharacter, makeEncounter, makeState } from './test-fixtures'
import type { RollMode } from './rules/checks'
import { generateWorld, startingSettlement, worldSeed } from './world/generate'

const content = fixtureContent()

test('round trip', () => {
  const state = newGame(5, fixtureContent())
  expect(deserialize(serialize(state), content)).toEqual(state)
})

test('a v2 save from before nextCheckModifier and its reason existed still loads, with 0 and null', () => {
  const { nextCheckModifier: _dropped, nextCheckReason: _reason, ...older } = makeEncounter()
  const state = makeState({ encounter: makeEncounter() })
  expect(deserialize(JSON.stringify({ ...state, encounter: older }), content)).toEqual(state)
})

test('garbage and wrong versions load as null', () => {
  expect(deserialize('not json', content)).toBeNull()
  expect(deserialize(JSON.stringify({ version: 999 }), content)).toBeNull()
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
    expect(deserialize(serialize(state), content)).toEqual(state)
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
  expect(deserialize(JSON.stringify({ ...state, rng: { state: -1 } }), content)).toBeNull()
  expect(deserialize(JSON.stringify({ ...state, rng: { state: 2 ** 32 } }), content)).toBeNull()
})

test('new games are stamped with the current save version', () => {
  expect(newGame(5, fixtureContent()).version).toBe(CURRENT_SAVE_VERSION)
})

test('migrate passes a current-version save through unchanged', () => {
  const raw = JSON.parse(serialize(newGame(5, fixtureContent())))
  expect(migrate(raw, content)).toBe(raw)
})

test('migrate refuses unknown or missing versions', () => {
  expect(() => migrate({ version: 999 }, content)).toThrow(/version/)
  expect(() => migrate({ version: 0 }, content)).toThrow(/version/)
  expect(() => migrate({}, content)).toThrow(/version/)
  expect(() => migrate(null, content)).toThrow(/version/)
  expect(() => migrate([1], content)).toThrow(/version/)
})

/** A save as Plan 1 wrote it. Characters had no strain yet. */
const { strain: _strain, ...ada } = makeCharacter({ id: 'c-ada', name: 'Ada Stone' })
const V1_SAVE = {
  version: 1,
  seed: 5,
  rng: { state: 12345 },
  day: 3,
  party: [ada],
  gold: 42,
  inspiration: 1,
  log: [{ day: 1, text: 'Ada Stone set out.', tone: 'info' }],
  lastRoll: null,
}
/** A save as Plan 2 wrote it. */
const V2_SAVE = { ...V1_SAVE, version: 2, encounter: null, followUps: [], skillUses: [] }

/** Both become: a world rolled from the save's seed, the party at its starting place with fresh supplies. */
function migrated() {
  const world = generateWorld(worldSeed(5), content)
  return {
    ...V2_SAVE,
    version: 3,
    party: [{ ...ada, strain: {} }],
    world,
    location: startingSettlement(world, content),
    travel: null,
    goods: { food: 5, water: 4 },
  }
}

test('a version 2 save loads as version 3 with a world, a starting place and supplies', () => {
  expect(CURRENT_SAVE_VERSION).toBe(3)
  expect(deserialize(JSON.stringify(V2_SAVE), content)).toEqual(migrated())
})

test('a version 1 save loads as version 3 too', () => {
  expect(deserialize(JSON.stringify(V1_SAVE), content)).toEqual(migrated())
})

test('migrating old saves does not mutate the parsed object', () => {
  for (const save of [V1_SAVE, V2_SAVE]) {
    const raw = structuredClone(save)
    migrate(raw, content)
    expect(raw).toEqual(save)
  }
})

test('a journey saves its pace, covered tracks and the pace of each day on the road', () => {
  const travel = {
    route: 'greenvale-1-greenvale-2',
    from: 'greenvale-1',
    to: 'greenvale-2',
    km: 75,
    kmPerDay: 20,
    kmDone: 20,
    daysDone: 1,
    days: 4,
    encounterDays: [3],
    pace: 'cautious' as const,
    coverTracks: true,
    paceLog: [{ day: 1, pace: 'cautious' as const, coverTracks: true }],
  }
  const state = makeState({ location: null, travel })
  expect(deserialize(serialize(state), content)).toEqual(state)
  expect(
    deserialize(serialize({ ...state, travel: { ...travel, pace: 'sprint' } } as never), content)
  ).toBeNull()
})
