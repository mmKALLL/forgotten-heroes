import { describe, expect, test } from 'vitest'
import type { Spell, Summon } from '../schema/combat'
import { SPELL_POOLS } from '../schema/types'
import { loadBundledContent } from './bundled'

// The spell pools (Plan 7 Track S, combat design §5): their sizes, their damage share and their
// variety. Shares are bands and relationships, not pinned values, so the pools can be retuned.

const content = loadBundledContent()
const spells = Object.values(content.spells)
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const isDamage = (s: Spell) => s.effects.some((e) => e.effect === 'damage' || e.effect === 'hazard')
const atLevel = (pool: string, level: number) =>
  spells.filter((s) => s.pool === pool && s.level === level)
const share = (pool: string, level: number) => {
  const all = atLevel(pool, level)
  return all.filter(isDamage).length / all.length
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe.each(SPELL_POOLS)('the %s pool', (pool) => {
  test('levels 1–6 hold 5–8 spells, levels 7–9 hold 4–6', () => {
    for (const level of LEVELS) {
      const [min, max] = level <= 6 ? [5, 8] : [4, 6]
      const n = atLevel(pool, level).length
      expect(n, `level ${level}`).toBeGreaterThanOrEqual(min)
      expect(n, `level ${level}`).toBeLessThanOrEqual(max)
    }
  })

  test('about half deal damage at levels 1–3, falling toward a quarter', () => {
    for (const level of [1, 2, 3]) {
      expect(share(pool, level), `level ${level}`).toBeGreaterThanOrEqual(0.35)
      expect(share(pool, level), `level ${level}`).toBeLessThanOrEqual(0.65)
    }
    for (const level of [7, 8, 9]) {
      expect(share(pool, level), `level ${level}`).toBeGreaterThanOrEqual(0.15)
      expect(share(pool, level), `level ${level}`).toBeLessThanOrEqual(0.4)
    }
    const low = mean([1, 2, 3].map((l) => share(pool, l)))
    const mid = mean([4, 5, 6].map((l) => share(pool, l)))
    const high = mean([7, 8, 9].map((l) => share(pool, l)))
    expect(low).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(high)
  })

  test('no two spells of a level do the same thing', () => {
    for (const level of LEVELS) {
      const shapes = atLevel(pool, level).map((s) =>
        [s.target, s.roll?.roll ?? 'none', ...s.effects.map((e) => e.effect).sort()].join(' ')
      )
      expect(new Set(shapes).size, `level ${level}: ${shapes.join(' | ')}`).toBe(shapes.length)
    }
  })
})

describe('summons', () => {
  const flavour = (evil: boolean) =>
    Object.values(content.summons)
      .filter((s) => (s.kind === 'undead') === evil)
      .sort((a, b) => a.level - b.level)

  test.each([false, true])('one per divine level in each flavour (evil: %s)', (evil) => {
    expect(flavour(evil).map((s) => s.level)).toEqual(LEVELS)
  })

  test.each([false, true])('grow stronger with the level (evil: %s)', (evil) => {
    const tiers = flavour(evil)
    const avg = (s: Summon) => s.damage.count * (s.damage.die + 1) * 0.5 + s.damage.bonus
    for (let i = 1; i < tiers.length; i++) {
      const [was, now] = [tiers[i - 1], tiers[i]]
      expect(now.hp, now.id).toBeGreaterThanOrEqual(was.hp)
      expect(now.toHit, now.id).toBeGreaterThanOrEqual(was.toHit)
      expect(avg(now), now.id).toBeGreaterThanOrEqual(avg(was))
    }
  })
})
