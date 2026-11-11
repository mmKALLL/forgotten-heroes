// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test } from 'vitest'
import { step, type Action } from '../../engine/state'
import { fixtureContent, makeEncounter, makeState } from '../../engine/test-fixtures'
import { SituationSchema } from '../../schema/encounter'
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

const card = (name: string) => screen.getByRole('article', { name })
const outcomes = () => within(screen.getByRole('region', { name: 'Outcomes' }))

test('shows the situation, its source, and every option compactly with its odds', () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  expect(screen.getByRole('heading', { name: 'Roadside' })).toBeTruthy()
  expect(screen.getByText('Original')).toBeTruthy()
  expect(screen.getByText(/begs for help\. A child waits at home\./)).toBeTruthy()
  expect(outcomes().getByText('Possible twist: it is a trap (chance: ?)')).toBeTruthy()
  const read = within(card('Read them'))
  // d20 faces by default, like the practice check: 55% to succeed is 10+ on the d20.
  expect(read.getByText('Insight vs DC 12')).toBeTruthy()
  expect(read.getByText(/on the d20/).textContent).toBe('needs 10+ on the d20')
  expect(read.getByRole('img', { name: /Success: 10–19 \(50%\)/ })).toBeTruthy()
  // The outcome tiers and twists live in the shared panel, not in the cards.
  expect(read.queryByText(/Lyra reads them\./)).toBeNull()
  expect(within(card('Help them')).queryByText(/If it is a trap:/)).toBeNull()
  expect(within(card('Help them')).queryByText('−20 gp')).toBeNull()
  expect(outcomes().getByText('Hover or focus an option to see its outcomes.')).toBeTruthy()
})

test("hovering an option's card shows its outcome tiers, and its twist, in the shared panel", async () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  await userEvent.hover(card('Read them'))
  expect(outcomes().getAllByText(/Lyra reads them\./)).toHaveLength(2) // success, and critical success by fallback
  // The colour marks the tier; its name stays in the tooltip and for screen readers.
  expect(outcomes().getAllByTitle('Critical success')).toHaveLength(1)
  expect(outcomes().getByText('Partial success:', { selector: '.sr-only' })).toBeTruthy()
  expect(outcomes().queryByText(/continues|ends/)).toBeNull()
  await userEvent.hover(card('Help them'))
  expect(outcomes().queryByText(/Lyra reads them\./)).toBeNull()
  expect(outcomes().getByText(/If it is a trap:/)).toBeTruthy()
  expect(outcomes().getByText('−20 gp')).toBeTruthy()
  // The last option stays shown once the pointer leaves.
  await userEvent.unhover(card('Help them'))
  expect(outcomes().getByText(/If it is a trap:/)).toBeTruthy()
})

test('focusing anything in a card shows its outcomes, and Choose is described by the panel', async () => {
  render(<Harness initial={started('roadside')} />)
  const choose = screen.getByRole('button', { name: 'Choose Read them' })
  act(() => choose.focus())
  expect(outcomes().getAllByText(/Lyra reads them\./)).toHaveLength(2)
  const panel = document.getElementById(choose.getAttribute('aria-describedby')!)!
  expect(panel.textContent).toMatch(/Lyra reads them\./)
  act(() => screen.getByRole('combobox', { name: 'Actor for Rob them' }).focus())
  expect(outcomes().getAllByText(/Their purse\./)).toHaveLength(2)
  expect(panel.textContent).toMatch(/Their purse\./)
})

test('hovering never changes the cards themselves', async () => {
  render(<Harness initial={started('roadside')} />)
  const cards = screen.getAllByRole('article')
  const before = cards.map((c) => c.innerHTML)
  await userEvent.hover(card('Read them'))
  await userEvent.hover(card('Help them'))
  expect(screen.getAllByRole('article').map((c) => c.innerHTML)).toEqual(before)
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
  expect(
    (screen.getByRole('button', { name: 'Choose Give them money' }) as HTMLButtonElement).disabled
  ).toBe(true)
  expect(screen.getByText('needs 20 gp')).toBeTruthy()
})

test('the actor picker lists the whole party, with the best preselected', () => {
  const state = started('roadside')
  render(
    <Harness
      initial={{
        ...state,
        party: [...state.party, { ...state.party[0], id: 'cal', name: 'Cal', hp: 0 }],
      }}
    />
  )
  const actor = screen.getByRole('combobox', { name: 'Actor for Read them' }) as HTMLSelectElement
  expect([...actor.options].map((o) => [o.textContent, o.disabled])).toEqual([
    ['Lyra +2', false],
    ['Brom +1', false],
    ["Cal (can't act)", true],
  ])
  expect(actor.value).toBe('lyra')
  expect(screen.queryByText(/Auto/)).toBeNull()
})

test('the player can pick who acts, which changes the preview', async () => {
  render(<Harness initial={started('roadside')} />)
  const read = within(card('Read them'))
  await userEvent.hover(card('Read them'))
  expect(read.getByText(/on the d20/).textContent).toMatch(/needs 10\+ on the d20$/)
  await userEvent.selectOptions(read.getByRole('combobox', { name: 'Actor for Read them' }), 'brom')
  expect(read.getByText(/on the d20/).textContent).toMatch(/needs 11\+ on the d20$/)
  expect(outcomes().getAllByText(/Brom reads them\./)).toHaveLength(2)
  expect(outcomes().getByText(/Brom acts/)).toBeTruthy()
})

test("a situational modifier shows next to the actor's, and Edge reads as best of 2", () => {
  const state = started('roadside')
  render(
    <Harness
      initial={{
        ...state,
        encounter: { ...state.encounter!, nextCheckModifier: -2, position: 'edge' },
      }}
    />
  )
  const read = within(card('Read them'))
  expect(read.getByText(/on the d20/).textContent).toMatch(
    /^−2 \(situational\) · needs \d+\+ on the d20 \(best of 2\)$/
  )
  expect(read.getByText('Insight vs DC 12 · Edge')).toBeTruthy()
  expect(read.getByRole('option', { name: 'Lyra +2', selected: true })).toBeTruthy()
  expect(screen.getByText('Edge', { selector: '.badge' })).toBeTruthy()
})

test('a situational modifier with a reason shows the reason', () => {
  const state = started('roadside')
  render(
    <Harness
      initial={{
        ...state,
        encounter: { ...state.encounter!, nextCheckModifier: -2, nextCheckReason: 'misread' },
      }}
    />
  )
  const read = within(card('Read them'))
  expect(read.getByText(/on the d20/).textContent).toMatch(
    /^−2 \(misread\) · needs \d+\+ on the d20$/
  )
})

test('a revealed twist shows its chance', () => {
  const state = started('roadside')
  render(
    <Harness initial={{ ...state, encounter: { ...state.encounter!, twistRevealed: true } }} />
  )
  expect(outcomes().getByText('Possible twist: it is a trap (chance: 50%)')).toBeTruthy()
})

test('a stage that does not exist offers no options, only Close', async () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, stage: 'toString' } }} />)
  expect(screen.queryByRole('button', { name: /^Choose / })).toBeNull()
  expect(screen.getByText('The encounter is over.')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByText('closed')).toBeTruthy()
})

test('a party too hurt to roll, with nothing affordable left, can only close', async () => {
  const state = started('grudge', makeState({ gold: 0 }))
  render(<Harness initial={{ ...state, party: state.party.map((c) => ({ ...c, hp: 0 })) }} />)
  expect(screen.getByText('The encounter is over.')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByText('closed')).toBeTruthy()
})

test('focus follows the play: the dice, then the first option that can be chosen, then Close', async () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Choose Read them' }))
  const skip = screen.getByRole('button', { name: 'Skip dice animation' })
  expect(document.activeElement).toBe(skip)
  await userEvent.keyboard('{Enter}')
  const firstAvailable = screen
    .getAllByRole('button', { name: /^Choose / })
    .find((b) => !(b as HTMLButtonElement).disabled)
  expect(document.activeElement).toBe(firstAvailable)
  await userEvent.click(screen.getByRole('button', { name: 'Choose Help carefully' }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
})

test('an actor picked for an option does not carry over to a same-named option on the next stage', async () => {
  const go = (goto?: string) => ({
    id: 'go',
    kind: 'check',
    label: 'Go on',
    check: { skill: 'athletics', dc: 10 },
    outcomes: {
      fail: { text: 'On.', goto },
      partial: { text: 'On.', goto },
      success: { text: 'On.', goto },
    },
  })
  const situation = SituationSchema.parse({
    id: 'two-stages',
    title: 'Two stages',
    stages: {
      start: { text: 'First.', options: [go('next')] },
      next: { text: 'Second.', options: [go()] },
    },
  })
  render(
    <Harness
      initial={makeState({
        encounter: makeEncounter({ situation, log: [{ text: 'First.', tone: 'info' }] }),
      })}
    />
  )
  const actor = () => screen.getByRole('combobox', { name: 'Actor for Go on' }) as HTMLSelectElement
  await userEvent.selectOptions(actor(), 'lyra')
  expect(actor().value).toBe('lyra')
  await userEvent.click(screen.getByRole('button', { name: 'Choose Go on' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip dice animation' }))
  expect(screen.getByText('Second.')).toBeTruthy()
  expect(actor().value).toBe('brom')
  expect(actor().options).toHaveLength(2)
})
