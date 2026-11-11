import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseManifest, syncAssets } from './sync-assets'

describe('parseManifest', () => {
  test('skips comments and blanks; strips trailing slashes', () => {
    expect(parseManifest('# c\n\nworld maps/altaeus map.jpg\ntown maps/__altaeus/\n')).toEqual([
      'world maps/altaeus map.jpg',
      'town maps/__altaeus',
    ])
  })
  test('rejects paths escaping the source folder', () => {
    expect(() => parseManifest('../secrets')).toThrow(/relative/)
    expect(() => parseManifest('/etc/passwd')).toThrow(/relative/)
  })
})

describe('syncAssets', () => {
  test('copies files and directories, preserving structure, and reports missing', () => {
    const from = mkdtempSync(join(tmpdir(), 'fh-from-'))
    const to = mkdtempSync(join(tmpdir(), 'fh-to-'))
    mkdirSync(join(from, 'town maps/__altaeus'), { recursive: true })
    writeFileSync(join(from, 'town maps/__altaeus/a.jpg'), 'A')
    mkdirSync(join(from, 'world maps'))
    writeFileSync(join(from, 'world maps/w.jpg'), 'W')

    const result = syncAssets(['town maps/__altaeus', 'world maps/w.jpg', 'nope.png'], from, to)

    expect(result).toEqual({
      copied: ['town maps/__altaeus', 'world maps/w.jpg'],
      missing: ['nope.png'],
    })
    expect(readFileSync(join(to, 'town maps/__altaeus/a.jpg'), 'utf8')).toBe('A')
    expect(existsSync(join(to, 'world maps/w.jpg'))).toBe(true)
  })
})
