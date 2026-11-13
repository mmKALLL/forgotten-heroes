import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { actCalendar } from './calendar'
import { actOpen, actTitle, crisisStatus, planKnown } from './status'
import { actNumeral, villainOf } from './text'
import { CRISIS_SURGE, CRISIS_WAIT_STEP } from '../constants'

// The danger surge (Plan 6 C4, design §10b): where an act's data sets `surge`, the world's danger
// rises in the last days before its due day while it stands, a reason to finish early. It ends
// when the act is thwarted (or fails, which ends the Crisis).

export type CrisisSurge = {
  /** The share added to the day's danger (world/danger.ts dangerLevel). */
  share: number
  /** The act (0–2) that surges, and its due day. */
  act: number
  due: number
  /** For the danger mark's tooltip, e.g. "Act II, The Bone Choir, is near its day: +10%". */
  text: string
}

/** The surge on this day, or null (no Crisis or content, no open act, no `surge`, or outside the window). */
export function crisisSurge(
  state: Pick<GameState, 'crisis' | 'day'>,
  content?: Content
): CrisisSurge | null {
  const crisis = state.crisis
  const villain = content && crisis && villainOf(content, crisis)
  if (!crisis || !villain) return null
  const status = crisisStatus(crisis, state.day)
  if (!actOpen(status.phase) || !villain.acts[status.act!]?.surge) return null
  const left = status.due! - state.day
  const share = Math.max(0, ...CRISIS_SURGE.filter(([days]) => left <= days).map(([, s]) => s))
  if (share <= 0) return null
  const percent = Math.round(share * 100)
  return {
    share,
    act: status.act!,
    due: status.due!,
    // Before the plan is known, nothing of the act is told.
    text: planKnown(crisis)
      ? `${actTitle(content, crisis, status.act!)}, is near its day: +${percent}%`
      : `Something out there is near its day: +${percent}%`,
  }
}

/** The waiting penalty on a day (Plan 6 wave 2b): its share, the act and why. */
export type CrisisWait = {
  /** The share added to the day's danger (world/danger.ts dangerLevel). */
  share: number
  /** The act (0–2) whose lead goes unfollowed, and the first day of the penalty. */
  act: number
  from: number
  /** For the danger mark's tooltip, e.g. "Act II, …: its lead goes unfollowed: +4%, and more each day". */
  text: string
}

/**
 * The waiting penalty: from the open act's waiting day (its day CRISIS_WAIT_DAY: 50, 150, 250 on a
 * new game) while its lead is not won, the world's danger rises by CRISIS_WAIT_STEP a day, that
 * day included. It drops away once the lead is won (or the act is decided). It needs no content;
 * with it, the text names the act once the plan is known.
 */
export function crisisWait(
  state: Pick<GameState, 'crisis' | 'day'>,
  content?: Content
): CrisisWait | null {
  const crisis = state.crisis
  if (!crisis) return null
  const status = crisisStatus(crisis, state.day)
  if (status.phase !== 'investigation') return null
  const act = status.act!
  const from = actCalendar(crisis, act).waiting
  if (state.day < from) return null
  const percent = Math.round((state.day - from + 1) * CRISIS_WAIT_STEP * 100)
  const title =
    content && villainOf(content, crisis)
      ? actTitle(content, crisis, act)
      : `Act ${actNumeral(act)}`
  return {
    share: percent / 100,
    act,
    from,
    // Before the plan is known (always so in act I's investigation), nothing of the act is told.
    text: planKnown(crisis)
      ? `${title}: its lead goes unfollowed: +${percent}%, and more each day`
      : `Something out there grows bolder while no one looks into it: +${percent}%, and more each day`,
  }
}
