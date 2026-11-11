// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { RollRecord } from '../../schema/state'
import { DiceRoll } from './DiceRoll'
import { DICE_MAX_MS, settleTimes } from './schedule'

const roll: RollRecord = {
  stat: 'athletics',
  actorId: 'brom',
  dice: [7, 15],
  kept: 15,
  keptIndex: 1,
  modifier: 3,
  total: 18,
  dc: 14,
  mode: 'advantage',
  tier: 'success',
}
const faces = () => [...document.querySelectorAll('.d20 text')].map((t) => Number(t.textContent))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
})

test('settles on the real dice, one after another, within 1.5 s', () => {
  const onDone = vi.fn()
  render(<DiceRoll roll={roll} onDone={onDone} />)
  expect(onDone).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(settleTimes(2, false)[0]))
  expect(document.querySelectorAll('.d20.settled')).toHaveLength(1)
  act(() => vi.advanceTimersByTime(DICE_MAX_MS))
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(faces()).toEqual([7, 15])
  expect(document.querySelector('.d20.kept text')?.textContent).toBe('15')
})

test('a click skips straight to the result', () => {
  const onDone = vi.fn()
  render(<DiceRoll roll={roll} onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: 'Skip dice animation' }))
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(faces()).toEqual([7, 15])
  expect(screen.getByRole('button', { name: 'Rolled 7 and 15' })).toBeTruthy()
  act(() => vi.advanceTimersByTime(DICE_MAX_MS))
  expect(onDone).toHaveBeenCalledTimes(1)
})

test('high stakes: the DC line is drawn and the last die glows once it settles', () => {
  render(<DiceRoll roll={roll} highStakes />)
  expect(screen.getByText('DC 14')).toBeTruthy()
  act(() => vi.advanceTimersByTime(settleTimes(2, false)[1]))
  expect(document.querySelector('.d20.glow')).toBeNull() // held back past the normal settle time
  act(() => vi.advanceTimersByTime(DICE_MAX_MS))
  expect(document.querySelector('.d20.glow text')?.textContent).toBe('15')
  expect(document.querySelector('.dc-total')).toBeTruthy()
})

test('reduced motion shows the result at once, with no flicker timers', () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query.includes('reduce'), media: query }),
  })
  const onDone = vi.fn()
  render(<DiceRoll roll={roll} onDone={onDone} />)
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(faces()).toEqual([7, 15])
  expect(vi.getTimerCount()).toBe(0)
})

test('each die settles at its scheduled time even when flicker timers fire late', () => {
  // Make every short (flicker) timeout run 40 ms late, as a busy main thread would.
  const fakeSetTimeout = window.setTimeout
  vi.spyOn(window, 'setTimeout').mockImplementation(((fn: () => void, ms = 0) =>
    fakeSetTimeout(fn, ms < 200 ? ms + 40 : ms)) as typeof window.setTimeout)
  const onDone = vi.fn()
  render(<DiceRoll roll={roll} onDone={onDone} />)
  const times = settleTimes(2, false)
  act(() => vi.advanceTimersByTime(times[1] - 1))
  expect(onDone).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(Math.max(...times)).toBeLessThanOrEqual(DICE_MAX_MS)
})

test('the dice take focus, so Enter or Space skips, and leave the tab order once settled', () => {
  render(<DiceRoll roll={roll} />)
  const button = screen.getByRole('button', { name: 'Skip dice animation' })
  expect(document.activeElement).toBe(button)
  expect(button.tabIndex).toBe(0)
  fireEvent.click(button)
  expect(button.tabIndex).toBe(-1)
})
