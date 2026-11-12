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

const content = fixtureContent()
afterEach(cleanup)

test('the ledger shows the header line, its zones, Explore after the roads, talk and work, and the people', async () => {
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
  // Explore is one line after the roads, without an odds bar; its tiers are its description.
  const explore = within(zones[2]).getByRole('group', { name: 'Explore the domain' })
  expect(within(explore).queryByRole('img')).toBeNull()
  expect(explore.textContent).toMatch(/vs DC \d+ · \d+% to find a site/)
  const button = within(explore).getByRole('button', { name: /^Explore \(/ })
  expect(button.getAttribute('aria-describedby')).toBeTruthy()
  await userEvent.click(button)
  expect(onAction).toHaveBeenCalledWith({ type: 'explore' })
  // The party’s standing here is in the header; talk and work follow the roads.
  expect(screen.getByText('Standing:').textContent).toBe('Standing: stranger')
  const talk = within(screen.getByRole('region', { name: 'Talk and work' }))
  expect(talk.getByRole('group', { name: 'Listen for rumours' })).toBeTruthy()
  expect(talk.getByRole('region', { name: 'Notice board' })).toBeTruthy()
  // People are collapsed until opened.
  const people = peopleRows(state, content)
  const summary = screen.getByText(`People (${people.length})`)
  expect(summary.closest('details')!.open).toBe(false)
  for (const p of people) expect(screen.getByText(p.name, { exact: false })).toBeTruthy()
})
