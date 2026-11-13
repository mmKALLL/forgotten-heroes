import type { Content } from '../../content/build'
import type { CrisisState } from '../../schema/crisis'
import type { Effect } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { note, revealPois, xpNote } from '../encounters/effects'
import type { StartOptions } from '../encounters/run'
import { capitalFirst } from '../format'
import { canAct } from '../rules/character'
import { crLevel, levelGap } from '../rules/challenge'
import { actOpen, actTitle, crisisStatus } from './status'
import { actNumeral, crisisText, shortName, villainOf } from './text'
import { CRISIS_SITE_CLUES, CRISIS_WEAKNESS_CLUES, XP_THWART } from '../constants'

// What the party does about the Crisis (Plans 5b and 6, design §10b): in each act, following
// clues to its lead site and winning it (at act I's, the plan is learned), which finds the key
// site, then thwarting the act there. Only what the party did is stored (the day each lead was
// won, clues per act, the day each act was thwarted).

const withCrisis = (state: GameState, crisis: CrisisState): GameState => ({ ...state, crisis })

/** The act's `clue` line, with its lead's land: logged when that land becomes known. */
function clueLine(state: GameState, content: Content, crisis: CrisisState, i: number): GameState {
  const clue = villainOf(content, crisis)?.acts[i]?.clue
  if (!clue) return state
  return note(state, crisisText(state, content, crisis, clue, crisis.acts[i].lead), 'info')
}

/** Act i's land becomes known: its first clue (if it has none yet) and its clue line. */
function firstClue(state: GameState, content: Content, i: number): GameState {
  const crisis = state.crisis!
  const clues = crisis.clues.map((c, j) => (j === i ? Math.max(1, c) : c))
  return clueLine(withCrisis(state, { ...crisis, clues }), content, crisis, i)
}

/**
 * The current act's lead is won (`learnPlan` or `revealKeySite`, in a situation played at its lead
 * site during its investigation): the day is kept, at act I the plan is logged in full, the act's
 * clues rise to at least CRISIS_SITE_CLUES (what the lead told), and its key site is revealed.
 * Elsewhere, or in any other phase, nothing happens.
 */
export function revealKeySite(state: GameState, content: Content): GameState {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  if (!crisis || !villain) return state
  const status = crisisStatus(crisis, state.day)
  const i = status.act
  if (status.phase !== 'investigation' || i === null) return state
  if (state.encounter?.poi !== crisis.acts[i].lead) return state
  const leads = crisis.leads.map((d, j) => (j === i ? state.day : d))
  const clues = crisis.clues.map((c, j) => (j === i ? Math.max(CRISIS_SITE_CLUES, c) : c))
  let next = withCrisis(state, { ...crisis, leads, clues })
  if (i === 0) next = note(next, crisisText(state, content, crisis, villain.plan), 'crit')
  const key = crisis.acts[i].key
  const name = state.world.pois[key]?.name ?? key
  next = note(next, `${actTitle(content, crisis, i)}, will be played out at ${name}.`, 'good')
  return revealPois(next, content, [key])
}

/** `learnPlan`: act I's wording of revealKeySite (at a later act's lead it does the same). */
export const learnPlan = revealKeySite

/**
 * A clue to the Crisis (`amount` 1–2), for the open act:
 * - in act I's investigation before the plan is known, it points to the lead site (revealed);
 * - otherwise it adds to the act's clues, up to CRISIS_WEAKNESS_CLUES. At CRISIS_SITE_CLUES the
 *   lead site is revealed (during the investigation); at CRISIS_WEAKNESS_CLUES the villain's
 *   weakness at the key site is known;
 * - while no act is open, or once the Crisis is decided, a line and nothing else.
 */
export function crisisClue(state: GameState, content: Content, amount = 1): GameState {
  const crisis = state.crisis
  if (!crisis || !villainOf(content, crisis)) return state
  const status = crisisStatus(crisis, state.day)
  const pois = state.world.pois
  if (status.phase === 'waiting') {
    return note(state, 'Something is stirring, but it is too early to tell where.', 'info')
  }
  if (!actOpen(status.phase)) return state
  const i = status.act!
  const lead = crisis.acts[i].lead
  if (i === 0 && crisis.leads[0] === null && !pois[lead]?.discovered) {
    if (!Object.hasOwn(pois, lead)) return state
    return revealPois(
      note(state, 'Something stirs, and you learn where to look.', 'info'),
      content,
      [lead]
    )
  }
  const before = crisis.clues[i] ?? 0
  const after = Math.min(CRISIS_WEAKNESS_CLUES, before + amount)
  const act = villainOf(content, crisis)!.acts[i]
  if (after === before) {
    return note(state, `You learn nothing new of Act ${actNumeral(i)}, ${act.name}.`, 'info')
  }
  const clues = crisis.clues.map((c, j) => (j === i ? after : c))
  let next = note(
    withCrisis(state, { ...crisis, clues }),
    `A clue to Act ${actNumeral(i)}, ${act.name}: ${after} of ${CRISIS_WEAKNESS_CLUES}.`,
    'good'
  )
  if (
    status.phase === 'investigation' &&
    before < CRISIS_SITE_CLUES &&
    after >= CRISIS_SITE_CLUES &&
    !pois[lead]?.discovered
  ) {
    next = revealPois(next, content, [lead])
  }
  if (before < CRISIS_WEAKNESS_CLUES && after >= CRISIS_WEAKNESS_CLUES) {
    next = note(
      next,
      `You know ${shortName(crisis.name)}'s weakness in Act ${actNumeral(i)}: ` +
        'you will strike at its key site with the Edge.',
      'crit'
    )
  }
  return next
}

/**
 * Thwarts the current act, only in a situation played at its key site during its prevention: the
 * day is kept, XP_THWART × the act's number is paid, its `thwarted` text logged, and the next act's
 * land becomes known. After act III the villain's `victory` is logged: the Crisis is won.
 */
export function thwartAct(state: GameState, content: Content): GameState {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  if (!crisis || !villain) return state
  const status = crisisStatus(crisis, state.day)
  const i = status.act
  if (status.phase !== 'prevention' || i === null || state.encounter?.poi !== crisis.acts[i].key) {
    return state
  }
  const thwarted = crisis.thwarted.map((d, j) => (j === i ? state.day : d))
  const site = crisis.acts[i].key
  let next = withCrisis(state, { ...crisis, thwarted })
  next = note(next, crisisText(next, content, crisis, villain.acts[i].thwarted, site), 'crit')
  next = xpNote(next, XP_THWART * (i + 1), `Act ${actNumeral(i)} thwarted`)
  if (i + 1 < crisis.acts.length) return firstClue(next, content, i + 1)
  return note(next, crisisText(next, content, crisis, villain.victory, site), 'crit')
}

/**
 * The act (0–2) being played at the site the party is visiting (its lead or key site), when these
 * effects (prepared: conditions settled) pass days up to the act's failsOn before any thwartAct
 * among them: the act fails during the visit. Null otherwise (never on a road, or at any other
 * site). The preview and the outcome both ask this, so a choice that comes too late says so
 * before it is made.
 */
export function crisisFailsDuring(
  state: Pick<GameState, 'crisis' | 'day' | 'encounter'>,
  effects: readonly Effect[]
): number | null {
  const crisis = state.crisis
  const poi = state.encounter?.poi
  if (!crisis || !poi) return null
  const status = crisisStatus(crisis, state.day)
  const i = status.act
  if (!actOpen(status.phase) || i === null || status.target !== poi) return null
  let day = state.day
  for (const effect of effects) {
    if (effect.effect === 'thwartAct') return null
    if (effect.effect === 'days') day += effect.amount
    if (day >= status.failsOn!) return i
  }
  return null
}

/** The chip on an outcome that runs past the act's last day (crisisFailsDuring). */
export const tooLateChip = (i: number): string => `too late: Act ${actNumeral(i)} fails`

/** The journal line when act `i` fails during a visit to its site, which then ends. */
export function tooLateLine(crisis: CrisisState, content: Content | undefined, i: number): string {
  const name = content && villainOf(content, crisis)?.acts[i]?.name
  const title = name ? `Act ${actNumeral(i)}, ${name}` : `Act ${actNumeral(i)}`
  return `Too late: ${title}, has failed. There is nothing left to stop here.`
}

/**
 * Why a Crisis site can't be visited now, or null (also for any other POI). Only the current act's
 * lead (in its investigation) and then its key site (in its prevention) can be visited: a lead
 * already won, a thwarted act's sites, a dormant act's sites and every site once the Crisis is
 * decided all lie quiet.
 */
export function crisisRefusal(state: GameState, poiId: string): string | null {
  const crisis = state.crisis
  if (!crisis) return null
  const i = crisis.acts.findIndex((a) => a.lead === poiId || a.key === poiId)
  if (i < 0) return null
  const status = crisisStatus(crisis, state.day)
  if (status.target === poiId) return null
  const name = state.world.pois[poiId]?.name ?? poiId
  const Name = capitalFirst(name)
  if (status.phase === 'won' || status.phase === 'lost') return `${Name} lies quiet now.`
  if (crisis.thwarted[i] !== null) return `The plot at ${name} is broken.`
  if (crisis.acts[i].lead === poiId && crisis.leads[i] !== null) {
    return `${Name} has told you all it can.`
  }
  return `Nothing stirs at ${name} yet.`
}

/** The best level among the members who can act (1 with none). */
const partyLevel = (state: GameState): number =>
  Math.max(1, ...state.party.filter(canAct).map((c) => c.level))

/**
 * How a visit to the current act's site starts: at the act's challenge rating (`leadCr` at its
 * lead, `keyCr` at its key site), which sets its DCs in place of the danger ramp, and at the key
 * site with the Edge once the villain's weakness is known. Empty for any other site.
 */
export function crisisVisit(state: GameState, content: Content, poiId: string): StartOptions {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  if (!crisis || !villain) return {}
  const status = crisisStatus(crisis, state.day)
  if (status.target !== poiId || status.act === null) return {}
  const act = villain.acts[status.act]
  const key = status.phase === 'prevention'
  const cr = key ? act.keyCr : act.leadCr
  const meant = crLevel(cr)
  const gap = levelGap(partyLevel(state), meant)
  const lines: NonNullable<StartOptions['lines']> = [
    gap === 'beyond'
      ? {
          text: `A challenge of CR ${cr}, meant for level ${meant}: this is beyond you.`,
          tone: 'bad',
        }
      : gap === 'stretch'
        ? { text: `A challenge of CR ${cr}, meant for level ${meant}: a stretch.`, tone: 'crit' }
        : { text: `A challenge of CR ${cr}, meant for level ${meant}.`, tone: 'info' },
  ]
  const weakness = key && status.weakness
  if (weakness) {
    lines.push({
      text: `You know ${shortName(crisis.name)}'s weakness: you go in with the Edge.`,
      tone: 'good',
    })
  }
  // The key's finale offers a Fight against the act's boss beside its challenge (Plan 7).
  const fights = key && act.climax ? { kind: 'climax' as const, cr, climax: act.climax } : undefined
  return { cr, ...(weakness && { position: 'edge' as const }), ...(fights && { fights }), lines }
}
