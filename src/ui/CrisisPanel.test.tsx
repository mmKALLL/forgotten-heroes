// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { fixtureContent, makeState } from '../engine/test-fixtures'
import type { CrisisState } from '../schema/crisis'
import type { GameState } from '../schema/state'
import { CrisisTracker } from './CrisisPanel'
import { DayMark } from './DayMark'
import { crisisInfo } from '../engine/crisis/status'
import { I18nProvider } from './i18n/I18n'
import { RoadsOut } from './world/RoadsOut'
import { DEFAULT_TRAVEL_PREFS } from './world/travelPrefs'

const content = fixtureContent()
afterEach(cleanup)

/** The fixture world's Crisis (acts due on days 100, 200 and 300), act I's lead won on day 35. */
function withCrisis(crisis: Partial<CrisisState> = {}, state: Partial<GameState> = {}): GameState {
  const base = makeState(state)
  return { ...base, crisis: { ...base.crisis!, leads: [35, null, null], ...crisis } }
}

const wrap = (node: React.ReactNode) =>
  render(<I18nProvider content={content}>{node}</I18nProvider>)

test('the tracker shows each act’s phase, days, next step, challenge and foe', () => {
  wrap(<CrisisTracker content={content} state={withCrisis({ clues: [1, 0, 0] }, { day: 63 })} />)
  const panel = within(screen.getByRole('region', { name: 'Crisis' }))
  expect(panel.getByRole('heading', { name: 'Morvaine, the Test Prophet' })).toBeTruthy()
  expect(panel.getByText('I. The Test Act 1')).toBeTruthy()
  expect(panel.getByText('prevention')).toBeTruthy()
  expect(panel.getByText('clues 1 / 2 · weakness at 3')).toBeTruthy()
  expect(panel.getByText('due day 100 · 37d left')).toBeTruthy()
  expect(panel.getByText(/^Strike at /)).toBeTruthy()
  // The fixture's party is level 1: act I's key site (CR 6) is beyond it.
  expect(panel.getByText('CR 6, meant for level 7')).toBeTruthy()
  expect(panel.getByText(/too strong for you \(level 1\)/)).toBeTruthy()
  expect(panel.getByText('Holding it: Captain Test, the Hand')).toBeTruthy()
  // A later act: its name, goal, when it stirs and its challenges.
  expect(panel.getByText('II. The Test Act 2')).toBeTruthy()
  expect(panel.getByText('Stirs from day 130')).toBeTruthy()
  expect(panel.getByText('lead CR 8 · key CR 12')).toBeTruthy()
  expect(panel.queryByText(/due day 200/)).toBeNull()
  cleanup()

  // Act I thwarted on day 74; act II's investigation under way, its surge on near its due day.
  const later = withCrisis({ thwarted: [74, null, null], clues: [3, 1, 0] }, { day: 185 })
  wrap(<CrisisTracker content={content} state={later} />)
  const again = within(screen.getByRole('region', { name: 'Crisis' }))
  expect(again.getByText('✓ day 74')).toBeTruthy()
  expect(again.getByText('investigation')).toBeTruthy()
  expect(again.getByText('due day 200 · 15d left')).toBeTruthy()
  expect(again.getByText(/^Find the lead in /)).toBeTruthy()
  expect(again.getByText(/^⚠ the roads are 10% more dangerous/)).toBeTruthy()
  cleanup()

  // The top bar's mark.
  wrap(<DayMark day={63} crisis={crisisInfo(withCrisis({}, { day: 63 }), content)} />)
  expect(screen.getByText('Act I · 37d')).toBeTruthy()
})

test('the tracker is hidden before act I opens, then names nothing before the plan', () => {
  const unknown = withCrisis({ leads: [null, null, null] }, { day: 29 })
  wrap(<CrisisTracker content={content} state={unknown} />)
  expect(screen.queryByRole('region', { name: 'Crisis' })).toBeNull()
  cleanup()
  const id = unknown.crisis!.acts[0].lead
  const pois = { ...unknown.world.pois, [id]: { ...unknown.world.pois[id], discovered: true } }
  const open = { ...unknown, day: 40, world: { ...unknown.world, pois } }
  wrap(<CrisisTracker content={content} state={open} />)
  const panel = within(screen.getByRole('region', { name: 'Crisis' }))
  expect(panel.getByRole('heading', { name: 'Crisis' })).toBeTruthy()
  expect(panel.getByText('Act I')).toBeTruthy()
  expect(panel.getByText(`Follow the lead at ${pois[id].name}`)).toBeTruthy()
})

test('a road to the open act’s site shows its arrival against the due day', () => {
  const base = withCrisis({ clues: [2, 0, 0] }, { day: 90, location: 'greenvale-1' })
  const site = base.crisis!.acts[0].key
  const pois = { ...base.world.pois, [site]: { ...base.world.pois[site], discovered: true } }
  const state = { ...base, world: { ...base.world, pois } }
  const roads = (day: number) =>
    wrap(
      <RoadsOut
        content={content}
        state={{ ...state, day }}
        selected={site}
        onSelect={vi.fn()}
        prefs={DEFAULT_TRAVEL_PREFS}
        onPrefs={vi.fn()}
        onAction={vi.fn()}
      />
    )
  roads(90)
  const preview = within(screen.getByRole('group', { name: /^To / }))
  expect(preview.getByText(/^Arrives day \d+ · act I due day 100 ✓$/)).toBeTruthy()
  expect(screen.getByText('act I')).toBeTruthy()
  cleanup()
  roads(100)
  const late = within(screen.getByRole('group', { name: /^To / }))
  expect(
    late.getByText(/^Arrives day \d+, after act I’s due day: it fails on day 101 ✗$/)
  ).toBeTruthy()
})
