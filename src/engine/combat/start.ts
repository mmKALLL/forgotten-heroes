import type { Content } from '../../content/build'
import type { CombatState, CombatUnit, RoleStats } from '../../schema/combat'
import type { Creature, Fight } from '../../schema/encounter'
import type { Character, GameState } from '../../schema/state'
import type { Position, Tier } from '../../schema/types'
import type { Draw } from '../rng'
import { tierFor, tierOdds, type RollMode } from '../rules/checks'
import { canAct, rankActors } from '../rules/character'
import { scoutBonus } from '../rules/upgrades'
import { isAlive } from '../town/camaraderie'
import {
  AMBUSH_EXTRA,
  BOSS_HP_FACTOR,
  COMBAT_LINE,
  STACK_CAP,
  SURPRISE_DC_BASE,
  SURPRISE_RESULT,
} from '../constants'
import { abilityDc, memberStats, rankOf } from './gear'
import { sizePoints } from './line'

// Setting up a fight (combat design §2): the units, their places on the line, and the surprise
// roll. The party stands at its end (tile 0) in its formation, back rank first; the enemies at
// the far end, archers and casters behind. An ambush adds AMBUSH_EXTRA more enemies, either a
// little apart from the group or behind the party.

/** The last row of a role's table at or below a CR (the first row below them all). */
export function roleStats(content: Content, creature: Creature): RoleStats {
  const rows = content.enemyRoles[creature.role]?.stats ?? []
  if (rows.length === 0) throw new Error(`enemy role ${creature.role} has no stats`)
  return rows.findLast((r) => r.cr <= creature.cr) ?? rows[0]
}

/** A member as a unit on the line. */
export function memberUnit(c: Character, content: Content): CombatUnit {
  const s = memberStats(c, content)
  return {
    id: c.id,
    side: 'party',
    name: c.name,
    tile: 0,
    size: 'medium',
    hp: c.hp,
    maxHp: c.maxHp,
    ac: s.ac,
    toHit: s.toHit,
    damage: s.damage,
    reach: s.reach,
    critMin: s.critMin,
    family: s.family,
    role: null,
    creature: null,
    boss: false,
    wis: 0,
    status: 'in',
    moved: false,
    acted: false,
    hits: 0,
    staggered: false,
    intent: null,
    level: c.level,
    dc: abilityDc(c),
    untrained: !s.armourTrained,
    fullDamage: s.fullDamage,
    effects: [],
  }
}

/** An enemy as a unit on the line, from its creature's role and CR. */
export function enemyUnit(
  content: Content,
  creature: Creature,
  id: string,
  name: string,
  boss: boolean
): CombatUnit {
  const stats = roleStats(content, creature)
  const role = content.enemyRoles[creature.role]
  const hp = boss ? stats.hp * BOSS_HP_FACTOR : stats.hp
  return {
    id,
    side: 'enemy',
    name,
    tile: 0,
    size: creature.size,
    hp,
    maxHp: hp,
    ac: stats.ac,
    toHit: stats.toHit,
    damage: stats.damage,
    reach: [role.reach[0], role.reach[1]],
    critMin: 20,
    family: null,
    role: creature.role,
    creature: creature.id,
    boss,
    wis: stats.wis,
    status: 'in',
    moved: false,
    acted: false,
    hits: 0,
    staggered: false,
    intent: null,
    level: 1,
    dc: 10,
    untrained: false,
    fullDamage: 0,
    effects: [],
  }
}

/** Places units from `start`, filling each tile up to the stack cap, stepping by `dir`, never past `limit`. */
function fill(units: CombatUnit[], start: number, dir: 1 | -1, limit: number): CombatUnit[] {
  let tile = start
  let used = 0
  return units.map((u) => {
    if (used > 0 && used + sizePoints(u) > STACK_CAP && (tile + dir - limit) * dir <= 0) {
      tile += dir
      used = 0
    }
    used += sizePoints(u)
    return { ...u, tile }
  })
}

const backLine = (u: CombatUnit, content: Content): boolean =>
  u.role !== null && content.enemyRoles[u.role].favoured[0] >= 2

/** Where an ambush's extra enemies stand: apart from the group, or behind the party. */
export type AmbushPlace = 'apart' | 'behind'

/**
 * The opening positions: the party (back rank, then front) from its end, the enemies (back
 * line, then front) from the far end, and any ambushers. Pure: the draws were made before.
 */
export function placeUnits(
  line: number,
  party: { unit: CombatUnit; back: boolean }[],
  enemies: CombatUnit[],
  ambushers: CombatUnit[],
  place: AmbushPlace,
  content: Content
): CombatUnit[] {
  const start = ambushers.length > 0 && place === 'behind' ? 1 : 0
  const back = fill(
    party.filter((p) => p.back).map((p) => p.unit),
    start,
    1,
    line - 2
  )
  const frontStart = back.length > 0 ? back.at(-1)!.tile + 1 : start
  const front = fill(
    party.filter((p) => !p.back).map((p) => p.unit),
    frontStart,
    1,
    line - 2
  )
  const partyEnd = Math.max(...[...back, ...front].map((u) => u.tile), start)
  const far = enemies.filter((u) => backLine(u, content))
  const near = enemies.filter((u) => !backLine(u, content))
  const placedFar = fill(far, line - 1, -1, partyEnd + 1)
  const nearStart =
    placedFar.length > 0 ? Math.max(partyEnd + 1, placedFar.at(-1)!.tile - 1) : line - 1
  const placedNear = fill(near, nearStart, -1, partyEnd + 1)
  const groupFront = Math.min(...[...placedFar, ...placedNear].map((u) => u.tile))
  const placedAmbush =
    place === 'behind'
      ? fill(ambushers, 0, 1, 0)
      : fill(ambushers, Math.max(partyEnd + 1, groupFront - 2), -1, partyEnd + 1)
  return [...back, ...front, ...placedNear, ...placedFar, ...placedAmbush]
}

export type SurpriseResult = CombatState['surprise']

export type SurprisePreview = {
  /** Stealth when the party comes upon them, Perception when they spring an ambush. */
  skill: 'stealth' | 'perception'
  actorId: string | null
  modifier: number
  dc: number
  mode: RollMode
  /** The chance of each result. */
  odds: Record<SurpriseResult, number>
}

/**
 * The surprise roll (combat design §2): the party's best Stealth (Perception against an ambush)
 * plus the scout's kit, against SURPRISE_DC_BASE + the enemies' best WIS (their alertness). Plate
 * armour gives disadvantage on Stealth. SURPRISE_RESULT reads the tier.
 */
export function surprisePreview(
  state: Pick<GameState, 'party' | 'upgrades'>,
  content: Content,
  enemies: readonly Pick<CombatUnit, 'wis'>[],
  ambush: boolean
): SurprisePreview {
  const skill = ambush ? 'perception' : 'stealth'
  const fit = state.party.filter((c) => isAlive(c) && canAct(c))
  const best = rankActors(fit, skill)[0]
  const modifier = (best?.modifier ?? 0) + scoutBonus(state, { tags: ['surprise'] })
  const dc = SURPRISE_DC_BASE + Math.max(0, ...enemies.map((e) => e.wis))
  const plate = fit.some((c) => memberStats(c, content).grade === 'plate')
  const mode: RollMode = !ambush && plate ? 'disadvantage' : 'normal'
  const table = SURPRISE_RESULT[ambush ? 'ambush' : 'approach']
  const odds: Record<SurpriseResult, number> = { party: 0, enemy: 0, half: 0, none: 0 }
  const tiers = tierOdds(modifier, dc, mode)
  for (const tier of Object.keys(tiers) as Tier[]) odds[table[tier]] += tiers[tier]
  return { skill, actorId: best?.characterId ?? null, modifier, dc, mode, odds }
}

/** Rolls the surprise check as its preview says. */
export function rollSurprise(draw: Draw, preview: SurprisePreview, ambush: boolean) {
  const dice = preview.mode === 'normal' ? [draw.int(1, 20)] : [draw.int(1, 20), draw.int(1, 20)]
  const kept = preview.mode === 'disadvantage' ? Math.min(...dice) : dice[0]
  const tier = tierFor(kept, kept + preview.modifier, preview.dc)
  return { kept, tier, result: SURPRISE_RESULT[ambush ? 'ambush' : 'approach'][tier] }
}

export type StartOptions = {
  /** The party's footing for the fight (an Exposed parley, a dark room). */
  footing?: Position
}

/** The fight's units before placement, and the ambushers (drawn here). */
export function rollUnits(
  draw: Draw,
  state: Pick<GameState, 'party'>,
  content: Content,
  fight: Fight
): {
  party: { unit: CombatUnit; back: boolean }[]
  enemies: CombatUnit[]
  ambushers: CombatUnit[]
  place: AmbushPlace
} {
  const party = state.party
    .filter((c) => isAlive(c) && c.hp > 0)
    .map((c) => ({ unit: memberUnit(c, content), back: rankOf(c, content) === 'back' }))
  let n = 0
  const make = (creatureId: string, boss: boolean, label: string) => {
    const creature = content.creatures[creatureId]
    if (!creature) throw new Error(`unknown creature ${creatureId}`)
    n += 1
    return enemyUnit(content, creature, `e${n}`, label, boss)
  }
  const enemies = fight.enemies.flatMap((e) => {
    const name = content.creatures[e.creature]?.name ?? e.creature
    return Array.from({ length: e.count }, (_, i) =>
      make(e.creature, e.boss, e.count > 1 ? `${name} ${i + 1}` : name)
    )
  })
  let ambushers: CombatUnit[] = []
  let place: AmbushPlace = 'apart'
  if (fight.ambush) {
    const lowest = [...fight.enemies]
      .filter((e) => !e.boss)
      .sort((a, b) => content.creatures[a.creature].cr - content.creatures[b.creature].cr)[0]
    const pick = lowest ?? fight.enemies[0]
    const count = draw.int(AMBUSH_EXTRA[0], AMBUSH_EXTRA[1])
    place = draw.float() < 0.5 ? 'apart' : 'behind'
    const name = content.creatures[pick.creature].name
    ambushers = Array.from({ length: count }, (_, i) =>
      make(pick.creature, false, `${name} (ambush ${i + 1})`)
    )
  }
  return { party, enemies, ambushers, place }
}

/** The line's length: the fight's own, else COMBAT_LINE. */
export const lineLength = (fight: Fight): number => fight.line ?? COMBAT_LINE
