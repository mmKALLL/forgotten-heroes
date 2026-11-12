import type { CheckOption, Outcome, OutcomeBranch, Situation } from '../../schema/encounter'
import { TIERS, successChance, type Tier } from '../rules/checks'
import { checkXp } from '../rules/progression'
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

/**
 * The XP a check's outcome branch grants by default (Plan 5a): checkXp by the snapshot's final DC
 * and the tier rolled. None in a wonder, and none when the branch has its own `xp` effect (even a
 * conditional one), which replaces the default.
 */
export function defaultXp(
  situation: Pick<Situation, 'wonder'>,
  branch: OutcomeBranch,
  dc: number,
  tier: Tier
): number {
  if (situation.wonder || branch.effects.some((e) => e.effect === 'xp')) return 0
  return checkXp(dc, tier)
}
