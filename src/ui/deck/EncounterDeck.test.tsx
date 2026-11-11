// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { SituationSchema } from '../../schema/encounter'
import { EncounterDeck } from './EncounterDeck'

const content = fixtureContent()
const renderDeck = () =>
  render(<EncounterDeck content={content} state={makeState()} onAction={() => {}} />)
const plays = () => screen.queryAllByRole('button', { name: /^Play / })
const toggle = () => screen.getByRole('button', { name: /^(Show|Hide) encounters/ })

afterEach(() => {
  cleanup()
  localStorage.clear()
})

test('the encounter list starts collapsed, with the filter and random draw still shown', () => {
  renderDeck()
  expect(plays()).toHaveLength(0)
  expect(toggle().getAttribute('aria-expanded')).toBe('false')
  expect(toggle().textContent).toMatch(/^Show encounters \(\d+\)$/)
  const list = document.getElementById(toggle().getAttribute('aria-controls')!)!
  expect(list.hidden).toBe(true)
  expect(screen.getByRole('button', { name: 'Random draw' })).toBeTruthy()
  expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
})

test('the toggle expands and collapses the list', async () => {
  renderDeck()
  await userEvent.click(toggle())
  expect(toggle().getAttribute('aria-expanded')).toBe('true')
  expect(toggle().textContent).toBe('Hide encounters')
  expect(plays().length).toBeGreaterThan(0)
  await userEvent.click(toggle())
  expect(plays()).toHaveLength(0)
})

test('the expanded state is remembered across renders', async () => {
  const { unmount } = renderDeck()
  await userEvent.click(toggle())
  unmount()
  renderDeck()
  expect(toggle().getAttribute('aria-expanded')).toBe('true')
  expect(plays().length).toBeGreaterThan(0)
})

test('collapsed, the toggle also shows how many encounters are invalid', () => {
  const broken = (id: string) => ({
    ...SituationSchema.parse({ id, title: id, stages: { start: { text: '{gone}' } } }),
    source: 'original' as const,
    file: 'x',
  })
  const withBroken = {
    ...content,
    situations: { ...content.situations, 'bad-a': broken('bad-a'), 'bad-b': broken('bad-b') },
  }
  render(<EncounterDeck content={withBroken} state={makeState()} onAction={() => {}} />)
  expect(toggle().textContent).toMatch(/^Show encounters \(\d+ · ⚠ 2\)$/)
})
