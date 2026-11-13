import type { CombatState, CombatUnit, Intent } from '../../schema/combat'
import type { GameState } from '../../schema/state'
import type { CombatSide, CreatureSize } from '../../schema/types'
import { WEAPON_FAMILY_RULES } from '../constants'
import { bloodied, type AttackSpec } from './attack'
import { hitThresholds, isStaggered, isStunned, standing } from './line'
import { combatPreview, type CombatPreview, type MemberPreview } from './preview'

// The fight as the combat UI draws it (Plan 7 Track U): the line's tiles with their units top to
// bottom, each unit's status, the enemies' hit pips, the intents in action order and every legal
// target of each member. It only arranges what the engine and `combatPreview` already decide.

export type UnitView = {
  id: string
  name: string
  side: CombatSide
  size: CreatureSize
  hp: number
  maxHp: number
  boss: boolean
  status: CombatUnit['status']
  bloodied: boolean
  staggered: boolean
  stunned: boolean
  /** Enemies: hits this party turn toward the stagger and stun thresholds. */
  pips: { hits: number; stagger: number; stun: number } | null
  /** Members: still able to move or act this turn. */
  ready: boolean
  moved: boolean
  acted: boolean
  /** Members: the weapon's trait staggers whoever it hits (maces). */
  staggersOnHit: boolean
}

export type TileView = { index: number; side: CombatSide | null; units: UnitView[] }

export type IntentView = {
  unit: string
  name: string
  intent: Intent
  stunned: boolean
  /** No one in reach on its tile: it repositions instead. */
  broken: boolean
  /** The attacks it lands with, against whoever stands on the tile now. */
  attacks: (AttackSpec & { targetName: string })[]
}

/** One thing the selected member can do on the line: attack an enemy, or step to a tile. */
export type Target =
  | {
      kind: 'attack'
      tile: number
      target: string
      attack: AttackSpec[]
      full: AttackSpec[] | null
    }
  | { kind: 'move'; tile: number; swings: AttackSpec[] }

export type CombatView = {
  line: number
  round: number
  result: CombatState['result']
  surprise: CombatState['surprise']
  tiles: TileView[]
  /** Units out of the fight: down, dead, fled or gone. */
  out: UnitView[]
  /** The party members, standing or not, in line order. */
  members: UnitView[]
  intents: IntentView[]
  /** Each ready member's legal actions, by unit id. */
  options: Record<string, MemberPreview>
  morale: (CombatPreview['morale'] & { state: CombatState['morale'] }) | null
  log: CombatState['log']
}

function unitView(u: CombatUnit, ready: boolean): UnitView {
  const enemy = u.side === 'enemy'
  const t = hitThresholds(u)
  return {
    id: u.id,
    name: u.name,
    side: u.side,
    size: u.size,
    hp: u.hp,
    maxHp: u.maxHp,
    boss: u.boss,
    status: u.status,
    bloodied: standing(u) && bloodied(u),
    staggered: standing(u) && isStaggered(u),
    stunned: standing(u) && isStunned(u),
    pips: enemy ? { hits: u.hits, stagger: t.stagger, stun: t.stun } : null,
    ready,
    moved: u.moved,
    acted: u.acted,
    staggersOnHit: u.family !== null && WEAPON_FAMILY_RULES[u.family].trait === 'stagger',
  }
}

/** The legal targets of a member's options, left to right (attacks before a move on a tile). */
export function targetsOf(options: MemberPreview | undefined): Target[] {
  if (!options) return []
  const attacks: Target[] = options.attacks.map((a) => ({
    kind: 'attack',
    tile: a.tile,
    target: a.target,
    attack: a.attack,
    full: a.full,
  }))
  const moves: Target[] = options.moves.map((m) => ({ kind: 'move', tile: m.to, swings: m.swings }))
  return [...attacks, ...moves].sort((a, b) => a.tile - b.tile)
}

/** The open fight as the UI draws it; null when there is none. */
export function combatView(state: Pick<GameState, 'combat' | 'party'>): CombatView | null {
  const combat = state.combat
  if (!combat) return null
  const preview = combatPreview(state)
  const options = Object.fromEntries((preview?.members ?? []).map((m) => [m.unit, m]))
  const view = (u: CombatUnit) => unitView(u, Object.hasOwn(options, u.id))
  const name = (id: string) => combat.units.find((u) => u.id === id)?.name ?? id
  const tiles: TileView[] = Array.from({ length: combat.line }, (_, index) => {
    const units = combat.units.filter((u) => standing(u) && u.tile === index)
    return { index, side: units[0]?.side ?? null, units: units.map(view) }
  })
  return {
    line: combat.line,
    round: combat.round,
    result: combat.result,
    surprise: combat.surprise,
    tiles,
    out: combat.units.filter((u) => !standing(u)).map(view),
    members: combat.units.filter((u) => u.side === 'party').map(view),
    intents: (preview?.intents ?? []).map((i) => ({
      unit: i.unit,
      name: name(i.unit),
      intent: i.intent,
      stunned: i.stunned,
      broken: i.broken,
      attacks: i.attacks.map((a) => ({ ...a, targetName: name(a.target) })),
    })),
    options,
    morale: preview ? { ...preview.morale, state: combat.morale } : null,
    log: combat.log,
  }
}
