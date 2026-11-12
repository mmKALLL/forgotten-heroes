import type { Content } from '../../content/build'
import type { Biome, Pace } from '../../schema/types'
import type { GameState, TravelState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { allSituations } from '../encounters/compile'
import { fitsPlace } from '../encounters/run'
import { edgeById } from '../world/graph'
import { domainAt, domainThreatLevel } from '../world/pois'
import type { Draw } from '../rng'
import { load, loadSpeed, type Hired } from '../economy/capacity'
import { mountSpeed } from '../town/animals'
import { paceHostileAvoidance } from './pace'
import {
  DEFAULT_PACE,
  ENCOUNTER_SLOT_CHANCE,
  ESCORT_HOSTILE,
  FORAGE_HOSTILE_BONUS,
  HOSTILE_BASE,
  HOSTILE_PER_DANGER,
  HOSTILE_PER_THREAT,
  HOSTILE_SHARE_RANGE,
  KM_PER_DAY,
  LONG_JOURNEY_DAYS,
  PACE_HOSTILE_BONUS,
  PACE_SPEED,
  SEA_FARE,
  SHORT_HOP_DAYS,
  WEALTH_HOSTILE_PER_STEP,
} from '../constants'

/**
 * km per calendar day. Pace scales the speed on land (PACE_SPEED). `speed` scales land speed too:
 * a load (capacity.ts loadSpeed) or mounts. A ship keeps its own speed whatever the pace.
 */
export function kmPerDay(terrain: Biome, pace: Pace = DEFAULT_PACE, speed = 1): number {
  if (terrain === 'sea') return KM_PER_DAY.sea
  return KM_PER_DAY[terrain] * PACE_SPEED[pace] * speed
}

/**
 * The party's land speed multiplier on this terrain: slowed by its load (loadSpeed), and sped up
 * by mounts when everyone rides (mountSpeed; `hired` previews hiring). Always 1 at sea, where the
 * ship carries everything at its own speed.
 */
export function landSpeed(
  state: Pick<GameState, 'party' | 'animals' | 'travel' | 'goods'>,
  content: Content,
  terrain: Biome,
  hired: Hired | null = state.travel?.hired ?? null
): number {
  if (terrain === 'sea') return 1
  const laden = load(state, content, { hired })
  return loadSpeed(laden.level) * mountSpeed(state, content, terrain, hired)
}

export const journeyDays = (
  route: Pick<Route, 'km' | 'terrain'>,
  pace: Pace = DEFAULT_PACE,
  speed = 1
): number => Math.max(1, Math.ceil(route.km / kmPerDay(route.terrain, pace, speed)))

/**
 * The encounter budget (design §7): a short hop gets 0–2, a long journey 2–4; never more than one
 * a day, so never more than the journey's days.
 */
export function encounterRange(days: number): [number, number] {
  const [min, max]: [number, number] =
    days <= SHORT_HOP_DAYS ? [0, 2] : days >= LONG_JOURNEY_DAYS ? [2, 4] : [1, 3]
  return [Math.min(min, days), Math.min(max, days)]
}

/**
 * How likely each encounter on a journey is to be hostile, and what makes it so: the base share,
 * then route danger, the domain's threat level, foraging (FORAGE_HOSTILE_BONUS) and a brisk or
 * forced pace (PACE_HOSTILE_BONUS), within HOSTILE_SHARE_RANGE. That is the share `drawn` hostile;
 * a stealthy or cautious party then steers clear of some of those (PACE_HOSTILE_AVOIDANCE: a quiet
 * day instead), so the share actually met is `share` = drawn × (1 − avoidance), and `avoided` is
 * the (negative) difference. The rest are neutral or pleasant, by their situations' weights.
 */
export type HostileShare = {
  /** The share of encounters that are hostile and met: after the pace's avoidance. */
  share: number
  /** The share drawn hostile before the pace's avoidance (the clamped sum of the parts). */
  drawn: number
  base: number
  danger: number
  threat: number
  forage: number
  pace: number
  /** Visible wealth (economy/wealth.ts): WEALTH_HOSTILE_PER_STEP per step. */
  wealth: number
  /** Escorting passengers (town/contracts.ts): ESCORT_HOSTILE. */
  escort: number
  /** Hostile encounters steered clear of at this pace, as a negative share (0 if none). */
  avoided: number
}

export function hostileShare(
  danger: number,
  threatLevel: number,
  pace: Pace = DEFAULT_PACE,
  forage = false,
  wealthSteps = 0,
  escort = false
): HostileShare {
  const parts = {
    base: HOSTILE_BASE,
    danger: HOSTILE_PER_DANGER * danger,
    threat: HOSTILE_PER_THREAT * threatLevel,
    forage: forage ? FORAGE_HOSTILE_BONUS : 0,
    pace: PACE_HOSTILE_BONUS[pace],
    wealth: WEALTH_HOSTILE_PER_STEP * wealthSteps,
    escort: escort ? ESCORT_HOSTILE : 0,
  }
  const [lo, hi] = HOSTILE_SHARE_RANGE
  const sum =
    parts.base +
    parts.danger +
    parts.threat +
    parts.forage +
    parts.pace +
    parts.wealth +
    parts.escort
  const drawn = Math.min(hi, Math.max(lo, sum))
  const share = drawn * (1 - paceHostileAvoidance(pace))
  return { share, drawn, ...parts, avoided: share - drawn }
}

/**
 * True when some situation can be drawn on this route or path: one that fits its terrain and the
 * land at either end (fitsPlace; a POI's land is its domain's, which needs `state`). At sea only
 * `sea` situations can; site situations never count.
 */
export function canMeetEncounters(
  content: Content,
  route: Pick<Route, 'from' | 'to' | 'terrain'>,
  state?: Pick<GameState, 'world'>
): boolean {
  const lands = [route.from, route.to]
    .map((id) => (state ? domainAt(state.world, id) : id))
    .filter((id): id is string => id !== null && Object.hasOwn(content.settlements, id))
    .map((id) => content.settlements[id].region)
  return allSituations(content).some(
    (s) =>
      !s.followUpOnly &&
      !s.site &&
      s.weight > 0 &&
      lands.some((land) => fitsPlace(s, { biome: route.terrain, land }))
  )
}

/**
 * The encounter budget and the chance each slot above the fewest fills, for a journey of `days`;
 * none at all on a route where nothing can be met (canMeetEncounters).
 */
export function routeEncounters(
  meets: boolean,
  days: number
): { encounters: [number, number]; chance: number } {
  if (!meets) return { encounters: [0, 0], chance: 0 }
  return { encounters: encounterRange(days), chance: ENCOUNTER_SLOT_CHANCE }
}

/**
 * The journey days with an encounter, rolled once at departure: the count within the budget
 * (each slot above the fewest fills with `chance`), capped at the journey's days, then spread over
 * distinct days, ascending (at most one a day).
 */
export function rollEncounterDays(
  d: Draw,
  days: number,
  [min, max]: [number, number],
  chance: number
): number[] {
  let count = min
  for (let slot = min; slot < max; slot++) if (d.float() < chance) count++
  // A partial Fisher–Yates shuffle of the days picks `count` distinct ones.
  const pool = Array.from({ length: days }, (_, i) => i + 1)
  const picked: number[] = []
  for (let i = 0; i < Math.min(count, days); i++) {
    const j = d.int(i, days - 1)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
    picked.push(pool[i])
  }
  return picked.sort((a, b) => a - b)
}

/**
 * The higher threat level of the domains at either end of a route or path (domainThreatLevel); a
 * POI end counts as its domain.
 */
export function routeThreat(
  state: Pick<GameState, 'world' | 'day'>,
  _content: Content,
  route: Pick<Route, 'from' | 'to'>
): number {
  const level = (id: string) => {
    const domain = domainAt(state.world, id)
    return domain === null ? 0 : domainThreatLevel(state.world, domain, state.day)
  }
  return Math.max(level(route.from), level(route.to))
}

/** Sea passage; the ship's speed doesn't depend on pace, so neither does the fare. */
export const fareFor = (route: Pick<Route, 'km' | 'terrain'>, members: number): number =>
  route.terrain === 'sea' ? SEA_FARE * members * journeyDays(route) : 0

/** Who pays a ship's fare: every member, and every owned animal (and cart). */
export const passengers = (
  state: Pick<GameState, 'party'> & Partial<Pick<GameState, 'animals'>>
): number => state.party.length + Object.values(state.animals ?? {}).reduce((sum, n) => sum + n, 0)

/** The terrain underfoot on a journey; null if its route or path has gone. */
export const routeTerrain = (
  state: Pick<GameState, 'world'>,
  content: Content,
  travel: TravelState
): Biome | null => edgeById(state, content, travel.route)?.terrain ?? null
