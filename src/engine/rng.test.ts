import { describe, expect, test } from 'vitest'
import { createRng, nextFloat, nextInt, pick, withRng } from './rng'

describe('rng', () => {
  test('same seed gives the same sequence', () => {
    const a = withRng(createRng(42), (d) => [d.float(), d.float(), d.float()])
    const b = withRng(createRng(42), (d) => [d.float(), d.float(), d.float()])
    expect(a).toEqual(b)
  })

  test('different seeds diverge', () => {
    const [a] = nextFloat(createRng(1))
    const [b] = nextFloat(createRng(2))
    expect(a).not.toBe(b)
  })

  test('does not mutate the input state', () => {
    const rng = createRng(7)
    nextFloat(rng)
    expect(rng).toEqual(createRng(7))
  })

  test('nextInt covers the inclusive range and nothing else', () => {
    const [values] = withRng(createRng(3), (d) => Array.from({ length: 5000 }, () => d.int(1, 20)))
    expect(Math.min(...values)).toBe(1)
    expect(Math.max(...values)).toBe(20)
    expect(new Set(values).size).toBe(20)
  })

  test('nextInt threads state', () => {
    const [first, rng] = nextInt(createRng(9), 1, 1000)
    const [second] = nextInt(rng, 1, 1000)
    const [again] = nextInt(createRng(9), 1, 1000)
    expect(first).toBe(again)
    expect(second).not.toBeUndefined()
  })

  test('pick throws on an empty list', () => {
    expect(() => pick(createRng(1), [])).toThrow(/empty/)
  })

  test('weighted never picks zero-weight items', () => {
    const items = [
      { id: 'never', w: 0 },
      { id: 'always', w: 5 },
    ]
    const [picks] = withRng(createRng(5), (d) =>
      Array.from({ length: 500 }, () => d.weighted(items, (i) => i.w).id)
    )
    expect(new Set(picks)).toEqual(new Set(['always']))
  })
})
