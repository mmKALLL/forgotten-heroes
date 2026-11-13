// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { armsOffers } from '../../engine/town/arms'
import { brom, classFixtureContent, makeCharacter, makeState } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { I18nProvider } from '../i18n/I18n'
import { MemberDetails } from '../MemberDetails'
import { ServicesPanel } from './ServicesPanel'

// Plan 7 Track C: the arms shop, and wearing weapons and armour from a member's sheet.

const content = classFixtureContent()
afterEach(cleanup)

function town(overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location: 'greenvale-1', gold: 100, ...overrides })
  const here = { ...s.world.settlements['greenvale-1'], services: ['weapons-shop'] }
  return {
    ...s,
    world: { ...s.world, settlements: { ...s.world.settlements, 'greenvale-1': here } },
  }
}

test('the arms shop lists weapons with what they do, Buy, and the stash to sell', async () => {
  const state = town({ stash: ['test-glaive'] })
  const offers = armsOffers(state, content, 'greenvale-1')
  const onAction = vi.fn()
  render(
    <I18nProvider content={content}>
      <ServicesPanel content={content} state={state} onAction={onAction} />
    </I18nProvider>
  )
  await userEvent.click(screen.getByRole('button', { name: `Arms (${offers.length})` }))
  const shop = within(screen.getByRole('region', { name: /^Arms · / }))
  const [glaive] = shop.getAllByRole('listitem', { name: 'Glaive' })
  expect(glaive.textContent).toContain('polearm, d10, reach 1–2 · 3 kg')
  await userEvent.click(within(glaive).getByRole('button', { name: 'Buy · 20 gp' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyArms', id: 'test-glaive' })
  const mine = shop.getAllByRole('listitem', { name: 'Glaive' }).at(-1)!
  await userEvent.click(within(mine).getByRole('button', { name: 'Sell · +10 gp' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'sellArms', id: 'test-glaive' })
})

test("a member's sheet: weapon and armour, wearing from the stash, untrained warnings, abilities", async () => {
  const onAction = vi.fn()
  const fighter = { ...brom, gear: { weapon: 'longsword', armour: 'chain-mail' } }
  const { unmount } = render(
    <I18nProvider content={content}>
      <MemberDetails
        character={fighter}
        gear={[]}
        content={content}
        stash={['test-glaive', 'test-plate']}
        onAction={onAction}
      />
    </I18nProvider>
  )
  expect(screen.getByText('Longsword')).toBeTruthy()
  expect(screen.getByText('Chain')).toBeTruthy()
  expect(screen.getByText('Second Wind 1/1')).toBeTruthy()
  await userEvent.click(
    within(screen.getByText('Weapon:').parentElement!).getByRole('button', { name: 'Wear instead' })
  )
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'equipArms',
    characterId: brom.id,
    id: 'test-glaive',
  })
  await userEvent.click(
    within(screen.getByText('Armour:').parentElement!).getByRole('button', { name: 'Take off' })
  )
  expect(onAction).toHaveBeenLastCalledWith({
    type: 'unequipArms',
    characterId: brom.id,
    slot: 'armour',
  })
  unmount()
  const wizard = makeCharacter({
    id: 'w',
    classId: 'wizard',
    gear: { weapon: 'longsword', armour: 'plate-armour' },
  })
  render(
    <I18nProvider content={content}>
      <MemberDetails character={wizard} gear={[]} content={content} />
    </I18nProvider>
  )
  expect(screen.getByText(/untrained: no proficiency bonus/)).toBeTruthy()
  expect(screen.getByText(/untrained: attacks at disadvantage/)).toBeTruthy()
})
