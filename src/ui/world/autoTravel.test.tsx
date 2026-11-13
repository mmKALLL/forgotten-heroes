// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { inProgress } from '../../engine/encounters/run'
import { step, type Action } from '../../engine/state'
import { fixtureContent, makeEncounter, makeState } from '../../engine/test-fixtures'
import { nodeOf } from '../../engine/world/graph'
import type { GameState } from '../../schema/state'
import { autoTravelDayMs, autoTravelKmPerSecond, useAutoTravel } from './autoTravel'
import { JourneyPanel } from './JourneyPanel'
import { WorldMap } from './WorldMap'

const content = fixtureContent()

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** On the 75 km plains road, with these encounter days and km per day (15: as in the mountains). */
function onTheRoad(encounterDays: number[], kmPerDay = 30): GameState {
  const out = step(
    makeState({ location: 'greenvale-1', goods: { food: 20, water: 12 } }),
    { type: 'travel', routeId: 'greenvale-1-greenvale-2', forage: false },
    content
  )
  return { ...out, travel: { ...out.travel!, encounterDays, kmPerDay } }
}

/** The App's wiring: the engine's state, auto-travel, the journey panel and the map. */
function Harness({ initial, sent }: { initial: GameState; sent: (a: Action) => void }) {
  const [state, setState] = useState(initial)
  const dispatch = (a: Action) => {
    sent(a)
    setState((s) => step(s, a, content))
  }
  const auto = useAutoTravel(state, content, dispatch)
  return (
    <>
      {state.travel && !inProgress(state) && (
        <JourneyPanel content={content} state={state} onAction={dispatch} auto={auto} />
      )}
      {inProgress(state) && <p>In an encounter</p>}
      <WorldMap
        content={content}
        state={state}
        selected={null}
        onSelect={() => {}}
        imageUrl={null}
        glide={auto.glide}
      />
    </>
  )
}

const walks = (sent: ReturnType<typeof vi.fn>) =>
  sent.mock.calls.filter(([a]) => (a as Action).type === 'continueJourney')
const markerX = () => Number(document.querySelector('.party-marker')!.getAttribute('data-x'))
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

test('each day takes its km at 5 km/s times the terrain speed, gliding, then walks one day', () => {
  const plains = onTheRoad([])
  const mountains = onTheRoad([], 15)
  // Mountains crawl at half the plains speed, so a full day takes as long on either.
  expect(autoTravelKmPerSecond(mountains.travel!)).toBe(autoTravelKmPerSecond(plains.travel!) / 2)
  expect(autoTravelDayMs(plains.travel!)).toBe(6000)
  expect(autoTravelDayMs(mountains.travel!)).toBe(6000)
  // The last, shorter day is quicker: 15 km left on plains.
  expect(autoTravelDayMs({ ...plains.travel!, kmDone: 60 })).toBe(3000)

  const from = nodeOf(plains, content, 'greenvale-1')!.at.x
  const to = nodeOf(plains, content, 'greenvale-2')!.at.x
  const xAt = (km: number) => from + ((to - from) * km) / 75
  for (const [state, kmPerSecond] of [
    [plains, 5],
    [mountains, 2.5],
  ] as const) {
    const sent = vi.fn()
    render(<Harness initial={state} sent={sent} />)
    wait(3000)
    expect(markerX()).toBeCloseTo(xAt(3 * kmPerSecond), 0)
    wait(2900)
    expect(walks(sent)).toHaveLength(0)
    wait(200)
    expect(walks(sent)).toEqual([[{ type: 'continueJourney', days: 1 }]])
    cleanup()
  }
})

test('stops when an encounter opens', () => {
  const sent = vi.fn()
  render(<Harness initial={onTheRoad([1])} sent={sent} />)
  wait(6100)
  expect(walks(sent)).toHaveLength(1)
  expect(screen.getByText('In an encounter')).toBeTruthy()
  wait(20_000)
  expect(walks(sent)).toHaveLength(1)
})

test("an encounter's outcome still on screen holds the clock until it is closed", () => {
  const sent = vi.fn()
  // The encounter is over (no stage left) but not yet closed.
  const viewing = { ...onTheRoad([]), encounter: makeEncounter({ stage: null }) }
  render(<Harness initial={viewing} sent={sent} />)
  wait(20_000)
  expect(walks(sent)).toHaveLength(0)
})

test('Pause holds the day where it is; Resume (or Space) walks on', () => {
  const sent = vi.fn()
  render(<Harness initial={onTheRoad([])} sent={sent} />)
  wait(3000)
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
  wait(20_000)
  expect(walks(sent)).toHaveLength(0)
  // Space resumes while nothing has focus; the day goes on from where it stopped.
  ;(document.activeElement as HTMLElement | null)?.blur()
  fireEvent.keyDown(document, { key: ' ' })
  expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  wait(3100)
  expect(walks(sent)).toHaveLength(1)
})

test('the km done counts up a km at a time with the glide, between walks', () => {
  const sent = vi.fn()
  render(<Harness initial={onTheRoad([])} sent={sent} />)
  const kmShown = () => Number(/· (\d+) of 75 km/.exec(document.body.textContent ?? '')![1])
  const seen = [kmShown()]
  // 30 km a day at 5 km/s: a km every 200 ms; sample twice as often across the first day.
  for (let i = 0; i < 29; i++) {
    wait(100)
    seen.push(kmShown())
  }
  expect(walks(sent)).toHaveLength(0)
  expect(seen[0]).toBe(0)
  for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeGreaterThanOrEqual(0)
  for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeLessThanOrEqual(1)
  expect(new Set(seen)).toEqual(new Set(Array.from({ length: 15 }, (_, k) => k)))
  // After the walk the count goes on from the engine's 30 km.
  wait(3200)
  expect(walks(sent)).toHaveLength(1)
  expect(kmShown()).toBeGreaterThanOrEqual(30)
  expect(kmShown()).toBeLessThan(35)
})
