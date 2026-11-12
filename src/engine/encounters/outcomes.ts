import type { CheckOption, Outcome, OutcomeBranch } from '../../schema/encounter'
import { TIERS, successChance, type Tier } from '../rules/checks'
import { HIGH_STAKES_BAND } from '../constants'

/** The outcome for a tier; critical tiers fall back to fail and success. */
export function tierOutcome(option: CheckOption, tier: Tier): Outcome {
  const { outcomes } = option
  if (tier === 'critFail') return outcomes.critFail ?? outcomes.fail
  if (tier === 'critSuccess') return outcomes.critSuccess ?? outcomes.success
  return outcomes[tier]
}

/** The twist branch replaces the outcome when the hidden twist is true. */
export const branchFor = (outcome: Outcome, twist: boolean): OutcomeBranch =>
  twist && outcome.twist ? outcome.twist : outcome

/** Flagged by content, or a close call where some outcome (twist included) costs HP. */
export function isHighStakes(option: CheckOption, odds: Record<Tier, number>): boolean {
  if (option.highStakes) return true
  const chance = successChance(odds)
  if (chance < HIGH_STAKES_BAND[0] || chance > HIGH_STAKES_BAND[1]) return false
  return TIERS.some((tier) => {
    const outcome = tierOutcome(option, tier)
    return [outcome, outcome.twist].some((b) =>
      b?.effects.some((e) => e.effect === 'hp' && e.amount < 0)
    )
  })
}
