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
    const [draws] = withRng(createRng(9), (d) => [d.int(1, 1000), d.int(1, 1000)])
    expect([first, second]).toEqual(draws)
  })

  test.each([
    [1.5, 3],
    [1, 2.5],
    [5, 4],
    [Number.NaN, 3],
  ])('int(%d, %d) throws a RangeError', (min, max) => {
    expect(() => nextInt(createRng(1), min, max)).toThrow(RangeError)
  })

  test('int(min, min) always returns min', () => {
    const [values] = withRng(createRng(1), (d) => Array.from({ length: 20 }, () => d.int(4, 4)))
    expect(new Set(values)).toEqual(new Set([4]))
  })

  test('a Draw leaked out of withRng cannot be used afterwards', () => {
    const [leaked] = withRng(createRng(1), (d) => d)
    expect(() => leaked.float()).toThrow(/finished/)
    expect(() => leaked.int(1, 6)).toThrow(/finished/)
    expect(() => leaked.pick([1, 2])).toThrow(/finished/)
    expect(() => leaked.weighted([1, 2], (n) => n)).toThrow(/finished/)
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

  test('weighted picks in proportion to weight', () => {
    const items = [
      { id: 'light', w: 1 },
      { id: 'heavy', w: 3 },
    ]
    const n = 4000
    const [picks] = withRng(createRng(31), (d) =>
      Array.from({ length: n }, () => d.weighted(items, (i) => i.w).id)
    )
    const lightShare = picks.filter((id) => id === 'light').length / n
    expect(Math.abs(lightShare - 0.25)).toBeLessThan(0.03)
  })
})
