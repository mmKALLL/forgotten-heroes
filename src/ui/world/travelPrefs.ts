import { useState } from 'react'
import { PACES, type Pace } from '../../schema/types'

/**
 * The pace, foraging and hired mounts chosen in the settlement panel (UI state only, not part of
 * GameState). `mounted` hires riding animals wherever a road offers them.
 */
export type TravelPrefs = { pace: Pace; forage: boolean; mounted: boolean }

/** Retired paces and the pace that replaces each. */
const RETIRED: Readonly<Record<string, Pace>> = {
  // Covering tracks, before Stealthy.
  cover: 'stealthy',
  // Cautious (¾ speed) is gone (designer decision): Stealthy is the careful pace.
  cautious: 'stealthy' as Pace,
}

/**
 * A remembered pace as one of today's: a retired one ("cover", "cautious") is Stealthy, and
 * anything unknown is steady.
 */
export const normalizePace = (pace: unknown): Pace =>
  typeof pace === 'string' && Object.hasOwn(RETIRED, pace)
    ? RETIRED[pace]
    : PACES.includes(pace as Pace)
      ? (pace as Pace)
      : 'steady'

export const DEFAULT_TRAVEL_PREFS: TravelPrefs = { pace: 'steady', forage: true, mounted: false }

/**
 * The travel choices for one game: they survive journeys and encounters (which unmount the
 * settlement panel) and reset when a new party starts, since that game has a new seed.
 */
export function useTravelPrefs(seed: number): [TravelPrefs, (p: TravelPrefs) => void] {
  const [stored, setStored] = useState<{ seed: number; prefs: TravelPrefs }>({
    seed,
    prefs: DEFAULT_TRAVEL_PREFS,
  })
  const prefs = stored.seed === seed ? stored.prefs : DEFAULT_TRAVEL_PREFS
  return [prefs, (p) => setStored({ seed, prefs: p })]
}
