// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { step, type Action } from '../../engine/state'
import { brom, fixtureContent, lyra, makeEncounter, makeState } from '../../engine/test-fixtures'
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
const choose = (name: string) => screen.getByRole('button', { name: `Choose ${name}` })
const checkLine = (name: string) => card(name).querySelector('.check-line')!.textContent
const chooseTargets = () => screen.getAllByRole('button', { name: /^Choose / })

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
  expect(read.queryByText(/needs|on the d20/)).toBeNull()
  expect(read.getByRole('img', { name: /Success: 10–19 \(50%\)/ })).toBeTruthy()
  // The outcome tiers and twists live in the shared panel, not in the cards.
  expect(read.queryByText(/Lyra reads them\./)).toBeNull()
  expect(within(card('Help them')).queryByText(/If it is a trap:/)).toBeNull()
  expect(within(card('Help them')).queryByText('−20 gp')).toBeNull()
  // The first option is focused, so the panel shows its outcomes.
  expect(document.activeElement).toBe(chooseTargets()[0])
  expect(outcomes().queryByText('Hover or focus an option to see its outcomes.')).toBeNull()
})

test("hovering an option's card shows its outcome tiers, and its twist, in the shared panel", async () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  await userEvent.hover(card('Read them'))
  expect(outcomes().getAllByText(/Lyra reads them\./)).toHaveLength(1)
  // The colour marks the tier; its name stays in the tooltip and for screen readers.
  expect(outcomes().getByTitle('Success')).toBeTruthy()
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

test('the outcomes panel shows no rows for the critical tiers, whose odds stay on the bar', async () => {
  render(<Harness initial={started('roadside')} />)
  await userEvent.hover(card('Rob them'))
  // Rob them has its own critical failure ("Caught!"): it stays a surprise until rolled.
  expect(outcomes().getAllByRole('listitem')).toHaveLength(3)
  expect(outcomes().queryByText(/Caught!/)).toBeNull()
  expect(outcomes().queryByTitle(/Critical/)).toBeNull()
  const rob = within(card('Rob them'))
  expect(rob.getByRole('img', { name: /Critical failure: 1 / })).toBeTruthy()
  expect(rob.getByRole('img', { name: /Critical success: 20 / })).toBeTruthy()
})

test('focusing anything in a card shows its outcomes, and its choose target is described by the panel', async () => {
  render(<Harness initial={started('roadside')} />)
  const read = choose('Read them')
  act(() => read.focus())
  expect(read.tabIndex).toBe(0)
  expect(outcomes().getAllByText(/Lyra reads them\./)).toHaveLength(1)
  const ids = read.getAttribute('aria-describedby')!.split(' ')
  const panel = document.getElementById(ids[ids.length - 1])!
  expect(panel.textContent).toMatch(/Lyra reads them\./)
  act(() => screen.getByRole('combobox', { name: 'Actor for Rob them' }).focus())
  expect(outcomes().getAllByText(/Their purse\./)).toHaveLength(1)
  expect(panel.textContent).toMatch(/Their purse\./)
})

test('clicking anywhere on a card chooses it', async () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  await userEvent.click(card('Help them'))
  expect(screen.getByText(/thanks you\./)).toBeTruthy()
})

test.each(['{Enter}', ' '])('%s on a focused card chooses it', async (key) => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  act(() => choose('Help them').focus())
  await userEvent.keyboard(key)
  expect(screen.getByText(/thanks you\./)).toBeTruthy()
})

test('clicking or changing the actor picker does not choose the card', async () => {
  render(<Harness initial={started('roadside')} />)
  const actor = screen.getByRole('combobox', { name: 'Actor for Read them' })
  await userEvent.click(actor)
  await userEvent.selectOptions(actor, 'brom')
  act(() => actor.focus())
  await userEvent.keyboard('{Enter}')
  expect(screen.queryByRole('button', { name: 'Skip dice animation' })).toBeNull()
  expect(choose('Read them')).toBeTruthy()
  expect((actor as HTMLSelectElement).value).toBe('brom')
})

describe('the keyboard moves between the cards', () => {
  // With no gold, "Give them money" can't be chosen.
  const poor = () => {
    const state = started('roadside', makeState({ gold: 0 }))
    render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  }
  const focused = () => document.activeElement?.getAttribute('aria-label')
  const tabStops = () => chooseTargets().filter((b) => b.tabIndex === 0)

  test('the arrow keys move to the next or previous card, wrapping; only one is a tab stop', async () => {
    poor()
    const labels = chooseTargets().map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual([
      'Choose Help them',
      'Choose Help carefully',
      'Choose Read them',
      'Choose Rob them',
      'Choose Give them money',
      'Choose Leave',
    ])
    expect(focused()).toBe('Choose Help them')
    expect(tabStops()).toEqual([choose('Help them')])
    await userEvent.keyboard('{ArrowDown}')
    expect(focused()).toBe('Choose Help carefully')
    expect(tabStops()).toEqual([choose('Help carefully')])
    // The outcomes panel follows.
    expect(outcomes().getByText(/carefully/i)).toBeTruthy()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(focused()).toBe('Choose Rob them')
    // The card that can't be chosen is skipped.
    await userEvent.keyboard('{ArrowDown}')
    expect(focused()).toBe('Choose Leave')
    await userEvent.keyboard('{ArrowDown}')
    expect(focused()).toBe('Choose Help them')
    await userEvent.keyboard('{ArrowUp}')
    expect(focused()).toBe('Choose Leave')
    await userEvent.keyboard('{ArrowLeft}')
    expect(focused()).toBe('Choose Rob them')
    await userEvent.keyboard('{Home}')
    expect(focused()).toBe('Choose Help them')
    await userEvent.keyboard('{End}')
    expect(focused()).toBe('Choose Leave')
    // Tab leaves the cards from the tab stop.
    await userEvent.tab({ shift: true })
    expect(chooseTargets()).not.toContain(document.activeElement)
  })

  test('Space or Enter chooses the card the arrows reached', async () => {
    poor()
    await userEvent.keyboard('{End}')
    await userEvent.keyboard(' ')
    expect(screen.getByText('You walk on.')).toBeTruthy()
  })

  test('the arrow keys inside an actor picker stay there', async () => {
    poor()
    const actor = screen.getByRole('combobox', { name: 'Actor for Read them' })
    act(() => actor.focus())
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Home}{End}')
    expect(document.activeElement).toBe(actor)
  })

  test('focus shows as the card’s own outline, not the browser’s ring on the choose target', () => {
    // Vitest runs from the project root.
    const css = readFileSync('src/ui/theme.css', 'utf8')
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).toMatch(/\.card-choose:focus\s*\{\s*outline:\s*none;/)
    expect(rules).toMatch(
      /\.option-card:has\(\.card-choose:focus-visible\)\s*\{[^}]*border-color:\s*var\(--accent\)/
    )
    expect(rules).not.toMatch(/\.card-choose:focus-visible\s*\{[^}]*outline:\s*\d/)
  })
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
  await userEvent.click(choose('Help them'))
  expect(screen.getByText(/thanks you\./)).toBeTruthy()
  expect(screen.getByText('The encounter is over.')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByText('closed')).toBeTruthy()
})

test("a fixed option's effects show in its card, after its description or else its label", () => {
  const situation = SituationSchema.parse({
    id: 'toll',
    title: 'Toll',
    stages: {
      start: {
        text: 'Bandits block the road.',
        options: [
          {
            id: 'surrender',
            kind: 'fixed',
            label: 'Surrender',
            description: 'Nobody gets hurt. Everybody gets poorer.',
            outcome: { text: 'They take it.', effects: [{ effect: 'gold', amount: -25 }] },
          },
          {
            id: 'pay',
            kind: 'fixed',
            label: 'Pay them',
            outcome: {
              text: 'They count it.',
              effects: [
                { effect: 'log', text: 'Coins clink.' },
                { effect: 'gold', amount: -18 },
                { effect: 'days', amount: 1 },
              ],
            },
          },
          { id: 'wait', kind: 'fixed', label: 'Wait', outcome: { text: 'Time passes.' } },
          {
            id: 'fight',
            kind: 'check',
            label: 'Fight',
            check: { skill: 'athletics', dc: 12 },
            outcomes: {
              fail: { text: 'Ouch.', effects: [{ effect: 'gold', amount: -25 }] },
              partial: { text: 'Meh.', effects: [{ effect: 'gold', amount: -5 }] },
              success: { text: 'Ha.', effects: [{ effect: 'gold', amount: 10 }] },
            },
          },
        ],
      },
    },
  })
  const log = [{ text: 'Bandits block the road.', tone: 'info' as const }]
  render(<Harness initial={makeState({ encounter: makeEncounter({ situation, log }) })} />)
  const surrender = card('Surrender').querySelector('.card-choose p')!
  expect(surrender.textContent).toBe('Nobody gets hurt. Everybody gets poorer. (−25 gp)')
  // Log lines are not listed; the summary is read with the choose target.
  const pay = within(card('Pay them')).getByText('(−18 gp, 1 day passes)')
  expect(choose('Pay them').getAttribute('aria-describedby')).toContain(pay.parentElement!.id)
  expect(card('Wait').querySelector('.effect-summary')).toBeNull()
  expect(card('Fight').querySelector('.effect-summary')).toBeNull()
  expect(within(card('Fight')).queryByText(/gp/)).toBeNull()
})

test('a check animates the dice and hides the result until they settle (click skips)', async () => {
  render(<Harness initial={started('cliff')} />)
  await userEvent.click(choose('Climb'))
  const skip = screen.getByRole('button', { name: 'Skip dice animation' })
  expect(screen.queryByRole('button', { name: /^Choose / })).toBeNull()
  await userEvent.click(skip)
  expect(screen.getByRole('button', { name: /^Rolled \d+$/ })).toBeTruthy()
  expect(screen.getByText(/^(Brom slips\.|A scraped climb\.|Up you go\.)/)).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBeGreaterThan(0)
})

test('the outcome text starts below the dice and DC row, never beside it', async () => {
  render(<Harness initial={started('cliff')} />)
  await userEvent.click(choose('Climb'))
  await userEvent.click(screen.getByRole('button', { name: 'Skip dice animation' }))
  const row = screen.getByRole('button', { name: /^Rolled \d+$/ })
  const text = screen.getByText(/^(Brom slips\.|A scraped climb\.|Up you go\.)/)
  expect(row.contains(text)).toBe(false)
  expect(text.classList.contains('log-text')).toBe(true)
  expect(row.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('an encounter with an empty log still renders', () => {
  render(<Harness initial={makeState({ encounter: makeEncounter({ log: [] }) })} />)
  expect(screen.getByRole('heading', { name: 'Test road' })).toBeTruthy()
  expect(screen.getByRole('list', { name: 'Encounter log' }).children).toHaveLength(0)
})

test('unmet requirements disable the option and say why, and clicking it does nothing', async () => {
  render(<Harness initial={started('roadside', makeState({ gold: 5 }))} />)
  const donate = choose('Give them money')
  expect(donate.getAttribute('aria-disabled')).toBe('true')
  expect(card('Give them money').classList.contains('unavailable')).toBe(true)
  expect(screen.getByText('needs 20 gp')).toBeTruthy()
  await userEvent.click(card('Give them money'))
  act(() => donate.focus())
  await userEvent.keyboard('{Enter}')
  expect(screen.queryByText('The encounter is over.')).toBeNull()
  expect(choose('Give them money')).toBeTruthy()
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
  expect(read.getByRole('img', { name: /Success: 10–19/ })).toBeTruthy()
  await userEvent.selectOptions(read.getByRole('combobox', { name: 'Actor for Read them' }), 'brom')
  expect(read.getByRole('img', { name: /Success: 11–19/ })).toBeTruthy()
  expect(outcomes().getAllByText(/Brom reads them\./)).toHaveLength(1)
  expect(outcomes().getByText(/Brom acts/)).toBeTruthy()
})

test('a situational modifier and Edge show beside the skill and DC', () => {
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
  expect(checkLine('Read them')).toBe('Insight vs DC 12 · −2 situational · Edge')
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
  expect(checkLine('Read them')).toBe('Insight vs DC 12 · −2 misread')
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
  await userEvent.click(choose('Read them'))
  const skip = screen.getByRole('button', { name: 'Skip dice animation' })
  expect(document.activeElement).toBe(skip)
  await userEvent.keyboard('{Enter}')
  const firstAvailable = screen
    .getAllByRole('button', { name: /^Choose / })
    .find((b) => !b.hasAttribute('aria-disabled'))
  expect(document.activeElement).toBe(firstAvailable)
  await userEvent.click(choose('Help carefully'))
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
  await userEvent.click(choose('Go on'))
  await userEvent.click(screen.getByRole('button', { name: 'Skip dice animation' }))
  expect(screen.getByText('Second.')).toBeTruthy()
  expect(actor().value).toBe('brom')
  expect(actor().options).toHaveLength(2)
})

test('a check that moves to another stage still shows its dice, DC track and outcome', async () => {
  const situation = SituationSchema.parse({
    id: 'gate',
    title: 'Gate',
    stages: {
      start: {
        text: 'A locked gate.',
        options: [
          {
            id: 'pick',
            kind: 'check',
            label: 'Pick the lock',
            check: { skill: 'athletics', dc: 12 },
            outcomes: {
              fail: { text: 'It jams.', goto: 'yard' },
              partial: { text: 'It jams.', goto: 'yard' },
              success: { text: 'It jams.', goto: 'yard' },
            },
          },
          { id: 'leave', kind: 'fixed', label: 'Leave', outcome: { text: 'Gone.' } },
        ],
      },
      yard: {
        text: 'A quiet yard.',
        options: [
          { id: 'rest', kind: 'fixed', label: 'Rest', outcome: { text: 'Rested.' } },
          { id: 'go', kind: 'fixed', label: 'Go', outcome: { text: 'Gone.' } },
        ],
      },
    },
  })
  const log = [{ text: 'A locked gate.', tone: 'info' as const }]
  render(<Harness initial={makeState({ encounter: makeEncounter({ situation, log }) })} />)
  await userEvent.click(choose('Pick the lock'))
  await userEvent.click(screen.getByRole('button', { name: 'Skip dice animation' }))
  const roll = screen.getByRole('button', { name: /^Rolled \d+$/ })
  expect(within(roll).getByText('DC 12')).toBeTruthy()
  expect(roll.querySelector('.dc-total')).toBeTruthy()
  expect(screen.getByText(/^It jams\./)).toBeTruthy()
  expect(screen.getByText('A quiet yard.')).toBeTruthy()
  expect(choose('Rest')).toBeTruthy()
})

test('the actor picker shows strain', () => {
  const party = [{ ...brom, strain: { athletics: 2 } }, lyra]
  render(<Harness initial={started('cliff', makeState({ party }))} />)
  const picker = screen.getByRole('combobox', { name: 'Actor for Climb' })
  expect(within(picker).getByRole('option', { name: 'Brom +3 · strain −2' })).toBeTruthy()
  expect(within(picker).getByRole('option', { name: /^Lyra [+−]\d+$/ })).toBeTruthy()
})
