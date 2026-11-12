import type { Pace, Position } from '../../schema/types'
import type { TravelState } from '../../schema/state'
import { FORCED_MARCH_EXTRA_RATIONS, PACE_HOSTILE_AVOIDANCE } from '../constants'

// Travel pace (design §7). Every tuning number for pace lives in the constants' Pace section.

/** The chance a hostile encounter is skipped at this pace (stealthy and cautious only). */
export const paceHostileAvoidance = (pace: Pace): number => PACE_HOSTILE_AVOIDANCE[pace]

/** A stealthy party covers its tracks: pursuers lose the trail (pursuit.ts). */
export const coversTracks = (pace: Pace): boolean => pace === 'stealthy'

/** Food and water per member per day, as a multiple of the daily ration. */
export const rationMultiplier = (pace: Pace): number =>
  pace === 'forced' ? 1 + FORCED_MARCH_EXTRA_RATIONS : 1

/**
 * The footing an ambush meets the party on: stealthy → Edge (but not on a journey that forages:
 * the foragers' trails give the party away); cautious → normal; brisk and forced → Exposed;
 * steady → whatever the encounter defines.
 */
export function ambushPositionForPace(
  pace: Pace,
  defined: Position = 'normal',
  foraging = false
): Position {
  switch (pace) {
    case 'stealthy':
      return foraging ? 'normal' : 'edge'
    case 'cautious':
      return 'normal'
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
  paceLog: [...travel.paceLog, { day, pace: travel.pace }],
})
