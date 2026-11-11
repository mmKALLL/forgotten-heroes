// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test } from 'vitest'
import { step, type Action } from '../../engine/state'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { EncounterView } from './EncounterView'

const content = fixtureContent()
const started = (situationId: string, state: GameState = makeState()) =>
  step(state, { type: 'startEncounter', situationId }, content)

/** Runs the real engine behind the view, like useGame does. */
function Harness({ initial }: { initial: GameState }) {
  const [state, setState] = useState(initial)
  const onAction = (a: Action) => setState((s) => step(s, a, content))
  return state.encounter ? <EncounterView state={state} onAction={onAction} /> : <p>closed</p>
}

afterEach(cleanup)

test('shows the situation, its source, and every option with odds and outcomes', () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  expect(screen.getByRole('heading', { name: 'Roadside' })).toBeTruthy()
  expect(screen.getByText('Original')).toBeTruthy()
  expect(screen.getByText(/begs for help\. A child waits at home\./)).toBeTruthy()
  expect(screen.getByText('Possible twist: it is a trap (chance: ?)')).toBeTruthy()
  const read = within(screen.getByRole('article', { name: 'Read them' }))
  expect(read.getByText('Insight vs DC 12')).toBeTruthy()
  // d20 faces by default, like the practice check: 55% to succeed is 10+ on the d20.
  expect(read.getByText(/on the d20/).textContent).toMatch(/ Lyra \+2: needs 10\+ on the d20$/)
  expect(read.getByRole('img', { name: /Success: 10–19 \(50%\)/ })).toBeTruthy()
  expect(read.getAllByText(/Lyra reads them\./)).toHaveLength(2) // success, and critical success by fallback
  const trust = within(screen.getByRole('article', { name: 'Help them' }))
  expect(trust.getByText(/If it is a trap:/)).toBeTruthy()
  expect(trust.getByText('−20 gp')).toBeTruthy()
})

test('a fixed option ends the encounter, and Close clears it', async () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Choose Help them' }))
  expect(screen.getByText(/thanks you\./)).toBeTruthy()
  expect(screen.getByText('The encounter is over.')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByText('closed')).toBeTruthy()
})

test('a check animates the dice and hides the result until they settle (click skips)', async () => {
  render(<Harness initial={started('cliff')} />)
  await userEvent.click(screen.getByRole('button', { name: 'Choose Climb' }))
  const skip = screen.getByRole('button', { name: 'Skip dice animation' })
  expect(screen.queryByRole('button', { name: /^Choose / })).toBeNull()
  await userEvent.click(skip)
  expect(screen.getByRole('button', { name: /^Rolled \d+$/ })).toBeTruthy()
  expect(screen.getByText(/^(Brom slips\.|A scraped climb\.|Up you go\.)/)).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBeGreaterThan(0)
})

test('unmet requirements disable the option and say why', () => {
  render(<Harness initial={started('roadside', makeState({ gold: 5 }))} />)
  expect((screen.getByRole('button', { name: 'Choose Give them money' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('needs 20 gp')).toBeTruthy()
})

test('the player can pick who acts', async () => {
  render(<Harness initial={started('roadside')} />)
  const read = within(screen.getByRole('article', { name: 'Read them' }))
  await userEvent.selectOptions(read.getByRole('combobox', { name: 'Actor for Read them' }), 'brom')
  expect(read.getByText(/Brom \+1:/)).toBeTruthy()
})

test("a situational modifier shows next to the actor's, and Edge reads as best of 2", () => {
  const state = started('roadside')
  render(
    <Harness initial={{ ...state, encounter: { ...state.encounter!, nextCheckModifier: -2, position: 'edge' } }} />
  )
  const read = within(screen.getByRole('article', { name: 'Read them' }))
  expect(read.getByText(/on the d20/).textContent).toMatch(
    / Lyra \+2 −2 \(situational\): needs \d+\+ on the d20 \(best of 2\)$/
  )
  expect(screen.getByText('Edge', { selector: '.badge' })).toBeTruthy()
})

test('a revealed twist shows its chance', () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twistRevealed: true } }} />)
  expect(screen.getByText('Possible twist: it is a trap (chance: 50%)')).toBeTruthy()
})
