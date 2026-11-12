import { describe, expect, test } from 'vitest'
import type { FollowUp, PaceDay } from '../../schema/state'
import { makeState } from '../test-fixtures'
import {
  PURSUIT_ESCAPED,
  PURSUIT_ESCAPE_DELAY,
  PURSUIT_GAVE_UP,
  PURSUIT_LOST,
  PURSUIT_MAX_ESCAPES,
  evadePursuit,
  foldTrail,
  paceSince,
  pursuitOutcome,
} from './pursuit'

const day = (d: number, pace: PaceDay['pace'], coverTracks = false): PaceDay => ({
  day: d,
  pace,
  coverTracks,
})

describe('pursuitOutcome', () => {
  test('any day with covered tracks loses the pursuers', () => {
    expect(pursuitOutcome([day(1, 'steady'), day(2, 'cautious', true), null])).toBe('lost')
  })

  test('a march averaging brisk or faster outruns them', () => {
    expect(pursuitOutcome([day(1, 'brisk'), day(2, 'brisk')])).toBe('escaped')
    expect(pursuitOutcome([day(1, 'forced'), day(2, 'steady')])).toBe('escaped')
  })

  test('anything slower lets them catch up', () => {
    expect(pursuitOutcome([day(1, 'steady'), day(2, 'brisk')])).toBe('caught')
    expect(pursuitOutcome([day(1, 'cautious'), day(2, 'cautious')])).toBe('caught')
    // A day standing still (resting, or in town) counts as no distance at all.
    expect(pursuitOutcome([day(1, 'forced'), day(2, 'brisk'), null])).toBe('caught')
    expect(pursuitOutcome([])).toBe('caught')
    expect(pursuitOutcome([], true)).toBe('lost')
  })
})

describe('paceSince', () => {
  const travel = (paceLog: PaceDay[]) => ({
    route: 'greenvale-1-greenvale-2',
    from: 'greenvale-1',
    to: 'greenvale-2',
    km: 75,
    kmPerDay: 30,
    kmDone: 0,
    daysDone: paceLog.length,
    days: 3,
    encounterDays: [],
    pace: 'steady' as const,
    coverTracks: false,
    paceLog,
    forage: true,
  })

  test('every day since it was queued: earlier journeys, this one, and days standing still', () => {
    const followUp: FollowUp = {
      situationId: 'grudge',
      wait: 0,
      queuedDay: 3,
      trail: [day(3, 'brisk'), day(4, 'brisk')],
    }
    const state = {
      day: 9,
      travel: travel([day(6, 'forced'), day(7, 'cautious'), day(8, 'steady')]),
    }
    expect(paceSince(state, followUp)).toEqual([
      day(3, 'brisk'),
      day(4, 'brisk'),
      null,
      day(6, 'forced'),
      day(7, 'cautious'),
      day(8, 'steady'),
    ])
  })

  test('days before it was queued do not count; an old save’s follow-up has no history', () => {
    const state = {
      day: 5,
      travel: travel([day(2, 'cautious', true), day(3, 'brisk'), day(4, 'brisk')]),
    }
    expect(paceSince(state, { situationId: 'grudge', wait: 0, queuedDay: 3 })).toEqual([
      day(3, 'brisk'),
      day(4, 'brisk'),
    ])
    expect(paceSince(state, { situationId: 'grudge', wait: 0 })).toEqual([])
  })
})

describe('evadePursuit', () => {
  const at = (paceLog: PaceDay[], followUp: Partial<FollowUp> = {}) => {
    const base = makeState()
    const due: FollowUp = { situationId: 'grudge', wait: 0, queuedDay: base.day, ...followUp }
    const state = {
      ...base,
      day: base.day + paceLog.length,
      location: null,
      travel: {
        route: 'greenvale-1-greenvale-2',
        from: 'greenvale-1',
        to: 'greenvale-2',
        km: 75,
        kmPerDay: 30,
        kmDone: 30,
        daysDone: paceLog.length,
        days: 3,
        encounterDays: [],
        pace: paceLog[0]?.pace ?? 'steady',
        coverTracks: false,
        paceLog,
        forage: true,
      },
    }
    return { state, due }
  }
  const other: FollowUp = { situationId: 'cliff', wait: 3 }

  test('covered tracks drop it from the queue', () => {
    const { state, due } = at([day(1, 'cautious', true)])
    const after = evadePursuit(state, due, [other])!
    expect(after.followUps).toEqual([other])
    expect(after.log.at(-1)!.text).toBe(PURSUIT_LOST)
  })

  test('outrunning it puts it back in the queue, and after two escapes it gives up', () => {
    const { state, due } = at([day(1, 'brisk'), day(2, 'brisk')])
    const once = evadePursuit(state, due, [other])!
    expect(once.followUps).toEqual([
      other,
      { situationId: 'grudge', wait: PURSUIT_ESCAPE_DELAY, queuedDay: state.day, escapes: 1 },
    ])
    expect(once.log.at(-1)!.text).toBe(PURSUIT_ESCAPED)
    const twice = evadePursuit(state, { ...due, escapes: 1 }, [])!
    expect(twice.followUps).toEqual([
      { situationId: 'grudge', wait: PURSUIT_ESCAPE_DELAY, queuedDay: state.day, escapes: 2 },
    ])
    const third = evadePursuit(state, { ...due, escapes: PURSUIT_MAX_ESCAPES }, [])!
    expect(third.followUps).toEqual([])
    expect(third.log.at(-1)!.text).toBe(PURSUIT_GAVE_UP)
  })

  test('with no days to judge, covering tracks right now loses it; otherwise it catches up', () => {
    const { state, due } = at([])
    expect(evadePursuit(state, due, [])).toBeNull()
    const covering = {
      ...state,
      travel: { ...state.travel!, pace: 'cautious' as const, coverTracks: true },
    }
    const lost = evadePursuit(covering, due, [other])!
    expect(lost.followUps).toEqual([other])
    expect(lost.log.at(-1)!.text).toBe(PURSUIT_LOST)
    // An old save's follow-up has no queue day, so no history either.
    const { queuedDay: _day, ...old } = due
    expect(evadePursuit(covering, old, [])!.log.at(-1)!.text).toBe(PURSUIT_LOST)
    // The flag only counts at a cautious pace.
    const brisk = {
      ...state,
      travel: { ...state.travel!, pace: 'brisk' as const, coverTracks: true },
    }
    expect(evadePursuit(brisk, due, [])).toBeNull()
  })

  test('a slower march lets it catch up: the caller starts the encounter', () => {
    const { state, due } = at([day(1, 'steady'), day(2, 'steady')])
    expect(evadePursuit(state, due, [])).toBeNull()
  })
})

test('a finished journey folds into the trail of every pursuit queued before or during it', () => {
  const paceLog = [day(2, 'brisk'), day(3, 'brisk'), day(4, 'forced')]
  const pursuit = (id: string) => id === 'grudge'
  const followUps: FollowUp[] = [
    { situationId: 'grudge', wait: 1, queuedDay: 3, trail: [day(1, 'steady')] },
    { situationId: 'grudge', wait: 1 },
    { situationId: 'cliff', wait: 1, queuedDay: 1 },
  ]
  expect(foldTrail(followUps, paceLog, pursuit)).toEqual([
    {
      situationId: 'grudge',
      wait: 1,
      queuedDay: 3,
      trail: [day(1, 'steady'), day(3, 'brisk'), day(4, 'forced')],
    },
    { situationId: 'grudge', wait: 1 },
    { situationId: 'cliff', wait: 1, queuedDay: 1 },
  ])
})
