import { describe, expect, test } from 'vitest'
import { contentFileSchema } from './content'
import {
  LandSpotSchema,
  PoiTypeSchema,
  RegionSchema,
  RouteSchema,
  SettlementSchema,
  ThreatSchema,
  TownSchema,
} from './world'

describe('world schemas', () => {
  test('a settlement is a marker inside the 4096×3072 map', () => {
    const marker = {
      id: 'avarus-1',
      at: { x: 1650, y: 1109 },
      region: 'avarus',
      island: 'mainland',
    }
    expect(SettlementSchema.parse(marker)).toEqual({ ...marker, capital: false, coastal: false })
    expect(SettlementSchema.safeParse({ ...marker, at: { x: 5000, y: 10 } }).success).toBe(false)
    expect(SettlementSchema.safeParse({ ...marker, at: { x: -1, y: 10 } }).success).toBe(false)
  })

  test('regions have a biome and a label position', () => {
    const region = { id: 'avarus', name: 'Avarus', biome: 'forest', label: { x: 1620, y: 1560 } }
    expect(RegionSchema.parse(region)).toEqual(region)
    expect(RegionSchema.safeParse({ ...region, biome: 'lava' }).success).toBe(false)
  })

  test('routes have whole km, a terrain and a danger of 0 to 3', () => {
    const route = { id: 'a-b', from: 'a', to: 'b', km: 62, terrain: 'forest', danger: 2 }
    expect(RouteSchema.parse(route)).toEqual(route)
    expect(RouteSchema.safeParse({ ...route, danger: 4 }).success).toBe(false)
    expect(RouteSchema.safeParse({ ...route, km: 0 }).success).toBe(false)
    expect(RouteSchema.safeParse({ ...route, terrain: 'sea' }).success).toBe(true)
  })

  test('towns default to no hints', () => {
    expect(
      TownSchema.parse({ id: 'corso', name: 'Corso', description: 'poor seaside capital' })
    ).toEqual({
      id: 'corso',
      name: 'Corso',
      description: 'poor seaside capital',
      capital: false,
      biomes: [],
      coastal: false,
      wealth: 0,
      altaeus: false,
    })
    expect(
      TownSchema.safeParse({ id: 'x', name: 'X', description: '', alignment: 'ZZ' }).success
    ).toBe(false)
  })

  test('threats have a strength range of 1 to 6', () => {
    const threat = {
      id: 'orc-warband',
      name: 'Orc warband',
      description: 'Raiders from the hills.',
      strength: { min: 2, max: 5 },
    }
    expect(ThreatSchema.parse(threat)).toEqual({ ...threat, creatureTypes: [], biomes: [] })
    expect(ThreatSchema.safeParse({ ...threat, strength: { min: 0, max: 7 } }).success).toBe(false)
  })

  test('a land spot is a map point on an island, with an optional terrain that is never sea', () => {
    const spot = { id: 'spot-0412', at: { x: 1830, y: 905 }, island: 'mainland' }
    expect(LandSpotSchema.parse(spot)).toEqual(spot)
    expect(LandSpotSchema.parse({ ...spot, terrain: 'hills' })).toEqual({
      ...spot,
      terrain: 'hills',
    })
    expect(LandSpotSchema.safeParse({ ...spot, terrain: 'sea' }).success).toBe(false)
    expect(LandSpotSchema.safeParse({ ...spot, at: { x: 5000, y: 10 } }).success).toBe(false)
  })

  describe('POI types', () => {
    const lair = {
      id: 'orc-war-camp',
      category: 'lair',
      name: 'War camp',
      weight: 2,
      biomes: ['hills'],
      threats: ['orc-warband'],
      hostile: true,
      threat: { min: 1, max: 2 },
      pathDanger: 2,
      water: false,
      names: 'poi-name-camp',
      situations: ['orc-war-camp-raid'],
      icon: 'campfire',
    }
    const shrine = {
      id: 'spring-shrine',
      category: 'shrine',
      name: 'Spring shrine',
      names: 'poi-name-shrine',
      situations: ['spring-shrine-visit'],
    }

    test('parse as written, and fill in the defaults', () => {
      expect(PoiTypeSchema.parse(lair)).toEqual(lair)
      expect(PoiTypeSchema.parse(shrine)).toEqual({
        ...shrine,
        weight: 1,
        biomes: [],
        threats: [],
        hostile: false,
        pathDanger: 1,
        water: false,
      })
    })

    test('a hostile type needs a threat, and only a hostile type may have one', () => {
      const { threat: _, ...noThreat } = lair
      expect(PoiTypeSchema.safeParse(noThreat).success).toBe(false)
      expect(PoiTypeSchema.safeParse({ ...shrine, threat: { min: 1, max: 1 } }).success).toBe(false)
    })

    test('categories, path danger and situations are checked', () => {
      expect(PoiTypeSchema.safeParse({ ...shrine, category: 'castle' }).success).toBe(false)
      expect(PoiTypeSchema.safeParse({ ...shrine, pathDanger: 4 }).success).toBe(false)
      expect(PoiTypeSchema.safeParse({ ...shrine, situations: [] }).success).toBe(false)
    })
  })

  test('the new kinds have content file schemas', () => {
    const kinds = [
      'regions',
      'settlements',
      'routes',
      'towns',
      'placeNames',
      'threats',
      'landSpots',
      'poiTypes',
    ] as const
    for (const kind of kinds) {
      expect(
        contentFileSchema(kind).safeParse({ kind, source: 'claude', entries: [] }).success
      ).toBe(true)
    }
  })
})
