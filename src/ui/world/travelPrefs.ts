import { useState } from 'react'
import type { PaceChoice } from './travelText'

/** The pace and foraging chosen in the settlement panel (UI state only, not part of GameState). */
export type TravelPrefs = { pace: PaceChoice; forage: boolean }

export const DEFAULT_TRAVEL_PREFS: TravelPrefs = { pace: 'steady', forage: true }

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
