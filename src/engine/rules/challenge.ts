import { MAX_LEVEL } from '../../schema/types'
import { CR_DC, CR_DC_BEYOND, CR_LEVEL_OFFSET } from '../constants'

// Challenge ratings (Plan 6 C1): a foe's or obstacle's CR sets the base DC of checks against it,
// and the party level it is meant for. The Crisis's encounters use it (crisis/progress.ts); later,
// contracts and dungeons.

/** A CR as a table index: fractional CRs (½, ¼) read as the CR below, never below 0. */
const whole = (cr: number): number => Math.max(0, Math.floor(cr))

/** The base DC of a check against a foe or obstacle of this challenge rating (CR_DC table). */
export function crDc(cr: number): number {
  const n = whole(cr)
  const last = CR_DC.length - 1
  if (n <= last) return CR_DC[n]
  return CR_DC[last] + Math.floor((n - last) / CR_DC_BEYOND)
}

/** The party level a CR is meant for (≈ CR + 1); used by the sims and the "too strong" hint. */
export const crLevel = (cr: number): number =>
  Math.min(MAX_LEVEL, Math.max(1, whole(cr) + CR_LEVEL_OFFSET))
