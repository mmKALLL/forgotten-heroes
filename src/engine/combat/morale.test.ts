import { describe, expect, test } from 'vitest'
import { createRng, withRng } from '../rng'
import { fleeChance, moraleThreshold, rollMorale } from './morale'

describe('morale', () => {
  test('it is tested at 1 left of 3–4, 2 of 5–8, 3 of 9 or more, and never for smaller groups', () => {
    expect([1, 2].map(moraleThreshold)).toEqual([null, null])
    expect([3, 4].map(moraleThreshold)).toEqual([1, 1])
    expect([5, 6, 7, 8].map(moraleThreshold)).toEqual([2, 2, 2, 2])
    expect([9, 12, 30].map(moraleThreshold)).toEqual([3, 3, 3])
  })

  test('the majority decides and a tie flees', () => {
    // WIS +0 against DC 11: each fails on 1–10, half the time.
    const half = [{ wis: 0 }]
    expect(fleeChance(half, 11)).toBeCloseTo(0.5)
    // Two: a tie (one fails) flees, so only both holding stays: 1 − 0.5².
    expect(fleeChance([...half, ...half], 11)).toBeCloseTo(0.75)
    // Three: two or more failures: 0.5.
    expect(fleeChance([...half, ...half, ...half], 11)).toBeCloseTo(0.5)
    // A natural 20 always holds, a natural 1 always fails.
    expect(fleeChance(half, 40)).toBeCloseTo(0.95)
    expect(fleeChance(half, -10)).toBeCloseTo(0.05)
  })

  test('a fiercer party (a higher DC) breaks them more often; the roll follows the odds', () => {
    const group = [{ wis: 1 }, { wis: 0 }, { wis: 2 }]
    expect(fleeChance(group, 14)).toBeGreaterThan(fleeChance(group, 10))
    const runs = 4000
    let fled = 0
    for (let seed = 0; seed < runs; seed++)
      if (withRng(createRng(seed), (d) => rollMorale(d, group, 13))[0]) fled++
    expect(Math.abs(fled / runs - fleeChance(group, 13))).toBeLessThan(0.03)
  })
})
