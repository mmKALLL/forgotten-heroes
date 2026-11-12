// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { brom, lyra, makeState } from '../engine/test-fixtures'
import { CheckPanel } from './CheckPanel'

const ODDS_LABEL_KEY = 'forgotten-heroes/ui/odds-label'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const renderPanel = (showLabelToggle?: boolean) =>
  render(<CheckPanel state={makeState()} onAction={() => {}} showLabelToggle={showLabelToggle} />)
const bar = () => screen.getByRole('img', { name: /Success/ })
const panelText = () => screen.getByRole('region', { name: 'Practice check' }).textContent

test('while the label toggle is hidden, a stored % preference is ignored', () => {
  localStorage.setItem(ODDS_LABEL_KEY, 'percent')
  renderPanel()
  expect(bar().textContent).toMatch(/\d+\+/)
  expect(screen.queryByRole('button', { name: '%' })).toBeNull()
})

test('the label toggle, when shown, switches to % and remembers the choice', async () => {
  const { unmount } = renderPanel(true)
  expect(screen.getByRole('button', { name: 'd20' }).getAttribute('aria-pressed')).toBe('true')
  expect(panelText()).toMatch(/: needs \d+\+ on the d20/)
  await userEvent.click(screen.getByRole('button', { name: '%' }))
  expect(bar().textContent).toMatch(/%/)
  expect(panelText()).toMatch(/\d+% to succeed/)
  expect(panelText()).not.toMatch(/on the d20/)
  expect(localStorage.getItem(ODDS_LABEL_KEY)).toBe('percent')
  unmount()
  renderPanel(true)
  expect(screen.getByRole('button', { name: '%' }).getAttribute('aria-pressed')).toBe('true')
  await userEvent.click(screen.getByRole('button', { name: 'd20' }))
  expect(bar().textContent).toMatch(/\d+\+/)
  expect(localStorage.getItem(ODDS_LABEL_KEY)).toBe('faces')
})

test('the actor picker shows strain for the chosen skill', async () => {
  const party = [{ ...brom, strain: { persuasion: 1 } }, lyra]
  render(<CheckPanel state={makeState({ party })} onAction={() => {}} />)
  const actor = within(screen.getByRole('combobox', { name: 'Actor' }))
  expect(actor.getByRole('option', { name: /^Brom [+−]\d+ · strain −1$/ })).toBeTruthy()
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Check' }), 'athletics')
  expect(actor.getByRole('option', { name: /^Brom [+−]\d+$/ })).toBeTruthy()
})
