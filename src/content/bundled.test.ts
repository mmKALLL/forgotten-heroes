import { existsSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildContent } from './build'
import { bundledFiles, loadBundledContent } from './bundled'
import { translationKey } from './localize'

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

test('data/imported-private/ is optional: absent locally means no private files, present means loaded', () => {
  const present = existsSync(new URL('../../data/imported-private/', import.meta.url))
  const privateFiles = Object.keys(bundledFiles).filter((file) =>
    file.includes('/data/imported-private/')
  )
  if (!present) {
    expect(privateFiles).toEqual([])
    return
  }
  expect(privateFiles.length).toBeGreaterThan(0)
  const content = loadBundledContent()
  const privateEntries = [
    ...Object.values(content.situations),
    ...Object.values(content.situationTemplates),
  ].filter((s) => s.source === 'imported-private')
  expect(privateEntries.length).toBeGreaterThan(0)
})

test('bundled Japanese translations cover every skill, class and ancestry, plus sample encounters', () => {
  const content = loadBundledContent()
  const missing = (['skills', 'classes', 'ancestries'] as const).flatMap((kind) =>
    Object.keys(content[kind])
      .filter((id) => !Object.hasOwn(content.translations, translationKey('ja', kind, id)))
      .map((id) => `${kind} ${id}`)
  )
  expect(missing).toEqual([])
  const situations = Object.values(content.translations).filter((t) => t.target === 'situations')
  expect(situations.length).toBeGreaterThanOrEqual(3)
})
