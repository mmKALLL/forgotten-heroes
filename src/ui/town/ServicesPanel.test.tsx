// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { Content } from '../../content/build'
import { brom, fixtureContent, lyra, makeState } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { I18nProvider } from '../i18n/I18n'
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

test('rooms, the healer, a blessing, news and animals dispatch their actions', async () => {
  // Late enough that a courier's news is fresher than any prices the party knows.
  const hurt = town({ party: [{ ...brom, hp: 5 }, lyra], animals: { mule: 1 }, day: 20 })
  const onAction = panel(hurt)
  const inn = within(screen.getByRole('region', { name: 'Inn/Tavern' }))
  await userEvent.click(inn.getByRole('button', { name: /^Common · \d+ gp$/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'rest', lodging: 'common' })

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
  expect(stable.getByText('+100 kg · 1 gp a day')).toBeTruthy()
  await userEvent.click(stable.getByRole('button', { name: 'Buy · 10 gp' }))
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
  await userEvent.click(
    first.getByRole('button', { name: /^Hire · \d+ gp, then [\d.]+ gp a day$/ })
  )
  expect(onAction).toHaveBeenLastCalledWith({ type: 'hireRecruit', offerId: offers[0].id })
  await userEvent.keyboard('{Escape}')
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: `Recruits (${offers.length})` })
  )
})

test('a recruit the party cannot afford is disabled with the reason inline', async () => {
  panel(town({ gold: 0 }))
  await userEvent.click(screen.getByRole('button', { name: /^Recruits \(\d\)$/ }))
  const hire = screen.getAllByRole('button', { name: /^Hire/ })[0] as HTMLButtonElement
  expect(hire.disabled).toBe(true)
  expect(hire.parentElement?.textContent).toMatch(/costs \d+ gp/)
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
