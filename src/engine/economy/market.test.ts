import { describe, expect, test } from 'vitest'
import { GOODS, GOOD_CATEGORY } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { fixtureContent, makeState } from '../test-fixtures'
import {
  MARKET_STALL,
  drift,
  marketLevels,
  midPrice,
  pressure,
  quote,
  recordTrade,
  shopsFor,
} from './market'
import {
  DRIFT,
  DRIFT_PERIOD_DAYS,
  PRICE_STEP,
  RECOVERY_HALF_LIFE_DAYS,
  SPREAD_MIN,
  STANDING_POINTS,
} from '../constants'
import { shopKeeper } from '../town/reputation'

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

  test('the biome rule applies only in its land', () => {
    expect(marketLevels(base, content, 'ashmoor-1').alchemicals.supply).toBe(1)
    expect(marketLevels(base, content, 'greenvale-2').alchemicals.supply).toBe(0)
  })

  test('water is never priced', () => {
    expect(midPrice(base, content, 'greenvale-1', 'water')).toBe(0)
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
  test('buying is dearer than selling for every good and shop, whatever the pressure', () => {
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
            expect(buy.unitFirst).toBeGreaterThan(sell.unitFirst)
            expect(buy.total).toBeGreaterThanOrEqual(sell.total)
          }
        }
      }
    }
  })

  test('buying some and selling them straight back always loses money', () => {
    for (const good of ['gems', 'food', 'luxuries'] as const) {
      for (const n of [1, 5, 20]) {
        const buy = quote(shopping, content, 'greenvale-1', good, 'buy', n)!
        const after = {
          ...shopping,
          markets: recordTrade({}, 'greenvale-1', good, -n, shopping.day),
        }
        const sell = quote(after, content, 'greenvale-1', good, 'sell', n, buy.shop.service)!
        expect(sell.total).toBeLessThan(buy.total)
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

  test('liked lowers the buy price and raises the sell price; a liking keeper counts', () => {
    const id = 'greenvale-1'
    const withRep = (settlements: Record<string, number>, people: Record<string, number> = {}) => ({
      ...shopping,
      reputation: { settlements, people },
    })
    const unit = (s: GameState, side: 'buy' | 'sell', shop?: string) =>
      quote(s, content, id, 'food', side, 1, shop)!.unitFirst
    const liked = withRep({ [id]: STANDING_POINTS.liked })
    const disliked = withRep({ [id]: STANDING_POINTS.disliked })
    expect(unit(liked, 'buy')).toBeLessThan(unit(shopping, 'buy'))
    expect(unit(liked, 'sell')).toBeGreaterThan(unit(shopping, 'sell'))
    expect(unit(disliked, 'buy')).toBeGreaterThan(unit(shopping, 'buy'))
    // An outfitter keeping the supplies shop and liking the party narrows that shop's spread only.
    const outfitter = {
      ...content.personRoles.innkeeper,
      id: 'outfitter',
      service: 'adventuring-supplies',
    }
    const kept = { ...content, personRoles: { ...content.personRoles, outfitter } }
    const world = {
      ...shopping.world,
      people: {
        ...shopping.world.people,
        'p-ada': { settlement: id, role: 'outfitter', name: 'Ada', ancestry: 'human' },
      },
    }
    expect(shopKeeper({ world }, kept, id, 'adventuring-supplies')).toBe('p-ada')
    const friend = { ...withRep({}, { 'p-ada': STANDING_POINTS.liked }), world }
    const at = (s: GameState, shop: string) => quote(s, kept, id, 'food', 'buy', 1, shop)!.unitFirst
    const stranger = { ...shopping, world }
    expect(at(friend, 'adventuring-supplies')).toBeLessThan(at(stranger, 'adventuring-supplies'))
    expect(at(friend, MARKET_STALL)).toBe(at(stranger, MARKET_STALL))
  })

  test('quotes round buys up and sales down to whole gold', () => {
    const buy = quote(shopping, content, 'greenvale-1', 'food', 'buy', 3)!
    const sell = quote(shopping, content, 'greenvale-1', 'food', 'sell', 3)!
    expect(Number.isInteger(buy.total)).toBe(true)
    expect(Number.isInteger(sell.total)).toBe(true)
    expect(quote(shopping, content, 'greenvale-1', 'food', 'buy', 0)).toBeNull()
  })
})
