import { sortedEntries, type Content } from '../../content/build'
import type { CombatEffect } from '../../schema/combat'
import { ENEMY_ROLES } from '../../schema/types'
import { FALLBACK_GEAR, STARTING_GEAR } from '../constants'

// Combat content references (Plan 7 Track T): the schemas check shapes; this checks that what a
// fight, a class ability or a spell names exists. `pnpm test` runs it on the bundled content.

/**
 * Bosses (combat design §6): a creature with boss moves is a leader or a brute with both a
 * signature move and a second trick, and the creatures its moves call exist.
 */
export function bossIssues(content: Content): string[] {
  const issues: string[] = []
  for (const creature of sortedEntries(content.creatures)) {
    const moves = [creature.signature, creature.trick].filter((m) => m !== undefined)
    if (moves.length === 0) continue
    const at = `creature ${creature.id}`
    if (moves.length < 2) issues.push(`${at}: a boss needs both a signature move and a trick`)
    if (creature.role !== 'leader' && creature.role !== 'brute')
      issues.push(`${at}: a boss is a leader or a brute, not a ${creature.role}`)
    for (const move of moves)
      for (const rider of move.riders)
        if (rider.effect === 'call' && !Object.hasOwn(content.creatures, rider.creature))
          issues.push(`${at}: ${move.name} calls unknown creature "${rider.creature}"`)
  }
  return issues
}

/** Problems with combat references: missing roles, gear, creatures, classes or summons. */
export function combatIssues(content: Content): string[] {
  const issues: string[] = []
  for (const role of ENEMY_ROLES)
    if (!Object.hasOwn(content.enemyRoles, role)) issues.push(`enemy role "${role}" has no stats`)
  const gear = [...Object.entries(STARTING_GEAR), ['(any other class)', FALLBACK_GEAR] as const]
  for (const [cls, { weapon, armour }] of gear) {
    if (!Object.hasOwn(content.weapons, weapon))
      issues.push(`starting gear of ${cls}: unknown weapon "${weapon}"`)
    if (!Object.hasOwn(content.armours, armour))
      issues.push(`starting gear of ${cls}: unknown armour "${armour}"`)
  }
  for (const situation of sortedEntries(content.situations)) {
    for (const enemy of situation.fight?.enemies ?? []) {
      if (!Object.hasOwn(content.creatures, enemy.creature))
        issues.push(`situation ${situation.id}: fight: unknown creature "${enemy.creature}"`)
      else if (enemy.boss && !content.creatures[enemy.creature].signature)
        issues.push(
          `situation ${situation.id}: fight: boss "${enemy.creature}" has no signature move`
        )
    }
  }
  issues.push(...bossIssues(content))
  const summons = (at: string, effects: readonly CombatEffect[]) => {
    for (const e of effects)
      if (e.effect === 'summon' && !Object.hasOwn(content.summons, e.summon))
        issues.push(`${at}: unknown summon "${e.summon}"`)
  }
  for (const ability of sortedEntries(content.classAbilities)) {
    const at = `class ability ${ability.id}`
    if (!Object.hasOwn(content.classes, ability.classId))
      issues.push(`${at}: unknown class "${ability.classId}"`)
    summons(at, ability.effects)
  }
  for (const spell of sortedEntries(content.spells)) summons(`spell ${spell.id}`, spell.effects)
  return issues
}
