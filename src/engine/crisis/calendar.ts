import type { CrisisState } from '../../schema/crisis'
import {
  CRISIS_ACT_DAYS,
  CRISIS_ACT_EXPECTED,
  CRISIS_ACT_HURRY,
  CRISIS_ACT_OPEN,
  CRISIS_WAIT_DAY,
} from '../constants'

// The Crisis's fixed calendar (Plan 6 C2, design §10b). Each act spans CRISIS_ACT_DAYS from the
// Crisis's start: on a new game (startDay 1) act I opens on day 30, is expected from day 60, gets
// a hurry note on day 80 and is due on day 100; acts II and III follow 100 and 200 days later.
// Nothing is jittered and there is no leeway: an act not thwarted by its due day fails.

/** One act's days. */
export type ActCalendar = {
  /** Its lead site wakes and the investigation can begin. */
  opens: number
  /** Its climax is expected from here (informational: a party may clear it sooner). */
  expected: number
  /** From here, while its lead is not won, the world's danger rises a little each day (surge.ts). */
  waiting: number
  /** The journal says to hurry. */
  hurry: number
  /** The last day to thwart it. */
  due: number
  /** The first day it has failed (the day after `due`), and with it the Crisis. */
  failsOn: number
}

/** Act `i`'s (0–2) days, from the Crisis's start day. */
export function actCalendar(crisis: Pick<CrisisState, 'startDay'>, i: number): ActCalendar {
  const before = crisis.startDay - 1 + i * CRISIS_ACT_DAYS
  const due = before + CRISIS_ACT_DAYS
  return {
    opens: before + CRISIS_ACT_OPEN,
    expected: before + CRISIS_ACT_EXPECTED,
    waiting: before + CRISIS_WAIT_DAY,
    hurry: before + CRISIS_ACT_HURRY,
    due,
    failsOn: due + 1,
  }
}
