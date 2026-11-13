import { describe, expect, test } from 'vitest'
import { SituationSchema } from '../../schema/encounter'
import { UPGRADES } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { step } from '../state'
import { fixtureContent, makeEncounter, makeState } from '../test-fixtures'
import { upgradeOffers, upgradePrice } from './upgrades'

const content = fixtureContent()
/** A test town with an inn (it sells every upgrade in the fixtures). */
const atInn = (gold = 1000) => makeState({ location: 'greenvale-1', gold })

describe('prices', () => {
  test('every level costs more than the last, and the banner about twice a normal upgrade', () => {
    for (const id of UPGRADES) {
      const def = content.upgrades[id]
      for (let level = 2; level <= 5; level++)
        expect(upgradePrice(def, level)).toBeGreaterThan(upgradePrice(def, level - 1))
    }
    const others = UPGRADES.filter((id) => id !== 'company-banner').map(
      (id) => content.upgrades[id].basePrice
    )
    const mean = others.reduce((a, b) => a + b, 0) / others.length
    const ratio = content.upgrades['company-banner'].basePrice / mean
    expect(ratio).toBeGreaterThan(1.6)
    expect(ratio).toBeLessThan(2.5)
  })
})

test("the scout's kit costs its base price × the level, dearer each level", () => {
  const offer = (upgrades: GameState['upgrades']) =>
    upgradeOffers({ ...atInn(), upgrades }, content).find((o) => o.id === 'scouts-kit')!
  const base = content.upgrades['scouts-kit'].basePrice
  expect(offer({}).price).toBe(base)
  expect(offer({ 'scouts-kit': 1 }).price).toBe(2 * base)
  expect(offer({ 'scouts-kit': 4 }).price).toBe(5 * base)
  expect(offer({ 'scouts-kit': 1 }).effect).not.toBe(offer({}).effect)
})

describe('buying', () => {
  test('the offer is the next level at its price, and buying it pays that and raises the level', () => {
    const state = atInn()
    expect(state.world.settlements['greenvale-1'].services).toContain('inn-tavern')
    const offer = upgradeOffers(state, content).find((o) => o.id === 'surveyors-maps')!
    expect(offer).toMatchObject({ level: 1, price: 100, affordable: true })
    const bought = step(state, { type: 'buyUpgrade', upgrade: 'surveyors-maps' }, content)
    expect(bought.gold).toBe(state.gold - offer.price)
    expect(bought.upgrades['surveyors-maps']).toBe(1)
    const next = upgradeOffers(bought, content).find((o) => o.id === 'surveyors-maps')!
    expect(next.level).toBe(2)
    expect(next.price).toBeGreaterThan(offer.price)
  })

  test('nothing past level V, nothing without the gold, on the road or mid-encounter', () => {
    const top = atInn()
    const maxed = { ...top, upgrades: { 'camp-kit': 5 } }
    expect(upgradeOffers(maxed, content).some((o) => o.id === 'camp-kit')).toBe(false)
    expect(step(maxed, { type: 'buyUpgrade', upgrade: 'camp-kit' }, content).upgrades).toEqual({
      'camp-kit': 5,
    })
    const poor = atInn(10)
    expect(upgradeOffers(poor, content).every((o) => !o.affordable)).toBe(true)
    expect(step(poor, { type: 'buyUpgrade', upgrade: 'camp-kit' }, content).gold).toBe(10)
    const situation = SituationSchema.parse({
      id: 'open',
      title: 'Open',
      stages: {
        start: {
          text: 'Wait.',
          options: [{ id: 'go', kind: 'fixed', label: 'Go', outcome: { text: 'Gone.' } }],
        },
      },
    })
    const busy = { ...atInn(), encounter: makeEncounter({ situation }) }
    expect(upgradeOffers(busy, content)).toEqual([])
    expect(step(busy, { type: 'buyUpgrade', upgrade: 'camp-kit' }, content).upgrades).toEqual({})
  })
})
