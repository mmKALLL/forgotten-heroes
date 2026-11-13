import { describe, expect, test } from 'vitest'
import { classIssues, combatIssues } from '../engine/combat/validate'
import { ENEMY_ROLES } from '../schema/types'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()

describe('combat content (Plan 7)', () => {
  test('every reference resolves: roles, starting gear, fight creatures, classes, summons', () => {
    expect(combatIssues(content)).toEqual([])
  })

  test('classes and gear (Track C): priced, weighted, playable abilities, enough to pick', () => {
    expect(classIssues(content)).toEqual([])
    // The eight families in the four qualities, and the four armours.
    expect(Object.keys(content.weapons)).toHaveLength(32)
    expect(Object.keys(content.armours)).toHaveLength(4)
    for (const role of ['weapons-shop', 'armourer', 'blacksmith'])
      expect(content.serviceRoles[role].arms).toBeDefined()
  })

  test('every creature has a role with stats and a size', () => {
    for (const creature of Object.values(content.creatures)) {
      expect(ENEMY_ROLES).toContain(creature.role)
      expect(content.enemyRoles[creature.role].stats.length).toBeGreaterThan(0)
      expect(creature.size).toBeTruthy()
    }
  })
})
