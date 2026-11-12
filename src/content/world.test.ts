import { describe, expect, test } from 'vitest'
import { PUBLISHED_TOWNS } from '../../scripts/port/town-maps'
import { slotNames } from '../engine/encounters/slots'
import { newGame } from '../engine/state'
import { wander } from '../engine/travel/wander'
import { generateWorld, startingSettlement, worldSeed } from '../engine/world/generate'
import { routesFrom } from '../engine/world/geo'
import { domainThreatLevel } from '../engine/world/pois'
import { worldIssues } from '../engine/world/validate'
import { BIOMES } from '../schema/constants'
import { GameStateSchema } from '../schema/state'
import { WorldStateSchema } from '../schema/world'
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

  test('about one domain in eight is Rampant across generated worlds (design §6: 10–15%)', () => {
    let rampant = 0
    let domains = 0
    for (let seed = 0; seed < 200; seed++) {
      const world = generateWorld(worldSeed(seed), content)
      for (const id of Object.keys(world.domains)) {
        domains++
        if (domainThreatLevel(world, id) === 3) rampant++
      }
    }
    const share = rampant / domains
    expect(share).toBeGreaterThanOrEqual(0.08)
    expect(share).toBeLessThanOrEqual(0.18)
  })

  test('realm names only use the {place} slot', () => {
    const rows = content.partsTables['realm-name'].rows
    expect(rows.length).toBeGreaterThanOrEqual(5)
    for (const row of rows) expect(slotNames(row.text)).toEqual(['place'])
  })
})

describe('generated worlds on Altaeus', () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i is valid and fully named', (seed) => {
    const world = generateWorld(worldSeed(seed), content)
    expect(WorldStateSchema.parse(world)).toEqual(world)
    expect(world.kingdoms.length).toBeGreaterThanOrEqual(8)
    expect(Object.keys(world.lands).sort()).toEqual(Object.keys(content.regions).sort())
    expect(Object.keys(world.domains).sort()).toEqual(Object.keys(content.settlements).sort())
    const names = Object.values(world.settlements).map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
    expect(startingSettlement(world, content)).not.toBeNull()
    expect(startingSettlement(world, content, 'random')).not.toBeNull()
  })

  test('most settlements are named after town maps', () => {
    const world = generateWorld(worldSeed(1), content)
    const named = Object.values(world.settlements).filter((s) => s.town !== null)
    expect(named.length).toBeGreaterThan(Object.keys(world.settlements).length / 2)
  })
})

describe('journeys on Altaeus', () => {
  test.each([1, 2, 3])('seed %i: twelve legs keep the state valid', (seed) => {
    const state = wander(
      newGame(seed, content),
      content,
      12,
      (leg, count) => (leg * 7 + seed) % count,
      (leg, count) => (leg * 3 + seed) % count
    )
    expect(GameStateSchema.parse(state)).toEqual(state)
    expect(state.day).toBeGreaterThan(12)
    expect(state.log.map((e) => e.text)).not.toContain('No encounters match that filter.')
  })
})
