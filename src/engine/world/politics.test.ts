import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { DomainStateSchema, KingdomSchema, LandStateSchema } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import {
  DEFENCE,
  KINGDOMS,
  SEAT_FALLOFF,
  generatePolitics,
  seatHops,
  threatLevelFor,
} from './politics'
import { territory } from './territory'

const content = fixtureContent()
const politics = (seed: number, kingdoms?: number, c: Content = content) =>
  withRng(createRng(seed), (d) => generatePolitics(d, c, territory(c), new Set(), kingdoms))[0]

const DOMAINS = ['ashmoor-1', 'farisle-1', 'greenvale-1', 'greenvale-2']

describe('generatePolitics', () => {
  test('is deterministic and schema-valid', () => {
    const a = politics(7)
    expect(politics(7)).toEqual(a)
    for (const k of a.kingdoms) expect(KingdomSchema.parse(k)).toEqual(k)
    for (const l of Object.values(a.lands)) expect(LandStateSchema.parse(l)).toEqual(l)
    for (const d of Object.values(a.domains)) expect(DomainStateSchema.parse(d)).toEqual(d)
  })

  test('every domain is owned exactly once; every seat is a capital marker it owns', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { kingdoms, domains } = politics(seed)
      expect(kingdoms.flatMap((k) => k.domains).sort()).toEqual(DOMAINS)
      expect(Object.keys(domains).sort()).toEqual(DOMAINS)
      for (const k of kingdoms) {
        expect(k.domains).toContain(k.seat)
        expect(content.settlements[k.seat].capital).toBe(true)
        for (const id of k.domains) expect(domains[id].kingdom).toBe(k.id)
      }
    }
  })

  test('each domain knows its land, and every land has a threat', () => {
    const { lands, domains } = politics(3)
    for (const id of DOMAINS) expect(domains[id].land).toBe(content.settlements[id].region)
    expect(Object.keys(lands).sort()).toEqual(['ashmoor', 'farisle', 'greenvale'])
  })

  test('the kingdom count is within range and never more than the capitals', () => {
    expect(KINGDOMS).toEqual({ min: 8, max: 12 })
    for (let seed = 0; seed < 20; seed++) expect(politics(seed).kingdoms).toHaveLength(2)
    // With more capital markers than kingdoms, the roll decides.
    const many = structuredClone(content)
    for (const s of Object.values(many.settlements)) s.capital = true
    for (let seed = 0; seed < 20; seed++) {
      const n = politics(seed, undefined, many).kingdoms.length
      expect(n).toBeLessThanOrEqual(4)
    }
  })

  test('with one kingdom, it holds every domain', () => {
    const one = politics(3, 1)
    expect(one.kingdoms).toHaveLength(1)
    expect([...one.kingdoms[0].domains].sort()).toEqual(DOMAINS)
  })

  test('garrisons sum to the defence and thin out with hops from the seat', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { kingdoms, domains } = politics(seed, 1)
      const [k] = kingdoms
      expect(k.defence).toBeGreaterThanOrEqual(DEFENCE.min)
      expect(k.defence).toBeLessThanOrEqual(DEFENCE.max)
      const total = k.domains.reduce((sum, id) => sum + domains[id].garrison, 0)
      expect(Math.abs(total - k.defence)).toBeLessThan(1e-9)
      const hops = seatHops(k, territory(content))
      for (const a of k.domains) {
        for (const b of k.domains) {
          if (hops[a] < hops[b]) expect(domains[a].garrison).toBeGreaterThan(domains[b].garrison)
        }
      }
      const seat = domains[k.seat].garrison
      for (const id of k.domains) expect(domains[id].garrison).toBeLessThanOrEqual(seat)
      // A domain h hops out weighs 1 / (1 + SEAT_FALLOFF × h).
      const far = k.domains.find((id) => hops[id] === 1)!
      expect(domains[far].garrison / seat).toBeCloseTo(1 / (1 + SEAT_FALLOFF), 9)
    }
  })

  test('a domain no kingdom can reach founds its own kingdom, seated there', () => {
    const cut = structuredClone(content)
    delete cut.routes['ashmoor-1-farisle-1']
    cut.settlements['farisle-1'].capital = false
    for (let seed = 0; seed < 10; seed++) {
      const { kingdoms, domains } = politics(seed, undefined, cut)
      expect(kingdoms).toHaveLength(2)
      const isle = kingdoms.find((k) => k.domains.includes('farisle-1'))!
      expect(isle.domains).toEqual(['farisle-1'])
      expect(isle.seat).toBe('farisle-1')
      expect(domains['farisle-1'].garrison).toBe(isle.defence)
    }
  })

  test('rulers are playable ancestries, and kingdom names are distinct', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { kingdoms } = politics(seed)
      for (const k of kingdoms) expect(['human', 'dwarf']).toContain(k.ancestry)
      expect(new Set(kingdoms.map((k) => k.name)).size).toBe(kingdoms.length)
    }
  })

  test('threats favour their biomes: the marsh mostly gets the bog cult', () => {
    let cults = 0
    for (let seed = 0; seed < 200; seed++)
      if (politics(seed).lands.ashmoor.threat === 'bog-cult') cults++
    expect(cults).toBeGreaterThan(100)
  })

  test('content without lands or settlements gives an empty world', () => {
    const empty = structuredClone(content)
    empty.regions = {}
    empty.settlements = {}
    empty.routes = {}
    expect(politics(1, undefined, empty)).toEqual({ kingdoms: [], lands: {}, domains: {} })
  })
})

test('the threat level is the threat’s strength above the garrison, from 0 to 3', () => {
  expect(threatLevelFor(5, 1)).toBe(3)
  expect(threatLevelFor(2, 3)).toBe(0)
  expect(threatLevelFor(3, 1.5)).toBe(2)
  expect(threatLevelFor(6, 1)).toBe(3)
})
