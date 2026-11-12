// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { loadBundledContent } from '../content/bundled'
import { SAVE_KEY, UNREADABLE_SAVE_KEY, deserialize } from '../engine/save'
import { App } from './App'
import { DEV_EXPANDED_KEY } from './DevArea'

// These tests use the dev panels and play situations from the Deck's list, so they start with
// the developer tools and the list expanded.
beforeEach(() => {
  localStorage.setItem(DEV_EXPANDED_KEY, 'true')
  localStorage.setItem('forgotten-heroes/ui/deck-expanded', 'true')
})

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
  await userEvent.click(screen.getByRole('button', { name: 'Small town, calm region' }))
  expect(actor.value).toBe('')
  await userEvent.click(screen.getByRole('button', { name: 'Roll' }))
  expect(screen.getByRole('list', { name: 'Log' }).querySelector('li')?.textContent).toMatch(
    /rolls/
  )
})

test('the developer tools start collapsed, and remember being opened', async () => {
  localStorage.removeItem(DEV_EXPANDED_KEY)
  const { unmount } = render(<App />)
  const toggle = screen.getByRole('button', { name: 'Show developer tools' })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('region', { name: 'Practice check' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Encounter Deck' })).toBeNull()
  await userEvent.click(toggle)
  expect(screen.getByRole('region', { name: 'Practice check' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Encounter Deck' })).toBeTruthy()
  unmount()
  render(<App />)
  expect(screen.getByRole('region', { name: 'Practice check' })).toBeTruthy()
})

test('the party starts in a settlement on the map and can set out along a road', async () => {
  render(<App />)
  const map = within(screen.getByRole('group', { name: 'Map of Altaeus' }))
  expect(map.getAllByRole('button').length).toBeGreaterThanOrEqual(50)
  const here = map.getByRole('button', { name: /\(you are here\)$/ })
  const place = within(screen.getByRole('region', { name: 'Settlement' }))
  expect(here.getAttribute('aria-label')).toBe(
    `${place.getByRole('heading', { level: 2 }).textContent} (you are here)`
  )
  const roads = within(place.getByRole('list', { name: 'Roads from here' }))
  await userEvent.click(roads.getAllByRole('button')[0])
  await userEvent.click(place.getByRole('button', { name: 'Travel' }))
  expect(screen.getByRole('region', { name: 'On the road' })).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Settlement' })).toBeNull()
  expect(screen.getByRole('list', { name: 'Log' }).textContent).toMatch(/sets out for/)
})

test('a new party starts where the player chooses', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'New party' }))
  const choice = within(screen.getByRole('group', { name: 'Where does the new party begin?' }))
  expect(choice.getByRole('button', { name: 'Small town, calm region' })).toBeTruthy()
  const before = screen.getByText(/^seed \d+$/).textContent
  await userEvent.click(choice.getByRole('button', { name: 'Random settlement' }))
  expect(screen.queryByRole('group', { name: 'Where does the new party begin?' })).toBeNull()
  expect(screen.getByText(/^seed \d+$/).textContent).not.toBe(before)
  const place = within(screen.getByRole('region', { name: 'Settlement' }))
  expect(place.getByRole('list', { name: 'Roads from here' })).toBeTruthy()
})

test('the top bar shows the supplies', () => {
  render(<App />)
  expect(screen.getByText(/^Food \d+ \(\d+ d\) · Water \d+\/\d+$/)).toBeTruthy()
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
  expect(deserialize(localStorage.getItem(SAVE_KEY) ?? '', loadBundledContent())).not.toBeNull()
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

test('the Deck waits while an encounter is in progress, and says why', async () => {
  render(<App />)
  const deck = within(screen.getByRole('region', { name: 'Encounter Deck' }))
  expect(deck.queryByText('Finish or close the current encounter first.')).toBeNull()
  await userEvent.click(deck.getByRole('button', { name: 'Play The flooded ferry' }))
  expect(deck.getByText('Finish or close the current encounter first.')).toBeTruthy()
  const disabled = (name: string) =>
    (deck.getByRole('button', { name }) as HTMLButtonElement).disabled
  expect(disabled('Random draw')).toBe(true)
  expect(disabled('Play The singing stones')).toBe(true)
  const encounter = within(screen.getByRole('region', { name: 'Encounter' }))
  await userEvent.click(encounter.getByRole('button', { name: "Choose Pay Ilse's price" }))
  expect(disabled('Random draw')).toBe(false)
  expect(deck.queryByText('Finish or close the current encounter first.')).toBeNull()
})

describe('a new roll keeps its result hidden until the dice settle', () => {
  const hp = () => screen.getAllByRole('meter').map((m) => m.getAttribute('aria-valuenow'))
  /** Plays a check whose failure costs HP; returns the party's HP before the roll. */
  const sneak = async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Play Wolves on the mountain path' }))
    const before = hp()
    await userEvent.click(screen.getByRole('button', { name: 'Choose Sneak past the wolves' }))
    return before
  }
  const journal = () => screen.getByRole('list', { name: 'Log' }).textContent

  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  test('the journal, party and top bar wait for the dice, and the Deck stays disabled', async () => {
    const before = await sneak()
    expect(journal()).not.toMatch(/rolls Stealth/)
    expect(hp()).toEqual(before)
    const deck = within(screen.getByRole('region', { name: 'Encounter Deck' }))
    expect((deck.getByRole('button', { name: 'Random draw' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    await userEvent.click(screen.getByRole('button', { name: 'Skip dice animation' }))
    expect(journal()).toMatch(/rolls Stealth/)
    expect((deck.getByRole('button', { name: 'Random draw' }) as HTMLButtonElement).disabled).toBe(
      false
    )
  })

  test('a reload mid-roll just shows the current state', async () => {
    await sneak()
    cleanup()
    render(<App />)
    expect(screen.queryByRole('button', { name: 'Skip dice animation' })).toBeNull()
    expect(journal()).toMatch(/rolls Stealth/)
  })

  test('with reduced motion the result shows at once', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('reduce'), media: query }),
    })
    await sneak()
    expect(journal()).toMatch(/rolls Stealth/)
  })
})
