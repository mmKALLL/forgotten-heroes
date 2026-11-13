// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { Action } from '../engine/state'
import { suppliesInfo } from '../engine/travel/preview'
import { fixtureContent, makeState } from '../engine/test-fixtures'
import type { GameState } from '../schema/state'
import { Essentials, TopInventory } from './Inventory'
import { I18nProvider, LANGUAGE_KEY } from './i18n/I18n'

const content = fixtureContent()
afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** The top bar's inventory: the essentials line, the 2×2 goods block, the load and the wealth. */
const topBar = (state: GameState, onAction?: (a: Action) => void) =>
  render(
    <I18nProvider content={content}>
      <header>
        <Essentials content={content} state={state} supplies={suppliesInfo(state)} />
        <TopInventory content={content} state={state} onAction={onAction} />
      </header>
    </I18nProvider>
  )
const bar = (overrides: Parameters<typeof makeState>[0] = {}) => topBar(makeState(overrides))

test('the top bar shows the essentials, then the other goods as a 2×2 block with cargo marked', () => {
  const s = makeState()
  topBar(
    makeState({
      goods: { food: 6, water: 4, fuel: 1, healing: 2, arcana: 1, gems: 3 },
      contracts: [
        {
          id: 'c-cargo',
          template: 'bring-timber',
          kind: 'freight',
          patron: Object.keys(s.world.people)[0],
          from: 'greenvale-1',
          to: 'ashmoor-1',
          good: 'gems',
          amount: 2,
          poi: null,
          passengers: 0,
          accepted: 1,
          deadline: 9,
          pay: 30,
          level: 1,
          urgent: false,
          reputation: 8,
          met: false,
        },
      ],
    })
  )
  // Food and water with their days, and fuel: the essentials are not repeated in the block.
  expect(screen.getByText(/^Food 6 \(3d\)/).textContent).toBe(
    'Food 6 (3d) · Water 4/8 (2d) · Fuel 1'
  )
  const cells = within(screen.getByRole('list', { name: 'Goods carried' })).getAllByRole('listitem')
  // The short label shows; the full name is its title and is read out by screen readers.
  expect(cells.map((c) => c.textContent)).toEqual([
    'Consumables: Healing 2, Arcana 1',
    'Equipment: —',
    'Materials: —',
    'Precious: Gems 32 cargo',
  ])
  expect(within(cells[0]).getByText('Consumables:')).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Load' })).toBeTruthy()
  expect(screen.getByRole('img', { name: /^Visible wealth/ })).toBeTruthy()
})

test('the capacity meter shows the load and its level', () => {
  // Two members at about 20 kg each: 50 kg of stone is encumbered, 100 kg overloaded.
  bar({ goods: { stone: 1 } })
  const meter = screen.getByRole('group', { name: 'Load' })
  expect(meter.textContent).toMatch(/^50 \/ \d+ kgEncumbered$/)
  cleanup()
  bar({ goods: { stone: 2 } })
  expect(screen.getByRole('group', { name: 'Load' }).textContent).toMatch(/Overloaded$/)
  cleanup()
  bar({ goods: { food: 2 } })
  expect(screen.getByRole('group', { name: 'Load' }).textContent).toMatch(/^2 \/ \d+ kg$/)
})

test('the wealth diamonds are labelled and explain themselves on hover or focus', async () => {
  bar({ goods: {}, gold: 0 })
  const none = screen.getByRole('img', { name: /^Visible wealth 0 of 6$/ })
  expect(none.textContent).toMatch(/^Wealth◇◇◇◇◇◇/)
  const tip = screen.getByRole('tooltip', { hidden: true })
  expect(tip.hidden).toBe(true)
  expect(tip.textContent).toMatch(
    /^Visible wealth draws trouble.*\+5% hostile.*a ◆ each at 100, 300, 600/
  )
  await userEvent.hover(none)
  expect(tip.hidden).toBe(false)
  cleanup()
  bar({ goods: { gems: 3 }, gold: 0 })
  const shown = screen.getByRole('img', { name: /^Visible wealth 2 of 6\./ })
  act(() => shown.focus())
  const now = screen.getByRole('tooltip')
  expect(now.textContent).toMatch(/^Precious goods worth 300 gp: \+10% hostile on the road\n/)
})

test('Japanese falls back to English for missing keys', () => {
  localStorage.setItem(LANGUAGE_KEY, 'ja')
  bar({ goods: { food: 1 } })
  expect(screen.getByRole('list', { name: '所持品' }).textContent).toMatch(/^消耗品:/)
  // 'goods.none' and 'top.fuel' have no Japanese entry: the English shows.
  expect(screen.getAllByRole('listitem')[0].textContent).toMatch(/ —$/)
  expect(screen.getByText(/^食料 1/).textContent).toMatch(/ · Fuel 0$/)
})

test('drop goods leaves one or all of a good behind', async () => {
  const onAction = vi.fn()
  topBar(makeState({ goods: { stone: 3 } }), onAction)
  await userEvent.click(screen.getByText('Drop goods'))
  await userEvent.click(screen.getByRole('button', { name: 'Leave 1 Stone behind' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'dropGoods', good: 'stone', amount: 1 })
  await userEvent.click(screen.getByRole('button', { name: 'Leave all 3 Stone behind' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'dropGoods', good: 'stone', amount: 3 })
})
