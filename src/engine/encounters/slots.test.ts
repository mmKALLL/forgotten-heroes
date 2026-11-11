import { describe, expect, test } from 'vitest'
import { SlotSourceSchema } from '../../schema/encounter'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { fillText, rollSlots, rollTable, slotNames } from './slots'

const content = fixtureContent()

describe('text slots', () => {
  test('slotNames lists each slot once, lower-casing a capitalised first letter', () => {
    expect(slotNames('{Who} meets {who} about {stakes}; {actor} {who-job}')).toEqual(['who', 'stakes', 'actor', 'who-job'])
    expect(slotNames('no slots, {not a slot}, {}')).toEqual([])
  })

  test('fillText fills known slots, capitalises {Who}, and leaves unknown slots visible', () => {
    const values = { who: 'a wary tinker', actor: 'Lyra' }
    expect(fillText('{Who} nods at {actor}. {who} waits for {stakes}.', values)).toBe(
      'A wary tinker nods at Lyra. a wary tinker waits for {stakes}.'
    )
  })

  test('fillText ignores inherited object keys', () => {
    expect(fillText('{constructor}', {})).toBe('{constructor}')
  })
})

describe('parts tables', () => {
  test('rollTable expands nested table references and respects zero weights', () => {
    const [values] = withRng(createRng(3), (d) => Array.from({ length: 40 }, () => rollTable(d, content, 'who')))
    expect(new Set(values)).toEqual(new Set(['a wary tinker', 'a wary pilgrim']))
  })

  test('rollTable throws on an unknown table and on a reference loop', () => {
    expect(() => withRng(createRng(1), (d) => rollTable(d, content, 'nope'))).toThrow(/unknown parts table "nope"/)
    const loop = (id: string, next: string) => ({ id, description: '', rows: [{ text: `{${next}}`, weight: 1 }], source: 'procedural' as const, file: 'x' })
    const looped = { ...content, partsTables: { ...content.partsTables, a: loop('a', 'b'), b: loop('b', 'a') } }
    expect(() => withRng(createRng(1), (d) => rollTable(d, looped, 'a'))).toThrow(/too deeply nested/)
  })
})

describe('rollSlots', () => {
  const slots = {
    who: SlotSourceSchema.parse({ from: 'table', table: 'who' }),
    foe: SlotSourceSchema.parse({ from: 'creature', types: ['humanoid', 'giant'], maxCr: 1 }),
    beast: SlotSourceSchema.parse({ from: 'creature', types: ['beast'], form: 'name' }),
  }

  test('fills every slot, deterministically for a seed', () => {
    const [a] = withRng(createRng(9), (d) => rollSlots(d, content, slots))
    const [b] = withRng(createRng(9), (d) => rollSlots(d, content, slots))
    expect(a).toEqual(b)
    expect(a.who).toMatch(/^a wary (tinker|pilgrim)$/)
    expect(a.foe).toBe('a band of bandits') // the ogre is CR 2
    expect(a.beast).toBe('Wolf')
  })

  test('a creature filter that matches nothing throws', () => {
    const none = { foe: SlotSourceSchema.parse({ from: 'creature', types: ['dragon'] }) }
    expect(() => withRng(createRng(1), (d) => rollSlots(d, content, none))).toThrow(/no creature matches slot "foe"/)
  })
})
