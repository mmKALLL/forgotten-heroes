// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { LEDGER_TAB_KEY } from '../town/TownLedger'
import { exploreOption } from '../../engine/world/explore'
import { settlementName } from '../../engine/world/geo'
import { edgesFrom } from '../../engine/world/graph'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { PlacePanel } from './PlacePanel'
import { PoiPanel } from './PoiPanel'
import { DEFAULT_TRAVEL_PREFS } from './travelPrefs'
import { POWER_STEP_DAYS, REINHABIT_DAYS } from '../../engine/constants'

const content = fixtureContent()
afterEach(cleanup)
// These tests are about the roads out: open the ledger's Travel tab.
beforeEach(() => localStorage.setItem(LEDGER_TAB_KEY, 'travel'))

/** The fixture world with these POIs discovered (and cleared), the party at `location`. */
function world(location: string, discovered: string[], cleared: string[] = []): GameState {
  const state = makeState({ location, gold: 50 })
  for (const id of discovered) state.world.pois[id].discovered = true
  for (const id of cleared) state.world.pois[id].clearedDay = state.day
  return state
}

/** A panel with its travel choices held as App holds them (both panels take the same props). */
function Holder({
  as: Panel,
  ...props
}: { as: typeof PoiPanel | typeof PlacePanel } & Omit<
  ComponentProps<typeof PoiPanel>,
  'prefs' | 'onPrefs'
>) {
  const [prefs, setPrefs] = useState(DEFAULT_TRAVEL_PREFS)
  return <Panel {...props} prefs={prefs} onPrefs={setPrefs} />
}

function show(
  state: GameState,
  selected: string | null = null,
  as: typeof PoiPanel | typeof PlacePanel = PoiPanel
) {
  const onAction = vi.fn()
  const onSelect = vi.fn()
  const view = render(
    <Holder
      as={as}
      content={content}
      state={state}
      selected={selected}
      onSelect={onSelect}
      onAction={onAction}
    />
  )
  return { ...view, onAction, onSelect }
}

const kingdomOf = (state: GameState, domain: string) =>
  state.world.kingdoms.find((k) => k.domains.includes(domain))!.name

test('a site shows its type, owner and water; Visit plays it', async () => {
  // Old Wen’s hut (poi-1): an herbalist with a spring, in Mirefold’s domain (ashmoor-1).
  const state = world('poi-1', ['poi-1'])
  const { onAction } = show(state)
  const panel = within(screen.getByRole('region', { name: 'Site' }))
  expect(panel.getByRole('heading', { name: 'Old Wen’s hut' })).toBeTruthy()
  expect(panel.getByText('Expert · Herbalist')).toBeTruthy()
  const domain = settlementName(state, 'ashmoor-1')
  expect(
    panel.getByText(`Ashmoor · domain of ${domain}, ${kingdomOf(state, 'ashmoor-1')}`)
  ).toBeTruthy()
  expect(panel.getByText('A spring here: arriving refills the waterskins.')).toBeTruthy()
  expect(panel.queryByText(/Feeds the/)).toBeNull()
  await userEvent.click(panel.getByRole('button', { name: 'Visit' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'visitPoi' })
})

test('a lair says what it feeds, is entered, and has no spring', () => {
  // Redtusk camp (poi-2): a war camp adding 2 to Ashstone’s domain (farisle-1), held by bandits.
  const state = world('poi-2', ['poi-2'])
  // Taken again today, so it is inhabited whatever its cycle.
  state.world.pois['poi-2'].clearedDay = state.day - REINHABIT_DAYS
  show(state)
  expect(screen.getByText('Re-inhabited: something has moved in again.')).toBeTruthy()
  expect(screen.getByText('Lair · War camp')).toBeTruthy()
  const threat = content.threats[state.world.lands.farisle.threat].name
  expect(screen.getByText(`Feeds the ${threat}: +2 threat here`)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Enter' })).toBeTruthy()
  expect(screen.queryByText(/A spring here/)).toBeNull()
})

test('a hostile site that isn’t the land’s threat is a danger of its own', () => {
  const state = world('poi-2', ['poi-2'])
  state.world.pois['poi-2'].clearedDay = state.day - REINHABIT_DAYS
  const apart = structuredClone(content)
  apart.poiTypes['orc-war-camp'].threats = []
  render(
    <Holder
      as={PoiPanel}
      content={apart}
      state={state}
      selected={null}
      onSelect={vi.fn()}
      onAction={vi.fn()}
    />
  )
  expect(screen.getByText('A danger of its own: +2 threat here')).toBeTruthy()
  expect(screen.queryByText(/Feeds the/)).toBeNull()
})

test('a cleared site lies empty, can’t be visited, and says why', () => {
  show(world('poi-2', ['poi-2'], ['poi-2']))
  expect(screen.getByText('Cleared today: it lies empty for now.')).toBeTruthy()
  expect(screen.queryByText(/Feeds the/)).toBeNull()
  const enter = screen.getByRole('button', { name: 'Enter' }) as HTMLButtonElement
  expect(enter.disabled).toBe(true)
  // Said once, in the summary: no second "lies empty" line by the button.
  expect(screen.queryByText('Redtusk camp lies empty for now.')).toBeNull()
})

test('a site already visited since arriving can’t be visited again, and says why', () => {
  show({ ...world('poi-1', ['poi-1']), visited: true })
  const visit = screen.getByRole('button', { name: 'Visit' }) as HTMLButtonElement
  expect(visit.disabled).toBe(true)
  expect(
    screen.getByText('You have already visited Old Wen’s hut. Leave and come back another time.')
  ).toBeTruthy()
})

test('a lair grown strong says so', () => {
  const state = world('poi-2', ['poi-2'])
  state.world.pois['poi-2'].clearedDay = state.day - REINHABIT_DAYS
  show({ ...state, day: state.day + POWER_STEP_DAYS })
  expect(screen.getByText('Growing stronger: every check here is DC +1.')).toBeTruthy()
})

test('rest at a site is camp only, and there is nothing to buy or sell', async () => {
  const { onAction } = show(world('poi-1', ['poi-1']))
  expect(screen.queryByRole('button', { name: /at the inn/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /^(Buy|Sell)/ })).toBeNull()
  expect(screen.getByText(/^Not here: /)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Make camp (rest a day)' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'rest', lodging: false })
})

test('the explore preview shows the searcher, DC, days and the non-critical tiers with their chances', async () => {
  const state = world('poi-1', ['poi-1'])
  const option = exploreOption(state, content)!
  const { onAction } = show(state)
  const box = within(screen.getByRole('group', { name: 'Explore the domain' }))
  const name = state.party.find((c) => c.id === option.actorId)!.name
  expect(box.getByText(new RegExp(`^${name}, \\w+ [+−]\\d+ vs DC ${option.dc}$`))).toBeTruthy()
  // Outcome lines, never an odds bar (design §9).
  expect(box.queryByRole('img', { name: /Success: / })).toBeNull()
  const rows = within(box.getByRole('list', { name: 'What the search finds' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent)
  expect(rows).toEqual([
    expect.stringMatching(/^Success: .*Finds a site$/),
    expect.stringMatching(/^Partial success: .*Finds a site, but \+1 day$/),
    expect.stringMatching(/^Failure: .*Finds nothing$/),
  ])
  // Critical tiers stay a surprise.
  expect(box.getByRole('list', { name: 'What the search finds' }).textContent).not.toMatch(
    /Critical|Two/
  )
  await userEvent.click(box.getByRole('button', { name: /^Explore \(2 days · −\d+ food\)$/ }))
  expect(onAction).toHaveBeenCalledWith({ type: 'explore' })
})

test('a domain known to be fully explored shows only that, no search', () => {
  const state = world('poi-1', ['poi-1'])
  for (const p of Object.values(state.world.pois)) p.discovered = true
  // Known only once a search came up short: until then Explore is offered as usual.
  show(state)
  expect(screen.getByRole('button', { name: /^Explore \(2 days · −\d+ food\)$/ })).toBeTruthy()
  cleanup()
  show({ ...state, explored: ['ashmoor-1'] })
  const box = within(screen.getByRole('group', { name: 'Explore the domain' }))
  expect(box.getByText('This area is already fully explored.')).toBeTruthy()
  expect(box.queryByRole('button')).toBeNull()
  expect(box.queryByRole('list')).toBeNull()
})

test('the paths out are listed with their previews, and Travel takes the chosen one', async () => {
  const state = world('poi-1', ['poi-1'])
  const paths = edgesFrom(state, content, 'poi-1')
  const { onSelect, onAction, rerender } = show(state)
  const roads = within(screen.getByRole('list', { name: 'Roads from here' }))
  expect(roads.getAllByRole('button')).toHaveLength(paths.length)
  const home = settlementName(state, 'ashmoor-1')
  const path = paths.find((p) => p.to === 'ashmoor-1')!
  expect(roads.getByText(new RegExp(`^${path.km} km · `))).toBeTruthy()
  await userEvent.click(roads.getByRole('button', { name: home }))
  expect(onSelect).toHaveBeenCalledWith('ashmoor-1')

  rerender(
    <Holder
      as={PoiPanel}
      content={content}
      state={state}
      selected="ashmoor-1"
      onSelect={onSelect}
      onAction={onAction}
    />
  )
  const road = within(screen.getByRole('group', { name: `To ${home}` }))
  expect(road.getByText(/on the road$/)).toBeTruthy()
  await userEvent.click(road.getByRole('button', { name: 'Travel' }))
  expect(onAction).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'travel', routeId: path.id })
  )
})

test('the panel is keyboard-operable', async () => {
  const { onAction } = show(world('poi-1', ['poi-1']))
  await userEvent.tab()
  expect(document.activeElement?.textContent).toBe('Visit')
  await userEvent.keyboard('{Enter}')
  expect(onAction).toHaveBeenCalledWith({ type: 'visitPoi' })
  await userEvent.tab()
  expect(document.activeElement?.textContent).toBe('Make camp (rest a day)')
  await userEvent.keyboard(' ')
  expect(onAction).toHaveBeenLastCalledWith({ type: 'rest', lodging: false })
})

test('a settlement lists the paths to its discovered sites with a badge, and can explore', async () => {
  const state = world('ashmoor-1', ['poi-1'])
  const path = edgesFrom(state, content, 'ashmoor-1').find((r) => r.from === 'poi-1')!
  const { onAction } = show(state, 'poi-1', PlacePanel)
  const roads = within(screen.getByRole('list', { name: 'Roads from here' }))
  const item = roads.getByRole('button', { name: 'Old Wen’s hut' }).closest('li')!
  expect(within(item).getByText('site')).toBeTruthy()
  expect(item.textContent).toMatch(new RegExp(`${path.km} km`))
  // The chosen path describes the site at its end.
  const road = within(screen.getByRole('group', { name: 'To Old Wen’s hut' }))
  expect(road.getByText('Expert · Herbalist')).toBeTruthy()
  expect(road.getByText(/A spring here/)).toBeTruthy()
  await userEvent.click(road.getByRole('button', { name: 'Travel' }))
  expect(onAction).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'travel', routeId: path.id })
  )
  await userEvent.click(screen.getByRole('button', { name: /^Explore \(2 days · −\d+ food\)$/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'explore' })
})

test('a site with no path from here is described, but can’t be travelled to', () => {
  show(world('greenvale-1', ['poi-2']), 'poi-2', PlacePanel)
  expect(screen.getByText('Lair · War camp')).toBeTruthy()
  expect(screen.getByText('Redtusk camp is more than one road away.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Travel' })).toBeNull()
})
