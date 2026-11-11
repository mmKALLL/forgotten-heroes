import { byCodeUnit, type Content, type Sourced } from '../../content/build'
import {
  DC_EXPRESSION,
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
  if (option.kind === 'fixed') return { ...option, requires, outcome: scaleBranch(option.outcome, reward) }
  const outcomes = Object.fromEntries(
    Object.entries(option.outcomes).map(([tier, outcome]) => [tier, outcome && scaleBranch(outcome, reward)])
  ) as typeof option.outcomes
  return { ...option, requires, check: { ...option.check, dc: resolveDc(option.check.dc, base) }, outcomes }
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
  const { source: _source, file: _file, ...plain } = situation as Partial<Sourced<Situation>> & Situation
  const stages = Object.fromEntries(
    Object.entries(situation.stages).map(([id, stage]) => [id, compileStage(stage, content)])
  )
  return { ...plain, stages }
}

export function templateToSituation(template: SituationTemplate): Situation {
  const { text, archetype, ...fields } = template
  return {
    ...fields,
    wonder: false,
    followUpOnly: false,
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
