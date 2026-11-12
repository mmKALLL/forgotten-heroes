import type { FollowUp, GameState, PaceDay } from '../../schema/state'
import { appendLog } from '../log'
import { PACE_SPEED, coversTracks } from './pace'

// Pursuit (design §7): a follow-up flagged `pursuit` hunts the party down. When it comes due, the
// party's pace since it was queued decides whether it catches up. Every tuning number is here.

/** Average speed (PACE_SPEED, 0 for a day standing still) at or above which the party outruns it. */
export const PURSUIT_ESCAPE_SPEED = 1.2
/** Outrun pursuers come back after this many more encounters... */
export const PURSUIT_ESCAPE_DELAY = 2
/** ...at most this many times; outrun once more, they give up. */
export const PURSUIT_MAX_ESCAPES = 2

export const PURSUIT_LOST = 'Your covered tracks pay off: whoever was following has lost the trail.'
export const PURSUIT_ESCAPED =
  'You keep up the pace and stay ahead of whoever is following, for now.'
export const PURSUIT_GAVE_UP = 'You keep up the pace, and whoever was following gives up the chase.'

export type PursuitOutcome = 'lost' | 'escaped' | 'caught'

/**
 * Every day since the follow-up was queued, oldest first: the pace it was travelled at (from
 * journeys finished since, then the current one), or null for a day the party stood still
 * (resting, in town or in camp). A follow-up from an older save has no queue day and no history.
 */
export function paceSince(
  state: Pick<GameState, 'day' | 'travel'>,
  followUp: FollowUp
): (PaceDay | null)[] {
  const since = followUp.queuedDay
  if (since === undefined) return []
  const byDay = new Map<number, PaceDay>()
  for (const d of [...(followUp.trail ?? []), ...(state.travel?.paceLog ?? [])])
    if (d.day >= since) byDay.set(d.day, d)
  return Array.from(
    { length: Math.max(0, state.day - since) },
    (_, i) => byDay.get(since + i) ?? null
  )
}

/**
 * Covered tracks on any day lose them; a brisk or faster average outruns them; else they catch up.
 * With no days to judge (queued today, or an old save), covering tracks right now loses them and
 * anything else lets them catch up.
 */
export function pursuitOutcome(
  days: readonly (PaceDay | null)[],
  coveringNow = false
): PursuitOutcome {
  if (days.some((d) => d?.coverTracks)) return 'lost'
  if (days.length === 0) return coveringNow ? 'lost' : 'caught'
  const speed = days.reduce((sum, d) => sum + (d ? PACE_SPEED[d.pace] : 0), 0) / days.length
  return speed >= PURSUIT_ESCAPE_SPEED ? 'escaped' : 'caught'
}

/**
 * A due pursuit, already taken out of the queue (`rest` is what remains). Returns the state after
 * the party loses or outruns it (an outrun pursuit is queued again, up to PURSUIT_MAX_ESCAPES
 * times), or null when it catches up and its encounter should start.
 */
export function evadePursuit(
  state: GameState,
  followUp: FollowUp,
  rest: FollowUp[]
): GameState | null {
  const covering = state.travel ? coversTracks(state.travel.pace, state.travel.coverTracks) : false
  const outcome = pursuitOutcome(paceSince(state, followUp), covering)
  if (outcome === 'caught') return null
  if (outcome === 'lost') return appendLog({ ...state, followUps: rest }, PURSUIT_LOST, 'good')
  const escapes = followUp.escapes ?? 0
  if (escapes >= PURSUIT_MAX_ESCAPES) {
    return appendLog({ ...state, followUps: rest }, PURSUIT_GAVE_UP, 'good')
  }
  const again: FollowUp = {
    situationId: followUp.situationId,
    wait: PURSUIT_ESCAPE_DELAY,
    queuedDay: state.day,
    escapes: escapes + 1,
  }
  return appendLog({ ...state, followUps: [...rest, again] }, PURSUIT_ESCAPED, 'good')
}

/** On arrival: each queued pursuit keeps the finished journey's days since it was queued. */
export function foldTrail(
  followUps: readonly FollowUp[],
  paceLog: readonly PaceDay[],
  isPursuit: (situationId: string) => boolean
): FollowUp[] {
  return followUps.map((f) => {
    const since = f.queuedDay
    if (since === undefined || !isPursuit(f.situationId)) return f
    const days = paceLog.filter((d) => d.day >= since)
    return days.length === 0 ? f : { ...f, trail: [...(f.trail ?? []), ...days] }
  })
}
