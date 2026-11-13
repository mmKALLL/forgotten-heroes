import { TWIST_STAGE, type Effect, type Outcome, type OutcomeBranch } from '../../schema/encounter'
import type { EncounterState, GameState } from '../../schema/state'
import { previewCheck, type CheckPreview } from '../preview'
import { checkLabel } from '../rules/abilities'
import { canAct, rankActors } from '../rules/character'
import { strainOf } from '../rules/strain'
import { hasLuck } from '../gear/hooks'
import {
  TIERS,
  successChance,
  tierFaces,
  tierOdds,
  type FaceRange,
  type RollMode,
  type Tier,
} from '../rules/checks'
import { encounterSettlementName } from '../town/reputation'
import {
  conditionHolds,
  describeCondition,
  describeEffect,
  openingEffects,
  prepareEffects,
} from './effects'
import { defaultXp, isHighStakes, setbackCamaraderie, tierOutcome } from './outcomes'
import { livingMembers } from '../town/camaraderie'
import { POSITION_MODE, currentOptions, optionAvailable, unmetRequirements } from './run'
import { fillText } from './slots'
import { crisisActNumber } from '../crisis/status'
import { crisisFailsDuring, tooLateChip } from '../crisis/progress'
import {
  NO_TALLY,
  asRound,
  challengeOdds,
  challengeOf,
  marksChip,
  marksOf,
  playsRound,
  roundChoices,
  type Tally,
} from './challenge'

/**
 * What effect chips name: the settlement a reputation effect changes, and the Crisis's current act.
 * `failsAct` tells which Crisis act a branch's effects run out the time of (crisisFailsDuring).
 */
type ChipContext = {
  place?: string
  act: number | null
  failsAct: (effects: readonly Effect[]) => number | null
}

/** `next` is "escalates" for a twist branch that goes on to the twist's escalation stage. */
export type BranchPreview = {
  text: string
  /** Effect chips, including the roll's default XP ("+65 XP") when it has one. */
  effects: string[]
  next: 'end' | 'stay' | 'stage' | 'escalates'
  /** The XP each living member gains: the default for the roll, or the branch's own `xp` effects. */
  xp: number
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
  /** The XP each living member gains on a success (the success outcome's `xp`). */
  xp: number
  /**
   * The actor's `lucky` hook is unspent today: a natural 1 will be rerolled once, and `odds`,
   * `successChance` and `highStakes` include the reroll.
   */
  lucky: boolean
  /** The d20 faces for each tier, with the effective modifier (actor's plus situational). */
  faces: Record<Tier, FaceRange | null>
  /** Everyone able to act, best first, for the actor picker. `strain` is their stacks for this skill. */
  actors: { id: string; name: string; modifier: number; strain: number }[]
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
function effectChips(
  effects: readonly Effect[],
  encounter: EncounterState,
  actorName: string,
  ctx: ChipContext
) {
  return effects.flatMap((effect): string[] => {
    const chips =
      effect.effect === 'openingHit' && twistKindKnown(encounter)
        ? openingEffects(encounter).flatMap(
            (e) => describeEffect(e, actorName, ctx.place, ctx.act) ?? []
          )
        : [describeEffect(effect, actorName, ctx.place, ctx.act) ?? []].flat()
    if (!effect.if || conditionHolds(effect.if, encounter)) return chips
    return chips.map((chip) => `${chip} (${describeCondition(effect.if!)})`)
  })
}

/**
 * `xpFor` gives a check branch's default XP (defaultXp: none when the branch has its own `xp`
 * effect); fixed options have none. `setback` is the choice's camaraderie cost at this tier
 * (setbackCamaraderie), shown as a chip as `chooseOption` applies it.
 */
function branchPreview(
  branch: OutcomeBranch,
  encounter: EncounterState,
  values: Record<string, string>,
  actorName: string,
  ctx: ChipContext,
  xpFor: (branch: OutcomeBranch) => number,
  setback: number
): BranchPreview {
  const fallback = xpFor(branch)
  const own = branch.effects
    .filter((e) => e.effect === 'xp' && (!e.if || conditionHolds(e.if, encounter)))
    .reduce((sum, e) => sum + (e.effect === 'xp' ? e.amount : 0), 0)
  const failed = ctx.failsAct(prepareEffects(branch.effects, encounter))
  const chips = [
    ...effectChips(branch.effects, encounter, actorName, ctx),
    ...(fallback > 0 ? [describeEffect({ effect: 'xp', amount: fallback }, actorName)!] : []),
    ...(setback < 0
      ? [describeEffect({ effect: 'camaraderie', amount: setback }, actorName)!]
      : []),
    ...(failed !== null ? [tooLateChip(failed)] : []),
  ]
  return {
    text: fillText(branch.text, values),
    effects: chips,
    xp: fallback + own,
    next:
      failed !== null
        ? 'end'
        : branch.goto === TWIST_STAGE
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
  actorName: string,
  ctx: ChipContext,
  xpFor: (branch: OutcomeBranch) => number = () => 0,
  setback = 0
): ShownOutcome {
  return {
    ...branchPreview(outcome, encounter, values, actorName, ctx, xpFor, setback),
    tier,
    hidden: false,
    twist: outcome.twist
      ? branchPreview(outcome.twist, encounter, values, actorName, ctx, xpFor, setback)
      : null,
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
  const ctx: ChipContext = {
    place: encounterSettlementName(state),
    act: crisisActNumber(state),
    failsAct: (effects) => crisisFailsDuring(state, effects),
  }
  const members = livingMembers(state).length
  const challenge = challengeOf(encounter)
  return currentOptions(encounter).map((option) => {
    const setbackAt = (tier: Tier | null) =>
      setbackCamaraderie(members, encounter.situation, option, tier)
    // A challenge round stays on the stage, pays no XP of its own, and shows what it marks.
    const round = challenge !== null && playsRound(option)
    const play = (outcome: Outcome) => (round ? asRound(outcome) : outcome)
    const marked = (shown: ShownOutcome, outcome: Outcome, tier: Tier | null): ShownOutcome =>
      round ? { ...shown, effects: [marksChip(marksOf(outcome, tier)), ...shown.effects] } : shown
    const unmet = unmetRequirements(state, option.requires)
    const base = {
      id: option.id,
      label: fillText(option.label, encounter.slots),
      description: option.description && fillText(option.description, encounter.slots),
      kind: option.kind,
    }
    if (option.kind === 'fixed') {
      const outcomes = [
        marked(
          outcomePreview(
            play(option.outcome),
            null,
            encounter,
            encounter.slots,
            'someone',
            ctx,
            undefined,
            setbackAt(null)
          ),
          option.outcome,
          null
        ),
      ]
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
    const lucky = hasLuck(state, preview.actorId)
    const odds = tierOdds(effective, preview.dc, mode, lucky)
    const actors = rankActors(state.party, skill, ability).map((r) => ({
      id: r.characterId,
      name: nameOf(r.characterId),
      modifier: r.modifier,
      strain: strainOf(
        state.party.find((c) => c.id === r.characterId)!,
        skill
      ),
    }))
    const xpFor = (tier: Tier) => (branch: OutcomeBranch) =>
      round ? 0 : defaultXp(encounter.situation, branch, preview.dc, tier)
    const success = outcomePreview(
      play(tierOutcome(option, 'success')),
      'success',
      encounter,
      values,
      preview.actorName,
      ctx,
      xpFor('success')
    )
    const check: OptionCheckPreview = {
      ...preview,
      odds,
      label: checkLabel(skill, ability),
      mode,
      situationalModifier,
      situationalReason: encounter.nextCheckReason,
      lucky,
      successChance: successChance(odds),
      highStakes: isHighStakes(option, odds),
      xp: success.xp,
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
        : marked(
            outcomePreview(
              play(tierOutcome(option, tier)),
              tier,
              encounter,
              values,
              preview.actorName,
              ctx,
              xpFor(tier),
              setbackAt(tier)
            ),
            tierOutcome(option, tier),
            tier
          )
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

/**
 * A skill challenge as the player sees it (Plan 6 S): the tally, what wins and loses it, and the
 * chance of winning if the best option is picked every round (challengeOdds: exact over the tally
 * and footing, at the best actors' odds now; strain and wounds to come aren't foreseen, so it is
 * shown as "≈"). `ifChosen` is that chance with each option picked now; `best` the highest.
 */
export type ChallengePreview = {
  tally: Tally
  need: Tally
  chance: number
  best: string | null
  ifChosen: Record<string, number>
}

/** Null when the encounter isn't on a challenge stage (or has ended). */
export function challengePreview(state: GameState): ChallengePreview | null {
  const encounter = state.encounter
  const challenge = encounter && challengeOf(encounter)
  if (!encounter || !challenge || encounter.stage === null) return null
  const available = currentOptions(encounter).filter((o) => optionAvailable(state, o))
  const choices = roundChoices(state, available, encounter.stage)
  const tally = encounter.tally ?? NO_TALLY
  const { chance, ifChosen } = challengeOdds(choices, challenge, {
    tally,
    position: encounter.position,
    modifier: encounter.nextCheckModifier,
    used: encounter.used,
  })
  const ranked = Object.entries(ifChosen).sort((a, b) => b[1] - a[1])
  return {
    tally,
    need: { successes: challenge.successes, failures: challenge.failures },
    chance,
    best: ranked[0]?.[0] ?? null,
    ifChosen,
  }
}
