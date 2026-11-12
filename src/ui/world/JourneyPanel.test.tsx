// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { step, type Action } from '../../engine/state'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import type { GameState } from '../../schema/state'
import { JourneyPanel } from './JourneyPanel'
import { PlacePanel } from './PlacePanel'
import { useTravelPrefs } from './travelPrefs'

const content = fixtureContent()
afterEach(cleanup)

test('shows the journey’s progress and pace, and dispatches Continue and Make camp', async () => {
  const out = step(
    makeState({ location: 'greenvale-1' }),
    { type: 'travel', routeId: 'greenvale-1-greenvale-2', pace: 'brisk' },
    content
  )
  const onAction = vi.fn()
  render(<JourneyPanel content={content} state={out} onAction={onAction} />)
  // The map shows the way travelled; the panel keeps a compact line, without a progress bar.
  expect(screen.getByText('Day 0 of about 2 · 0 of 75 km')).toBeTruthy()
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('Pace: Brisk · foraging each day')).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'Pace' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'continueJourney' })
  await userEvent.click(screen.getByRole('button', { name: 'Make camp (rest a day)' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'rest' })
})

/**
 * The App's centre column on the real engine; this road is kept quiet (no encounters). "New
 * party" starts a game with another seed.
 */
function Harness({ initial }: { initial: GameState }) {
  const [state, setState] = useState(initial)
  const [selected, setSelected] = useState<string | null>(null)
  const [prefs, setPrefs] = useTravelPrefs(state.seed)
  const dispatch = (a: Action) =>
    setState((s) => {
      const next = step(s, a, content)
      return next.travel ? { ...next, travel: { ...next.travel, encounterDays: [] } } : next
    })
  return (
    <>
      {state.travel ? (
        <JourneyPanel content={content} state={state} onAction={dispatch} />
      ) : (
        <PlacePanel
          content={content}
          state={state}
          selected={selected}
          onSelect={setSelected}
          prefs={prefs}
          onPrefs={setPrefs}
          onAction={dispatch}
        />
      )}
      <button onClick={() => setState({ ...initial, seed: state.seed + 1 })}>New party</button>
      <ol aria-label="Log">
        {state.log.map((e, i) => (
          <li key={i}>{e.text}</li>
        ))}
      </ol>
    </>
  )
}

const pacePressed = () =>
  within(screen.getByRole('group', { name: 'Pace' }))
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent
const foraging = () =>
  (screen.getByRole('checkbox', { name: 'Forage along the way' }) as HTMLInputElement).checked

test('travel, then Continue until the party arrives', async () => {
  const state = makeState({ location: 'greenvale-1', gold: 50 })
  const there = settlementName(state, 'greenvale-2')
  render(<Harness initial={state} />)
  const roads = within(screen.getByRole('list', { name: 'Roads from here' }))
  await userEvent.click(roads.getByRole('button', { name: there }))
  await userEvent.click(screen.getByRole('button', { name: 'Brisk' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Forage along the way' }))
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }))
  expect(screen.getByRole('region', { name: 'On the road' })).toBeTruthy()
  for (let i = 0; i < 10 && screen.queryByRole('region', { name: 'On the road' }); i++) {
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  }
  expect(screen.getByRole('region', { name: 'Settlement' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: there })).toBeTruthy()
  expect(screen.getByRole('list', { name: 'Log' }).textContent).toMatch(
    new RegExp(`Arrived at ${there} after \\d+ days? on the road`)
  )

  // The pace and foraging chosen before the journey still hold on the next road...
  await userEvent.click(
    within(screen.getByRole('list', { name: 'Roads from here' })).getAllByRole('button')[0]
  )
  expect(pacePressed()).toBe('Brisk')
  expect(foraging()).toBe(false)
  // ...until a new party starts.
  await userEvent.click(screen.getByRole('button', { name: 'New party' }))
  await userEvent.click(
    within(screen.getByRole('list', { name: 'Roads from here' })).getAllByRole('button')[0]
  )
  expect(pacePressed()).toBe('Steady')
  expect(foraging()).toBe(true)
})
