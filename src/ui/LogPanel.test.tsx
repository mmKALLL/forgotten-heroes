// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { fixtureContent } from '../engine/test-fixtures'
import { I18nProvider } from './i18n/I18n'
import { LogPanel } from './LogPanel'

afterEach(cleanup)

test('the journal lists its lines newest first, in its tone, at 14 px', () => {
  render(
    <I18nProvider content={fixtureContent()}>
      <LogPanel
        log={[
          { day: 1, text: 'The party sets out.', tone: 'info' },
          { day: 2, text: 'Wolves on the road.', tone: 'bad' },
        ]}
      />
    </I18nProvider>
  )
  const lines = within(screen.getByRole('list', { name: 'Log' })).getAllByRole('listitem')
  expect(lines.map((li) => li.textContent)).toEqual([
    'Day 2 Wolves on the road.',
    'Day 1 The party sets out.',
  ])
  expect(lines[0].className).toBe('tone-bad')
  // The designer's call (Plan 6 U2): the journal's text is 14 px.
  const css = readFileSync('src/ui/theme.css', 'utf8')
  expect(css).toMatch(/\n\.log \{[^}]*font-size: 0\.875rem;/)
})
