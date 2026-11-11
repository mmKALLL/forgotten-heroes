// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { SAVE_KEY, UNREADABLE_SAVE_KEY, deserialize } from '../engine/save'
import { App } from './App'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

test('shows the party and logs a practice roll', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Forgotten Heroes' })).toBeTruthy()
  expect(screen.getAllByRole('article').length).toBe(2) // two party cards
  const log = screen.getByRole('list', { name: 'Log' })
  const before = log.querySelectorAll('li').length
  await userEvent.click(screen.getByRole('button', { name: 'Roll' }))
  expect(log.querySelectorAll('li').length).toBe(before + 1)
})

test('the game survives a reload via localStorage', async () => {
  const { unmount } = render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Roll' }))
  const names = screen.getAllByRole('article').map((a) => a.querySelector('strong')?.textContent)
  unmount()
  render(<App />)
  expect(screen.getAllByRole('article').map((a) => a.querySelector('strong')?.textContent)).toEqual(
    names
  )
})

test('the DC field can be cleared and retyped, and previews the DC the roll will use', async () => {
  render(<App />)
  const dc = screen.getByRole('spinbutton', { name: 'DC' }) as HTMLInputElement
  await userEvent.clear(dc)
  expect(dc.value).toBe('')
  await userEvent.type(dc, '12')
  expect(dc.value).toBe('12')
  expect(screen.getByText(/vs DC 12:/)).toBeTruthy()
  await userEvent.clear(dc)
  await userEvent.type(dc, '99')
  expect(screen.getByText(/vs DC 40:/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Roll' }))
  expect(screen.getByRole('list', { name: 'Log' }).querySelector('li')?.textContent).toMatch(
    /vs DC 40\./
  )
})

test('an actor override from a previous party falls back to Auto', async () => {
  render(<App />)
  const actor = screen.getByRole('combobox', { name: 'Actor' }) as HTMLSelectElement
  await userEvent.selectOptions(actor, actor.options[1].value)
  expect(actor.value).not.toBe('')
  await userEvent.click(screen.getByRole('button', { name: 'New party' }))
  expect(actor.value).toBe('')
  await userEvent.click(screen.getByRole('button', { name: 'Roll' }))
  expect(screen.getByRole('list', { name: 'Log' }).querySelector('li')?.textContent).toMatch(
    /rolls/
  )
})

test('the roll announcer exists before the first roll, and HP bars are meters', async () => {
  render(<App />)
  const live = document.querySelector('[aria-live="polite"]')
  expect(live).toBeTruthy()
  expect(live?.textContent).toBe('')
  await userEvent.click(screen.getByRole('button', { name: 'Roll' }))
  expect(document.querySelector('[aria-live="polite"]')).toBe(live)
  expect(live?.querySelector('.die.kept')).toBeTruthy()
  const meters = screen.getAllByRole('meter')
  expect(meters).toHaveLength(2)
  for (const m of meters) {
    expect(Number(m.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    expect(m.getAttribute('aria-valuemin')).toBe('0')
    expect(Number(m.getAttribute('aria-valuemax'))).toBeGreaterThan(0)
  }
})

test('an unreadable save is kept under a backup key before a new game replaces it', () => {
  expect(UNREADABLE_SAVE_KEY).toBe(`${SAVE_KEY}/unreadable`)
  const broken = JSON.stringify({ version: 999, party: 'from the future' })
  localStorage.setItem(SAVE_KEY, broken)
  render(<App />)
  expect(localStorage.getItem(UNREADABLE_SAVE_KEY)).toBe(broken)
  expect(deserialize(localStorage.getItem(SAVE_KEY) ?? '')).not.toBeNull()
})

test('a readable save leaves no backup behind', () => {
  render(<App />)
  cleanup()
  render(<App />)
  expect(localStorage.getItem(UNREADABLE_SAVE_KEY)).toBeNull()
})

test('the odds bar labels tiers with d20 thresholds by default, with no label toggle', () => {
  render(<App />)
  const bar = screen.getByRole('img', { name: /Success/ })
  expect(bar.textContent).toMatch(/\d+\+/)
  expect(bar.textContent).not.toMatch(/–|%/)
  expect(bar.getAttribute('aria-label')).toMatch(/Success: \d+–\d+ \(\d+%\)/)
  expect(screen.getByRole('region', { name: 'Practice check' }).textContent).toMatch(
    /: needs \d+\+ on the d20/
  )
  expect(screen.queryByRole('group', { name: 'Odds labels' })).toBeNull()
})

test('the Encounter Deck plays any situation, and the encounter shows its source', async () => {
  render(<App />)
  const deck = within(screen.getByRole('region', { name: 'Encounter Deck' }))
  await userEvent.click(deck.getByRole('button', { name: 'Play The flooded ferry' }))
  const encounter = within(screen.getByRole('region', { name: 'Encounter' }))
  expect(encounter.getByRole('heading', { name: 'The flooded ferry' })).toBeTruthy()
  expect(encounter.getByText('Claude')).toBeTruthy()
  await userEvent.click(encounter.getByRole('button', { name: "Choose Pay Ilse's price" }))
  expect(encounter.getByText('The encounter is over.')).toBeTruthy()
  await userEvent.click(encounter.getByRole('button', { name: 'Close' }))
  expect(screen.getByRole('region', { name: 'Practice check' })).toBeTruthy()
})

test('random draw honours the source filter', async () => {
  render(<App />)
  const deck = within(screen.getByRole('region', { name: 'Encounter Deck' }))
  for (const label of ['Original', 'SRD', 'Private', 'Claude']) {
    await userEvent.click(deck.getByRole('checkbox', { name: new RegExp(`^${label} \\(`) }))
  }
  await userEvent.click(deck.getByRole('button', { name: 'Random draw' }))
  expect(
    within(screen.getByRole('region', { name: 'Encounter' })).getByText('Procedural')
  ).toBeTruthy()
})

test('an encounter in progress survives a reload', async () => {
  const { unmount } = render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Play The singing stones' }))
  unmount()
  render(<App />)
  expect(screen.getByRole('heading', { name: 'The singing stones' })).toBeTruthy()
})
