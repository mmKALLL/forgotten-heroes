import { describe, expect, test } from 'vitest'
import { SpellSchema, SummonSchema, type Spell, type Summon } from '../../schema/combat'
import { combatIssues, spellIssues } from './validate'
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
          rounds: 1,
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

describe('spellIssues', () => {
  const summon = (id: string, level: number, kind: Summon['kind']) => ({
    ...SummonSchema.parse({ id, name: id, level, kind, hp: 10, ac: 12, toHit: 3, damage: dice }),
    source: 'claude' as const,
    file: 'x.json',
  })
  const spell = (id: string, pool: Spell['pool'], level: number, good: string, evil?: string) => ({
    ...SpellSchema.parse({
      id,
      name: id,
      pool,
      level,
      description: '',
      target: 'tile',
      effects: [{ effect: 'summon', summon: good, ...(evil ? { evil } : {}) }],
    }),
    source: 'claude' as const,
    file: 'x.json',
  })
  const dice = { count: 1, die: 6 }
  const summons = {
    hound: summon('hound', 1, 'beast'),
    bones: summon('bones', 1, 'undead'),
    angel: summon('angel', 2, 'celestial'),
  }

  test('one calling per divine level, of its level, with an undead for evil casters', () => {
    expect(
      spellIssues({ spells: { a: spell('a', 'divine', 1, 'hound', 'bones') }, summons })
    ).toEqual([])
    const spells = {
      a: spell('a', 'divine', 1, 'bones', 'hound'),
      b: spell('b', 'divine', 1, 'angel'),
      c: spell('c', 'arcane', 2, 'angel', 'bones'),
    }
    expect(spellIssues({ spells, summons })).toEqual([
      'spell a: "bones" is undead (it goes in `evil`)',
      'spell a: "hound" (evil) is not undead',
      'spell b: summon "angel" is level 2, not 1',
      'spell b: no undead for evil casters',
      'spell c: only divine spells summon',
      'spell c: summon "bones" is level 1, not 2',
      'divine level 1: 2 summoning spells, not 1 (a, b)',
    ])
  })
})
