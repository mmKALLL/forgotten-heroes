import { sortedEntries, type Content } from '../../content/build'
import type { CombatEffect } from '../../schema/combat'
import { ENEMY_ROLES } from '../../schema/types'
import { FALLBACK_GEAR, STARTING_GEAR } from '../constants'

// Combat content references (Plan 7 Track T): the schemas check shapes; this checks that what a
// fight, a class ability or a spell names exists. `pnpm test` runs it on the bundled content.

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
    for (const enemy of situation.fight?.enemies ?? [])
      if (!Object.hasOwn(content.creatures, enemy.creature))
        issues.push(`situation ${situation.id}: fight: unknown creature "${enemy.creature}"`)
  }
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
