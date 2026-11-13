// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { buildContent } from '../content/build'
import { fixtureContent, makeState, testEconomy, testWorld } from '../engine/test-fixtures'
import { SPOIL_SHOW_DAYS } from '../engine/constants'
import { GoodsBar } from './GoodsBar'
import { I18nProvider, LANGUAGE_KEY } from './i18n/I18n'

const content = fixtureContent()
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const bar = (overrides: Parameters<typeof makeState>[0] = {}) =>
  render(
    <I18nProvider content={content}>
      <GoodsBar content={content} state={makeState(overrides)} />
    </I18nProvider>
  )

test('the goods render by category, empty categories as a dash', () => {
  bar({ goods: { food: 6, water: 4, gems: 2 } })
  const groups = within(screen.getByRole('list', { name: 'Goods carried' })).getAllByRole(
    'listitem'
  )
  expect(groups.map((g) => g.textContent)).toEqual([
    'Essentials Food 6 Water 4/8',
    'Consumables —',
    'Equipment —',
    'Materials —',
    'Precious Gems 2',
  ])
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
  const none = screen.getByRole('img', { name: /^Visible wealth 0 of 4$/ })
  expect(none.textContent).toMatch(/^Wealth◇◇◇◇/)
  const tip = screen.getByRole('tooltip', { hidden: true })
  expect(tip.hidden).toBe(true)
  expect(tip.textContent).toMatch(/^Visible wealth draws trouble.*\+5% hostile.*50 gp per member/)
  await userEvent.hover(none)
  expect(tip.hidden).toBe(false)
  cleanup()
  bar({ goods: { gems: 3 }, gold: 0 })
  const shown = screen.getByRole('img', { name: /^Visible wealth 1 of 4\./ })
  act(() => shown.focus())
  const now = screen.getByRole('tooltip')
  expect(now.textContent).toMatch(/^Precious goods worth 300 gp: \+5% hostile on the road\n/)
})

test('Japanese falls back to English for missing keys', () => {
  localStorage.setItem(LANGUAGE_KEY, 'ja')
  bar({ goods: { food: 1 } })
  expect(screen.getByRole('list', { name: '所持品' }).textContent).toMatch(/^必需品/)
  // 'goods.none' has no Japanese entry: the English dash shows.
  expect(screen.getByText('消耗品').parentElement!.textContent).toBe('消耗品 —')
})

test('drop goods leaves one or all of a good behind', async () => {
  const onAction = vi.fn()
  render(
    <I18nProvider content={content}>
      <GoodsBar content={content} state={makeState({ goods: { stone: 3 } })} onAction={onAction} />
    </I18nProvider>
  )
  await userEvent.click(screen.getByText('Drop goods'))
  await userEvent.click(screen.getByRole('button', { name: 'Leave 1 Stone behind' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'dropGoods', good: 'stone', amount: 1 })
  await userEvent.click(screen.getByRole('button', { name: 'Leave all 3 Stone behind' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'dropGoods', good: 'stone', amount: 3 })
})

test('food shows when it spoils, only within SPOIL_SHOW_DAYS days', () => {
  const goods = testEconomy['data/claude/goods.json'] as { entries: { id: string }[] }
  const { content: spoiling } = buildContent({
    ...testWorld,
    'data/claude/goods.json': {
      ...goods,
      entries: goods.entries.map((e) => (e.id === 'food' ? { ...e, shelfDays: 14 } : e)),
    },
  })
  const food = (day: number) => {
    const state = makeState({
      day,
      goods: { food: 7 },
      foodLots: [
        { day: 1, amount: 3 },
        { day: 6, amount: 4 },
      ],
    })
    render(
      <I18nProvider content={spoiling}>
        <GoodsBar content={spoiling} state={state} />
      </I18nProvider>
    )
    return screen.getByText(/^Food/).closest('.goods-item')!.textContent
  }
  // The first batch spoils on day 15.
  expect(food(15 - SPOIL_SHOW_DAYS - 1)).toBe(' Food 7')
  cleanup()
  expect(food(13)).toBe(' Food 73 spoil in 2d')
})
