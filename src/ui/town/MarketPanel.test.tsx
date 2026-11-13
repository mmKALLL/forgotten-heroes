// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { load } from '../../engine/economy/capacity'
import { quote } from '../../engine/economy/market'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import type { GameState } from '../../schema/state'
import { I18nProvider } from '../i18n/I18n'
import { ELSEWHERE_MODE_KEY, MarketPanel } from './MarketPanel'

const content = fixtureContent()
afterEach(cleanup)

const market = (state: GameState, using = content) => {
  const onAction = vi.fn()
  render(
    <I18nProvider content={using}>
      <MarketPanel content={using} state={state} onAction={onAction} />
    </I18nProvider>
  )
  return onAction
}

const town = (overrides: Partial<GameState> = {}) =>
  makeState({ location: 'ashmoor-1', gold: 100, ...overrides })

test('rows are grouped by category, with waterskins under Essentials', () => {
  market(town())
  const groups = screen.getAllByRole('rowgroup').slice(1) // after the header
  // The category's full name is its accessible name and tooltip; the vertical label is short.
  const heads = groups.map((g) => within(g).getAllByRole('rowheader')[0])
  expect(heads.map((h) => h.getAttribute('aria-label'))).toEqual([
    'Essentials',
    'Consumables',
    'Equipment',
    'Materials',
    'Precious',
  ])
  expect(heads.map((h) => h.getAttribute('title'))).toEqual(
    heads.map((h) => h.getAttribute('aria-label'))
  )
  expect(heads[1].textContent!.length).toBeLessThan('Consumables'.length)
  expect(within(groups[0]).getByRole('rowheader', { name: /^Waterskins/ })).toBeTruthy()
  // Water is free and refills by itself: no row of its own.
  expect(within(groups[0]).queryByRole('rowheader', { name: /^Water\b(?!skins)/ })).toBeNull()
  // The gold and the load head the market.
  const purse = within(screen.getByRole('group', { name: 'Gold and load' }))
  expect(purse.getByText('100 gp')).toBeTruthy()
  expect(purse.getByRole('group', { name: 'Load' })).toBeTruthy()
})

test('the quote follows the amount, and buy and sell dispatch it', async () => {
  const state = town({ goods: { food: 12 } })
  const onAction = market(state)
  const total = (side: 'buy' | 'sell', n: number) =>
    quote(state, content, 'ashmoor-1', 'food', side, n)!.total
  await userEvent.click(
    screen.getByRole('button', { name: `Buy 1 Food for ${total('buy', 1)} gp` })
  )
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyGoods', good: 'food', amount: 1 })
  await userEvent.click(screen.getByRole('button', { name: '10' }))
  const sell = screen.getByRole('button', { name: `Sell 10 Food for ${total('sell', 10)} gp` })
  expect(sell.getAttribute('title')).toMatch(/^Sell 10: \d+ gp \(.+ gp each\)$/m)
  await userEvent.click(sell)
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellGoods', good: 'food', amount: 10 })
  await userEvent.click(
    screen.getByRole('button', { name: `Buy 10 Food for ${total('buy', 10)} gp` })
  )
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyGoods', good: 'food', amount: 10 })
})

test('holding Shift counts the amount selector 5 times over, for buying and selling', async () => {
  const state = town({ goods: { food: 12, fuel: 3 } })
  const onAction = market(state)
  const user = userEvent.setup()
  await user.keyboard('{Shift>}')
  // The selector shows 5, 25, 50 and Max while Shift is held.
  expect(screen.getByRole('button', { name: '25' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: /^Sell 5 Food/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellGoods', good: 'food', amount: 5 })
  // No more than there is.
  await user.click(screen.getByRole('button', { name: /^Sell 3 Fuel/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellGoods', good: 'fuel', amount: 3 })
  await user.click(screen.getByRole('button', { name: /^Buy 5 Food/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyGoods', good: 'food', amount: 5 })
  await user.keyboard('{/Shift}')
  await user.click(screen.getByRole('button', { name: /^Sell 1 Food/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellGoods', good: 'food', amount: 1 })
})

test('prices known elsewhere show their age, stale and heard', () => {
  const state = town({
    day: 30,
    priceBook: { 'greenvale-2': { day: 14, heard: true, prices: { food: { buy: 1, sell: 7 } } } },
  })
  market(state)
  const name = settlementName(state, 'greenvale-2')
  const row = screen.getByRole('rowheader', { name: /^Food/ }).closest('tr')!
  const known = within(row).getByText(name).closest('td')!
  // ↑: it pays more there than here.
  expect(known.textContent).toBe(`↑7 ${name} 16d heard stale`)
  expect(known.className).toMatch(/stale/)
  expect(known.getAttribute('title')).toMatch(`${name} pays 7 gp · 16 days ago heard stale`)
  cleanup()
  market(
    town({
      priceBook: {
        'greenvale-2': { day: 1, heard: false, prices: { food: { buy: 0.2, sell: 0.1 } } },
      },
    })
  )
  const lower = screen.getByRole('rowheader', { name: /^Food/ }).closest('tr')!
  expect(within(lower).getByText(name).closest('td')!.textContent).toMatch(/^↓0\.1 /)
})

test('the Elsewhere header switches between Buys at and Sells at, and remembers it', async () => {
  localStorage.removeItem(ELSEWHERE_MODE_KEY)
  const state = town({
    day: 30,
    priceBook: {
      'greenvale-2': { day: 25, heard: false, prices: { gems: { buy: 300, sell: 200 } } },
      'greenvale-1': { day: 28, heard: false, prices: { gems: { buy: 20, sell: 10 } } },
      // Too old to show, though it pays the most and asks the least.
      'farisle-1': { day: 2, heard: false, prices: { gems: { buy: 1, sell: 999 } } },
    },
  })
  market(state)
  const gems = () => screen.getByRole('rowheader', { name: /^Gems/ }).closest('tr')!
  const cell = () => gems().querySelector('td.known')!
  const there = (id: string) => settlementName(state, id)
  // Buys at: the most a town is known to pay.
  const toggle = screen.getByRole('button', { name: /^Buys at/ })
  expect(cell().textContent).toContain(`200 ${there('greenvale-2')}`)
  await userEvent.click(toggle)
  // Sells at: the least a town is known to charge.
  expect(screen.getByRole('button', { name: /^Sells at/ })).toBeTruthy()
  expect(cell().textContent).toContain(`20 ${there('greenvale-1')}`)
  expect(cell().textContent).not.toContain(there('farisle-1'))
  cleanup()
  market(state)
  expect(screen.getByRole('button', { name: /^Sells at/ })).toBeTruthy()
  localStorage.removeItem(ELSEWHERE_MODE_KEY)
})

test('a buy that would overload is disabled with the reason', () => {
  const empty = town({ goods: {} })
  const full = Math.floor(load(empty, content).capacity * 1.5)
  market(town({ goods: { food: full } }))
  const buy = screen.getByRole('button', { name: /^Buy 1 Food/ }) as HTMLButtonElement
  expect(buy.disabled).toBe(true)
  expect(buy.getAttribute('title')).toBe('Too heavy: the party can carry 0 more')
  expect(buy.closest('td')!.textContent).toMatch(/carry 0 more/)
})

test('a buy the gold can’t cover is disabled without a reason under it', () => {
  market(town({ gold: 0 }))
  const buy = screen.getByRole('button', { name: /^Buy 1 Food/ }) as HTMLButtonElement
  expect(buy.disabled).toBe(true)
  expect(buy.closest('td')!.querySelector('.trade-why')).toBeNull()
})

test('the supply and demand cell explains the price on hover only', () => {
  market(town())
  // Ashmoor's marsh makes alchemicals (output 2) for its own market.
  const row = screen.getByRole('rowheader', { name: /^Alchemicals/ }).closest('tr')!
  const cell = row.querySelector('td.levels')!
  expect(cell.getAttribute('title')).toMatch(/^Supply \+2 · demand 0\nMade here: Herb-gatherers/)
  // A level of 0 is a dash in the same slot as one arrow.
  expect(cell.textContent).toBe('▲▲/—')
})

test('a shortage is marked in the supply and demand cell', () => {
  // Threatened Greenvale wants arms, and (without producers) nothing makes them.
  const state = town({ location: 'greenvale-2' })
  const domain = state.world.domains['greenvale-2']
  const threatened: GameState = {
    ...state,
    world: {
      ...state.world,
      domains: { ...state.world.domains, 'greenvale-2': { ...domain, garrison: 0 } },
      lands: {
        ...state.world.lands,
        [domain.land]: { ...state.world.lands[domain.land], threatStrength: 6 },
      },
    },
  }
  market(threatened, { ...content, producers: {} })
  const row = screen.getByRole('rowheader', { name: /^Arms/ }).closest('tr')!
  expect(within(row).getByLabelText('Shortage')).toBeTruthy()
  expect(row.querySelector('td.levels')!.getAttribute('title')).toMatch(/Wanted here: Raids/)
})

test('selling a contract’s cargo asks first, says what it costs, and dispatches sellCargo', async () => {
  const s = town({ goods: { food: 3 } })
  const patron = Object.keys(s.world.people)[0]
  const state = town({
    goods: { food: 3 },
    contracts: [
      {
        id: 'c-cargo',
        template: 'bring-timber',
        kind: 'freight',
        patron,
        from: 'greenvale-1',
        to: 'ashmoor-1',
        good: 'food',
        amount: 2,
        poi: null,
        passengers: 0,
        accepted: 1,
        deadline: 9,
        pay: 30,
        level: 1,
        urgent: false,
        reputation: { patron: 5, settlement: 3 },
        met: false,
      },
    ],
  })
  const onAction = market(state)
  await userEvent.click(screen.getByRole('button', { name: 'Sell 2 cargo…' }))
  expect(screen.getByText(/^Selling the 2 Food breaks “.+”: the market pays \d+ gp/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Sell and break it' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellCargo', contractId: 'c-cargo' })
})
