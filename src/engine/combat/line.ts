import type { CombatState, CombatUnit } from '../../schema/combat'
import type { CombatSide } from '../../schema/types'
import { SIZE_POINTS, STACK_CAP, STAGGER_HITS } from '../constants'

// The line (combat design §2): tiles 0 … line − 1, tile 0 being the party's end. A tile holds up
// to STACK_CAP size points of one side; opposing units never share a tile. Units on adjacent
// tiles are engaged. Within a tile, units stand top to bottom in the order of `units`.

/** A unit still in the fight (not down, dead, fled or gone). */
export const standing = (u: CombatUnit): boolean => u.status === 'in'

export const sizePoints = (u: Pick<CombatUnit, 'size'>): number => SIZE_POINTS[u.size]

export const other = (side: CombatSide): CombatSide => (side === 'party' ? 'enemy' : 'party')

/** The standing units of a side on a tile, top to bottom. */
export const unitsOn = (combat: CombatState, tile: number, side: CombatSide): CombatUnit[] =>
  combat.units.filter((u) => standing(u) && u.tile === tile && u.side === side)

/** The size points a side has standing on a tile. */
export const stackSize = (combat: CombatState, tile: number, side: CombatSide): number =>
  unitsOn(combat, tile, side).reduce((sum, u) => sum + sizePoints(u), 0)

export const distance = (a: number, b: number): number => Math.abs(a - b)

export const unitById = (combat: CombatState, id: string): CombatUnit | undefined =>
  combat.units.find((u) => u.id === id)

/** The opposing units engaged with a unit: standing on an adjacent tile. */
export const engagedWith = (combat: CombatState, unit: CombatUnit): CombatUnit[] =>
  combat.units.filter(
    (u) => standing(u) && u.side !== unit.side && distance(u.tile, unit.tile) === 1
  )

export const engaged = (combat: CombatState, unit: CombatUnit): boolean =>
  engagedWith(combat, unit).length > 0

/**
 * Whether a unit may step onto a tile: on the line, not held by the other side, and with room
 * under the stack cap.
 */
export function canEnter(combat: CombatState, unit: CombatUnit, tile: number): boolean {
  if (tile < 0 || tile >= combat.line) return false
  if (unitsOn(combat, tile, other(unit.side)).length > 0) return false
  const here = unit.tile === tile ? sizePoints(unit) : 0
  return stackSize(combat, tile, unit.side) - here + sizePoints(unit) <= STACK_CAP
}

/** Every standing unit of a side. */
export const sideUnits = (combat: CombatState, side: CombatSide): CombatUnit[] =>
  combat.units.filter((u) => standing(u) && u.side === side)

/** The distance from a tile to the nearest standing unit of a side (Infinity when none). */
export function nearest(combat: CombatState, tile: number, side: CombatSide): number {
  return Math.min(...sideUnits(combat, side).map((u) => distance(u.tile, tile)), Infinity)
}

/** The hit ladder's thresholds an enemy has (combat design §3): a boss, a caster or archer, or a normal one. */
export function hitThresholds(u: Pick<CombatUnit, 'boss' | 'role'>): {
  stifle: number
  stagger: number
  stun: number
} {
  if (u.boss) return STAGGER_HITS.boss
  return u.role === 'archer' || u.role === 'caster' ? STAGGER_HITS.ranged : STAGGER_HITS.normal
}

/** A step of the hit ladder: stifled (−2 to hit), staggered (and half damage), stunned. */
export type HitStep = 'stifled' | 'staggered' | 'stunned'
const STEP_RANK: Record<HitStep, number> = { stifled: 1, staggered: 2, stunned: 3 }

/** The step `hits` hits this party turn reach (null: none), with `staggered` forcing at least that. */
export function hitStep(
  u: Pick<CombatUnit, 'boss' | 'role' | 'side'>,
  hits: number,
  staggered = false
): HitStep | null {
  if (u.side !== 'enemy') return null
  const t = hitThresholds(u)
  if (hits >= t.stun) return 'stunned'
  if (staggered || hits >= t.stagger) return 'staggered'
  return hits >= t.stifle ? 'stifled' : null
}

/** The higher of two steps. */
export const stepAbove = (a: HitStep | null, b: HitStep | null): boolean =>
  (a ? STEP_RANK[a] : 0) > (b ? STEP_RANK[b] : 0)

/** The step an enemy stands at now (`staggered` is set by an effect, whatever the hits). */
export const stepOf = (u: CombatUnit): HitStep | null => hitStep(u, u.hits, u.staggered)

/** Stifled or worse: −STAGGER_PENALTY to hit. */
export const isStifled = (u: CombatUnit): boolean => stepOf(u) !== null

/** Staggered (or stunned): its blows do half damage. */
export const isStaggered = (u: CombatUnit): boolean =>
  stepOf(u) === 'staggered' || stepOf(u) === 'stunned'

/** Stunned: enough hits this party turn that it loses its next action. */
export const isStunned = (u: CombatUnit): boolean =>
  u.side === 'enemy' && u.hits >= hitThresholds(u).stun

/** Replaces one unit. */
export const withUnit = (combat: CombatState, unit: CombatUnit): CombatState => ({
  ...combat,
  units: combat.units.map((u) => (u.id === unit.id ? unit : u)),
})
