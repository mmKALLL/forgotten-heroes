// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { noticeBoard } from '../../engine/town/contracts'
import type { GameState } from '../../schema/state'
import { I18nProvider } from '../i18n/I18n'
import { NoticeBoard } from './NoticeBoard'

/** The fixture with more of its work held back for parties the town knows. */
const content = (() => {
  const c = structuredClone(fixtureContent())
  for (const id of ['bring-timber', 'see-pilgrim']) c.contracts[id].minStanding = 'known'
  return c
})()
afterEach(cleanup)

/** A week whose board here has both an offer the party can take and one locked by standing. */
function mixedBoard(): GameState {
  const base = makeState({ location: 'greenvale-1', gold: 50 })
  for (let week = 0; week < 60; week++) {
    const state = { ...base, day: week * 7 + 1 }
    const offers = noticeBoard(state, content, 'greenvale-1')
    if (offers.some((o) => o.available) && offers.some((o) => o.locked)) return state
  }
  throw new Error('no week with a locked offer')
}

test('offers show their route, deadline and pay; Take dispatches, a locked one says why', async () => {
  const state = mixedBoard()
  const offers = noticeBoard(state, content, 'greenvale-1')
  const onAction = vi.fn()
  render(
    <I18nProvider content={content}>
      <NoticeBoard content={content} state={state} onAction={onAction} />
    </I18nProvider>
  )
  const board = within(screen.getByRole('region', { name: 'Notice board' }))
  const open = offers.find((o) => o.available)!
  const row = within(board.getByRole('button', { name: `Take “${open.title}”` }).closest('li')!)
  expect(row.getByText(`${open.pay} gp`)).toBeTruthy()
  expect(
    row.getByText(new RegExp(`${open.km} km · by day ${state.day + open.days}, `))
  ).toBeTruthy()
  await userEvent.click(row.getByRole('button', { name: `Take “${open.title}”` }))
  expect(onAction).toHaveBeenCalledWith({ type: 'acceptContract', offerId: open.id })

  const locked = offers.find((o) => o.locked)!
  const take = board.getByRole('button', { name: `Take “${locked.title}”` }) as HTMLButtonElement
  expect(take.disabled).toBe(true)
  expect(take.title).toBe(`needs standing ${locked.locked}`)
})

test('a procurement names the shortage and the nearest maker', () => {
  // A building boom in the capitals, and no workshops: Greenvale is short of timber.
  const base = fixtureContent()
  const { workshops: _, ...producers } = base.producers
  const boom = {
    ...base,
    producers,
    marketRules: {
      ...base.marketRules,
      boom: {
        ...base.marketRules.coast,
        id: 'boom',
        when: { types: ['capital'] },
        demand: { timber: 2, stone: 2 },
      },
    },
  }
  const start = makeState({ location: 'greenvale-1', gold: 50 })
  const state = Array.from({ length: 30 }, (_, w) => ({ ...start, day: w * 7 + 1 })).find((s) =>
    noticeBoard(s, boom, 'greenvale-1').some((o) => o.kind === 'procurement')
  )!
  const offer = noticeBoard(state, boom, 'greenvale-1').find((o) => o.kind === 'procurement')!
  render(
    <I18nProvider content={boom}>
      <NoticeBoard content={boom} state={state} onAction={vi.fn()} />
    </I18nProvider>
  )
  const row = within(screen.getByRole('button', { name: `Take “${offer.title}”` }).closest('li')!)
  expect(row.getByText('Procurement')).toBeTruthy()
  expect(
    row.getByText(new RegExp(`^Short here · nearest maker ${offer.sourceName} · `))
  ).toBeTruthy()
})
