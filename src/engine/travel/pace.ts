import type { Pace, Position } from '../../schema/types'
import type { TravelState } from '../../schema/state'
import { CAUTIOUS_HOSTILE_AVOIDANCE, FORCED_MARCH_EXTRA_RATIONS } from '../constants'

// Travel pace (design §7). Every tuning number for pace lives here.

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
 * The footing an ambush meets the party on: cautious → normal, or Edge with covered tracks (but
 * not on a journey that forages: the foragers' trails give the party away); brisk and forced →
 * Exposed; steady → whatever the encounter defines.
 */
export function ambushPositionForPace(
  pace: Pace,
  coverTracks: boolean,
  defined: Position = 'normal',
  foraging = false
): Position {
  switch (pace) {
    case 'cautious':
      return coversTracks(pace, coverTracks) && !foraging ? 'edge' : 'normal'
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
