import type { Content } from '../../content/build'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { appendLog } from '../log'
import { actNumeral, crisisText, shortName, siteWhere, villainOf } from './text'
import {
  CRISIS_LATE_STEP_DAYS,
  CRISIS_LEEWAY_DAYS,
  CRISIS_SITE_CLUES,
  CRISIS_WARN_DAYS,
  CRISIS_WEAKNESS_CLUES,
} from '../constants'

// Where the Crisis stands (Plan 5b E2, design §10b). Nothing ticks: the phase, lateness and failure
// are derived from the day and what the party did (the day it learned the plan, clues, the days it
// thwarted each act). The journal's deadline lines come from a pass after each step.

export type CrisisPhase = 'unknown' | 'act' | 'won' | 'lost'

export type CrisisStatus = {
  /** Unknown until the plan is learned, then act; won or lost once decided. */
  phase: CrisisPhase
  /**
   * The current act (0–2): the first one not thwarted. For a lost Crisis, the act that failed;
   * null once won.
   */
  act: number | null
  /** The current act's due day, and the days left until it (0 on and after it). */
  due: number | null
  daysLeft: number | null
  /** Days past the due day (0 before it), and what that adds to every DC at the act's site. */
  late: number
  lateDc: number
  /** The first day the current act has failed (due + CRISIS_LEEWAY_DAYS + 1). */
  failsOn: number | null
  /** Clues to the current act, and whether they reveal the villain's weakness there. */
  clues: number
  weakness: boolean
  /** The day the Crisis was won (the last act thwarted) or lost (the act failed); else null. */
  endedDay: number | null
}

/** The first day an act due on `due` has failed: it may still be thwarted up to the day before. */
export const actFailsOn = (due: number): number => due + CRISIS_LEEWAY_DAYS + 1

/** What lateness adds to every DC at the act's site: +1 for 1–10 days late, +2 for 11–20, … */
export const lateDcFor = (late: number): number =>
  late <= 0 ? 0 : Math.ceil(late / CRISIS_LATE_STEP_DAYS)

/**
 * The Crisis on a day, fully derived. The current act is the first one not thwarted; it is lost
 * once `day` is past its due day + CRISIS_LEEWAY_DAYS, even if the plan was never learned (the
 * clock runs from the start). It is won when all three are thwarted.
 */
export function crisisStatus(crisis: CrisisState, day: number): CrisisStatus {
  const act = crisis.thwarted.findIndex((d) => d === null)
  if (act < 0) {
    return {
      phase: 'won',
      act: null,
      due: null,
      daysLeft: null,
      late: 0,
      lateDc: 0,
      failsOn: null,
      clues: 0,
      weakness: false,
      endedDay: Math.max(...crisis.thwarted.map((d) => d ?? 0)),
    }
  }
  const due = crisis.acts[act].due
  const failsOn = actFailsOn(due)
  const late = Math.max(0, day - due)
  const clues = crisis.clues[act] ?? 0
  const lost = day >= failsOn
  return {
    phase: lost ? 'lost' : crisis.learned === null ? 'unknown' : 'act',
    act,
    due,
    daysLeft: Math.max(0, due - day),
    late,
    lateDc: lateDcFor(late),
    failsOn,
    clues,
    weakness: clues >= CRISIS_WEAKNESS_CLUES,
    endedDay: lost ? failsOn : null,
  }
}

/** True once the Crisis is won or lost (or there is none to decide). */
export const crisisDecided = (crisis: CrisisState | null, day: number): boolean =>
  crisis === null || ['won', 'lost'].includes(crisisStatus(crisis, day).phase)

/** "Act I, The Opened Graves" (or "Act I" when the content no longer has the villain). */
function actTitle(content: Content, crisis: CrisisState, i: number): string {
  const name = villainOf(content, crisis)?.acts[i]?.name
  return name ? `Act ${actNumeral(i)}, ${name}` : `Act ${actNumeral(i)}`
}

type News = { day: number; act: number; kind: 'warn' | 'due' | 'fail' }

/**
 * The Crisis's deadline lines for the days after `before.day` up to `after.day`, each once, in day
 * order: a warning CRISIS_WARN_DAYS before the current act's due day and on it (once the plan is
 * known), and on failing, the act's `failed` text (or, before the plan was known, a line about
 * something far away) and "The Crisis is lost." An act thwarted or a Crisis decided by then has
 * no news.
 */
export function crisisNews(before: GameState, after: GameState, content: Content): GameState {
  const crisis = after.crisis
  if (!crisis || after.day <= before.day) return after
  const news: News[] = crisis.acts
    .flatMap((a, act): News[] => [
      { day: a.due - CRISIS_WARN_DAYS, act, kind: 'warn' },
      { day: a.due, act, kind: 'due' },
      { day: actFailsOn(a.due), act, kind: 'fail' },
    ])
    .filter((n) => n.day > before.day && n.day <= after.day)
    .filter((n) => {
      // The act must still be the current one, undecided, as the day begins.
      const status = crisisStatus(crisis, n.day - 1)
      if (status.act !== n.act || status.phase === 'won' || status.phase === 'lost') return false
      return n.kind === 'fail' || crisis.learned !== null
    })
    .sort((a, b) => a.day - b.day || a.act - b.act)
  return news.reduce((state, n) => {
    const title = actTitle(content, crisis, n.act)
    switch (n.kind) {
      case 'warn':
        return appendLog(state, `${title}, is due in ${CRISIS_WARN_DAYS}d.`, 'bad')
      case 'due':
        return appendLog(
          state,
          `${title}, is due today: each ${CRISIS_LATE_STEP_DAYS}d late from now makes it harder.`,
          'bad'
        )
      case 'fail': {
        const failed = villainOf(content, crisis)?.acts[n.act]?.failed
        const text =
          crisis.learned !== null && failed
            ? crisisText(state, content, crisis, failed, crisis.acts[n.act].poi)
            : 'Far away, something you never learned of is finished.'
        return appendLog(appendLog(state, text, 'bad'), 'The Crisis is lost.', 'bad')
      }
    }
  }, after)
}

/** One act as the Crisis panel shows it. Its place is known only while it is the current act. */
export type CrisisActInfo = {
  /** 1–3, and as the panel writes it ("II"). */
  n: number
  numeral: string
  name: string
  goal: string
  current: boolean
  /** The site's name once discovered, else its land's name once known; null when unknown. */
  where: string | null
  /** The site's POI id once discovered (for the map and the roads); null before. */
  poi: string | null
  due: number
  daysLeft: number
  late: number
  lateDc: number
  failsOn: number
  clues: number
  /** Clues that reveal the site (CRISIS_SITE_CLUES); the weakness takes CRISIS_WEAKNESS_CLUES. */
  needs: number
  weaknessAt: number
  weakness: boolean
  thwartedDay: number | null
  failed: boolean
}

/** A Crisis site the party has found, for the map and the site panel. */
export type CrisisSiteInfo = {
  poi: string
  kind: 'reveal' | 'act'
  /** The act's number (1–3) for an act site; null for the reveal site. */
  act: number | null
  /** Nothing more happens here: a refused visit (crisis/progress.ts visit rules). */
  quiet: boolean
  thwarted: boolean
}

/** The Crisis panel's view model (design §9). */
export type CrisisInfo = {
  phase: CrisisPhase
  /** The villain's rolled name ("Morvaine, the Ashen Prophet"), how texts name it, and its summary: once the plan is learned. */
  name: string | null
  short: string | null
  summary: string | null
  /** The reveal site, while the plan is unknown and the site is known: "{site} may hold answers". */
  reveal: { poi: string; name: string } | null
  /** The three acts once the plan is learned; empty before. */
  acts: CrisisActInfo[]
  /** The current act's index (0–2) while one is under way. */
  current: number | null
  /** How the Crisis ended: the day, and the villain's victory text or the failed act's text. */
  ended: { outcome: 'won' | 'lost'; day: number; text: string } | null
  /** The end screen is due: ended, and not yet dismissed with "Keep playing". */
  showEnd: boolean
  /** The Crisis sites the party has found. */
  sites: CrisisSiteInfo[]
}

/** True while something can still happen at a Crisis site: the reveal before the plan, the current act's site. */
export function crisisSiteActive(crisis: CrisisState, poi: string, day: number): boolean {
  const status = crisisStatus(crisis, day)
  if (status.phase === 'won' || status.phase === 'lost') return false
  if (poi === crisis.reveal) return crisis.learned === null
  return status.phase === 'act' && crisis.acts[status.act!].poi === poi
}

/** The current act's number (1–3) while one is under way (the plan known), for effect chips. */
export function crisisActNumber(state: Pick<GameState, 'crisis' | 'day'>): number | null {
  if (!state.crisis) return null
  const status = crisisStatus(state.crisis, state.day)
  return status.phase === 'act' ? status.act! + 1 : null
}

/** The Crisis panel's view model, or null without a Crisis (or when the content lost its villain). */
export function crisisInfo(state: GameState, content: Content): CrisisInfo | null {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  if (!crisis || !villain) return null
  const status = crisisStatus(crisis, state.day)
  const learned = crisis.learned !== null
  const pois = state.world.pois
  const found = (id: string) => Object.hasOwn(pois, id) && pois[id].discovered
  const acts = learned
    ? crisis.acts.map((a, i): CrisisActInfo => {
        const current = status.phase === 'act' && status.act === i
        const due = crisis.acts[i].due
        const late = current ? status.late : 0
        const clues = crisis.clues[i] ?? 0
        const where = !current
          ? null
          : found(a.poi)
            ? pois[a.poi].name
            : clues >= 1
              ? siteWhere(state, content, a.poi).land
              : null
        return {
          n: i + 1,
          numeral: actNumeral(i),
          name: villain.acts[i]?.name ?? '',
          goal: villain.acts[i]?.goal ?? '',
          current,
          where,
          poi: current && found(a.poi) ? a.poi : null,
          due,
          daysLeft: Math.max(0, due - state.day),
          late,
          lateDc: lateDcFor(late),
          failsOn: actFailsOn(due),
          clues,
          needs: CRISIS_SITE_CLUES,
          weaknessAt: CRISIS_WEAKNESS_CLUES,
          weakness: clues >= CRISIS_WEAKNESS_CLUES,
          thwartedDay: crisis.thwarted[i] ?? null,
          failed: status.phase === 'lost' && status.act === i,
        }
      })
    : []
  const ended =
    status.phase === 'won'
      ? { outcome: 'won' as const, day: status.endedDay!, text: villain.victory }
      : status.phase === 'lost'
        ? {
            outcome: 'lost' as const,
            day: status.endedDay!,
            text: villain.acts[status.act!]?.failed ?? '',
          }
        : null
  const failedAt = ended?.outcome === 'lost' ? crisis.acts[status.act!].poi : crisis.reveal
  const sites = [crisis.reveal, ...crisis.acts.map((a) => a.poi)]
    .map((poi, i): CrisisSiteInfo => ({
      poi,
      kind: i === 0 ? 'reveal' : 'act',
      act: i === 0 ? null : i,
      quiet: !crisisSiteActive(crisis, poi, state.day),
      thwarted: i > 0 && crisis.thwarted[i - 1] !== null,
    }))
    .filter((s) => found(s.poi))
  return {
    phase: status.phase,
    name: learned ? crisis.name : null,
    short: learned ? shortName(crisis.name) : null,
    summary: learned ? crisisText(state, content, crisis, villain.summary) : null,
    reveal:
      !learned && !ended && found(crisis.reveal)
        ? { poi: crisis.reveal, name: pois[crisis.reveal].name }
        : null,
    acts,
    current: status.phase === 'act' ? status.act : null,
    ended: ended && { ...ended, text: crisisText(state, content, crisis, ended.text, failedAt) },
    showEnd: ended !== null && !crisis.endSeen,
    sites,
  }
}

/** A road's arrival against the current act's deadline, for the road preview. */
export type CrisisDeadline = {
  /** The act's number (1–3). */
  act: number
  due: number
  failsOn: number
  /** Arriving on or before the due day. */
  inTime: boolean
  /** Days late on arrival, and what that adds to every DC there. */
  late: number
  lateDc: number
  /** Arriving on or after failsOn: the act has failed by then. */
  tooLate: boolean
}

/** For a road preview: arriving at `to` on `arrivalDay`, when `to` is the current act's site. */
export function crisisDeadlines(
  state: Pick<GameState, 'crisis' | 'day'>,
  _content: Content,
  arrivalDay: number,
  to: string
): CrisisDeadline | null {
  const crisis = state.crisis
  if (!crisis) return null
  const status = crisisStatus(crisis, state.day)
  if (status.phase !== 'act' || status.act === null || crisis.acts[status.act].poi !== to) {
    return null
  }
  const due = status.due!
  const late = Math.max(0, arrivalDay - due)
  return {
    act: status.act + 1,
    due,
    failsOn: status.failsOn!,
    inTime: arrivalDay <= due,
    late,
    lateDc: lateDcFor(late),
    tooLate: arrivalDay >= status.failsOn!,
  }
}

/**
 * "Keep playing": the won or lost screen is dismissed for good (endSeen). Nothing else changes; the
 * remaining Crisis sites lie quiet. Does nothing before the Crisis is decided.
 */
export function acknowledgeEnd(state: GameState): GameState {
  const crisis = state.crisis
  if (!crisis || crisis.endSeen || !crisisDecided(crisis, state.day)) return state
  return { ...state, crisis: { ...crisis, endSeen: true } }
}
