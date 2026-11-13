import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import type { CrisisActPhase } from '../../schema/types'
import { canAct } from '../rules/character'
import { crLevel } from '../rules/challenge'
import { actCalendar } from './calendar'
import { actOpen, crisisStatus, planKnown } from './status'
import { crisisSurge, crisisWait } from './surge'
import { actNumeral, shortName, siteWhere, villainOf } from './text'

// The endgame tracker's view model (Plan 6 C5, design §10b): each act's phase, its days, the next
// step, its challenge against the party's level, and the surge. Track K renders it below the
// journal, from act I's open day on.

export type TrackerAct = {
  /** 1–3, and as written ("II"). */
  n: number
  numeral: string
  /** The act's name once the plan is known; null before. */
  name: string | null
  phase: CrisisActPhase
  opens: number
  expected: number
  due: number
  /** Days until it is due (0 on the day) while it stands; null once thwarted or failed. */
  daysLeft: number | null
  /** The open act is past its hurry day (the journal's note). */
  pressing: boolean
  /**
   * What to do next, in English, for the open act: "Ask in the towns", "Find the lead in Tradal",
   * "Follow the lead at the Burned Chapel", "Strike at the Opened Barrows"; for a dormant act,
   * "Stirs from day 130". Null once thwarted or failed, and for every act once the Crisis is decided.
   */
  next: string | null
  leadCr: number
  keyCr: number
  /** The party levels the lead and key encounters are meant for (crLevel). */
  leadLevel: number
  keyLevel: number
  /** The encounter the open act points to is meant for a higher level than the party's best. */
  tooStrong: boolean
  /**
   * Who holds the key site, once the plan is known: a finale villain's lieutenant (the act's
   * `boss`), else the villain itself (its act III, or every act of a recurring villain).
   */
  foe: string | null
  /** The act's danger surge now, in percent (0 when none), and whether its data surges at all (told once the plan is known). */
  surge: number
  surges: boolean
  /**
   * The waiting penalty now, in percent (0 when none): from the act's waiting day while its lead
   * goes unfollowed, the danger rises a little each day.
   */
  wait: number
  /** The day the waiting penalty starts for this act (its day CRISIS_WAIT_DAY). */
  waitFrom: number
}

export type CrisisTracker = {
  /** The tracker is shown from act I's open day on (and stays once the Crisis is decided). */
  visible: boolean
  /** The best level among the members who can act. */
  partyLevel: number
  /** The open act's index (0–2), or null. */
  current: number | null
  outcome: 'won' | 'lost' | null
  acts: TrackerAct[]
}

/** The endgame tracker, or null without a Crisis (or when the content lost its villain). */
export function crisisTracker(state: GameState, content: Content): CrisisTracker | null {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  if (!crisis || !villain) return null
  const status = crisisStatus(crisis, state.day)
  const known = planKnown(crisis)
  const partyLevel = Math.max(1, ...state.party.filter(canAct).map((c) => c.level))
  const surge = crisisSurge(state, content)
  const wait = crisisWait(state, content)
  const decided = status.phase === 'won' || status.phase === 'lost'
  const pois = state.world.pois
  const found = (id: string) => Object.hasOwn(pois, id) && pois[id].discovered
  const acts = crisis.acts.map((a, i): TrackerAct => {
    const act = villain.acts[i]
    const phase = status.phases[i]
    const days = actCalendar(crisis, i)
    const standing = phase !== 'thwarted' && phase !== 'failed'
    const leadLevel = crLevel(act.leadCr)
    const keyLevel = crLevel(act.keyCr)
    const next = (): string | null => {
      if (decided) return null
      switch (phase) {
        case 'dormant':
          return `Stirs from day ${days.opens}`
        case 'investigation': {
          if (found(a.lead)) return `Follow the lead at ${pois[a.lead].name}`
          if ((crisis.clues[i] ?? 0) >= 1) {
            return `Find the lead in ${siteWhere(state, content, a.lead).land}`
          }
          return 'Ask in the towns'
        }
        case 'prevention':
          return `Strike at ${pois[a.key]?.name ?? a.key}`
        case 'thwarted':
        case 'failed':
          return null
      }
    }
    return {
      n: i + 1,
      numeral: actNumeral(i),
      name: known ? act.name : null,
      phase,
      opens: days.opens,
      expected: days.expected,
      due: days.due,
      daysLeft: standing ? Math.max(0, days.due - state.day) : null,
      pressing: status.act === i && actOpen(status.phase) && state.day >= days.hurry,
      next: next(),
      leadCr: act.leadCr,
      keyCr: act.keyCr,
      leadLevel,
      keyLevel,
      tooStrong:
        (phase === 'investigation' && partyLevel < leadLevel) ||
        (phase === 'prevention' && partyLevel < keyLevel),
      foe: known ? (act.boss ?? shortName(crisis.name)) : null,
      surge: surge?.act === i ? Math.round(surge.share * 100) : 0,
      surges: known && act.surge,
      wait: wait?.act === i ? Math.round(wait.share * 100) : 0,
      waitFrom: days.waiting,
    }
  })
  const open = actOpen(status.phase)
  return {
    visible: state.day >= actCalendar(crisis, 0).opens,
    partyLevel,
    current: open ? status.act : null,
    outcome: decided ? (status.phase as 'won' | 'lost') : null,
    acts,
  }
}
