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
