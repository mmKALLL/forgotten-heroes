import { describe, expect, test } from 'vitest'
import { newGame, step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { CAUTIOUS_HOSTILE_AVOIDANCE } from './pace'
import { SEA_PACE_NOTE, journeyInfo, placeInfo, routeOptions, suppliesInfo } from './preview'
import { encounterChance } from './routes'

const content = fixtureContent()

describe('placeInfo', () => {
  test('describes a settlement in this world', () => {
    const state = makeState()
    const s = state.world.settlements['ashmoor-1']
    const kingdom = state.world.kingdoms.find((k) => k.regions.includes('ashmoor'))!
    const info = placeInfo(state, content, 'ashmoor-1')!
    expect(info).toMatchObject({
      id: 'ashmoor-1',
      name: s.name,
      typeName: content.settlementTypes[s.type].name,
      population: s.population,
      regionName: 'Ashmoor',
      biome: 'marsh',
      kingdomName: kingdom.name,
      seat: kingdom.capital === 'ashmoor-1',
      coastal: true,
    })
    expect(info.services.map((x) => x.id)).toEqual(s.services)
    expect(placeInfo(state, content, 'atlantis')).toBeNull()
  })

  test('a settlement named after a town map has its banner', () => {
    const state = newGame(0, content)
    const id = Object.keys(state.world.settlements).find(
      (k) => state.world.settlements[k].town === 'harbourne'
    )!
    expect(placeInfo(state, content, id)!.banner).toBe(
      'town maps/Harbourne - rich seaside town - LN.jpg'
    )
  })
})

describe('routeOptions', () => {
  test('lists the roads from here with distance, days, danger, encounters and fares', () => {
    const options = routeOptions(makeState({ location: 'ashmoor-1', gold: 5 }), content)
    expect(options.map((o) => o.routeId)).toEqual([
      'ashmoor-1-farisle-1',
      'ashmoor-1-greenvale-1',
      'ashmoor-1-greenvale-2',
    ])
    expect(options[0]).toMatchObject({
      to: 'farisle-1',
      km: 160,
      days: 3,
      terrain: 'sea',
      fare: 12,
      encounters: [1, 3],
      available: false,
      reason: 'Passage costs 12 gp.',
    })
    expect(options[2]).toMatchObject({
      to: 'greenvale-2',
      days: 5,
      terrain: 'marsh',
      danger: 2,
      encounters: [2, 4],
      fare: 0,
      available: true,
      reason: null,
    })
  })

  test('each road shows every pace: days, food, water and encounters, and covering tracks', () => {
    const [road] = routeOptions(makeState({ location: 'greenvale-1' }), content).filter(
      (o) => o.routeId === 'greenvale-1-greenvale-2'
    )
    const chance = (pace: 'cautious' | 'steady' | 'brisk' | 'forced') =>
      encounterChance(0, road.threatLevel, pace)
    expect(road.paceNote).toBeNull()
    expect(road.paces).toEqual([
      {
        pace: 'cautious',
        coverTracks: false,
        days: 4,
        food: 8,
        water: 8,
        encounters: [1, 3],
        chance: chance('cautious'),
        hostileAvoided: CAUTIOUS_HOSTILE_AVOIDANCE,
        ambush: 'normal',
      },
      {
        pace: 'cautious',
        coverTracks: true,
        days: 5,
        food: 10,
        water: 10,
        encounters: [2, 4],
        chance: chance('cautious'),
        hostileAvoided: CAUTIOUS_HOSTILE_AVOIDANCE,
        ambush: 'edge',
      },
      {
        pace: 'steady',
        coverTracks: false,
        days: 3,
        food: 6,
        water: 6,
        encounters: [1, 3],
        chance: chance('steady'),
        hostileAvoided: 0,
        ambush: 'normal',
      },
      {
        pace: 'brisk',
        coverTracks: false,
        days: 2,
        food: 4,
        water: 4,
        encounters: [0, 2],
        chance: chance('brisk'),
        hostileAvoided: 0,
        ambush: 'exposed',
      },
      {
        pace: 'forced',
        coverTracks: false,
        days: 2,
        food: 6,
        water: 6,
        encounters: [0, 2],
        chance: chance('forced'),
        hostileAvoided: 0,
        ambush: 'exposed',
      },
    ])
  })

  test('at sea the ship sets the pace, and the preview says so', () => {
    const [sea] = routeOptions(makeState({ location: 'ashmoor-1' }), content)
    expect(sea.paceNote).toBe(SEA_PACE_NOTE)
    expect(sea.paces).toMatchObject([{ pace: 'steady', coverTracks: false, days: 3 }])
  })

  test('there are none while on the road', () => {
    const out = step(
      makeState({ location: 'greenvale-1' }),
      { type: 'travel', routeId: 'greenvale-1-greenvale-2' },
      content
    )
    expect(routeOptions(out, content)).toEqual([])
  })
})

describe('journeyInfo and suppliesInfo', () => {
  test('show the journey’s progress and how long the supplies last', () => {
    const state = makeState({ location: 'greenvale-1', goods: { food: 7, water: 8 } })
    expect(journeyInfo(state, content)).toBeNull()
    const out = step(
      state,
      { type: 'travel', routeId: 'greenvale-1-greenvale-2', pace: 'brisk' },
      content
    )
    expect(journeyInfo(out, content)).toMatchObject({
      from: 'greenvale-1',
      to: 'greenvale-2',
      km: 75,
      kmDone: 0,
      daysDone: 0,
      days: 2,
      terrain: 'plains',
      danger: 0,
      pace: 'brisk',
      coverTracks: false,
      canMove: true,
    })
    expect(suppliesInfo(state)).toEqual({
      food: 7,
      water: 8,
      waterCapacity: 8,
      foodDays: 3,
      waterDays: 4,
    })
    expect(suppliesInfo(state, 'desert').waterDays).toBe(2)
  })
})
