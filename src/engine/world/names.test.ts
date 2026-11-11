import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { generatePlaceName, realmName } from './names'

const content = fixtureContent()
const nameFor = (seed: number, used: ReadonlySet<string> = new Set(), c: Content = content) =>
  withRng(createRng(seed), (d) => generatePlaceName(d, c, used))[0]

/** Every name the fixture table can make: 3 × 3, less "Stonestone". */
const ALL = ['Raven', 'Stone', 'Ash'].flatMap((a) =>
  ['ford', 'hold', 'stone'].map((b) => a + b).filter((n) => n !== 'Stonestone')
)

describe('generatePlaceName', () => {
  test('makes capitalised compounds, the same for the same seed', () => {
    expect(nameFor(3)).toBe(nameFor(3))
    for (let seed = 0; seed < 50; seed++) expect(ALL).toContain(nameFor(seed))
  })

  test('avoids names already in use while any are left', () => {
    const left = ALL[4]
    const used = new Set(ALL.filter((n) => n !== left))
    for (let seed = 0; seed < 10; seed++) expect(nameFor(seed, used)).toBe(left)
  })

  test('fails loudly without place-name tables', () => {
    expect(() => nameFor(1, new Set(), { ...content, placeNames: {} })).toThrow(/placeNames/)
  })
})

describe('realmName', () => {
  test('fills {place} and {Place} from the realm-name table', () => {
    const names = new Set(
      Array.from(
        { length: 20 },
        (_, seed) => withRng(createRng(seed), (d) => realmName(d, content, 'Ashford'))[0]
      )
    )
    expect([...names].sort()).toEqual(['Ashford Marches', 'Kingdom of Ashford'])
  })
})
