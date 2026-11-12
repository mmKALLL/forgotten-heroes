// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { gatherOptions } from '../../engine/world/gather'
import { GatherAction } from './GatherAction'

const content = fixtureContent()
afterEach(cleanup)

test('the gather row shows its lead, DC and outcome lines, and dispatches gather', async () => {
  // farisle-1 is forest with sawmills in the fixture: one rule, cut timber.
  const state = makeState({ location: 'farisle-1', goods: { food: 10, water: 2 } })
  const [option] = gatherOptions(state, content)
  const onAction = vi.fn()
  render(<GatherAction content={content} state={state} onAction={onAction} />)
  const row = within(screen.getByRole('group', { name: 'Gather local goods' }))
  expect(row.getByText(new RegExp(`^${option.actorName}, .* vs DC ${option.dc}`))).toBeTruthy()
  const lines = row.getByRole('list', { name: 'What a day brings home' })
  const success = option.outcomes.find((o) => o.tier === 'success')!
  expect(lines.textContent).toContain(`${success.units} timber`)
  // The critical failure is previewed too, from the engine's mishap.
  expect(row.getByText(/^A natural 1 \(\d+%\) (brings trouble|hurts)/)).toBeTruthy()
  await userEvent.click(row.getByRole('button', { name: /^Gather/ }))
  expect(onAction).toHaveBeenCalledWith({ type: 'gather', rule: option.rule })
})

test('nothing to gather, no row', () => {
  const { container } = render(
    <GatherAction
      content={content}
      state={makeState({ location: 'greenvale-1' })}
      onAction={vi.fn()}
    />
  )
  expect(container.textContent).toBe('')
})
