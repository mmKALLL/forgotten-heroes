import type { Content } from '../../content/build'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import type { CrisisActPhase } from '../../schema/types'
import { appendLog } from '../log'
import { actCalendar } from './calendar'
import { actNumeral, crisisText, shortName, siteWhere, villainOf } from './text'
import { CRISIS_SITE_CLUES, CRISIS_WEAKNESS_CLUES } from '../constants'

// Where the Crisis stands (Plans 5b and 6, design §10b). Nothing ticks: each act's phase and the
// outcome are derived from the day and what the party did (the day it won each act's lead, clues,
// the days it thwarted each act). The journal's calendar lines come from a pass after each step.

/**
 * The Crisis as a whole: waiting while the current act is dormant (before it opens), then the
 * current act's investigation or prevention; won or lost once decided.
 */
export type CrisisPhase = 'waiting' | 'investigation' | 'prevention' | 'won' | 'lost'

export type CrisisStatus = {
  phase: CrisisPhase
  /** Each act's phase. */
  phases: CrisisActPhase[]
  /**
   * The current act (0–2): the first one not thwarted. For a lost Crisis, the act that failed;
   * null once won.
   */
  act: number | null
  /** The current act's open and due days, the days left until it is due (0 on it), and the day it fails. */
  opens: number | null
  due: number | null
  daysLeft: number | null
  failsOn: number | null
  /** Where the current act is played: its lead site in investigation, its key site in prevention. */
  target: string | null
  /** Clues to the current act, and whether they reveal the villain's weakness at its key site. */
  clues: number
  weakness: boolean
  /** The day the Crisis was won (the last act thwarted) or lost (the act failed); else null. */
  endedDay: number | null
}

/** The plan is known once act I's lead has been won. */
export const planKnown = (crisis: Pick<CrisisState, 'leads'>): boolean => crisis.leads[0] !== null

/**
 * Each act's phase on `day`: thwarted once thwarted; failed from the day after its due day (and
 * every later act stays dormant); dormant before it opens; then investigation until its lead is
 * won, and prevention after.
 */
export function actPhases(crisis: CrisisState, day: number): CrisisActPhase[] {
  let lost = false
  return crisis.acts.map((_, i): CrisisActPhase => {
    if (crisis.thwarted[i] !== null) return 'thwarted'
    if (lost) return 'dormant'
    const calendar = actCalendar(crisis, i)
    if (day >= calendar.failsOn) {
      lost = true
      return 'failed'
    }
    if (day < calendar.opens) return 'dormant'
    return crisis.leads[i] !== null ? 'prevention' : 'investigation'
  })
}

/**
 * The Crisis on a day, fully derived. The current act is the first one not thwarted; it is lost
 * from the day after its due day, even if the plan was never learned (the clock runs from the
 * start). It is won when all three are thwarted.
 */
export function crisisStatus(crisis: CrisisState, day: number): CrisisStatus {
  const phases = actPhases(crisis, day)
  const act = crisis.thwarted.findIndex((d) => d === null)
  if (act < 0) {
    return {
      phase: 'won',
      phases,
      act: null,
      opens: null,
      due: null,
      daysLeft: null,
      failsOn: null,
      target: null,
      clues: 0,
      weakness: false,
      endedDay: Math.max(...crisis.thwarted.map((d) => d ?? 0)),
    }
  }
  const { opens, due, failsOn } = actCalendar(crisis, act)
  const own = phases[act]
  // The current act is never thwarted: it is the first one that isn't.
  const phase: CrisisPhase =
    own === 'failed' ? 'lost' : own === 'investigation' || own === 'prevention' ? own : 'waiting'
  const clues = crisis.clues[act] ?? 0
  return {
    phase,
    phases,
    act,
    opens,
    due,
    daysLeft: Math.max(0, due - day),
    failsOn,
    target:
      phase === 'investigation'
        ? crisis.acts[act].lead
        : phase === 'prevention'
          ? crisis.acts[act].key
          : null,
    clues,
    weakness: clues >= CRISIS_WEAKNESS_CLUES,
    endedDay: phase === 'lost' ? failsOn : null,
  }
}

/** True once the Crisis is won or lost (or there is none to decide). */
export const crisisDecided = (crisis: CrisisState | null, day: number): boolean =>
  crisis === null || ['won', 'lost'].includes(crisisStatus(crisis, day).phase)

/** True while an act is open (its investigation or prevention under way). */
export const actOpen = (phase: CrisisPhase): phase is 'investigation' | 'prevention' =>
  phase === 'investigation' || phase === 'prevention'

/** "Act I, The Opened Graves" (or "Act I" when the content no longer has the villain). */
export function actTitle(content: Content, crisis: CrisisState, i: number): string {
  const name = villainOf(content, crisis)?.acts[i]?.name
  return name ? `Act ${actNumeral(i)}, ${name}` : `Act ${actNumeral(i)}`
}

type News = { day: number; act: number; kind: 'open' | 'hurry' | 'due' | 'fail' }

/** How an act that fails before the plan was learned is told (the journal and the end screen). */
export const UNLEARNED_FAILED = 'Far away, something you never learned of is finished.'
/** Act I's open and hurry lines before the plan is known, when its villain has none of its own. */
export const UNLEARNED_OPEN =
  'Word of trouble is abroad: something is stirring, and it will not wait. Ask in the towns.'
export const UNLEARNED_HURRY = 'Whatever stirs out there will soon be done. There is little time.'

/** The Crisis as it stood on `day`: what the party did after it (leads won, thwarts) undone. */
const crisisAsOf = (crisis: CrisisState, day: number): CrisisState => {
  const by = (d: number | null) => (d !== null && d <= day ? d : null)
  return { ...crisis, leads: crisis.leads.map(by), thwarted: crisis.thwarted.map(by) }
}

/**
 * The Crisis's calendar lines for the days after `before.day` up to `after.day`, each once, in day
 * order, for the act current as that day begins: its opening, its hurry note, its due day (once
 * the plan is known) and, on failing, its `failed` text (or, before the plan was known, a line
 * about something far away) and "The Crisis is lost." An act thwarted or a Crisis decided by then
 * has no news.
 */
export function crisisNews(before: GameState, after: GameState, content: Content): GameState {
  const crisis = after.crisis
  if (!crisis || after.day <= before.day) return after
  const news: News[] = crisis.acts
    .flatMap((_, act): News[] => {
      const days = actCalendar(crisis, act)
      return [
        { day: days.opens, act, kind: 'open' },
        { day: days.hurry, act, kind: 'hurry' },
        { day: days.due, act, kind: 'due' },
        { day: days.failsOn, act, kind: 'fail' },
      ]
    })
    .filter((n) => n.day > before.day && n.day <= after.day)
    .filter((n) => {
      // The act must still be the current one, undecided, as the day begins: a step that spans
      // several days may thwart the act (or win its lead) only after this day's news.
      const then = crisisAsOf(crisis, n.day - 1)
      const status = crisisStatus(then, n.day - 1)
      if (status.act !== n.act || status.phase === 'won' || status.phase === 'lost') return false
      return n.kind !== 'due' || planKnown(then)
    })
    .sort((a, b) => a.day - b.day || a.act - b.act)
  const villain = villainOf(content, crisis)
  return news.reduce((state, n) => {
    const title = actTitle(content, crisis, n.act)
    const known = planKnown(crisisAsOf(crisis, n.day - 1))
    const act = villain?.acts[n.act]
    const own = (text: string | undefined) =>
      text && crisisText(state, content, crisis, text, crisis.acts[n.act].lead)
    switch (n.kind) {
      case 'open':
        return appendLog(
          state,
          own(act?.open) ||
            (known
              ? `${title}, has begun: ${shortName(crisis.name)} is at work again.`
              : UNLEARNED_OPEN),
          'bad'
        )
      case 'hurry': {
        const left = actCalendar(crisis, n.act).due - n.day
        return appendLog(
          state,
          own(act?.hurry) || (known ? `${title}, is due in ${left}d: hurry.` : UNLEARNED_HURRY),
          'bad'
        )
      }
      case 'due':
        return appendLog(state, `${title}, is due today: this is the last day to stop it.`, 'bad')
      case 'fail': {
        const failed = act?.failed
        const text =
          known && failed
            ? crisisText(state, content, crisis, failed, crisis.acts[n.act].key)
            : UNLEARNED_FAILED
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
  phase: CrisisActPhase
  current: boolean
  /** The site to go to once found (its name), else its land's name once known; null when unknown. */
  where: string | null
  /** That site's POI id once discovered (for the map and the roads); null before. */
  poi: string | null
  opens: number
  due: number
  daysLeft: number
  failsOn: number
  clues: number
  /** Clues that reveal the lead site (CRISIS_SITE_CLUES); the weakness takes CRISIS_WEAKNESS_CLUES. */
  needs: number
  weaknessAt: number
  weakness: boolean
  thwartedDay: number | null
  failed: boolean
  /** The current act is past its hurry day (the journal's note). */
  pressing: boolean
}

/** A Crisis site the party has found, for the map and the site panel. */
export type CrisisSiteInfo = {
  poi: string
  /** An act's lead site (act I's is where the plan is learned) or its key site. */
  kind: 'lead' | 'key'
  /** The act's number (1–3). */
  act: number
  /** Nothing happens here now: a refused visit (crisis/progress.ts visit rules). */
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
  /** Act I's lead site, while the plan is unknown and the site is known: "{site} may hold answers". */
  reveal: { poi: string; name: string } | null
  /** The three acts once the plan is learned; empty before. */
  acts: CrisisActInfo[]
  /** The current act's index (0–2) while it is open. */
  current: number | null
  /**
   * How the Crisis ended: the day, and the villain's victory text or the failed act's text (or,
   * lost before the plan was learned, UNLEARNED_FAILED).
   */
  ended: { outcome: 'won' | 'lost'; day: number; text: string } | null
  /** The end screen is due: ended, and not yet dismissed with "Keep playing". */
  showEnd: boolean
  /** The Crisis sites the party has found. */
  sites: CrisisSiteInfo[]
}

/** True while something can happen at a Crisis site: the current act's lead, then its key site. */
export const crisisSiteActive = (crisis: CrisisState, poi: string, day: number): boolean =>
  crisisStatus(crisis, day).target === poi

/** The current act's number (1–3) while it is open, for effect chips. */
export function crisisActNumber(state: Pick<GameState, 'crisis' | 'day'>): number | null {
  if (!state.crisis) return null
  const status = crisisStatus(state.crisis, state.day)
  return actOpen(status.phase) ? status.act! + 1 : null
}

/** The Crisis panel's view model, or null without a Crisis (or when the content lost its villain). */
export function crisisInfo(state: GameState, content: Content): CrisisInfo | null {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  if (!crisis || !villain) return null
  const status = crisisStatus(crisis, state.day)
  const learned = planKnown(crisis)
  const pois = state.world.pois
  const found = (id: string) => Object.hasOwn(pois, id) && pois[id].discovered
  const open = actOpen(status.phase)
  const acts = learned
    ? crisis.acts.map((_, i): CrisisActInfo => {
        const current = open && status.act === i
        const days = actCalendar(crisis, i)
        const clues = crisis.clues[i] ?? 0
        const target = current ? status.target! : null
        const where =
          target === null
            ? null
            : found(target)
              ? pois[target].name
              : clues >= 1
                ? siteWhere(state, content, target).land
                : null
        return {
          n: i + 1,
          numeral: actNumeral(i),
          name: villain.acts[i]?.name ?? '',
          goal: villain.acts[i]?.goal ?? '',
          phase: status.phases[i],
          current,
          where,
          poi: target !== null && found(target) ? target : null,
          opens: days.opens,
          due: days.due,
          daysLeft: Math.max(0, days.due - state.day),
          failsOn: days.failsOn,
          clues,
          needs: CRISIS_SITE_CLUES,
          weaknessAt: CRISIS_WEAKNESS_CLUES,
          weakness: clues >= CRISIS_WEAKNESS_CLUES,
          thwartedDay: crisis.thwarted[i] ?? null,
          failed: status.phases[i] === 'failed',
          pressing: current && state.day >= days.hurry,
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
  const failedAt = ended?.outcome === 'lost' ? crisis.acts[status.act!].key : crisis.acts[0].lead

  const sites = crisis.acts
    .flatMap((a, i): CrisisSiteInfo[] =>
      (['lead', 'key'] as const).map((kind) => {
        const poi = kind === 'lead' ? a.lead : a.key
        return {
          poi,
          kind,
          act: i + 1,
          quiet: !crisisSiteActive(crisis, poi, state.day),
          thwarted: crisis.thwarted[i] !== null,
        }
      })
    )
    .filter((s) => found(s.poi))
  const lead = crisis.acts[0].lead
  return {
    phase: status.phase,
    name: learned ? crisis.name : null,
    short: learned ? shortName(crisis.name) : null,
    summary: learned ? crisisText(state, content, crisis, villain.summary, lead) : null,
    reveal: !learned && !ended && found(lead) ? { poi: lead, name: pois[lead].name } : null,
    acts,
    current: open ? status.act : null,
    // Lost before the plan was learned: nothing of the villain or its sites is told.
    ended: ended && {
      ...ended,
      text: learned ? crisisText(state, content, crisis, ended.text, failedAt) : UNLEARNED_FAILED,
    },
    showEnd: ended !== null && !crisis.endSeen,
    sites,
  }
}

/** A road's arrival against the current act's due day, for the road preview. */
export type CrisisDeadline = {
  /** The act's number (1–3). */
  act: number
  due: number
  failsOn: number
  /** Arriving on or before the due day. */
  inTime: boolean
  /** Arriving after the due day: the act has failed by then. */
  tooLate: boolean
}

/** For a road preview: arriving at `to` on `arrivalDay`, when `to` is where the current act is played. */
export function crisisDeadlines(
  state: Pick<GameState, 'crisis' | 'day'>,
  _content: Content,
  arrivalDay: number,
  to: string
): CrisisDeadline | null {
  const crisis = state.crisis
  if (!crisis) return null
  const status = crisisStatus(crisis, state.day)
  if (status.target !== to || status.act === null) return null
  return {
    act: status.act + 1,
    due: status.due!,
    failsOn: status.failsOn!,
    inTime: arrivalDay <= status.due!,
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
