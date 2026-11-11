import { withRng, type Rng } from '../rng'

export const TIERS = ['critFail', 'fail', 'partial', 'success', 'critSuccess'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_LABELS: Record<Tier, string> = {
  critFail: 'Critical failure',
  fail: 'Failure',
  partial: 'Partial success',
  success: 'Success',
  critSuccess: 'Critical success',
}

/** Edge = advantage, Exposed = disadvantage. Advantage is earned, never free (see design §3). */
export type RollMode = 'normal' | 'advantage' | 'disadvantage'

/** Totals this far below the DC still count as a partial success. */
export const PARTIAL_MARGIN = 3

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

/** Exact tier probabilities by enumerating every die outcome (20 or 400 cases). */
export function tierOdds(modifier: number, dc: number, mode: RollMode = 'normal'): Record<Tier, number> {
  const odds = emptyOdds()
  if (mode === 'normal') {
    for (let d = 1; d <= 20; d++) odds[tierFor(d, d + modifier, dc)] += 1 / 20
    return odds
  }
  for (let a = 1; a <= 20; a++) {
    for (let b = 1; b <= 20; b++) {
      const kept = mode === 'advantage' ? Math.max(a, b) : Math.min(a, b)
      odds[tierFor(kept, kept + modifier, dc)] += 1 / 400
    }
  }
  return odds
}

export const successChance = (odds: Record<Tier, number>): number => odds.success + odds.critSuccess

export type RollOutcome = {
  dice: number[]
  kept: number
  modifier: number
  total: number
  dc: number
  mode: RollMode
  tier: Tier
}

export function rollCheck(
  rng: Rng,
  modifier: number,
  dc: number,
  mode: RollMode = 'normal'
): [RollOutcome, Rng] {
  return withRng(rng, (d) => {
    const dice = mode === 'normal' ? [d.int(1, 20)] : [d.int(1, 20), d.int(1, 20)]
    const kept =
      mode === 'advantage' ? Math.max(...dice) : mode === 'disadvantage' ? Math.min(...dice) : dice[0]
    const total = kept + modifier
    return { dice, kept, modifier, total, dc, mode, tier: tierFor(kept, total, dc) }
  })
}
