import { describe, expect, test } from 'vitest'
import { MAX_LEVEL } from '../../schema/types'
import { crDc, crLevel, levelGap } from './challenge'

describe('challenge ratings', () => {
  test('a higher CR never has a lower DC, and fractional CRs read as the CR below', () => {
    for (let cr = 1; cr <= 30; cr++) expect(crDc(cr)).toBeGreaterThanOrEqual(crDc(cr - 1))
    expect(crDc(18)).toBeGreaterThan(crDc(6))
    expect(crDc(0.5)).toBe(crDc(0))
    expect(crDc(-3)).toBe(crDc(0))
  })

  test('a CR is meant for the level after it, within the levels there are', () => {
    expect(crLevel(6)).toBe(7)
    expect(crLevel(0.25)).toBe(1)
    expect(crLevel(40)).toBe(MAX_LEVEL)
  })
})

test('a challenge one level beyond the party is a stretch, two or more beyond it', () => {
  expect(levelGap(5, 5)).toBe('ok')
  expect(levelGap(6, 5)).toBe('ok')
  expect(levelGap(4, 5)).toBe('stretch')
  expect(levelGap(3, 5)).toBe('beyond')
})
