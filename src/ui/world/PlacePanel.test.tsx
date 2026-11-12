// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { placeInfo, routeOptions } from '../../engine/travel/preview'
import { brom, fixtureContent, lyra, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import { provisionPlan } from '../../engine/town/provision'
import { I18nProvider, LANGUAGE_KEY } from '../i18n/I18n'
import { PlacePanel } from './PlacePanel'
import { DEFAULT_TRAVEL_PREFS } from './travelPrefs'
import { REINHABIT_DAYS } from '../../engine/constants'

const content = fixtureContent()
afterEach(cleanup)

/** The panel with its travel choices held as App holds them. */
function Panel(props: Omit<ComponentProps<typeof PlacePanel>, 'prefs' | 'onPrefs'>) {
  const [prefs, setPrefs] = useState(DEFAULT_TRAVEL_PREFS)
  return <PlacePanel {...props} prefs={prefs} onPrefs={setPrefs} />
}

const panel = (
  state = makeState({ location: 'ashmoor-1', gold: 50 }),
  selected: string | null,
  c = content
) => {
  const onAction = vi.fn()
  const onSelect = vi.fn()
  const view = render(
    <Panel content={c} state={state} selected={selected} onSelect={onSelect} onAction={onAction} />
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
    <Panel
      content={content}
      state={state}
      selected="greenvale-2"
      onSelect={onSelect}
      onAction={onAction}
    />
  )
  const steady = routeOptions(state, content)
    .find((r) => r.to === 'greenvale-2')!
    .paces.find((p) => p.pace === 'steady')!
  expect(
    road(greenvale2).getByText(
      `2–4 encounters · about ${Math.round(steady.hostile.share * 100)}% of them hostile`
    )
  ).toBeTruthy()
  expect(road(greenvale2).getByText(/^Hostile share: 10% base, .*\+10% foraging$/)).toBeTruthy()
  expect(road(greenvale2).getByText(/forages each day: Survival/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }))
  expect(onAction).toHaveBeenCalledWith({
    type: 'travel',
    routeId: 'ashmoor-1-greenvale-2',
    pace: 'steady',
    forage: true,
  })
  expect(onSelect).toHaveBeenLastCalledWith(null)
})

test('the pace changes the days, supplies, encounters and warnings shown', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  const { onAction } = panel(state, 'greenvale-2')
  const paces = routeOptions(state, content).find((r) => r.to === 'greenvale-2')!.paces
  const at = (pace: string) => paces.find((p) => p.pace === pace)!
  const group = road(settlementName(state, 'greenvale-2'))
  const pacePicker = within(group.getByRole('group', { name: 'Pace' }))
  expect(pacePicker.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Stealthy',
    'Cautious',
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

  await userEvent.click(pacePicker.getByRole('button', { name: 'Stealthy' }))
  expect(group.getByText(`About ${at('stealthy').days} days on the road`)).toBeTruthy()
  // Foraging gives covered tracks away; the toggle says so.
  expect(group.getByText('Ambushes meet the party on normal footing')).toBeTruthy()
  const covered = at('stealthy')
  const forage = group.getByRole('checkbox', { name: 'Forage along the way' })
  expect(forage.getAttribute('aria-describedby')).toBeTruthy()
  expect(
    group.getByText(
      `Foraging draws attention: about ${Math.round(covered.forageTradeOff!.foraging.hostile * 100)}% ` +
        `of encounters hostile instead of ` +
        `${Math.round(covered.forageTradeOff!.notForaging.hostile * 100)}%; ` +
        'covered tracks give ambushes no Edge'
    )
  ).toBeTruthy()
  await userEvent.click(forage)
  expect(group.getByText('Ambushes meet the party with Edge')).toBeTruthy()
  expect(group.getByText(/^Hostile share: 10% base, .*−\d+% stealthy$/)).toBeTruthy()
  expect(group.queryByText(/A forced march/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'travel',
    routeId: 'ashmoor-1-greenvale-2',
    pace: 'stealthy',
    forage: false,
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

test('the hire toggle changes the days and cost shown, and travels mounted', async () => {
  const state = makeState({ location: 'greenvale-1', gold: 100 })
  const { onAction } = panel(state, 'greenvale-2')
  const road = routeOptions(state, content).find((r) => r.to === 'greenvale-2')!
  const foot = road.paces.find((p) => p.pace === 'steady')!
  const ridden = road.mounted!.paces.find((p) => p.pace === 'steady')!
  const group = within(screen.getByRole('group', { name: /^To / }))
  expect(group.getByText(`About ${foot.days} days on the road`)).toBeTruthy()
  const hire = group.getByRole('checkbox', { name: /^Hire 2 × Riding horse/ })
  expect(hire.closest('label')!.textContent).toMatch(
    `${ridden.days} days instead of ${foot.days} days, ${ridden.cost} gp`
  )
  await userEvent.click(hire)
  expect(group.getByText(`About ${ridden.days} days on the road`)).toBeTruthy()
  expect(group.getByText(new RegExp(`^Hired mounts: ${ridden.cost} gp`))).toBeTruthy()
  await userEvent.click(group.getByRole('button', { name: 'Travel' }))
  expect(onAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'travel', routeId: road.routeId, hire: true })
  )
})

test('provision for this road shows its cost and dispatches for the shown pace', async () => {
  const state = makeState({ location: 'greenvale-1', gold: 100, goods: { food: 0, water: 8 } })
  const { onAction } = panel(state, 'greenvale-2')
  const routeId = 'greenvale-1-greenvale-2'
  const plan = provisionPlan(state, content, { routeId, pace: 'steady' })!
  const group = within(screen.getByRole('group', { name: /^To / }))
  await userEvent.click(
    group.getByRole('button', { name: `Provision: ${plan.food} food · ${plan.total} gp` })
  )
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'provision',
    routeId,
    pace: 'steady',
  })
})

test('a settlement further away is described, but has no road from here', () => {
  const state = makeState({ location: 'greenvale-1', gold: 50 })
  panel(state, 'farisle-1')
  const name = settlementName(state, 'farisle-1')
  expect(screen.getByText(`${name} is more than one road away.`)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Travel' })).toBeNull()
})

test('the settlement has one type label, with its size in the tooltip', () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  panel(state, null)
  const info = placeInfo(state, content, 'ashmoor-1')!
  const summary = screen.getByText(
    new RegExp(`^${info.typeName}, about ${info.population} people( · seat of the realm)?$`)
  )
  expect(summary.getAttribute('title')).toBe(`Size: ${info.sizeLabel}`)
})

test('foraging lists what success, partial and failure find, with their d20 faces', () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  panel(state, 'greenvale-2')
  const steady = routeOptions(state, content)
    .find((r) => r.to === 'greenvale-2')!
    .paces.find((p) => p.pace === 'steady')!
  const found = steady.forage!.outcomes
  const list = road(settlementName(state, 'greenvale-2')).getByRole('list', {
    name: 'What foraging finds each day',
  })
  const rows = within(list).getAllByRole('listitem')
  expect(rows.map((r) => r.textContent)).toEqual([
    expect.stringMatching(new RegExp(`^Success: \\d+–\\d+Finds ${found.success.water} water$`)),
    expect.stringMatching(
      new RegExp(`^Partial success: \\d+–\\d+Finds ${found.partial.water} water$`)
    ),
    expect.stringMatching(/^Failure: \d+–\d+Finds nothing$/),
  ])
  // The critical tiers (a critical success finds food too) stay a surprise.
  expect(list.textContent).not.toMatch(/Critical|food/)
})

test('stowing away lists what success, partial and failure lead to', () => {
  const state = makeState({ location: 'ashmoor-1', gold: 5 })
  panel(state, 'farisle-1')
  const list = road(settlementName(state, 'farisle-1')).getByRole('list', {
    name: 'If the party stows away',
  })
  const rows = within(list).getAllByRole('listitem')
  expect(rows).toHaveLength(3)
  expect(rows[0].textContent).toMatch(/^Success: \d+–\d+Slips aboard unseen$/)
  expect(rows[1].textContent).toMatch(
    /^Partial success: \d+–\d+Caught, and put to work for the passage: \d+ days lost, and \w+ gains a level of exhaustion$/
  )
  expect(rows[2].textContent).toMatch(/fined all the party’s coin \(5 gp\)$/)
  expect(list.textContent).not.toMatch(/brawl/i)
})

test('a forced march that could kill someone gets a severe warning, listed first', async () => {
  const long = structuredClone(content)
  long.routes['greenvale-1-greenvale-2'].km = 180
  const frail = { ...lyra, exhaustion: 2, abilities: { ...lyra.abilities, con: 1 } }
  const state = makeState({ location: 'greenvale-1', party: [brom, frail], gold: 50 })
  panel(state, 'greenvale-2', long)
  const group = road(settlementName(state, 'greenvale-2'))
  await userEvent.click(
    within(group.getByRole('group', { name: 'Pace' })).getByRole('button', { name: 'Forced march' })
  )
  const items = within(group.getByRole('list', { name: 'Warnings' })).getAllByRole('listitem')
  expect(items[0].className).toBe('severe')
  expect(items[0].textContent).toMatch(/^☠ A forced march of 4 days could kill Lyra/)
  for (const other of items.slice(1)) {
    expect(other.className).toBe('')
    expect(other.textContent).toMatch(/^⚠ /)
  }
})

/**
 * The fixture world with one extra lair in Mirefold's domain (ashmoor-1), found or not, and
 * inhabited since day 1 or cleared today.
 */
const withLair = (discovered: boolean, cleared = false) => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  state.world.pois['poi-9'] = {
    type: 'orc-war-camp',
    category: 'lair',
    spot: 'spot-0009',
    domain: 'ashmoor-1',
    name: 'Bonepile camp',
    threat: 2,
    discovered,
    clearedDay: cleared ? state.day : state.day - REINHABIT_DAYS,
    boonDay: null,
  }
  return state
}

test('shows the land, the domain and the kingdom, with the domain’s threat', () => {
  const state = makeState({ location: 'greenvale-1', gold: 50 })
  panel(state, null)
  const info = placeInfo(state, content, 'greenvale-1')!
  const kingdom = state.world.kingdoms.find((k) => k.domains.includes('greenvale-1'))!
  const realm = `Greenvale · domain of ${info.name} · ${kingdom.name} (${info.rulerAncestry} rule)`
  expect(screen.getByText(info.seat ? `${realm} · seat of the realm` : realm)).toBeTruthy()
  expect(
    screen.getByText(
      `Threat: ${info.threatName} (${['Held', 'Stirring', 'Rising', 'Rampant'][info.threatLevel]})`
    )
  ).toBeTruthy()
})

test('the lair note appears only for a discovered, inhabited lair in the domain', () => {
  const { unmount } = panel(withLair(false), null)
  expect(screen.queryByText(/from lairs/)).toBeNull()
  unmount()
  const view = panel(withLair(true), null)
  expect(screen.getByText(/· \+2 from lairs$/)).toBeTruthy()
  view.unmount()
  panel(withLair(true, true), null)
  expect(screen.queryByText(/from lairs/)).toBeNull()
})

test('a settlement elsewhere and a road’s end use the same realm and threat lines', () => {
  const state = makeState({ location: 'greenvale-1', gold: 50 })
  const far = placeInfo(state, content, 'farisle-1')!
  const { unmount } = panel(state, 'farisle-1')
  expect(screen.getByText(new RegExp(`^${far.name}: ${far.typeName}$`))).toBeTruthy()
  expect(screen.getAllByText(new RegExp(`^Far Isle · domain of ${far.name} · `))).toHaveLength(1)
  unmount()
  const next = placeInfo(state, content, 'greenvale-2')!
  panel(state, 'greenvale-2')
  const group = road(next.name)
  expect(group.getByText(new RegExp(`^Greenvale · domain of ${next.name} · `))).toBeTruthy()
  expect(group.getByText(new RegExp(`^${next.typeName} · Threat: ${next.threatName}`))).toBeTruthy()
})

test('in Japanese the realm line is translated, with every placeholder filled', () => {
  localStorage.setItem(LANGUAGE_KEY, 'ja')
  try {
    const state = withLair(true)
    const info = placeInfo(state, content, 'ashmoor-1')!
    const { container } = render(
      <I18nProvider content={content}>
        <Panel
          content={content}
          state={state}
          selected="greenvale-2"
          onSelect={() => {}}
          onAction={() => {}}
        />
      </I18nProvider>
    )
    expect(screen.getByText(new RegExp(`^Ashmoor · ${info.name}の領地 · `))).toBeTruthy()
    expect(screen.getByText(/巣窟から\+2/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\{\w+\}/)
  } finally {
    localStorage.clear()
  }
})
