// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { placeInfo, routeOptions } from '../../engine/travel/preview'
import { restOption } from '../../engine/travel/supplies'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import { PlacePanel } from './PlacePanel'

const content = fixtureContent()
afterEach(cleanup)

const panel = (state = makeState({ location: 'ashmoor-1', gold: 50 }), selected: string | null) => {
  const onAction = vi.fn()
  const onSelect = vi.fn()
  const view = render(
    <PlacePanel
      content={content}
      state={state}
      selected={selected}
      onSelect={onSelect}
      onAction={onAction}
    />
  )
  return { ...view, onAction, onSelect }
}

const road = (name: string) => within(screen.getByRole('group', { name: `To ${name}` }))

test('shows the settlement and its roads; picking a road shows its odds; Travel sets out', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  const { onAction, onSelect, rerender } = panel(state, null)
  const info = placeInfo(state, content, 'ashmoor-1')!
  expect(screen.getByRole('heading', { name: info.name })).toBeTruthy()
  for (const s of info.services) expect(screen.getByText(s.name)).toBeTruthy()
  const roads = within(screen.getByRole('list', { name: 'Roads from here' }))
  expect(roads.getAllByRole('button')).toHaveLength(3)
  const greenvale2 = settlementName(state, 'greenvale-2')
  await userEvent.click(roads.getByRole('button', { name: greenvale2 }))
  expect(onSelect).toHaveBeenCalledWith('greenvale-2')

  rerender(
    <PlacePanel
      content={content}
      state={state}
      selected="greenvale-2"
      onSelect={onSelect}
      onAction={onAction}
    />
  )
  expect(road(greenvale2).getByText(/2–4 encounters likely/)).toBeTruthy()
  expect(road(greenvale2).getByText(/forages each day: Survival/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }))
  expect(onAction).toHaveBeenCalledWith({
    type: 'travel',
    routeId: 'ashmoor-1-greenvale-2',
    pace: 'steady',
    coverTracks: false,
    forage: true,
  })
  expect(onSelect).toHaveBeenLastCalledWith(null)
})

test('the pace changes the days, supplies, encounters and warnings shown', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  const { onAction } = panel(state, 'greenvale-2')
  const paces = routeOptions(state, content).find((r) => r.to === 'greenvale-2')!.paces
  const at = (pace: string, cover = false) =>
    paces.find((p) => p.pace === pace && p.coverTracks === cover)!
  const group = road(settlementName(state, 'greenvale-2'))
  const pacePicker = within(group.getByRole('group', { name: 'Pace' }))
  expect(pacePicker.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Cautious',
    'Cautious, covering tracks',
    'Steady',
    'Brisk',
    'Forced march',
  ])
  expect(pacePicker.getByRole('button', { name: 'Steady' }).getAttribute('aria-pressed')).toBe(
    'true'
  )
  expect(group.getByText(`About ${at('steady').days} days on the road`)).toBeTruthy()

  await userEvent.click(pacePicker.getByRole('button', { name: 'Forced march' }))
  const forced = at('forced')
  expect(forced.days).toBeLessThan(at('steady').days)
  expect(group.getByText(`About ${forced.days} days on the road`)).toBeTruthy()
  expect(group.getByText(new RegExp(`^Food: ${Math.ceil(forced.food.needed)} needed`))).toBeTruthy()
  const warnings = within(group.getByRole('list', { name: 'Warnings' }))
  expect(warnings.getByText(/A forced march of \d+ days \(CON DC \d+ each day\)/)).toBeTruthy()
  expect(group.getByText('Ambushes meet the party Exposed')).toBeTruthy()

  await userEvent.click(pacePicker.getByRole('button', { name: 'Cautious, covering tracks' }))
  expect(group.getByText(`About ${at('cautious', true).days} days on the road`)).toBeTruthy()
  expect(group.getByText('Ambushes meet the party with Edge')).toBeTruthy()
  expect(group.getByText(/^Steers clear of \d+% of hostile encounters$/)).toBeTruthy()
  expect(group.queryByText(/A forced march/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'travel',
    routeId: 'ashmoor-1-greenvale-2',
    pace: 'cautious',
    coverTracks: true,
    forage: true,
  })
})

test('a long road without enough water warns before the party commits', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50, goods: { food: 2, water: 2 } })
  panel(state, 'greenvale-2')
  const group = road(settlementName(state, 'greenvale-2'))
  await userEvent.click(group.getByRole('checkbox', { name: 'Forage along the way' }))
  const warnings = within(group.getByRole('list', { name: 'Warnings' }))
  expect(warnings.getByText(/^⚠ Water runs out on day \d+ \(\d+ days? without\)\.$/)).toBeTruthy()
  expect(warnings.getByText(/^⚠ Not enough food for the journey/)).toBeTruthy()
})

test('a crossing the party can’t afford says why, and offers to stow away with the odds', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 5 })
  const { onAction } = panel(state, 'farisle-1')
  const group = road(settlementName(state, 'farisle-1'))
  expect(group.getByText('Passage costs 12 gp.')).toBeTruthy()
  expect((group.getByRole('button', { name: 'Travel' }) as HTMLButtonElement).disabled).toBe(true)
  const pacePicker = within(group.getByRole('group', { name: 'Pace' }))
  expect(pacePicker.getAllByRole('button').map((b) => b.textContent)).toEqual(['Steady'])
  expect(group.getByText('At sea the ship sets the pace.')).toBeTruthy()
  expect(group.queryByRole('checkbox', { name: 'Forage along the way' })).toBeNull()
  expect(group.getByText(/sneaks the party aboard: Stealth [+−]\d+ vs DC \d+/)).toBeTruthy()
  expect(group.getByRole('img', { name: /Success: / })).toBeTruthy()
  await userEvent.click(group.getByRole('button', { name: 'Stow away' }))
  expect(onAction).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'travel', routeId: 'ashmoor-1-farisle-1', stowaway: true })
  )
})

test('rest shows the inn’s price or carried food; buying and selling dispatch', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 20, waterskins: 1 })
  const { onAction, unmount } = panel(state, null)
  const cost = restOption(state).lodgingCost
  await userEvent.click(
    screen.getByRole('button', { name: `Rest a day at the inn (${cost} gp, meals included)` })
  )
  expect(onAction).toHaveBeenCalledWith({ type: 'rest' })
  await userEvent.click(screen.getByRole('button', { name: 'Rest a day, eating carried food' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'rest', lodging: false })
  await userEvent.click(screen.getByRole('button', { name: /^Buy 5 rations/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyFood', amount: 5 })
  await userEvent.click(screen.getByRole('button', { name: /^Buy a waterskin/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyWaterskin', count: 1 })
  await userEvent.click(screen.getByRole('button', { name: /^Sell 5 rations/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellSupplies', food: 5 })
  await userEvent.click(screen.getByRole('button', { name: /^Sell a waterskin/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellSupplies', waterskins: 1 })
  unmount()

  panel(makeState({ location: 'ashmoor-1', gold: 0 }), null)
  expect(screen.queryByRole('button', { name: /at the inn/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Rest a day, eating carried food' })).toBeTruthy()
})

test('a settlement further away is described, but has no road from here', () => {
  const state = makeState({ location: 'greenvale-1', gold: 50 })
  panel(state, 'farisle-1')
  const name = settlementName(state, 'farisle-1')
  expect(screen.getByText(`${name} is more than one road away.`)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Travel' })).toBeNull()
})
