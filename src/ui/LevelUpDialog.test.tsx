// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { loadBundledContent } from '../content/bundled'
import { XP_BY_LEVEL } from '../engine/constants'
import { applyLevelUps } from '../engine/rules/progression'
import { SAVE_KEY, deserialize, serialize } from '../engine/save'
import { newGame } from '../engine/state'
import type { GameState } from '../schema/state'
import { App } from './App'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const content = loadBundledContent()

/** A new party whose first member has just reached level 5 (two ability raises, +1 proficiency). */
function leveled(): GameState {
  const s = newGame(7, content)
  return applyLevelUps({
    ...s,
    party: s.party.map((c, i) => (i === 0 ? { ...c, xp: XP_BY_LEVEL[4] } : c)),
  })
}

const dialog = () => within(screen.getByRole('dialog'))
const saved = () => deserialize(localStorage.getItem(SAVE_KEY)!, content)!

test('pending level-ups open the dialog: who, which levels and what they gained', async () => {
  const state = leveled()
  localStorage.setItem(SAVE_KEY, serialize(state))
  render(<App />)
  const [up] = state.levelUps
  const hero = state.party[0]
  expect(dialog().getByRole('heading', { name: 'Level up' })).toBeTruthy()
  expect(dialog().getByRole('heading', { name: hero.name })).toBeTruthy()
  expect(dialog().getByText('Level 1 → 5')).toBeTruthy()
  expect(dialog().getByText(`+${up.gains.maxHp} max HP`)).toBeTruthy()
  expect(dialog().getByText(`→ ${hero.maxHp}`)).toBeTruthy()
  expect(dialog().getByText('Proficiency bonus +2 → +3')).toBeTruthy()
  // Only the member who levelled has a card.
  expect(dialog().getAllByRole('listitem', { name: /./ })).toHaveLength(1)
  // Focus starts on Continue, and the game behind is inert.
  const go = dialog().getByRole('button', { name: 'Continue' })
  expect(document.activeElement).toBe(go)
  expect(document.querySelector('header.topbar')!.closest('[inert]')).not.toBeNull()

  await userEvent.click(go)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(saved().levelUps).toEqual([])
  expect(document.querySelector('[inert]')).toBeNull()
})

test('Escape confirms too, as there is nothing to choose yet', async () => {
  localStorage.setItem(SAVE_KEY, serialize(leveled()))
  render(<App />)
  expect(screen.getByRole('dialog')).toBeTruthy()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(saved().levelUps).toEqual([])
})
