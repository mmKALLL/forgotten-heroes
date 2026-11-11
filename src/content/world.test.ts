import { describe, expect, test } from 'vitest'
import { routesFrom } from '../engine/world/geo'
import { worldIssues } from '../engine/world/validate'
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
