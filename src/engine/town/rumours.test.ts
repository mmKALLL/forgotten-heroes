import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { previewCheck } from '../preview'
import { createRng } from '../rng'
import { rollCheck, type Tier } from '../rules/checks'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { nearestSettlements } from '../travel/reach'
import { STANDING_POINTS } from '../constants'
import { RUMOUR_LEAD, RUMOURS_DONE, rumourOption } from './rumours'
import { serviceRows } from './services'

const content = fixtureContent()
const HERE = 'greenvale-1'

/** At greenvale-1 on day 20, with an inn, gold, and no prices known but its own. */
function here(overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location: HERE, day: 20, gold: 50 })
  const settlements = { ...s.world.settlements }
  settlements[HERE] = {
    ...settlements[HERE],
    services: [...new Set([...settlements[HERE].services, 'inn-tavern'])],
  }
  return { ...s, world: { ...s.world, settlements }, priceBook: {}, doneHere: [], ...overrides }
}

/** A state whose rumour roll lands on this tier. */
function rolling(tier: Tier, base: GameState = here()): GameState {
  const option = rumourOption(base, content)!
  for (let seed = 0; seed < 5000; seed++) {
    const state = { ...base, rng: createRng(seed) }
    if (rollCheck(state.rng, option.modifier, option.dc)[0].tier === tier) return state
  }
  throw new Error(`no seed rolls ${tier}`)
}

const listen = (s: GameState) => step(s, { type: 'listenRumours' }, content)
const undiscovered = (s: GameState) =>
  Object.entries(s.world.pois)
    .filter(([, p]) => !p.discovered)
    .map(([id]) => id)

describe('rumourOption', () => {
  test('its odds are previewCheck’s for the best listener, and the crits stay hidden', () => {
    const state = here()
    const option = rumourOption(state, content)!
    const check = previewCheck(state, option.skill, option.dc, 'normal')!
    expect(option.actorId).toBe(check.actorId)
    expect(option.chances).toEqual(check.odds)
    expect(option.outcomes.filter((o) => o.hidden).map((o) => o.tier)).toEqual([
      'critFail',
      'critSuccess',
    ])
    expect(option.outcomes.every((o) => o.hidden === (o.text === null))).toBe(true)
    const row = serviceRows(state, content).find((r) => r.service === 'inn-tavern')!
    expect(row.actions.find((a) => a.action === 'rumours')).toMatchObject({
      available: true,
      cost: option.cost,
    })
  })

  test('standing here lowers the DC', () => {
    const plain = rumourOption(here(), content)!
    const liked = rumourOption(
      here({ reputation: { settlements: { [HERE]: STANDING_POINTS.liked }, people: {} } }),
      content
    )!
    expect(liked.dc).toBe(plain.dc - 2)
  })

  test('there is none without a tavern', () => {
    const s = here()
    const settlements = { ...s.world.settlements }
    settlements[HERE] = { ...settlements[HERE], services: [] }
    expect(rumourOption({ ...s, world: { ...s.world, settlements } }, content)).toBeNull()
  })
})

describe('listenRumours', () => {
  const near = nearestSettlements(content, HERE)

  test.each([
    ['critFail', 1],
    ['fail', 0],
    ['partial', 1],
    ['success', 2],
    ['critSuccess', 3],
  ] as const)('a %s hears %i towns’ prices, dated by the road', (tier, count) => {
    const state = rolling(tier)
    const after = listen(state)
    expect(after.lastRoll?.tier).toBe(tier)
    expect(after.day).toBe(state.day)
    expect(after.gold).toBe(state.gold - rumourOption(state, content)!.cost)
    expect(after.skillUses.length).toBe(state.skillUses.length + 1)
    const heard = Object.keys(after.priceBook)
    expect(heard).toEqual(near.slice(0, count).map((n) => n.id))
    for (const n of near.slice(0, count)) {
      expect(after.priceBook[n.id]).toMatchObject({ heard: true, day: state.day - n.days })
    }
    expect(after.doneHere.includes(RUMOUR_LEAD)).toBe(tier === 'critSuccess')
  })

  test('heard prices are a little off; a false rumour is far off', () => {
    const ok = listen(rolling('partial'))
    const lie = listen(rolling('critFail'))
    const id = near[0].id
    const ratio = (a: GameState, b: GameState) => {
      const pa = a.priceBook[id].prices
      const pb = b.priceBook[id].prices
      return Object.keys(pa).flatMap((g) => {
        const x = pa[g as keyof typeof pa]!.buy ?? pa[g as keyof typeof pa]!.sell!
        const y = pb[g as keyof typeof pb]!.buy ?? pb[g as keyof typeof pb]!.sell!
        // Prices are whole gold: a 1–2 gp price can't show the skew.
        return y >= 10 ? [x / y] : []
      })
    }
    // Both are skewed from the same truth: ±10% against ±40% means a ratio far from 1.
    for (const r of ratio(lie, ok)) expect(Math.abs(Math.log(r))).toBeGreaterThan(Math.log(1.2))
  })

  test('a success reveals an undiscovered site of this land, and none when all are known', () => {
    const state = rolling('success')
    const after = listen(state)
    expect(undiscovered(after).length).toBe(undiscovered(state).length - 1)
    const pois = Object.fromEntries(
      Object.entries(state.world.pois).map(([id, p]) => [id, { ...p, discovered: true }])
    )
    const known = { ...state, world: { ...state.world, pois } }
    expect(listen(known).world.pois).toEqual(pois)
  })

  test('once per arrival', () => {
    const after = listen(here())
    expect(after.doneHere).toContain(RUMOURS_DONE)
    expect(rumourOption(after, content)).toBeNull()
    const again = listen(after)
    expect(again.log.at(-1)!.tone).toBe('bad')
    expect(again.gold).toBe(after.gold)
  })
})
