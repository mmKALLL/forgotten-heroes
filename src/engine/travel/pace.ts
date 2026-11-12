import type { Pace, Position } from '../../schema/constants'
import type { TravelState } from '../../schema/state'

// Travel pace (design §7). Every tuning number for pace lives here.

export const DEFAULT_PACE: Pace = 'steady'

/** Speed multiplier on land. Ships sail at their own speed, whatever the pace. */
export const PACE_SPEED: Readonly<Record<Pace, number>> = {
  cautious: 2 / 3,
  steady: 1,
  brisk: 1.25,
  forced: 1.5,
}

/**
 * Added to the chance that each encounter slot above the minimum fills. Cautious keeps the usual
 * rate: it skips some hostile encounters instead (paceHostileAvoidance).
 */
export const PACE_ENCOUNTER_BONUS: Readonly<Record<Pace, number>> = {
  cautious: 0,
  steady: 0,
  brisk: 0.1,
  forced: 0.1,
}

/** The share of hostile encounters a cautious party avoids (applied when encounters are drawn). */
export const CAUTIOUS_HOSTILE_AVOIDANCE = 0.4

/**
 * A forced march eats and drinks this share more per day on top of the daily ration, so it costs
 * more supplies per km despite the speed.
 */
export const FORCED_MARCH_EXTRA_RATIONS = 0.5
/** Each forced-march day, every member makes a CON check against this DC or gains exhaustion. */
export const FORCED_MARCH_DC = 12

/** Covering tracks (cautious only) costs this many extra days per day travelled. */
export const COVER_TRACKS_EXTRA_DAYS = 0.25

/** The chance a hostile encounter is skipped at this pace (0 except when cautious). */
export const paceHostileAvoidance = (pace: Pace): number =>
  pace === 'cautious' ? CAUTIOUS_HOSTILE_AVOIDANCE : 0

export const canCoverTracks = (pace: Pace): boolean => pace === 'cautious'

/** Whether the party is actually covering its tracks: the flag only counts at cautious pace. */
export const coversTracks = (pace: Pace, coverTracks: boolean): boolean =>
  coverTracks && canCoverTracks(pace)

/** Food and water per member per day, as a multiple of the daily ration. */
export const rationMultiplier = (pace: Pace): number =>
  pace === 'forced' ? 1 + FORCED_MARCH_EXTRA_RATIONS : 1

/**
 * The footing an ambush meets the party on: cautious → normal, or Edge with covered tracks;
 * brisk and forced → Exposed; steady → whatever the encounter defines.
 */
export function ambushPositionForPace(
  pace: Pace,
  coverTracks: boolean,
  defined: Position = 'normal'
): Position {
  switch (pace) {
    case 'cautious':
      return coversTracks(pace, coverTracks) ? 'edge' : 'normal'
    case 'steady':
      return defined
    case 'brisk':
    case 'forced':
      return 'exposed'
  }
}

/** Records one day travelled (game day `day`) at the journey's current pace, for pursuit. */
export const logPaceDay = (travel: TravelState, day: number): TravelState => ({
  ...travel,
  paceLog: [
    ...travel.paceLog,
    { day, pace: travel.pace, coverTracks: coversTracks(travel.pace, travel.coverTracks) },
  ],
})
