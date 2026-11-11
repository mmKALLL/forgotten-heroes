import { describe, expect, test } from 'vitest'
import { CharacterSchema } from '../schema/state'
import { generateCharacter, generateParty } from './party'
import { createRng } from './rng'
import { fixtureContent } from './test-fixtures'

const content = fixtureContent()

describe('generation', () => {
  test('is deterministic for a seed', () => {
    expect(generateCharacter(createRng(1), content)).toEqual(
      generateCharacter(createRng(1), content)
    )
  })

  test('produces schema-valid characters from content', () => {
    const [c] = generateCharacter(createRng(5), content, { classId: 'bard' })
    expect(CharacterSchema.parse(c)).toEqual(c)
    expect(c.classId).toBe('bard')
    expect(c.skillProficiencies).toEqual(['persuasion', 'performance'])
    expect(c.hp).toBe(c.maxHp)
    expect(c.name).toMatch(/^(Ada|Bram) Stone$/)
  })

  test('adds exactly 3 random ability points on top of the class spread', () => {
    const [c] = generateCharacter(createRng(8), content, { classId: 'fighter' })
    const total = Object.values(c.abilities).reduce((a, b) => a + b, 0)
    expect(total).toBe(70 + 3)
  })

  test('uses the prototype HP formula: hitDie×2 + (CON−10)×2', () => {
    const [c] = generateCharacter(createRng(13), content, { classId: 'fighter' })
    expect(c.maxHp).toBe(10 * 2 + (c.abilities.con - 10) * 2)
  })

  test('only playable ancestries', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(generateCharacter(createRng(seed), content)[0].ancestry).not.toBe('drake')
    }
  })

  test('party members get distinct classes while classes remain', () => {
    const [party] = generateParty(createRng(3), content, 2)
    expect(party).toHaveLength(2)
    expect(new Set(party.map((c) => c.classId)).size).toBe(2)
    expect(new Set(party.map((c) => c.id)).size).toBe(2)
  })

  test('larger parties than class count reuse classes', () => {
    const [party] = generateParty(createRng(3), content, 4)
    expect(party).toHaveLength(4)
  })

  test('ids naming Object.prototype properties are unknown, not inherited', () => {
    expect(() => generateCharacter(createRng(1), content, { classId: 'constructor' })).toThrow(
      /unknown class/
    )
    expect(() => generateCharacter(createRng(1), content, { ancestryId: 'toString' })).toThrow(
      /unknown ancestry/
    )
  })
})
