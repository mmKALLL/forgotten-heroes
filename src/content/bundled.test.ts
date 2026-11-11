import { expect, test } from 'vitest'
import { buildContent } from './build'
import { bundledFiles, loadBundledContent } from './bundled'

test('every data file is valid', () => {
  const { errors } = buildContent(bundledFiles)
  expect(errors).toEqual([])
})

test('core content is present from several sources', () => {
  const content = loadBundledContent()
  expect(content.classes.fighter.source).toBe('original')
  expect(content.classes.bard.source).toBe('claude')
  expect(Object.keys(content.services)).toContain('inn-tavern')
  expect(content.names['human-english'].given.length).toBeGreaterThan(100)
})

test('cross-references point at existing ancestries, and the essentials exist', () => {
  const content = loadBundledContent()
  const ancestryIds = new Set(Object.keys(content.ancestries))
  const dangling: string[] = []
  for (const table of Object.values(content.names)) {
    for (const id of table.ancestries) {
      if (!ancestryIds.has(id)) dangling.push(`names ${table.id} → ${id}`)
    }
  }
  for (const type of Object.values(content.settlementTypes)) {
    if (!ancestryIds.has(type.predominantAncestry)) {
      dangling.push(`settlementTypes ${type.id} → ${type.predominantAncestry}`)
    }
  }
  expect(dangling).toEqual([])
  expect(Object.keys(content.classes).length).toBeGreaterThan(0)
  expect(Object.values(content.ancestries).some((a) => a.playable)).toBe(true)
  expect(Object.keys(content.names).length).toBeGreaterThan(0)
})
