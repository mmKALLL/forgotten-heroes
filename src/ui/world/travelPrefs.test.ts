// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { DEFAULT_TRAVEL_PREFS, TRAVEL_PREFS_KEY, useTravelPrefs } from './travelPrefs'

afterEach(() => localStorage.removeItem(TRAVEL_PREFS_KEY))

test('the last travel choices are kept across a reload of the same game, not a new one', () => {
  const first = renderHook(() => useTravelPrefs(7))
  act(() => first.result.current[1]({ ...DEFAULT_TRAVEL_PREFS, forage: false }))
  expect(first.result.current[0].forage).toBe(false)
  first.unmount()
  // A reload of the same game remembers not foraging.
  expect(renderHook(() => useTravelPrefs(7)).result.current[0].forage).toBe(false)
  // A new party (a new seed) starts from the defaults.
  expect(renderHook(() => useTravelPrefs(8)).result.current[0]).toEqual(DEFAULT_TRAVEL_PREFS)
})
