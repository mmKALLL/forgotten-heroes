import { describe, expect, test } from 'vitest'
import type { Tier } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { createRng } from '../rng'
import { tierOdds } from '../rules/checks'
import { brom, lyra, makeState } from '../test-fixtures'
import { expectedForage, forageCheck, forageDay, forageYield } from './forage'
import { FORAGE_DC, FORAGE_PACE_MODIFIER } from '../constants'

const base = (overrides: Partial<GameState> = {}): GameState =>
  makeState({ location: null, goods: { food: 4, water: 2 }, ...overrides })

/** The first seed whose forage roll lands on `tier`. */
function seeded(tier: Tier, overrides: Partial<GameState> = {}, terrain = 'plains' as const) {
  for (let seed = 0; seed < 500; seed++) {
    const state = base({ rng: createRng(seed), ...overrides })
    const { result } = forageDay(state, terrain, 'steady')
    if (result?.tier === tier) return state
  }
  throw new Error(`no seed rolls ${tier}`)
}

describe('forageCheck', () => {
  test('the best Survival in the party forages, against a DC set by the terrain', () => {
    // Brom (WIS 12) beats Lyra (WIS 10).
    expect(forageCheck(base(), 'forest', 'steady')).toMatchObject({
      actorId: 'brom',
      skill: 'survival',
      dc: FORAGE_DC.forest,
      modifier: 1,
      odds: tierOdds(1, FORAGE_DC.forest),
    })
    expect(FORAGE_DC.forest).toBeLessThan(FORAGE_DC.hills)
    expect(FORAGE_DC.hills).toBeLessThan(FORAGE_DC.marsh)
    expect(FORAGE_DC.marsh).toBeLessThan(FORAGE_DC.mountains)
    expect(FORAGE_DC.mountains).toBeLessThan(FORAGE_DC.desert)
  })

  test('shows what each tier finds: a success a day of water, a partial half, a failure nothing', () => {
    expect(forageCheck(base(), 'plains', 'steady')!.outcomes).toEqual({
      critFail: { food: 0, water: 0 },
      fail: { food: 0, water: 0 },
      partial: { food: 0, water: 1 },
      success: { food: 0, water: 2 },
      critSuccess: { food: 2, water: 2 },
    })
  })

  test('nothing to forage at sea, or with no one fit to look', () => {
    expect(forageCheck(base(), 'sea', 'steady')).toBeNull()
    expect(forageCheck(base(), null, 'steady')).toBeNull()
    const down = base({
      party: [
        { ...brom, hp: 0 },
        { ...lyra, exhaustion: 6 },
      ],
    })
    expect(forageCheck(down, 'plains', 'steady')).toBeNull()
  })

  test('strain, exhaustion and wounds hand the job to someone else', () => {
    expect(
      forageCheck(base({ party: [{ ...brom, hp: 0 }, lyra] }), 'plains', 'steady')!.actorId
    ).toBe('lyra')
    const strained = base({ party: [{ ...brom, strain: { survival: 2 } }, lyra] })
    expect(forageCheck(strained, 'plains', 'steady')!.actorId).toBe('lyra')
    const tired = base({ party: [{ ...brom, exhaustion: 1 }, lyra] })
    expect(forageCheck(tired, 'plains', 'steady')!.actorId).toBe('lyra')
  })

  test('a forced march forages at a penalty', () => {
    expect(FORAGE_PACE_MODIFIER.forced).toBe(-2)
    expect(forageCheck(base(), 'plains', 'forced')!.modifier).toBe(1 - 2)
    expect(forageCheck(base(), 'plains', 'stealthy')!.modifier).toBe(1)
  })
})

describe('forageYield', () => {
  test('a success finds a day of water, a critical success food too, a partial half', () => {
    expect(forageYield('critSuccess', 2, 'plains')).toEqual({ food: 2, water: 2 })
    expect(forageYield('success', 2, 'plains')).toEqual({ food: 0, water: 2 })
    expect(forageYield('partial', 2, 'plains')).toEqual({ food: 0, water: 1 })
    expect(forageYield('fail', 2, 'plains')).toEqual({ food: 0, water: 0 })
    expect(forageYield('critFail', 2, 'plains')).toEqual({ food: 0, water: 0 })
  })

  test('a day of water in the desert is twice as much', () => {
    expect(forageYield('success', 2, 'desert')).toEqual({ food: 0, water: 4 })
    expect(forageYield('partial', 3, 'desert')).toEqual({ food: 0, water: 3 })
  })
})

describe('expectedForage', () => {
  test('weighs each tier’s yield by its exact odds', () => {
    const odds = tierOdds(1, FORAGE_DC.hills)
    const expected = expectedForage(base(), 'hills', 'steady')
    expect(expected.food).toBeCloseTo(odds.critSuccess * 2, 12)
    expect(expected.water).toBeCloseTo((odds.critSuccess + odds.success) * 2 + odds.partial, 12)
    expect(expectedForage(base(), 'sea', 'steady')).toEqual({ food: 0, water: 0 })
  })
})

describe('forageDay', () => {
  test('a success adds a day of water, and the roll counts as a use of Survival', () => {
    const before = seeded('success')
    const { state, result } = forageDay(before, 'plains', 'steady')
    expect(result).toMatchObject({ actorId: 'brom', tier: 'success', food: 0, water: 2 })
    expect(state.goods).toEqual({ food: 4, water: 4 })
    expect(state.rng).not.toEqual(before.rng)
    expect(state.skillUses.at(-1)).toEqual({
      day: before.day,
      characterId: 'brom',
      skill: 'survival',
    })
    expect(state.log).toEqual(before.log)
  })

  test('a critical success brings back food as well, and Inspiration like any natural 20', () => {
    const before = seeded('critSuccess')
    const { state, result } = forageDay(before, 'plains', 'steady')
    expect(state.goods).toEqual({ food: 6, water: 4 })
    expect(state.inspiration).toBe(before.inspiration + 1)
    expect(result!.inspired).toBe(true)
    const plain = seeded('success')
    expect(forageDay(plain, 'plains', 'steady').state.inspiration).toBe(plain.inspiration)
  })

  test('the waterskins only hold so much', () => {
    const full = seeded('success', { goods: { food: 4, water: 7 } })
    const { state, result } = forageDay(full, 'plains', 'steady')
    expect(state.goods.water).toBe(8)
    expect(result).toMatchObject({ water: 1, wasted: 1 })
    const roomy = seeded('success', { goods: { food: 4, water: 7 }, waterskins: 1 })
    expect(forageDay(roomy, 'plains', 'steady').state.goods.water).toBe(9)
  })

  test('foraging every day on top of other Survival checks strains the forager', () => {
    const today = base().day
    const busy = base({
      skillUses: [
        { day: today, characterId: 'brom', skill: 'survival' },
        { day: today, characterId: 'brom', skill: 'survival' },
      ],
    })
    const { state, result } = forageDay(busy, 'plains', 'steady')
    expect(result!.strained).toBe(1)
    expect(state.party[0].strain).toEqual({ survival: 1 })
  })

  test('does nothing at sea', () => {
    const before = base()
    expect(forageDay(before, 'sea', 'steady')).toEqual({ state: before, result: null })
  })
})
