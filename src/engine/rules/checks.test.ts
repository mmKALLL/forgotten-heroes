import { describe, expect, test } from 'vitest'
import { createRng } from '../rng'
import { TIERS, rollCheck, successChance, tierFor, tierOdds } from './checks'

const sum = (odds: Record<string, number>) => Object.values(odds).reduce((a, b) => a + b, 0)

describe('tierFor', () => {
  test('natural 1 and 20 override the total', () => {
    expect(tierFor(1, 30, 10)).toBe('critFail')
    expect(tierFor(20, 5, 30)).toBe('critSuccess')
  })
  test('success, partial and fail bands', () => {
    expect(tierFor(11, 11, 11)).toBe('success')
    expect(tierFor(8, 8, 11)).toBe('partial')
    expect(tierFor(7, 7, 11)).toBe('fail')
  })
})

describe('tierOdds', () => {
  test('modifier +0 vs DC 11, normal roll', () => {
    const odds = tierOdds(0, 11, 'normal')
    expect(odds.critFail).toBeCloseTo(1 / 20)
    expect(odds.fail).toBeCloseTo(6 / 20) // d20 2..7
    expect(odds.partial).toBeCloseTo(3 / 20) // d20 8..10
    expect(odds.success).toBe(9 / 20) // d20 11..19
    expect(odds.critSuccess).toBeCloseTo(1 / 20)
    expect(successChance(odds)).toBeCloseTo(0.5)
  })

  test('an out-of-reach DC still leaves the natural 20', () => {
    const odds = tierOdds(5, 25, 'normal')
    expect(odds.success).toBe(0)
    expect(odds.critSuccess).toBeCloseTo(1 / 20)
    expect(odds.partial).toBeCloseTo(3 / 20) // totals 22..24
  })

  test('advantage and disadvantage crit rates', () => {
    expect(tierOdds(0, 11, 'advantage').critSuccess).toBeCloseTo(39 / 400)
    expect(tierOdds(0, 11, 'advantage').critFail).toBeCloseTo(1 / 400)
    expect(tierOdds(0, 11, 'disadvantage').critFail).toBeCloseTo(39 / 400)
    expect(tierOdds(0, 11, 'disadvantage').critSuccess).toBeCloseTo(1 / 400)
  })

  test.each(['normal', 'advantage', 'disadvantage'] as const)('%s odds sum to 1', (mode) => {
    for (const dc of [5, 10, 15, 20, 25]) expect(sum(tierOdds(3, dc, mode))).toBeCloseTo(1)
  })
})

describe('rollCheck', () => {
  const keptDie = {
    normal: (dice: number[]) => dice[0],
    advantage: (dice: number[]) => Math.max(...dice),
    disadvantage: (dice: number[]) => Math.min(...dice),
  }

  test.each(['normal', 'advantage', 'disadvantage'] as const)(
    '%s result is consistent with tierFor',
    (mode) => {
      let rng = createRng(11)
      for (let i = 0; i < 200; i++) {
        const [roll, next] = rollCheck(rng, 2, 13, mode)
        expect(roll.dice).toHaveLength(mode === 'normal' ? 1 : 2)
        expect(roll.kept).toBe(keptDie[mode](roll.dice))
        expect(roll.total).toBe(roll.kept + 2)
        expect(roll.tier).toBe(tierFor(roll.kept, roll.total, 13))
        rng = next
      }
    }
  )

  test('empirical frequencies match exact odds', () => {
    const counts = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<string, number>
    let rng = createRng(2024)
    const n = 20000
    for (let i = 0; i < n; i++) {
      const [roll, next] = rollCheck(rng, 0, 11, 'normal')
      counts[roll.tier]++
      rng = next
    }
    const exact = tierOdds(0, 11, 'normal')
    for (const t of TIERS) expect(Math.abs(counts[t] / n - exact[t])).toBeLessThan(0.015)
  })
})
