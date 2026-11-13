// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { Content } from '../../content/build'
import { brom, fixtureContent, lyra, makeState } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { I18nProvider } from '../i18n/I18n'
import { accessoryOffers, describeAccessory } from '../../engine/gear/accessories'
import { describeHook } from '../../engine/gear/hooks'
import { recruitOffers } from '../../engine/town/recruits'
import { ServicesPanel } from './ServicesPanel'
import { HEALER_PRICE } from '../../engine/constants'

/** The fixture with a temple that heals and blesses, and a courier. */
const content: Content = (() => {
  const c = structuredClone(fixtureContent())
  const role = (id: string, fn: 'temple' | 'hire', actions: string[]) => ({
    id,
    function: fn,
    trades: [],
    buysOnly: [],
    actions,
    source: 'claude' as const,
    file: 'test',
  })
  c.serviceRoles.temple = role('temple', 'temple', ['heal', 'bless']) as never
  c.serviceRoles.couriers = role('couriers', 'hire', ['news']) as never
  return c
})()
afterEach(cleanup)

const SERVICES = [
  'inn-tavern',
  'animals-mounts',
  'jewelry-trader',
  'magic-items',
  'temple',
  'couriers',
]

function town(overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location: 'greenvale-1', gold: 100, ...overrides })
  const here = { ...s.world.settlements['greenvale-1'], services: SERVICES }
  return {
    ...s,
    world: { ...s.world, settlements: { ...s.world.settlements, 'greenvale-1': here } },
  }
}

const panel = (state: GameState) => {
  const onAction = vi.fn()
  render(
    <I18nProvider content={content}>
      <ServicesPanel content={content} state={state} onAction={onAction} />
    </I18nProvider>
  )
  return onAction
}

test('tiles are grouped by function; an unsupported service shows "coming later"', () => {
  panel(town())
  const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
  expect(groups).toEqual(['Trade', 'Rest & Recovery', 'Hire & Contracts', 'Temple & Arcane'])
  const magic = screen.getByRole('region', { name: 'Magic items' })
  expect(within(magic).getByText('coming later')).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Jewelry trader' })).getByText(/^Trades gems/))
})

test('rooms, a round, the healer, a blessing, news and animals dispatch their actions', async () => {
  // Late enough that a courier's news is fresher than any prices the party knows.
  const hurt = town({ party: [{ ...brom, hp: 5 }, lyra], animals: { mule: 1 }, day: 20 })
  const onAction = panel(hurt)
  const inn = within(screen.getByRole('region', { name: 'Inn/Tavern' }))
  await userEvent.click(inn.getByRole('button', { name: /^Common · \d+ gp$/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'rest', lodging: 'common' })
  const round = inn.getByRole('button', { name: /^Stand a round · \d+ gp$/ })
  expect(round.getAttribute('title')).toMatch(/^Drinks for everyone: \+\d+ camaraderie/)
  await userEvent.click(round)
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'inn-tavern',
    action: 'round',
  })

  const heal = screen.getByRole('button', { name: `Heal 1 · ${HEALER_PRICE} gp` })
  expect(heal.getAttribute('title')).toMatch(/for Brom,/)
  await userEvent.click(heal)
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'temple',
    action: 'heal',
  })
  await userEvent.click(screen.getByRole('button', { name: /^Blessing · \d+ gp$/ }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'temple',
    action: 'bless',
  })

  const from = screen.getByRole('combobox', { name: 'News from' }) as HTMLSelectElement
  await userEvent.selectOptions(from, from.options[1].value)
  await userEvent.click(screen.getByRole('button', { name: /^News · \d+ gp$/ }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'couriers',
    action: 'news',
    settlement: from.options[1].value,
  })

  const stable = within(screen.getByRole('region', { name: 'Animals & mounts' }))
  expect(stable.getByText('+100 kg')).toBeTruthy()
  // The price is in the picker ("Mule · 10 gp"); the button doesn't repeat it.
  await userEvent.click(stable.getByRole('button', { name: 'Buy' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyAnimal', animal: 'mule' })
  await userEvent.click(stable.getByRole('button', { name: /^Sell \(1\)/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellAnimal', animal: 'mule' })
})

test('the healer is disabled when no one needs healing, and resting on carried food dispatches', async () => {
  const onAction = panel(town())
  expect(
    (screen.getByRole('button', { name: `Heal · ${HEALER_PRICE} gp each` }) as HTMLButtonElement)
      .disabled
  ).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Rest a day, eating carried food' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'rest', lodging: false })
})

test('the inn leaves its rumours and notice board to their own lines in the talk zone', () => {
  panel(town())
  const inn = within(screen.getByRole('region', { name: 'Inn/Tavern' }))
  expect(inn.queryByText(/Rumours here|^Board: /)).toBeNull()
  expect(inn.queryByRole('button', { name: 'Take' })).toBeNull()
})

test('the inn opens its recruits in place of the tiles; Hire dispatches hireRecruit', async () => {
  const state = town()
  const offers = recruitOffers(state, content, 'greenvale-1')
  expect(offers.length).toBeGreaterThan(0)
  const onAction = panel(state)
  const inn = within(screen.getByRole('region', { name: 'Inn/Tavern' }))
  await userEvent.click(inn.getByRole('button', { name: `Recruits (${offers.length})` }))
  const list = within(screen.getByRole('region', { name: 'Recruits · Inn/Tavern' }))
  expect(screen.queryByRole('region', { name: 'Inn/Tavern' })).toBeNull()
  const first = within(list.getByRole('listitem', { name: offers[0].character.name }))
  expect(first.getByText(new RegExp(`^level ${offers[0].level} `))).toBeTruthy()
  await userEvent.click(first.getByRole('button', { name: /^Hire · \d+ gp$/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'hireRecruit', offerId: offers[0].id })
  expect(document.activeElement).toBe(list.getByRole('heading', { name: 'Recruits · Inn/Tavern' }))
  await userEvent.keyboard('{Escape}')
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: `Recruits (${offers.length})` })
  )
})

test('with no one looking for work, the inn leaves out its Recruits opener', () => {
  const ids = recruitOffers(town(), content, 'greenvale-1').map((o) => o.id)
  panel(town({ recruitsTaken: ids }))
  const inn = within(screen.getByRole('region', { name: 'Inn/Tavern' }))
  expect(inn.queryByRole('button', { name: /^Recruits/ })).toBeNull()
})

test("a recruit's old wound and the gear they bring are shown", async () => {
  // An offer with a wound or gear, whose name no other offer that week shares.
  const pick = (d: number) => {
    const all = recruitOffers(town({ day: d }), content, 'greenvale-1')
    const named = (o: (typeof all)[number]) =>
      all.filter((x) => x.character.name === o.character.name).length === 1
    return all.find((o) => (o.wound || o.gear) && named(o))
  }
  const day = Array.from({ length: 80 }, (_, w) => w * 7 + 1).find((d) => pick(d))!
  const offer = pick(day)!
  panel(town({ day }))
  await userEvent.click(screen.getByRole('button', { name: /^Recruits \(\d\)$/ }))
  const row = within(screen.getByRole('listitem', { name: offer.character.name }))
  const label = offer.character.oldWounds.length > 1 ? 'Old wounds' : 'Old wound'
  if (offer.wound) expect(row.getByText(`${label}: ${offer.wound}`)).toBeTruthy()
  // The accessory alone: no "Brings", no price (designer call).
  if (offer.gear) {
    expect(row.getByText(describeAccessory(offer.gear))).toBeTruthy()
    expect(row.queryByText(/Brings|\(\+\d+ gp\)/)).toBeNull()
  }
})

test('a recruit the party cannot afford is disabled with the reason inline', async () => {
  const onAction = panel(town({ gold: 0 }))
  await userEvent.click(screen.getByRole('button', { name: /^Recruits \(\d\)$/ }))
  const hire = screen.getAllByRole('button', { name: /^Hire/ })[0]
  await userEvent.click(hire)
  expect(onAction).not.toHaveBeenCalled()
  expect(hire.getAttribute('aria-disabled')).toBe('true')
  // The reason is inline and announced with the button.
  const why = document.getElementById(hire.getAttribute('aria-describedby') ?? '')
  // The price is on the button: the reason doesn't repeat it.
  expect(why?.textContent).toBe('not enough gold')
})

test('the accessory shop lists offers with their hooks and the gear to sell', async () => {
  const worn = { id: 'old-ring', name: 'Old Ring', tier: 1 as const, hooks: [], value: 9 }
  const state = town({ gear: [worn] })
  const offers = accessoryOffers(state, content, 'greenvale-1')
  expect(offers.length).toBeGreaterThan(0)
  const onAction = panel(state)
  await userEvent.click(screen.getByRole('button', { name: `Accessories (${offers.length})` }))
  const shop = within(screen.getByRole('region', { name: 'Accessories · Inn/Tavern' }))
  const offer = within(shop.getAllByRole('listitem', { name: offers[0].accessory.name })[0])
  const row = shop.getAllByRole('listitem', { name: offers[0].accessory.name })[0]
  expect(row.textContent).toContain(describeHook(offers[0].accessory.hooks[0]))
  await userEvent.click(offer.getByRole('button', { name: `Buy · ${offers[0].price} gp` }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyAccessory', offerId: offers[0].id })
  const mine = within(shop.getByRole('listitem', { name: 'Old Ring' }))
  await userEvent.click(mine.getByRole('button', { name: /^Sell · \+\d+ gp$/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellAccessory', id: 'old-ring' })
})

test('quality pips explain what quality does there on hover or focus', async () => {
  panel(town())
  const inn = screen.getByRole('region', { name: 'Inn/Tavern' })
  const pips = within(inn).getByRole('img', { name: /^Quality \d of 5$/ })
  await userEvent.hover(pips)
  expect(within(inn).getByRole('tooltip').textContent).toMatch(
    /^Quality \d of 5\nInns of quality 3 or better have private rooms: this one (does|doesn’t)\.$/
  )
  const jeweller = screen.getByRole('region', { name: 'Jewelry trader' })
  const tip = within(jeweller).getByRole('tooltip', { hidden: true })
  expect(tip.textContent).toMatch(/narrows the gap between buying and selling by 3 points/)
})

test('a service the party can’t afford names its price once: on the button, not again below', () => {
  panel(town({ gold: 0 }))
  const bless = screen.getByRole('button', { name: /^Blessing · \d+ gp$/ })
  const temple = within(bless.closest('section')!)
  expect((bless as HTMLButtonElement).disabled).toBe(true)
  expect(temple.queryByText(/costs \d+ gp/)).toBeNull()
  expect(temple.getAllByText('not enough gold').length).toBeGreaterThan(0)
})
