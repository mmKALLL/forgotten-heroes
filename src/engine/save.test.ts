import { describe, expect, test } from 'vitest'
import {
  CURRENT_SAVE_VERSION,
  deserialize,
  migrate,
  serialize,
  v3ToV4,
  v4ToV5,
  v5ToV6,
  v6ToV7,
} from './save'
import { newGame, step } from './state'
import { brom, fixtureContent, makeCharacter, makeEncounter, makeState } from './test-fixtures'
import type { GameState } from '../schema/state'
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
    version: 7,
    party: [{ ...ada, strain: {} }],
    world,
    location: startingSettlement(world, content),
    visited: false,
    travel: null,
    goods: { food: 5, water: 4 },
    waterskins: 0,
    ...PLAN_4_DEFAULTS,
  }
}

/** What a save from before Plan 4 starts with: no trades, prices, reputation or contracts. */
const PLAN_4_DEFAULTS = {
  markets: {},
  priceBook: {},
  spoilage: {},
  animals: {},
  upkeepOwed: 0,
  reputation: { settlements: {}, people: {} },
  contracts: [],
  contractsTaken: [],
  doneHere: [],
}

test('a version 2 save loads as version 7 with a world, a starting place and supplies', () => {
  expect(CURRENT_SAVE_VERSION).toBe(7)
  expect(deserialize(JSON.stringify(V2_SAVE), content)).toEqual(migrated())
})

test('a version 1 save chains through to version 7 too', () => {
  expect(deserialize(JSON.stringify(V1_SAVE), content)).toEqual(migrated())
})

test('migrating old saves does not mutate the parsed object', () => {
  for (const save of [V1_SAVE, V2_SAVE]) {
    const raw = structuredClone(save)
    migrate(raw, content)
    expect(raw).toEqual(save)
  }
})

test('a version 3 save from before waterskins, foraging, pace and strain loads with defaults', () => {
  const travel = {
    route: 'greenvale-1-greenvale-2',
    from: 'greenvale-1',
    to: 'greenvale-2',
    km: 75,
    kmPerDay: 30,
    kmDone: 30,
    daysDone: 1,
    days: 3,
    encounterDays: [2],
  }
  const state = makeState({ location: null })
  const { waterskins: _skins, ...older } = state
  const party = state.party.map(({ strain: _strain, ...c }) => c)
  const loaded = deserialize(JSON.stringify({ ...older, party, travel }), content)
  expect(loaded).toEqual({
    ...state,
    waterskins: 0,
    party: state.party.map((c) => ({ ...c, strain: {} })),
    travel: {
      ...travel,
      pace: 'steady',
      paceLog: [],
      forage: true,
      hired: null,
    },
  })
})

test('a journey saves its pace and the pace of each day on the road', () => {
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
    pace: 'stealthy' as const,
    paceLog: [{ day: 1, pace: 'stealthy' as const }],
    forage: true,
    hired: null,
  }
  const state = makeState({ location: null, travel })
  expect(deserialize(serialize(state), content)).toEqual(state)
  expect(
    deserialize(serialize({ ...state, travel: { ...travel, pace: 'sprint' } } as never), content)
  ).toBeNull()
})

/** A v3 save: the same game, with its world in the old region shape. */
function v3Save(overrides: Record<string, unknown> = {}) {
  const state = makeState({ location: 'greenvale-2', gold: 33 })
  const world = {
    seed: state.world.seed,
    kingdoms: [
      {
        id: 'kingdom-1',
        name: 'Kingdom of Old',
        ancestry: 'human',
        capital: 'greenvale-1',
        regions: ['ashmoor', 'farisle', 'greenvale'],
        defence: 6,
      },
    ],
    regions: {
      greenvale: { kingdom: 'kingdom-1', threat: 'bandits', threatStrength: 2, threatLevel: 0 },
    },
    settlements: state.world.settlements,
  }
  return { ...state, version: 3, world, ...overrides }
}

describe('v3 → v4', () => {
  test('re-rolls the world from the seed and keeps the party where it is', () => {
    const save = v3Save()
    const loaded = deserialize(JSON.stringify(save), content)!
    expect(loaded).not.toBeNull()
    expect(loaded.version).toBe(7)
    expect(loaded.world).toEqual(generateWorld(worldSeed(save.seed), content))
    expect(loaded.location).toBe('greenvale-2')
    expect(loaded.gold).toBe(33)
    expect(loaded.party).toEqual(save.party)
    expect(loaded.log).toEqual(save.log)
    expect(loaded.goods).toEqual(save.goods)
  })

  test('a new game and a migrated save with the same seed share a world', () => {
    const save = v3Save({ seed: 9 })
    expect(deserialize(JSON.stringify(save), content)!.world).toEqual(newGame(9, content).world)
  })

  test('migrating twice gives identical output', () => {
    const save = v3Save()
    expect(v3ToV4(structuredClone(save), content)).toEqual(v3ToV4(structuredClone(save), content))
    expect(serialize(deserialize(JSON.stringify(save), content)!)).toBe(
      serialize(deserialize(JSON.stringify(save), content)!)
    )
  })

  test('a vanished settlement puts the party at the starting place', () => {
    const loaded = deserialize(JSON.stringify(v3Save({ location: 'atlantis-1' })), content)!
    expect(loaded.location).toBe(startingSettlement(loaded.world, content))
  })

  test('a journey along a route that still exists goes on; one along a lost route is dropped', () => {
    const travel = {
      route: 'greenvale-1-greenvale-2',
      from: 'greenvale-1',
      to: 'greenvale-2',
      km: 75,
      kmPerDay: 30,
      kmDone: 30,
      daysDone: 1,
      days: 3,
      encounterDays: [2],
      pace: 'steady',
      paceLog: [],
      forage: true,
    }
    const onRoad = deserialize(JSON.stringify(v3Save({ location: null, travel })), content)!
    expect(onRoad.travel).toEqual({ ...travel, hired: null })
    expect(onRoad.location).toBeNull()
    const lost = { ...travel, route: 'nowhere-road' }
    const stranded = deserialize(JSON.stringify(v3Save({ location: null, travel: lost })), content)!
    expect(stranded.travel).toBeNull()
    expect(stranded.location).toBe(startingSettlement(stranded.world, content))
  })
})

describe('v4 → v5', () => {
  /** A v4 save: POIs without a category, and `cleared` instead of the day it happened. */
  function v4Save() {
    const state = makeState({ day: 12 })
    const [first, second] = Object.keys(state.world.pois)
    const pois = Object.fromEntries(
      Object.entries(state.world.pois).map(([id, p]) => {
        const { category: _category, clearedDay: _day, boonDay: _boon, ...rest } = p
        return [id, { ...rest, cleared: id === first }]
      })
    )
    const { visited: _visited, ...older } = state
    return { save: { ...older, version: 4, world: { ...state.world, pois } }, first, second, state }
  }

  test('keeps each POI’s category, and a cleared one is cleared as of the save’s day', () => {
    const { save, first, second, state } = v4Save()
    const loaded = deserialize(JSON.stringify(save), content)!
    expect(loaded.version).toBe(7)
    expect(loaded.world.pois[first]).toEqual({ ...state.world.pois[first], clearedDay: 12 })
    expect(loaded.world.pois[second]).toEqual(state.world.pois[second])
    expect(loaded.visited).toBe(false)
  })

  test('an unknown POI type falls back on its threat for a category', () => {
    const { save, first } = v4Save()
    const raw = structuredClone(save) as unknown as Record<string, unknown>
    const world = raw.world as { pois: Record<string, Record<string, unknown>> }
    world.pois[first].type = 'gone'
    world.pois[first].threat = 2
    const migrated = v4ToV5(raw, content) as { world: typeof world }
    expect(migrated.world.pois[first].category).toBe('lair')
  })
})

describe('v5 → v6', () => {
  /** A v5 save: no people, markets, price book, reputation, contracts or animals yet. */
  function v5Save(overrides: Partial<GameState> = {}) {
    const state = makeState({
      location: 'greenvale-2',
      gold: 37,
      goods: { food: 6, water: 3 },
      waterskins: 2,
      // A migrated save knows no prices until the party next arrives somewhere.
      priceBook: {},
      ...overrides,
    })
    const { people: _people, ...world } = state.world
    const {
      markets: _markets,
      priceBook: _priceBook,
      spoilage: _spoilage,
      animals: _animals,
      upkeepOwed: _upkeep,
      reputation: _reputation,
      contracts: _contracts,
      contractsTaken: _taken,
      doneHere: _done,
      ...older
    } = state
    const travel = state.travel && (({ hired: _hired, ...t }) => t)(state.travel)
    return { save: { ...older, version: 5, world, travel }, state }
  }

  test('migrates and parses, leaving goods, waterskins, gold, party and location alone', () => {
    const { save, state } = v5Save()
    const loaded = deserialize(JSON.stringify(save), content)!
    expect(loaded).not.toBeNull()
    expect(loaded.version).toBe(7)
    expect(loaded.goods).toEqual({ food: 6, water: 3 })
    expect(loaded.waterskins).toBe(2)
    expect(loaded.gold).toBe(37)
    expect(loaded.party).toEqual(state.party)
    expect(loaded.location).toBe('greenvale-2')
    expect(loaded).toMatchObject(PLAN_4_DEFAULTS)
    expect(loaded).toEqual(state)
  })

  test('the people are those of a new game with the same seed', () => {
    for (const seed of [1, 2, 3]) {
      const { save } = v5Save({ ...newGame(seed, content), party: [brom] })
      const loaded = deserialize(JSON.stringify(save), content)!
      expect(Object.keys(loaded.world.people).length).toBeGreaterThan(0)
      expect(loaded.world.people).toEqual(newGame(seed, content).world.people)
    }
  })

  test('a journey under way goes on, with no hired mounts', () => {
    const travel = {
      route: 'greenvale-1-greenvale-2',
      from: 'greenvale-1',
      to: 'greenvale-2',
      km: 75,
      kmPerDay: 30,
      kmDone: 30,
      daysDone: 1,
      days: 3,
      encounterDays: [2],
      pace: 'steady' as const,
      paceLog: [],
      forage: true,
      hired: null,
    }
    const { save, state } = v5Save({ location: null, travel })
    expect(deserialize(JSON.stringify(save), content)).toEqual(state)
  })

  test('migrating twice gives identical output, and the parsed save is not mutated', () => {
    const { save } = v5Save()
    const raw = structuredClone(save) as unknown as Record<string, unknown>
    expect(v5ToV6(raw, content)).toEqual(v5ToV6(structuredClone(raw), content))
    expect(raw).toEqual(save)
  })
})

describe('v6 → v7', () => {
  const v6Travel = {
    route: 'greenvale-1-greenvale-2',
    from: 'greenvale-1',
    to: 'greenvale-2',
    km: 75,
    kmPerDay: 16,
    kmDone: 16,
    daysDone: 1,
    days: 5,
    encounterDays: [3],
    pace: 'cautious',
    coverTracks: true,
    paceLog: [
      { day: 1, pace: 'cautious', coverTracks: true },
      { day: 2, pace: 'cautious', coverTracks: false },
    ],
    forage: false,
    hired: null,
  }
  /** A v6 save on the road, cautious with covered tracks, hunted by a pursuit with a trail. */
  const v6Save = (travel: Record<string, unknown> = v6Travel) => {
    const state = makeState({ location: null })
    return {
      ...state,
      version: 6,
      travel,
      followUps: [
        {
          situationId: 'grudge',
          wait: 1,
          queuedDay: 1,
          trail: [{ day: 1, pace: 'cautious', coverTracks: true }],
        },
      ],
    }
  }

  test('covering tracks becomes the stealthy pace, on the journey and every logged day', () => {
    const loaded = deserialize(JSON.stringify(v6Save()), content)!
    expect(loaded.version).toBe(7)
    expect(loaded.travel).toMatchObject({ pace: 'stealthy', kmPerDay: 16, days: 5 })
    expect(loaded.travel).not.toHaveProperty('coverTracks')
    expect(loaded.travel!.paceLog).toEqual([
      { day: 1, pace: 'stealthy' },
      { day: 2, pace: 'cautious' },
    ])
    expect(loaded.followUps[0].trail).toEqual([{ day: 1, pace: 'stealthy' }])
  })

  test('a cautious journey without covered tracks stays cautious', () => {
    const loaded = deserialize(
      JSON.stringify(v6Save({ ...v6Travel, coverTracks: false, paceLog: [] })),
      content
    )!
    expect(loaded.travel).toMatchObject({ pace: 'cautious', paceLog: [] })
  })

  test('the parsed save is not mutated', () => {
    const save = v6Save()
    const raw = structuredClone(save) as unknown as Record<string, unknown>
    v6ToV7(raw)
    expect(raw).toEqual(save)
  })
})
