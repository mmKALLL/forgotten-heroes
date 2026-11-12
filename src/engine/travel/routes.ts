import type { Content } from '../../content/build'
import type { Biome, Pace } from '../../schema/constants'
import type { GameState, TravelState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { allSituations } from '../encounters/compile'
import { fitsPlace } from '../encounters/run'
import { edgeById } from '../world/graph'
import { domainAt, domainThreatLevel } from '../world/pois'
import type { Draw } from '../rng'
import {
  COVER_TRACKS_EXTRA_DAYS,
  DEFAULT_PACE,
  PACE_ENCOUNTER_BONUS,
  PACE_SPEED,
  coversTracks,
} from './pace'

/** km per day on foot (or under sail) by terrain, at a steady pace. Morale will modify these later. */
export const KM_PER_DAY: Readonly<Record<Biome, number>> = {
  plains: 30,
  forest: 24,
  hills: 24,
  mountains: 15,
  marsh: 18,
  desert: 21,
  jungle: 18,
  sea: 75,
}
/** Passage on a ship, per member per day. */
export const SEA_FARE = 2
/** Journeys of up to this many days are short hops; this many or more are long. */
export const SHORT_HOP_DAYS = 2
export const LONG_JOURNEY_DAYS = 5

/**
 * km per calendar day. Pace scales the speed on land; covering tracks (cautious only) adds
 * COVER_TRACKS_EXTRA_DAYS per day travelled. A ship keeps its own speed whatever the pace.
 */
export function kmPerDay(terrain: Biome, pace: Pace = DEFAULT_PACE, coverTracks = false): number {
  if (terrain === 'sea') return KM_PER_DAY.sea
  const cover = coversTracks(pace, coverTracks) ? 1 + COVER_TRACKS_EXTRA_DAYS : 1
  return (KM_PER_DAY[terrain] * PACE_SPEED[pace]) / cover
}

export const journeyDays = (
  route: Pick<Route, 'km' | 'terrain'>,
  pace: Pace = DEFAULT_PACE,
  coverTracks = false
): number => Math.max(1, Math.ceil(route.km / kmPerDay(route.terrain, pace, coverTracks)))

/** The encounter budget (design §7): a short hop gets 0–2, a long journey 2–4. */
export function encounterRange(days: number): [number, number] {
  if (days <= SHORT_HOP_DAYS) return [0, 2]
  if (days >= LONG_JOURNEY_DAYS) return [2, 4]
  return [1, 3]
}

/** The chance that each encounter slot above the minimum fills; brisk and forced add to it. */
export const encounterChance = (
  danger: number,
  threatLevel: number,
  pace: Pace = DEFAULT_PACE
): number =>
  Math.min(
    0.9,
    Math.max(0.05, 0.2 + 0.15 * danger + 0.1 * threatLevel + PACE_ENCOUNTER_BONUS[pace])
  )

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
 * The encounter budget and the chance each slot above the fewest fills, for a journey of `days`
 * at this pace; none at all on a route where nothing can be met (canMeetEncounters).
 */
export function routeEncounters(
  meets: boolean,
  days: number,
  danger: number,
  threatLevel: number,
  pace: Pace = DEFAULT_PACE
): { encounters: [number, number]; chance: number } {
  if (!meets) return { encounters: [0, 0], chance: 0 }
  return { encounters: encounterRange(days), chance: encounterChance(danger, threatLevel, pace) }
}

/** The journey days with an encounter, ascending; a day may hold more than one. */
export function rollEncounterDays(
  d: Draw,
  days: number,
  [min, max]: [number, number],
  chance: number
): number[] {
  let count = min
  for (let slot = min; slot < max; slot++) if (d.float() < chance) count++
  return Array.from({ length: count }, () => d.int(1, days)).sort((a, b) => a - b)
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

/** The terrain underfoot on a journey; null if its route or path has gone. */
export const routeTerrain = (
  state: Pick<GameState, 'world'>,
  content: Content,
  travel: TravelState
): Biome | null => edgeById(state, content, travel.route)?.terrain ?? null
