import { describe, expect, test } from 'vitest'
import { CheckOptionSchema } from '../../schema/encounter'
import { tierOdds } from '../rules/checks'
import { branchFor, isHighStakes, tierOutcome } from './outcomes'

const option = (overrides: object = {}) =>
  CheckOptionSchema.parse({
    id: 'jump',
    kind: 'check',
    label: 'Jump',
    check: { skill: 'acrobatics', dc: 12 },
    outcomes: {
      fail: { text: 'You fall.', effects: [{ effect: 'hp', amount: -4, target: 'actor' }] },
      partial: { text: 'Bruised.' },
      success: { text: 'Across.', twist: { text: 'Across, into an ambush.' } },
    },
    ...overrides,
  })

describe('tierOutcome and branchFor', () => {
  test('critical tiers fall back to fail and success', () => {
    expect(tierOutcome(option(), 'critFail').text).toBe('You fall.')
    expect(tierOutcome(option(), 'critSuccess').text).toBe('Across.')
  })

  test('the twist branch is used only when the twist is true and a branch exists', () => {
    const success = tierOutcome(option(), 'success')
    expect(branchFor(success, false).text).toBe('Across.')
    expect(branchFor(success, true).text).toBe('Across, into an ambush.')
    expect(branchFor(tierOutcome(option(), 'partial'), true).text).toBe('Bruised.')
  })
})

describe('isHighStakes', () => {
  test('a close call that can cost HP', () => {
    expect(isHighStakes(option(), tierOdds(0, 12, 'normal'))).toBe(true) // 45%
  })
  test('not when the odds are lopsided', () => {
    expect(isHighStakes(option(), tierOdds(8, 12, 'normal'))).toBe(false) // 85%
    expect(isHighStakes(option(), tierOdds(-5, 12, 'normal'))).toBe(false) // 20%
    expect(isHighStakes(option(), tierOdds(-4, 12, 'normal'))).toBe(true) // 25%: the band is inclusive
  })
  test('not when nothing costs HP, unless the content says so', () => {
    const safe = option({ outcomes: { fail: { text: 'No.' }, partial: { text: 'Meh.' }, success: { text: 'Yes.' } } })
    expect(isHighStakes(safe, tierOdds(0, 12, 'normal'))).toBe(false)
    expect(isHighStakes({ ...safe, highStakes: true }, tierOdds(8, 12, 'normal'))).toBe(true)
  })
  test('HP loss hidden in a twist branch counts', () => {
    const twisty = option({
      outcomes: {
        fail: { text: 'No.' },
        partial: { text: 'Meh.' },
        success: { text: 'Yes.', twist: { text: 'Ow.', effects: [{ effect: 'hp', amount: -1, target: 'all' }] } },
      },
    })
    expect(isHighStakes(twisty, tierOdds(0, 12, 'normal'))).toBe(true)
  })
})
