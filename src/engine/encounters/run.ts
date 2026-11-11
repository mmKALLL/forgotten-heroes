import type { Content } from '../../content/build'
import type { Source } from '../../schema/common'
import type { Position } from '../../schema/constants'
import type { Effect, Option, OutcomeBranch, Requirement } from '../../schema/encounter'
import type { EncounterLogEntry, EncounterState, GameState, RollRecord } from '../../schema/state'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { withRng } from '../rng'
import { checkLabel } from '../rules/abilities'
import { canAct, chooseActor } from '../rules/character'
import { TIER_LABELS, normalizeDc, rollCheck, tierOdds, type RollMode } from '../rules/checks'
import { allSituations, compileSituation } from './compile'
import { applyEffects, describeEffect } from './effects'
import { branchFor, isHighStakes, tierOutcome } from './outcomes'
import { fillText, rollSlots } from './slots'

export type EncounterAction =
  | { type: 'startEncounter'; situationId: string }
  | { type: 'drawEncounter'; sources?: Source[] }
  | { type: 'chooseOption'; optionId: string; actorId?: string }
  | { type: 'closeEncounter' }

/** Edge and Exposed apply to the next check only (design §3). */
export const POSITION_MODE: Record<Position, RollMode> = {
  normal: 'normal',
  edge: 'advantage',
  exposed: 'disadvantage',
}

/** Skill uses older than this many days are dropped; Strain (Plan 3) looks back at most a week. */
export const SKILL_USE_DAYS = 7

/** True while an encounter is open and not yet over. */
export const inProgress = (state: GameState): boolean => state.encounter != null && state.encounter.stage !== null

const BUSY = 'Finish the current encounter first.'

/** Every encounter that starts moves each queued follow-up one encounter closer. */
const advanceFollowUps = (state: GameState): GameState => ({
  ...state,
  followUps: state.followUps.map((f) => ({ ...f, wait: Math.max(0, f.wait - 1) })),
})

export function startEncounter(state: GameState, content: Content, situationId: string): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const found = allSituations(content).find((s) => s.id === situationId)
  if (!found) return appendLog(state, `Unknown encounter "${situationId}".`, 'bad')
  const compiled = compileSituation(found, content)
  if (!Object.hasOwn(compiled.stages, compiled.start)) {
    return appendLog(state, `${compiled.title} has no stage "${compiled.start}".`, 'bad')
  }
  const [{ slots, twist }, rng] = withRng(state.rng, (d) => ({
    slots: rollSlots(d, content, compiled.slots),
    twist: compiled.twist ? d.float() < compiled.twist.chance : false,
  }))
  // The title and the twist are filled once, here; other text is filled as it is shown.
  const situation = {
    ...compiled,
    title: fillText(compiled.title, slots),
    ...(compiled.twist && { twist: { ...compiled.twist, what: fillText(compiled.twist.what, slots) } }),
  }
  const text = fillText(situation.stages[situation.start].text, slots)
  const encounter: EncounterState = {
    situation,
    source: found.source,
    stage: situation.start,
    position: 'normal',
    slots,
    twist,
    twistRevealed: false,
    nextCheckModifier: 0,
    used: [],
    log: [{ text, tone: 'info' }],
  }
  return appendLog(advanceFollowUps({ ...state, rng, encounter }), `${situation.title}. ${text}`, 'info')
}

/**
 * A due follow-up (wait 0) comes first, whatever the source filter; one whose situation no longer
 * exists is dropped. Otherwise a weighted random pick, never a followUpOnly situation. Either way
 * the encounter that starts moves the other queued follow-ups one closer (see startEncounter).
 */
export function drawEncounter(state: GameState, content: Content, sources?: readonly Source[]): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const situations = allSituations(content)
  const known = new Set(situations.map((s) => s.id))
  const followUps = state.followUps.filter((f) => f.wait > 0 || known.has(f.situationId))
  const due = followUps.findIndex((f) => f.wait === 0)
  if (due >= 0) {
    const rest = followUps.filter((_, i) => i !== due)
    return startEncounter({ ...state, followUps: rest }, content, followUps[due].situationId)
  }
  const candidates = situations.filter(
    (s) => !s.followUpOnly && s.weight > 0 && (!sources || sources.includes(s.source))
  )
  if (candidates.length === 0) return appendLog(state, 'No encounters match that filter.', 'bad')
  const [picked, rng] = withRng(state.rng, (d) => d.weighted(candidates, (s) => s.weight))
  return startEncounter({ ...state, rng, followUps }, content, picked.id)
}

export const closeEncounter = (state: GameState): GameState => ({ ...state, encounter: null })

/** Human-readable reasons an option can't be chosen, e.g. "needs 15 gp". Empty when available. */
export function unmetRequirements(state: GameState, requires: readonly Requirement[]): string[] {
  return requires.flatMap((r) => (state.gold >= r.min ? [] : [`needs ${r.min} gp`]))
}

/** The current stage's options that can still be chosen (used `once` options are gone). */
export function currentOptions(encounter: EncounterState): Option[] {
  const stageId = encounter.stage
  if (stageId === null || !Object.hasOwn(encounter.situation.stages, stageId)) return []
  return encounter.situation.stages[stageId].options.filter((o) => !(o.once && encounter.used.includes(`${stageId}/${o.id}`)))
}

const nameOf = (state: GameState, id: string | undefined) => state.party.find((c) => c.id === id)?.name

function resolve(
  state: GameState,
  branch: OutcomeBranch,
  actorId: string | undefined,
  entry: Pick<EncounterLogEntry, 'tone' | 'roll' | 'highStakes'>
): GameState {
  const encounter = state.encounter!
  const fromStage = encounter.stage!
  const actorName = nameOf(state, actorId)
  const values = actorName ? { ...encounter.slots, actor: actorName } : encounter.slots
  const fill = (text: string) => fillText(text, values)
  const effects: Effect[] = branch.effects.map((e) => (e.effect === 'log' ? { ...e, text: fill(e.text) } : e))
  const chips = effects.flatMap((e) => describeEffect(e, actorName ?? 'someone') ?? [])
  const text = fill(branch.text) + (chips.length > 0 ? ` (${chips.join(', ')})` : '')

  // The outcome text comes before any log effects it triggers.
  let next = appendLog(state, text, entry.tone)
  next = { ...next, encounter: { ...encounter, log: [...encounter.log, { ...entry, text }] } }
  next = applyEffects(next, effects, { actorId })

  const target = branch.goto ?? (branch.stay ? fromStage : null)
  const stage = target !== null && Object.hasOwn(encounter.situation.stages, target) ? target : null
  let log = next.encounter!.log
  if (stage !== null && stage !== fromStage) {
    log = [...log, { text: fill(encounter.situation.stages[stage].text), tone: 'info' }]
  }
  if (!next.party.some(canAct)) {
    next = appendLog(next, 'No one is left standing.', 'bad')
    return { ...next, encounter: { ...next.encounter!, stage: null, log } }
  }
  return { ...next, encounter: { ...next.encounter!, stage, log } }
}

export function chooseOption(state: GameState, optionId: string, actorId?: string): GameState {
  const encounter = state.encounter
  if (!encounter || encounter.stage === null) return state
  const option = currentOptions(encounter).find((o) => o.id === optionId)
  if (!option) return state
  const unmet = unmetRequirements(state, option.requires)
  if (unmet.length > 0) {
    return appendLog(state, `${fillText(option.label, encounter.slots)}: ${unmet.join(', ')}.`, 'bad')
  }

  const used = option.once ? [...encounter.used, `${encounter.stage}/${option.id}`] : encounter.used
  if (option.kind === 'fixed') {
    const marked = { ...state, encounter: { ...encounter, used } }
    return resolve(marked, branchFor(option.outcome, encounter.twist), undefined, { tone: 'info' })
  }

  const { skill, ability, combat } = option.check
  const actor = chooseActor(state.party, skill, actorId, ability)
  if (!actor) return appendLog(state, 'No one is able to act.', 'bad')
  const dc = normalizeDc(Number(option.check.dc))
  const mode = POSITION_MODE[encounter.position]
  const modifier = actor.modifier + encounter.nextCheckModifier
  const [roll, rng] = rollCheck(state.rng, modifier, dc, mode)
  const record: RollRecord = { ...roll, stat: skill, ability, actorId: actor.characterId }
  const inspired = roll.tier === 'critSuccess' && !combat
  const highStakes = isHighStakes(option, tierOdds(modifier, dc, mode))
  const name = nameOf(state, actor.characterId) ?? '?'
  const rollText =
    `${name} rolls ${checkLabel(skill, ability)}: ${roll.kept} ${formatModifier(roll.modifier)} = ` +
    `${roll.total} vs DC ${dc}. ${TIER_LABELS[roll.tier]}.` +
    (inspired ? ' Inspiration gained!' : '')
  const skillUses = [
    ...state.skillUses.filter((u) => u.day > state.day - SKILL_USE_DAYS),
    { day: state.day, characterId: actor.characterId, skill },
  ]
  const rolled = appendLog(
    {
      ...state,
      rng,
      lastRoll: record,
      skillUses,
      inspiration: state.inspiration + (inspired ? 1 : 0),
      // Edge, Exposed and any next-check modifier are spent by this roll; the outcome may set new ones.
      encounter: { ...encounter, position: 'normal', nextCheckModifier: 0, used },
    },
    rollText,
    TIER_TONE[roll.tier]
  )
  const branch = branchFor(tierOutcome(option, roll.tier), encounter.twist)
  return resolve(rolled, branch, actor.characterId, { tone: TIER_TONE[roll.tier], roll: record, highStakes })
}

export function stepEncounter(state: GameState, action: EncounterAction, content: Content): GameState {
  switch (action.type) {
    case 'startEncounter':
      return startEncounter(state, content, action.situationId)
    case 'drawEncounter':
      return drawEncounter(state, content, action.sources)
    case 'chooseOption':
      return chooseOption(state, action.optionId, action.actorId)
    case 'closeEncounter':
      return closeEncounter(state)
  }
}
