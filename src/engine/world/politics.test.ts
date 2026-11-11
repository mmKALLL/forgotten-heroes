import { describe, expect, test } from 'vitest'
import { KingdomSchema, RegionStateSchema } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { generatePolitics, threatLevelFor } from './politics'

const content = fixtureContent()
const politics = (seed: number, kingdoms?: number) =>
  withRng(createRng(seed), (d) => generatePolitics(d, content, new Set(), kingdoms))[0]

describe('generatePolitics', () => {
  test('is deterministic and schema-valid', () => {
    const a = politics(7)
    expect(politics(7)).toEqual(a)
    for (const k of a.kingdoms) expect(KingdomSchema.parse(k)).toEqual(k)
    for (const r of Object.values(a.regions)) expect(RegionStateSchema.parse(r)).toEqual(r)
  })

  test('every region belongs to exactly one kingdom, and every kingdom has a region', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { kingdoms, regions } = politics(seed)
      const owned = kingdoms.flatMap((k) => k.regions).sort()
      expect(owned).toEqual(['ashmoor', 'farisle', 'greenvale'])
      for (const k of kingdoms) {
        expect(k.regions.length).toBeGreaterThan(0)
        for (const id of k.regions) expect(regions[id].kingdom).toBe(k.id)
      }
    }
  })

  test('kingdoms grow across land and sea to fill the map', () => {
    const one = politics(3, 1)
    expect(one.kingdoms).toHaveLength(1)
    expect(one.kingdoms[0].regions.sort()).toEqual(['ashmoor', 'farisle', 'greenvale'])
    expect(politics(3, 2).kingdoms).toHaveLength(2)
  })

  test('a kingdom’s capital is a capital marker in its land when it has one', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const k of politics(seed).kingdoms) {
        const site = content.settlements[k.capital]
        expect(k.regions).toContain(site.region)
        const markers = Object.values(content.settlements).filter(
          (s) => s.capital && k.regions.includes(s.region)
        )
        if (markers.length > 0) expect(site.capital).toBe(true)
      }
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
      if (politics(seed).regions.ashmoor.threat === 'bog-cult') cults++
    expect(cults).toBeGreaterThan(100)
  })
})

test('the threat level is the threat’s strength above the garrison, from 0 to 3', () => {
  expect(threatLevelFor(5, 1)).toBe(3)
  expect(threatLevelFor(2, 3)).toBe(0)
  expect(threatLevelFor(3, 1.5)).toBe(2)
  expect(threatLevelFor(6, 1)).toBe(3)
})
