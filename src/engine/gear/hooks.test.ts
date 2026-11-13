import { describe, expect, test } from 'vitest'
import type { RuleHook } from '../../schema/gear'
import type { Character, GameState } from '../../schema/state'
import { memberCapacity } from '../economy/capacity'
import { quote } from '../economy/market'
import { encounterOptions } from '../encounters/preview'
import { createRng } from '../rng'
import { TIERS, rollCheck, tierFor, tierOdds, type RollMode } from '../rules/checks'
import { fadeStrainAfter, useSkill } from '../rules/strain'
import { step } from '../state'
import { brom, fixtureContent, lyra, makeState } from '../test-fixtures'
import { forageCheck } from '../travel/forage'
import { placeOnRoute } from '../travel/journey'
import { routeOptions } from '../travel/preview'
import { describeHook, hasLuck, sellBonus, spendLuck, wardShare } from './hooks'

const content = fixtureContent()

const wearing = (c: Character, ...hooks: RuleHook[]): Character => ({
  ...c,
  accessory: { id: `a-${c.id}`, name: 'Charm', tier: 1, hooks, value: 10 },
})

const read = (state: GameState) => encounterOptions(state).find((o) => o.id === 'read')!

describe('skill hooks', () => {
  test('a +1 skill hook shows in the preview and in the roll', () => {
    const plain = step(makeState(), { type: 'startEncounter', situationId: 'roadside' }, content)
    const keen = {
      ...plain,
      party: [brom, wearing(lyra, { hook: 'skill', skill: 'insight', amount: 1 })],
    }
    const before = read(plain).check!
    const after = read(keen).check!
    expect(after.modifier).toBe(before.modifier + 1)
    expect(after.odds).toEqual(tierOdds(after.modifier, after.dc))
    const rolled = step(keen, { type: 'chooseOption', optionId: 'read' }, content)
    expect(rolled.lastRoll).toMatchObject({ actorId: 'lyra', modifier: after.modifier })
  })

  test('an activity hook helps whoever leads it', () => {
    const plain = forageCheck(makeState(), 'forest', 'steady')!
    const party = makeState().party.map((c) =>
      wearing(c, { hook: 'activity', activity: 'forage', amount: 2 })
    )
    expect(forageCheck({ party }, 'forest', 'steady')!.modifier).toBe(plain.modifier + 2)
  })
})

describe('the lucky reroll', () => {
  /** Brute force: every die, and every reroll of a kept 1. */
  function bruteForce(modifier: number, dc: number, mode: RollMode) {
    const counts = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<string, number>
    let cases = 0
    const faces = Array.from({ length: 20 }, (_, i) => i + 1)
    for (const a of faces) {
      for (const b of mode === 'normal' ? [0] : faces) {
        for (const r of faces) {
          const kept =
            mode === 'advantage' ? Math.max(a, b) : mode === 'disadvantage' ? Math.min(a, b) : a
          const final = kept === 1 ? r : kept
          counts[tierFor(final, final + modifier, dc)]++
          cases++
        }
      }
    }
    return Object.fromEntries(TIERS.map((t) => [t, counts[t] / cases]))
  }

  test('tierOdds with rerollOnes sums to 1 and matches a brute-force count', () => {
    for (const mode of ['normal', 'advantage', 'disadvantage'] as const) {
      for (const [modifier, dc] of [
        [0, 10],
        [3, 15],
        [-2, 8],
      ]) {
        const odds = tierOdds(modifier, dc, mode, true)
        expect(TIERS.reduce((sum, t) => sum + odds[t], 0)).toBeCloseTo(1, 12)
        const brute = bruteForce(modifier, dc, mode)
        for (const t of TIERS) expect(odds[t]).toBeCloseTo(brute[t], 12)
        expect(odds.critFail).toBeLessThan(tierOdds(modifier, dc, mode).critFail)
      }
    }
  })

  test('the preview counts the reroll, and a natural 1 spends the luck for the day', () => {
    const started = step(makeState(), { type: 'startEncounter', situationId: 'roadside' }, content)
    const lucky = { ...started, party: [brom, wearing(lyra, { hook: 'lucky' })] }
    const check = read(lucky).check!
    expect(check.lucky).toBe(true)
    expect(check.odds).toEqual(tierOdds(check.modifier, check.dc, 'normal', true))
    // A seed whose first die is a natural 1.
    let seed = 1
    while (rollCheck(createRng(seed), 0, 10)[0].kept !== 1) seed++
    const rolled = step(
      { ...lucky, rng: createRng(seed) },
      { type: 'chooseOption', optionId: 'read' },
      content
    )
    expect(rolled.luckUsed).toEqual({ lyra: lucky.day })
    expect(rolled.lastRoll?.kept).toBe(rollCheck(createRng(seed), 0, 10, 'normal', true)[0].kept)
    expect(rolled.log.some((l) => l.text.includes('turns the luck'))).toBe(true)
    expect(hasLuck(rolled, 'lyra')).toBe(false)
    expect(hasLuck({ ...rolled, day: rolled.day + 1 }, 'lyra')).toBe(true)
  })

  test("spending luck keeps only today's entries", () => {
    const state = { day: 9, luckUsed: { brom: 3, lyra: 9, gone: 1 } }
    expect(spendLuck(state, 'brom').luckUsed).toEqual({ brom: 9, lyra: 9 })
  })
})

describe('party hooks', () => {
  test('a ward lowers the hostile share in the preview and on the journey alike', () => {
    const at = makeState({ location: 'greenvale-1', goods: { food: 20, water: 8 } })
    const warded = {
      ...at,
      party: [
        wearing(brom, { hook: 'ward', share: 0.05 }),
        wearing(lyra, { hook: 'ward', share: 0.03 }),
      ],
    }
    expect(wardShare(warded)).toBe(0.05)
    const steady = (s: GameState) =>
      routeOptions(s, content)
        .find((o) => o.routeId === 'greenvale-1-greenvale-2')!
        .paces.find((p) => p.pace === 'steady')!
    expect(steady(warded).hostile.ward).toBe(-0.05)
    expect(steady(warded).hostile.drawn).toBeLessThan(steady(at).hostile.drawn)
    const out = step(
      warded,
      { type: 'travel', routeId: 'greenvale-1-greenvale-2', pace: 'steady' },
      content
    )
    expect(placeOnRoute(out, content, out.travel!)!.hostileShare).toBe(steady(warded).hostile.drawn)
  })

  test('a sell bonus pays more for its category, but never above the middle price', () => {
    const state = makeState()
    const haggler = {
      ...state,
      party: [wearing(brom, { hook: 'sellBonus', category: 'precious', share: 0.2 }), lyra],
    }
    expect(sellBonus(haggler, 'gems')).toBe(0.2)
    expect(sellBonus(haggler, 'food')).toBe(0)
    const where = Object.keys(state.world.settlements).find(
      (id) => quote(state, content, id, 'gems', 'sell', 1) !== null
    )!
    const plain = quote(state, content, where, 'gems', 'sell', 3)!
    const more = quote(haggler, content, where, 'gems', 'sell', 3)!
    expect(more.total).toBeGreaterThan(plain.total)
    expect(more.unitFirst).toBeLessThanOrEqual(
      quote(haggler, content, where, 'gems', 'buy', 1)!.unitFirst
    )
  })
})

describe('carrying and Strain', () => {
  test('a carry hook raises capacity by its kg', () => {
    expect(memberCapacity(wearing(brom, { hook: 'carry', kg: 5 }))).toBe(memberCapacity(brom) + 5)
  })

  test('strainGrace delays the daily stack by one use', () => {
    const uses = (c: Character, n: number) => {
      let state: Pick<GameState, 'day' | 'party' | 'skillUses'> = {
        day: 1,
        party: [c],
        skillUses: [],
      }
      const strained: number[] = []
      for (let i = 0; i < n; i++) {
        const used = useSkill(state, c.id, 'survival')
        strained.push(used.strained)
        state = { ...state, party: used.party, skillUses: used.skillUses }
      }
      return strained
    }
    expect(uses(brom, 4)).toEqual([0, 0, 1, 2])
    expect(uses(wearing(brom, { hook: 'strainGrace', amount: 1 }), 4)).toEqual([0, 0, 0, 1])
  })

  test('strainFade fades one more stack a day', () => {
    const tired = { ...brom, strain: { survival: 3 } }
    expect(fadeStrainAfter(tired, [], 1).strain).toEqual({ survival: 2 })
    expect(
      fadeStrainAfter(wearing(tired, { hook: 'strainFade', amount: 1 }), [], 1).strain
    ).toEqual({
      survival: 1,
    })
  })
})

test('describeHook says what a hook does in a line', () => {
  expect(describeHook({ hook: 'skill', skill: 'perception', amount: 1 })).toBe('+1 Perception')
  expect(describeHook({ hook: 'sellBonus', category: 'precious', share: 0.1 })).toBe(
    'Sells luxuries, gems and relics for 10% more'
  )
  expect(describeHook({ hook: 'ward', share: 0.03 })).toBe('−3% hostile on the road')
})
