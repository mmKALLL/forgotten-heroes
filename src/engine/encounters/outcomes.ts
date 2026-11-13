import type { CheckOption, Option, Outcome, OutcomeBranch, Situation } from '../../schema/encounter'
import { TIERS, successChance, type Tier } from '../rules/checks'
import { checkXp } from '../rules/progression'
import {
  CAMARADERIE_CRIT_FAIL,
  CAMARADERIE_FAIL,
  CAMARADERIE_RETREAT,
  HIGH_STAKES_BAND,
} from '../constants'

/**
 * The `used` key of a `once` option on a stage: its own id, or its group's (`once: "name"`), so
 * choosing any option of a group uses up all of them.
 */
export const onceKey = (stageId: string, option: Pick<Option, 'id' | 'once'>): string =>
  typeof option.once === 'string' ? `${stageId}/@${option.once}` : `${stageId}/${option.id}`

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

/**
 * The camaraderie a choice costs (Plan 6; design §3), as a negative amount or 0: a failed check
 * CAMARADERIE_FAIL and a critical failure CAMARADERIE_CRIT_FAIL, plus CAMARADERIE_RETREAT for an
 * option tagged `retreat`, each per living member beyond the first (more people pin the blame on
 * someone). `tier` is null for a fixed option. Wonders cost nothing.
 */
export function setbackCamaraderie(
  members: number,
  situation: Pick<Situation, 'wonder'>,
  option: Pick<Option, 'tags'>,
  tier: Tier | null
): number {
  const others = Math.max(0, members - 1)
  if (situation.wonder || others === 0) return 0
  const failed =
    tier === 'critFail' ? CAMARADERIE_CRIT_FAIL : tier === 'fail' ? CAMARADERIE_FAIL : 0
  const fled = option.tags?.includes('retreat') ? CAMARADERIE_RETREAT : 0
  // Whole points: half a point rounds up (CAMARADERIE_FAIL is 2.5 a member).
  return -Math.round((failed + fled) * others)
}
