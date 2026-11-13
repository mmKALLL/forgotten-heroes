// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { step } from '../../engine/state'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { REINHABIT_DAYS } from '../../engine/constants'
import { DelveView, delveViewBox } from './DelveView'
import { PoiPanel } from './PoiPanel'
import { DEFAULT_TRAVEL_PREFS } from './travelPrefs'

const content = fixtureContent()
afterEach(cleanup)

/** The party at the fixture's dungeon (The Test Vault), found and inhabited; known by word or not. */
function atVault(known = true): GameState {
  const base = makeState()
  const id = Object.keys(base.world.pois).find((p) => base.world.pois[p].dungeon)!
  const poi = {
    ...base.world.pois[id],
    discovered: true,
    clearedDay: base.day - REINHABIT_DAYS - 1,
    ...(known && { known: true as const }),
  }
  return {
    ...base,
    location: id,
    world: { ...base.world, pois: { ...base.world.pois, [id]: poi } },
  }
}

const panel = (state: GameState) =>
  render(
    <PoiPanel
      content={content}
      state={state}
      selected={null}
      onSelect={vi.fn()}
      prefs={DEFAULT_TRAVEL_PREFS}
      onPrefs={vi.fn()}
      onAction={vi.fn()}
    />
  )

test('the site panel shows the dungeon: CR against the party, its summary, rooms and hoard', () => {
  panel(atVault())
  expect(screen.getByText(/CR 2: meant for a party of level 3/)).toBeTruthy()
  expect(screen.getByText('A drowned treasury.')).toBeTruthy()
  expect(screen.getByText(/3 rooms, in order/)).toBeTruthy()
  expect(screen.getByText(/The hoard at the end: \d+–\d+ gp, 1 precious goods/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Enter' })).toBeTruthy()
})

test('a dungeon found only by exploring shows its level as unknown', () => {
  panel(atVault(false))
  expect(screen.getByText(/Level unknown/)).toBeTruthy()
  expect(screen.queryByText(/meant for a party of level/)).toBeNull()
})

test('between rooms, the schematic marks the way, and Press on and Withdraw dispatch', async () => {
  const entered = step(atVault(), { type: 'visitPoi' }, content)
  const between = step(entered, { type: 'chooseOption', optionId: 'sneak' }, content)
  const onAction = vi.fn()
  const { container } = render(
    <DelveView content={content} state={between} onAction={onAction} imageUrl={null} />
  )
  expect(screen.getByRole('img', { name: 'Map of The Test Vault' })).toBeTruthy()
  expect(screen.getByText(/showing the rooms only/)).toBeTruthy()
  expect(container.querySelectorAll('.delve-room')).toHaveLength(3)
  expect(container.querySelector('.delve-room.visited')).toBeTruthy()
  expect(container.querySelector('.delve-room.next')?.textContent).toBe('2. Sluice')
  expect(screen.getByText('2 of 3 rooms left.')).toBeTruthy()
  expect(screen.getByText('The next room has a way through that needs no roll.')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Press on to Sluice' }))
  await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
  expect(onAction.mock.calls.map(([a]) => a.type)).toEqual(['pressOn', 'withdraw'])
})

test('the zoomed view is a window inside the map around the party', () => {
  const [x, y, w, h] = delveViewBox([2000, 1000], [0.95, 0.5]).split(' ').map(Number)
  expect(x + w).toBeLessThanOrEqual(2000)
  expect(y + h).toBeLessThanOrEqual(1000)
  expect(w).toBeLessThan(2000)
  expect(delveViewBox([2000, 1000], null)).toBe('0 0 2000 1000')
})
