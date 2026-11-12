import type { Content } from '../../content/build'
import type { Source } from '../../schema/common'
import type { Biome, LogTone, Pace, Position } from '../../schema/types'
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
import { useSkill } from '../rules/strain'
import { hasLuck, spendLuck } from '../gear/hooks'
import { encounterSettlementName, unmetStanding } from '../town/reputation'
import { ambushPositionForPace, paceHostileAvoidance } from '../travel/pace'
import { evadePursuit } from '../travel/pursuit'
import { anyUndiscovered, domainAt } from '../world/pois'
import { crisisHidden } from '../crisis/sites'
import { crisisActNumber } from '../crisis/status'
import { crisisFailsDuring, tooLateChip, tooLateLine } from '../crisis/progress'
import { omenFactor } from '../crisis/clues'
import { boonReadyIn, siteStatus } from '../world/sites'
import { dangerLevel, harden } from '../world/danger'
import { allSituations, attachTwistKind, compileSituation, twistKindsFor } from './compile'
import { applyEffects, describeEffect, prepareEffects } from './effects'
import { branchFor, defaultXp, isHighStakes, tierOutcome } from './outcomes'
import { fillText, rollSlots } from './slots'
import { wealthWeight } from '../economy/wealth'
import { POWER_DC, TWIST_PLACE_WEIGHT } from '../constants'

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
/** Logged when a stealthy party steers clear of a hostile encounter. */
export const WIDE_BERTH = 'You spot trouble ahead and give it a wide berth.'

/**
 * Where the party is when an encounter is drawn on the road: the terrain, the land (a `regions`
 * id) and the domain (a settlement id), and, on a journey, how it is moving (a stealthy or
 * stealthy party avoids some hostile encounters).
 */
export type Place = {
  biome: Biome
  land: string
  domain: string
  pace?: Pace
  /** The journey forages: a stealthy party then meets ambushes with no Edge. */
  forage?: boolean
  /**
   * On a journey, the chance each encounter drawn is hostile (hostileShare's `drawn`, before the
   * pace's avoidance, which drawEncounter applies); without it, every
   * fitting situation is drawn by weight alone.
   */
  hostileShare?: number
  /** Visible wealth steps (economy/wealth.ts): thieves and tolls weigh more when drawn. */
  wealthSteps?: number
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

/** What a site's power adds to every check's DC there (POWER_DC a level); 0 away from one. */
function sitePowerDc(state: GameState, poi: string | undefined): number {
  if (!poi || !Object.hasOwn(state.world.pois, poi)) return 0
  const power = siteStatus(state.world.seed, poi, state.world.pois[poi], state.day)?.power ?? 0
  return power * POWER_DC
}

/**
 * How a situation starts beyond its place: more DC on every check (a late Crisis act), a starting
 * position (the Edge, from knowing the villain's weakness), and lines for its log saying why.
 */
export type StartOptions = {
  dcBonus?: number
  position?: Position
  lines?: { text: string; tone: LogTone }[]
}

/**
 * Starts a situation. On the road, `place` weights the twist table towards kinds that fit the
 * place, and on a journey a hostile encounter meets the party on the footing its pace gives
 * (ambushPositionForPace). The encounter happens in the place's domain (or, without a place,
 * where the party is), and at `poi` when visiting one. The snapshot is hardened once, here, by the
 * day's danger and the site's power (world/danger.ts harden), so the previews and rolls agree and a
 * save loaded later doesn't change an open encounter.
 */
export function startEncounter(
  state: GameState,
  content: Content,
  situationId: string,
  place?: Place,
  poi?: string,
  options: StartOptions = {}
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
  const danger = dangerLevel(state.day)
  const powerDc = sitePowerDc(state, poi)
  const dcBonus = powerDc + (options.dcBonus ?? 0)
  const joined = harden(kind ? attachTwistKind(compiled, kind, content) : compiled, {
    dcBonus,
    danger,
  })
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
      options.position ??
      (place?.pace && situation.disposition === 'hostile'
        ? ambushPositionForPace(place.pace, 'normal', place.forage ?? false)
        : 'normal'),
    slots,
    twist,
    twistRevealed: false,
    twistKind: kind && { id: kind.id, what: fillText(kind.what, slots) },
    twistKindRevealed: false,
    nextCheckModifier: 0,
    nextCheckReason: null,
    poi: poi ?? null,
    domain: place?.domain ?? domainAt(state.world, state.location),
    danger,
    used: [],
    log: [
      { text, tone: 'info' },
      ...(powerDc > 0
        ? [
            {
              text: `It has grown stronger since it was taken: every check here is DC +${powerDc}.`,
              tone: 'bad' as const,
            },
          ]
        : []),
      ...(options.lines ?? []),
    ],
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
 * when none fits, nothing happens. On a journey, `place.hostileShare` first decides whether the
 * encounter is hostile, then the pick is among fitting situations of that kind (any fitting one
 * if none of that kind fits). A stealthy party then skips a hostile pick with chance
 * PACE_HOSTILE_AVOIDANCE, and nothing happens but a line in the journal. Whatever encounter
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
      (!place || fitsPlace(s, place)) &&
      omenFactor(state, content, s, place) > 0
  )
  if (candidates.length === 0) {
    return place ? state : appendLog(state, 'No encounters match that filter.', 'bad')
  }
  const avoidance = place?.pace ? paceHostileAvoidance(place.pace) : 0
  const share = place?.hostileShare
  const [{ picked, avoided }, rng] = withRng(state.rng, (d) => {
    // On a journey, first whether it is hostile, then a fitting situation of that kind (or any
    // fitting one, if none of that kind fits here).
    let pool = candidates
    if (share !== undefined) {
      const hostile = d.float() < share
      const kind = candidates.filter((s) => (s.disposition === 'hostile') === hostile)
      if (kind.length > 0) pool = kind
    }
    const steps = place?.wealthSteps ?? 0
    // An omen weighs more on a road in the current Crisis act's land (crisis/clues.ts).
    const picked = d.weighted(
      pool,
      (s) => wealthWeight(s.weight, s.tags, steps) * omenFactor(state, content, s, place)
    )
    const avoided = picked.disposition === 'hostile' && avoidance > 0 && d.float() < avoidance
    return { picked, avoided }
  })
  if (avoided) return appendLog({ ...state, rng, followUps }, WIDE_BERTH, 'info')
  return startEncounter({ ...state, rng, followUps }, content, picked.id, place)
}

export const closeEncounter = (state: GameState): GameState => ({ ...state, encounter: null })

/**
 * Human-readable reasons an option can't be chosen, e.g. "needs 15 gp" or "everyone already
 * knows Insight". Empty when available.
 */
export function unmetRequirements(state: GameState, requires: readonly Requirement[]): string[] {
  return requires.flatMap((r) => {
    switch (r.req) {
      case 'gold':
        return state.gold >= r.min ? [] : [`needs ${r.min} gp`]
      case 'untrained':
        return state.party.some((c) => !c.skillProficiencies.includes(r.skill))
          ? []
          : [`everyone already knows ${statLabel(r.skill)}`]
      case 'undiscovered': {
        const domain = state.encounter?.domain ?? domainAt(state.world, state.location)
        if (anyUndiscovered(state.world, domain, r, crisisHidden(state))) return []
        const what = r.category ? `no ${r.category}` : 'nothing'
        return [`${what} left to learn of ${r.scope === 'land' ? 'in this land' : 'around here'}`]
      }
      case 'siteReady': {
        // Away from a site (e.g. played from the deck) there is no boon to spend.
        const poi = siteOf(state)
        const days = poi ? boonReadyIn(poi, state.day) : 0
        return days === 0
          ? []
          : [`the blessing here is spent; it returns in ${days === 1 ? '1 day' : `${days} days`}`]
      }
      case 'goods':
        return (state.goods[r.good] ?? 0) >= r.min ? [] : [`needs ${r.min} ${r.good}`]
      case 'standing':
        return unmetStanding(state, r.min) ?? []
    }
  })
}

/** The POI the open encounter is played at, if any. */
const siteOf = (state: GameState) => {
  const id = state.encounter?.poi
  return id && Object.hasOwn(state.world.pois, id) ? state.world.pois[id] : undefined
}

/** Choosing a siteReady option spends the site's boon: it returns BOON_COOLDOWN_DAYS later. */
function spendBoon(state: GameState, option: Option): GameState {
  const id = state.encounter?.poi
  if (!id || !option.requires.some((r) => r.req === 'siteReady')) return state
  const poi = siteOf(state)
  if (!poi) return state
  const pois = { ...state.world.pois, [id]: { ...poi, boonDay: state.day } }
  return { ...state, world: { ...state.world, pois } }
}

/**
 * The `used` key of a `once` option on a stage: its own id, or its group's (`once: "name"`), so
 * choosing any option of a group uses up all of them.
 */
const onceKey = (stageId: string, option: Pick<Option, 'id' | 'once'>): string =>
  typeof option.once === 'string' ? `${stageId}/@${option.once}` : `${stageId}/${option.id}`

/** The current stage's options that can still be chosen (used `once` options are gone). */
export function currentOptions(encounter: EncounterState): Option[] {
  const stageId = encounter.stage
  if (stageId === null || !Object.hasOwn(encounter.situation.stages, stageId)) return []
  return encounter.situation.stages[stageId].options.filter(
    (o) => !(o.once && encounter.used.includes(onceKey(stageId, o)))
  )
}

const nameOf = (state: GameState, id: string | undefined) =>
  state.party.find((c) => c.id === id)?.name

function resolve(
  state: GameState,
  branch: OutcomeBranch,
  actorId: string | undefined,
  entry: Pick<EncounterLogEntry, 'tone' | 'roll' | 'highStakes'>,
  content?: Content,
  /** The roll's default XP (defaultXp), granted as an `xp` effect so it shows as a chip. */
  xp = 0
): GameState {
  const encounter = state.encounter!
  const fromStage = encounter.stage!
  const actorName = nameOf(state, actorId)
  const values = actorName ? { ...encounter.slots, actor: actorName } : encounter.slots
  const fill = (text: string) => fillText(text, values)
  const effects: Effect[] = [
    ...prepareEffects(branch.effects, encounter).map((e) =>
      e.effect === 'log' ? { ...e, text: fill(e.text) } : e
    ),
    ...(xp > 0 ? [{ effect: 'xp' as const, amount: xp }] : []),
  ]
  const place = encounterSettlementName(state)
  const act = crisisActNumber(state)
  // Days spent here may run past the Crisis act's last day: the visit then ends (crisis/progress).
  const failed = crisisFailsDuring(state, effects)
  const chips = [
    ...effects.flatMap((e) => describeEffect(e, actorName ?? 'someone', place, act) ?? []),
    ...(failed !== null ? [tooLateChip(failed)] : []),
  ]
  const text = fill(branch.text) + (chips.length > 0 ? ` (${chips.join(', ')})` : '')

  // The outcome text comes before any log effects it triggers.
  let next = appendLog(state, text, entry.tone)
  next = { ...next, encounter: { ...encounter, log: [...encounter.log, { ...entry, text }] } }
  next = applyEffects(next, effects, { actorId, content })

  // "@twist" goes to the twist's escalation stage; once there, which twist it was is no secret.
  const escalates = branch.goto === TWIST_STAGE
  const goto = escalates ? encounter.situation.twist?.stage : branch.goto
  const target = goto ?? (branch.stay ? fromStage : null)
  const stage =
    failed === null && target !== null && Object.hasOwn(encounter.situation.stages, target)
      ? target
      : null
  if (escalates) next = { ...next, encounter: { ...next.encounter!, twistKindRevealed: true } }
  let log = next.encounter!.log
  if (failed !== null) {
    const line = tooLateLine(state.crisis!, content, failed)
    next = appendLog(next, line, 'bad')
    log = [...log, { text: line, tone: 'bad' }]
  }
  if (stage !== null && stage !== fromStage) {
    log = [...log, { text: fill(encounter.situation.stages[stage].text), tone: 'info' }]
  }
  if (!next.party.some(canAct)) {
    next = appendLog(next, 'No one is left standing.', 'bad')
    return { ...next, encounter: { ...next.encounter!, stage: null, log } }
  }
  return { ...next, encounter: { ...next.encounter!, stage, log } }
}

/** `content` lets clues (discoverPoi) find their sites; without it they find nothing. */
export function chooseOption(
  state: GameState,
  optionId: string,
  actorId?: string,
  content?: Content
): GameState {
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

  const used = option.once ? [...encounter.used, onceKey(encounter.stage, option)] : encounter.used
  if (option.kind === 'fixed') {
    const marked = spendBoon({ ...state, encounter: { ...encounter, used } }, option)
    return resolve(
      marked,
      branchFor(option.outcome, encounter.twist),
      undefined,
      { tone: 'info' },
      content
    )
  }

  const { skill, ability, combat } = option.check
  const actor = chooseActor(state.party, skill, actorId, ability)
  if (!actor) return appendLog(state, 'No one is able to act.', 'bad')
  const dc = normalizeDc(Number(option.check.dc))
  const mode = POSITION_MODE[encounter.position]
  const modifier = actor.modifier + encounter.nextCheckModifier
  // A `lucky` hook rerolls a natural 1 once a day (gear/hooks.ts); the preview's odds include it.
  const lucky = hasLuck(state, actor.characterId)
  const [roll, rng, rerolled] = rollCheck(state.rng, modifier, dc, mode, lucky)
  const record: RollRecord = { ...roll, stat: skill, ability, actorId: actor.characterId }
  const inspired = roll.tier === 'critSuccess' && !combat
  const highStakes = isHighStakes(option, tierOdds(modifier, dc, mode, lucky))
  const name = nameOf(state, actor.characterId) ?? '?'
  const charm = state.party.find((c) => c.id === actor.characterId)?.accessory?.name ?? 'charm'
  const luckText = rerolled ? `A natural 1, but ${name}'s ${charm} turns the luck. ` : ''
  const rollText =
    luckText +
    `${name} rolls ${checkLabel(skill, ability)}: ${roll.kept} ${formatModifier(roll.modifier)} = ` +
    `${roll.total} vs DC ${dc}. ${TIER_LABELS[roll.tier]}.` +
    (inspired ? ' Inspiration gained!' : '')
  // The new stack applies from the next check on; this roll used the old modifier.
  const { party, skillUses, strained } = useSkill(state, actor.characterId, skill)
  let rolled = appendLog(
    {
      ...spendBoon(rerolled ? spendLuck(state, actor.characterId) : state, option),
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
  return resolve(
    rolled,
    branch,
    actor.characterId,
    { tone: TIER_TONE[roll.tier], roll: record, highStakes },
    content,
    defaultXp(encounter.situation, branch, dc, roll.tier)
  )
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
      return chooseOption(state, action.optionId, action.actorId, content)
    case 'closeEncounter':
      return closeEncounter(state)
  }
}
