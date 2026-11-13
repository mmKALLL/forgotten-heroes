// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { peopleRows } from '../../engine/town/reputation'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { placeInfo } from '../../engine/travel/preview'
import { I18nProvider } from '../i18n/I18n'
import { DEFAULT_TRAVEL_PREFS } from '../world/travelPrefs'
import { TownLedger } from './TownLedger'

// Every asset is "synced" here, so a town with a banner shows its map.
vi.mock('../assets', () => ({ assetUrl: (path: string) => `/assets/${path}` }))

const content = fixtureContent()
afterEach(cleanup)

test('the ledger shows the header line, its zones, Explore before the roads, talk and work, and the people', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  const onAction = vi.fn()
  render(
    <I18nProvider content={content}>
      <TownLedger
        content={content}
        state={state}
        selected={null}
        onSelect={vi.fn()}
        prefs={DEFAULT_TRAVEL_PREFS}
        onPrefs={vi.fn()}
        onAction={onAction}
        services={<p>services here</p>}
      />
    </I18nProvider>
  )
  const info = placeInfo(state, content, 'ashmoor-1')!
  expect(screen.getByRole('heading', { name: info.name })).toBeTruthy()
  const zones = ['Market', 'Services', 'Roads out'].map((name) =>
    screen.getByRole('region', { name })
  )
  expect(within(zones[1]).getByText('services here')).toBeTruthy()
  // Explore comes before the roads, without an odds bar; its tiers are a list of lines.
  const exploreGroup = within(zones[2]).getByRole('group', { name: 'Explore the domain' })
  const explore = within(exploreGroup)
  expect(explore.queryByRole('img')).toBeNull()
  expect(explore.getByRole('list', { name: 'What the search finds' })).toBeTruthy()
  expect(exploreGroup.textContent).toMatch(/vs DC \d+ · \d+% to find a site/)
  const roads = within(zones[2]).getByRole('list', { name: 'Roads from here' })
  expect(
    exploreGroup.compareDocumentPosition(roads) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  const button = explore.getByRole('button', { name: /^Explore \(/ })
  await userEvent.click(button)
  expect(onAction).toHaveBeenCalledWith({ type: 'explore' })
  // The party’s standing here is in the header; talk and work follow the roads.
  expect(screen.getByText('Standing:').textContent).toBe('Standing: stranger')
  const talk = within(screen.getByRole('region', { name: 'Talk and work' }))
  expect(talk.getByRole('group', { name: 'Listen for rumours' })).toBeTruthy()
  expect(talk.getByRole('region', { name: 'Notice board' })).toBeTruthy()
  // People are always shown.
  const people = peopleRows(state, content)
  expect(screen.getByRole('heading', { name: `People (${people.length})` })).toBeTruthy()
  const list = within(screen.getByRole('list', { name: 'Notable people' }))
  for (const p of people) expect(list.getByText(p.name, { exact: false })).toBeTruthy()
})

test('the town map is shown large after the people and the roads, at the ledger’s full width', () => {
  const state = makeState({ location: 'ashmoor-1' })
  state.world.settlements['ashmoor-1'].town = 'harbourne'
  const { container } = render(
    <I18nProvider content={content}>
      <TownLedger
        content={content}
        state={state}
        selected={null}
        onSelect={vi.fn()}
        prefs={DEFAULT_TRAVEL_PREFS}
        onPrefs={vi.fn()}
        onAction={vi.fn()}
        services={null}
      />
    </I18nProvider>
  )
  const name = placeInfo(state, content, 'ashmoor-1')!.name
  const picture = screen.getByRole('img', { name: `Town map of ${name}` })
  expect(picture.getAttribute('src')).toBe(
    '/assets/town maps/Harbourne - rich seaside town - LN.jpg'
  )
  // Its own row of the ledger, after both columns; the header keeps no thumbnail.
  expect(picture.closest('.town-picture')?.parentElement).toBe(container.querySelector('.ledger'))
  for (const zone of ['Roads out', 'Talk and work']) {
    const region = screen.getByRole('region', { name: zone })
    expect(region.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
  expect(container.querySelector('.ledger-head img')).toBeNull()
})
