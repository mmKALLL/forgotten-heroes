import { describe, expect, test } from 'vitest'
import { GOODS, GOOD_CATEGORY } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { fixtureContent, makeState } from '../test-fixtures'
import {
  MARKET_STALL,
  drift,
  marketLevels,
  midPrice,
  priceFactors,
  pressure,
  qualityEffects,
  quote,
  recordTrade,
  shopsFor,
  spreadModifier,
} from './market'
import {
  DRIFT,
  DRIFT_PERIOD_DAYS,
  PRICE_STEP,
  PRIVATE_ROOM_MIN_QUALITY,
  RECOVERY_HALF_LIFE_DAYS,
  SHORTAGE_GAP,
  SPREAD_MIN,
  SPREAD_PER_QUALITY,
  STANDING_POINTS,
  SUPPLY_MIN,
} from '../constants'
import { shopKeeper } from '../town/reputation'
import { production, supplyOf } from './supply'
import { domainThreatLevel } from '../world/pois'

const content = fixtureContent()
const base = makeState()
const withServices = (id: string, services: string[], s: GameState = base): GameState => ({
  ...s,
  world: {
    ...s.world,
    settlements: { ...s.world.settlements, [id]: { ...s.world.settlements[id], services } },
  },
})
/** A state where every fixture settlement has every fixture service. */
const shopping = ['greenvale-1', 'greenvale-2', 'ashmoor-1', 'farisle-1'].reduce(
  (s, id) =>
    withServices(id, ['inn-tavern', 'adventuring-supplies', 'animals-mounts', 'jewelry-trader'], s),
  base
)
/** The domain holding a settlement made rampant (no garrison, the strongest land threat). */
function rampant(s: GameState, id: string): GameState {
  const domain = s.world.domains[id]
  return {
    ...s,
    world: {
      ...s.world,
      domains: { ...s.world.domains, [id]: { ...domain, garrison: 0 } },
      lands: {
        ...s.world.lands,
        [domain.land]: { ...s.world.lands[domain.land], threatStrength: 6 },
      },
    },
  }
}
const levelOnly = (s: GameState, id: string, good: (typeof GOODS)[number]) =>
  midPrice(s, content, id, good) / drift(s.world.seed, id, good, s.day)

describe('marketLevels and midPrice', () => {
  test('are deterministic', () => {
    expect(marketLevels(base, content, 'greenvale-1')).toEqual(
      marketLevels(base, content, 'greenvale-1')
    )
    expect(midPrice(base, content, 'greenvale-1', 'gems')).toBe(
      midPrice(base, content, 'greenvale-1', 'gems')
    )
  })

  test('a demand rule raises the price and a supply rule lowers it (coastal)', () => {
    // greenvale-1 is coastal, greenvale-2 isn't: the coast supplies food and wants timber.
    expect(marketLevels(base, content, 'greenvale-1').food.supply).toBe(1)
    expect(marketLevels(base, content, 'greenvale-2').food.supply).toBe(0)
    expect(levelOnly(base, 'greenvale-1', 'food')).toBeCloseTo(1 / PRICE_STEP)
    expect(levelOnly(base, 'greenvale-2', 'food')).toBeCloseTo(1)
    expect(levelOnly(base, 'greenvale-1', 'timber')).toBeCloseTo(2 * PRICE_STEP)
  })

  test('arms demand rises with threat 2 or more', () => {
    expect(marketLevels(base, content, 'greenvale-2').arms.demand).toBe(0)
    const threatened = rampant(base, 'greenvale-2')
    expect(marketLevels(threatened, content, 'greenvale-2').arms.demand).toBe(2)
    expect(midPrice(threatened, content, 'greenvale-2', 'arms')).toBeGreaterThan(
      midPrice(base, content, 'greenvale-2', 'arms')
    )
  })

  test('a producer supplies its own market best, and less further down the road', () => {
    // Ashmoor's marsh makes alchemicals (output 2); Greenvale lies 3+ days of road away.
    expect(supplyOf(base, content, 'ashmoor-1', 'alchemicals')).toMatchObject({
      level: 2,
      from: 'ashmoor-1',
      days: 0,
    })
    const near = supplyOf(base, content, 'greenvale-2', 'alchemicals')
    expect(near.from).toBe('ashmoor-1')
    expect(near.level).toBeLessThan(2)
    expect(levelOnly(base, 'greenvale-2', 'alchemicals')).toBeGreaterThan(
      levelOnly(base, 'ashmoor-1', 'alchemicals')
    )
  })

  test('a good no producer can reach is scarce, and a shortage where it is wanted', () => {
    const bare = { ...content, producers: {} }
    expect(supplyOf(base, bare, 'greenvale-1', 'gems').from).toBeNull()
    const level = marketLevels(rampant(base, 'greenvale-2'), bare, 'greenvale-2').arms
    expect(level.supply).toBe(SUPPLY_MIN)
    expect(level.shortage).toBe(level.demand - level.supply >= SHORTAGE_GAP)
    expect(level.shortage).toBe(true)
  })

  test('priceFactors names the producer and the demand behind a price', () => {
    const threatened = rampant(base, 'greenvale-2')
    const f = priceFactors(threatened, content, 'greenvale-2', 'arms')
    expect(f.demand.map((d) => d.id)).toEqual(['under-threat'])
    expect(f.level).toEqual(marketLevels(threatened, content, 'greenvale-2').arms)
    expect(f.trades).toBe(1)
  })

  test('water is never priced', () => {
    expect(midPrice(base, content, 'greenvale-1', 'water')).toBe(0)
  })

  test('a focus rule follows the settlement type, and threatAtMost holds only while calm', () => {
    const type = base.world.settlements['greenvale-2'].type
    const camp = {
      ...content,
      settlementTypes: {
        ...content.settlementTypes,
        [type]: { ...content.settlementTypes[type], focus: 'attack' as const },
      },
      marketRules: {
        ...content.marketRules,
        muster: {
          id: 'muster',
          label: 'Mustering',
          when: { focus: 'attack' as const, threatAtMost: 0 },
          demand: { arms: 1 },
          source: 'claude' as const,
          file: 'test.json',
        },
      },
    }
    const calm = { ...base, world: { ...base.world, lands: {} } }
    expect(domainThreatLevel(calm.world, 'greenvale-2', calm.day)).toBe(0)
    expect(marketLevels(calm, camp, 'greenvale-2').arms.demand).toBe(1)
    expect(marketLevels(calm, content, 'greenvale-2').arms.demand).toBe(0)
    // Under threat the muster stops; the raids want arms instead.
    const threatened = rampant(calm, 'greenvale-2')
    expect(priceFactors(threatened, camp, 'greenvale-2', 'arms').demand.map((d) => d.id)).toEqual([
      'under-threat',
    ])
  })

  test("a service's inputs add demand where it is, named by the service", () => {
    const smiths = {
      ...content,
      serviceRoles: {
        ...content.serviceRoles,
        'jewelry-trader': { ...content.serviceRoles['jewelry-trader'], inputs: { gems: 2 } },
      },
    }
    const without = marketLevels(base, smiths, 'greenvale-2').gems.demand
    const s = withServices('greenvale-2', ['jewelry-trader'])
    expect(marketLevels(s, smiths, 'greenvale-2').gems.demand).toBe(without + 2)
    expect(priceFactors(s, smiths, 'greenvale-2', 'gems').demand).toContainEqual({
      id: 'jewelry-trader',
      label: 'Jewelry trader',
      level: 2,
    })
  })
})

describe('worked goods (producers with services and inputs)', () => {
  // Ashmoor's herb-gatherers make alchemicals at 2; a shop there turns them into arcana.
  const worked = {
    ...content,
    producers: {
      ...content.producers,
      apothecary: {
        id: 'apothecary',
        label: 'Apothecaries',
        when: { services: ['jewelry-trader'], supplyAtLeast: { alchemicals: 2 } },
        output: { arcana: 3 },
        source: 'claude' as const,
        file: 'test.json',
      },
    },
  }
  const both = withServices(
    'ashmoor-1',
    ['jewelry-trader'],
    withServices('greenvale-2', ['jewelry-trader'])
  )

  test('need the service and the input to hand', () => {
    expect(supplyOf(both, worked, 'ashmoor-1', 'arcana')).toMatchObject({
      from: 'ashmoor-1',
      level: 3,
    })
    // Greenvale has the service but the herbs are days away; Ashmoor without it makes none.
    expect(production(both, worked, 'greenvale-2').map((p) => p.good)).not.toContain('arcana')
    expect(production(base, worked, 'ashmoor-1').map((p) => p.good)).not.toContain('arcana')
  })
})

describe('drift', () => {
  test('stays within bounds and moves at most 2 × DRIFT / DRIFT_PERIOD_DAYS a day', () => {
    for (const good of ['food', 'gems', 'arms'] as const) {
      let last = drift(7, 'greenvale-1', good, 1)
      for (let day = 1; day <= 120; day++) {
        const d = drift(7, 'greenvale-1', good, day)
        expect(d).toBeGreaterThanOrEqual(1 - DRIFT)
        expect(d).toBeLessThanOrEqual(1 + DRIFT)
        expect(Math.abs(d - last)).toBeLessThanOrEqual((2 * DRIFT) / DRIFT_PERIOD_DAYS + 1e-12)
        last = d
      }
    }
  })

  test('differs between goods and towns', () => {
    const days = Array.from({ length: 30 }, (_, i) => i + 1)
    const a = days.map((d) => drift(7, 'greenvale-1', 'food', d))
    expect(days.map((d) => drift(7, 'greenvale-1', 'gems', d))).not.toEqual(a)
    expect(days.map((d) => drift(7, 'greenvale-2', 'food', d))).not.toEqual(a)
  })
})

describe('pressure and bulk trades', () => {
  test('halves after RECOVERY_HALF_LIFE_DAYS', () => {
    expect(pressure({ units: 8, day: 5 }, 5)).toBe(8)
    expect(pressure({ units: 8, day: 5 }, 5 + RECOVERY_HALF_LIFE_DAYS)).toBeCloseTo(4)
    expect(pressure({ units: -8, day: 5 }, 5 + 2 * RECOVERY_HALF_LIFE_DAYS)).toBeCloseTo(-2)
  })

  test('selling 10 at once fetches less than 10 first units, and no more than 5, a wait, and 5', () => {
    const s = shopping
    const ten = quote(s, content, 'greenvale-1', 'gems', 'sell', 10)!
    expect(ten.total).toBeLessThan(10 * ten.unitFirst)
    expect(ten.unitLast).toBeLessThan(ten.unitFirst)
    const five = quote(s, content, 'greenvale-1', 'gems', 'sell', 5)!
    const later: GameState = {
      ...s,
      day: s.day + RECOVERY_HALF_LIFE_DAYS,
      markets: recordTrade(s.markets, 'greenvale-1', 'gems', 5, s.day),
    }
    const again = quote(later, content, 'greenvale-1', 'gems', 'sell', 5)!
    // Compare at the same drift: scale the later sale back to today's level price.
    const scale =
      drift(s.world.seed, 'greenvale-1', 'gems', s.day) /
      drift(s.world.seed, 'greenvale-1', 'gems', later.day)
    expect(ten.total).toBeLessThanOrEqual(five.total + again.total * scale + 1)
  })

  test('selling lowers the price and buying raises it', () => {
    const sold = { ...shopping, markets: recordTrade({}, 'greenvale-1', 'gems', 6, shopping.day) }
    const bought = {
      ...shopping,
      markets: recordTrade({}, 'greenvale-1', 'gems', -6, shopping.day),
    }
    const mid = midPrice(shopping, content, 'greenvale-1', 'gems')
    expect(midPrice(sold, content, 'greenvale-1', 'gems')).toBeLessThan(mid)
    expect(midPrice(bought, content, 'greenvale-1', 'gems')).toBeGreaterThan(mid)
  })

  test('a trade folds the old pressure to today before adding', () => {
    const markets = recordTrade({}, 'greenvale-1', 'gems', 8, 1)
    expect(recordTrade(markets, 'greenvale-1', 'gems', -1, 1 + RECOVERY_HALF_LIFE_DAYS)).toEqual({
      'greenvale-1': { gems: { units: 3, day: 1 + RECOVERY_HALF_LIFE_DAYS } },
    })
  })
})

describe('shops', () => {
  test('buying is never cheaper than selling, and dearer for goods worth 10 gp or more', () => {
    for (const markets of [{}, recordTrade({}, 'greenvale-1', 'food', 40, base.day)]) {
      for (const p of [-30, 0, 30]) {
        const s = {
          ...shopping,
          markets: recordTrade(markets, 'greenvale-1', 'gems', p, shopping.day),
        }
        for (const good of GOODS) {
          for (const shop of shopsFor(s, content, 'greenvale-1', good)) {
            if (!shop.sells || !shop.buys) continue
            const buy = quote(s, content, 'greenvale-1', good, 'buy', 1, shop.service)!
            const sell = quote(s, content, 'greenvale-1', good, 'sell', 1, shop.service)!
            // Whole gold rounded up: a 1 gp good may buy and sell at the same price.
            if (buy.unitFirst >= 10) expect(buy.unitFirst).toBeGreaterThan(sell.unitFirst)
            else expect(buy.unitFirst).toBeGreaterThanOrEqual(sell.unitFirst)
            expect(buy.total).toBeGreaterThanOrEqual(sell.total)
          }
        }
      }
    }
  })

  test('buying some and selling them straight back never gains, and loses on dear goods', () => {
    for (const good of ['gems', 'food', 'luxuries'] as const) {
      for (const n of [1, 5, 20]) {
        const buy = quote(shopping, content, 'greenvale-1', good, 'buy', n)!
        const after = {
          ...shopping,
          markets: recordTrade({}, 'greenvale-1', good, -n, shopping.day),
        }
        const sell = quote(after, content, 'greenvale-1', good, 'sell', n, buy.shop.service)!
        if (good === 'food') expect(sell.total).toBeLessThanOrEqual(buy.total)
        else expect(sell.total).toBeLessThan(buy.total)
      }
    }
  })

  test('a good no present service trades is offered only if it is an essential', () => {
    const bare = withServices('greenvale-2', [])
    for (const good of GOODS) {
      const shops = shopsFor(bare, content, 'greenvale-2', good)
      const essential = GOOD_CATEGORY[good] === 'essentials' && good !== 'water'
      expect(shops.map((s) => s.service)).toEqual(essential ? [MARKET_STALL] : [])
    }
  })

  test('a buys-only service buys but never sells', () => {
    const shops = shopsFor(shopping, content, 'greenvale-1', 'relics')
    expect(shops).toMatchObject([{ service: 'jewelry-trader', sells: false, buys: true }])
    expect(quote(shopping, content, 'greenvale-1', 'relics', 'buy', 1)).toBeNull()
    expect(quote(shopping, content, 'greenvale-1', 'relics', 'sell', 1)).not.toBeNull()
  })

  test('the stalls have the worst spread; quality is 1–5 and seeded', () => {
    const shops = shopsFor(shopping, content, 'greenvale-1', 'food')
    expect(shops.at(-1)!.service).toBe(MARKET_STALL)
    for (const s of shops) {
      expect(s.quality).toBeGreaterThanOrEqual(1)
      expect(s.quality).toBeLessThanOrEqual(5)
      expect(s.spread).toBeGreaterThanOrEqual(SPREAD_MIN)
    }
    expect(shopsFor(shopping, content, 'greenvale-1', 'food')).toEqual(shops)
  })

  test('liked lowers the buy price and raises the sell price, in every shop of the town', () => {
    const id = 'greenvale-1'
    const withRep = (settlements: Record<string, number>) => ({
      ...shopping,
      reputation: { settlements },
    })
    // Whole-gold prices hide a 2-point spread on cheap goods: compare on gems.
    const unit = (s: GameState, side: 'buy' | 'sell', shop?: string) =>
      quote(s, content, id, 'gems', side, 1, shop)!.unitFirst
    const liked = withRep({ [id]: STANDING_POINTS.liked })
    const disliked = withRep({ [id]: STANDING_POINTS.disliked })
    // A good shop may already be at SPREAD_MIN, so liked can only match a stranger's price there.
    expect(unit(liked, 'buy')).toBeLessThanOrEqual(unit(shopping, 'buy'))
    expect(unit(liked, 'sell')).toBeGreaterThanOrEqual(unit(shopping, 'sell'))
    expect(unit(disliked, 'buy')).toBeGreaterThan(unit(shopping, 'buy'))
    expect(unit(disliked, 'sell')).toBeLessThan(unit(liked, 'sell'))
    // A shop kept by a notable person goes by the town's reputation like the stalls.
    const outfitter = {
      ...content.personRoles.innkeeper,
      id: 'outfitter',
      service: 'adventuring-supplies',
    }
    const gear = { ...content.goods.gear, price: 100 }
    const kept = {
      ...content,
      personRoles: { ...content.personRoles, outfitter },
      goods: { ...content.goods, gear },
    }
    const world = {
      ...shopping.world,
      people: {
        ...shopping.world.people,
        'p-ada': { settlement: id, role: 'outfitter', name: 'Ada', ancestry: 'human' },
      },
    }
    expect(shopKeeper({ world }, kept, id, 'adventuring-supplies')).toBe('p-ada')
    const friend = { ...withRep({ [id]: STANDING_POINTS.liked }), world }
    const at = (s: GameState, shop: string) => quote(s, kept, id, 'gear', 'buy', 1, shop)!.unitFirst
    const stranger = { ...shopping, world }
    expect(at(friend, 'adventuring-supplies')).toBeLessThan(at(stranger, 'adventuring-supplies'))
    expect(spreadModifier(friend, id)).toBeLessThan(0)
    const shop = (s: GameState, service: string) =>
      shopsFor(s, kept, id, 'gear').find((x) => x.service === service)!.spread
    const stall = (s: GameState) =>
      shopsFor(s, kept, id, 'food').find((x) => x.service === MARKET_STALL)!.spread
    // The same narrowing at the kept shop as at the stalls (where the floor allows).
    expect(
      shop(stranger, 'adventuring-supplies') - shop(friend, 'adventuring-supplies')
    ).toBeCloseTo(
      Math.min(-spreadModifier(friend, id), shop(stranger, 'adventuring-supplies') - SPREAD_MIN)
    )
    expect(stall(friend)).toBeLessThanOrEqual(stall(stranger))
  })

  test('quotes are whole gold: every unit rounded up, at least 1 gp', () => {
    const buy = quote(shopping, content, 'greenvale-1', 'food', 'buy', 3)!
    const sell = quote(shopping, content, 'greenvale-1', 'food', 'sell', 3)!
    expect(Number.isInteger(buy.total)).toBe(true)
    expect(Number.isInteger(sell.total)).toBe(true)
    for (const q of [buy, sell]) {
      expect(Number.isInteger(q.unitFirst) && q.unitFirst >= 1).toBe(true)
      expect(Number.isInteger(q.unitLast) && q.unitLast >= 1).toBe(true)
    }
    expect(quote(shopping, content, 'greenvale-1', 'food', 'buy', 0)).toBeNull()
  })
})

describe('quality effects', () => {
  test('a shop’s quality moves its spread against an average shop; an inn’s gives private rooms', () => {
    expect(qualityEffects(5, { trades: true, lodging: false })).toEqual([
      { effect: 'spread', perStep: SPREAD_PER_QUALITY, vsAverage: -2 * SPREAD_PER_QUALITY },
    ])
    expect(qualityEffects(3, { trades: true, lodging: false })[0]).toMatchObject({ vsAverage: 0 })
    expect(qualityEffects(PRIVATE_ROOM_MIN_QUALITY - 1, { trades: false, lodging: true })).toEqual([
      { effect: 'privateRooms', minQuality: PRIVATE_ROOM_MIN_QUALITY, offered: false },
    ])
    expect(
      qualityEffects(PRIVATE_ROOM_MIN_QUALITY, { trades: false, lodging: true })[0]
    ).toMatchObject({ offered: true })
    expect(qualityEffects(4, { trades: false, lodging: false })).toEqual([])
  })
})
