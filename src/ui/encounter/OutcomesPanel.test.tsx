// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { OptionPreview, ShownOutcome } from '../../engine/encounters/preview'
import { OutcomesPanel } from './OutcomesPanel'

afterEach(cleanup)

const long = (n: number) => `Outcome ${n}: ${'a long consequence that runs on and on '.repeat(6)}`
const outcome = (tier: ShownOutcome['tier'], n: number): ShownOutcome => ({
  tier,
  hidden: false,
  text: long(n),
  effects: [],
  next: 'end',
  xp: 0,
  twist: null,
})

test('a long outcome set is rendered in full, in a box that grows rather than scrolls', () => {
  const option: OptionPreview = {
    id: 'o',
    label: 'Press on',
    kind: 'check',
    available: true,
    unmet: [],
    check: null,
    outcomes: [outcome('fail', 1), outcome('partial', 2), outcome('success', 3)],
  }
  render(<OutcomesPanel id="out" option={option} twist={null} showText />)
  const rows = within(screen.getByRole('region', { name: 'Outcomes' })).getAllByRole('listitem')
  expect(rows.map((r) => r.textContent)).toEqual([
    expect.stringContaining(long(3).trim()),
    expect.stringContaining(long(2).trim()),
    expect.stringContaining(long(1).trim()),
  ])
  // The box has a minimum height and no fixed height or overflow of its own (theme.css).
  const css = readFileSync('src/ui/theme.css', 'utf8')
  const rule = css.match(/\.outcomes-box \{([^}]*)\}/)![1]
  expect(rule).toMatch(/min-height:/)
  expect(rule).not.toMatch(/(^|[^-])height:|max-height:|overflow:/)
})

const fixed = (text: string, effects: string[], next: ShownOutcome['next'] = 'end') => ({
  id: 'f',
  label: 'Climb',
  kind: 'check' as const,
  available: true,
  unmet: [],
  check: null,
  outcomes: [
    { tier: 'fail' as const, hidden: false as const, text, effects, next, xp: 0, twist: null },
    {
      tier: 'success' as const,
      hidden: false as const,
      text: 'Up.',
      effects: [],
      next: 'end' as const,
      xp: 0,
      twist: null,
    },
  ],
})

test('the rows hide their story text unless it is shown, and a row without chips still reads', () => {
  const option = fixed('Lyra slips.', ['−4 HP'])
  const { rerender } = render(
    <OutcomesPanel id="out" option={option} twist={null} showText={false} />
  )
  const rows = () =>
    within(screen.getByRole('region', { name: 'Outcomes' }))
      .getAllByRole('listitem')
      .map((r) => r.textContent)
  expect(rows()).toEqual(['Success: no effect', 'Failure: −4 HP'])
  rerender(<OutcomesPanel id="out" option={option} twist={null} showText />)
  expect(rows()).toEqual(['Success: Up.', 'Failure: Lyra slips.−4 HP'])
  rerender(
    <OutcomesPanel id="out" option={fixed('On.', [], 'stage')} twist={null} showText={false} />
  )
  expect(rows()[1]).toBe('Failure: the scene moves on')
})
