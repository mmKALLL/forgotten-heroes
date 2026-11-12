import { describe, expect, test } from 'vitest'
import { newGame, step } from '../state'
import { brom, fixtureContent, lyra, makeState } from '../test-fixtures'
import { CAUTIOUS_HOSTILE_AVOIDANCE } from './pace'
import {
  SEA_PACE_NOTE,
  journeyInfo,
  placeInfo,
  poiInfo,
  roadReasonText,
  routeOptions,
  suppliesInfo,
} from './preview'
import { tierOdds } from '../rules/checks'
import type { GameState } from '../../schema/state'
import type { PoiState } from '../../schema/world'
import { FORAGE_DC, WATERSKIN_WATER } from './tuning'
import { FORCED_MARCH_DC } from './pace'
import { isSevere, warningText } from './warnings'
import { encounterChance } from './routes'
import { domainThreatLevel } from '../world/pois'

const content = fixtureContent()

describe('placeInfo', () => {
  test('describes a settlement in this world', () => {
    const state = makeState()
    const s = state.world.settlements['ashmoor-1']
    const kingdom = state.world.kingdoms.find((k) => k.domains.includes('ashmoor-1'))!
    const info = placeInfo(state, content, 'ashmoor-1')!
    expect(info).toMatchObject({
      id: 'ashmoor-1',
      name: s.name,
      typeName: content.settlementTypes[s.type].name,
      population: s.population,
      landName: 'Ashmoor',
      biome: 'marsh',
      domainId: 'ashmoor-1',
      domainName: s.name,
      lairThreat: 0,
      kingdomName: kingdom.name,
      seat: kingdom.seat === 'ashmoor-1',
      threatName: content.threats[state.world.lands.ashmoor.threat].name,
      threatLevel: domainThreatLevel(state.world, 'ashmoor-1'),
      coastal: true,
    })
    expect(info.services.map((x) => x.id)).toEqual(s.services)
    expect(placeInfo(state, content, 'atlantis')).toBeNull()
  })

  test('notes the threat of the lairs the party has found in the domain', () => {
    const base = makeState()
    const pois = {
      ...base.world.pois,
      'poi-9': {
        type: 'orc-war-camp',
        spot: 'spot-0009',
        domain: 'ashmoor-1',
        name: 'Bonepile camp',
        threat: 2,
        discovered: false,
        cleared: false,
      },
    }
    const hidden = { ...base, world: { ...base.world, pois } }
    expect(placeInfo(hidden, content, 'ashmoor-1')!.lairThreat).toBe(0)
    const found = structuredClone(hidden)
    found.world.pois['poi-9'].discovered = true
    expect(placeInfo(found, content, 'ashmoor-1')!.lairThreat).toBe(2)
    // Hidden or not, the lair is in the level.
    expect(placeInfo(hidden, content, 'ashmoor-1')!.threatLevel).toBe(
      placeInfo(found, content, 'ashmoor-1')!.threatLevel
    )
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

describe('poiInfo', () => {
  const withPoi = (overrides: Partial<PoiState>) => {
    const state = makeState()
    state.world.pois['poi-9'] = {
      type: 'orc-war-camp',
      spot: 'spot-0009',
      domain: 'ashmoor-1',
      name: 'Bonepile camp',
      threat: 2,
      discovered: true,
      cleared: false,
      ...overrides,
    }
    return state
  }

  test('describes a discovered site: type, owner, threat and water', () => {
    const state = withPoi({})
    const kingdom = state.world.kingdoms.find((k) => k.domains.includes('ashmoor-1'))!
    expect(poiInfo(state, content, 'poi-9')).toEqual({
      id: 'poi-9',
      name: 'Bonepile camp',
      category: 'lair',
      typeName: 'War camp',
      domainId: 'ashmoor-1',
      domainName: state.world.settlements['ashmoor-1'].name,
      kingdomName: kingdom.name,
      landName: 'Ashmoor',
      hostile: true,
      threat: 2,
      threatName: content.threats[state.world.lands.ashmoor.threat].name,
      cleared: false,
      water: false,
    })
    const hut = withPoi({ type: 'herbalist-hut', threat: 0 })
    expect(poiInfo(hut, content, 'poi-9')).toMatchObject({
      category: 'expert',
      hostile: false,
      threat: 0,
      water: true,
    })
  })

  test('a cleared lair adds nothing; an undiscovered or unknown site is not described', () => {
    expect(poiInfo(withPoi({ cleared: true }), content, 'poi-9')).toMatchObject({
      cleared: true,
      threat: 0,
    })
    expect(poiInfo(withPoi({ discovered: false }), content, 'poi-9')).toBeNull()
    expect(poiInfo(makeState(), content, 'ashmoor-1')).toBeNull()
    expect(poiInfo(makeState(), content, 'poi-404')).toBeNull()
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
      encounters: [0, 0],
      available: false,
      reason: { code: 'fare', params: { gold: 12 } },
    })
    expect(roadReasonText(options[0].reason!)).toBe('Passage costs 12 gp.')
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
    expect(
      road.paces.map((p) => [
        p.pace,
        p.coverTracks,
        p.days,
        p.food.needed,
        p.water.needed,
        p.encounters,
        p.chance,
        p.hostileAvoided,
        p.ambush,
      ])
    ).toEqual([
      [
        'cautious',
        false,
        4,
        8,
        8,
        [1, 3],
        chance('cautious'),
        CAUTIOUS_HOSTILE_AVOIDANCE,
        'normal',
      ],
      ['cautious', true, 5, 10, 10, [2, 4], chance('cautious'), CAUTIOUS_HOSTILE_AVOIDANCE, 'edge'],
      ['steady', false, 3, 6, 6, [1, 3], chance('steady'), 0, 'normal'],
      ['brisk', false, 2, 4, 4, [0, 2], chance('brisk'), 0, 'exposed'],
      ['forced', false, 2, 6, 6, [0, 2], chance('forced'), 0, 'exposed'],
    ])
  })

  test('a road where nothing can be met promises no encounters', () => {
    const here = makeState({ location: 'ashmoor-1', gold: 20 })
    const [sea] = routeOptions(here, content)
    expect(sea).toMatchObject({ terrain: 'sea', encounters: [0, 0], chance: 0 })
    expect(sea.paces.map((p) => [p.encounters, p.chance])).toEqual([[[0, 0], 0]])
    const salty = structuredClone(content)
    salty.situations.cliff.biomes = ['sea']
    const [shipped] = routeOptions(here, salty)
    expect(shipped).toMatchObject({
      encounters: [1, 3],
      chance: encounterChance(1, sea.threatLevel),
    })
    expect(shipped.paces[0].encounters).toEqual([1, 3])
  })

  test('at sea the ship sets the pace, and the preview says so', () => {
    const [sea] = routeOptions(makeState({ location: 'ashmoor-1' }), content)
    expect(sea.paceNote).toBe(SEA_PACE_NOTE)
    expect(sea.paces).toMatchObject([{ pace: 'steady', coverTracks: false, days: 3 }])
  })

  test('says why a road can’t be taken: an open encounter, no one fit, or the fare', () => {
    const busy = step(
      makeState({ location: 'greenvale-1' }),
      { type: 'startEncounter', situationId: 'cliff' },
      content
    )
    const [first] = routeOptions(busy, content)
    expect(first.reason).toEqual({ code: 'busy' })
    expect(roadReasonText(first.reason!)).toBe('Finish the current encounter first.')
    const down = makeState({ location: 'greenvale-1', party: [{ ...brom, hp: 0 }] })
    expect(routeOptions(down, content)[0].reason).toEqual({ code: 'unfit' })
    expect(roadReasonText({ code: 'unfit' })).toBe('No one is fit to travel.')
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

describe('supply forecasts and warnings', () => {
  const road = (overrides: Partial<GameState> = {}, forage?: boolean) =>
    routeOptions(makeState({ location: 'greenvale-1', ...overrides }), content, forage).find(
      (o) => o.routeId === 'greenvale-1-greenvale-2'
    )!
  const at = (pace: string, overrides: Partial<GameState> = {}, forage?: boolean) =>
    road(overrides, forage).paces.find((p) => p.pace === pace && !p.coverTracks)!

  test('each pace shows water and food needed, carried and expected from foraging', () => {
    const steady = at('steady')
    // Brom (Survival +1) forages the plains at DC 10: 60% a day of water (5% with food), 15% half.
    expect(steady.forage).toMatchObject({ actorId: 'brom', dc: FORAGE_DC.plains, modifier: 1 })
    expect(steady.forage!.odds).toEqual(tierOdds(1, FORAGE_DC.plains))
    expect(steady.water).toMatchObject({
      needed: 6,
      carried: 8,
      capacity: 8,
      shortfallDays: 0,
      runsOutOnDay: null,
    })
    expect(steady.water.expectedForage).toBeCloseTo(0.6 * 2 + 0.15 * 1, 12)
    expect(steady.food).toMatchObject({ needed: 6, carried: 10, shortfallDays: 0 })
    expect(steady.food.expectedForage).toBeCloseTo(0.05 * 2, 12)
    expect(steady.warnings).toEqual([])
    // The forced march looks with less care.
    expect(at('forced').water.expectedForage).toBeCloseTo(0.5 * 2 + 0.15 * 1, 12)
  })

  test('warns when the water lasts only with foraging, and when the food runs out', () => {
    const lean = at('steady', { goods: { food: 2, water: 2 } })
    expect(lean.water.shortfallDays).toBe(0)
    expect(lean.warnings).toEqual([
      { code: 'waterReliesOnForaging', params: { day: 2 } },
      {
        code: 'foodRunsOut',
        params: { day: 2, shortfallDays: 2, missing: 4, withForaging: true },
      },
    ])
    expect(lean.warnings.map(warningText)).toEqual([
      'The water lasts only if foraging goes well: it runs out on day 2 without.',
      'Not enough food for the journey: it runs out on day 2 (4 rations short).',
    ])
  })

  test('without foraging the same journey runs dry', () => {
    const dry = at('steady', { goods: { food: 10, water: 2 } }, false)
    expect(dry.forage).toBeNull()
    expect(dry.water.expectedForage).toBe(0)
    expect(dry.warnings).toEqual([
      { code: 'waterRunsOut', params: { day: 2, shortfallDays: 2, withForaging: false } },
    ])
    expect(warningText(dry.warnings[0])).toBe('Water runs out on day 2 (2 days without).')
  })

  test('water that runs out even with foraging, and a forced march’s toll', () => {
    const forced = at('forced', { goods: { food: 10, water: 0 } })
    expect(forced.warnings).toEqual([
      { code: 'waterRunsOut', params: { day: 1, shortfallDays: 2, withForaging: true } },
      {
        code: 'forcedMarchExhaustion',
        // Lyra (CON +1) fails DC 12 half the time; Brom (CON +2) 45%.
        // Each level is −2 to the next day's check: 0.5 + (0.5 × 0.5 + 0.5 × 0.6) = 1.05.
        params: {
          days: 2,
          dc: FORCED_MARCH_DC,
          characterId: 'lyra',
          name: 'Lyra',
          expectedLevels: expect.closeTo(1.05, 12),
        },
      },
    ])
    expect(forced.warnings.map(warningText)).toEqual([
      'Water runs out on day 1 even with foraging (2 days without).',
      expect.stringMatching(
        /^A forced march of 2 days \(CON DC 12 each day\) will likely exhaust Lyra: about 1\.\d levels\.$/
      ),
    ])
  })

  test('a forced march that could kill someone gets a severe warning', () => {
    // 180 km of plains is 4 days of forced march. At CON 1 and already two levels down, only a
    // natural 20 holds up: 95% a day, so 0.95⁴ to reach the sixth level.
    const long = structuredClone(content)
    long.routes['greenvale-1-greenvale-2'].km = 180
    const frail = { ...lyra, exhaustion: 2, abilities: { ...lyra.abilities, con: 1 } }
    const state = makeState({ location: 'greenvale-1', party: [brom, frail] })
    const forced = routeOptions(state, long)
      .find((o) => o.routeId === 'greenvale-1-greenvale-2')!
      .paces.find((p) => p.pace === 'forced')!
    expect(forced.days).toBe(4)
    const deadly = forced.warnings.find((w) => w.code === 'forcedMarchDeadly')
    expect(deadly).toEqual({
      code: 'forcedMarchDeadly',
      params: {
        days: 4,
        dc: FORCED_MARCH_DC,
        characterId: 'lyra',
        name: 'Lyra',
        chance: expect.closeTo(0.95 ** 4, 12),
      },
    })
    expect(isSevere(deadly!)).toBe(true)
    // The severe warning replaces the ordinary one for the same member.
    expect(
      forced.warnings.filter(
        (w) => w.code === 'forcedMarchExhaustion' && w.params.characterId === 'lyra'
      )
    ).toEqual([])
    expect(warningText(deadly!)).toBe(
      'A forced march of 4 days could kill Lyra (81% chance of reaching the sixth level of exhaustion).'
    )
    // A short march, or a hardier party, carries no such risk.
    expect(at('forced').warnings.some((w) => w.code === 'forcedMarchDeadly')).toBe(false)
    const hardy = routeOptions(makeState({ location: 'greenvale-1' }), long)
      .find((o) => o.routeId === 'greenvale-1-greenvale-2')!
      .paces.find((p) => p.pace === 'forced')!
    expect(hardy.warnings.some((w) => w.code === 'forcedMarchDeadly')).toBe(false)
  })

  test('extra waterskins raise the capacity', () => {
    expect(at('steady', { waterskins: 2 }).water.capacity).toBe(8 + 2 * WATERSKIN_WATER)
  })

  test('a ship the party can’t pay for offers stowing away, with the odds', () => {
    const [sea, ...land] = routeOptions(makeState({ location: 'ashmoor-1', gold: 5 }), content)
    // Lyra (DEX 14) is stealthier than Brom.
    expect(sea.stowaway).toEqual({
      actorId: 'lyra',
      skill: 'stealth',
      dc: 13,
      modifier: 2,
      odds: tierOdds(2, 13),
      outcomes: {
        critSuccess: { code: 'unseen' },
        success: { code: 'unseen' },
        partial: { code: 'worked', params: { days: 2, exhaustion: 1 } },
        fail: { code: 'fined', params: { gold: 5 } },
        critFail: { code: 'brawl' },
      },
    })
    // With no coin for a fine, a failure means work too.
    const [broke] = routeOptions(makeState({ location: 'ashmoor-1', gold: 0 }), content)
    expect(broke.stowaway!.outcomes.fail).toEqual({
      code: 'worked',
      params: { days: 2, exhaustion: 1 },
    })
    expect(sea.paces[0].forage).toBeNull()
    for (const o of land) expect(o.stowaway).toBeNull()
    const [paid] = routeOptions(makeState({ location: 'ashmoor-1', gold: 20 }), content)
    expect(paid.stowaway).toBeNull()
  })
})
