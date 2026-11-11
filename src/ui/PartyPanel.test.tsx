// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { SKILLS, statLabel } from '../engine/rules/abilities'
import { brom, lyra } from '../engine/test-fixtures'
import type { SkillUse } from '../schema/state'
import { PartyPanel } from './PartyPanel'

afterEach(cleanup)

const card = (name: string) => within(screen.getByRole('article', { name }))
const toggle = (name: string) => card(name).getByRole('button', { name: new RegExp(`^${name}\\b`) })

test('cards are compact by default: name, class, HP, best three skills', () => {
  render(<PartyPanel party={[brom, lyra]} />)
  const b = card('Brom')
  expect(toggle('Brom').getAttribute('aria-expanded')).toBe('false')
  expect(b.getByRole('meter', { name: 'Brom HP' })).toBeTruthy()
  expect(b.getByText(/^Best: Athletics \+5/)).toBeTruthy()
  expect(b.queryByText('STR')).toBeNull()
  expect(b.queryByText('Sleight of Hand')).toBeNull()
})

test('expanding shows the full sheet: abilities, all 18 skills, proficiency marked', async () => {
  render(<PartyPanel party={[brom, lyra]} />)
  await userEvent.click(toggle('Brom'))
  expect(toggle('Brom').getAttribute('aria-expanded')).toBe('true')
  const b = card('Brom')
  for (const a of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) expect(b.getAllByText(a).length).toBeGreaterThan(0)
  expect(SKILLS).toHaveLength(18)
  for (const s of SKILLS) expect(b.getByText(statLabel(s))).toBeTruthy()
  // Brom is proficient in Athletics and Intimidation only.
  const marked = b.getAllByTitle('Proficient').map((m) => m.closest('li')?.textContent)
  expect(marked).toHaveLength(2)
  expect(marked.join(' ')).toMatch(/Athletics.*Intimidation/)
  // Effective modifiers: Athletics is STR +3 plus proficiency +2.
  expect(b.getByText('Athletics').closest('li')?.textContent).toMatch(/\+5/)
  // Only Brom's card expanded.
  expect(toggle('Lyra').getAttribute('aria-expanded')).toBe('false')
})

test('Enter toggles the sheet, and exhaustion shows on the compact card', async () => {
  render(<PartyPanel party={[{ ...brom, exhaustion: 1 }]} />)
  expect(card('Brom').getByText('Exhaustion 1')).toBeTruthy()
  toggle('Brom').focus()
  await userEvent.keyboard('{Enter}')
  expect(toggle('Brom').getAttribute('aria-expanded')).toBe('true')
  // Exhaustion is part of the effective modifier: Athletics +5 −2.
  expect(card('Brom').getByText('Athletics').closest('li')?.textContent).toMatch(/\+3/)
  await userEvent.keyboard('{Enter}')
  expect(toggle('Brom').getAttribute('aria-expanded')).toBe('false')
})

test("the sheet counts each skill's uses today", async () => {
  const skillUses: SkillUse[] = [
    { day: 3, characterId: 'brom', skill: 'athletics' },
    { day: 3, characterId: 'brom', skill: 'athletics' },
    { day: 2, characterId: 'brom', skill: 'survival' },
    { day: 3, characterId: 'lyra', skill: 'survival' },
  ]
  render(<PartyPanel party={[brom, lyra]} skillUses={skillUses} day={3} />)
  await userEvent.click(toggle('Brom'))
  const b = card('Brom')
  expect(b.getByText('Athletics').closest('li')?.textContent).toMatch(/2× today/)
  expect(b.getByText('Survival').closest('li')?.textContent).not.toMatch(/today/)
})
