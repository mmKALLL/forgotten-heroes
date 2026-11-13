import { describe, expect, test } from 'vitest'
import type { ContractState, GameState } from '../../schema/state'
import { step, type Action } from '../state'
import { brom, fixtureContent, lyra, makeState } from '../test-fixtures'
import { routeOptions } from '../travel/preview'
import { autoRefill, partyWaterCapacity, waterCapacity } from '../travel/supplies'
import { load } from '../economy/capacity'
import { supplyOutlook } from '../travel/outlook'
import { arrivalRest } from './arrival'
import { provisionPlan } from './provision'
import { COMMON_ROOM_HEAL } from '../constants'

const content = fixtureContent()
const act = (s: GameState, a: Action) => step(s, a, content)
const at = (location: string, overrides: Partial<GameState> = {}) =>
  makeState({ location, gold: 100, goods: { food: 0, water: 8 }, ...overrides })
/** The preview's food and water warnings for a road at a pace, without foraging. */
const warns = (s: GameState, to: string, pace = 'steady') =>
  routeOptions(s, content, false)
    .find((r) => r.to === to)!
    .paces.find((p) => p.pace === pace)!
    .warnings.map((w) => w.code)
    .filter((c) => c === 'foodRunsOut' || c === 'waterRunsOut')

describe('provision for this road', () => {
  const road = { routeId: 'greenvale-1-greenvale-2', pace: 'steady' as const }

  test('buys the food the road needs at the pace, and the preview then has no supply warning', () => {
    const s = at('greenvale-1')
    expect(warns(s, 'greenvale-2')).toContain('foodRunsOut')
    const plan = provisionPlan(s, content, road)!
    expect(plan.food).toBeGreaterThan(0)
    expect(plan.total).toBe(plan.foodCost)
    const done = act(s, { type: 'provision', ...road })
    expect(done.goods.food).toBe(plan.food)
    expect(done.gold).toBe(s.gold - plan.total)
    expect(warns(done, 'greenvale-2')).toEqual([])
    expect(provisionPlan(done, content, road)!.ready).toBe(true)
    // A brisk pace walks fewer days, so it needs no more food than the steady one.
    expect(provisionPlan(s, content, { ...road, pace: 'brisk' })!.food).toBeLessThanOrEqual(
      plan.food
    )
  })

  test('never buys waterskins, but says how many more the road needs', () => {
    const solo = at('greenvale-1', { party: [brom], goods: { food: 20, water: 1 } })
    // Ashmoor is further: one member's skin holds less than the walk needs.
    const long = { routeId: 'ashmoor-1-greenvale-1' }
    const plan = provisionPlan(solo, content, long)!
    expect(plan.waterskinsShort).toBeGreaterThan(0)
    const done = act(solo, { type: 'provision', ...long })
    expect(done.waterskins).toBe(0)
    expect(done.log.at(-1)!.text).toMatch(/more waterskin/)
    // With the skins bought by hand, provisioning fills them as far as the road needs.
    const skinned = act(solo, { type: 'buyWaterskin', count: plan.waterskinsShort })
    expect(provisionPlan(skinned, content, long)!.waterskinsShort).toBe(0)
    const ready = act(skinned, { type: 'provision', ...long })
    expect(ready.goods.water).toBeLessThanOrEqual(partyWaterCapacity(ready))
    expect(warns(ready, 'ashmoor-1')).toEqual([])
  })

  test('fills only the water the road needs, not every spare skin', () => {
    // Four spare skins, nearly dry: the short road to Greenvale needs far less than they hold.
    const s = at('greenvale-1', { goods: { food: 20, water: 1 }, waterskins: 4 })
    const plan = provisionPlan(s, content, road)!
    expect(plan.waterskinsShort).toBe(0)
    const done = act(s, { type: 'provision', ...road })
    expect(done.goods.water).toBe(1 + plan.water)
    expect(done.goods.water).toBeLessThan(partyWaterCapacity(done))
    expect(warns(done, 'greenvale-2')).toEqual([])
  })

  test('warns when the water the road needs leaves the party encumbered', () => {
    // A solo walker already near capacity with cargo: the long road's water tips the balance.
    const laden = at('greenvale-1', {
      party: [brom],
      goods: { food: 8, water: 0, metal: 1 },
      waterskins: 6,
    })
    const plan = provisionPlan(laden, content, { routeId: 'ashmoor-1-greenvale-1' })!
    expect(plan.water).toBeGreaterThan(0)
    expect(plan.waterEncumbers).toBe(true)
    const done = act(laden, { type: 'provision', routeId: 'ashmoor-1-greenvale-1' })
    expect(done.log.at(-1)!.text).toMatch(/encumbered/)
    // Without the cargo the same water is no burden.
    const light = { ...laden, goods: { food: 8, water: 0 } }
    expect(
      provisionPlan(light, content, { routeId: 'ashmoor-1-greenvale-1' })!.waterEncumbers
    ).toBe(false)
  })

  test('stays within the gold, and says so', () => {
    const poor = at('greenvale-1', { gold: 1 })
    const plan = provisionPlan(poor, content, road)!
    expect(plan.limit).toBe('gold')
    expect(plan.total).toBeLessThanOrEqual(1)
    const done = act(poor, { type: 'provision', ...road })
    expect(done.gold).toBeGreaterThanOrEqual(0)
    expect(done.log.at(-1)!.text).toMatch(/all the gold allows\.$/)
    // With no coin at all, nothing is bought, but the party is not "ready" either.
    const broke = at('greenvale-1', { gold: 0 })
    expect(provisionPlan(broke, content, road)).toMatchObject({ food: 0, ready: false })
    expect(act(broke, { type: 'provision', ...road }).log.at(-1)!.text).toMatch(
      /all the gold allows\.$/
    )
  })

  test('feeds escorted passengers too, and the supply outlook on the road counts them', () => {
    const escort: ContractState = {
      id: 'c-test',
      template: 'see-pilgrim',
      kind: 'escort',
      patron: 'someone',
      from: 'greenvale-1',
      to: 'greenvale-2',
      good: null,
      amount: 0,
      poi: null,
      passengers: 2,
      accepted: 1,
      deadline: 9,
      pay: 30,
      level: 1,
      urgent: false,
      reputation: { patron: 5, settlement: 3 },
      met: false,
    }
    const s = at('greenvale-1')
    const guarded = at('greenvale-1', { contracts: [escort] })
    expect(provisionPlan(guarded, content, road)!.food).toBeGreaterThan(
      provisionPlan(s, content, road)!.food
    )
    // The passengers drink too: the skins they need are bought by hand first.
    const skins = provisionPlan(guarded, content, road)!.waterskinsShort
    const skinned = act(guarded, { type: 'buyWaterskin', count: skins })
    const done = act(skinned, { type: 'provision', ...road })
    expect(warns(done, 'greenvale-2')).toEqual([])
    // Set out with exactly that: the outlook (the supply-warning stop) agrees it lasts, and it
    // wouldn't for the party without the passengers' share bought.
    const out = act(done, { type: 'travel', ...road, forage: false })
    expect(supplyOutlook(out, content).food).toBe(true)
    const short = { ...out, goods: { ...out.goods, food: provisionPlan(s, content, road)!.food } }
    expect(supplyOutlook(short, content).food).toBe(false)
  })

  test('has nothing to plan outside a settlement or for a road from elsewhere', () => {
    expect(provisionPlan(at('greenvale-2'), content, { routeId: 'ashmoor-1-greenvale-1' })).toBe(
      null
    )
  })
})

describe('auto-rest on arrival', () => {
  test('rests at the inn when hurt and able to pay, on carried food otherwise, else not at all', () => {
    const hurt = [{ ...brom, hp: 3 }, lyra]
    const rich = at('ashmoor-1', { party: hurt, gold: 50, goods: { food: 4 } })
    expect(arrivalRest(rich, content)).toEqual({ lodging: true })
    const rested = act(rich, { type: 'autoRest' })
    expect(rested.day).toBe(rich.day + 1)
    expect(rested.party[0].hp).toBe(3 + Math.ceil(brom.maxHp * COMMON_ROOM_HEAL))
    expect(rested.log.some((e) => e.text.startsWith('Auto-rest:'))).toBe(true)

    const broke = at('ashmoor-1', { party: hurt, gold: 0, goods: { food: 4 } })
    expect(arrivalRest(broke, content)).toEqual({ lodging: false })
    expect(arrivalRest({ ...broke, goods: {} }, content)).toBeNull()

    const fine = at('ashmoor-1', { gold: 50 })
    expect(arrivalRest(fine, content)).toBeNull()
    expect(act(fine, { type: 'autoRest' })).toEqual(fine)
    const strained = at('ashmoor-1', { party: [{ ...brom, strain: { survival: 1 } }, lyra] })
    expect(arrivalRest(strained, content)).not.toBeNull()
  })
})

describe('refilling by itself', () => {
  test('fills the members’ own skins, and spare skins only while the party stays light', () => {
    const s = at('greenvale-1', { party: [brom], goods: { food: 4, water: 0 }, waterskins: 10 })
    const water = autoRefill(s, content).water!
    expect(water).toBeGreaterThanOrEqual(waterCapacity(1))
    expect(water).toBeLessThan(partyWaterCapacity(s))
    expect(load({ ...s, goods: { ...s.goods, water } }, content).level).toBe('light')
    // Unladen with few spare skins, they are all filled.
    const few = { ...s, waterskins: 1 }
    expect(autoRefill(few, content).water).toBe(partyWaterCapacity(few))
  })
})
