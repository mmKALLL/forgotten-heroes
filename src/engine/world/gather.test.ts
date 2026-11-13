import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import type { Tier } from '../../schema/types'
import type { Content } from '../../content/build'
import { load } from '../economy/capacity'
import { goodPrice } from '../economy/goods'
import { quote } from '../economy/market'
import { createRng } from '../rng'
import { rollCheck } from '../rules/checks'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { GATHER_HUNGRY, gatherOptions, type GatherOption } from './gather'
import { GATHERER_RATIONS, GATHER_DAYS, GATHER_INJURY, OVERLOAD_RATIO } from '../constants'

const content = fixtureContent()

/** In a settlement: ashmoor-1 (marsh, herb-gatherers) or farisle-1 (forest, sawmills). */
const at = (location: string, overrides: Partial<GameState> = {}): GameState =>
  makeState({ location, goods: { food: 10, water: 2 }, ...overrides })
const only = (state: GameState): GatherOption => {
  const options = gatherOptions(state, content)
  expect(options).toHaveLength(1)
  return options[0]
}

/** A state whose gathering roll lands on this tier. */
function rolling(base: GameState, tier: Tier): GameState {
  const option = only(base)
  for (let seed = 0; seed < 5000; seed++) {
    if (rollCheck(createRng(seed), option.modifier, option.dc)[0].tier === tier) {
      return { ...base, rng: createRng(seed) }
    }
  }
  throw new Error(`no seed rolls ${tier}`)
}
const gather = (state: GameState, rule: string) => step(state, { type: 'gather', rule }, content)

describe('gatherOptions', () => {
  test("one option per rule for the settlement's land; none without a rule, on the road or at a site", () => {
    expect(only(at('ashmoor-1')).rule).toBe('healing-herbs')
    expect(only(at('farisle-1')).rule).toBe('cut-timber')
    expect(gatherOptions(at('greenvale-1'), content)).toEqual([])
    const poi = Object.keys(makeState().world.pois)[0]
    expect(gatherOptions(at(poi), content)).toEqual([])
  })

  test('sorted by what a success would sell for here, biggest first', () => {
    // Two more forest rules: a rich fuel one and a poor timber one.
    const more: Content = {
      ...content,
      gatherRules: {
        ...content.gatherRules,
        'big-firewood': {
          ...content.gatherRules['cut-timber'],
          id: 'big-firewood',
          good: 'fuel',
          yield: { critFail: 0, fail: 0, partial: 4, success: 8, critSuccess: 10 },
        },
        'thin-timber': {
          ...content.gatherRules['cut-timber'],
          id: 'thin-timber',
          yield: { critFail: 0, fail: 0, partial: 1, success: 1, critSuccess: 1 },
        },
      },
    }
    const state = at('farisle-1')
    const options = gatherOptions(state, more)
    expect(options).toHaveLength(3)
    const values = options.map((o) => o.value)
    expect(values).toEqual([...values].sort((a, b) => b - a))
    expect(options.at(-1)!.rule).toBe('thin-timber')
    for (const o of options) {
      const units = o.outcomes.find((x) => x.tier === 'success')!.units
      const sold = quote(state, more, 'farisle-1', o.good, 'sell', units)?.total
      expect(o.value, o.rule).toBe(sold ?? units * goodPrice(more, o.good))
    }
  })

  test('producers make it easier: the DC drops by the output level', () => {
    // Sawmills make timber at level 3 in the forest; herb-gatherers healing at 1 in the marsh.
    expect(only(at('farisle-1')).dc).toBeLessThan(only(at('farisle-1')).baseDc)
    expect(only(at('farisle-1')).baseDc - only(at('farisle-1')).dc).toBeGreaterThan(
      only(at('ashmoor-1')).baseDc - only(at('ashmoor-1')).dc
    )
  })
})

describe('a gathering', () => {
  test("the preview is what it brings home, the days it takes and the gatherer's food alone", () => {
    for (const tier of ['partial', 'success', 'critSuccess'] as const) {
      const state = rolling(at('ashmoor-1'), tier)
      const option = only(state)
      expect(option).toMatchObject({ days: GATHER_DAYS, food: GATHER_DAYS * GATHERER_RATIONS })
      expect(option.hungry).toBe(false)
      const shown = option.outcomes.find((o) => o.tier === tier)!
      const after = gather(state, 'healing-herbs')
      expect(after.lastRoll?.tier).toBe(tier)
      expect((after.goods.healing ?? 0) - (state.goods.healing ?? 0)).toBe(shown.units)
      expect(after.day).toBe(state.day + option.days)
      // Only the gatherer eats; the rest of the party waits, neither resting nor tiring.
      expect(after.goods.food).toBe(state.goods.food! - option.food)
      expect(after.goods.water).toBe(state.goods.water)
      for (const c of after.party.filter((c) => c.id !== option.actorId)) {
        const was = state.party.find((x) => x.id === c.id)!
        expect([c.hp, c.exhaustion]).toEqual([was.hp, was.exhaustion])
      }
    }
  })

  test('refused without the food for the gatherer', () => {
    const state = at('ashmoor-1', { goods: { food: GATHER_DAYS * GATHERER_RATIONS - 1 } })
    const option = only(state)
    expect(option).toMatchObject({ hungry: true, available: false, reason: GATHER_HUNGRY })
    const after = gather(state, 'healing-herbs')
    expect(after.day).toBe(state.day)
    expect(after.goods).toEqual(state.goods)
    expect(after.log.at(-1)?.text).toBe(GATHER_HUNGRY)
  })

  test('depletion lowers the next yield, and the land recovers over time', () => {
    const fresh = only(at('farisle-1'))
    expect(fresh.depleted).toBe(0)
    let state = at('farisle-1', { gold: 0 })
    for (let day = 0; day < 4; day++) {
      state = gather(rolling({ ...state, goods: { food: 10, water: 2 } }, 'success'), 'cut-timber')
    }
    const worn = only({ ...state, goods: { food: 10, water: 2 } })
    expect(worn.depleted).toBeGreaterThan(0)
    const yieldOf = (o: GatherOption) => o.outcomes.find((x) => x.tier === 'success')!.units
    expect(yieldOf(worn)).toBeLessThan(yieldOf(fresh))
    const later = only({ ...state, day: state.day + 60, goods: { food: 10, water: 2 } })
    expect(later.depleted).toBeLessThan(worn.depleted / 4)
  })

  test('the yield never overloads the party: the rest is left behind', () => {
    // Carrying timber already, with room for exactly one more load before overloading.
    const base = at('farisle-1')
    const laden = load(base, content)
    const loads = Math.floor((laden.capacity * OVERLOAD_RATIO - laden.weight) / 20) - 1
    const heavy = { ...base, goods: { ...base.goods, timber: loads } }
    const option = only(heavy)
    expect(option.room).toBe(1)
    expect(option.outcomes.find((o) => o.tier === 'critSuccess')!.units).toBe(1)
    const after = gather(rolling(heavy, 'critSuccess'), 'cut-timber')
    expect(after.goods.timber).toBe(loads + 1)
    expect(load(after, content).level).not.toBe('overloaded')
    expect(after.log.some((l) => l.text.includes('left behind'))).toBe(true)
    // What is left behind still lies there: the land is picked over by what was carried only.
    expect(after.gathered['farisle-1']?.timber?.units).toBe(1)
  })

  test('a critical failure brings what the preview says: trouble, or the lead hurt', () => {
    const state = rolling(at('ashmoor-1'), 'critFail')
    const { actorId: lead, mishap, odds } = only(state)
    expect(mishap.chance).toBe(odds.critFail)
    const after = gather(state, 'healing-herbs')
    const hp = (s: GameState) => s.party.find((c) => c.id === lead)!.hp
    if (mishap.ambush) expect(after.encounter).not.toBeNull()
    else expect(hp(after)).toBe(Math.max(0, hp(state) - mishap.injury))
  })

  test('the lead’s injury is the written one for a novice party, deeper for a seasoned one', () => {
    expect(only(at('ashmoor-1')).mishap.injury).toBe(GATHER_INJURY)
    const seasoned = at('ashmoor-1')
    const big = { ...seasoned, party: seasoned.party.map((c) => ({ ...c, hp: 80, maxHp: 80 })) }
    const { actorId: lead, mishap } = only(big)
    expect(mishap.injury).toBeGreaterThan(GATHER_INJURY)
    const state = rolling(big, 'critFail')
    const after = gather(state, 'healing-herbs')
    const hp = (s: GameState) => s.party.find((c) => c.id === lead)!.hp
    if (!mishap.ambush) expect(hp(after)).toBe(hp(state) - mishap.injury)
  })
})
