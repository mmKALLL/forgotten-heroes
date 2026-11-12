import type { Content } from '../../content/build'
import { GOODS, GOOD_CATEGORY, type Good, type GoodCategory } from '../../schema/types'
import type { GameState, KnownPrice, PriceBookEntry } from '../../schema/state'
import { formatGp } from '../format'
import { appendLog } from '../log'
import { tradeReputation } from '../town/reputation'
import { inSettlement, notHere } from '../travel/where'
import { settlementName } from '../world/geo'
import { load } from './capacity'
import { goodDef, goodName, goodWeight } from './goods'
import { marketLevels, quote, recordTrade, type Quote, type Shop } from './market'
import { OVERLOAD_RATIO, STALE_DAYS } from '../constants'

// Buying and selling the 15 goods, and the price book: what the party knows of other markets.

export type TradeAction =
  | { type: 'buyGoods'; good: Good; amount: number; shop?: string }
  | { type: 'sellGoods'; good: Good; amount: number; shop?: string }

/** A buy is never bigger than this, whatever is asked. */
const MAX_UNITS = 9999

const units = (state: Pick<GameState, 'goods'>, good: Good) => state.goods[good] ?? 0
const roundGp = (n: number) => Math.round(n * 100) / 100
const lower = (content: Content, good: Good) => goodName(content, good).toLowerCase()

/** What stops the party buying more of a good: gold, weight, or nothing (null). */
export type BuyLimit = 'gold' | 'weight' | null

/**
 * The most units of a good the party can buy here (up to `wanted`): as many as the gold allows
 * without becoming overloaded. 0 outside a settlement or where no one sells it.
 */
export function maxBuy(
  state: GameState,
  content: Content,
  good: Good,
  wanted = MAX_UNITS,
  shop?: string
): { units: number; limit: BuyLimit } {
  const here = state.location
  if (!inSettlement(state) || here === null) return { units: 0, limit: null }
  if (!quote(state, content, here, good, 'buy', 1, shop)) return { units: 0, limit: null }
  const laden = load(state, content)
  const weight = goodWeight(content, good)
  const room =
    weight > 0
      ? Math.max(0, Math.floor((laden.capacity * OVERLOAD_RATIO - laden.weight) / weight + 1e-9))
      : MAX_UNITS
  const cap = Math.min(Math.max(0, Math.floor(wanted)), room)
  // The total rises with each unit, so the most the gold allows is found by halving.
  const costs = (n: number) => quote(state, content, here, good, 'buy', n, shop)!.total
  let lo = 0
  let hi = cap
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (costs(mid) <= state.gold) lo = mid
    else hi = mid - 1
  }
  const limit: BuyLimit =
    lo >= Math.floor(wanted) ? null : lo === cap && room < Math.floor(wanted) ? 'weight' : 'gold'
  return { units: lo, limit }
}

const each = (q: Quote) =>
  q.unitFirst === q.unitLast || formatGp(q.unitFirst) === formatGp(q.unitLast)
    ? `${formatGp(q.unitFirst)} gp each`
    : `${formatGp(q.unitFirst)} → ${formatGp(q.unitLast)} gp each`

/**
 * Buys up to `amount` units of a good in this settlement, at the best shop selling it (or
 * `shop`): as many as the gold allows, and never so many that the party is overloaded.
 */
export function buyGoods(
  state: GameState,
  content: Content,
  good: Good,
  amount: number,
  shop?: string
): GameState {
  const here = state.location
  if (!inSettlement(state) || here === null) {
    return appendLog(state, notHere(state, 'Goods can only be bought in a settlement.'), 'bad')
  }
  const one = quote(state, content, here, good, 'buy', 1, shop)
  if (!one) return appendLog(state, `No one here sells ${lower(content, good)}.`, 'bad')
  const { units: n, limit } = maxBuy(state, content, good, amount, shop)
  if (n === 0) {
    return appendLog(
      state,
      limit === 'weight'
        ? `Too heavy: the party can't carry any more ${lower(content, good)}.`
        : `${goodName(content, good)} costs ${one.total} gp here.`,
      'bad'
    )
  }
  const q = quote(state, content, here, good, 'buy', n, shop)!
  const bought: GameState = {
    ...state,
    gold: state.gold - q.total,
    goods: { ...state.goods, [good]: units(state, good) + n },
    markets: recordTrade(state.markets, here, good, -n, state.day),
  }
  const why =
    limit === 'weight'
      ? ', all the party can carry'
      : limit === 'gold'
        ? ', all the gold allows'
        : ''
  // Trading earns standing here; the price book is written after, at any new tier's spreads.
  const logged = appendLog(
    bought,
    `Bought ${n} ${lower(content, good)} for ${q.total} gp (${each(q)})${why}.`,
    'info'
  )
  return observe(tradeReputation(logged, q.total), content, here)
}

/** Sells up to `amount` units (what is carried, at most) at the best shop buying it here. */
export function sellGoods(
  state: GameState,
  content: Content,
  good: Good,
  amount: number,
  shop?: string
): GameState {
  const here = state.location
  if (!inSettlement(state) || here === null) {
    return appendLog(state, notHere(state, 'Goods can only be sold in a settlement.'), 'bad')
  }
  const n = Math.min(Math.max(0, Math.floor(amount)), units(state, good))
  if (n === 0) return appendLog(state, `There is no ${lower(content, good)} to sell.`, 'bad')
  const q = quote(state, content, here, good, 'sell', n, shop)
  if (!q) return appendLog(state, `No one here buys ${lower(content, good)}.`, 'bad')
  const sold: GameState = {
    ...state,
    gold: state.gold + q.total,
    goods: { ...state.goods, [good]: units(state, good) - n },
    markets: recordTrade(state.markets, here, good, n, state.day),
  }
  const logged = appendLog(
    sold,
    `Sold ${n} ${lower(content, good)} for ${q.total} gp (${each(q)}).`,
    'info'
  )
  return observe(tradeReputation(logged, q.total), content, here)
}

/** One good's prices here today: what one unit costs and fetches at the best shops. */
function knownPrice(state: GameState, content: Content, id: string, good: Good): KnownPrice {
  const buy = quote(state, content, id, good, 'buy', 1)
  const sell = quote(state, content, id, good, 'sell', 1)
  return { buy: buy && roundGp(buy.unitFirst), sell: sell && roundGp(sell.unitFirst) }
}

/**
 * A whole market's prices on `state.day` (to see an earlier day, pass a state with that day):
 * every good some shop there trades. Rumours and couriers record these as heard.
 */
export function marketPrices(
  state: GameState,
  content: Content,
  settlementId: string
): PriceBookEntry['prices'] {
  const prices: PriceBookEntry['prices'] = {}
  for (const good of GOODS) {
    const known = knownPrice(state, content, settlementId, good)
    if (known.buy !== null || known.sell !== null) prices[good] = known
  }
  return prices
}

/**
 * Writes a whole market into the price book as seen today (heard: false). Called on arrival at a
 * settlement, at the start and after every trade. A market that trades nothing is not recorded.
 */
export function observe(state: GameState, content: Content, settlementId: string): GameState {
  if (!Object.hasOwn(state.world.settlements, settlementId)) return state
  const prices = marketPrices(state, content, settlementId)
  if (Object.keys(prices).length === 0) return state
  return {
    ...state,
    priceBook: { ...state.priceBook, [settlementId]: { day: state.day, heard: false, prices } },
  }
}

/** Days since a price-book entry's prices were true. */
export const priceAge = (entry: Pick<PriceBookEntry, 'day'>, day: number): number =>
  Math.max(0, day - entry.day)

/** True when a price-book entry is older than STALE_DAYS. */
export const isStale = (entry: Pick<PriceBookEntry, 'day'>, day: number): boolean =>
  priceAge(entry, day) > STALE_DAYS

/** A price known from another market, as the price book has it. */
export type KnownElsewhere = {
  settlement: string
  name: string
  price: number
  /** Days old. */
  age: number
  heard: boolean
  stale: boolean
}

/**
 * The best known prices for a good elsewhere: the highest a market pays (sell) and the lowest a
 * market asks (buy), from the price book, ignoring the settlement `except`.
 */
export function knownElsewhere(
  state: GameState,
  good: Good,
  except: string | null
): { sell: KnownElsewhere | null; buy: KnownElsewhere | null } {
  let sell: KnownElsewhere | null = null
  let buy: KnownElsewhere | null = null
  const entries = Object.entries(state.priceBook).sort(([a], [b]) => (a < b ? -1 : 1))
  for (const [id, entry] of entries) {
    if (id === except) continue
    const price = entry.prices[good]
    if (!price) continue
    const known = (p: number): KnownElsewhere => ({
      settlement: id,
      name: settlementName(state, id),
      price: p,
      age: priceAge(entry, state.day),
      heard: entry.heard,
      stale: isStale(entry, state.day),
    })
    if (price.sell !== null && (sell === null || price.sell > sell.price)) sell = known(price.sell)
    if (price.buy !== null && (buy === null || price.buy < buy.price)) buy = known(price.buy)
  }
  return { sell, buy }
}

/** One good in the market panel. */
export type MarketRow = {
  good: Good
  name: string
  unit: string
  uses: string
  category: GoodCategory
  /** kg per unit. */
  weight: number
  carried: number
  /** Buying or selling one unit here now, at the best shop; null when no shop does. */
  buy: Quote | null
  sell: Quote | null
  /** Supply and demand here, −3..3 (shown as arrows). */
  supply: number
  demand: number
  /** The most the party can buy now, and what stops it buying more. */
  maxBuy: number
  buyLimit: BuyLimit
  /** The best shop for this good (selling it, else buying it); null when none trades it. */
  shop: Shop | null
  /** The best prices known elsewhere, from the price book. */
  known: { sell: KnownElsewhere | null; buy: KnownElsewhere | null }
}

/** The market of the settlement the party is in, one row per defined good in design order. */
export function marketView(state: GameState, content: Content): MarketRow[] {
  const here = state.location
  if (!inSettlement(state) || here === null) return []
  const levels = marketLevels(state, content, here)
  return GOODS.filter((g) => goodDef(content, g) !== null).map((good) => {
    const def = goodDef(content, good)!
    const buy = quote(state, content, here, good, 'buy', 1)
    const sell = quote(state, content, here, good, 'sell', 1)
    const most = maxBuy(state, content, good)
    return {
      good,
      name: def.name,
      unit: def.unit,
      uses: def.uses,
      category: GOOD_CATEGORY[good],
      weight: def.weight,
      carried: units(state, good),
      buy,
      sell,
      supply: levels[good].supply,
      demand: levels[good].demand,
      maxBuy: most.units,
      buyLimit: buy ? most.limit : null,
      shop: buy?.shop ?? sell?.shop ?? null,
      known: knownElsewhere(state, good, here),
    }
  })
}

export function stepTrade(state: GameState, action: TradeAction, content: Content): GameState {
  switch (action.type) {
    case 'buyGoods':
      return buyGoods(state, content, action.good, action.amount, action.shop)
    case 'sellGoods':
      return sellGoods(state, content, action.good, action.amount, action.shop)
  }
}
