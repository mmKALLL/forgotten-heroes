import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { newGame, step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { load } from './capacity'
import { quote } from './market'
import { marketView, maxBuy, priceAge } from './trade'

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
