import { describe, expect, test } from 'vitest'
import { fixtureContent, makeCharacter, makeState } from '../test-fixtures'
import { carryCapacity, load, memberCapacity, overloadExcess } from './capacity'
import { CARRY_BASE_KG, OVERLOAD_RATIO } from '../constants'

const content = fixtureContent()
const withStr = (str: number, exhaustion = 0) =>
  makeCharacter({ abilities: { str, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, exhaustion })

describe('memberCapacity', () => {
  test('STR 8, 10 and 18 carry 0.8×, 1× and 1.8×; STR 30 caps at 2.25×', () => {
    expect(memberCapacity(withStr(8))).toBeCloseTo(0.8 * CARRY_BASE_KG)
    expect(memberCapacity(withStr(10))).toBe(CARRY_BASE_KG)
    expect(memberCapacity(withStr(18))).toBeCloseTo(1.8 * CARRY_BASE_KG)
    expect(memberCapacity(withStr(30))).toBeCloseTo(2.25 * CARRY_BASE_KG)
  })

  test('an exhausted member (level 3+) carries half', () => {
    expect(memberCapacity(withStr(10, 2))).toBe(CARRY_BASE_KG)
    expect(memberCapacity(withStr(10, 3))).toBe(CARRY_BASE_KG / 2)
  })
})

describe('carryCapacity', () => {
  const two = { party: [withStr(10), { ...withStr(10), id: 'b' }] }

  test('the sum over members able to act', () => {
    expect(carryCapacity(makeState(two), content)).toBe(2 * CARRY_BASE_KG)
    const down = makeState({ party: [withStr(10), { ...withStr(10), id: 'b', hp: 0 }] })
    expect(carryCapacity(down, content)).toBe(CARRY_BASE_KG)
  })

  test('a mule raises it, and a cart only with a mule to pull it', () => {
    const base = carryCapacity(makeState(two), content)
    expect(carryCapacity(makeState({ ...two, animals: { mule: 1 } }), content)).toBe(base + 100)
    expect(carryCapacity(makeState({ ...two, animals: { cart: 1 } }), content)).toBe(base)
    expect(carryCapacity(makeState({ ...two, animals: { cart: 2, mule: 1 } }), content)).toBe(
      base + 300
    )
  })

  test('hired mounts add their capacity', () => {
    const base = carryCapacity(makeState(two), content)
    expect(carryCapacity(makeState(two), content, { animal: 'riding-horse', count: 2 })).toBe(
      base + 100
    )
  })
})

describe('load', () => {
  const party = [withStr(10)]

  test('light, encumbered above capacity, overloaded above OVERLOAD_RATIO', () => {
    // food weighs 1 kg in the fixture
    expect(load(makeState({ party, goods: { food: 20 } }), content)).toEqual({
      weight: 20,
      capacity: 20,
      ratio: 1,
      level: 'light',
    })
    expect(load(makeState({ party, goods: { food: 21 } }), content).level).toBe('encumbered')
    expect(load(makeState({ party, goods: { food: 30 } }), content).level).toBe('encumbered')
    const heavy = load(makeState({ party, goods: { food: 34 } }), content)
    expect(heavy.level).toBe('overloaded')
    expect(overloadExcess(heavy)).toBe(34 - 20 * OVERLOAD_RATIO)
  })

  test('previews other goods', () => {
    expect(load(makeState({ party, goods: {} }), content, { goods: { food: 25 } }).level).toBe(
      'encumbered'
    )
  })
})
