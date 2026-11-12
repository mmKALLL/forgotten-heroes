// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { loadBundledContent } from '../content/bundled'
import { SAVE_KEY, deserialize, serialize } from '../engine/save'
import { newGame } from '../engine/state'
import { App } from './App'
import { ACTIVE_SLOT_KEY, slotKey } from './saves'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const seedShown = () => screen.getByText(/^seed \d+$/).textContent
const slot = (n: number) => within(screen.getByRole('region', { name: `Slot ${n}` }))
const openSaves = () => userEvent.click(screen.getByRole('button', { name: 'Saves' }))

test('switching to slot 2 loads its save, and a new party there leaves slot 1 untouched', async () => {
  const content = loadBundledContent()
  const second = newGame(42, content)
  localStorage.setItem(slotKey(2), serialize(second))
  render(<App />)
  const first = localStorage.getItem(SAVE_KEY)
  expect(first).not.toBeNull()

  await openSaves()
  expect(slot(1).getByText(/playing/)).toBeTruthy()
  expect(slot(2).getByText(new RegExp(second.party[0].name))).toBeTruthy()
  expect(slot(3).getByText('Empty')).toBeTruthy()
  await userEvent.click(slot(2).getByRole('button', { name: 'Continue' }))
  expect(seedShown()).toBe('seed 42')
  expect(localStorage.getItem(ACTIVE_SLOT_KEY)).toBe('2')

  await openSaves()
  await userEvent.click(slot(2).getByRole('button', { name: 'New party here' }))
  await userEvent.click(
    within(screen.getByRole('group', { name: 'Start a new party in a new world?' })).getByRole(
      'button',
      { name: 'Start' }
    )
  )
  expect(seedShown()).not.toBe('seed 42')
  expect(localStorage.getItem(SAVE_KEY)).toBe(first)
  expect(deserialize(localStorage.getItem(slotKey(2))!, content)?.seed).not.toBe(42)

  // The active slot is remembered across a reload.
  const now = seedShown()
  cleanup()
  render(<App />)
  expect(seedShown()).toBe(now)
})

test('a new party over a won run (which plays on) asks first', async () => {
  const content = loadBundledContent()
  const won = newGame(42, content)
  const crisis = { ...won.crisis!, learned: 2, thwarted: [3, 4, 5], endSeen: true }
  localStorage.setItem(slotKey(2), serialize({ ...won, day: 6, crisis }))
  render(<App />)
  await openSaves()
  expect(slot(2).getByText(/Crisis won/)).toBeTruthy()
  await userEvent.click(slot(2).getByRole('button', { name: 'New party here' }))
  expect(screen.getByRole('group', { name: 'Start a new party in a new world?' })).toBeTruthy()
  expect(deserialize(localStorage.getItem(slotKey(2))!, content)?.seed).toBe(42)
})
