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

const market = (state: GameState) => {
  const onAction = vi.fn()
  render(
    <I18nProvider content={content}>
      <MarketPanel content={content} state={state} onAction={onAction} />
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
  expect(known.textContent).toBe(`▲7 ${name} 25 d heard stale`)
  expect(known.className).toMatch(/stale/)
  expect(known.getAttribute('title')).toMatch(`${name} pays 7 gp · 25 days ago heard stale`)
})

test('a buy that would overload is disabled with the reason', () => {
  const empty = town({ goods: {} })
  const full = Math.floor(load(empty, content).capacity * 1.5)
  market(town({ goods: { food: full } }))
  const buy = screen.getByRole('button', { name: /^Buy 1 Food/ }) as HTMLButtonElement
  expect(buy.disabled).toBe(true)
  expect(buy.getAttribute('title')).toBe('Too heavy: the party can carry 0 more')
})
