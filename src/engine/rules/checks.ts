import { MAX_DC, MIN_DC, TIERS, type Tier } from '../../schema/types'
import { withRng, type Rng } from '../rng'
import { PARTIAL_MARGIN } from '../constants'

export { TIERS }
export type { Tier }

export const TIER_LABELS: Record<Tier, string> = {
  critFail: 'Critical failure',
  fail: 'Failure',
  partial: 'Partial success',
  success: 'Success',
  critSuccess: 'Critical success',
}

/** Whole-number DC in [MIN_DC, MAX_DC] (NaN → MIN_DC), so every state stays save-valid. */
export const normalizeDc = (dc: number): number =>
  Number.isNaN(dc) ? MIN_DC : Math.min(MAX_DC, Math.max(MIN_DC, Math.round(dc)))

/** Edge = advantage, Exposed = disadvantage. Advantage is earned, never free (see design §3). */
export type RollMode = 'normal' | 'advantage' | 'disadvantage'

export function tierFor(d20: number, total: number, dc: number): Tier {
  if (d20 === 20) return 'critSuccess'
  if (d20 === 1) return 'critFail'
  if (total >= dc) return 'success'
  if (total >= dc - PARTIAL_MARGIN) return 'partial'
  return 'fail'
}

const emptyOdds = (): Record<Tier, number> => ({
  critFail: 0,
  fail: 0,
  partial: 0,
  success: 0,
  critSuccess: 0,
})

/**
 * Exact tier probabilities by enumerating every die outcome (20 or 400 cases). With `rerollOnes`
 * (a `lucky` hook, gear/hooks.ts), a kept natural 1 is rerolled once and the new die stands: each
 * such case splits into the 20 faces of the reroll.
 */
export function tierOdds(
  modifier: number,
  dc: number,
  mode: RollMode = 'normal',
  rerollOnes = false
): Record<Tier, number> {
  // Count whole outcomes, then divide once, so no float error accumulates. Every kept die weighs
  // 20; a rerolled 1 hands its weight to the 20 faces of the reroll.
  const counts = emptyOdds()
  const count = (kept: number) => {
    if (kept === 1 && rerollOnes) {
      for (let r = 1; r <= 20; r++) counts[tierFor(r, r + modifier, dc)]++
    } else counts[tierFor(kept, kept + modifier, dc)] += 20
  }
  let cases: number
  if (mode === 'normal') {
    cases = 20 * 20
    for (let d = 1; d <= 20; d++) count(d)
  } else {
    cases = 400 * 20
    for (let a = 1; a <= 20; a++) {
      for (let b = 1; b <= 20; b++) count(mode === 'advantage' ? Math.max(a, b) : Math.min(a, b))
    }
  }
  const odds = emptyOdds()
  for (const tier of TIERS) odds[tier] = counts[tier] / cases
  return odds
}

export type FaceRange = { min: number; max: number }

/**
 * The d20 faces (of the kept die) that land in each tier, or null when none do.
 * Tiers are monotonic in the face, so each tier's faces form one contiguous range.
 */
export function tierFaces(modifier: number, dc: number): Record<Tier, FaceRange | null> {
  const faces: Record<Tier, FaceRange | null> = {
    critFail: null,
    fail: null,
    partial: null,
    success: null,
    critSuccess: null,
  }
  for (let f = 1; f <= 20; f++) {
    const tier = tierFor(f, f + modifier, dc)
    const range = faces[tier]
    if (!range) faces[tier] = { min: f, max: f }
    else if (range.max === f - 1) range.max = f
    else
      throw new Error(
        `tierFaces: ${tier} faces are not contiguous (modifier ${modifier}, DC ${dc})`
      )
  }
  return faces
}

export const successChance = (odds: Record<Tier, number>): number => odds.success + odds.critSuccess

export type RollOutcome = {
  dice: number[]
  kept: number
  /** Index into `dice` of the kept die (the first one when both dice match). */
  keptIndex: number
  modifier: number
  total: number
  dc: number
  mode: RollMode
  tier: Tier
}

/**
 * Rolls a check. With `rerollOnes` (a `lucky` hook), a kept natural 1 is rerolled once: the new
 * die replaces it in `dice` and stands, whatever the other die of an advantage or disadvantage
 * roll shows. The third value says whether that happened (the caller spends the luck).
 */
export function rollCheck(
  rng: Rng,
  modifier: number,
  dc: number,
  mode: RollMode = 'normal',
  rerollOnes = false
): [RollOutcome, Rng, boolean] {
  const [[outcome, rerolled], next] = withRng(rng, (d): [RollOutcome, boolean] => {
    const dice = mode === 'normal' ? [d.int(1, 20)] : [d.int(1, 20), d.int(1, 20)]
    let kept =
      mode === 'advantage'
        ? Math.max(...dice)
        : mode === 'disadvantage'
          ? Math.min(...dice)
          : dice[0]
    const keptIndex = dice.indexOf(kept)
    const rerolled = rerollOnes && kept === 1
    if (rerolled) {
      kept = d.int(1, 20)
      dice[keptIndex] = kept
    }
    const total = kept + modifier
    const tier = tierFor(kept, total, dc)
    return [{ dice, kept, keptIndex, modifier, total, dc, mode, tier }, rerolled]
  })
  return [outcome, next, rerolled]
}
