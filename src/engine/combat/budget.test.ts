import { describe, expect, test } from 'vitest'
import { ROAD_FIGHT_MAX } from '../constants'
import { crXp, fightBudget, groupFactor, groupXp, roadFightCount } from './budget'

describe('the CR budget', () => {
  test('a creature is worth more XP the higher its CR, past the table too', () => {
    const crs = [0, 0.125, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 32]
    for (let i = 1; i < crs.length; i++) expect(crXp(crs[i])).toBeGreaterThan(crXp(crs[i - 1]))
    // An unlisted CR counts as the listed one below it.
    expect(crXp(0.3)).toBe(crXp(0.25))
  })

  test('the budget grows with the levels, the members and the difficulty', () => {
    expect(fightBudget([5, 5, 5], 'medium')).toBeGreaterThan(fightBudget([4, 4, 4], 'medium'))
    expect(fightBudget([5, 5, 5, 5], 'medium')).toBeGreaterThan(fightBudget([5, 5, 5], 'medium'))
    const levels = [3, 3]
    expect(fightBudget(levels, 'easy')).toBeLessThan(fightBudget(levels, 'medium'))
    expect(fightBudget(levels, 'hard')).toBeGreaterThan(fightBudget(levels, 'medium'))
  })

  test('a group costs more than its XP alone, and more so for a small party', () => {
    expect(groupXp([1], 4)).toBe(crXp(1))
    expect(groupXp([1, 1, 1], 4)).toBeGreaterThan(3 * crXp(1))
    expect(groupFactor(3, 2)).toBeGreaterThan(groupFactor(3, 4))
    expect(groupFactor(3, 6)).toBeLessThan(groupFactor(3, 4))
    for (let n = 2; n <= 16; n++)
      expect(groupFactor(n, 4)).toBeGreaterThanOrEqual(groupFactor(n - 1, 4))
  })

  test('a road Fight fields more foes for a stronger party and fewer of a stronger creature', () => {
    const party = [3, 3, 3, 3]
    expect(roadFightCount(0.25, party)).toBeGreaterThan(roadFightCount(1, party))
    expect(roadFightCount(0.25, [6, 6, 6, 6])).toBeGreaterThanOrEqual(roadFightCount(0.25, party))
    expect(roadFightCount(0.5, party, 'hard')).toBeGreaterThan(roadFightCount(0.5, party, 'easy'))
    // Always at least one, never more than the line holds; the group fits the budget when it can.
    expect(roadFightCount(20, [1, 1])).toBe(1)
    expect(roadFightCount(0, [20, 20, 20, 20])).toBe(ROAD_FIGHT_MAX)
    const n = roadFightCount(0.5, party)
    expect(groupXp(Array(n).fill(0.5), 4)).toBeLessThanOrEqual(fightBudget(party, 'medium'))
  })
})
