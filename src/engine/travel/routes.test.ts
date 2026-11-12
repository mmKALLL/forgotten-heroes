import { describe, expect, test } from 'vitest'
import type { TravelState } from '../../schema/state'
import { createRng, withRng } from '../rng'
import { fixtureContent, makeState } from '../test-fixtures'
import {
  canMeetEncounters,
  encounterChance,
  encounterRange,
  fareFor,
  journeyDays,
  kmPerDay,
  rollEncounterDays,
  routeTerrain,
  routeThreat,
} from './routes'

const content = fixtureContent()

test('speed depends on the terrain', () => {
  expect(kmPerDay('plains')).toBe(30)
  expect(kmPerDay('marsh')).toBe(18)
  expect(kmPerDay('mountains')).toBe(15)
  expect(kmPerDay('sea')).toBe(75)
})

test('journeys take whole days, at least one', () => {
  expect(journeyDays({ km: 75, terrain: 'plains' })).toBe(3)
  expect(journeyDays({ km: 75, terrain: 'marsh' })).toBe(5)
  expect(journeyDays({ km: 10, terrain: 'plains' })).toBe(1)
  expect(journeyDays({ km: 160, terrain: 'sea' })).toBe(3)
})

describe('pace', () => {
  test('cautious is ⅔ speed, brisk 1.25× and a forced march 1.5×', () => {
    expect(kmPerDay('plains', 'cautious')).toBeCloseTo(20)
    expect(kmPerDay('plains', 'steady')).toBe(30)
    expect(kmPerDay('plains', 'brisk')).toBeCloseTo(37.5)
    expect(kmPerDay('plains', 'forced')).toBeCloseTo(45)
  })

  test('the journey takes days by pace', () => {
    const plains = { km: 75, terrain: 'plains' as const }
    expect(journeyDays(plains, 'cautious')).toBe(4)
    expect(journeyDays(plains, 'steady')).toBe(3)
    expect(journeyDays(plains, 'brisk')).toBe(2)
    expect(journeyDays(plains, 'forced')).toBe(2)
  })

  test('covering tracks costs a quarter day more per day travelled, at cautious pace only', () => {
    expect(kmPerDay('plains', 'cautious', true)).toBeCloseTo(16)
    expect(journeyDays({ km: 75, terrain: 'plains' }, 'cautious', true)).toBe(5)
    expect(kmPerDay('plains', 'steady', true)).toBe(30)
    expect(kmPerDay('plains', 'brisk', true)).toBeCloseTo(37.5)
  })

  test('a ship sails at its own speed, whatever the pace', () => {
    for (const pace of ['cautious', 'brisk', 'forced'] as const) {
      expect(kmPerDay('sea', pace, true)).toBe(75)
      expect(journeyDays({ km: 160, terrain: 'sea' }, pace)).toBe(3)
    }
  })

  test('brisk and forced add 10% to each encounter slot; cautious keeps the usual rate', () => {
    expect(encounterChance(0, 0, 'cautious')).toBeCloseTo(0.2)
    expect(encounterChance(0, 0, 'steady')).toBeCloseTo(0.2)
    expect(encounterChance(0, 0, 'brisk')).toBeCloseTo(0.3)
    expect(encounterChance(2, 1, 'forced')).toBeCloseTo(0.7)
    expect(encounterChance(3, 3, 'forced')).toBeCloseTo(0.9)
  })

  test('the encounter budget still follows the journey’s days', () => {
    const plains = { km: 75, terrain: 'plains' as const }
    expect(encounterRange(journeyDays(plains, 'cautious'))).toEqual([1, 3])
    expect(encounterRange(journeyDays(plains, 'brisk'))).toEqual([0, 2])
  })
})

test('short hops get 0–2 encounters, middling journeys 1–3, long ones 2–4', () => {
  expect([1, 2, 3, 4, 5, 9].map(encounterRange)).toEqual([
    [0, 2],
    [0, 2],
    [1, 3],
    [1, 3],
    [2, 4],
    [2, 4],
  ])
})

test('the encounter chance grows with danger and threat, within 5–90%', () => {
  expect(encounterChance(0, 0)).toBeCloseTo(0.2)
  expect(encounterChance(2, 1)).toBeCloseTo(0.6)
  expect(encounterChance(3, 3)).toBeCloseTo(0.9)
})

describe('rollEncounterDays', () => {
  const roll = (seed: number, days: number, range: [number, number], chance: number) =>
    withRng(createRng(seed), (d) => rollEncounterDays(d, days, range, chance))[0]

  test('stays inside the budget, on journey days, in order', () => {
    const counts = new Set<number>()
    for (let seed = 0; seed < 500; seed++) {
      const days = roll(seed, 3, [1, 3], 0.5)
      counts.add(days.length)
      expect(days.length).toBeGreaterThanOrEqual(1)
      expect(days.length).toBeLessThanOrEqual(3)
      for (const day of days) expect(day).toBeGreaterThanOrEqual(1)
      for (const day of days) expect(day).toBeLessThanOrEqual(3)
      expect([...days].sort((a, b) => a - b)).toEqual(days)
    }
    expect([...counts].sort()).toEqual([1, 2, 3])
  })

  test('chance 0 gives the minimum, chance 1 the maximum', () => {
    expect(roll(1, 6, [2, 4], 0)).toHaveLength(2)
    expect(roll(1, 6, [2, 4], 1)).toHaveLength(4)
  })
})

test('a route’s threat is the higher threat level of its two regions', () => {
  const state = makeState()
  const world = structuredClone(state.world)
  world.regions.greenvale.threatLevel = 1
  world.regions.ashmoor.threatLevel = 3
  const route = content.routes['ashmoor-1-greenvale-2']
  expect(routeThreat({ ...state, world }, content, route)).toBe(3)
})

test('site situations never make a route eventful', () => {
  const sea = content.routes['ashmoor-1-farisle-1']
  expect(canMeetEncounters(content, sea)).toBe(false)
  const siteAtSea = structuredClone(content)
  siteAtSea.situations['orc-war-camp-raid'].biomes = ['sea']
  expect(canMeetEncounters(siteAtSea, sea)).toBe(false)
  const roadAtSea = structuredClone(siteAtSea)
  roadAtSea.situations['orc-war-camp-raid'].site = false
  expect(canMeetEncounters(roadAtSea, sea)).toBe(true)
})

test('only sea crossings cost a fare: 2 gp per member per day', () => {
  expect(fareFor(content.routes['ashmoor-1-farisle-1'], 2)).toBe(12)
  expect(fareFor(content.routes['greenvale-1-greenvale-2'], 2)).toBe(0)
})

test('a journey’s terrain comes from its route', () => {
  const travel: TravelState = {
    route: 'ashmoor-1-greenvale-2',
    from: 'greenvale-2',
    to: 'ashmoor-1',
    km: 75,
    kmPerDay: 18,
    kmDone: 0,
    daysDone: 0,
    days: 5,
    encounterDays: [],
    pace: 'steady',
    coverTracks: false,
    paceLog: [],
    forage: true,
  }
  expect(routeTerrain(content, travel)).toBe('marsh')
  expect(routeTerrain(content, { ...travel, route: 'gone' })).toBeNull()
})
