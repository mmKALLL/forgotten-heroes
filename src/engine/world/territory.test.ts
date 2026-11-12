import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { PX_PER_KM } from '../../schema/world'
import { fixtureContent } from '../test-fixtures'
import { straightKm } from './geo'
import { territory } from './territory'
import { SPOT_LINK_KM } from '../constants'

const content = fixtureContent()

/** Two settlements 400 px apart on one island, with three spots a grid step apart between them. */
function pair(biomeA: string, biomeB: string): Content {
  const c = structuredClone(content)
  c.regions = {
    ...c.regions,
    alpha: { ...c.regions.greenvale, id: 'alpha', biome: biomeA as 'plains' },
    beta: { ...c.regions.greenvale, id: 'beta', biome: biomeB as 'plains' },
  }
  const base = { island: 'pair', capital: false, coastal: false }
  c.settlements = {
    'alpha-1': { ...c.settlements['greenvale-2'], ...base, id: 'alpha-1', region: 'alpha' },
    'beta-1': { ...c.settlements['greenvale-2'], ...base, id: 'beta-1', region: 'beta' },
  }
  c.settlements['alpha-1'].at = { x: 100, y: 100 }
  c.settlements['beta-1'].at = { x: 500, y: 100 }
  c.routes = {}
  const spot = (id: string, x: number) => ({
    id,
    at: { x, y: 100 },
    island: 'pair',
    source: 'claude' as const,
    file: 'test',
  })
  c.landSpots = {
    'spot-a': spot('spot-a', 200),
    'spot-m': spot('spot-m', 300),
    'spot-b': spot('spot-b', 400),
  }
  return c
}

describe('territory', () => {
  test('every spot gets a domain on its own island', () => {
    const t = territory(content)
    for (const spot of Object.values(content.landSpots)) {
      const domain = t.domainOf[spot.id]
      expect(domain, spot.id).toBeDefined()
      expect(content.settlements[domain].island).toBe(spot.island)
    }
    expect(t.spots['farisle-1']).toEqual(['spot-0013', 'spot-0014', 'spot-0015', 'spot-0016'])
  })

  test('each domain lists its own spots, sorted', () => {
    const t = territory(content)
    const listed = Object.values(t.spots).flat().sort()
    expect(listed).toEqual(Object.keys(content.landSpots).sort())
    for (const [domain, spots] of Object.entries(t.spots)) {
      expect(spots).toEqual([...spots].sort())
      for (const id of spots) expect(t.domainOf[id]).toBe(domain)
    }
  })

  test('a spot exactly between two settlements on plains goes to the lower id', () => {
    const t = territory(pair('plains', 'plains'))
    expect(t.domainOf['spot-m']).toBe('alpha-1')
    expect(t.domainOf['spot-a']).toBe('alpha-1')
    expect(t.domainOf['spot-b']).toBe('beta-1')
  })

  test('mountain domains are smaller: the midpoint goes to the plains settlement', () => {
    expect(territory(pair('mountains', 'plains')).domainOf['spot-m']).toBe('beta-1')
    expect(territory(pair('plains', 'mountains')).domainOf['spot-m']).toBe('alpha-1')
  })

  test('a spot’s own terrain sets the cost of reaching it', () => {
    const c = pair('plains', 'plains')
    c.landSpots['spot-a'].terrain = 'mountains'
    // Alpha now has to cross mountains to reach the middle; beta reaches it over plains.
    expect(territory(c).domainOf['spot-m']).toBe('beta-1')
  })

  test('km is at least the straight-line km to the domain’s settlement', () => {
    const t = territory(content)
    for (const spot of Object.values(content.landSpots)) {
      const home = content.settlements[t.domainOf[spot.id]]
      expect(t.km[spot.id]).toBeGreaterThanOrEqual(straightKm(spot.at, home.at))
    }
  })

  test('links stay within SPOT_LINK_KM and on one island', () => {
    expect(SPOT_LINK_KM).toBeCloseTo((1.6 * 100) / PX_PER_KM, 6)
    const c = structuredClone(content)
    // A spot too far from anything is left out.
    c.landSpots['spot-lost'] = {
      id: 'spot-lost',
      at: { x: 3000, y: 2500 },
      island: 'mainland',
      source: 'claude',
      file: 'test',
    }
    const t = territory(c)
    expect(t.domainOf['spot-lost']).toBeUndefined()
    expect(t.km['spot-lost']).toBeUndefined()
  })

  test('domains joined by a route, sea routes included, are adjacent', () => {
    const t = territory(content)
    expect(t.adjacent['farisle-1']).toEqual(['ashmoor-1'])
    expect(t.adjacent['ashmoor-1']).toContain('farisle-1')
    for (const [id, list] of Object.entries(t.adjacent)) {
      expect(list).toEqual([...list].sort())
      expect(list).not.toContain(id)
      for (const other of list) expect(t.adjacent[other]).toContain(id)
    }
  })

  test('domains whose spots touch are adjacent even without a road', () => {
    const c = pair('plains', 'plains')
    expect(territory(c).adjacent).toEqual({ 'alpha-1': ['beta-1'], 'beta-1': ['alpha-1'] })
  })

  test('islands without spots still get their settlements as domains', () => {
    const c = structuredClone(content)
    for (const id of ['spot-0013', 'spot-0014', 'spot-0015', 'spot-0016']) delete c.landSpots[id]
    const t = territory(c)
    expect(t.spots['farisle-1']).toEqual([])
    expect(t.adjacent['farisle-1']).toEqual(['ashmoor-1'])
    expect(Object.keys(t.spots).sort()).toEqual(Object.keys(c.settlements).sort())
  })

  test('content with no spots gives every settlement an empty domain', () => {
    const c = structuredClone(content)
    c.landSpots = {}
    const t = territory(c)
    expect(t.domainOf).toEqual({})
    for (const id of Object.keys(c.settlements)) expect(t.spots[id]).toEqual([])
  })

  test('is memoised per content object', () => {
    expect(territory(content)).toBe(territory(content))
    expect(territory(structuredClone(content))).not.toBe(territory(content))
  })
})
