import { describe, expect, test } from 'vitest'
import { combatIssues } from './validate'
import { combatFixtureContent } from '../test-fixtures'

describe('combatIssues', () => {
  test('the fixture content is clean', () => {
    expect(combatIssues(combatFixtureContent())).toEqual([])
  })

  test('reports a missing role, unknown gear, fight creatures, classes and summons', () => {
    const content = combatFixtureContent()
    const { swarm: _swarm, ...roles } = content.enemyRoles
    const { mace: _mace, ...weapons } = content.weapons
    const fight = content.situations['test-fight']
    const broken = {
      ...content,
      enemyRoles: roles,
      weapons,
      situations: {
        ...content.situations,
        'test-fight': {
          ...fight,
          fight: { ...fight.fight!, enemies: [{ creature: 'nobody', count: 1, boss: false }] },
        },
      },
      classAbilities: {
        x: {
          id: 'x',
          name: 'X',
          classId: 'monk',
          level: 2,
          description: '',
          target: 'self' as const,
          range: [0, 0] as [number, number],
          action: 'action' as const,
          effects: [{ effect: 'summon' as const, summon: 'ghost' }],
          source: 'claude' as const,
          file: 'x.json',
        },
      },
    }
    expect(combatIssues(broken)).toEqual([
      'enemy role "swarm" has no stats',
      'starting gear of cleric: unknown weapon "mace"',
      'situation test-fight: fight: unknown creature "nobody"',
      'class ability x: unknown class "monk"',
      'class ability x: unknown summon "ghost"',
    ])
  })
})
