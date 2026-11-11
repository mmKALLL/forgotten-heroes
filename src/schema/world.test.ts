import { describe, expect, test } from 'vitest'
import { contentFileSchema } from './content'
import { RegionSchema, RouteSchema, SettlementSchema, ThreatSchema, TownSchema } from './world'

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

  test('the new kinds have content file schemas', () => {
    const kinds = ['regions', 'settlements', 'routes', 'towns', 'placeNames', 'threats'] as const
    for (const kind of kinds) {
      expect(
        contentFileSchema(kind).safeParse({ kind, source: 'claude', entries: [] }).success
      ).toBe(true)
    }
  })
})
