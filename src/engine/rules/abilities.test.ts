import { describe, expect, test } from 'vitest'
import { formatModifier, formatPercent } from '../format'
import { abilityModifier, abilityOf, checkLabel, isSkill, proficiencyBonus, statLabel } from './abilities'

describe('abilities', () => {
  test.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [16, 3],
    [18, 4],
    [20, 5],
  ])('score %i has modifier %i', (score, mod) => {
    expect(abilityModifier(score)).toBe(mod)
  })

  test.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [20, 6],
  ])('level %i has proficiency +%i', (level, bonus) => {
    expect(proficiencyBonus(level)).toBe(bonus)
  })

  test('skills map to abilities; abilities map to themselves', () => {
    expect(abilityOf('persuasion')).toBe('cha')
    expect(abilityOf('sleightOfHand')).toBe('dex')
    expect(abilityOf('intimidation')).toBe('str') // designer change: DMG variant Strength (Intimidation)
    expect(abilityOf('con')).toBe('con')
    expect(isSkill('stealth')).toBe(true)
    expect(isSkill('str')).toBe(false)
  })

  test('isSkill ignores inherited object keys', () => {
    expect(isSkill('constructor' as never)).toBe(false)
    expect(isSkill('toString' as never)).toBe(false)
  })

  test('labels', () => {
    expect(statLabel('sleightOfHand')).toBe('Sleight of Hand')
    expect(statLabel('wis')).toBe('WIS')
  })

  test('check labels name an ability only when it overrides the default', () => {
    expect(checkLabel('intimidation', 'cha')).toBe('Intimidation (CHA)')
    expect(checkLabel('intimidation', 'str')).toBe('Intimidation')
    expect(checkLabel('persuasion')).toBe('Persuasion')
  })

  test('formatting', () => {
    expect(formatModifier(3)).toBe('+3')
    expect(formatModifier(0)).toBe('+0')
    expect(formatModifier(-2)).toBe('−2')
    expect(formatPercent(0.4999)).toBe('50%')
  })

  test.each([
    [0, '0%'],
    [1, '100%'],
    [0.0025, '<1%'],
    [0.9975, '>99%'],
  ])('formatPercent(%s) is %s', (p, text) => {
    expect(formatPercent(p)).toBe(text)
  })
})
