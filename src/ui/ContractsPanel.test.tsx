// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fixtureContent, makeState } from '../engine/test-fixtures'
import type { ContractState, GameState } from '../schema/state'
import { I18nProvider } from './i18n/I18n'
import { ContractsPanel } from './ContractsPanel'

const content = fixtureContent()
afterEach(cleanup)

const escort = (overrides: Partial<ContractState> = {}): ContractState => ({
  id: 'c-test',
  template: 'see-pilgrim',
  kind: 'escort',
  patron: 'someone',
  from: 'greenvale-2',
  to: 'greenvale-1',
  good: null,
  amount: 0,
  poi: null,
  passengers: 1,
  accepted: 1,
  deadline: 9,
  pay: 30,
  level: 1,
  urgent: false,
  reputation: 8,
  met: false,
  ...overrides,
})

const panel = (state: GameState) => {
  const onAction = vi.fn()
  render(
    <I18nProvider content={content}>
      <ContractsPanel content={content} state={state} onAction={onAction} />
    </I18nProvider>
  )
  return onAction
}

test('nothing shows without contracts', () => {
  panel(makeState({ location: 'greenvale-1' }))
  expect(screen.queryByRole('region', { name: 'Contracts' })).toBeNull()
})

test('a contract on its way shows the days left, and is abandoned after a second click', async () => {
  const onAction = panel(makeState({ location: 'greenvale-2', day: 3, contracts: [escort()] }))
  const list = within(screen.getByRole('region', { name: 'Contracts' }))
  expect(list.getByText('6 days left')).toBeTruthy()
  expect(list.queryByRole('button', { name: /^Take / })).toBeNull()
  await userEvent.click(list.getByRole('button', { name: 'Abandon' }))
  expect(onAction).not.toHaveBeenCalled()
  expect(list.getByText('Give it up?')).toBeTruthy()
  // The question takes focus; "Keep it" calls it off and focus returns to the link.
  expect(document.activeElement?.textContent).toBe('Keep it')
  await userEvent.click(list.getByRole('button', { name: 'Keep it' }))
  expect(document.activeElement?.textContent).toBe('Abandon')
  await userEvent.click(list.getByRole('button', { name: 'Abandon' }))
  await userEvent.click(list.getByRole('button', { name: 'Abandon' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'abandonContract', id: 'c-test' })
})

test('at its destination, Claim reward opens a dialog with each reward’s total', async () => {
  const onAction = panel(
    makeState({ location: 'greenvale-1', day: 5, contracts: [escort({ met: true })] })
  )
  const list = within(screen.getByRole('region', { name: 'Contracts' }))
  // The rewards are in the dialog, not inline.
  expect(list.queryByRole('button', { name: /^Take / })).toBeNull()
  const claim = list.getByRole('button', { name: /^Claim the reward for / })
  await userEvent.click(claim)
  const dialog = within(screen.getByRole('dialog', { name: 'Contract fulfilled' }))
  // The town's points with the pay, and the good word's reach: nothing with the patron.
  expect(dialog.getByText('+8 reputation')).toBeTruthy()
  expect(
    dialog.getByText(/^\+\d+ reputation (in each of .+’s \d+ settlements|in .+)$/)
  ).toBeTruthy()
  expect(dialog.queryByText(/patron/)).toBeNull()
  // Focus starts on the pay; Escape closes without choosing, and focus returns to the button.
  expect(document.activeElement?.textContent).toBe('Take 30 gp')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(onAction).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(claim)

  await userEvent.click(claim)
  await userEvent.click(screen.getByRole('button', { name: 'Take 30 gp' }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'completeContract',
    id: 'c-test',
    reward: 'gold',
  })
  await userEvent.click(claim)
  await userEvent.click(screen.getByRole('button', { name: 'Ask for a good word' }))
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'completeContract',
    id: 'c-test',
    reward: 'goodWord',
  })
})
