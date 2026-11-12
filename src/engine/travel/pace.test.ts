import { expect, test } from 'vitest'
import { PACES } from '../../schema/types'
import type { TravelState } from '../../schema/state'
import { ambushPositionForPace, coversTracks, logPaceDay, paceHostileAvoidance } from './pace'
import { DEFAULT_PACE, PACE_SPEED } from '../constants'

test('the default pace is steady', () => {
  expect(DEFAULT_PACE).toBe('steady')
})

test('paces run slowest first, and only stealthy skips hostile encounters', () => {
  expect(PACES).toEqual(['stealthy', 'steady', 'brisk', 'forced'])
  const speeds = PACES.map((p) => PACE_SPEED[p])
  expect([...speeds].sort((a, b) => a - b)).toEqual(speeds)
  expect(PACES.filter((p) => paceHostileAvoidance(p) > 0)).toEqual(['stealthy'])
})

test('only a stealthy party covers its tracks', () => {
  expect(PACES.filter(coversTracks)).toEqual(['stealthy'])
})

test('ambush footing by pace', () => {
  // Stealthy meets it with Edge, whatever the encounter says.
  expect(ambushPositionForPace('stealthy', 'exposed')).toBe('edge')
  // Steady: as the encounter defines.
  expect(ambushPositionForPace('steady', 'exposed')).toBe('exposed')
  expect(ambushPositionForPace('steady')).toBe('normal')
  expect(ambushPositionForPace('steady', 'edge')).toBe('edge')
  // Brisk and forced march: always Exposed.
  expect(ambushPositionForPace('brisk', 'edge')).toBe('exposed')
  expect(ambushPositionForPace('forced')).toBe('exposed')
})

test('foraging gives the party away: a stealthy party wins no Edge on a journey that forages', () => {
  expect(ambushPositionForPace('stealthy', 'normal', true)).toBe('normal')
  expect(ambushPositionForPace('stealthy', 'normal', false)).toBe('edge')
  expect(ambushPositionForPace('brisk', 'normal', true)).toBe('exposed')
})

test('each day on the road records its pace, for pursuit', () => {
  const travel: TravelState = {
    route: 'greenvale-1-greenvale-2',
    from: 'greenvale-1',
    to: 'greenvale-2',
    km: 75,
    kmPerDay: 16,
    kmDone: 0,
    daysDone: 0,
    days: 5,
    encounterDays: [],
    pace: 'stealthy',
    paceLog: [],
    forage: true,
    hired: null,
  }
  const once = logPaceDay(travel, 4)
  expect(once.paceLog).toEqual([{ day: 4, pace: 'stealthy' }])
  expect(logPaceDay({ ...once, pace: 'brisk' }, 5).paceLog).toEqual([
    { day: 4, pace: 'stealthy' },
    { day: 5, pace: 'brisk' },
  ])
  expect(travel.paceLog).toEqual([])
})
