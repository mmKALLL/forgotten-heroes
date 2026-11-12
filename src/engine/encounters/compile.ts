import { byCodeUnit, sortedEntries, type Content, type Sourced } from '../../content/build'
import {
  DC_EXPRESSION,
  TWIST_STAGE,
  type Archetype,
  type ArchetypeRef,
  type Effect,
  type Option,
  type Outcome,
  type OutcomeBranch,
  type Requirement,
  type Situation,
  type SituationTemplate,
  type Stage,
  type Twist,
  type TwistKind,
} from '../../schema/encounter'
import { normalizeDc } from '../rules/checks'

/** The DC an archetype reference gets when it doesn't name one. Matches ArchetypeRefSchema. */
export const DEFAULT_ARCHETYPE_DC = 13

/** A number stays as it is; "dc", "dc+2", "dc-1" are relative to `base`. Always a valid DC. */
export function resolveDc(dc: number | string, base: number): number {
  if (typeof dc === 'number') return normalizeDc(dc)
  const match = DC_EXPRESSION.exec(dc)
  return normalizeDc(match ? base + Number(match[1] ?? 0) : Number.NaN)
}

/** Gold scales by `reward`; a gold effect that scales to 0 (or −0) is dropped. */
const scaleEffect = (effect: Effect, reward: number): Effect[] => {
  if (effect.effect !== 'gold') return [effect]
  const amount = Math.round(effect.amount * reward)
  return amount === 0 ? [] : [{ ...effect, amount }]
}

function scaleBranch<T extends OutcomeBranch | Outcome>(branch: T, reward: number): T {
  const scaled = { ...branch, effects: branch.effects.flatMap((e) => scaleEffect(e, reward)) }
  if ('twist' in scaled && scaled.twist) scaled.twist = scaleBranch(scaled.twist, reward)
  return scaled
}

const scaleRequirements = (requires: Requirement[], reward: number): Requirement[] =>
  requires.flatMap((r) => {
    const min = Math.round(r.min * reward)
    return min > 0 ? [{ ...r, min }] : []
  })

function resolveOption(option: Option, base: number, reward: number): Option {
  const requires = scaleRequirements(option.requires, reward)
  if (option.kind === 'fixed')
    return { ...option, requires, outcome: scaleBranch(option.outcome, reward) }
  const outcomes = Object.fromEntries(
    Object.entries(option.outcomes).map(([tier, outcome]) => [
      tier,
      outcome && scaleBranch(outcome, reward),
    ])
  ) as typeof option.outcomes
  return {
    ...option,
    requires,
    check: { ...option.check, dc: resolveDc(option.check.dc, base) },
    outcomes,
  }
}

/** An archetype's options with DCs resolved against `ref.dc` and gold scaled by `ref.reward`. */
export function instantiateArchetype(archetype: Archetype, ref: ArchetypeRef): Option[] {
  return archetype.options.map((option) => resolveOption(option, ref.dc, ref.reward))
}

function compileStage(stage: Stage, content: Content): Stage {
  const { archetype: ref, ...rest } = stage
  const base = ref?.dc ?? DEFAULT_ARCHETYPE_DC
  const own = stage.options.map((option) => resolveOption(option, base, 1))
  if (!ref) return { ...rest, options: own }
  if (!Object.hasOwn(content.archetypes, ref.id)) throw new Error(`unknown archetype "${ref.id}"`)
  return { ...rest, options: [...instantiateArchetype(content.archetypes[ref.id], ref), ...own] }
}

/**
 * The playable form of a situation: archetypes expanded, every DC a number, provenance stripped.
 * This snapshot is what an encounter stores in GameState.
 */
export function compileSituation(situation: Situation, content: Content): Situation {
  const {
    source: _source,
    file: _file,
    ...plain
  } = situation as Partial<Sourced<Situation>> & Situation
  const stages = Object.fromEntries(
    Object.entries(situation.stages).map(([id, stage]) => [id, compileStage(stage, content)])
  )
  return { ...plain, stages }
}

/** A twist kind's stages join a situation under this prefix: its "start" becomes "twist-start". */
export const TWIST_STAGE_PREFIX = 'twist-'

/** The twist kinds a table twist can draw: weight above 0, limited to `kinds` if given, by id. */
export const twistKindsFor = (content: Content, twist: Twist): TwistKind[] =>
  sortedEntries(content.twists).filter(
    (k) => k.weight > 0 && (twist.kinds === undefined || twist.kinds.includes(k.id))
  )

/** A twist kind's stages, compiled and renamed with TWIST_STAGE_PREFIX (gotos too). */
function twistStages(kind: TwistKind, content: Content): Record<string, Stage> {
  const rename = (id: string | undefined) =>
    id === undefined || id === TWIST_STAGE ? id : TWIST_STAGE_PREFIX + id
  const renameBranch = <T extends OutcomeBranch | Outcome>(branch: T): T => {
    const renamed = { ...branch, goto: rename(branch.goto) }
    if (renamed.goto === undefined) delete renamed.goto
    if ('twist' in renamed && renamed.twist) renamed.twist = renameBranch(renamed.twist)
    return renamed
  }
  const renameOption = (option: Option): Option =>
    option.kind === 'fixed'
      ? { ...option, outcome: renameBranch(option.outcome) }
      : {
          ...option,
          outcomes: Object.fromEntries(
            Object.entries(option.outcomes).map(([tier, o]) => [tier, o && renameBranch(o)])
          ) as typeof option.outcomes,
        }
  return Object.fromEntries(
    Object.entries(kind.stages).map(([id, stage]) => {
      const compiled = compileStage(stage, content)
      return [rename(id)!, { ...compiled, options: compiled.options.map(renameOption) }]
    })
  )
}

/**
 * A compiled situation with a twist kind from the table joined in: the kind's stages (prefixed),
 * its slots (the situation's own win a clash), and the twist's escalation stage and opening hit,
 * so "@twist" and openingHit work the same as for a bespoke twist.
 */
export function attachTwistKind(
  situation: Situation,
  kind: TwistKind,
  content: Content
): Situation {
  if (!situation.twist) return situation
  return {
    ...situation,
    slots: { ...kind.slots, ...situation.slots },
    stages: { ...situation.stages, ...twistStages(kind, content) },
    twist: { ...situation.twist, stage: TWIST_STAGE_PREFIX + kind.start, opening: kind.opening },
  }
}

export function templateToSituation(template: SituationTemplate): Situation {
  const { text, archetype, ...fields } = template
  return {
    ...fields,
    wonder: false,
    followUpOnly: false,
    site: false,
    start: 'start',
    stages: { start: { text, archetype, options: [] } },
  }
}

/**
 * Every situation the deck can play: hand-written situations plus compiled templates, by id.
 * Ids should be unique across both (contentIssues reports a clash); if one clashes anyway, the
 * hand-written situation comes first, so it is the one that plays.
 */
export function allSituations(content: Content): Sourced<Situation>[] {
  const templates = Object.values(content.situationTemplates).map((t) => ({
    ...templateToSituation(t),
    source: t.source,
    file: t.file,
  }))
  return [...Object.values(content.situations), ...templates].sort((a, b) => byCodeUnit(a.id, b.id))
}
