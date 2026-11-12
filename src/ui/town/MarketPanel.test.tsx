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
import { MarketPanel } from './MarketPanel'

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
  expect(groups.map((g) => within(g).getAllByRole('rowheader')[0].textContent)).toEqual([
    'Essentials',
    'Consumables',
    'Equipment',
    'Materials',
    'Precious',
  ])
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
  expect(sell.getAttribute('title')).toMatch(/^Sell 10: \d+ gp \(.+ gp each\)$/)
  await userEvent.click(sell)
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellGoods', good: 'food', amount: 10 })
  await userEvent.click(
    screen.getByRole('button', { name: `Buy 10 Food for ${total('buy', 10)} gp` })
  )
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyGoods', good: 'food', amount: 10 })
})

test('prices known elsewhere show their age, stale and heard', () => {
  const state = town({
    day: 30,
    priceBook: { 'greenvale-2': { day: 5, heard: true, prices: { food: { buy: 1, sell: 7 } } } },
  })
  market(state)
  const name = settlementName(state, 'greenvale-2')
  const row = screen.getByRole('rowheader', { name: /^Food/ }).closest('tr')!
  const known = within(row).getByText(name).closest('td')!
  // ↑: it pays more there than here.
  expect(known.textContent).toBe(`↑7 ${name} 25d heard stale`)
  expect(known.className).toMatch(/stale/)
  expect(known.getAttribute('title')).toMatch(`${name} pays 7 gp · 25 days ago heard stale`)
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
