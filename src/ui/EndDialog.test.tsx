// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { loadBundledContent } from '../content/bundled'
import { runRecord } from '../engine/crisis/ending'
import { actFailsOn } from '../engine/crisis/status'
import { SAVE_KEY, deserialize, serialize } from '../engine/save'
import { newGame } from '../engine/state'
import type { GameState } from '../schema/state'
import { App } from './App'
import { EndDialog } from './EndDialog'
import { HALL_KEY, readHall, recordRun } from './hall'
import { I18nProvider } from './i18n/I18n'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const content = loadBundledContent()

/** A new world whose Crisis was won: all three acts thwarted. */
function won(): GameState {
  const s = newGame(7, content)
  const crisis = s.crisis!
  const days = crisis.acts.map((a) => a.due - 5)
  return { ...s, day: days[2] + 2, crisis: { ...crisis, learned: 3, thwarted: days } }
}

/** A new world whose act I failed. */
function lost(): GameState {
  const s = newGame(7, content)
  return { ...s, day: actFailsOn(s.crisis!.acts[0].due) + 1 }
}

const fallen = (s: GameState): GameState => ({
  ...s,
  party: s.party.map((c) => ({ ...c, exhaustion: 6 })),
})

const dialog = () => within(screen.getByRole('dialog'))
const saved = () => deserialize(localStorage.getItem(SAVE_KEY)!, content)!

test('victory: Keep playing dispatches acknowledgeEnd, and the Hall records the run once', async () => {
  localStorage.setItem(SAVE_KEY, serialize(won()))
  render(<App />)
  expect(dialog().getByText('Victory')).toBeTruthy()
  expect(dialog().getAllByText(/✓ thwarted day/)).toHaveLength(3)
  const keep = dialog().getByRole('button', { name: 'Keep playing' })
  expect(document.activeElement).toBe(keep)
  expect(readHall()).toHaveLength(1)

  await userEvent.click(keep)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(saved().crisis!.endSeen).toBe(true)
  // Shown once: a reload doesn't bring it back, nor record the run again.
  cleanup()
  render(<App />)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(readHall()).toHaveLength(1)
  expect(readHall()[0]).toMatchObject({ id: '7', ending: 'won' })
})

test('game over shows the failed act, and Escape keeps playing', async () => {
  const onKeepPlaying = vi.fn()
  render(
    <I18nProvider content={content}>
      <EndDialog
        content={content}
        state={lost()}
        ending="lost"
        onKeepPlaying={onKeepPlaying}
        onNewParty={() => {}}
        onLookBack={() => {}}
      />
    </I18nProvider>
  )
  expect(dialog().getByText('Game over')).toBeTruthy()
  expect(dialog().getByText(/✗ failed day/)).toBeTruthy()
  expect(dialog().getByRole('button', { name: 'Keep playing with this party' })).toBeTruthy()
  await userEvent.keyboard('{Escape}')
  expect(onKeepPlaying).toHaveBeenCalledOnce()
})

test('fallen: New party or Look back, never Keep playing; the banner stays', async () => {
  localStorage.setItem(SAVE_KEY, serialize(fallen(newGame(9, content))))
  render(<App />)
  expect(dialog().getByRole('heading', { name: 'The party has fallen' })).toBeTruthy()
  expect(dialog().queryByRole('button', { name: /Keep playing/ })).toBeNull()
  expect(dialog().getByRole('button', { name: 'New party' })).toBeTruthy()
  await userEvent.click(dialog().getByRole('button', { name: 'Look back' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('status').textContent).toMatch(/The party has fallen/)
  expect(readHall()).toEqual([expect.objectContaining({ id: '9', ending: 'fallen' })])
  // The Saves menu lists the Hall.
  await userEvent.click(screen.getByRole('button', { name: 'Saves' }))
  await userEvent.click(screen.getByRole('button', { name: 'Hall of the Fallen (1)' }))
  const hall = within(screen.getByRole('region', { name: 'Hall of the Fallen' }))
  expect(hall.getByText(/Day 1 · Fallen/)).toBeTruthy()
})

test('the Hall holds one record per run, updated when the run ends again', () => {
  const at = '2026-11-13'
  const run = lost()
  expect(recordRun(runRecord(run, content, at))).toBe(true)
  expect(recordRun(runRecord(run, content, at))).toBe(false)
  expect(recordRun(runRecord(fallen(run), content, at))).toBe(true)
  const hall = readHall()
  expect(hall).toHaveLength(1)
  expect(hall[0]).toMatchObject({ ending: 'fallen', acts: ['failed', null, null] })
  // A record that no longer validates is dropped on load.
  localStorage.setItem(HALL_KEY, JSON.stringify([{ id: 'x' }, ...hall]))
  expect(readHall()).toHaveLength(1)
})
