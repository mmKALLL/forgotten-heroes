import { TWIST_STAGE, type Effect, type Outcome, type OutcomeBranch } from '../../schema/encounter'
import type { EncounterState, GameState } from '../../schema/state'
import { previewCheck, type CheckPreview } from '../preview'
import { checkLabel } from '../rules/abilities'
import { canAct, rankActors } from '../rules/character'
import {
  TIERS,
  successChance,
  tierFaces,
  tierOdds,
  type FaceRange,
  type RollMode,
  type Tier,
} from '../rules/checks'
import { conditionHolds, describeCondition, describeEffect, openingEffects } from './effects'
import { isHighStakes, tierOutcome } from './outcomes'
import { POSITION_MODE, currentOptions, optionAvailable, unmetRequirements } from './run'
import { fillText } from './slots'

/** `next` is "escalates" for a twist branch that goes on to the twist's escalation stage. */
export type BranchPreview = {
  text: string
  effects: string[]
  next: 'end' | 'stay' | 'stage' | 'escalates'
}
/** An outcome row the player may read. `tier` is null for fixed options. `twist` shows as "if …". */
export type ShownOutcome = BranchPreview & {
  tier: Tier | null
  hidden: false
  twist: BranchPreview | null
}
/**
 * A critical tier kept secret before the roll (design §7): its odds show on the bar, but what it
 * does (text, effects and twist branch) stays a surprise until it is rolled.
 */
export type HiddenOutcome = { tier: CriticalTier; hidden: true }
/** One outcome row, in tier order. */
export type OutcomePreview = ShownOutcome | HiddenOutcome

type CriticalTier = Extract<Tier, 'critFail' | 'critSuccess'>
const isCritical = (tier: Tier): tier is CriticalTier =>
  tier === 'critFail' || tier === 'critSuccess'

export type OptionCheckPreview = CheckPreview & {
  label: string
  mode: RollMode
  /**
   * The encounter's next-check modifier (e.g. −2 after a misread), added to the actor's
   * `modifier` for the roll. `odds`, `successChance` and `highStakes` already include it.
   */
  situationalModifier: number
  /** Why, e.g. "misread"; null when no reason was given. */
  situationalReason: string | null
  successChance: number
  highStakes: boolean
  /** The d20 faces for each tier, with the effective modifier (actor's plus situational). */
  faces: Record<Tier, FaceRange | null>
  /** Everyone able to act, best first, for the actor picker. */
  actors: { id: string; name: string; modifier: number }[]
  /** Party members who can't act (downed or too exhausted), in party order, shown disabled. */
  unableActors: { id: string; name: string }[]
  /** Who acts when the player doesn't pick: the best of `actors`. */
  autoActorId: string
  autoActorName: string
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

/** Whether the player knows which twist it is: always for a bespoke twist, once revealed for a table one. */
const twistKindKnown = (encounter: EncounterState): boolean =>
  encounter.twistKind === null || encounter.twistKindRevealed

/**
 * Effect chips. A condition that doesn't hold yet is spelled out ("Edge (if you know the odds)"),
 * and the opening hit stays generic until the player knows which twist it would be.
 */
function effectChips(effects: readonly Effect[], encounter: EncounterState, actorName: string) {
  return effects.flatMap((effect): string[] => {
    const chips =
      effect.effect === 'openingHit' && twistKindKnown(encounter)
        ? openingEffects(encounter).flatMap((e) => describeEffect(e, actorName) ?? [])
        : [describeEffect(effect, actorName) ?? []].flat()
    if (!effect.if || conditionHolds(effect.if, encounter)) return chips
    return chips.map((chip) => `${chip} (${describeCondition(effect.if!)})`)
  })
}

function branchPreview(
  branch: OutcomeBranch,
  encounter: EncounterState,
  values: Record<string, string>,
  actorName: string
): BranchPreview {
  return {
    text: fillText(branch.text, values),
    effects: effectChips(branch.effects, encounter, actorName),
    next:
      branch.goto === TWIST_STAGE
        ? 'escalates'
        : branch.goto
          ? 'stage'
          : branch.stay
            ? 'stay'
            : 'end',
  }
}

function outcomePreview(
  outcome: Outcome,
  tier: Tier | null,
  encounter: EncounterState,
  values: Record<string, string>,
  actorName: string
): ShownOutcome {
  return {
    ...branchPreview(outcome, encounter, values, actorName),
    tier,
    hidden: false,
    twist: outcome.twist ? branchPreview(outcome.twist, encounter, values, actorName) : null,
  }
}

/**
 * Everything the player sees before committing (design §7): the acting member, skill, DC, the
 * odds of every tier, and the outcomes of all but the critical tiers, which stay hidden. `actorIds` maps option ids to the player's actor overrides.
 */
export function encounterOptions(
  state: GameState,
  actorIds: Readonly<Record<string, string>> = {}
): OptionPreview[] {
  const encounter = state.encounter
  if (!encounter) return []
  const mode = POSITION_MODE[encounter.position]
  const situationalModifier = encounter.nextCheckModifier
  return currentOptions(encounter).map((option) => {
    const unmet = unmetRequirements(state, option.requires)
    const base = {
      id: option.id,
      label: fillText(option.label, encounter.slots),
      description: option.description && fillText(option.description, encounter.slots),
      kind: option.kind,
    }
    if (option.kind === 'fixed') {
      const outcomes = [outcomePreview(option.outcome, null, encounter, encounter.slots, 'someone')]
      return { ...base, available: optionAvailable(state, option), unmet, check: null, outcomes }
    }
    const { skill, ability, dc } = option.check
    const preview = previewCheck(state, skill, Number(dc), mode, actorIds[option.id], ability)
    if (!preview) {
      return {
        ...base,
        available: false,
        unmet: [...unmet, 'no one can act'],
        check: null,
        outcomes: [],
      }
    }
    const values = { ...encounter.slots, actor: preview.actorName }
    const nameOf = (id: string) => state.party.find((c) => c.id === id)?.name ?? '?'
    // The same effective modifier `chooseOption` rolls with.
    const effective = preview.modifier + situationalModifier
    const odds = tierOdds(effective, preview.dc, mode)
    const actors = rankActors(state.party, skill, ability).map((r) => ({
      id: r.characterId,
      name: nameOf(r.characterId),
      modifier: r.modifier,
    }))
    const check: OptionCheckPreview = {
      ...preview,
      odds,
      label: checkLabel(skill, ability),
      mode,
      situationalModifier,
      situationalReason: encounter.nextCheckReason,
      successChance: successChance(odds),
      highStakes: isHighStakes(option, odds),
      faces: tierFaces(effective, preview.dc),
      actors,
      unableActors: state.party.filter((c) => !canAct(c)).map((c) => ({ id: c.id, name: c.name })),
      // previewCheck found an actor, so someone can act.
      autoActorId: actors[0].id,
      autoActorName: actors[0].name,
    }
    const outcomes = TIERS.map((tier): OutcomePreview =>
      isCritical(tier)
        ? { tier, hidden: true }
        : outcomePreview(tierOutcome(option, tier), tier, encounter, values, preview.actorName)
    )
    return { ...base, available: optionAvailable(state, option), unmet, check, outcomes }
  })
}

/**
 * Null when the situation has no twist. The chance is null until revealed (e.g. by Insight). A
 * table twist reads as the situation's vague `what` until its kind is known.
 */
export function twistInfo(state: GameState): TwistInfo | null {
  const encounter = state.encounter
  const twist = encounter?.situation.twist
  if (!encounter || !twist) return null
  const what =
    encounter.twistKind && encounter.twistKindRevealed ? encounter.twistKind.what : twist.what
  return { what, chance: encounter.twistRevealed ? twist.chance : null }
}
