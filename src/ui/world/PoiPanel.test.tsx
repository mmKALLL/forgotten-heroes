// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { formatPercent } from '../../engine/format'
import { exploreOption } from '../../engine/world/explore'
import { settlementName } from '../../engine/world/geo'
import { edgesFrom } from '../../engine/world/graph'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { PlacePanel } from './PlacePanel'
import { PoiPanel } from './PoiPanel'
import { DEFAULT_TRAVEL_PREFS } from './travelPrefs'

const content = fixtureContent()
afterEach(cleanup)

/** The fixture world with these POIs discovered (and cleared), the party at `location`. */
function world(location: string, discovered: string[], cleared: string[] = []): GameState {
  const state = makeState({ location, gold: 50 })
  for (const id of discovered) state.world.pois[id].discovered = true
  for (const id of cleared) state.world.pois[id].cleared = true
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
  show(state)
  expect(screen.getByText('Lair · War camp')).toBeTruthy()
  const threat = content.threats[state.world.lands.farisle.threat].name
  expect(screen.getByText(`Feeds the ${threat}: +2 threat here`)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Enter' })).toBeTruthy()
  expect(screen.queryByText(/A spring here/)).toBeNull()
})

test('a cleared site can’t be visited, and says why', () => {
  show(world('poi-2', ['poi-2'], ['poi-2']))
  expect(screen.getByText('Cleared')).toBeTruthy()
  expect(screen.queryByText(/Feeds the/)).toBeNull()
  const enter = screen.getByRole('button', { name: 'Enter' }) as HTMLButtonElement
  expect(enter.disabled).toBe(true)
  expect(screen.getByText('Redtusk camp has been cleared.')).toBeTruthy()
})

test('rest at a site is camp only, and there is nothing to buy or sell', async () => {
  const { onAction } = show(world('poi-1', ['poi-1']))
  expect(screen.queryByRole('button', { name: /at the inn/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /^(Buy|Sell)/ })).toBeNull()
  expect(screen.getByText(/^Not here: /)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Make camp (rest a day)' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'rest', lodging: false })
})

test('the explore preview shows the searcher, DC, chance, days and the non-critical tiers', async () => {
  const state = world('poi-1', ['poi-1'])
  const option = exploreOption(state, content)!
  const { onAction } = show(state)
  const box = within(screen.getByRole('group', { name: 'Explore the domain' }))
  const name = state.party.find((c) => c.id === option.actorId)!.name
  expect(
    box.getByText(
      new RegExp(`^${name} leads the search for 2 days: \\w+ [+−]\\d+ vs DC ${option.dc}$`)
    )
  ).toBeTruthy()
  const chance = option.chances.partial + option.chances.success + option.chances.critSuccess
  expect(box.getByText(`${formatPercent(chance)} chance to find a site`)).toBeTruthy()
  expect(box.getByRole('img', { name: /Success: / })).toBeTruthy()
  const rows = within(box.getByRole('list', { name: 'What the search finds' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent)
  expect(rows).toEqual([
    expect.stringMatching(/^Success: .*Finds a site$/),
    expect.stringMatching(/^Partial success: .*Finds a site, after 3 days$/),
    expect.stringMatching(/^Failure: .*Finds nothing$/),
  ])
  // Critical tiers stay a surprise, and so does whether anything is left to find.
  expect(box.getByRole('list', { name: 'What the search finds' }).textContent).not.toMatch(
    /Critical|picked clean|Two/
  )
  await userEvent.click(box.getByRole('button', { name: 'Explore (2 days)' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'explore' })
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
  await userEvent.click(screen.getByRole('button', { name: 'Explore (2 days)' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'explore' })
})

test('a site with no path from here is described, but can’t be travelled to', () => {
  show(world('greenvale-1', ['poi-2']), 'poi-2', PlacePanel)
  expect(screen.getByText('Lair · War camp')).toBeTruthy()
  expect(screen.getByText('Redtusk camp is more than one road away.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Travel' })).toBeNull()
})
