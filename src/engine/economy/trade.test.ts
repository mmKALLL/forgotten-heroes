import { describe, expect, test } from 'vitest'
import { SituationSchema } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { newGame, step, type Action } from '../state'
import { fixtureContent, makeEncounter, makeState } from '../test-fixtures'
import { load } from './capacity'
import { createRng, withRng } from '../rng'
import { ELSEWHERE_MAX_AGE_DAYS } from '../constants'
import { marketLevels, midPrice, quote } from './market'
import {
  elsewhereCell,
  heardPrices,
  marketPrices,
  marketTalk,
  marketView,
  maxBuy,
  priceAge,
  pricesOn,
} from './trade'

const content = fixtureContent()
const shops = ['inn-tavern', 'adventuring-supplies', 'jewelry-trader']
/** In greenvale-1 with a jeweller and a general store, and gold to spend. */
function inTown(overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location: 'greenvale-1', gold: 500, goods: { food: 4, water: 4 } })
  const settlements = { ...s.world.settlements }
  for (const id of Object.keys(settlements))
    settlements[id] = { ...settlements[id], services: shops }
  return { ...s, world: { ...s.world, settlements }, ...overrides }
}
const buy = (s: GameState, good: 'gems' | 'food' | 'gear', amount: number) =>
  step(s, { type: 'buyGoods', good, amount }, content)
const sell = (s: GameState, good: 'gems' | 'food', amount: number) =>
  step(s, { type: 'sellGoods', good, amount }, content)

test('nothing is bought or sold mid-encounter', () => {
  const busy = inTown({
    encounter: makeEncounter({ situation: SituationSchema.parse(content.situations.cliff) }),
    goods: { food: 4, water: 4, gems: 2 },
    waterskins: 2,
    animals: { mule: 1 },
  })
  const actions: Action[] = [
    { type: 'buyGoods', good: 'gems', amount: 1 },
    { type: 'sellGoods', good: 'gems', amount: 1 },
    { type: 'buyAnimal', animal: 'mule' },
    { type: 'sellAnimal', animal: 'mule' },
    { type: 'buyWaterskin', count: 1 },
    { type: 'sellWaterskin', count: 1 },
  ]
  for (const action of actions) {
    const after = step(busy, action, content)
    expect(after.log.at(-1)!.text, action.type).toBe('Finish the current encounter first.')
    expect({ ...after, log: busy.log }, action.type).toEqual(busy)
  }
})

describe('buying and selling', () => {
  test('costs and fetches exactly what the quote says', () => {
    const s = inTown()
    const q = quote(s, content, 'greenvale-1', 'gems', 'buy', 3)!
    const bought = buy(s, 'gems', 3)
    expect(bought.gold).toBe(s.gold - q.total)
    expect(bought.goods.gems).toBe(3)
    expect(bought.log.at(-1)!.text).toMatch(/^Bought 3 gems for \d+ gp \(/)
    const back = quote(bought, content, 'greenvale-1', 'gems', 'sell', 3)!
    const sold = sell(bought, 'gems', 3)
    expect(sold.gold).toBe(bought.gold + back.total)
    // Buying then selling the same amount at once loses money.
    expect(sold.gold).toBeLessThan(s.gold)
  })

  test('buys what the gold allows, and selling caps at what is carried', () => {
    const s = inTown({ gold: 150 })
    const bought = buy(s, 'gems', 10)
    expect(bought.goods.gems).toBe(maxBuy(s, content, 'gems', 10).units)
    expect(bought.goods.gems).toBeLessThan(10)
    expect(bought.gold).toBeGreaterThanOrEqual(0)
    expect(sell(bought, 'gems', 99).goods.gems).toBe(0)
  })

  test('buying past overload is refused; the preview agrees', () => {
    const s = inTown()
    const most = maxBuy(s, content, 'gear', 50)
    expect(most.limit).toBe('weight')
    const once = buy(s, 'gear', 50)
    expect(once.goods.gear).toBe(most.units)
    expect(load(once, content).level).not.toBe('overloaded')
    expect(load(buy(s, 'gear', most.units - 1), content).level).not.toBe('overloaded')
    const refused = buy(once, 'gear', 1)
    expect(refused.goods.gear).toBe(most.units)
    expect(refused.log.at(-1)!.text).toMatch(/^Too heavy/)
  })

  test('nothing is bought at a point of interest or on the road', () => {
    const s = inTown()
    const poi = Object.keys(s.world.pois)[0]
    const there = buy({ ...s, location: poi }, 'food', 1)
    expect(there.gold).toBe(s.gold)
    expect(there.log.at(-1)!.text).toMatch(/^Not here/)
  })
})

describe('the price book', () => {
  test('a new game knows the prices where it starts', () => {
    const s = newGame(1, content)
    expect(s.priceBook[s.location!]).toMatchObject({ day: 1, heard: false })
  })

  test('arriving writes an entry, a trade refreshes it, and its age grows with the days', () => {
    const s = inTown({ priceBook: {} })
    const out = step(s, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
    let next = out
    for (let i = 0; i < 20 && next.travel; i++) {
      next = next.encounter
        ? step(next, { type: 'closeEncounter' }, content)
        : step(next, { type: 'continueJourney' }, content)
    }
    expect(next.location).toBe('greenvale-2')
    const entry = next.priceBook['greenvale-2']
    expect(entry).toMatchObject({ day: next.day, heard: false })
    expect(entry.prices.food?.buy).toBeGreaterThan(entry.prices.food?.sell ?? Infinity)
    const later = { ...next, day: next.day + 5 }
    expect(priceAge(entry, later.day)).toBe(5)
    const traded = buy(later, 'food', 1)
    expect(traded.priceBook['greenvale-2'].day).toBe(later.day)
  })

  test('marketView rows list the best price known elsewhere', () => {
    const s = inTown()
    const book = {
      'greenvale-2': {
        day: 1,
        heard: false,
        prices: { gems: { buy: 120, sell: 90 } },
      },
      'ashmoor-1': { day: 1, heard: true, prices: { gems: { buy: 110, sell: 95 } } },
    }
    const later = { ...s, day: 20, priceBook: book }
    const view = marketView(later, content)
    const gems = view.find((r) => r.good === 'gems')!
    expect(gems.known.sell).toMatchObject({ settlement: 'ashmoor-1', price: 95, heard: true })
    expect(gems.known.buy).toMatchObject({ settlement: 'ashmoor-1', price: 110, stale: true })
    // The row's quote is what buying one would really cost.
    expect(gems.buy).toEqual(quote(later, content, 'greenvale-1', 'gems', 'buy', 1))
    expect(view.map((r) => r.category)).toContain('precious')
  })
})

describe('the Elsewhere column', () => {
  const book = (day: number) => ({
    'greenvale-2': { day, heard: false, prices: { gems: { buy: 120, sell: 90 } } },
    'ashmoor-1': { day: 5, heard: true, prices: { gems: { buy: 110, sell: 95 } } },
  })
  const gemsRow = (s: GameState) => marketView(s, content).find((r) => r.good === 'gems')!

  test('sell picks the highest price paid, buy the lowest asked, each against here', () => {
    const s = { ...inTown(), day: 20, priceBook: book(10) }
    const row = gemsRow(s)
    const sell = elsewhereCell(row, 'sell')!
    const buy = elsewhereCell(row, 'buy')!
    expect(sell).toMatchObject({ settlement: 'ashmoor-1', price: 95, age: 15 })
    expect(buy).toMatchObject({ settlement: 'ashmoor-1', price: 110 })
    // Higher there is better for selling; lower there is better for buying.
    const far = { day: 19, heard: false, prices: { gems: { buy: 1, sell: 9999 } } }
    const rich = gemsRow({ ...s, priceBook: { ...s.priceBook, 'farisle-1': far } })
    expect(elsewhereCell(rich, 'sell')).toMatchObject({ price: 9999, trend: 'up', better: true })
    expect(elsewhereCell(rich, 'buy')).toMatchObject({ price: 1, trend: 'down', better: true })
    expect(elsewhereCell(row, 'buy')!.better).toBe(elsewhereCell(row, 'buy')!.trend === 'down')
  })

  test('entries older than ELSEWHERE_MAX_AGE_DAYS are ignored', () => {
    const day = 5 + ELSEWHERE_MAX_AGE_DAYS + 1
    const s = { ...inTown(), day, priceBook: book(day - 3) }
    const row = gemsRow(s)
    // Ashmoor's better prices are too old: Greenvale's are the best still trusted.
    expect(elsewhereCell(row, 'sell')).toMatchObject({ settlement: 'greenvale-2', price: 90 })
    expect(elsewhereCell(row, 'buy')).toMatchObject({ settlement: 'greenvale-2', price: 120 })
    const ancient = { ...s, priceBook: book(5) }
    expect(elsewhereCell(gemsRow(ancient), 'sell')).toBeNull()
    expect(elsewhereCell(gemsRow(ancient), 'buy')).toBeNull()
  })
})

describe('dropping goods', () => {
  test('leaves goods behind anywhere, so an overloaded party can set out again', () => {
    const empty = makeState({ location: 'greenvale-1', goods: {} })
    const kg = Math.floor(load(empty, content).capacity * 1.5) + 5
    const loaded = { ...empty, goods: { food: kg } }
    expect(load(loaded, content).level).toBe('overloaded')
    const dropped = step(loaded, { type: 'dropGoods', good: 'food', amount: 10 }, content)
    expect(dropped.goods.food).toBe(kg - 10)
    expect(load(dropped, content).level).not.toBe('overloaded')
    expect(dropped.log.at(-1)!.text).toBe('Left behind 10 food (10 kg).')
    const none = step(dropped, { type: 'dropGoods', good: 'gems', amount: 1 }, content)
    expect(none.log.at(-1)!.text).toBe('There is no gems to leave.')
    expect(none.goods).toEqual(dropped.goods)
  })
})

describe('heard prices', () => {
  test('news of a day leaves out the party’s later trades there, and is a little off', () => {
    const s = inTown({ day: 20 })
    const sold = buy(s, 'gems', 20)
    expect(midPrice(sold, content, 'greenvale-1', 'gems')).not.toBe(
      midPrice(s, content, 'greenvale-1', 'gems')
    )
    // Today's trades are after day 19's news: it is as if they never happened.
    expect(pricesOn(sold, content, 'greenvale-1', 19)).toEqual(
      marketPrices({ ...s, day: 19 }, content, 'greenvale-1')
    )
    const truth = pricesOn(sold, content, 'greenvale-1', 19)
    const [heard] = withRng(createRng(3), (d) => heardPrices(d, sold, content, 'greenvale-1', 19))
    expect(Object.keys(heard)).toEqual(Object.keys(truth))
    for (const [good, p] of Object.entries(truth)) {
      const told = heard[good as keyof typeof heard]!
      if (p.buy !== null) expect(told.buy! / p.buy, good).toBeLessThanOrEqual(1.1 + 1 / p.buy)
      if (p.buy !== null) expect(told.buy! / p.buy, good).toBeGreaterThanOrEqual(0.9)
    }
  })
})

describe('marketTalk', () => {
  test('names a shortage and a glut, matching the market levels', () => {
    const s = inTown()
    // Without producers, the marsh's demand for stone meets no supply: a shortage.
    const bare = { ...content, producers: {} }
    expect(marketLevels(s, bare, 'ashmoor-1').stone.shortage).toBe(true)
    expect(marketTalk(s, bare, 'ashmoor-1')).toMatch(/^Talk has it that .+ is short of .*stone/)
    // Far Isle's woods make timber at 3; with no demand rules nobody wants it: a glut.
    const idle = { ...content, marketRules: {} }
    expect(marketTalk(s, idle, 'farisle-1')).toMatch(/awash with timber/)
  })
})
