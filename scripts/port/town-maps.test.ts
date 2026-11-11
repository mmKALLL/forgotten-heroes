import { describe, expect, test } from 'vitest'
import { collectTowns, parseTownMapFilename, splitTowns, townEntry } from './town-maps'

const parse = (file: string) => parseTownMapFilename(file)!

describe('parseTownMapFilename', () => {
  test('reads the name, description and alignment', () => {
    expect(parse('Corso - poor seaside capital - CN.jpg')).toEqual({
      name: 'Corso',
      description: 'poor seaside capital',
      alignment: 'CN',
      file: 'Corso - poor seaside capital - CN.jpg',
    })
    expect(parse('Karou-Kapolstad - abandoned mountain city - TN -> CE.jpg').alignment).toBe('CE')
    expect(parse('Nimduin - high elf cliff town.jpeg')).toMatchObject({
      name: 'Nimduin',
      description: 'high elf cliff town',
      alignment: undefined,
    })
    expect(parse('Stonewood - hillsy village - NG').name).toBe('Stonewood')
  })

  test('ignores files that are not named in the pattern', () => {
    expect(parseTownMapFilename('Corso unlabeled.jpeg')).toBeNull()
    expect(parseTownMapFilename('Phandalin player ver hires.jpeg')).toBeNull()
    expect(parseTownMapFilename('_altaeus with town names.xcf')).toBeNull()
  })
})

describe('townEntry', () => {
  test('turns the description into hints', () => {
    expect(
      townEntry(parse('Corso - poor seaside capital - CN.jpg'), 'town maps/__altaeus', true)
    ).toEqual({
      id: 'corso',
      name: 'Corso',
      description: 'poor seaside capital',
      alignment: 'CN',
      size: 'metropolis',
      capital: true,
      biomes: [],
      coastal: true,
      wealth: -2,
      banner: 'town maps/__altaeus/Corso - poor seaside capital - CN.jpg',
      altaeus: true,
    })
    expect(
      townEntry(parse('Mos Onjar - rich desert town - LE.jpeg'), 'town maps', false)
    ).toMatchObject({
      id: 'mos-onjar',
      size: 'town',
      biomes: ['desert'],
      wealth: 2,
      coastal: false,
      altaeus: false,
    })
    expect(
      townEntry(parse('Riverlands - half-elf capitol - CG.jpeg'), 'town maps', false)
    ).toMatchObject({ ancestry: 'half-elf', capital: true, size: 'metropolis' })
    expect(
      townEntry(parse('Gleamshore - seclusive wood elf hamlet - CG.jpeg'), 'town maps', false)
    ).toMatchObject({ ancestry: 'elf', biomes: ['forest'], size: 'hamlet' })
    expect(
      townEntry(parse('Kuo Lath - tropical island hamlet - CE.png'), 'town maps', false)
    ).toMatchObject({ biomes: ['jungle'], coastal: true })
  })

  test('skips places that are not living settlements', () => {
    const skipped = [
      'City of Glass - underwater city - TN.jpeg',
      'Menzoberranzan - underdark capital - NE.webp',
      'Hazlan - desert wilderness - CE.webp',
      'Vor Rukoth - abandoned desert hamlet - CE.jpg',
      'Ruins of Gardmore Abbey - hillsy thorp - LE.webp',
      'Magrael - natural forest sight.jpeg',
      "Nystul's Infinite Dungeon - island - TN.jpeg",
    ]
    for (const file of skipped) expect(townEntry(parse(file), 'town maps', false)).toBeNull()
  })
})

describe('collectTowns', () => {
  test('keeps one town per name, preferring the Altaeus folder, sorted by id', () => {
    const towns = collectTowns([
      {
        folder: 'town maps/__altaeus',
        altaeus: true,
        files: [
          'Phandalin - hilly forest village - CN.jpg',
          'Corso - poor seaside capital - CN.jpg',
        ],
      },
      {
        folder: 'town maps',
        altaeus: false,
        files: [
          'Phandalin - hilly forest village - CN.jpg',
          'Riverwatch - temperate river city - CN.jpg',
          'Riverwatch - temperate river city - LG.jpeg',
        ],
      },
    ])
    expect(towns.map((t) => [t.id, t.banner])).toEqual([
      ['corso', 'town maps/__altaeus/Corso - poor seaside capital - CN.jpg'],
      ['phandalin', 'town maps/__altaeus/Phandalin - hilly forest village - CN.jpg'],
      ['riverwatch', 'town maps/Riverwatch - temperate river city - CN.jpg'],
    ])
  })
})

describe('splitTowns', () => {
  test('names from published settings or the real world go to the private file', () => {
    const towns = collectTowns([
      {
        folder: 'town maps',
        altaeus: false,
        files: [
          'Waterdeep - temperate harbor capital - LN.jpeg',
          'Lowmarsh - poor marsh village - CN.jpeg',
          'Athens - arid plains capital - LN.jpg',
        ],
      },
    ])
    const { original, imported } = splitTowns(towns)
    expect(original.map((t) => t.id)).toEqual(['lowmarsh'])
    expect(imported.map((t) => t.id)).toEqual(['athens', 'waterdeep'])
  })
})
