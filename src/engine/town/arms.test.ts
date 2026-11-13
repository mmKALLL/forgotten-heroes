import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { load } from '../economy/capacity'
import { serviceQuality } from '../economy/market'
import { step } from '../state'
import { brom, classFixtureContent, makeState } from '../test-fixtures'
import { ARMS_QUALITY_AT, ARMS_RESALE } from '../constants'
import { armsOffers, armsSales } from './arms'

// Plan 7 Track C: arms shops sell weapons and armour; members wear them; they weigh on carrying.

const content = classFixtureContent()
const HERE = 'greenvale-1'

/** At greenvale-1 with a weapons shop and an armourer, and gold to spend. */
function here(overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location: HERE, gold: 2000, party: [brom] })
  const settlements = { ...s.world.settlements }
  settlements[HERE] = { ...settlements[HERE], services: ['weapons-shop', 'armourer'] }
  return { ...s, world: { ...s.world, settlements }, ...overrides }
}

describe('arms shops', () => {
  test('every armour, and the weapons whose quality the shop reaches', () => {
    const s = here()
    const offers = armsOffers(s, content, HERE)
    const quality = serviceQuality(s, HERE, 'weapons-shop')
    expect(offers.map((o) => o.id)).toContain('test-glaive')
    expect(offers.map((o) => o.id)).toContain('test-plate')
    for (const o of offers.filter((x) => x.piece.kind === 'weapon'))
      expect(ARMS_QUALITY_AT[(o.piece.item as { quality: 'plain' }).quality]).toBeLessThanOrEqual(
        quality
      )
    expect(offers.some((o) => o.id === 'test-glaive-2')).toBe(quality >= ARMS_QUALITY_AT.magic2)
  })

  test('buying, wearing, taking off and selling; the stash and what is worn weigh on carrying', () => {
    const s = here()
    const before = load(s, content).weight
    const bought = step(s, { type: 'buyArms', id: 'test-glaive' }, content)
    expect(bought.gold).toBe(2000 - 20)
    expect(bought.stash).toEqual(['test-glaive'])
    expect(load(bought, content).weight).toBeCloseTo(before + 3)
    const worn = step(
      bought,
      { type: 'equipArms', characterId: brom.id, id: 'test-glaive' },
      content
    )
    expect(worn.party[0].gear.weapon).toBe('test-glaive')
    expect(worn.stash).toEqual(brom.gear.weapon ? [brom.gear.weapon] : [])
    expect(load(worn, content).weight).toBeCloseTo(before + 3)
    const off = step(worn, { type: 'unequipArms', characterId: brom.id, slot: 'weapon' }, content)
    expect(off.party[0].gear.weapon).toBeNull()
    expect(off.stash).toContain('test-glaive')
    const sale = armsSales(off, content).find((x) => x.id === 'test-glaive')!
    expect(sale.price).toBe(Math.floor(20 * ARMS_RESALE))
    const sold = step(off, { type: 'sellArms', id: 'test-glaive' }, content)
    expect(sold.gold).toBe(off.gold + sale.price)
    expect(sold.stash).not.toContain('test-glaive')
  })

  test('refused without the gold, away from a settlement, or too heavy to carry', () => {
    expect(
      armsOffers(here({ gold: 5 }), content, HERE).find((o) => o.id === 'test-glaive')!.reason
    ).toBe('not enough gold')
    const away = here({ location: null })
    expect(armsOffers(away, content, HERE).every((o) => !o.available)).toBe(true)
    const laden = here({ stash: Array.from({ length: 6 }, () => 'test-plate') })
    expect(armsOffers(laden, content, HERE).find((o) => o.id === 'test-plate')!.reason).toBe(
      'too heavy to carry'
    )
    expect(step(laden, { type: 'buyArms', id: 'test-plate' }, content).stash).toHaveLength(6)
  })

  test('a weaponsmith does not buy armour', () => {
    const s = here({ stash: ['test-plate'] })
    const settlements = { ...s.world.settlements }
    settlements[HERE] = { ...settlements[HERE], services: ['weapons-shop'] }
    const smith = { ...s, world: { ...s.world, settlements } }
    expect(armsSales(smith, content)[0]).toMatchObject({
      available: false,
      reason: 'no one here buys armour',
    })
  })
})
