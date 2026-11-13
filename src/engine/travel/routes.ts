import type { Content } from '../../content/build'
import type { Biome, Pace } from '../../schema/types'
import type { Character, GameState, TravelState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { allSituations } from '../encounters/compile'
import { fitsPlace } from '../encounters/run'
import { edgeById } from '../world/graph'
import { domainAt, domainThreatLevel } from '../world/pois'
import type { Draw } from '../rng'
import { load, loadSpeed, type Hired } from '../economy/capacity'
import { mountSpeed } from '../town/animals'
import { escortPassengers } from '../town/contract-hooks'
import { paceHostileAvoidance } from './pace'
import {
  DEFAULT_PACE,
  ENCOUNTER_SLOT_CHANCE,
  ESCORT_HOSTILE,
  EXHAUSTION_SPEED_MIN,
  EXHAUSTION_SPEED_PENALTY,
  FORAGE_HOSTILE_BONUS,
  HOSTILE_BASE,
  HOSTILE_PER_DANGER,
  HOSTILE_PER_THREAT,
  HOSTILE_SHARE_RANGE,
  HURRY_SAVES_FROM,
  KM_PER_DAY,
  LONG_JOURNEY_DAYS,
  PACE_HOSTILE_BONUS,
  PACE_SPEED,
  SEA_FARE,
  SHORT_HOP_DAYS,
  VEHICLE_HOSTILE,
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
 * The share of its speed the party keeps for its most exhausted member: EXHAUSTION_SPEED_PENALTY
 * less per level, at least EXHAUSTION_SPEED_MIN.
 */
export const exhaustionSpeed = (party: readonly Pick<Character, 'exhaustion'>[]): number => {
  const worst = party.reduce((most, c) => Math.max(most, c.exhaustion), 0)
  return Math.max(EXHAUSTION_SPEED_MIN, 1 - EXHAUSTION_SPEED_PENALTY * worst)
}

/**
 * The party's land speed multiplier on this terrain: slowed by its load (loadSpeed) and by the
 * most exhausted member (exhaustionSpeed), and sped up by mounts when everyone rides and no pack
 * animal or cart sets a walking pace (mountSpeed, the slowest traveller; `hired` previews hiring). Always 1 at sea, where the ship carries everything at its own speed.
 * A journey keeps the speed it set out at (TravelState.kmPerDay).
 */
export function landSpeed(
  state: Pick<GameState, 'party' | 'animals' | 'travel' | 'goods'>,
  content: Content,
  terrain: Biome,
  hired: Hired | null = state.travel?.hired ?? null
): number {
  if (terrain === 'sea') return 1
  const laden = load(state, content, { hired })
  return (
    loadSpeed(laden.level) *
    exhaustionSpeed(state.party) *
    mountSpeed(state, content, terrain, hired)
  )
}

/** Days on the road at this pace and speed, before the brisk and forced clamp (journeyDays). */
const rawDays = (route: Pick<Route, 'km' | 'terrain'>, pace: Pace, speed: number): number =>
  Math.max(1, Math.ceil(route.km / kmPerDay(route.terrain, pace, speed)))

/**
 * Days on the road at this pace and speed (load, exhaustion and mounts). On land, hurrying always
 * pays on a longer road (designer rule): where the steady pace takes HURRY_SAVES_FROM days or
 * more, Brisk takes at least a day less than Steady, and Forced never more than Brisk. The one
 * journey-days function: previews, deadlines and the journey itself (journeyKmPerDay) agree.
 */
export function journeyDays(
  route: Pick<Route, 'km' | 'terrain'>,
  pace: Pace = DEFAULT_PACE,
  speed = 1
): number {
  const days = rawDays(route, pace, speed)
  if (route.terrain === 'sea' || (pace !== 'brisk' && pace !== 'forced')) return days
  const steady = rawDays(route, 'steady', speed)
  if (steady < HURRY_SAVES_FROM) return days
  const brisk = Math.min(rawDays(route, 'brisk', speed), steady - 1)
  return pace === 'brisk' ? brisk : Math.min(days, brisk)
}

/**
 * km a journey covers each day: kmPerDay, or more where journeyDays' clamp shortens the road, so
 * the journey ends on the day the preview says.
 */
export const journeyKmPerDay = (
  route: Pick<Route, 'km' | 'terrain'>,
  pace: Pace = DEFAULT_PACE,
  speed = 1
): number =>
  Math.max(kmPerDay(route.terrain, pace, speed), route.km / journeyDays(route, pace, speed))

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
 * forced pace (PACE_HOSTILE_BONUS), visible wealth, escorted passengers and the party's vehicles
 * (VEHICLE_HOSTILE each), less the party's best `ward` hook (gear/hooks.ts), within HOSTILE_SHARE_RANGE. That is the share `drawn` hostile;
 * a stealthy party then steers clear of some of those (PACE_HOSTILE_AVOIDANCE: a quiet
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
  /** Working vehicles, carts and wagons (town/animals.ts vehicleCount): VEHICLE_HOSTILE each. */
  cargo: number
  /** The party's best worn ward (gear/hooks.ts wardShare), as a negative share (0 if none). */
  ward: number
  /** Hostile encounters steered clear of at this pace, as a negative share (0 if none). */
  avoided: number
}

export function hostileShare(
  danger: number,
  threatLevel: number,
  pace: Pace = DEFAULT_PACE,
  forage = false,
  wealthSteps = 0,
  escort = false,
  ward = 0,
  vehicles = 0
): HostileShare {
  const parts = {
    base: HOSTILE_BASE,
    danger: HOSTILE_PER_DANGER * danger,
    threat: HOSTILE_PER_THREAT * threatLevel,
    forage: forage ? FORAGE_HOSTILE_BONUS : 0,
    pace: PACE_HOSTILE_BONUS[pace],
    wealth: WEALTH_HOSTILE_PER_STEP * wealthSteps,
    escort: escort ? ESCORT_HOSTILE : 0,
    cargo: VEHICLE_HOSTILE * vehicles,
    ward: ward > 0 ? -ward : 0,
  }
  const [lo, hi] = HOSTILE_SHARE_RANGE
  const sum =
    parts.base +
    parts.danger +
    parts.threat +
    parts.forage +
    parts.pace +
    parts.wealth +
    parts.escort +
    parts.cargo +
    parts.ward
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

/**
 * Who pays a ship's fare: every member, every escorted passenger (they pay like members), and
 * every owned animal (and cart).
 */
export const passengers = (
  state: Pick<GameState, 'party'> & Partial<Pick<GameState, 'animals' | 'contracts'>>
): number =>
  state.party.length +
  escortPassengers({ contracts: state.contracts ?? [] }) +
  Object.values(state.animals ?? {}).reduce((sum, n) => sum + n, 0)

/** The terrain underfoot on a journey; null if its route or path has gone. */
export const routeTerrain = (
  state: Pick<GameState, 'world'>,
  content: Content,
  travel: TravelState
): Biome | null => edgeById(state, content, travel.route)?.terrain ?? null
