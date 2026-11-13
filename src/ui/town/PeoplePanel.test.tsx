// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { peopleRows } from '../../engine/town/reputation'
import { RUMOURS_DONE, rumourOption } from '../../engine/town/rumours'
import type { GameState } from '../../schema/state'
import { I18nProvider } from '../i18n/I18n'
import { PeoplePanel, RumoursLine } from './PeoplePanel'

const content = fixtureContent()
afterEach(cleanup)

const show = (state: GameState) => {
  const onAction = vi.fn()
  render(
    <I18nProvider content={content}>
      <RumoursLine content={content} state={state} onAction={onAction} />
      <PeoplePanel content={content} state={state} />
    </I18nProvider>
  )
  return onAction
}

test('the people here show with their titles, roles and standing tiers', () => {
  const state = makeState({ location: 'greenvale-1', gold: 50 })
  const people = peopleRows(state, content)
  const first = people[0]
  const liked = { ...state, reputation: { ...state.reputation, people: { [first.id]: 40 } } }
  show(liked)
  const list = within(screen.getByRole('list', { name: 'Notable people' }))
  expect(list.getAllByRole('listitem')).toHaveLength(people.length)
  const row = within(list.getByText(first.name).closest('li')!)
  expect(row.getByText(`· ${first.role}`)).toBeTruthy()
  const tier = peopleRows(liked, content)[0].standing
  expect(tier).not.toBe('stranger')
  expect(row.getByText(tier)).toBeTruthy()
})

test('the rumour line shows who listens and the DC, the tiers their chances, and dispatches', async () => {
  const state = makeState({ location: 'greenvale-1', gold: 50 })
  const option = rumourOption(state, content)!
  const onAction = show(state)
  const line = within(screen.getByRole('group', { name: 'Listen for rumours' }))
  // The tiers below carry the chances: no summary chance on the line (designer, 2026-11-13).
  expect(line.getByText(new RegExp(`vs DC ${option.dc}$`))).toBeTruthy()
  expect(line.queryByText(/to hear something/)).toBeNull()
  // The tiers are listed inline, never the critical ones.
  expect(line.getByRole('list', { name: 'What the talk brings' })).toBeTruthy()
  expect(line.getByText('Nothing worth hearing')).toBeTruthy()
  expect(line.queryByText(/false rumour/i)).toBeNull()
  const button = line.getByRole('button', { name: `Listen for rumours · ${option.cost} gp` })
  await userEvent.click(button)
  expect(onAction).toHaveBeenCalledWith({ type: 'listenRumours' })
})

test('a party that can’t pay still reads the rumour odds, and why', () => {
  const state = makeState({ location: 'greenvale-1', gold: 0 })
  show(state)
  const line = within(screen.getByRole('group', { name: 'Listen for rumours' }))
  const button = line.getByRole('button', { name: /^Listen for rumours/ }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  // The price is on the button; the reason doesn't repeat it.
  expect(line.getByText('Not enough gold.')).toBeTruthy()
  expect(line.getByRole('list', { name: 'What the talk brings' })).toBeTruthy()
})

test('once the talk is heard, the line says so', () => {
  show(makeState({ location: 'greenvale-1', gold: 50, doneHere: [RUMOURS_DONE] }))
  expect(screen.getByText('You have heard the talk here already.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Listen for rumours/ })).toBeNull()
})
