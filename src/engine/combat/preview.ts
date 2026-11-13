import type { CombatState, CombatUnit, Intent } from '../../schema/combat'
import type { GameState } from '../../schema/state'
import { attackSpec, type AttackSpec } from './attack'
import { attackPlan, canMove, canRetreat, intentLands, intentTargets, swingSpecs } from './fight'
import { actionOrder } from './intents'
import { canEnter, isStunned, sideUnits, stepOf, unitsOn, withUnit, type HitStep } from './line'
import { fleeChance, moraleDc, moraleThreshold } from './morale'

// The fight's preview (combat design §3, §8): every legal action of every member with its odds,
// damage and traits, and every enemy's intent with the odds it lands at. The resolution in
// combat/fight.ts calls the same functions (attackPlan, swingSpecs, attackSpec): preview == actual.

export type MovePreview = { to: number; swings: AttackSpec[] }

export type AttackPreview = {
  tile: number
  target: string
  /** A single attack. */
  attack: AttackSpec[]
  /** The full action (standing still), or null when the member has moved. */
  full: AttackSpec[] | null
}

export type MemberPreview = {
  unit: string
  moves: MovePreview[]
  attacks: AttackPreview[]
  /** Leaving the line from the party's end, with the free swings it draws; null when not possible. */
  retreat: { swings: AttackSpec[] } | null
}

export type IntentPreview = {
  unit: string
  intent: Intent
  stunned: boolean
  /** Its step on the hit ladder: stifled (−2 to hit), staggered (and half damage), stunned. */
  step: HitStep | null
  /** Out of reach or no one there: it will reposition instead. */
  broken: boolean
  /** The attacks it makes on landing, against whoever stands on the tile now. */
  attacks: AttackSpec[]
}

export type CombatPreview = {
  members: MemberPreview[]
  /** The enemies in their action order. */
  intents: IntentPreview[]
  /** Morale: the enemies left at which it is tested (null: never), and the flee chance if tested now. */
  morale: { threshold: number | null; dc: number; flee: number }
}

/** One member's legal actions. */
export function memberPreview(combat: CombatState, u: CombatUnit): MemberPreview {
  const moves = [u.tile - 1, u.tile + 1]
    .filter((to) => canMove(combat, u, to))
    .map((to) => ({ to, swings: swingSpecs(combat, u, to) }))
  const tiles = [...new Set(sideUnits(combat, 'enemy').map((e) => e.tile))].sort((a, b) => a - b)
  const attacks = tiles.flatMap((tile) =>
    unitsOn(combat, tile, 'enemy').flatMap((target) => {
      const one = attackPlan(combat, u, tile, false, target.id)
      if (!one) return []
      const full = attackPlan(combat, u, tile, true, target.id)
      return [{ tile, target: target.id, attack: one.specs, full: full?.specs ?? null }]
    })
  )
  const retreat = canRetreat(u) ? { swings: swingSpecs(combat, u, -1) } : null
  return { unit: u.id, moves, attacks, retreat }
}

/**
 * Each enemy's intent as it would land now: from its planned spot, against whoever is on the
 * tile, with a rally from a leader acting before it.
 */
export function intentPreviews(combat: CombatState): IntentPreview[] {
  let rally = false
  return actionOrder(combat).flatMap((u) => {
    if (!u.intent) return []
    const intent = u.intent
    const stunned = isStunned(u)
    const from = canEnter(combat, u, intent.from) ? intent.from : u.tile
    const moved = withUnit(combat, { ...u, tile: from })
    const mover = { ...u, tile: from }
    const attacking = !['move', 'rally'].includes(intent.kind)
    const broken = attacking && !intentLands(moved, mover, intent)
    const attacks =
      stunned || !attacking || broken
        ? []
        : intentTargets(moved, intent).map((t) =>
            attackSpec(moved, mover, t, { volley: intent.kind === 'volley', rally })
          )
    if (intent.kind === 'rally' && !stunned) rally = true
    return [{ unit: u.id, intent, stunned, step: stepOf(u), broken, attacks }]
  })
}

/** The whole preview of the open fight; null when there is none. */
export function combatPreview(state: Pick<GameState, 'combat' | 'party'>): CombatPreview | null {
  const combat = state.combat
  if (!combat || combat.result !== null) return null
  const members = sideUnits(combat, 'party')
    .filter((u) => !(u.moved && u.acted))
    .map((u) => memberPreview(combat, u))
  const dc = moraleDc(combat, state.party)
  return {
    members,
    intents: intentPreviews(combat),
    morale: {
      threshold: moraleThreshold(combat.groupSize),
      dc,
      flee: fleeChance(sideUnits(combat, 'enemy'), dc),
    },
  }
}
