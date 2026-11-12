import { describe, expect, test } from 'vitest'
import type { ContractState, GameState } from '../../schema/state'
import { step, type Action } from '../state'
import { brom, fixtureContent, lyra, makeState } from '../test-fixtures'
import { routeOptions } from '../travel/preview'
import { partyWaterCapacity } from '../travel/supplies'
import { supplyOutlook } from '../travel/outlook'
import { arrivalRest } from './arrival'
import { provisionPlan } from './provision'

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
    expect(plan.total).toBe(plan.foodCost + plan.waterskinCost)
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

  test('buys waterskins when the skins can’t hold the road’s water, and fills them', () => {
    const solo = at('greenvale-1', { party: [brom], goods: { food: 20, water: 1 } })
    // Ashmoor is further: one member's skin holds less than the walk needs.
    const long = { routeId: 'ashmoor-1-greenvale-1' }
    const plan = provisionPlan(solo, content, long)!
    expect(plan.waterskins).toBeGreaterThan(0)
    const done = act(solo, { type: 'provision', ...long })
    expect(done.waterskins).toBe(plan.waterskins)
    expect(done.goods.water).toBe(partyWaterCapacity(done))
  })

  test('stays within the gold, and says so', () => {
    const poor = at('greenvale-1', { gold: 1 })
    const plan = provisionPlan(poor, content, road)!
    expect(plan.limit).toBe('gold')
    expect(plan.total).toBeLessThanOrEqual(1)
    const done = act(poor, { type: 'provision', ...road })
    expect(done.gold).toBeGreaterThanOrEqual(0)
    expect(done.log.at(-1)!.text).toMatch(/all the gold allows\.$/)
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
      urgent: false,
      reputation: { patron: 5, settlement: 3 },
      met: false,
    }
    const s = at('greenvale-1')
    const guarded = at('greenvale-1', { contracts: [escort] })
    expect(provisionPlan(guarded, content, road)!.food).toBeGreaterThan(
      provisionPlan(s, content, road)!.food
    )
    const done = act(guarded, { type: 'provision', ...road })
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
    expect(rested.party[0].hp).toBe(brom.maxHp)
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
