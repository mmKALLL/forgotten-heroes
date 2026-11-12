// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { fixtureContent, makeState } from '../engine/test-fixtures'
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

test('the wealth tooltip appears only when wealth shows', () => {
  bar({ goods: {}, gold: 0 })
  const none = screen.getByRole('img', { name: /^Visible wealth 0 of 4$/ })
  expect(none.getAttribute('title')).toBeNull()
  cleanup()
  bar({ goods: { gems: 3 }, gold: 0 })
  const shown = screen.getByRole('img', { name: /^Visible wealth 1 of 4\./ })
  expect(shown.getAttribute('title')).toBe('Precious goods worth 300 gp: +5% hostile on the road')
})

test('Japanese falls back to English for missing keys', () => {
  localStorage.setItem(LANGUAGE_KEY, 'ja')
  bar({ goods: { food: 1 } })
  expect(screen.getByRole('list', { name: '所持品' }).textContent).toMatch(/^必需品/)
  // 'goods.none' has no Japanese entry: the English dash shows.
  expect(screen.getByText('消耗品').parentElement!.textContent).toBe('消耗品 —')
})
