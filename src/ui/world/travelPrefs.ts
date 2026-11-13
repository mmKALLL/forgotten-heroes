import { useState } from 'react'
import { PACES, type Pace } from '../../schema/types'

/**
 * The pace, foraging and hired mounts chosen in the settlement panel (UI state only, not part of
 * GameState). `mounted` hires riding animals wherever a road offers them.
 */
export type TravelPrefs = { pace: Pace; forage: boolean; mounted: boolean }

/**
 * A remembered pace as one of today's: "cover" (cautious, covering tracks, before Stealthy) and
 * "cautious" (removed) are Stealthy, and anything unknown is steady.
 */
export const normalizePace = (pace: unknown): Pace =>
  pace === 'cover' || pace === 'cautious'
    ? 'stealthy'
    : PACES.includes(pace as Pace)
      ? (pace as Pace)
      : 'steady'

export const DEFAULT_TRAVEL_PREFS: TravelPrefs = { pace: 'steady', forage: true, mounted: false }

/** Where the last travel choices are remembered (per viewer, with the game's seed). */
export const TRAVEL_PREFS_KEY = 'forgotten-heroes/ui/travel-prefs'

type Stored = { seed: number; prefs: TravelPrefs }

/** The remembered choices, if they are this game's and well-formed; never throws. */
function loadPrefs(seed: number): TravelPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(TRAVEL_PREFS_KEY) ?? 'null') as Stored | null
    if (!raw || raw.seed !== seed || typeof raw.prefs !== 'object') return DEFAULT_TRAVEL_PREFS
    return {
      pace: normalizePace(raw.prefs.pace),
      forage: typeof raw.prefs.forage === 'boolean' ? raw.prefs.forage : true,
      mounted: raw.prefs.mounted === true,
    }
  } catch {
    return DEFAULT_TRAVEL_PREFS
  }
}

function savePrefs(stored: Stored): void {
  try {
    localStorage.setItem(TRAVEL_PREFS_KEY, JSON.stringify(stored))
  } catch {
    // Storage may be unavailable (a private window): the choices last for this session only.
  }
}

/**
 * The travel choices for one game: they survive journeys and encounters (which unmount the
 * settlement panel) and a reload (designer call 2026-11-14: foraging keeps the last choice), and
 * reset when a new party starts, since that game has a new seed.
 */
export function useTravelPrefs(seed: number): [TravelPrefs, (p: TravelPrefs) => void] {
  const [stored, setStored] = useState<Stored>(() => ({ seed, prefs: loadPrefs(seed) }))
  const prefs = stored.seed === seed ? stored.prefs : loadPrefs(seed)
  return [
    prefs,
    (p) => {
      const next = { seed, prefs: p }
      setStored(next)
      savePrefs(next)
    },
  ]
}
