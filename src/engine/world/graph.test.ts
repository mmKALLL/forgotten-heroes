import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import type { PoiState } from '../../schema/world'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { placeOnRoute } from '../travel/journey'
import { routeOptions } from '../travel/preview'
import { goodsOf } from '../travel/supplies'
import { PATH_DETOUR, edgeById, edgesFrom, nodeOf, pathId, poiPaths } from './graph'
import { offRoadKm, territory } from './territory'

const content = fixtureContent()
const t = territory(content)

const poi = (spot: string, overrides: Partial<PoiState> = {}): PoiState => ({
  type: 'herbalist-hut',
  spot,
  domain: t.domainOf[spot],
  name: 'Old Wen’s hut',
  threat: 0,
  discovered: true,
  cleared: false,
  boonDay: null,
  ...overrides,
})

const withPois = (pois: Record<string, PoiState>, overrides: Partial<GameState> = {}) => {
  const state = makeState(overrides)
  return { ...state, world: { ...state.world, pois } }
}

describe('nodeOf', () => {
  test('settlements and POIs are map nodes with their domain and land', () => {
    const state = withPois({ 'poi-1': poi('spot-0010') })
    expect(nodeOf(state, content, 'ashmoor-1')).toEqual({
      id: 'ashmoor-1',
      kind: 'settlement',
      at: content.settlements['ashmoor-1'].at,
      domain: 'ashmoor-1',
      land: 'ashmoor',
      island: 'mainland',
    })
    expect(nodeOf(state, content, 'poi-1')).toEqual({
      id: 'poi-1',
      kind: 'poi',
      at: content.landSpots['spot-0010'].at,
      domain: t.domainOf['spot-0010'],
      land: content.settlements[t.domainOf['spot-0010']].region,
      island: 'mainland',
    })
    expect(nodeOf(state, content, 'atlantis')).toBeNull()
  })
})

describe('poiPaths', () => {
  test('a POI always has a path to its own settlement, over its spot’s terrain', () => {
    const state = withPois({ 'poi-1': poi('spot-0010') })
    const own = poiPaths(state, content, 'poi-1').find((p) => p.to === t.domainOf['spot-0010'])
    expect(own).toEqual({
      id: pathId('poi-1', t.domainOf['spot-0010']),
      from: 'poi-1',
      to: t.domainOf['spot-0010'],
      km: Math.max(1, Math.round(t.km['spot-0010'])),
      terrain: 'forest',
      danger: content.poiTypes['herbalist-hut'].pathDanger,
    })
  })

  test('a detour path joins any settlement on the island within PATH_DETOUR, and no farther', () => {
    let detours = 0
    let none = 0
    for (const spot of Object.values(content.landSpots)) {
      const state = withPois({ 'poi-1': poi(spot.id) })
      const paths = poiPaths(state, content, 'poi-1')
      const home = t.domainOf[spot.id]
      const ownKm = t.km[spot.id]
      const expected = Object.values(content.settlements)
        .filter((s) => s.island === spot.island && s.id !== home)
        .filter((s) => (offRoadKm(content, s.id)[spot.id] ?? Infinity) <= PATH_DETOUR * ownKm)
        .map((s) => s.id)
      expect(paths.map((p) => p.to).sort()).toEqual([home, ...expected].sort())
      expect(paths.map((p) => p.id)).toEqual(paths.map((p) => p.id).sort())
      if (expected.length > 0) detours++
      else none++
    }
    expect(detours).toBeGreaterThan(0)
    expect(none).toBeGreaterThan(0)
  })

  test('the detour rule is about km: at the midpoint both towns, near one town only that one', () => {
    // Two towns 400 px apart with three spots between them, as in the territory tests.
    const c = structuredClone(content)
    const base = { ...c.settlements['greenvale-2'], island: 'pair', capital: false, coastal: false }
    c.settlements['alpha-1'] = { ...base, id: 'alpha-1', at: { x: 100, y: 100 } }
    c.settlements['beta-1'] = { ...base, id: 'beta-1', at: { x: 500, y: 100 } }
    for (const [id, x] of [
      ['spot-a', 200],
      ['spot-m', 300],
      ['spot-b', 400],
    ] as const) {
      c.landSpots[id] = { id, at: { x, y: 100 }, island: 'pair', source: 'claude', file: 'test' }
    }
    const state = withPois({
      'poi-1': { ...poi('spot-m'), spot: 'spot-m', domain: 'alpha-1' },
      'poi-2': { ...poi('spot-a'), spot: 'spot-a', domain: 'alpha-1' },
    })
    expect(poiPaths(state, c, 'poi-1').map((p) => p.to)).toEqual(['alpha-1', 'beta-1'])
    expect(poiPaths(state, c, 'poi-2').map((p) => p.to)).toEqual(['alpha-1'])
  })
})

describe('edgesFrom', () => {
  const state = (discovered: boolean) =>
    withPois({ 'poi-1': poi('spot-0010', { discovered }) }, { location: 'ashmoor-1' })

  test('paths appear only once a POI is discovered', () => {
    const home = t.domainOf['spot-0010']
    const hidden = state(false)
    expect(edgesFrom(hidden, content, home).map((r) => r.id)).not.toContain(pathId('poi-1', home))
    expect(edgesFrom(hidden, content, 'poi-1')).toEqual([])
    expect(edgeById(hidden, content, pathId('poi-1', home))).toBeNull()
    const found = state(true)
    expect(edgesFrom(found, content, home).map((r) => r.id)).toContain(pathId('poi-1', home))
    expect(edgesFrom(found, content, 'poi-1')).toEqual(poiPaths(found, content, 'poi-1'))
    expect(edgeById(found, content, pathId('poi-1', home))).toEqual(
      poiPaths(found, content, 'poi-1').find((p) => p.to === home)
    )
  })

  test('content routes are listed as before, sorted by id', () => {
    const ids = edgesFrom(state(false), content, 'ashmoor-1').map((r) => r.id)
    expect(ids).toEqual(['ashmoor-1-farisle-1', 'ashmoor-1-greenvale-1', 'ashmoor-1-greenvale-2'])
    expect(edgeById(state(false), content, 'ashmoor-1-farisle-1')).toBe(
      content.routes['ashmoor-1-farisle-1']
    )
  })
})

describe('travelling to and from a POI', () => {
  // spot-0010 is forest near Ashmoor 1; the herbalist has a spring, the war camp doesn't.
  const home = t.domainOf['spot-0010']
  const start = (type = 'herbalist-hut', overrides: Partial<GameState> = {}) =>
    withPois(
      { 'poi-1': poi('spot-0010', { type, threat: type === 'orc-war-camp' ? 1 : 0 }) },
      { location: home, ...overrides }
    )

  /** Walks the path from the POI's settlement to it, closing any encounter on the way. */
  function walk(state: GameState): GameState {
    let next = step(state, { type: 'travel', routeId: pathId('poi-1', home) }, content)
    for (let guard = 0; next.travel && guard < 20; guard++) {
      next = next.encounter
        ? step(next, { type: 'closeEncounter' }, content)
        : step(next, { type: 'continueJourney' }, content)
    }
    return next
  }

  test('a journey to a POI arrives there, and meets encounters in its domain', () => {
    const state = start()
    const out = step(state, { type: 'travel', routeId: pathId('poi-1', home) }, content)
    expect(out.travel).toMatchObject({ from: home, to: 'poi-1' })
    expect(out.log.at(-1)!.text).toContain('Old Wen’s hut')
    const near = placeOnRoute(out, content, { ...out.travel!, kmDone: out.travel!.km })
    expect(near).toMatchObject({ biome: 'forest', domain: home, land: 'ashmoor' })
    const arrived = walk(state)
    expect(arrived.location).toBe('poi-1')
    expect(arrived.travel).toBeNull()
  })

  test('water refills at a POI only when its type has a spring or well', () => {
    const thirsty = { goods: { food: 20, water: 0 } }
    expect(goodsOf(walk(start('herbalist-hut', thirsty)).goods, 'water')).toBeGreaterThan(0)
    const camp = walk(start('orc-war-camp', thirsty))
    expect(camp.location).toBe('poi-1')
    expect(camp.log.some((e) => e.text.startsWith('Arrived') && e.text.includes('refilled'))).toBe(
      false
    )
  })

  test('rest at a POI is camp-only, and nothing can be bought or sold there', () => {
    const there = start('herbalist-hut', { location: 'poi-1', gold: 50 })
    const rested = step(there, { type: 'rest' }, content)
    expect(rested.gold).toBe(50)
    expect(rested.log.at(-1)!.text).toBe('The party makes camp and rests a day.')
    for (const action of [
      { type: 'buyFood', amount: 2 },
      { type: 'buyWaterskin' },
      { type: 'sellSupplies', food: 1 },
    ] as const) {
      const refused = step(there, action, content)
      expect(refused.gold).toBe(50)
      expect(refused.log.at(-1)!.text).toMatch(/^Not here/)
    }
  })

  test('leaving a POI lists all of its paths, and the party can set out on them', () => {
    const there = start('herbalist-hut', { location: 'poi-1' })
    const options = routeOptions(there, content)
    expect(options.map((o) => o.routeId)).toEqual(
      poiPaths(there, content, 'poi-1').map((p) => p.id)
    )
    const out = step(there, { type: 'travel', routeId: options[0].routeId }, content)
    expect(out.travel).toMatchObject({ from: 'poi-1', to: options[0].to })
  })
})
