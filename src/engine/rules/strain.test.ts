import { describe, expect, test } from 'vitest'
import type { Skill } from '../../schema/constants'
import type { SkillUse } from '../../schema/state'
import { SKILL_USE_DAYS } from '../encounters/run'
import { brom, lyra } from '../test-fixtures'
import { rankActors, statModifier } from './character'
import {
  STRAIN_WEEK_DAYS,
  addStrain,
  fadeStrain,
  fadeStrainAfter,
  strainFrom,
  strainOf,
  strainedOn,
} from './strain'

const use = (day: number, skill: Skill = 'athletics', characterId = 'brom'): SkillUse => ({
  day,
  characterId,
  skill,
})

describe('strainFrom', () => {
  test('the third use of a skill in a day strains, and so does each later one', () => {
    expect(strainFrom([use(4), use(4)], 'brom', 'athletics', 4)).toBe(false)
    expect(strainFrom([use(4), use(4), use(4)], 'brom', 'athletics', 4)).toBe(true)
    expect(strainFrom([use(4), use(4), use(4), use(4)], 'brom', 'athletics', 4)).toBe(true)
  })

  test('other skills, other characters and other days count separately', () => {
    const uses = [use(4), use(4, 'stealth'), use(4, 'athletics', 'lyra'), use(3)]
    expect(strainFrom(uses, 'brom', 'athletics', 4)).toBe(false)
  })

  test('the tenth use within seven days strains', () => {
    // Days 1–3 twice, days 4–7 once: 10 uses, never 3 in a day.
    const week = [1, 2, 3, 4, 5, 6, 7].flatMap((day) =>
      day <= 3 ? [use(day), use(day)] : [use(day)]
    )
    expect(strainFrom(week, 'brom', 'athletics', 7)).toBe(true)
    expect(strainFrom(week.slice(1), 'brom', 'athletics', 7)).toBe(false)
    expect(strainFrom(week, 'brom', 'athletics', 8)).toBe(false) // day 1 has left the week
  })

  test('skill uses are kept at least as long as the week Strain looks back', () => {
    expect(SKILL_USE_DAYS).toBeGreaterThanOrEqual(STRAIN_WEEK_DAYS)
  })
})

describe('strain stacks', () => {
  test('each stack is −1 to that skill only', () => {
    const strained = addStrain(addStrain(brom, 'athletics'), 'athletics')
    expect(strained.strain).toEqual({ athletics: 2 })
    expect(strainOf(strained, 'athletics')).toBe(2)
    expect(statModifier(strained, 'athletics')).toBe(statModifier(brom, 'athletics') - 2)
    expect(statModifier(strained, 'str')).toBe(statModifier(brom, 'str'))
    expect(statModifier(strained, 'intimidation')).toBe(statModifier(brom, 'intimidation'))
  })

  test('one stack per strained skill fades each day', () => {
    const tired = { ...brom, strain: { athletics: 2, stealth: 1 } }
    expect(fadeStrain(tired).strain).toEqual({ athletics: 1 })
    expect(fadeStrain(fadeStrain(tired)).strain).toEqual({})
  })

  test("a skill that gained a stack today keeps it through the day's fade", () => {
    const uses = [use(4), use(4), use(4), use(4, 'stealth')]
    expect(strainedOn(uses, 'brom', 4)).toEqual(['athletics'])
    expect(strainedOn(uses, 'brom', 5)).toEqual([])
    const tired = { ...brom, strain: { athletics: 2, stealth: 1 } }
    expect(fadeStrainAfter(tired, uses, 4).strain).toEqual({ athletics: 2 })
    expect(fadeStrainAfter(tired, uses, 5).strain).toEqual({ athletics: 1 })
  })

  test('enough strain hands the check to someone else', () => {
    // Athletics: Brom +5 (STR +3, proficient), Lyra −1.
    expect(rankActors([brom, lyra], 'athletics')[0].characterId).toBe('brom')
    const spent = { ...brom, strain: { athletics: 7 } }
    expect(rankActors([spent, lyra], 'athletics')[0].characterId).toBe('lyra')
  })
})
