import { describe, expect, test } from 'vitest'
import { DICE_MAX_MS, flickerDelay, settleTimes } from './schedule'

describe('dice schedule', () => {
  test.each([
    [1, false],
    [2, false],
    [1, true],
    [2, true],
  ])('%i dice (high stakes: %s) settle in order within the time limit', (count, highStakes) => {
    const times = settleTimes(count, highStakes)
    expect(times).toHaveLength(count)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(Math.max(...times)).toBeLessThanOrEqual(DICE_MAX_MS)
  })

  test('a high-stakes roll holds the last die back longer', () => {
    const [, normalLast] = settleTimes(2, false)
    const [first, highLast] = settleTimes(2, true)
    expect(highLast).toBeGreaterThan(normalLast)
    expect(highLast - first).toBeGreaterThan(normalLast - first)
  })

  test('only the last high-stakes die slows its flicker, near the end', () => {
    expect(flickerDelay(1000, true)).toBe(flickerDelay(1000, false))
    expect(flickerDelay(200, true)).toBeGreaterThan(flickerDelay(200, false))
  })
})
