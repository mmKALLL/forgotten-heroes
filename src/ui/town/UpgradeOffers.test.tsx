// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { brom, fixtureContent, lyra, makeState } from '../../engine/test-fixtures'
import { I18nProvider } from '../i18n/I18n'
import { PartyPanel } from '../PartyPanel'
import { UpgradeOffers } from './UpgradeOffers'

const content = fixtureContent()
afterEach(cleanup)

test('a tile offers each next level with its price and effect; the purse decides what is enabled', async () => {
  const onAction = vi.fn()
  const state = makeState({
    location: 'greenvale-1',
    gold: 150,
    upgrades: { 'surveyors-maps': 1 },
  })
  render(
    <I18nProvider content={content}>
      <UpgradeOffers content={content} state={state} service="inn-tavern" onAction={onAction} />
    </I18nProvider>
  )
  const maps = screen.getByRole('button', { name: "Surveyor's maps II · 200 gp" })
  expect((maps as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('+4 to explore checks')).toBeTruthy()
  expect(screen.queryByText(/not enough gold/i)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: "Smuggler's compartment I · 125 gp" }))
  expect(onAction).toHaveBeenCalledWith({ type: 'buyUpgrade', upgrade: 'smugglers-compartment' })
})

test('the party panel lists the upgrades owned, with their levels', () => {
  render(
    <PartyPanel
      party={[brom, lyra]}
      upgrades={[{ id: 'camp-kit', name: 'Camp kit', level: 2, effect: 'A rest heals +2 HP' }]}
    />
  )
  expect(screen.getByText('Camp kit II').getAttribute('title')).toBe('A rest heals +2 HP')
})
