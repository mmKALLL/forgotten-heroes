import type { Outcome, OutcomeBranch } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { previewCheck, type CheckPreview } from '../preview'
import { checkLabel } from '../rules/abilities'
import { rankActors } from '../rules/character'
import { TIERS, successChance, tierOdds, type RollMode, type Tier } from '../rules/checks'
import { describeEffect } from './effects'
import { isHighStakes, tierOutcome } from './outcomes'
import { POSITION_MODE, currentOptions, unmetRequirements } from './run'
import { fillText } from './slots'

export type BranchPreview = { text: string; effects: string[]; next: 'end' | 'stay' | 'stage' }
/** One row of an option card. `tier` is null for fixed options. `twist` is shown as "if …". */
export type OutcomePreview = BranchPreview & { tier: Tier | null; twist: BranchPreview | null }

export type OptionCheckPreview = CheckPreview & {
  label: string
  mode: RollMode
  /**
   * The encounter's next-check modifier (e.g. −2 after a misread), added to the actor's
   * `modifier` for the roll. `odds`, `successChance` and `highStakes` already include it.
   */
  situationalModifier: number
  successChance: number
  highStakes: boolean
  /** Everyone able to act, best first, for the actor picker. */
  actors: { id: string; name: string; modifier: number }[]
}

export type OptionPreview = {
  id: string
  label: string
  description?: string
  kind: 'check' | 'fixed'
  available: boolean
  /** Why it isn't available, e.g. "needs 15 gp". */
  unmet: string[]
  check: OptionCheckPreview | null
  outcomes: OutcomePreview[]
}

/** What the twist would be is always shown (its outcome branches are); the odds only once revealed. */
export type TwistInfo = { what: string; chance: number | null }

function branchPreview(branch: OutcomeBranch, values: Record<string, string>, actorName: string): BranchPreview {
  return {
    text: fillText(branch.text, values),
    effects: branch.effects.flatMap((e) => describeEffect(e, actorName) ?? []),
    next: branch.goto ? 'stage' : branch.stay ? 'stay' : 'end',
  }
}

function outcomePreview(
  outcome: Outcome,
  tier: Tier | null,
  values: Record<string, string>,
  actorName: string
): OutcomePreview {
  return {
    ...branchPreview(outcome, values, actorName),
    tier,
    twist: outcome.twist ? branchPreview(outcome.twist, values, actorName) : null,
  }
}

/**
 * Everything the player sees before committing (design §7): the acting member, skill, DC, odds
 * and every outcome tier. `actorIds` maps option ids to the player's actor overrides.
 */
export function encounterOptions(state: GameState, actorIds: Readonly<Record<string, string>> = {}): OptionPreview[] {
  const encounter = state.encounter
  if (!encounter) return []
  const mode = POSITION_MODE[encounter.position]
  const situationalModifier = encounter.nextCheckModifier
  return currentOptions(encounter).map((option) => {
    const unmet = unmetRequirements(state, option.requires)
    const base = { id: option.id, label: option.label, description: option.description, kind: option.kind }
    if (option.kind === 'fixed') {
      const outcomes = [outcomePreview(option.outcome, null, encounter.slots, 'someone')]
      return { ...base, available: unmet.length === 0, unmet, check: null, outcomes }
    }
    const { skill, ability, dc } = option.check
    const preview = previewCheck(state, skill, Number(dc), mode, actorIds[option.id], ability)
    if (!preview) {
      return { ...base, available: false, unmet: [...unmet, 'no one can act'], check: null, outcomes: [] }
    }
    const values = { ...encounter.slots, actor: preview.actorName }
    const nameOf = (id: string) => state.party.find((c) => c.id === id)?.name ?? '?'
    // The same effective modifier `chooseOption` rolls with.
    const odds = tierOdds(preview.modifier + situationalModifier, preview.dc, mode)
    const check: OptionCheckPreview = {
      ...preview,
      odds,
      label: checkLabel(skill, ability),
      mode,
      situationalModifier,
      successChance: successChance(odds),
      highStakes: isHighStakes(option, odds),
      actors: rankActors(state.party, skill, ability).map((r) => ({ id: r.characterId, name: nameOf(r.characterId), modifier: r.modifier })),
    }
    const outcomes = TIERS.map((tier) => outcomePreview(tierOutcome(option, tier), tier, values, preview.actorName))
    return { ...base, available: unmet.length === 0, unmet, check, outcomes }
  })
}

/** Null when the situation has no twist. The chance is null until revealed (e.g. by Insight). */
export function twistInfo(state: GameState): TwistInfo | null {
  const twist = state.encounter?.situation.twist
  if (!twist) return null
  return { what: twist.what, chance: state.encounter!.twistRevealed ? twist.chance : null }
}
