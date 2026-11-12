import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import type { Tier } from '../../schema/types'
import { load } from '../economy/capacity'
import { createRng } from '../rng'
import { rollCheck } from '../rules/checks'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { gatherOptions, type GatherOption } from './gather'
import { OVERLOAD_RATIO } from '../constants'

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

  test('producers make it easier: the DC drops by the output level', () => {
    // Sawmills make timber at level 3 in the forest; herb-gatherers healing at 1 in the marsh.
    expect(only(at('farisle-1')).dc).toBeLessThan(only(at('farisle-1')).baseDc)
    expect(only(at('farisle-1')).baseDc - only(at('farisle-1')).dc).toBeGreaterThan(
      only(at('ashmoor-1')).baseDc - only(at('ashmoor-1')).dc
    )
  })
})

describe('a day of gathering', () => {
  test('the outcome lines are what the day brings home (preview == actual)', () => {
    for (const tier of ['partial', 'success', 'critSuccess'] as const) {
      const state = rolling(at('ashmoor-1'), tier)
      const shown = only(state).outcomes.find((o) => o.tier === tier)!
      const after = gather(state, 'healing-herbs')
      expect(after.lastRoll?.tier).toBe(tier)
      expect((after.goods.healing ?? 0) - (state.goods.healing ?? 0)).toBe(shown.units)
      expect(after.day).toBe(state.day + 1)
    }
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
  })

  test('a critical failure brings trouble or hurts the lead', () => {
    const state = rolling(at('ashmoor-1'), 'critFail')
    const lead = only(state).actorId
    const after = gather(state, 'healing-herbs')
    const hp = (s: GameState) => s.party.find((c) => c.id === lead)!.hp
    expect(after.encounter !== null || hp(after) < hp(state)).toBe(true)
  })
})
