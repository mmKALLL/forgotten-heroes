/** The whole roll, every die settled, takes at most this long (design §9). */
export const DICE_MAX_MS = 1500
const FIRST_SETTLE_MS = 600
const SETTLE_GAP_MS = 250
/** On a high-stakes roll the last die lingers until here. */
const HIGH_STAKES_LAST_MS = 1400
const FLICKER_MS = 60
const SLOW_FLICKER_MS = 170
/** How long before settling the last high-stakes die starts to slow down. */
const SLOWDOWN_WINDOW_MS = 600

/** When each die settles, in ms from the start. Dice settle one after another. */
export function settleTimes(count: number, highStakes: boolean): number[] {
  const times = Array.from({ length: count }, (_, i) => FIRST_SETTLE_MS + i * SETTLE_GAP_MS)
  if (highStakes && count > 0) times[count - 1] = HIGH_STAKES_LAST_MS
  return times
}

/** Delay before the next face flicker of an unsettled die. The last high-stakes die slows down. */
export function flickerDelay(msUntilSettle: number, slow: boolean): number {
  return slow && msUntilSettle < SLOWDOWN_WINDOW_MS ? SLOW_FLICKER_MS : FLICKER_MS
}
