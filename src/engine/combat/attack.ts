import type { CombatState, CombatUnit, Dice } from '../../schema/combat'
import type { Draw } from '../rng'
import type { RollMode } from '../rules/checks'
import {
  ASSIST_PER_POINT,
  BLOODIED_PENALTY,
  BLOODIED_SHARE,
  ENGAGED_RANGED_PENALTY,
  RALLY_BONUS,
  REACH_PENALTY,
  STAGGER_PENALTY,
  VOLLEY_PENALTY,
  WEAPON_FAMILY_RULES,
} from '../constants'
import { distance, engaged, hitThresholds, isStaggered, stackSize } from './line'

// Attacks (combat design §2–§4): d20 + modifiers against AC. A natural 20 (or a dagger's 19)
// is a critical hit, which always hits and doubles the dice; a natural 1 always misses. Every
// number the preview shows comes from `attackSpec`, and `rollAttack` resolves that same spec:
// preview == actual.

/** One line of a to-hit breakdown, e.g. { label: 'assist', value: 2 }. */
export type Part = { label: string; value: number }

export type AttackSpec = {
  attacker: string
  target: string
  parts: Part[]
  /** The sum of the parts, added to the d20. */
  modifier: number
  ac: number
  mode: RollMode
  critMin: number
  dice: Dice
  /** A staggered enemy's weakened blow: half damage. */
  half: boolean
  /** The chance to hit (crits included) and to crit. */
  hit: number
  crit: number
  /** Damage on a hit, and on a crit, as [min, max]. */
  damage: [number, number]
  critDamage: [number, number]
  /** What one more hit does to an enemy target this party turn: stagger, stun, or nothing new. */
  onHit: 'stagger' | 'stun' | null
  /** An axe's crit also hits a second enemy on the tile. */
  cleave: boolean
}

export type AttackOptions = {
  /** Extra parts: a full action's bonus, a second attack's penalty. */
  extra?: Part[]
  /** An archer's volley (every unit on the tile, at a penalty). */
  volley?: boolean
  /** A leader rallied the enemies this turn. */
  rally?: boolean
}

export const bloodied = (u: CombatUnit): boolean => u.hp <= u.maxHp * BLOODIED_SHARE

const FOOTING_MODE: Record<CombatState['footing'], RollMode> = {
  normal: 'normal',
  edge: 'advantage',
  exposed: 'disadvantage',
}

/** The chance of each kept d20 face (1–20) under a roll mode. */
const faceChance = (face: number, mode: RollMode): number =>
  mode === 'normal' ? 1 / 20 : mode === 'advantage' ? (2 * face - 1) / 400 : (41 - 2 * face) / 400

const hits = (face: number, modifier: number, ac: number, critMin: number): boolean =>
  face >= critMin || (face !== 1 && face + modifier >= ac)

/** Damage [min, max] for dice (doubled on a crit), at least 1, halved for a weakened blow. */
export function damageRange(dice: Dice, crit: boolean, half: boolean): [number, number] {
  const count = dice.count * (crit ? 2 : 1)
  const cut = (n: number) => Math.max(1, half ? Math.floor(Math.max(1, n) / 2) : n)
  return [cut(count + dice.bonus), cut(count * dice.die + dice.bonus)]
}

/** Everything about one attack of `attacker` on `target`, as it stands now. */
export function attackSpec(
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  options: AttackOptions = {}
): AttackSpec {
  const parts: Part[] = [{ label: 'to hit', value: attacker.toHit }]
  const assist =
    stackSize(combat, attacker.tile, attacker.side) - stackSize(combat, target.tile, target.side)
  if (assist !== 0) parts.push({ label: 'assist', value: ASSIST_PER_POINT * assist })
  const rules = attacker.family ? WEAPON_FAMILY_RULES[attacker.family] : null
  if (rules?.trait === 'reach' && distance(attacker.tile, target.tile) === 1)
    parts.push({ label: 'too close', value: -REACH_PENALTY })
  const ranged = rules ? rules.ranged : attacker.role === 'archer'
  if (ranged && engaged(combat, attacker))
    parts.push({ label: 'engaged', value: -ENGAGED_RANGED_PENALTY })
  const staggered = isStaggered(attacker)
  if (staggered) parts.push({ label: 'staggered', value: -STAGGER_PENALTY })
  if (attacker.side === 'enemy' && !attacker.boss && bloodied(attacker))
    parts.push({ label: 'bloodied', value: -BLOODIED_PENALTY })
  if (options.volley) parts.push({ label: 'volley', value: -VOLLEY_PENALTY })
  if (options.rally && attacker.side === 'enemy')
    parts.push({ label: 'rallied', value: RALLY_BONUS })
  parts.push(...(options.extra ?? []))
  const modifier = parts.reduce((sum, p) => sum + p.value, 0)
  const mode = attacker.side === 'party' ? FOOTING_MODE[combat.footing] : 'normal'
  let hit = 0
  let crit = 0
  for (let face = 1; face <= 20; face++) {
    const p = faceChance(face, mode)
    if (hits(face, modifier, target.ac, attacker.critMin)) hit += p
    if (face >= attacker.critMin) crit += p
  }
  let onHit: AttackSpec['onHit'] = null
  if (target.side === 'enemy') {
    const next = target.hits + 1
    const { stagger, stun } = hitThresholds(target)
    if (next >= stun) onHit = 'stun'
    else if (!isStaggered(target) && (next >= stagger || rules?.trait === 'stagger'))
      onHit = 'stagger'
  }
  return {
    attacker: attacker.id,
    target: target.id,
    parts,
    modifier,
    ac: target.ac,
    mode,
    critMin: attacker.critMin,
    dice: attacker.damage,
    half: staggered && attacker.side === 'enemy',
    hit,
    crit,
    damage: damageRange(attacker.damage, false, staggered && attacker.side === 'enemy'),
    critDamage: damageRange(attacker.damage, true, staggered && attacker.side === 'enemy'),
    onHit,
    cleave: rules?.trait === 'cleave',
  }
}

export type AttackRoll = {
  dice: number[]
  kept: number
  hit: boolean
  crit: boolean
  damage: number
}

/** Rolls damage dice (doubled on a crit), at least 1, halved for a weakened blow. */
export function rollDamage(draw: Draw, dice: Dice, crit: boolean, half: boolean): number {
  let total = dice.bonus
  for (let i = 0; i < dice.count * (crit ? 2 : 1); i++) total += draw.int(1, dice.die)
  const [min] = damageRange(dice, crit, half)
  return Math.max(min, half ? Math.floor(Math.max(1, total) / 2) : total)
}

/** Resolves an attack exactly as its spec says. */
export function rollAttack(draw: Draw, spec: AttackSpec): AttackRoll {
  const dice = spec.mode === 'normal' ? [draw.int(1, 20)] : [draw.int(1, 20), draw.int(1, 20)]
  const kept =
    spec.mode === 'advantage'
      ? Math.max(...dice)
      : spec.mode === 'disadvantage'
        ? Math.min(...dice)
        : dice[0]
  const hit = hits(kept, spec.modifier, spec.ac, spec.critMin)
  const crit = kept >= spec.critMin
  const damage = hit ? rollDamage(draw, spec.dice, crit, spec.half) : 0
  return { dice, kept, hit, crit, damage }
}
