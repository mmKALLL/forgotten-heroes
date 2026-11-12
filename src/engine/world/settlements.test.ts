import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { WorldStateSchema } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { START_SALT, generateWorld, startingSettlement, worldSeed } from './generate'
import { domainThreatLevel } from './pois'
import { RAMPANT_WEALTH, rollServices, sizeTierOf } from './settlements'
import { territory } from './territory'

const content = fixtureContent()
const edit = (change: (c: Content) => void): Content => {
  const copy = structuredClone(content)
  change(copy)
  return copy
}

test('size tiers follow the prototype’s population thresholds', () => {
  expect([76, 77, 400, 401, 1000, 1001, 4001, 10000, 10001].map(sizeTierOf)).toEqual([
    0, 1, 1, 2, 2, 3, 4, 4, 5,
  ])
})

describe('rollServices', () => {
  const roll = (seed: number, tier: number, wealth: number, coastal: boolean, max = 12) =>
    withRng(createRng(seed), (d) => rollServices(d, content, tier, wealth, coastal, max))[0]

  test('big, rich places have more; ports need the sea; the type caps the count', () => {
    let inns = 0
    for (let seed = 0; seed < 100; seed++) {
      const services = roll(seed, 5, 3, false)
      if (services.includes('inn-tavern')) inns++
      expect(services).not.toContain('port')
      expect(roll(seed, 5, 6, true, 1).length).toBeLessThanOrEqual(1)
    }
    expect(inns).toBeGreaterThan(80)
    const tinyMagic = Array.from({ length: 100 }, (_, s) => roll(s, 0, 0, true)).filter((x) =>
      x.includes('magic-items')
    )
    expect(tinyMagic).toEqual([])
  })
})

describe('generateWorld', () => {
  test('is deterministic, schema-valid, and differs between seeds', () => {
    const a = generateWorld(worldSeed(1), content)
    expect(generateWorld(worldSeed(1), content)).toEqual(a)
    expect(WorldStateSchema.parse(a)).toEqual(a)
    expect(generateWorld(worldSeed(2), content)).not.toEqual(a)
  })

  test('every marker becomes a settlement with a consistent type, size and services', () => {
    for (let seed = 0; seed < 30; seed++) {
      const world = generateWorld(seed, content)
      const seats = new Set(world.kingdoms.map((k) => k.seat))
      expect(Object.keys(world.settlements).sort()).toEqual(Object.keys(content.settlements).sort())
      for (const [id, s] of Object.entries(world.settlements)) {
        const site = content.settlements[id]
        const type = content.settlementTypes[s.type]
        if (seats.has(id)) expect(s.type).toBe('capital')
        else if (site.capital) expect(s.type).toBe('city')
        else expect(['hamlet', 'village', 'town', 'city', 'fort']).toContain(s.type)
        expect(s.population).toBeGreaterThanOrEqual(type.minPopulation)
        expect(s.population).toBeLessThanOrEqual(type.maxPopulation)
        expect(s.sizeTier).toBe(sizeTierOf(s.population))
        expect(s.services.length).toBeLessThanOrEqual(type.maxServices)
        if (!site.coastal) expect(s.services).not.toContain('port')
      }
      const names = Object.values(world.settlements).map((s) => s.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  test('named towns only go where they fit: a seaside town never lands inland', () => {
    for (let seed = 0; seed < 50; seed++) {
      const world = generateWorld(seed, content)
      expect(world.settlements['greenvale-2'].town).not.toBe('harbourne')
      const named = Object.values(world.settlements).find((s) => s.town === 'harbourne')
      if (named) expect(named.name).toBe('Harbourne')
    }
  })

  test('a pinned town always takes its marker', () => {
    const pinned = edit((c) => {
      c.towns.mirefold.site = 'greenvale-2'
    })
    for (let seed = 0; seed < 10; seed++) {
      expect(generateWorld(seed, pinned).settlements['greenvale-2']).toMatchObject({
        name: 'Mirefold',
        town: 'mirefold',
      })
    }
  })

  test('holds lands, domains and points of interest, with seats as capitals', () => {
    for (let seed = 0; seed < 20; seed++) {
      const world = generateWorld(seed, content)
      expect(Object.keys(world.lands).sort()).toEqual(Object.keys(content.regions).sort())
      expect(Object.keys(world.domains).sort()).toEqual(Object.keys(content.settlements).sort())
      const t = territory(content)
      for (const poi of Object.values(world.pois)) expect(t.domainOf[poi.spot]).toBe(poi.domain)
      for (const k of world.kingdoms) expect(world.settlements[k.seat].type).toBe('capital')
    }
  })

  test('settlements in a rampant domain are poorer', () => {
    // Only the threats' strength differs, so both worlds draw the same numbers.
    const calm = edit((c) => {
      for (const t of Object.values(c.threats)) t.strength = { min: 1, max: 1 }
    })
    const wild = edit((c) => {
      for (const t of Object.values(c.threats)) t.strength = { min: 6, max: 6 }
    })
    let rampant = 0
    for (let seed = 0; seed < 40; seed++) {
      const a = generateWorld(seed, calm)
      const b = generateWorld(seed, wild)
      for (const id of Object.keys(a.settlements)) {
        expect(domainThreatLevel(a, id, 1)).toBeLessThan(3)
        const poorer = domainThreatLevel(b, id, 1) === 3
        if (poorer) rampant++
        expect(b.settlements[id].wealth).toBe(
          Math.max(-4, a.settlements[id].wealth + (poorer ? RAMPANT_WEALTH : 0))
        )
      }
    }
    expect(rampant).toBeGreaterThan(0)
  })

  test('an empty geography makes an empty world', () => {
    const empty = edit((c) => {
      c.regions = {}
      c.settlements = {}
      c.routes = {}
    })
    expect(generateWorld(5, empty)).toEqual({
      seed: 5,
      kingdoms: [],
      lands: {},
      domains: {},
      pois: {},
      settlements: {},
    })
  })
})

describe('startingSettlement', () => {
  test('is a small mainland settlement in the calmest domain, the same for a world', () => {
    for (let seed = 0; seed < 30; seed++) {
      const world = generateWorld(seed, content)
      const start = startingSettlement(world, content)!
      expect(startingSettlement(world, content)).toBe(start)
      expect(startingSettlement(world, content, 'calm')).toBe(start)
      expect(content.settlements[start].island).toBe('mainland')
      // A plain marker can roll "city"; when every small place is taken, any mainland one will do.
      const small = Object.keys(world.settlements).filter(
        (id) =>
          content.settlements[id].island === 'mainland' &&
          !['capital', 'city'].includes(world.settlements[id].type)
      )
      if (small.length > 0) expect(small).toContain(start)
      const level = (id: string) => domainThreatLevel(world, id, 1)
      const mainland = Object.keys(world.settlements).filter(
        (id) => content.settlements[id].island === 'mainland'
      )
      const pool = small.length > 0 ? small : mainland
      expect(level(start)).toBe(Math.min(...pool.map(level)))
    }
  })

  test('in random mode, is any mainland settlement of any size, the same for a world', () => {
    const starts = new Set<string>()
    for (let seed = 0; seed < 40; seed++) {
      const world = generateWorld(seed, content)
      const start = startingSettlement(world, content, 'random')!
      expect(startingSettlement(world, content, 'random')).toBe(start)
      expect(content.settlements[start].island).toBe('mainland')
      starts.add(start)
    }
    // Including the capital marker, which the calm start never picks while small places exist.
    expect([...starts].sort()).toEqual(['ashmoor-1', 'greenvale-1', 'greenvale-2'])
  })

  test('draws from its own stream, salted apart from the one that rolled the world', () => {
    const mainland = ['ashmoor-1', 'greenvale-1', 'greenvale-2']
    const pick = (seed: number) => withRng(createRng(seed), (d) => d.pick(mainland))[0]
    expect(START_SALT).toBeTypeOf('number')
    let differs = 0
    for (let seed = 0; seed < 20; seed++) {
      const start = startingSettlement(generateWorld(seed, content), content, 'random')
      expect(start).toBe(pick((seed ^ START_SALT) >>> 0))
      if (start !== pick(seed)) differs++
    }
    expect(differs).toBeGreaterThan(0)
  })

  test('an empty world has no starting place', () => {
    const empty = { seed: 1, kingdoms: [], lands: {}, domains: {}, pois: {}, settlements: {} }
    expect(startingSettlement(empty, content)).toBeNull()
    expect(startingSettlement(empty, content, 'random')).toBeNull()
  })
})
