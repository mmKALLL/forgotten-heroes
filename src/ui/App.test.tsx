// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
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
  expect(screen.getAllByRole('article').map((a) => a.querySelector('strong')?.textContent)).toEqual(names)
})
