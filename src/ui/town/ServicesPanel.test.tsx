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
import { serviceRows } from '../../engine/town/services'
import { ServicesPanel } from './ServicesPanel'
import { SPREAD_PER_QUALITY, HEALER_PRICE } from '../../engine/constants'

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

test('tiles run from places described only to places with buttons; "coming later" shows', () => {
  panel(town())
  const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
  const order = ['Places', 'Shops with a list', 'Shops with a choice', 'Services']
  expect(groups.length).toBeGreaterThan(1)
  expect(groups).toEqual(order.filter((g) => groups.includes(g)))
  // A shop described only (the jeweller) comes before one with buttons (the inn).
  const tiles = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
  expect(tiles.indexOf('Jewelry trader')).toBeLessThan(tiles.indexOf('Inn/Tavern'))
  const magic = screen.getByRole('region', { name: 'Magic items' })
  expect(within(magic).getByText('coming later')).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Jewelry trader' })).getByText(/^Trades gems/))
})

test('rooms, a round, the healer, a blessing, news and animals dispatch their actions', async () => {
  // Late enough that a courier's news is fresher than any prices the party knows.
  const hurt = town({ party: [{ ...brom, hp: 5 }, lyra], animals: { mule: 1 }, day: 20 })
  const onAction = panel(hurt)
  const inn = within(screen.getByRole('region', { name: 'Inn/Tavern' }))
  await userEvent.click(inn.getByRole('button', { name: /^Common room · \d+ gp \d+% HP/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'rest', lodging: 'common' })
  const round = inn.getByRole('button', { name: /^Stand a round · \d+ gp \+\d+ camaraderie$/ })
  expect(round.getAttribute('title')).toMatch(/^Drinks for everyone: \+\d+ camaraderie/)
  await userEvent.click(round)
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'inn-tavern',
    action: 'round',
  })

  const heal = screen.getByRole('button', {
    name: new RegExp(`^Heal 1 · ${HEALER_PRICE} gp Full HP`),
  })
  expect(heal.getAttribute('title')).toMatch(/for Brom,/)
  await userEvent.click(heal)
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'temple',
    action: 'heal',
  })
  await userEvent.click(screen.getByRole('button', { name: /^Blessing · \d+ gp/ }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'temple',
    action: 'bless',
  })

  // Two courier options, each with its price and effect; neighbours' tooltip names the towns.
  const neighbours = screen.getByRole('button', {
    name: /^Neighbours · \d+ gp Neighbours’ prices$/,
  })
  expect(neighbours.getAttribute('title')).toMatch(/\(\d+ days? old\)/)
  await userEvent.click(neighbours)
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'couriers',
    action: 'news',
    reach: 'neighbours',
  })
  await userEvent.click(screen.getByRole('button', { name: /^All towns · \d+ gp Every town’s/ }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'useService',
    service: 'couriers',
    action: 'news',
    reach: 'all',
  })

  const stable = within(screen.getByRole('region', { name: 'Animals & mounts' }))
  // The price and the kg are in the picker; neither the button nor a line beside it repeats them.
  expect(stable.getByRole('option', { name: /^Mule · \d+ gp · 100 kg$/ })).toBeTruthy()
  expect(stable.queryByText('+100 kg')).toBeNull()
  await userEvent.click(stable.getByRole('button', { name: 'Buy' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyAnimal', animal: 'mule' })
  await userEvent.click(stable.getByRole('button', { name: /^Sell \(1\)/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellAnimal', animal: 'mule' })
})

test('the healer is disabled when no one needs healing, and resting on carried food dispatches', async () => {
  const onAction = panel(town())
  expect(
    (
      screen.getByRole('button', {
        name: new RegExp(`^Heal · ${HEALER_PRICE} gp each`),
      }) as HTMLButtonElement
    ).disabled
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
  const half = String(Math.round(SPREAD_PER_QUALITY * 50 * 10) / 10)
  expect(tip.textContent).toContain(`you pay ${half}% less when buying here, and get ${half}% more`)
  expect(tip.textContent).not.toMatch(/average/)
})

test('a service button shows its price, then the engine’s short effect on a second line', () => {
  const state = town()
  panel(state)
  const bless = screen.getByRole('button', { name: /^Blessing · \d+ gp/ })
  const effect = serviceRows(state, content)
    .find((r) => r.service === 'temple')!
    .actions.find((a) => a.action === 'bless')!.effect!
  expect(bless.querySelector('.service-effect')?.textContent).toBe(effect)
  expect(effect).toBe('+1 Inspiration')
  // The longer description stays in the tooltip; nothing else on the tile repeats the effect.
  expect(bless.getAttribute('title')).toMatch(/Inspiration/)
  const temple = within(bless.closest('section')!)
  expect(temple.getAllByText(/Inspiration/)).toHaveLength(1)
})

test('a service the party can’t afford is only disabled: "not enough gold" is not shown', () => {
  panel(town({ gold: 0 }))
  const bless = screen.getByRole('button', { name: /^Blessing · \d+ gp/ })
  expect((bless as HTMLButtonElement).disabled).toBe(true)
  // The reason is in the tooltip and the accessible description, not a visible line.
  expect(bless.getAttribute('title')).toMatch(/not enough gold$/)
  const why = document.getElementById(bless.getAttribute('aria-describedby') ?? '')
  expect(why?.textContent).toBe('not enough gold')
  expect(why?.className).toBe('sr-only')
  for (const line of document.querySelectorAll('.service-why')) {
    expect(line.textContent).not.toMatch(/gold/)
  }
})
