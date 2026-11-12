import { describe, expect, test } from 'vitest'
import type { Accessory } from '../../schema/gear'
import type { GameState } from '../../schema/state'
import { applyEffects } from '../encounters/effects'
import { createRng, withRng } from '../rng'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { ACCESSORY_RESALE } from '../constants'
import { accessoryIssues, accessoryOffers, accessorySales, rollAccessory } from './accessories'

const content = fixtureContent()
const HERE = 'greenvale-1'

/** At greenvale-1 with an inn that sells accessories (the fixture's), and gold to spend. */
function here(overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location: HERE, gold: 500 })
  const settlements = { ...s.world.settlements }
  settlements[HERE] = {
    ...settlements[HERE],
    services: [...new Set([...settlements[HERE].services, 'inn-tavern'])],
  }
  return { ...s, world: { ...s.world, settlements }, ...overrides }
}

const roll = (seed: number, tier: 1 | 2) =>
  withRng(createRng(seed), (d) => rollAccessory(d, content, tier, `a-${seed}`))[0]!

describe('rollAccessory', () => {
  test('is deterministic for a seed', () => {
    expect(roll(7, 2)).toEqual(roll(7, 2))
  })

  test('respects tiers, bases and distinct hook kinds', () => {
    const tier1 = Array.from({ length: 60 }, (_, i) => roll(i, 1))
    const tier2 = Array.from({ length: 60 }, (_, i) => roll(i, 2))
    for (const a of tier1) {
      expect(a.hooks).toHaveLength(1)
      // Tireless and of Fortune are tier 2 only.
      expect(a.hooks.map((h) => h.hook)).not.toContain('lucky')
      expect(a.hooks.map((h) => h.hook)).not.toContain('strainFade')
    }
    for (const a of tier2) {
      expect(a.hooks).toHaveLength(2)
      expect(new Set(a.hooks.map((h) => h.hook)).size).toBe(2)
      // At least one tier-2 affix.
      expect(a.hooks.some((h) => h.hook === 'lucky' || h.hook === 'strainFade')).toBe(true)
    }
    // of the Mule (carry) only on a cloak.
    for (const a of [...tier1, ...tier2]) {
      if (a.hooks.some((h) => h.hook === 'carry')) expect(a.name).toMatch(/Cloak/)
    }
    expect(tier1.map((a) => a.name)).toContain('Fox-eyed Ring')
    expect(tier1.find((a) => a.name === 'Fox-eyed Ring')!.value).toBe(40)
  })

  test('the fixture tables have no issues', () => {
    expect(accessoryIssues(content)).toEqual([])
  })
})

describe('shops', () => {
  test('offers are fixed within a week, change the next, and a bought one disappears', () => {
    const state = here()
    const offers = accessoryOffers(state, content, HERE)
    expect(offers.length).toBeGreaterThan(0)
    expect(accessoryOffers({ ...state, day: 7 }, content, HERE)).toEqual(offers)
    expect(accessoryOffers({ ...state, day: 8 }, content, HERE)).not.toEqual(offers)
    const [first] = offers
    expect(first.available).toBe(true)
    const bought = step(state, { type: 'buyAccessory', offerId: first.id }, content)
    expect(bought.gold).toBe(state.gold - first.price)
    expect(bought.gear).toEqual([first.accessory])
    expect(accessoryOffers(bought, content, HERE).map((o) => o.id)).not.toContain(first.id)
    // Too poor: refused with a reason, and buying does nothing.
    const poor = { ...state, gold: 0 }
    expect(accessoryOffers(poor, content, HERE)[0]).toMatchObject({ available: false })
    expect(step(poor, { type: 'buyAccessory', offerId: first.id }, content).gear).toEqual([])
  })

  test('selling an unworn accessory pays half its value', () => {
    const ring: Accessory = { id: 'r1', name: 'Fox-eyed Ring', tier: 1, hooks: [], value: 41 }
    const state = here({ gear: [ring] })
    expect(accessorySales(state, content)).toEqual([
      { accessory: ring, price: Math.ceil(41 * ACCESSORY_RESALE), available: true, reason: null },
    ])
    const sold = step(state, { type: 'sellAccessory', id: 'r1' }, content)
    expect(sold.gear).toEqual([])
    expect(sold.gold).toBe(state.gold + Math.ceil(41 * ACCESSORY_RESALE))
  })
})

describe('equipping', () => {
  const stout: Accessory = {
    id: 'stout',
    name: 'Stout Amulet',
    tier: 2,
    hooks: [{ hook: 'maxHp', amount: 5 }],
    value: 100,
  }

  test('equip and unequip round-trip HP, and a worn accessory goes back to gear', () => {
    const state = here({ gear: [stout] })
    const brom = state.party[0]
    const worn = step(state, { type: 'equipAccessory', characterId: brom.id, id: 'stout' }, content)
    const after = worn.party[0]
    expect(after.accessory).toEqual(stout)
    expect([after.hp, after.maxHp]).toEqual([brom.hp + 5, brom.maxHp + 5])
    expect(worn.gear).toEqual([])
    const off = step(worn, { type: 'unequipAccessory', characterId: brom.id }, content)
    expect(off.party[0]).toEqual(brom)
    expect(off.gear).toEqual([stout])
  })

  test('removing max HP never kills: HP stays at least 1', () => {
    const state = here({ gear: [stout] })
    const worn = step(state, { type: 'equipAccessory', characterId: 'brom', id: 'stout' }, content)
    const hurt = { ...worn, party: worn.party.map((c, i) => (i === 0 ? { ...c, hp: 3 } : c)) }
    expect(step(hurt, { type: 'unequipAccessory', characterId: 'brom' }, content).party[0].hp).toBe(
      1
    )
  })

  test('equipping swaps out what was worn', () => {
    const other: Accessory = { ...stout, id: 'other', hooks: [] }
    const state = here({ gear: [stout, other] })
    const one = step(state, { type: 'equipAccessory', characterId: 'brom', id: 'stout' }, content)
    const two = step(one, { type: 'equipAccessory', characterId: 'brom', id: 'other' }, content)
    expect(two.party[0].accessory?.id).toBe('other')
    expect(two.party[0].maxHp).toBe(state.party[0].maxHp)
    expect(two.gear).toEqual([stout])
  })
})

test('the accessory effect loots one into gear', () => {
  const looted = applyEffects(makeState(), [{ effect: 'accessory', tier: 1 }], { content })
  expect(looted.gear).toHaveLength(1)
  expect(looted.log.at(-1)?.text).toMatch(/^Found: /)
  expect(looted.gear[0].tier).toBe(1)
})
