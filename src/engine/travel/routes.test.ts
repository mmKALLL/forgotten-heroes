import { describe, expect, test } from 'vitest'
import type { TravelState } from '../../schema/state'
import { createRng, withRng } from '../rng'
import { fixtureContent, makeState } from '../test-fixtures'
import { domainThreatLevel } from '../world/pois'
import { paceHostileAvoidance } from './pace'
import {
  canMeetEncounters,
  encounterRange,
  fareFor,
  hostileShare,
  journeyDays,
  kmPerDay,
  rollEncounterDays,
  routeTerrain,
  routeThreat,
} from './routes'
import { ENCOUNTER_SLOT_CHANCE, REINHABIT_DAYS } from '../constants'

const content = fixtureContent()

test('speed depends on the terrain', () => {
  expect(kmPerDay('plains')).toBe(30)
  expect(kmPerDay('marsh')).toBe(18)
  expect(kmPerDay('mountains')).toBe(15)
  expect(kmPerDay('sea')).toBe(40)
})

test('journeys take whole days, at least one', () => {
  expect(journeyDays({ km: 75, terrain: 'plains' })).toBe(3)
  expect(journeyDays({ km: 75, terrain: 'marsh' })).toBe(5)
  expect(journeyDays({ km: 10, terrain: 'plains' })).toBe(1)
  expect(journeyDays({ km: 160, terrain: 'sea' })).toBe(4)
})

describe('pace', () => {
  test('stealthy is ½ speed, brisk 1.25× and a forced march 1.5×', () => {
    expect(kmPerDay('plains', 'stealthy')).toBeCloseTo(15)
    expect(kmPerDay('plains', 'steady')).toBe(30)
    expect(kmPerDay('plains', 'brisk')).toBeCloseTo(37.5)
    expect(kmPerDay('plains', 'forced')).toBeCloseTo(45)
  })

  test('the journey takes days by pace', () => {
    const plains = { km: 75, terrain: 'plains' as const }
    expect(journeyDays(plains, 'stealthy')).toBe(5)
    expect(journeyDays(plains, 'steady')).toBe(3)
    expect(journeyDays(plains, 'brisk')).toBe(2)
    expect(journeyDays(plains, 'forced')).toBe(2)
  })

  test('a ship sails at its own speed, whatever the pace', () => {
    for (const pace of ['stealthy', 'brisk', 'forced'] as const) {
      expect(kmPerDay('sea', pace)).toBe(40)
      expect(journeyDays({ km: 160, terrain: 'sea' }, pace)).toBe(4)
    }
  })

  test('brisk and forced make encounters likelier to be hostile; stealthy avoids some', () => {
    expect(hostileShare(0, 0, 'steady')).toMatchObject({ drawn: 0.1, share: 0.1, avoided: 0 })
    for (const pace of ['stealthy'] as const) {
      const h = hostileShare(0, 0, pace)
      expect(h.drawn).toBeCloseTo(0.1)
      expect(h.share).toBeCloseTo(0.1 * (1 - paceHostileAvoidance(pace)))
      expect(h.share - h.drawn).toBeCloseTo(h.avoided)
      expect(h.avoided).toBeLessThan(0)
    }
    expect(hostileShare(0, 0, 'brisk').share).toBeCloseTo(0.2)
    expect(hostileShare(0, 0, 'forced')).toMatchObject({ pace: 0.1 })
  })

  test('the encounter budget still follows the journey’s days', () => {
    const plains = { km: 75, terrain: 'plains' as const }
    expect(encounterRange(journeyDays(plains, 'stealthy'))).toEqual([2, 4])
    expect(encounterRange(journeyDays(plains, 'brisk'))).toEqual([0, 2])
  })
})

test('short hops get 0–2 encounters, middling journeys 1–3, long ones 2–4, at most one a day', () => {
  expect([1, 2, 3, 4, 5, 9].map(encounterRange)).toEqual([
    [0, 1],
    [0, 2],
    [1, 3],
    [1, 3],
    [2, 4],
    [2, 4],
  ])
})

test('every slot fills with the same chance, whatever the road', () => {
  expect(ENCOUNTER_SLOT_CHANCE).toBe(0.3)
})

describe('hostileShare', () => {
  test('danger, threat, foraging and a hurried pace each make encounters likelier hostile', () => {
    expect(hostileShare(0, 0)).toEqual({
      share: 0.1,
      drawn: 0.1,
      avoided: 0,
      base: 0.1,
      danger: 0,
      threat: 0,
      forage: 0,
      pace: 0,
      wealth: 0,
      escort: 0,
    })
    const share = hostileShare(2, 1, 'brisk', true)
    expect(share).toMatchObject({ danger: 0.2, threat: 0.1, forage: 0.1, pace: 0.1 })
    expect(share.share).toBeCloseTo(0.6)
  })

  test('stays within 10–85% before the pace’s avoidance', () => {
    expect(hostileShare(-3, 0, 'stealthy').drawn).toBe(0.1)
    expect(hostileShare(3, 3, 'forced', true).share).toBe(0.85)
    expect(hostileShare(-3, 0).share).toBe(0.1)
  })
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

  test('at most one encounter a day, so never more than the journey’s days', () => {
    for (let seed = 0; seed < 300; seed++) {
      const days = roll(seed, 5, [2, 4], 0.5)
      expect(new Set(days).size).toBe(days.length)
      expect(roll(seed, 2, [2, 4], 1)).toEqual([1, 2])
      expect(roll(seed, 1, [0, 2], 1)).toEqual([1])
    }
  })
})

test('a route’s threat is the higher threat level of the domains at its two ends', () => {
  const state = makeState()
  const world = structuredClone(state.world)
  world.lands.greenvale.threatStrength = 2
  world.lands.ashmoor.threatStrength = 2
  for (const d of Object.values(world.domains)) d.garrison = 1
  // Both lairs taken again on day 1 (cleared REINHABIT_DAYS before).
  const lair = {
    type: 'orc-war-camp',
    category: 'lair' as const,
    domain: 'ashmoor-1',
    name: 'Redtusk camp',
    threat: 2,
    discovered: false,
    clearedDay: 1 - REINHABIT_DAYS,
    boonDay: null,
  }
  world.pois = {
    'poi-1': { ...lair, spot: 'spot-0009' },
    'poi-2': { ...lair, spot: 'spot-0005', domain: 'greenvale-2', clearedDay: 1 },
  }
  const route = content.routes['ashmoor-1-greenvale-2']
  // Ashmoor's lair raises it to 3; Greenvale 2's lair lies empty, so it stays at 1.
  expect(domainThreatLevel(world, 'ashmoor-1', state.day)).toBe(3)
  expect(domainThreatLevel(world, 'greenvale-2', state.day)).toBe(1)
  expect(routeThreat({ ...state, world }, content, route)).toBe(3)
  world.pois['poi-1'].clearedDay = state.day
  expect(routeThreat({ ...state, world }, content, route)).toBe(1)
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
  expect(fareFor(content.routes['ashmoor-1-farisle-1'], 2)).toBe(16)
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
    paceLog: [],
    forage: true,
    hired: null,
  }
  expect(routeTerrain(makeState(), content, travel)).toBe('marsh')
  expect(routeTerrain(makeState(), content, { ...travel, route: 'gone' })).toBeNull()
})
