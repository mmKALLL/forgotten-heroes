import { describe, expect, test } from 'vitest'
import { combatIssues } from '../engine/combat/validate'
import { ENEMY_ROLES } from '../schema/types'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()

describe('combat content (Plan 7)', () => {
  test('every reference resolves: roles, starting gear, fight creatures, classes, summons', () => {
    expect(combatIssues(content)).toEqual([])
  })

  test('every creature has a role with stats and a size', () => {
    for (const creature of Object.values(content.creatures)) {
      expect(ENEMY_ROLES).toContain(creature.role)
      expect(content.enemyRoles[creature.role].stats.length).toBeGreaterThan(0)
      expect(creature.size).toBeTruthy()
    }
  })
})
