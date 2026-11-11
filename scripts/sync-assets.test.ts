import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
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
  test.each(['.', './', 'a/..', 'a/../', '..', 'a/../../b', 'a\\..\\b'])(
    'rejects %j (the whole folder, or a parent segment)',
    (line) => {
      expect(() => parseManifest(line)).toThrow(/relative/)
    }
  )
  test('allows names that merely start with two dots', () => {
    expect(parseManifest('..foo/x\nmaps/..bar')).toEqual(['..foo/x', 'maps/..bar'])
  })
})

describe('syncAssets', () => {
  const temps: string[] = []
  const tempDir = (prefix: string) => {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    temps.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  test('copies files and directories, preserving structure, and reports missing', () => {
    const from = tempDir('fh-from-')
    const to = tempDir('fh-to-')
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

  test('copies the target of a symlink, not the link', () => {
    const from = tempDir('fh-from-')
    const to = tempDir('fh-to-')
    const outside = tempDir('fh-outside-')
    writeFileSync(join(outside, 'real.jpg'), 'R')
    symlinkSync(join(outside, 'real.jpg'), join(from, 'link.jpg'))

    syncAssets(['link.jpg'], from, to)

    rmSync(outside, { recursive: true, force: true })
    expect(readFileSync(join(to, 'link.jpg'), 'utf8')).toBe('R')
  })
})
