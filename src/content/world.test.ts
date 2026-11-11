import { describe, expect, test } from 'vitest'
import { PUBLISHED_TOWNS } from '../../scripts/port/town-maps'
import { slotNames } from '../engine/encounters/slots'
import { routesFrom } from '../engine/world/geo'
import { worldIssues } from '../engine/world/validate'
import { BIOMES } from '../schema/constants'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()

describe('the Altaeus geography', () => {
  test('is a valid, connected route graph', () => {
    expect(worldIssues(content)).toEqual([])
  })

  test('has the map’s regions and markers', () => {
    expect(Object.keys(content.regions)).toHaveLength(16)
    expect(Object.keys(content.settlements).length).toBeGreaterThanOrEqual(50)
    expect(
      Object.values(content.settlements).filter((s) => s.capital).length
    ).toBeGreaterThanOrEqual(12)
  })

  test('every settlement has a road or a crossing out', () => {
    const stranded = Object.keys(content.settlements).filter(
      (id) => routesFrom(content, id).length === 0
    )
    expect(stranded).toEqual([])
  })
})

describe('town names', () => {
  test('come from the town-map filenames, with Amiton pinned to its marker', () => {
    // Only the committed names count, so this passes without data/imported-private/.
    const original = Object.values(content.towns).filter((t) => t.source === 'original')
    expect(original.length).toBeGreaterThan(50)
    expect(content.towns.amiton).toMatchObject({ coastal: true, biomes: ['marsh'], altaeus: true })
    expect(content.settlements[content.towns.amiton.site!].region).toBe('deaddar-marsh')
  })

  test('names from published settings stay out of the committed file', () => {
    const original = Object.values(content.towns).filter((t) => t.source === 'original')
    for (const t of original) expect(PUBLISHED_TOWNS.has(t.id)).toBe(false)
    for (const t of Object.values(content.towns).filter((t) => PUBLISHED_TOWNS.has(t.id))) {
      expect(t.source).toBe('imported-private')
    }
  })
})

describe('place names', () => {
  test('the four ported tables are present', () => {
    expect(Object.keys(content.placeNames).sort()).toEqual([
      'english-compound',
      'french',
      'french-soft',
      'spanish',
    ])
  })
})

describe('threats and realm names', () => {
  test('at least eight threats, and every biome but the sea has a favoured one', () => {
    const threats = Object.values(content.threats)
    expect(threats.length).toBeGreaterThanOrEqual(8)
    for (const biome of BIOMES.filter((b) => b !== 'sea')) {
      expect(threats.some((t) => t.biomes.includes(biome))).toBe(true)
    }
    for (const t of threats) expect(t.strength.min).toBeLessThanOrEqual(t.strength.max)
  })

  test('realm names only use the {place} slot', () => {
    const rows = content.partsTables['realm-name'].rows
    expect(rows.length).toBeGreaterThanOrEqual(5)
    for (const row of rows) expect(slotNames(row.text)).toEqual(['place'])
  })
})
