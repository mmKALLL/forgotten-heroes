import type { Content } from '../../content/build'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { note, revealPois, xpNote } from '../encounters/effects'
import type { StartOptions } from '../encounters/run'
import { crisisSiteActive, crisisStatus } from './status'
import { actNumeral, crisisText, shortName, villainOf } from './text'
import { CRISIS_SITE_CLUES, CRISIS_WEAKNESS_CLUES, XP_THWART } from '../constants'

// What the party does about the Crisis (Plan 5b E3, design §10b): learning the plan at the reveal
// site, following clues to each act's site, and thwarting the act there. Only what the party did
// is stored (the day the plan was learned, clues per act, the day each act was thwarted).

const withCrisis = (state: GameState, crisis: CrisisState): GameState => ({ ...state, crisis })

/** The act's `clue` line, with its land: logged when the act's land becomes known. */
function clueLine(state: GameState, content: Content, crisis: CrisisState, i: number): GameState {
  const clue = villainOf(content, crisis)?.acts[i]?.clue
  if (!clue) return state
  return note(state, crisisText(state, content, crisis, clue, crisis.acts[i].poi), 'info')
}

/** Act i's land becomes known: its first clue (if it has none yet) and its clue line. */
function firstClue(state: GameState, content: Content, i: number): GameState {
  const crisis = state.crisis!
  const clues = crisis.clues.map((c, j) => (j === i ? Math.max(1, c) : c))
  return clueLine(withCrisis(state, { ...crisis, clues }), content, crisis, i)
}

/**
 * The party learns the villain's plan, once, in the reveal situation (played at the reveal site):
 * the plan is logged in full, and act I's land becomes known (its first clue). Elsewhere, or once
 * learned or decided, nothing happens.
 */
export function learnPlan(state: GameState, content: Content): GameState {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  if (!crisis || !villain || crisis.learned !== null) return state
  if (state.encounter?.poi !== crisis.reveal) return state
  if (crisisStatus(crisis, state.day).phase !== 'unknown') return state
  const learned = note(
    withCrisis(state, { ...crisis, learned: state.day }),
    crisisText(state, content, crisis, villain.plan),
    'crit'
  )
  return firstClue(learned, content, 0)
}

/**
 * A clue to the Crisis (`amount` 1–2):
 * - before the plan is known, it points to the reveal site (which is revealed);
 * - during an act, it adds to that act's clues, up to CRISIS_WEAKNESS_CLUES. At CRISIS_SITE_CLUES
 *   the act's site is revealed; at CRISIS_WEAKNESS_CLUES the villain's weakness there is known;
 * - once the Crisis is decided, nothing.
 */
export function crisisClue(state: GameState, content: Content, amount = 1): GameState {
  const crisis = state.crisis
  if (!crisis || !villainOf(content, crisis)) return state
  const status = crisisStatus(crisis, state.day)
  const pois = state.world.pois
  if (status.phase === 'unknown') {
    const site = crisis.reveal
    if (!Object.hasOwn(pois, site)) return state
    if (pois[site].discovered) {
      return note(state, `It all points to ${pois[site].name}, which you already know of.`, 'info')
    }
    return revealPois(
      note(state, 'Something stirs, and you learn where to look.', 'info'),
      content,
      [site]
    )
  }
  if (status.phase !== 'act') return state
  const i = status.act!
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
  const site = crisis.acts[i].poi
  if (before < CRISIS_SITE_CLUES && after >= CRISIS_SITE_CLUES && !pois[site]?.discovered) {
    next = revealPois(next, content, [site])
  }
  if (before < CRISIS_WEAKNESS_CLUES && after >= CRISIS_WEAKNESS_CLUES) {
    next = note(
      next,
      `You know ${shortName(crisis.name)}'s weakness at ${pois[site]?.name ?? site}: ` +
        'you will go in with the Edge.',
      'crit'
    )
  }
  return next
}

/**
 * Thwarts the current act, only in a situation played at its site: the day is kept, XP_THWART ×
 * the act's number is paid, its `thwarted` text logged, and the next act's land becomes known.
 * After act III the villain's `victory` is logged: the Crisis is won.
 */
export function thwartAct(state: GameState, content: Content): GameState {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  if (!crisis || !villain) return state
  const status = crisisStatus(crisis, state.day)
  const i = status.act
  if (status.phase !== 'act' || i === null || state.encounter?.poi !== crisis.acts[i].poi) {
    return state
  }
  const thwarted = crisis.thwarted.map((d, j) => (j === i ? state.day : d))
  const site = crisis.acts[i].poi
  let next = withCrisis(state, { ...crisis, thwarted })
  next = note(next, crisisText(next, content, crisis, villain.acts[i].thwarted, site), 'crit')
  next = xpNote(next, XP_THWART * (i + 1), `Act ${actNumeral(i)} thwarted`)
  if (i + 1 < crisis.acts.length) return firstClue(next, content, i + 1)
  return note(next, crisisText(next, content, crisis, villain.victory, site), 'crit')
}

/**
 * Why a Crisis site can't be visited now, or null (also for any other POI): the reveal site once
 * the plan is learned, a thwarted act's site, a future act's site, and every site once the Crisis
 * is decided all lie quiet.
 */
export function crisisRefusal(state: GameState, poiId: string): string | null {
  const crisis = state.crisis
  if (!crisis) return null
  const index = [crisis.reveal, ...crisis.acts.map((a) => a.poi)].indexOf(poiId)
  if (index < 0 || crisisSiteActive(crisis, poiId, state.day)) return null
  const name = state.world.pois[poiId]?.name ?? poiId
  // Site names often start with "the".
  const Name = name.charAt(0).toUpperCase() + name.slice(1)
  const status = crisisStatus(crisis, state.day)
  if (status.phase === 'won' || status.phase === 'lost') return `${Name} lies quiet now.`
  if (index === 0) return `${Name} has told you all it can.`
  if (crisis.thwarted[index - 1] !== null) return `The plot at ${name} is broken.`
  return `Nothing stirs at ${name} yet.`
}

/**
 * How a visit to the current act's site starts: harder by the act's lateness (+1 DC per
 * CRISIS_LATE_STEP_DAYS late, on top of the day's danger), and with the Edge once the villain's
 * weakness is known. Empty for any other site.
 */
export function crisisVisit(state: GameState, poiId: string): StartOptions {
  const crisis = state.crisis
  if (!crisis) return {}
  const status = crisisStatus(crisis, state.day)
  if (status.phase !== 'act' || crisis.acts[status.act!].poi !== poiId) return {}
  const lines: NonNullable<StartOptions['lines']> = []
  if (status.lateDc > 0) {
    lines.push({
      text: `You are ${status.late}d late: every check here is DC +${status.lateDc}.`,
      tone: 'bad',
    })
  }
  if (status.weakness) {
    lines.push({
      text: `You know ${shortName(crisis.name)}'s weakness: you go in with the Edge.`,
      tone: 'good',
    })
  }
  return {
    ...(status.lateDc > 0 && { dcBonus: status.lateDc }),
    ...(status.weakness && { position: 'edge' as const }),
    ...(lines.length > 0 && { lines }),
  }
}
