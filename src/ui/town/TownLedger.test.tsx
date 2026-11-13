// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Action } from '../../engine/state'
import { kingdomOf, peopleRows } from '../../engine/town/reputation'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { placeInfo } from '../../engine/travel/preview'
import { settlementName } from '../../engine/world/geo'
import type { GameState } from '../../schema/state'
import { I18nProvider } from '../i18n/I18n'
import { DEFAULT_TRAVEL_PREFS } from '../world/travelPrefs'
import { LEDGER_TAB_KEY, TownLedger } from './TownLedger'

// Every asset is "synced" here, so a town with a banner shows its map.
vi.mock('../assets', () => ({ assetUrl: (path: string) => `/assets/${path}` }))

const content = fixtureContent()
afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** The ledger with its road choice kept, as the app keeps it. */
function Ledger({
  state,
  onAction = vi.fn(),
}: {
  state: GameState
  onAction?: (a: Action) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <I18nProvider content={content}>
      <TownLedger
        content={content}
        state={state}
        selected={selected}
        onSelect={setSelected}
        prefs={DEFAULT_TRAVEL_PREFS}
        onPrefs={vi.fn()}
        onAction={onAction}
        services={<p>services here</p>}
      />
    </I18nProvider>
  )
}

const tab = (name: string) => screen.getByRole('tab', { name })

test('the ledger opens on its Market tab; the Travel tab holds Explore, the roads, talk and the people', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  const onAction = vi.fn()
  render(<Ledger state={state} onAction={onAction} />)
  const info = placeInfo(state, content, 'ashmoor-1')!
  expect(screen.getByRole('heading', { name: info.name })).toBeTruthy()
  // The header shows the reputation points here, not the tier (designer, 2026-11-14); its tooltip
  // has the tier and the kingdom's average.
  const rep = screen.getByText('Reputation 0')
  expect(rep.title).toMatch(/^Stranger \(/)
  expect(rep.title).toContain(`\n${kingdomOf(state, 'ashmoor-1')!.name}: 0 on average`)
  expect(screen.queryByText(/stranger/)).toBeNull()
  // Market: the market and the services, side by side.
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Market', 'Travel'])
  expect(tab('Market').getAttribute('aria-selected')).toBe('true')
  const market = screen.getByRole('tabpanel', { name: 'Market' })
  expect(within(market).getByRole('region', { name: 'Market' })).toBeTruthy()
  expect(within(market).getByText('services here')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Roads out' })).toBeNull()

  await userEvent.click(tab('Travel'))
  expect(tab('Travel').getAttribute('aria-selected')).toBe('true')
  expect(screen.queryByRole('region', { name: 'Market' })).toBeNull()
  const roadsZone = screen.getByRole('region', { name: 'Roads out' })
  // Explore comes before the roads, without an odds bar; its tiers are a list of lines.
  const exploreGroup = within(roadsZone).getByRole('group', { name: 'Explore the domain' })
  const explore = within(exploreGroup)
  expect(explore.queryByRole('img')).toBeNull()
  expect(explore.getByRole('list', { name: 'What the search finds' })).toBeTruthy()
  expect(exploreGroup.textContent).toMatch(/vs DC \d+/)
  const roads = within(roadsZone).getByRole('list', { name: 'Roads from here' })
  expect(
    exploreGroup.compareDocumentPosition(roads) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  await userEvent.click(explore.getByRole('button', { name: /^Explore \(/ }))
  expect(onAction).toHaveBeenCalledWith({ type: 'explore' })
  // Talk and work: rumours, the people (always shown) and the notice board.
  const talk = within(screen.getByRole('region', { name: 'Talk and work' }))
  expect(talk.getByRole('group', { name: 'Listen for rumours' })).toBeTruthy()
  expect(talk.getByRole('region', { name: 'Notice board' })).toBeTruthy()
  const people = peopleRows(state, content)
  expect(talk.getByRole('heading', { name: `People (${people.length})` })).toBeTruthy()
  const list = within(talk.getByRole('list', { name: 'Notable people' }))
  for (const p of people) expect(list.getByText(p.name, { exact: false })).toBeTruthy()
  // The tab is remembered for this viewer.
  expect(localStorage.getItem(LEDGER_TAB_KEY)).toBe('travel')
})

test('after a click, Tab switches the tabs even though the clicked button has focus', async () => {
  render(<Ledger state={makeState({ location: 'ashmoor-1' })} />)
  await userEvent.click(tab('Travel'))
  expect(document.activeElement).toBe(tab('Travel'))
  await userEvent.keyboard('{Tab}')
  expect(tab('Market').getAttribute('aria-selected')).toBe('true')
  // Keyboard use (an arrow key) makes Tab move focus again.
  tab('Market').focus()
  await userEvent.keyboard('{ArrowRight}{ArrowLeft}{Tab}')
  expect(tab('Market').getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).not.toBe(tab('Market'))
})

test('Tab switches the tabs while nothing has focus, and moves focus as usual otherwise', async () => {
  render(<Ledger state={makeState({ location: 'ashmoor-1' })} />)
  expect(document.activeElement).toBe(document.body)
  await userEvent.keyboard('{Tab}')
  expect(tab('Travel').getAttribute('aria-selected')).toBe('true')
  await userEvent.keyboard('{Tab}')
  expect(tab('Market').getAttribute('aria-selected')).toBe('true')
  // From the open tab, Tab moves on into the page; the arrow keys move between the tabs.
  tab('Market').focus()
  await userEvent.keyboard('{Tab}')
  expect(tab('Market').getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).not.toBe(tab('Market'))
  tab('Market').focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(document.activeElement).toBe(tab('Travel'))
  expect(tab('Travel').getAttribute('aria-selected')).toBe('true')
  // Only the open tab is in the tab order, and it controls its panel.
  expect(tab('Market').tabIndex).toBe(-1)
  const panel = document.getElementById(tab('Travel').getAttribute('aria-controls')!)
  expect(panel?.getAttribute('role')).toBe('tabpanel')
})

test('clicking the chosen destination again closes its journey card', async () => {
  localStorage.setItem(LEDGER_TAB_KEY, 'travel')
  const state = makeState({ location: 'greenvale-1', gold: 50 })
  render(<Ledger state={state} />)
  const there = settlementName(state, 'greenvale-2')
  const road = within(screen.getByRole('list', { name: 'Roads from here' })).getByRole('button', {
    name: there,
  })
  await userEvent.click(road)
  expect(road.getAttribute('aria-pressed')).toBe('true')
  const card = screen.getByRole('group', { name: `To ${there}` })
  // The card holds the journey's choices and its Travel button.
  expect(within(card).getByRole('group', { name: 'Pace' })).toBeTruthy()
  expect(within(card).getByRole('button', { name: 'Travel' })).toBeTruthy()
  await userEvent.click(road)
  expect(road.getAttribute('aria-pressed')).toBe('false')
  expect(screen.queryByRole('group', { name: `To ${there}` })).toBeNull()
})

test('the town map is shown large below the tabs, at the ledger’s full width', async () => {
  const state = makeState({ location: 'ashmoor-1' })
  state.world.settlements['ashmoor-1'].town = 'harbourne'
  const { container } = render(<Ledger state={state} />)
  const name = placeInfo(state, content, 'ashmoor-1')!.name
  const picture = screen.getByRole('img', { name: `Town map of ${name}` })
  expect(picture.getAttribute('src')).toBe(
    '/assets/town maps/Harbourne - rich seaside town - LN.jpg'
  )
  // Its own row of the ledger, after both tabs; the header keeps no thumbnail.
  expect(picture.closest('.town-picture')?.parentElement).toBe(container.querySelector('.ledger'))
  for (const panel of container.querySelectorAll('[role="tabpanel"]')) {
    expect(panel.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
  await userEvent.click(tab('Travel'))
  expect(screen.getByRole('img', { name: `Town map of ${name}` })).toBeTruthy()
  expect(container.querySelector('.ledger-head img')).toBeNull()
})
