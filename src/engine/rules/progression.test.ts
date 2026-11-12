import { describe, expect, test } from 'vitest'
import { MAX_LEVEL } from '../../schema/types'
import { XP_BY_LEVEL } from '../constants'
import { createRng, withRng } from '../rng'
import { step } from '../state'
import { brom, fixtureContent, lyra, makeState } from '../test-fixtures'
import { abilityModifier } from './abilities'
import { applyLevelUps, grantXp, levelFor, levelTo, levelUp, xpToNext } from './progression'

const sum = (scores: Record<string, number>) => Object.values(scores).reduce((a, b) => a + b, 0)

describe('the XP table', () => {
  test('has a threshold per level, starting at 0 and rising', () => {
    expect(XP_BY_LEVEL).toHaveLength(MAX_LEVEL)
    expect(XP_BY_LEVEL[0]).toBe(0)
    for (let i = 1; i < XP_BY_LEVEL.length; i++) {
      expect(XP_BY_LEVEL[i]).toBeGreaterThan(XP_BY_LEVEL[i - 1])
    }
  })

  test('levelFor and xpToNext follow it, and stop at the cap', () => {
    expect(levelFor(0)).toBe(1)
    expect(levelFor(XP_BY_LEVEL[2])).toBe(3)
    expect(levelFor(XP_BY_LEVEL[2] - 1)).toBe(2)
    expect(levelFor(XP_BY_LEVEL[MAX_LEVEL - 1] * 10)).toBe(MAX_LEVEL)
    expect(xpToNext({ ...brom, xp: 10 })).toBe(XP_BY_LEVEL[1] - 10)
    expect(xpToNext({ ...brom, level: MAX_LEVEL, xp: XP_BY_LEVEL[MAX_LEVEL - 1] })).toBeNull()
  })
})

describe('levelUp', () => {
  test('adds the hit die plus CON to HP, and a stat only on odd levels from 3rd', () => {
    const gain = brom.hitDie + abilityModifier(brom.abilities.con)
    let character = brom
    for (let level = 2; level <= MAX_LEVEL; level++) {
      const [{ character: next, lines }] = withRng(createRng(level), (d) => levelUp(character, d))
      expect(next.level).toBe(level)
      expect(next.maxHp - character.maxHp).toBe(gain)
      expect(next.hp - character.hp).toBe(gain)
      expect(sum(next.abilities) - sum(character.abilities)).toBe(level % 2 === 1 ? 1 : 0)
      expect(lines[0]).toMatch(new RegExp(`^Brom reaches level ${level}: \\+${gain} max HP`))
      character = next
    }
  })
})

describe('levelTo', () => {
  test('is deterministic for a seed and sets the XP to the threshold', () => {
    const [a] = withRng(createRng(7), (d) => levelTo(lyra, 5, d))
    const [b] = withRng(createRng(7), (d) => levelTo(lyra, 5, d))
    expect(a).toEqual(b)
    expect(a.level).toBe(5)
    expect(a.xp).toBe(XP_BY_LEVEL[4])
    expect(a.maxHp).toBeGreaterThan(lyra.maxHp)
  })
})

describe('grantXp and applyLevelUps', () => {
  test('grantXp gives every living member the amount, skips the dead and logs once', () => {
    const dead = { ...lyra, exhaustion: 6 }
    const state = makeState({ party: [brom, dead] })
    const after = grantXp(state, 65, 'Bandits on the ford')
    expect(after.party[0].xp).toBe(65)
    expect(after.party[1].xp).toBe(0)
    expect(after.party[0].level).toBe(1)
    expect(after.log.at(-1)?.text).toBe('+65 XP: Bandits on the ford')
  })

  test('enough XP for two levels gives two level-ups in one step', () => {
    const content = fixtureContent()
    const state = makeState({ party: [{ ...brom, xp: XP_BY_LEVEL[2] }, lyra] })
    const after = step(
      state,
      { type: 'practiceCheck', stat: 'athletics', dc: 10, mode: 'normal' },
      content
    )
    expect(after.party[0].level).toBe(3)
    expect(after.party[1].level).toBe(1)
    const lines = after.log.filter((e) => /reaches level/.test(e.text))
    expect(lines.map((e) => e.tone)).toEqual(['good', 'good'])
  })

  test('a character at the cap keeps gaining XP but not levels', () => {
    const top = { ...brom, level: MAX_LEVEL, xp: XP_BY_LEVEL[MAX_LEVEL - 1] }
    const after = applyLevelUps(grantXp(makeState({ party: [top] }), 5000, 'A long road'))
    expect(after.party[0].level).toBe(MAX_LEVEL)
    expect(after.party[0].xp).toBe(XP_BY_LEVEL[MAX_LEVEL - 1] + 5000)
  })

  test('no level-up leaves the state untouched', () => {
    const state = makeState()
    expect(applyLevelUps(state)).toBe(state)
  })
})
