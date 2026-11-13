import { describe, expect, test } from 'vitest'
import { roleStats } from '../engine/combat/start'
import { classIssues, combatIssues, fightCoverageIssues } from '../engine/combat/validate'
import type { Dice } from '../schema/combat'
import type { Creature } from '../schema/encounter'
import { ENEMY_ROLES, type EnemyRole } from '../schema/types'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()

describe('combat content (Plan 7)', () => {
  test('every reference resolves: roles, starting gear, fight creatures, classes, summons', () => {
    expect(combatIssues(content)).toEqual([])
  })

  test('Fight on the line (Track I): every climax names its boss, every fight-like scene its foes', () => {
    expect(fightCoverageIssues(content)).toEqual([])
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

  // Plan 7 Track N: the role tables are tuned later (Track B), so these hold relationships only.
  const average = (d: Dice) => (d.count * (d.die + 1)) / 2 + d.bonus
  const at = (role: EnemyRole, cr: number) =>
    roleStats(content, { role, cr } as Pick<Creature, 'role' | 'cr'> as Creature)
  const crs = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 20 }, (_, i) => i + 1), 24, 30]

  test('every role has rows from CR 0 to past 20', () => {
    for (const role of ENEMY_ROLES) {
      const rows = content.enemyRoles[role].stats
      expect(rows[0].cr).toBe(0)
      expect(rows.at(-1)!.cr).toBeGreaterThan(20)
    }
  })

  test('HP and damage rise with CR, and to-hit and AC never fall', () => {
    for (const role of ENEMY_ROLES) {
      for (let i = 1; i < crs.length; i++) {
        const [a, b] = [at(role, crs[i - 1]), at(role, crs[i])]
        expect(b.hp, `${role} HP at CR ${crs[i]}`).toBeGreaterThanOrEqual(a.hp)
        expect(average(b.damage), `${role} damage at CR ${crs[i]}`).toBeGreaterThanOrEqual(
          average(a.damage)
        )
        expect(b.toHit).toBeGreaterThanOrEqual(a.toHit)
        expect(b.ac).toBeGreaterThanOrEqual(a.ac)
      }
      expect(at(role, 20).hp).toBeGreaterThan(3 * at(role, 1).hp)
      expect(average(at(role, 20).damage)).toBeGreaterThan(5 * average(at(role, 1).damage))
    }
  })

  test('the roles differ as designed at every CR from 1', () => {
    for (const cr of crs.filter((c) => c >= 1)) {
      const s = Object.fromEntries(ENEMY_ROLES.map((r) => [r, at(r, cr)])) as Record<
        EnemyRole,
        ReturnType<typeof at>
      >
      // Brutes are the toughest and hit the hardest; archers and casters are frail; a swarm's
      // units are the frailest of all.
      for (const other of ENEMY_ROLES.filter((r) => r !== 'brute')) {
        expect(s.brute.hp, `brute vs ${other} HP at CR ${cr}`).toBeGreaterThan(s[other].hp)
        expect(average(s.brute.damage)).toBeGreaterThan(average(s[other].damage))
      }
      expect(s.archer.hp).toBeLessThan(s.skirmisher.hp)
      expect(s.caster.hp).toBeLessThan(s.archer.hp)
      expect(s.swarm.hp).toBeLessThan(s.caster.hp)
      // Skirmishers and leaders are harder to hit than brutes; casters are the easiest.
      expect(s.skirmisher.ac).toBeGreaterThan(s.brute.ac)
      expect(s.leader.ac).toBeGreaterThan(s.brute.ac)
      for (const other of ENEMY_ROLES.filter((r) => r !== 'caster'))
        expect(s.caster.ac).toBeLessThanOrEqual(s[other].ac)
      // Casters and leaders hold their nerve best; brutes and swarms worst.
      expect(s.leader.wis).toBeGreaterThan(s.brute.wis)
      expect(s.caster.wis).toBeGreaterThan(s.swarm.wis)
    }
  })

  test('bosses are leaders or brutes with a signature move and a trick', () => {
    const bosses = Object.values(content.creatures).filter((c) => c.signature)
    expect(bosses.length).toBeGreaterThanOrEqual(20)
    for (const boss of bosses) {
      expect(['leader', 'brute']).toContain(boss.role)
      expect(boss.trick).toBeDefined()
      expect(boss.signature!.when).toBe('desperate')
      expect(boss.roads).toBe(false)
    }
  })

  test('every authored dungeon has a boss at its CR, and so does every Crisis key', () => {
    const bossCrs = new Set(
      Object.values(content.creatures)
        .filter((c) => c.signature)
        .map((c) => c.cr)
    )
    for (const dungeon of Object.values(content.dungeons))
      expect(bossCrs.has(dungeon.cr), `a boss at CR ${dungeon.cr}`).toBe(true)
    for (const villain of Object.values(content.villains))
      for (const act of villain.acts) expect(bossCrs.has(act.keyCr)).toBe(true)
  })
})
