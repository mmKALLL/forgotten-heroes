import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { marketPrices } from '../economy/trade'
import { previewCheck } from '../preview'
import { createRng } from '../rng'
import { rollCheck, type Tier } from '../rules/checks'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { nearestSettlements } from '../travel/reach'
import { RUMOUR_PRICES, STANDING_POINTS } from '../constants'
import { RUMOUR_LEAD, RUMOUR_TROUBLE_TAG, RUMOURS_DONE, rumourOption, rumourPrice } from './rumours'
import { serviceRows } from './services'
import { delvePreview } from '../world/delve'

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
      here({ reputation: { settlements: { [HERE]: STANDING_POINTS.liked } } }),
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

describe('rumourPrice', () => {
  test('a round grows dearer steadily over time, in whole gold', () => {
    const prices = [1, 30, 60, 100, 150, 200, 300].map(rumourPrice)
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThan(prices[i - 1])
    for (const p of prices) expect(Number.isInteger(p)).toBe(true)
  })
})

describe('listenRumours', () => {
  const near = nearestSettlements(content, HERE)

  test.each([
    ['critFail', 0],
    ['fail', 0],
    ['partial', 0],
    ['success', RUMOUR_PRICES.success],
    ['critSuccess', RUMOUR_PRICES.critSuccess],
  ] as const)('a %s hears %i towns’ prices, dated by the road', (tier, count) => {
    const state = rolling(tier)
    const after = listen(state)
    expect(after.lastRoll?.tier).toBe(tier)
    expect(after.day).toBe(state.day)
    // A critical failure may also meet a pickpocket.
    const cost = rumourOption(state, content)!.cost
    if (tier === 'critFail') expect(after.gold).toBeLessThan(state.gold - cost)
    else expect(after.gold).toBe(state.gold - cost)
    expect(after.skillUses.length).toBe(state.skillUses.length + 1)
    const heard = Object.keys(after.priceBook)
    expect(heard).toEqual(near.slice(0, count).map((n) => n.id))
    for (const n of near.slice(0, count)) {
      expect(after.priceBook[n.id]).toMatchObject({ heard: true, day: state.day - n.days })
    }
    expect(after.doneHere.includes(RUMOUR_LEAD)).toBe(tier === 'critSuccess')
  })

  test('heard prices are true, a little off at most', () => {
    const state = rolling('success')
    const after = listen(state)
    const id = near[0].id
    const heard = after.priceBook[id].prices
    const truth = marketPrices({ ...state, day: state.day - near[0].days }, content, id)
    for (const [good, p] of Object.entries(truth)) {
      const real = p.buy ?? p.sell!
      const told = heard[good as keyof typeof heard]!
      // Within ±10%, then rounded up to whole gold.
      expect(told.buy ?? told.sell!, good).toBeGreaterThanOrEqual(Math.floor(real * 0.9))
      expect(told.buy ?? told.sell!, good).toBeLessThanOrEqual(Math.ceil(real * 1.1) + 1)
    }
  })

  test('a partial is idle gossip: no prices, no site, no lead', () => {
    const state = rolling('partial')
    const after = listen(state)
    expect(after.priceBook).toEqual({})
    expect(undiscovered(after)).toEqual(undiscovered(state))
    expect(after.log.at(-1)!.text).not.toMatch(/price|work|board/i)
  })

  test('a critical failure is trouble: a pickpocket (1d6 gp, within the purse) or a fight', () => {
    const cost = rumourOption(here(), content)!.cost
    // The fixtures have no tavern-trouble situation: always the pickpocket.
    const robbed = listen(rolling('critFail'))
    const lost = rolling('critFail').gold - cost - robbed.gold
    expect(lost).toBeGreaterThanOrEqual(1)
    expect(lost).toBeLessThanOrEqual(6)
    expect(robbed.encounter).toBeNull()
    const broke = listen(rolling('critFail', here({ gold: cost })))
    expect(broke.gold).toBe(0)
    // With one, some seeds start the fight instead.
    const brawl = structuredClone(content)
    brawl.situations['tavern-fight'] = {
      ...brawl.situations.grudge,
      id: 'tavern-fight',
      followUpOnly: false,
      weight: 0,
      tags: [RUMOUR_TROUBLE_TAG],
    }
    const option = rumourOption(here(), brawl)!
    const outcomes = new Set<string>()
    for (let seed = 0; seed < 5000 && outcomes.size < 2; seed++) {
      const state = { ...here(), rng: createRng(seed) }
      if (rollCheck(state.rng, option.modifier, option.dc)[0].tier !== 'critFail') continue
      const after = step(state, { type: 'listenRumours' }, brawl)
      outcomes.add(after.encounter ? after.encounter.situation.id : 'pickpocket')
    }
    expect(outcomes).toEqual(new Set(['tavern-fight', 'pickpocket']))
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

  test('a dungeon heard of is known by word: its suggested level shows (Plan 6 wave 2b)', () => {
    const base = here({ location: 'ashmoor-1', crisis: null })
    const vault = Object.keys(base.world.pois).find((id) => base.world.pois[id].dungeon)!
    // Every other site in the vault's land is known already, so the talk is of the vault.
    const pois = Object.fromEntries(
      Object.entries(base.world.pois).map(([id, p]) => [id, { ...p, discovered: id !== vault }])
    )
    const settlements = { ...base.world.settlements }
    settlements['ashmoor-1'] = { ...settlements['ashmoor-1'], services: ['inn-tavern'] }
    const state = rolling('success', { ...base, world: { ...base.world, pois, settlements } })
    expect(delvePreview(state, content, vault)!.suggestedLevel).toBeNull()
    const after = listen(state)
    expect(after.world.pois[vault]).toMatchObject({ discovered: true, known: true })
    const level = delvePreview(after, content, vault)!.suggestedLevel
    expect(level).toBe(delvePreview(after, content, vault)!.level)
    expect(after.log.some((l) => l.text.includes(`calls for a party of level ${level}`))).toBe(true)
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
