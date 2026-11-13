// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { XP_BY_LEVEL } from '../engine/constants'
import { SKILLS, statLabel } from '../engine/rules/abilities'
import { brom, lyra } from '../engine/test-fixtures'
import type { CamaraderieInfo } from '../engine/town/camaraderie'
import type { Accessory } from '../schema/gear'
import type { SkillUse } from '../schema/state'
import { MAX_LEVEL } from '../schema/types'
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
  // The sheet is in the page (so aria-controls points at it) but hidden.
  const sheet = document.getElementById(toggle('Brom').getAttribute('aria-controls') ?? '')
  expect(sheet?.hidden).toBe(true)
  expect(sheet?.contains(b.getByText('Sleight of Hand'))).toBe(true)
  expect(b.queryByRole('heading', { name: 'STR' })).toBeNull() // hidden from the accessibility tree
})

test('headings nest: Party, then each name, then the sheet groups', async () => {
  render(<PartyPanel party={[brom, lyra]} />)
  expect(screen.getByRole('heading', { level: 2, name: 'Party' })).toBeTruthy()
  const name = card('Brom').getByRole('heading', { level: 3 })
  expect(name.textContent).toMatch(/^Brom/)
  expect(name.contains(toggle('Brom'))).toBe(true)
  await userEvent.click(toggle('Brom'))
  expect(card('Brom').getByRole('heading', { level: 4, name: 'STR' })).toBeTruthy()
  expect(document.getElementById(toggle('Brom').getAttribute('aria-controls') ?? '')?.hidden).toBe(
    false
  )
})

test('expanding shows the full sheet: abilities, all 18 skills, proficiency marked', async () => {
  render(<PartyPanel party={[brom, lyra]} />)
  await userEvent.click(toggle('Brom'))
  expect(toggle('Brom').getAttribute('aria-expanded')).toBe('true')
  const b = card('Brom')
  for (const a of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])
    expect(b.getAllByText(a).length).toBeGreaterThan(0)
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

test('strain shows on the card, and per skill in the sheet', async () => {
  render(<PartyPanel party={[{ ...brom, strain: { athletics: 2 } }]} />)
  expect(screen.getByText('Athletics −2')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: /Brom/ }))
  const athletics = screen.getAllByText('Athletics').find((e) => e.className === 'skill-name')!
  expect(athletics.parentElement?.textContent).toMatch(/strain −2/)
})

test('no strain, no strain badge', () => {
  render(<PartyPanel party={[brom]} />)
  expect(document.querySelector('.badge.strain')).toBeNull()
})

test('each card shows its level and a bar to the next; the sheet has XP, hired and accessory', async () => {
  const hired = { ...lyra, level: 2, xp: XP_BY_LEVEL[1], hired: true, oldWound: 'dex' as const }
  render(<PartyPanel party={[brom, hired]} />)
  expect(toggle('Lyra').textContent).toMatch(/lv 2/)
  const bar = card('Lyra').getByRole('meter', { name: 'Lyra XP' })
  expect(bar.getAttribute('aria-valuetext')).toMatch(/to level 3$/)
  await userEvent.click(toggle('Lyra'))
  expect(card('Lyra').getByText('Hired')).toBeTruthy()
  expect(card('Lyra').getByText('Old wound: A badly set leg (−2 DEX)')).toBeTruthy()
  expect(card('Lyra').getByText(/^Accessory:/)).toBeTruthy()
  // At the cap there is no bar.
  cleanup()
  render(<PartyPanel party={[{ ...brom, level: MAX_LEVEL, xp: XP_BY_LEVEL[MAX_LEVEL - 1] }]} />)
  expect(screen.queryByRole('meter', { name: 'Brom XP' })).toBeNull()
})

test('dismissing a hired member asks first; founders have no Dismiss', async () => {
  const onAction = vi.fn()
  render(<PartyPanel party={[brom, { ...lyra, hired: true }]} onAction={onAction} />)
  await userEvent.click(toggle('Brom'))
  expect(card('Brom').queryByRole('button', { name: 'Dismiss' })).toBeNull()
  await userEvent.click(toggle('Lyra'))
  await userEvent.click(card('Lyra').getByRole('button', { name: 'Dismiss' }))
  expect(onAction).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(card('Lyra').getByRole('button', { name: 'Keep' }))
  await userEvent.click(card('Lyra').getByRole('button', { name: 'Keep' }))
  expect(card('Lyra').queryByRole('button', { name: 'Keep' })).toBeNull()
  await userEvent.click(card('Lyra').getByRole('button', { name: 'Dismiss' }))
  await userEvent.click(card('Lyra').getByRole('button', { name: 'Dismiss' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'dismissMember', characterId: 'lyra' })
})

test('the accessory slot: the worn one with its hooks, Take off, and wearing from the gear', async () => {
  const ring: Accessory = {
    id: 'ring',
    name: 'Fox-eyed Ring',
    tier: 1,
    hooks: [{ hook: 'skill', skill: 'perception', amount: 1 }],
    value: 20,
  }
  const charm: Accessory = { id: 'charm', name: 'Lucky Charm', tier: 1, hooks: [], value: 10 }
  const onAction = vi.fn()
  render(<PartyPanel party={[{ ...brom, accessory: ring }]} gear={[charm]} onAction={onAction} />)
  await userEvent.click(toggle('Brom'))
  const b = card('Brom')
  expect(b.getByText('Fox-eyed Ring (+1 Perception)')).toBeTruthy()
  await userEvent.click(b.getByRole('button', { name: 'Take off' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'unequipAccessory', characterId: 'brom' })
  expect(b.getByRole('combobox', { name: 'Accessory for Brom to wear' })).toBeTruthy()
  await userEvent.click(b.getByRole('button', { name: 'Wear instead' }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'equipAccessory',
    characterId: 'brom',
    id: 'charm',
  })
})

test('the camaraderie line: tier, value and desertion, explained on hover', () => {
  const info: CamaraderieInfo = {
    value: 5,
    max: 40,
    tier: 'fractured',
    label: 'Fractured',
    causes: ["food or water won't last everyone a day"],
    desertRisk: 0.25,
    desertChance: 0.25,
    fracturedMax: 9,
    failCost: 2,
    fleeCost: 4,
  }
  render(<PartyPanel party={[brom]} camaraderie={info} />)
  const line = document.querySelector('.camaraderie')!
  expect(line.textContent).toMatch(/^Camaraderie: Fractured \(5\/40\) · desertion 25%/s)
  expect(screen.getByRole('tooltip', { hidden: true }).textContent).toMatch(
    /Now: food or water won't last everyone a day\./
  )
  expect(screen.getByRole('tooltip', { hidden: true }).textContent).toMatch(/failed check \(−2/)
})
