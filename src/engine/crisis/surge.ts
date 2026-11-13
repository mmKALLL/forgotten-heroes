import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { actOpen, actTitle, crisisStatus, planKnown } from './status'
import { villainOf } from './text'
import { CRISIS_SURGE } from '../constants'

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
