import { expect, test } from 'vitest'
import { PACES } from '../../schema/constants'
import type { TravelState } from '../../schema/state'
import {
  DEFAULT_PACE,
  ambushPositionForPace,
  canCoverTracks,
  coversTracks,
  logPaceDay,
  paceHostileAvoidance,
} from './pace'

test('the default pace is steady', () => {
  expect(DEFAULT_PACE).toBe('steady')
})

test('only a cautious party skips some hostile encounters', () => {
  expect(PACES.map(paceHostileAvoidance)).toEqual([0.4, 0, 0, 0])
})

test('only a cautious party can cover its tracks', () => {
  expect(PACES.filter(canCoverTracks)).toEqual(['cautious'])
  expect(coversTracks('cautious', true)).toBe(true)
  expect(coversTracks('cautious', false)).toBe(false)
  expect(coversTracks('steady', true)).toBe(false)
})

test('ambush footing by pace', () => {
  // Cautious meets it on normal footing, or with Edge with covered tracks, whatever the encounter says.
  expect(ambushPositionForPace('cautious', false, 'exposed')).toBe('normal')
  expect(ambushPositionForPace('cautious', true, 'exposed')).toBe('edge')
  // Steady: as the encounter defines.
  expect(ambushPositionForPace('steady', false, 'exposed')).toBe('exposed')
  expect(ambushPositionForPace('steady', false)).toBe('normal')
  expect(ambushPositionForPace('steady', true, 'edge')).toBe('edge')
  // Brisk and forced march: always Exposed.
  expect(ambushPositionForPace('brisk', false, 'edge')).toBe('exposed')
  expect(ambushPositionForPace('forced', false)).toBe('exposed')
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
    pace: 'cautious',
    coverTracks: true,
    paceLog: [],
  }
  const once = logPaceDay(travel, 4)
  expect(once.paceLog).toEqual([{ day: 4, pace: 'cautious', coverTracks: true }])
  expect(logPaceDay({ ...once, pace: 'brisk' }, 5).paceLog).toEqual([
    { day: 4, pace: 'cautious', coverTracks: true },
    { day: 5, pace: 'brisk', coverTracks: false },
  ])
  expect(travel.paceLog).toEqual([])
})
