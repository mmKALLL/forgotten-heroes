import type { Content } from '../../content/build'
import type { Source } from '../../schema/common'
import type { Biome, Pace, Position } from '../../schema/constants'
import {
  TWIST_STAGE,
  type Effect,
  type Option,
  type OutcomeBranch,
  type Requirement,
  type Situation,
  type TwistKind,
} from '../../schema/encounter'
import type { EncounterLogEntry, EncounterState, GameState, RollRecord } from '../../schema/state'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { withRng } from '../rng'
import { checkLabel, statLabel } from '../rules/abilities'
import { canAct, chooseActor } from '../rules/character'
import { TIER_LABELS, normalizeDc, rollCheck, tierOdds, type RollMode } from '../rules/checks'
import { SKILL_USE_DAYS, useSkill } from '../rules/strain'
import { ambushPositionForPace, paceHostileAvoidance } from '../travel/pace'
import { evadePursuit } from '../travel/pursuit'
import { allSituations, attachTwistKind, compileSituation, twistKindsFor } from './compile'
import { applyEffects, describeEffect, prepareEffects } from './effects'
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

export { SKILL_USE_DAYS }

/** An option can be chosen when its requirements are met and, for a check, someone can roll it. */
export const optionAvailable = (state: GameState, option: Option): boolean =>
  unmetRequirements(state, option.requires).length === 0 &&
  (option.kind === 'fixed' || state.party.some(canAct))

/**
 * Nothing left to do but close: no encounter, an ended one, or a stage where no option can be
 * chosen (e.g. the party is down and only checks are left, or a save from older content).
 */
export const encounterOver = (state: GameState): boolean =>
  state.encounter == null ||
  state.encounter.stage === null ||
  !currentOptions(state.encounter).some((o) => optionAvailable(state, o))

/** True while an encounter is open and something can still be chosen in it. */
export const inProgress = (state: GameState): boolean => !encounterOver(state)

const BUSY = 'Finish the current encounter first.'
const UNFIT = 'No one is fit to travel on.'
/** Logged when a cautious party steers clear of a hostile encounter. */
export const WIDE_BERTH = 'You spot trouble ahead and give it a wide berth.'
/** A twist kind tagged with the land, or with the threat holding it, weighs this much more. */
export const TWIST_PLACE_WEIGHT = 2

/**
 * Where the party is when an encounter is drawn on the road: the terrain, the land (a `regions`
 * id) and the domain (a settlement id), and, on a journey, how it is moving (a cautious party
 * avoids some hostile encounters).
 */
export type Place = {
  biome: Biome
  land: string
  domain: string
  pace?: Pace
  coverTracks?: boolean
}

/**
 * Untagged situations happen anywhere on land; at sea only those tagged "sea" do. A situation's
 * `regions` tag names lands.
 */
export function fitsPlace(
  situation: Pick<Situation, 'biomes' | 'regions'>,
  place: Pick<Place, 'biome' | 'land'>
): boolean {
  const biomes = situation.biomes ?? []
  const lands = situation.regions ?? []
  const biomeFits = biomes.length === 0 ? place.biome !== 'sea' : biomes.includes(place.biome)
  return biomeFits && (lands.length === 0 || lands.includes(place.land))
}

/** The threat roaming a land in this world, or null. */
const threatIn = (state: GameState, land: string | undefined): string | null =>
  land !== undefined && Object.hasOwn(state.world.lands, land)
    ? state.world.lands[land].threat
    : null

/**
 * A twist kind's draw weight here: TWIST_PLACE_WEIGHT× when it fits the place, i.e. its tags name
 * the terrain, the land, or the threat roaming the land.
 */
export function twistKindWeight(
  kind: Pick<TwistKind, 'weight' | 'biomes' | 'regions' | 'threats'>,
  place: Pick<Place, 'biome' | 'land'> | undefined,
  threat: string | null
): number {
  const fits =
    (place !== undefined &&
      (kind.biomes.includes(place.biome) || kind.regions.includes(place.land))) ||
    (threat !== null && kind.threats.includes(threat))
  return fits ? kind.weight * TWIST_PLACE_WEIGHT : kind.weight
}

/** Every encounter that starts moves each queued follow-up one encounter closer. */
const advanceFollowUps = (state: GameState): GameState => ({
  ...state,
  followUps: state.followUps.map((f) => ({ ...f, wait: Math.max(0, f.wait - 1) })),
})

/**
 * Starts a situation. On the road, `place` weights the twist table towards kinds that fit the
 * place, and on a journey a hostile encounter meets the party on the footing its pace gives
 * (ambushPositionForPace).
 */
export function startEncounter(
  state: GameState,
  content: Content,
  situationId: string,
  place?: Place
): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  if (!state.party.some(canAct)) return appendLog(state, UNFIT, 'bad')
  const found = allSituations(content).find((s) => s.id === situationId)
  if (!found) return appendLog(state, `Unknown encounter "${situationId}".`, 'bad')
  const compiled = compileSituation(found, content)
  if (!Object.hasOwn(compiled.stages, compiled.start)) {
    return appendLog(state, `${compiled.title} has no stage "${compiled.start}".`, 'bad')
  }
  // Slots, then the hidden twist, then (for a table twist) its kind and the kind's own slots.
  const [{ slots, twist, kind }, rng] = withRng(state.rng, (d) => {
    const slots = rollSlots(d, content, compiled.slots)
    const twist = compiled.twist ? d.float() < compiled.twist.chance : false
    const kinds = compiled.twist?.table ? twistKindsFor(content, compiled.twist) : []
    if (kinds.length === 0) return { slots, twist, kind: null as TwistKind | null }
    const threat = threatIn(state, place?.land)
    const kind = d.weighted(kinds, (k) => twistKindWeight(k, place, threat))
    const own = Object.fromEntries(
      Object.entries(kind.slots).filter(([name]) => !Object.hasOwn(compiled.slots, name))
    )
    return { slots: { ...slots, ...rollSlots(d, content, own) }, twist, kind }
  })
  const joined = kind ? attachTwistKind(compiled, kind, content) : compiled
  // The title and the twist are filled once, here; other text is filled as it is shown.
  const situation = {
    ...joined,
    title: fillText(joined.title, slots),
    ...(joined.twist && {
      twist: { ...joined.twist, what: fillText(joined.twist.what, slots) },
    }),
  }
  const text = fillText(situation.stages[situation.start].text, slots)
  const encounter: EncounterState = {
    situation,
    source: found.source,
    stage: situation.start,
    position:
      place?.pace && situation.disposition === 'hostile'
        ? ambushPositionForPace(place.pace, place.coverTracks ?? false)
        : 'normal',
    slots,
    twist,
    twistRevealed: false,
    twistKind: kind && { id: kind.id, what: fillText(kind.what, slots) },
    twistKindRevealed: false,
    nextCheckModifier: 0,
    nextCheckReason: null,
    used: [],
    log: [{ text, tone: 'info' }],
  }
  return appendLog(
    advanceFollowUps({ ...state, rng, encounter }),
    `${situation.title}. ${text}`,
    'info'
  )
}

/**
 * A due follow-up (wait 0) comes first, whatever the source filter or place, except that at sea
 * it waits for land unless its situation fits the sea; one whose situation no longer exists is
 * dropped. A due pursuit may lose or outrun the party instead (evadePursuit). Otherwise a weighted random pick, never a followUpOnly or site situation.
 * On the road, `place` limits the pick to situations that fit its terrain and land (fitsPlace);
 * when none fits, nothing happens. A cautious party then skips a hostile pick with chance
 * CAUTIOUS_HOSTILE_AVOIDANCE, and nothing happens but a line in the journal. Whatever encounter
 * starts moves the other queued follow-ups one closer (see startEncounter).
 */
export function drawEncounter(
  state: GameState,
  content: Content,
  sources?: readonly Source[],
  place?: Place
): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  if (!state.party.some(canAct)) return appendLog(state, UNFIT, 'bad')
  const situations = allSituations(content)
  const known = new Set(situations.map((s) => s.id))
  const followUps = state.followUps.filter((f) => f.wait > 0 || known.has(f.situationId))
  // At sea, a due follow-up waits for land unless its situation fits the sea.
  const fitsHere = (id: string) => {
    if (place?.biome !== 'sea') return true
    const situation = situations.find((s) => s.id === id)
    return situation !== undefined && fitsPlace(situation, place)
  }
  const due = followUps.findIndex((f) => f.wait === 0 && fitsHere(f.situationId))
  if (due >= 0) {
    const rest = followUps.filter((_, i) => i !== due)
    const followUp = followUps[due]
    const pursuit = situations.find((s) => s.id === followUp.situationId)?.pursuit
    const evaded = pursuit ? evadePursuit(state, followUp, rest) : null
    return (
      evaded ?? startEncounter({ ...state, followUps: rest }, content, followUp.situationId, place)
    )
  }
  const candidates = situations.filter(
    (s) =>
      !s.followUpOnly &&
      !s.site &&
      s.weight > 0 &&
      (!sources || sources.includes(s.source)) &&
      (!place || fitsPlace(s, place))
  )
  if (candidates.length === 0) {
    return place ? state : appendLog(state, 'No encounters match that filter.', 'bad')
  }
  const avoidance = place?.pace ? paceHostileAvoidance(place.pace) : 0
  const [{ picked, avoided }, rng] = withRng(state.rng, (d) => {
    const picked = d.weighted(candidates, (s) => s.weight)
    const avoided = picked.disposition === 'hostile' && avoidance > 0 && d.float() < avoidance
    return { picked, avoided }
  })
  if (avoided) return appendLog({ ...state, rng, followUps }, WIDE_BERTH, 'info')
  return startEncounter({ ...state, rng, followUps }, content, picked.id, place)
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
  return encounter.situation.stages[stageId].options.filter(
    (o) => !(o.once && encounter.used.includes(`${stageId}/${o.id}`))
  )
}

const nameOf = (state: GameState, id: string | undefined) =>
  state.party.find((c) => c.id === id)?.name

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
  const effects: Effect[] = prepareEffects(branch.effects, encounter).map((e) =>
    e.effect === 'log' ? { ...e, text: fill(e.text) } : e
  )
  const chips = effects.flatMap((e) => describeEffect(e, actorName ?? 'someone') ?? [])
  const text = fill(branch.text) + (chips.length > 0 ? ` (${chips.join(', ')})` : '')

  // The outcome text comes before any log effects it triggers.
  let next = appendLog(state, text, entry.tone)
  next = { ...next, encounter: { ...encounter, log: [...encounter.log, { ...entry, text }] } }
  next = applyEffects(next, effects, { actorId })

  // "@twist" goes to the twist's escalation stage; once there, which twist it was is no secret.
  const escalates = branch.goto === TWIST_STAGE
  const goto = escalates ? encounter.situation.twist?.stage : branch.goto
  const target = goto ?? (branch.stay ? fromStage : null)
  const stage = target !== null && Object.hasOwn(encounter.situation.stages, target) ? target : null
  if (escalates) next = { ...next, encounter: { ...next.encounter!, twistKindRevealed: true } }
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
    return appendLog(
      state,
      `${fillText(option.label, encounter.slots)}: ${unmet.join(', ')}.`,
      'bad'
    )
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
  // The new stack applies from the next check on; this roll used the old modifier.
  const { party, skillUses, strained } = useSkill(state, actor.characterId, skill)
  let rolled = appendLog(
    {
      ...state,
      rng,
      party,
      lastRoll: record,
      skillUses,
      inspiration: state.inspiration + (inspired ? 1 : 0),
      // Edge, Exposed and any next-check modifier are spent by this roll; the outcome may set new ones.
      encounter: {
        ...encounter,
        position: 'normal',
        nextCheckModifier: 0,
        nextCheckReason: null,
        used,
      },
    },
    rollText,
    TIER_TONE[roll.tier]
  )
  if (strained > 0) {
    rolled = appendLog(
      rolled,
      `${name} is strained: ${statLabel(skill)} −${strained} until it fades.`,
      'bad'
    )
  }
  const branch = branchFor(tierOutcome(option, roll.tier), encounter.twist)
  return resolve(rolled, branch, actor.characterId, {
    tone: TIER_TONE[roll.tier],
    roll: record,
    highStakes,
  })
}

export function stepEncounter(
  state: GameState,
  action: EncounterAction,
  content: Content
): GameState {
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
