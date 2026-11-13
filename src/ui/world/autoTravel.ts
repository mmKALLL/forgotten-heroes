import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Content } from '../../content/build'
import { KM_PER_DAY } from '../../engine/constants'
import type { Action } from '../../engine/state'
import { journeyInfo, nextDayKm } from '../../engine/travel/preview'
import type { GameState, TravelState } from '../../schema/state'
import { prefersReducedMotion } from '../dice/DiceRoll'

// Auto-travel (design §7, designer call 2026-11-14): on the road the party walks on by itself,
// one engine day (`continueJourney` with `days: 1`) each time the marker reaches the day's end.
// Nothing ticks in the engine: this clock only decides when to dispatch.

/** Auto-travel's map speed on plains, in km per real second. */
export const AUTO_TRAVEL_KM_PER_SECOND = 5

/** The longest frame counted, in ms, so a stall (or a tab coming back) never skips a day. */
const MAX_FRAME_MS = 250

type Speed = Pick<TravelState, 'kmPerDay'>

/**
 * How fast the marker moves, in km per real second: AUTO_TRAVEL_KM_PER_SECOND times the journey's
 * speed relative to plains (its km per day, with the terrain, pace, load, mounts and exhaustion
 * already in it, over KM_PER_DAY.plains). Mountains on foot (15 km a day) crawl at 2.5 km/s.
 */
export const autoTravelKmPerSecond = (travel: Speed): number =>
  (AUTO_TRAVEL_KM_PER_SECOND * travel.kmPerDay) / KM_PER_DAY.plains

/**
 * The real ms the journey's next day takes: the km that day covers at autoTravelKmPerSecond. A
 * full day therefore always takes KM_PER_DAY.plains / AUTO_TRAVEL_KM_PER_SECOND = 6 s; rough
 * land shows as a slower marker, not a longer wait, and the last, shorter day is quicker.
 */
export const autoTravelDayMs = (travel: Pick<TravelState, 'km' | 'kmDone' | 'kmPerDay'>): number =>
  (nextDayKm(travel) / autoTravelKmPerSecond(travel)) * 1000

/** Which day of which journey a glide belongs to (null off the road). */
export const journeyDayKey = (state: Pick<GameState, 'travel' | 'day'>): string | null => {
  const t = state.travel
  return t ? `${t.route}:${t.from}:${t.daysDone}:${t.kmDone}:${state.day}` : null
}

/** How much of the day under way the marker shows (0 to 1), for that day only. */
export type Glide = { key: string | null; share: number }

const STILL: Glide = { key: null, share: 0 }

/**
 * The marker's glide, outside React state so that only the map re-renders each frame (the map
 * subscribes with useGlideShare; the rest of the game doesn't).
 */
export class GlideStore {
  private value: Glide = STILL
  private listeners = new Set<() => void>()
  get = (): Glide => this.value
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  set(value: Glide) {
    this.value = value
    for (const listener of this.listeners) listener()
  }
}

const noSubscribe = () => () => {}
const still = () => STILL

/** The share of the current day the map shows the party past its last stop (0 without a glide). */
export function useGlideShare(
  store: GlideStore | undefined,
  state: Pick<GameState, 'travel' | 'day'>
): number {
  const glide = useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.get ?? still)
  return glide.key !== null && glide.key === journeyDayKey(state) ? glide.share : 0
}

/** A modal is open (the end screen and the like) or the tab is hidden: time stands still. */
const waiting = (): boolean =>
  document.hidden || document.querySelector('[aria-modal="true"]') !== null

const frame = (f: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(f)
    return () => cancelAnimationFrame(id)
  }
  const id = setTimeout(f, 16)
  return () => clearTimeout(id)
}

export type AutoTravel = {
  /** The clock is running: the party walks on by itself. */
  running: boolean
  /** The player paused, or the last walk stopped for the player (TravelState.halt). */
  paused: boolean
  /** The journey can walk on at all (no encounter, someone fit, the run not over). */
  canRun: boolean
  toggle: () => void
  glide: GlideStore
}

/**
 * Walks the journey on by itself: each day takes autoTravelDayMs of real time, then dispatches
 * `continueJourney` for one day. It waits while an encounter is open (and goes on once it is
 * closed), while `hold` (a roll animating, the run over), while a modal is open or the tab is
 * hidden, and pauses when the walk stopped for the player (went without, a supply warning, no one
 * fit) until the player resumes. A new journey starts running. With reduced motion the marker
 * jumps a day at a time instead of gliding.
 */
export function useAutoTravel(
  state: GameState,
  content: Content,
  dispatch: (action: Action) => void,
  hold = false
): AutoTravel {
  const travel = state.travel
  const journey = travel ? `${travel.route}:${travel.from}:${travel.to}` : null
  const [paused, setPaused] = useState(() => travel?.halt !== undefined)
  const [seen, setSeen] = useState({ journey, travel })
  if (seen.travel !== travel) {
    // A new journey runs (unless it is a save that stopped for the player); a walk that stops
    // for the player pauses.
    setSeen({ journey, travel })
    if (journey !== seen.journey) setPaused(travel?.halt !== undefined)
    else if (travel?.halt !== undefined) setPaused(true)
  }
  const [glide] = useState(() => new GlideStore())
  const [reduced] = useState(prefersReducedMotion)
  const canRun = (journeyInfo(state, content)?.canMove ?? false) && !hold
  const running = canRun && !paused
  const key = journeyDayKey(state)
  // The real time spent on the day under way, kept across a pause.
  const clock = useRef<{ key: string | null; elapsed: number }>({ key: null, elapsed: 0 })
  const day = useRef(travel)
  day.current = travel
  const send = useRef(dispatch)
  send.current = dispatch

  useEffect(() => {
    const t = day.current
    if (!running || !t || key === null) return
    if (clock.current.key !== key) clock.current = { key, elapsed: 0 }
    const total = autoTravelDayMs(t)
    let last = performance.now()
    let cancel = () => {}
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(Math.max(0, now - last), MAX_FRAME_MS)
      last = now
      if (!waiting()) clock.current.elapsed += dt
      const share = total > 0 ? Math.min(1, clock.current.elapsed / total) : 1
      if (!reduced) glide.set({ key, share })
      if (share >= 1) {
        send.current({ type: 'continueJourney', days: 1 })
        return
      }
      cancel = frame(tick)
    }
    cancel = frame(tick)
    return () => cancel()
  }, [running, key, glide, reduced])

  return { running, paused, canRun, toggle: () => setPaused((p) => !p), glide }
}
