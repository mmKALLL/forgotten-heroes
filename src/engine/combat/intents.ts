import type { Content } from '../../content/build'
import type { CombatEffect, CombatState, CombatUnit, Intent } from '../../schema/combat'
import type { Draw } from '../rng'
import { activeEffects, bloodied } from './attack'
import { canEnter, distance, nearest, sideUnits, stackSize, standing, unitsOn } from './line'

// Telegraphed intents (combat design §3, §6). At the start of the party's turn every enemy shows
// what it will do, aimed at a tile: it moves (at most one tile, two for a brute's charge) and
// then acts on that tile, hitting whoever stands there when it acts. Melee enemies prefer to
// strike without moving; archers and casters prefer a spot within their favoured range. Ties are
// broken by the seeded RNG. With nothing in reach, the intent is a move toward the favoured range.

/** The enemy's favoured range, from its role. */
const favoured = (u: CombatUnit, content: Content): readonly [number, number] =>
  u.role ? content.enemyRoles[u.role].favoured : [1, 1]

/** The direction toward the party from a tile (−1 or +1), or 0 when none stands. */
function towardParty(combat: CombatState, tile: number): -1 | 0 | 1 {
  const party = sideUnits(combat, 'party')
  if (party.length === 0) return 0
  const closest = party.reduce((a, b) => (distance(a.tile, tile) <= distance(b.tile, tile) ? a : b))
  return closest.tile < tile ? -1 : closest.tile > tile ? 1 : 0
}

/**
 * The tile one step toward the favoured range from where the unit stands, or its own tile when
 * it is there already or blocked.
 */
export function repositionTile(combat: CombatState, unit: CombatUnit, content: Content): number {
  const [min, max] = favoured(unit, content)
  const d = nearest(combat, unit.tile, 'party')
  const toward = towardParty(combat, unit.tile)
  if (toward === 0) return unit.tile
  const step = d > max ? toward : d < min ? -toward : 0
  if (step === 0) return unit.tile
  return canEnter(combat, unit, unit.tile + step) ? unit.tile + step : unit.tile
}

/** The tiles a unit can stand on after up to `steps` legal steps in one direction. */
function reachable(combat: CombatState, unit: CombatUnit, dir: -1 | 1, steps: number): number[] {
  const tiles: number[] = []
  for (let s = 1; s <= steps; s++) {
    const t = unit.tile + dir * s
    if (!canEnter(combat, unit, t)) break
    tiles.push(t)
  }
  return tiles
}

/** The party tiles in reach from a tile. */
const targetsFrom = (combat: CombatState, unit: CombatUnit, from: number): number[] =>
  [...new Set(sideUnits(combat, 'party').map((u) => u.tile))]
    .filter((t) => distance(t, from) >= unit.reach[0] && distance(t, from) <= unit.reach[1])
    .sort((a, b) => a - b)

/** The size points the party has on a tile. */
const partyPoints = (combat: CombatState, tile: number) => stackSize(combat, tile, 'party')

/** Whether a unit has a condition now (fear, discord) from a lasting effect. */
export const hasCondition = (
  combat: Pick<CombatState, 'round'>,
  u: CombatUnit,
  condition: CombatEffect['effect']
): boolean => activeEffects(combat, u).some((e) => e.effect.effect === condition)

/** A feared enemy's intent (Turn Undead): a step away from the party, or standing still. */
export function fleeIntent(combat: CombatState, u: CombatUnit): Intent {
  const party = sideUnits(combat, 'party')
  const closest = party.length
    ? party.reduce((a, b) => (distance(a.tile, u.tile) <= distance(b.tile, u.tile) ? a : b))
    : null
  const away = closest ? Math.sign(u.tile - closest.tile) || 1 : 1
  const to = canEnter(combat, u, u.tile + away) ? u.tile + away : u.tile
  return { kind: 'move', from: to, tile: to, twice: false }
}

/**
 * A discorded enemy's intent (a bard's Discord): it falls back a step; when it can't, it strikes
 * one of its own on its tile (an `attack` on its own tile, at DISCORD_PENALTY).
 */
export function discordIntent(combat: CombatState, u: CombatUnit, content: Content): Intent {
  const back = fleeIntent(combat, u)
  if (back.tile !== u.tile) return back
  const to = repositionTile(combat, u, content)
  if (to !== u.tile) return { kind: 'move', from: to, tile: to, twice: false }
  return { kind: 'attack', from: u.tile, tile: u.tile, twice: false }
}

/** The fellow enemy a discorded one strikes: the next one on its tile, or null. */
export const infightTarget = (combat: CombatState, u: CombatUnit): CombatUnit | null =>
  unitsOn(combat, u.tile, u.side).find((o) => o.id !== u.id) ?? null

/** A discorded unit striking at its own tile: it turns on its own side. */
export const infighting = (combat: CombatState, u: CombatUnit, intent: Intent): boolean =>
  intent.kind === 'attack' && intent.tile === u.tile && hasCondition(combat, u, 'discord')

/** Plans one enemy's intent for the coming round. */
export function planIntent(
  draw: Draw,
  combat: CombatState,
  unit: CombatUnit,
  content: Content
): Intent {
  // Conditions from abilities come first: fear flees, discord falls back or turns on its own.
  if (hasCondition(combat, unit, 'fear')) return fleeIntent(combat, unit)
  if (hasCondition(combat, unit, 'discord')) return discordIntent(combat, unit, content)
  const twice = unit.boss && bloodied(unit)
  const role = unit.role
  // A leader rallies every other round while it has at least two allies standing.
  const allies = sideUnits(combat, 'enemy').filter((u) => u.id !== unit.id).length
  if (role === 'leader' && allies >= 2 && unit.intent?.kind !== 'rally')
    return { kind: 'rally', from: unit.tile, tile: unit.tile, twice }
  const toward = towardParty(combat, unit.tile)
  const [min, max] = favoured(unit, content)
  const steps: number[] = [
    unit.tile,
    ...(toward !== 0 ? reachable(combat, unit, toward, 1) : []),
    ...(toward !== 0 ? reachable(combat, unit, -toward as -1 | 1, 1) : []),
  ]
  const inFavour = (t: number) => {
    const d = nearest(combat, t, 'party')
    return d >= min && d <= max
  }
  // Ranged roles first look for a spot in their favoured range; melee ones strike from where they stand.
  const ranged = role === 'archer' || role === 'caster'
  const order = ranged ? [...steps.filter(inFavour), ...steps.filter((t) => !inFavour(t))] : steps
  for (const from of order) {
    const tiles = targetsFrom(combat, unit, from)
    if (tiles.length === 0) continue
    const best = ranged
      ? Math.max(...tiles.map((t) => partyPoints(combat, t)))
      : Math.min(...tiles.map((t) => distance(t, from)))
    const pool = tiles.filter((t) =>
      ranged ? partyPoints(combat, t) === best : distance(t, from) === best
    )
    const tile = pool.length === 1 ? pool[0] : draw.pick(pool)
    const kind =
      role === 'skirmisher'
        ? 'hitAndRun'
        : role === 'caster'
          ? 'area'
          : role === 'archer' && unitsOn(combat, tile, 'party').length > 1
            ? 'volley'
            : 'attack'
    return { kind, from, tile, twice }
  }
  // A brute charges: two steps and a blow.
  if (role === 'brute' && toward !== 0) {
    const two = reachable(combat, unit, toward, 2)
    if (two.length === 2) {
      const tiles = targetsFrom(combat, unit, two[1])
      if (tiles.length > 0) return { kind: 'charge', from: two[1], tile: tiles[0], twice }
    }
  }
  const to = repositionTile(combat, unit, content)
  return { kind: 'move', from: to, tile: to, twice: false }
}

/** The enemies in their action order: left to right, top to bottom, as they stand now. */
export const actionOrder = (combat: CombatState): CombatUnit[] =>
  combat.units
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => standing(u) && u.side === 'enemy')
    .sort((a, b) => a.u.tile - b.u.tile || a.i - b.i)
    .map(({ u }) => u)

/** Plans every standing enemy's intent, in action order (positions as they are now). */
export function planIntents(draw: Draw, combat: CombatState, content: Content): CombatState {
  let next = combat
  for (const unit of actionOrder(combat)) {
    const intent = planIntent(draw, next, unit, content)
    next = { ...next, units: next.units.map((u) => (u.id === unit.id ? { ...u, intent } : u)) }
  }
  return next
}
