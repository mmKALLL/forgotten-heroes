import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { PoiStateSchema, type LandState, type PoiState } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { straightKm } from './geo'
import {
  POI_MAX_PER_DOMAIN,
  POI_MIN_KM,
  domainThreatLevel,
  domainThreatStrength,
  generatePois,
  knownLairThreat,
  poisPerDomain,
  type PoiWorld,
} from './pois'
import { territory } from './territory'

const content = fixtureContent()
const LANDS: Record<string, LandState> = {
  greenvale: { threat: 'bandits', threatStrength: 2 },
  ashmoor: { threat: 'bog-cult', threatStrength: 3 },
  farisle: { threat: 'bandits', threatStrength: 1 },
}
/** Dense enough that every fixture domain draws its most POIs. */
const DENSE = { spotsEach: 1 }

const pois = (
  seed: number,
  c: Content = content,
  lands: Record<string, LandState> = LANDS,
  options = DENSE
) => withRng(createRng(seed), (d) => generatePois(d, c, territory(c), lands, options))[0]

describe('generatePois', () => {
  test('is seeded, schema-valid and numbered in generation order', () => {
    const a = pois(5)
    expect(pois(5)).toEqual(a)
    expect(Object.keys(a)).toEqual(Object.keys(a).map((_, i) => `poi-${i + 1}`))
    for (const poi of Object.values(a)) expect(PoiStateSchema.parse(poi)).toEqual(poi)
    expect(Object.values(a).map((p) => p.domain)).toEqual(
      Object.values(a)
        .map((p) => p.domain)
        .sort()
    )
  })

  test('everything starts hidden and uncleared; only hostile sites carry a threat', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const poi of Object.values(pois(seed))) {
        expect(poi.discovered).toBe(false)
        expect(poi.cleared).toBe(false)
        const type = content.poiTypes[poi.type]
        if (type.hostile) {
          expect(poi.threat).toBeGreaterThanOrEqual(type.threat!.min)
          expect(poi.threat).toBeLessThanOrEqual(type.threat!.max)
        } else expect(poi.threat).toBe(0)
      }
    }
  })

  test('every POI stands on a spot of its own domain, apart from the others', () => {
    const t = territory(content)
    for (let seed = 0; seed < 30; seed++) {
      const placed = Object.values(pois(seed))
      for (const poi of placed) {
        expect(t.domainOf[poi.spot]).toBe(poi.domain)
        const at = content.landSpots[poi.spot].at
        expect(straightKm(at, content.settlements[poi.domain].at)).toBeGreaterThanOrEqual(
          POI_MIN_KM
        )
      }
      for (const a of placed) {
        for (const b of placed) {
          if (a === b) continue
          const km = straightKm(content.landSpots[a.spot].at, content.landSpots[b.spot].at)
          expect(km).toBeGreaterThanOrEqual(POI_MIN_KM)
        }
      }
      const perDomain = new Map<string, number>()
      for (const p of placed) perDomain.set(p.domain, (perDomain.get(p.domain) ?? 0) + 1)
      for (const n of perDomain.values()) expect(n).toBeLessThanOrEqual(POI_MAX_PER_DOMAIN)
    }
  })

  test('a domain whose territory is a single spot gets at most one POI', () => {
    const c = structuredClone(content)
    for (const id of ['spot-0014', 'spot-0015', 'spot-0016']) delete c.landSpots[id]
    expect(territory(c).spots['farisle-1']).toEqual(['spot-0013'])
    for (let seed = 0; seed < 30; seed++) {
      const onIsle = Object.values(pois(seed, c)).filter((p) => p.domain === 'farisle-1')
      expect(onIsle.length).toBeLessThanOrEqual(1)
    }
  })

  test('names come from the type’s parts table, with {threat} and {land} filled', () => {
    const c = structuredClone(content)
    c.partsTables['poi-name-camp'].rows = [{ text: '{Land} {threat} camp', weight: 1 }]
    for (const type of Object.values(c.poiTypes)) type.names = 'poi-name-camp'
    const placed = Object.values(pois(2, c))
    expect(placed.length).toBeGreaterThan(0)
    for (const poi of placed) {
      const land = c.settlements[poi.domain].region
      const threat = c.threats[LANDS[land].threat].name
      expect(poi.name).toBe(`${c.regions[land].name} ${threat} camp`)
    }
  })

  test('names avoid the world’s used names and each other while the table allows', () => {
    const c = structuredClone(content)
    const rows = Array.from({ length: 40 }, (_, i) => ({ text: `Site ${i}`, weight: 1 }))
    c.partsTables['poi-name-camp'].rows = rows
    for (const type of Object.values(c.poiTypes)) type.names = 'poi-name-camp'
    for (let seed = 0; seed < 20; seed++) {
      const usedNames = new Set(['Site 0', 'Site 1', 'Site 2'])
      const placed = Object.values(
        withRng(createRng(seed), (d) =>
          generatePois(d, c, territory(c), LANDS, { ...DENSE, usedNames })
        )[0]
      )
      const names = placed.map((p) => p.name)
      expect(new Set(names).size).toBe(names.length)
      for (const name of names) expect(['Site 0', 'Site 1', 'Site 2']).not.toContain(name)
      for (const name of names) expect(usedNames).toContain(name)
    }
  })

  test('a lair tagged with the land’s threat is drawn far more often than an untagged one', () => {
    const c = structuredClone(content)
    c.poiTypes = {
      'orc-war-camp': { ...c.poiTypes['orc-war-camp'], biomes: [], weight: 1 },
      'bandit-camp': {
        ...c.poiTypes['orc-war-camp'],
        id: 'bandit-camp',
        biomes: [],
        threats: [],
        weight: 1,
      },
    }
    const orcs: Record<string, LandState> = Object.fromEntries(
      Object.keys(LANDS).map((id) => [id, { threat: 'orc-warband', threatStrength: 3 }])
    )
    let tagged = 0
    let untagged = 0
    for (let seed = 0; seed < 200; seed++) {
      for (const poi of Object.values(pois(seed, c, orcs))) {
        if (poi.type === 'orc-war-camp') tagged++
        else untagged++
      }
    }
    expect(tagged / untagged).toBeGreaterThan(2)
  })

  test('a lair keyed to threats is only drawn where one of them holds the land', () => {
    const c = structuredClone(content)
    const camp = c.poiTypes['orc-war-camp']
    c.poiTypes = {
      'orc-war-camp': {
        ...camp,
        biomes: ['hills', 'jungle', 'marsh', 'plains'],
        threats: ['orc-warband'],
        weight: 5,
      },
      // other kinds of site keep threats as a mere favour
      'orc-shrine': { ...camp, id: 'orc-shrine', category: 'shrine', hostile: false },
      plain: { ...c.poiTypes['singing-stones'], id: 'plain', weight: 1 },
    }
    delete c.poiTypes['orc-shrine'].threat
    const mixed: Record<string, LandState> = {
      ...LANDS,
      greenvale: { threat: 'orc-warband', threatStrength: 2 },
    }
    const types = new Map<string, Set<string>>()
    for (let seed = 0; seed < 100; seed++) {
      for (const poi of Object.values(pois(seed, c, mixed))) {
        const land = c.settlements[poi.domain].region
        types.set(land, (types.get(land) ?? new Set()).add(poi.type))
      }
    }
    expect(types.get('greenvale')).toContain('orc-war-camp')
    expect(types.get('ashmoor')).not.toContain('orc-war-camp')
    expect(types.get('farisle')).not.toContain('orc-war-camp')
    expect(types.get('ashmoor')).toContain('orc-shrine')
  })

  test('a type favoured by the spot’s terrain is drawn more often', () => {
    const c = structuredClone(content)
    c.poiTypes = {
      'hill-fort': {
        ...c.poiTypes['singing-stones'],
        id: 'hill-fort',
        biomes: ['hills'],
        weight: 1,
      },
      plain: { ...c.poiTypes['singing-stones'], id: 'plain', biomes: [], weight: 1 },
    }
    let onHills = 0
    let hillForts = 0
    for (let seed = 0; seed < 200; seed++) {
      for (const poi of Object.values(pois(seed, c))) {
        if (c.landSpots[poi.spot].terrain !== 'hills') continue
        onHills++
        if (poi.type === 'hill-fort') hillForts++
      }
    }
    expect(hillForts / onHills).toBeGreaterThan(0.65)
  })

  test('content without POI types or spots places nothing', () => {
    const none = structuredClone(content)
    none.poiTypes = {}
    expect(pois(1, none)).toEqual({})
    const bare = structuredClone(content)
    bare.landSpots = {}
    expect(pois(1, bare)).toEqual({})
  })
})

describe('poisPerDomain', () => {
  test('is 0 to POI_MAX_PER_DOMAIN, and grows with the territory', () => {
    const mean = (spots: number) => {
      let sum = 0
      for (let seed = 0; seed < 400; seed++) {
        const n = withRng(createRng(seed), (d) => poisPerDomain(d, spots))[0]
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(POI_MAX_PER_DOMAIN)
        sum += n
      }
      return sum / 400
    }
    expect(mean(0)).toBe(0)
    expect(mean(3)).toBeLessThan(mean(15))
    expect(mean(15)).toBeLessThan(mean(40))
    expect(mean(200)).toBe(POI_MAX_PER_DOMAIN)
  })
})

describe('domain threat', () => {
  const world = (pois: Record<string, PoiState>): PoiWorld => ({
    lands: { ashmoor: { threat: 'bog-cult', threatStrength: 3 } },
    domains: { 'ashmoor-1': { kingdom: 'kingdom-1', land: 'ashmoor', garrison: 1 } },
    pois,
  })
  const poi = (overrides: Partial<PoiState>): PoiState => ({
    type: 'orc-war-camp',
    spot: 'spot-0009',
    domain: 'ashmoor-1',
    name: 'Redtusk camp',
    threat: 1,
    discovered: false,
    cleared: false,
    boonDay: null,
    ...overrides,
  })

  test('is the land’s strength plus its uncleared lairs, against the garrison', () => {
    const calm = world({})
    expect(domainThreatStrength(calm, 'ashmoor-1')).toBe(3)
    expect(domainThreatLevel(calm, 'ashmoor-1')).toBe(2)
    const lair = world({ 'poi-1': poi({}) })
    expect(domainThreatStrength(lair, 'ashmoor-1')).toBe(4)
    expect(domainThreatLevel(lair, 'ashmoor-1')).toBe(3)
  })

  test('drops once a hostile POI is cleared, and ignores non-hostile ones', () => {
    const cleared = world({ 'poi-1': poi({ cleared: true }) })
    expect(domainThreatLevel(cleared, 'ashmoor-1')).toBe(2)
    const hut = world({ 'poi-1': poi({ type: 'herbalist-hut', threat: 0 }) })
    expect(domainThreatLevel(hut, 'ashmoor-1')).toBe(2)
    // A lair elsewhere doesn't count here.
    const away = world({ 'poi-1': poi({ domain: 'greenvale-1' }) })
    expect(domainThreatLevel(away, 'ashmoor-1')).toBe(2)
  })

  test('the known lair threat counts only discovered, uncleared hostile POIs in the domain', () => {
    expect(knownLairThreat(world({ 'poi-1': poi({ threat: 2 }) }), 'ashmoor-1')).toBe(0)
    const found = world({
      'poi-1': poi({ threat: 2, discovered: true }),
      'poi-2': poi({ threat: 1, discovered: true, cleared: true }),
      'poi-3': poi({ threat: 1, discovered: true, domain: 'greenvale-1' }),
      'poi-4': poi({ threat: 1 }),
    })
    expect(knownLairThreat(found, 'ashmoor-1')).toBe(2)
    expect(knownLairThreat(found, 'atlantis')).toBe(0)
  })

  test('an unknown domain has no threat', () => {
    expect(domainThreatLevel(world({}), 'atlantis')).toBe(0)
    expect(domainThreatStrength(world({}), 'atlantis')).toBe(0)
  })
})
