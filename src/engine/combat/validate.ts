import { sortedEntries, type Content } from '../../content/build'
import type { CombatEffect } from '../../schema/combat'
import { ENEMY_ROLES } from '../../schema/types'
import { CLASS_PICKS, FALLBACK_GEAR, STARTING_GEAR } from '../constants'
import { allSituations, compileSituation } from '../encounters/compile'
import type { Climax } from '../../schema/common'

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
  issues.push(...fightIssues(content))
  const summons = (at: string, effects: readonly CombatEffect[]) => {
    for (const e of effects) {
      if (e.effect !== 'summon') continue
      for (const id of [e.summon, ...(e.evil ? [e.evil] : [])])
        if (!Object.hasOwn(content.summons, id)) issues.push(`${at}: unknown summon "${id}"`)
    }
  }
  for (const ability of sortedEntries(content.classAbilities)) {
    const at = `class ability ${ability.id}`
    if (!Object.hasOwn(content.classes, ability.classId))
      issues.push(`${at}: unknown class "${ability.classId}"`)
    summons(at, ability.effects)
  }
  for (const spell of sortedEntries(content.spells)) summons(`spell ${spell.id}`, spell.effects)
  issues.push(...spellIssues(content))
  return issues
}

/** The effects the engine plays in class abilities (combat/abilities.ts). */
const PLAYED_IN_ABILITIES: readonly CombatEffect['effect'][] = [
  'heal',
  'healPool',
  'damage',
  'move',
  'extraAction',
  'mark',
  'rollDie',
  'toHit',
  'damageBonus',
  'fear',
  'discord',
]

/**
 * Track C's content (Plan 7): every weapon and armour has a price and a weight, every class
 * ability uses only effects the engine plays (its specialisation too), Smite-like abilities
 * (`spends: "spell"`) are weapon attacks, and each class with picks has something to pick.
 */
export function classIssues(content: Content): string[] {
  const issues: string[] = []
  for (const piece of [...sortedEntries(content.weapons), ...sortedEntries(content.armours)]) {
    if (piece.price === undefined) issues.push(`${piece.id}: no price`)
    if (piece.weight === undefined) issues.push(`${piece.id}: no weight`)
  }
  for (const ability of sortedEntries(content.classAbilities)) {
    const at = `class ability ${ability.id}`
    for (const e of [...ability.effects, ...(ability.specialised?.effects ?? [])])
      if (!PLAYED_IN_ABILITIES.includes(e.effect))
        issues.push(`${at}: the engine doesn't play "${e.effect}" in abilities`)
    if (ability.spends === 'spell' && ability.roll?.roll !== 'weapon')
      issues.push(`${at}: spending a spell use needs a weapon roll`)
  }
  for (const [classId, { kind }] of Object.entries(CLASS_PICKS)) {
    if (kind !== 'specialise') continue
    const songs = sortedEntries(content.classAbilities).filter(
      (a) => a.classId === classId && a.specialised
    )
    if (songs.length < CLASS_PICKS[classId].levels.length)
      issues.push(`${classId}: ${songs.length} abilities to specialise, fewer than its picks`)
  }
  return issues
}

/**
 * The spell pools' shape (combat design §5): summons are divine, one Calling per divine level
 * that has spells, calling a beast or celestial of its own level (and, for evil casters, an
 * undead of that level).
 */
export function spellIssues(content: Pick<Content, 'spells' | 'summons'>): string[] {
  const issues: string[] = []
  const callings = new Map<number, string[]>()
  for (const spell of sortedEntries(content.spells)) {
    const at = `spell ${spell.id}`
    for (const e of spell.effects) {
      if (e.effect !== 'summon') continue
      if (spell.pool !== 'divine') issues.push(`${at}: only divine spells summon`)
      callings.set(spell.level, [...(callings.get(spell.level) ?? []), spell.id])
      const good = content.summons[e.summon]
      if (good && good.kind === 'undead')
        issues.push(`${at}: "${good.id}" is undead (it goes in \`evil\`)`)
      if (good && good.level !== spell.level)
        issues.push(`${at}: summon "${good.id}" is level ${good.level}, not ${spell.level}`)
      const evil = e.evil ? content.summons[e.evil] : undefined
      if (!e.evil) issues.push(`${at}: no undead for evil casters`)
      if (evil && evil.kind !== 'undead') issues.push(`${at}: "${evil.id}" (evil) is not undead`)
      if (evil && evil.level !== spell.level)
        issues.push(`${at}: summon "${evil.id}" is level ${evil.level}, not ${spell.level}`)
    }
  }
  const divineLevels = new Set(
    Object.values(content.spells)
      .filter((s) => s.pool === 'divine')
      .map((s) => s.level)
  )
  for (const level of [...divineLevels].sort((a, b) => a - b)) {
    const ids = callings.get(level) ?? []
    if (ids.length !== 1)
      issues.push(
        `divine level ${level}: ${ids.length} summoning spells, not 1 (${ids.join(', ')})`
      )
  }
  return issues
}

/**
 * Fight on the line in encounters (Plan 7 Track I): every foe and climax names a creature that
 * exists, and a climax's boss has a signature move.
 */
export function fightIssues(content: Content): string[] {
  const issues: string[] = []
  const creature = (at: string, id: string | undefined) => {
    if (id !== undefined && !Object.hasOwn(content.creatures, id))
      issues.push(`${at}: unknown creature "${id}"`)
  }
  const climax = (at: string, c: Climax | undefined) => {
    if (!c) return
    creature(`${at} climax`, c.boss)
    creature(`${at} climax henchmen`, c.henchmen)
    const boss = content.creatures[c.boss]
    if (boss && !boss.signature) issues.push(`${at}: climax boss "${c.boss}" has no signature move`)
  }
  for (const dungeon of sortedEntries(content.dungeons))
    climax(`dungeon ${dungeon.id}`, dungeon.climax)
  for (const villain of sortedEntries(content.villains))
    villain.acts.forEach((act) => climax(`villain ${villain.id} act ${act.id}`, act.climax))
  for (const kind of sortedEntries(content.twists)) creature(`twist ${kind.id} foe`, kind.foe)
  for (const situation of allSituations(content))
    creature(`situation ${situation.id} foe`, situation.foe)
  return issues
}

/**
 * Where Fight is offered (Plan 7 Track I), checked on the bundled content: every dungeon and
 * Crisis act has a climax, and every hostile road or site situation with a fight-like check
 * (`check.combat`) can tell its foes (a `foe`, or a creature slot), so it offers Fight. Crisis
 * sites and dungeon rooms (but the boss's, through its dungeon) offer none.
 */
export function fightCoverageIssues(content: Content): string[] {
  const issues: string[] = []
  for (const dungeon of sortedEntries(content.dungeons))
    if (!dungeon.climax)
      issues.push(`dungeon ${dungeon.id}: no climax (who its boss Fight is against)`)
  for (const villain of sortedEntries(content.villains))
    for (const act of villain.acts)
      if (!act.climax)
        issues.push(`villain ${villain.id} act ${act.id}: no climax (who its key Fight is against)`)
  for (const situation of allSituations(content)) {
    const crisisSite = situation.site && situation.tags.includes('crisis')
    if (situation.disposition !== 'hostile' || situation.room || crisisSite) continue
    const compiled = compileSituation(situation, content)
    const fights = Object.values(compiled.stages).some((stage) =>
      stage.options.some((o) => o.kind === 'check' && o.check.combat)
    )
    const slot = Object.values(compiled.slots).some((s) => s.from === 'creature')
    if (fights && !situation.foe && !slot)
      issues.push(
        `situation ${situation.id}: a fight-like check but no foe (a \`foe\` or a creature slot) to Fight`
      )
  }
  return issues
}
