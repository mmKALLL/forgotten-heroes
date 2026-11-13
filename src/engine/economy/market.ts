import { sortedEntries, type Content } from '../../content/build'
import type { MarketRule } from '../../schema/economy'
import {
  GOODS,
  GOOD_CATEGORY,
  type Good,
  type PoiCategory,
  type SettlementFocus,
} from '../../schema/types'
import type { GameState, MarketTrade } from '../../schema/state'
import { createRng, nextFloat } from '../rng'
import { domainThreatLevel } from '../world/pois'
import { siteStatus } from '../world/sites'
import { standingSpreadModifier } from '../town/reputation'
import { goodDef } from './goods'
import { sellBonus } from '../gear/hooks'
import { supplyOf, type SupplySource } from './supply'
import {
  DRIFT,
  DRIFT_PERIOD_DAYS,
  MARKET_DEPTH,
  MARKET_LEVEL_MAX,
  PRICE_STEP,
  PRIVATE_ROOM_MIN_QUALITY,
  SELL_BONUS_CAP,
  RECOVERY_HALF_LIFE_DAYS,
  SHORTAGE_GAP,
  SPREAD_BY_SIZE,
  SPREAD_MIN,
  SPREAD_PER_QUALITY,
  STALL_QUALITY,
} from '../constants'

// Settlement markets (design §4, §5). Nothing ticks: supply follows the nearby producers
// (economy/supply.ts), demand the settlement, the market rules and its services' inputs, prices drift by a seeded wave, and the party's bulk trades sag the price and
// recover with a half-life. State only stores the party's net trades (GameState.markets).

/** The pseudo-shop every settlement has: market stalls selling and buying the essentials. */
export const MARKET_STALL = 'market-stall'

/** What prices read: with the party, its worn `sellBonus` hooks raise what selling pays. */
type Market = Pick<GameState, 'world' | 'day' | 'markets'> &
  Partial<Pick<GameState, 'reputation' | 'party'>>

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** A seeded float in [0, 1) for a key: the same every time it is asked. */
function seededFloat(seed: number, key: string): number {
  let h = 0x811c9dc5 ^ seed
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return nextFloat(createRng(h >>> 0))[0]
}

/** What the market rules look at in a settlement on a day. */
export type MarketPlace = {
  type: string
  /** What its type is built for: attack, defence or other (settlementTypes' focus). */
  focus: SettlementFocus
  sizeTier: number
  biome: string | null
  coastal: boolean
  threat: number
  wealth: number
  /** Categories of the sites in its domain that are there now (not lying empty). */
  nearPoi: PoiCategory[]
}

export function marketPlace(
  state: Pick<GameState, 'world'>,
  content: Content,
  settlementId: string,
  day: number
): MarketPlace | null {
  const info = own(state.world.settlements, settlementId)
  if (!info) return null
  const site = own(content.settlements, settlementId)
  const biome = site ? (own(content.regions, site.region)?.biome ?? null) : null
  const nearPoi = Object.entries(state.world.pois)
    .filter(([id, p]) => {
      if (p.domain !== settlementId) return false
      return siteStatus(state.world.seed, id, p, day)?.phase !== 'empty'
    })
    .map(([, p]) => p.category)
  return {
    type: info.type,
    focus: own(content.settlementTypes, info.type)?.focus ?? 'other',
    sizeTier: info.sizeTier,
    biome,
    coastal: site?.coastal ?? false,
    threat: domainThreatLevel(state.world, settlementId, day),
    wealth: info.wealth,
    nearPoi: [...new Set(nearPoi)],
  }
}

/** Whether every condition of a rule holds here. */
export function ruleApplies(rule: MarketRule, place: MarketPlace): boolean {
  const w = rule.when
  return (
    (w.types === undefined || w.types.includes(place.type)) &&
    (w.focus === undefined || w.focus === place.focus) &&
    (w.biomes === undefined || (place.biome !== null && w.biomes.some((b) => b === place.biome))) &&
    (w.coastal === undefined || w.coastal === place.coastal) &&
    (w.minSize === undefined || place.sizeTier >= w.minSize) &&
    (w.maxSize === undefined || place.sizeTier <= w.maxSize) &&
    (w.threatAtLeast === undefined || place.threat >= w.threatAtLeast) &&
    (w.threatAtMost === undefined || place.threat <= w.threatAtMost) &&
    (w.nearPoi === undefined || w.nearPoi.some((c) => place.nearPoi.includes(c))) &&
    (w.minWealth === undefined || place.wealth >= w.minWealth)
  )
}

export type MarketLevel = {
  /** From the best producer within reach (economy/supply.ts), SUPPLY_MIN..MARKET_LEVEL_MAX. */
  supply: number
  /** The sum of the market rules that apply here today, within ±MARKET_LEVEL_MAX. */
  demand: number
  /** Demand is at least SHORTAGE_GAP levels over supply. */
  shortage: boolean
}

/** A shortage: demand at least SHORTAGE_GAP levels over supply. */
export const isShortage = (level: Pick<MarketLevel, 'supply' | 'demand'>): boolean =>
  level.demand - level.supply >= SHORTAGE_GAP

/** A glut: supply at least SHORTAGE_GAP levels over demand (made here or close by, little wanted). */
export const isGlut = (level: Pick<MarketLevel, 'supply' | 'demand'>): boolean =>
  level.supply - level.demand >= SHORTAGE_GAP

/** A reason for demand here: a market rule that applies, or a service that uses the good. */
export type DemandSource = {
  /** The market rule's id, or the service's. */
  id: string
  label: string
  demand: Partial<Record<Good, number>>
}

/**
 * What adds demand in a settlement on a day (it is summed): the market rules that apply, then
 * each service there whose work uses goods (its role's `inputs`: a smith wants metal, a healer
 * healing; designer call 2026-11-13), labelled with the service's name.
 */
export function demandSources(
  state: Pick<GameState, 'world'>,
  content: Content,
  settlementId: string,
  day: number
): DemandSource[] {
  const place = marketPlace(state, content, settlementId, day)
  if (!place) return []
  const rules = sortedEntries(content.marketRules)
    .filter((rule) => ruleApplies(rule, place))
    .map((rule) => ({ id: rule.id, label: rule.label, demand: rule.demand }))
  const services = state.world.settlements[settlementId].services.flatMap((service) => {
    const inputs = own(content.serviceRoles, service)?.inputs ?? {}
    if (Object.keys(inputs).length === 0) return []
    const label = own(content.services, service)?.name ?? service
    return [{ id: service, label, demand: inputs }]
  })
  return [...rules, ...services]
}

/**
 * Supply and demand for every good in a settlement: supply from the nearby producers, demand the
 * sum of the market rules that apply and the inputs of the services there, within
 * ±MARKET_LEVEL_MAX.
 */
export function marketLevels(
  state: Pick<GameState, 'world' | 'day'>,
  content: Content,
  settlementId: string,
  day = state.day
): Record<Good, MarketLevel> {
  const sources = Object.hasOwn(state.world.settlements, settlementId)
    ? demandSources(state, content, settlementId, day)
    : []
  return Object.fromEntries(
    GOODS.map((g) => {
      const demand = clamp(
        sources.reduce((sum, r) => sum + (r.demand[g] ?? 0), 0),
        -MARKET_LEVEL_MAX,
        MARKET_LEVEL_MAX
      )
      // Free goods (water) are never made or traded: no supply level.
      const supply =
        Object.hasOwn(state.world.settlements, settlementId) && tradable(content, g)
          ? supplyOf(state, content, settlementId, g).level
          : 0
      return [g, { supply, demand, shortage: isShortage({ supply, demand }) }]
    })
  ) as Record<Good, MarketLevel>
}

/** Why a good costs what it does here (shown on hover, design §4): the few factors behind it. */
export type PriceFactors = {
  supply: SupplySource
  /** The market rules and services adding demand (or taking it away) here today. */
  demand: { id: string; label: string; level: number }[]
  level: MarketLevel
  /** The drift today, and what is left of the party's own trades here, as factors on the price. */
  drift: number
  trades: number
}

export function priceFactors(
  state: Market,
  content: Content,
  settlementId: string,
  good: Good,
  day = state.day
): PriceFactors {
  const demand = Object.hasOwn(state.world.settlements, settlementId)
    ? demandSources(state, content, settlementId, day)
        .filter((r) => (r.demand[good] ?? 0) !== 0)
        .map((r) => ({ id: r.id, label: r.label, level: r.demand[good]! }))
    : []
  const p = pressure(tradeOf(state, settlementId, good), day)
  const depth = marketDepth(content, sizeOf(state, settlementId), good)
  return {
    supply: supplyOf(state, content, settlementId, good),
    demand,
    level: marketLevels(state, content, settlementId, day)[good],
    drift: drift(state.world.seed, settlementId, good, day),
    trades: Math.exp(-p / depth),
  }
}

/**
 * A price's drift on a day, in [1 − DRIFT, 1 + DRIFT]: value noise, a seeded value every
 * DRIFT_PERIOD_DAYS and a straight line between, so it moves smoothly and never ticks.
 */
export function drift(seed: number, settlementId: string, good: Good, day: number): number {
  const t = (day - 1) / DRIFT_PERIOD_DAYS
  const knot = Math.floor(t)
  const at = (k: number) => seededFloat(seed, `drift/${settlementId}/${good}/${k}`) * 2 - 1
  const a = at(knot)
  const b = at(knot + 1)
  return 1 + DRIFT * (a + (b - a) * (t - knot))
}

/**
 * What is left of the party's net trades on a day: they recover with a half-life of
 * RECOVERY_HALF_LIFE_DAYS. Positive after selling (prices sag), negative after buying.
 */
export const pressure = (entry: MarketTrade | undefined, day: number): number =>
  entry ? entry.units * 0.5 ** (Math.max(0, day - entry.day) / RECOVERY_HALF_LIFE_DAYS) : 0

/** How many units of a good this market absorbs before bulk trades move the price much. */
export const marketDepth = (content: Content, sizeTier: number, good: Good): number =>
  (MARKET_DEPTH[clamp(sizeTier, 0, MARKET_DEPTH.length - 1)] ?? 1) *
  (goodDef(content, good)?.depth ?? 1)

/**
 * The price before the party's own trades: base × PRICE_STEP^(demand − supply) × drift, with
 * demand − supply within ±MARKET_LEVEL_MAX (so about ½× to 2× the base price before drift).
 */
function levelPrice(
  state: Market,
  content: Content,
  settlementId: string,
  good: Good,
  day: number
): number {
  const price = goodDef(content, good)?.price ?? 0
  if (price <= 0) return 0
  const { supply, demand } = marketLevels(state, content, settlementId, day)[good]
  const net = clamp(demand - supply, -MARKET_LEVEL_MAX, MARKET_LEVEL_MAX)
  return price * PRICE_STEP ** net * drift(state.world.seed, settlementId, good, day)
}

const sizeOf = (state: Pick<GameState, 'world'>, id: string) =>
  own(state.world.settlements, id)?.sizeTier ?? 0

const tradeOf = (state: Market, settlementId: string, good: Good): MarketTrade | undefined =>
  own(state.markets, settlementId)?.[good]

/**
 * The middle price of a good in a settlement on a day (0 for goods that aren't traded): the level
 * price, sagged or raised by what is left of the party's trades, exp(−pressure / depth).
 */
export function midPrice(
  state: Market,
  content: Content,
  settlementId: string,
  good: Good,
  day = state.day
): number {
  const p = pressure(tradeOf(state, settlementId, good), day)
  const depth = marketDepth(content, sizeOf(state, settlementId), good)
  return levelPrice(state, content, settlementId, good, day) * Math.exp(-p / depth)
}

/** A shop that trades a good: a service, or the market stalls. */
export type Shop = {
  service: string
  name: string
  /** 1 to 5. */
  quality: number
  /** The gap between what it asks and what it pays, as a share of the middle price. */
  spread: number
  /** It sells the good to the party. */
  sells: boolean
  /** It buys the good from the party. */
  buys: boolean
}

/** A service's quality in a settlement: 3, plus half the settlement's wealth, ±1 by seed; 1–5. */
export function serviceQuality(
  state: Pick<GameState, 'world'>,
  settlementId: string,
  service: string
): number {
  const wealth = own(state.world.settlements, settlementId)?.wealth ?? 0
  const roll = Math.floor(seededFloat(state.world.seed, `quality/${settlementId}/${service}`) * 3)
  return clamp(3 + Math.round(wealth / 2) + roll - 1, 1, 5)
}

/** The spread at a shop of this quality in a settlement of this size, at least SPREAD_MIN. */
export const shopSpread = (sizeTier: number, quality: number, modifier = 0): number =>
  Math.max(
    SPREAD_MIN,
    SPREAD_BY_SIZE[clamp(sizeTier, 0, SPREAD_BY_SIZE.length - 1)] -
      SPREAD_PER_QUALITY * (quality - 3) +
      modifier
  )

/**
 * What a service's quality does (designer request: explained on hover or focus of its pips). Only
 * the effects the engine has: a shop's spread, and an inn's private rooms.
 */
export type QualityEffect =
  | {
      effect: 'spread'
      /** How much each step narrows the spread (SPREAD_PER_QUALITY), as a share of the price. */
      perStep: number
      /** This quality's spread against an average (quality 3) shop's: negative is narrower. */
      vsAverage: number
    }
  | {
      effect: 'privateRooms'
      /** Inns of at least this quality have private rooms (PRIVATE_ROOM_MIN_QUALITY). */
      minQuality: number
      offered: boolean
    }

/** The effects of a service's quality: `trades` for a shop, `lodging` for an inn. */
export function qualityEffects(
  quality: number,
  { trades, lodging }: { trades: boolean; lodging: boolean }
): QualityEffect[] {
  const effects: QualityEffect[] = []
  if (trades) {
    const vsAverage = Math.round(SPREAD_PER_QUALITY * (3 - quality) * 1000) / 1000 || 0
    effects.push({ effect: 'spread', perStep: SPREAD_PER_QUALITY, vsAverage })
  }
  if (lodging) {
    effects.push({
      effect: 'privateRooms',
      minQuality: PRIVATE_ROOM_MIN_QUALITY,
      offered: quality >= PRIVATE_ROOM_MIN_QUALITY,
    })
  }
  return effects
}

type ShopState = Pick<GameState, 'world'> & Partial<Pick<GameState, 'reputation'>>

/**
 * How standing moves a shop's spread (design §8, Plan 4 B2): the settlement's standing, the same
 * for every shop there (designer call 2026-11-14: no keeper's own). 0 for a state without
 * reputation.
 */
export function spreadModifier(state: ShopState, settlementId: string): number {
  if (!state.reputation) return 0
  return standingSpreadModifier({ reputation: state.reputation }, settlementId)
}

/** True for goods a market trades at all: defined, and worth something (water is free). */
export const tradable = (content: Content, good: Good): boolean =>
  (goodDef(content, good)?.price ?? 0) > 0

/**
 * The shops in a settlement that trade a good, best (narrowest spread) first: present services
 * whose role trades it, or buys it only (those never sell it), and the market stalls for
 * essentials. Empty for goods that aren't traded.
 */
export function shopsFor(
  state: ShopState,
  content: Content,
  settlementId: string,
  good: Good
): Shop[] {
  const info = own(state.world.settlements, settlementId)
  if (!info || !tradable(content, good)) return []
  const shops: Shop[] = info.services.flatMap((service) => {
    const role = own(content.serviceRoles, service)
    if (!role) return []
    const sells = role.trades.includes(good)
    const buys = sells || role.buysOnly.includes(good)
    if (!buys) return []
    const quality = serviceQuality(state, settlementId, service)
    return [
      {
        service,
        name: own(content.services, service)?.name ?? service,
        quality,
        spread: shopSpread(info.sizeTier, quality, spreadModifier(state, settlementId)),
        sells,
        buys,
      },
    ]
  })
  if (GOOD_CATEGORY[good] === 'essentials') {
    shops.push({
      service: MARKET_STALL,
      name: 'Market stalls',
      quality: STALL_QUALITY,
      spread: shopSpread(info.sizeTier, STALL_QUALITY, spreadModifier(state, settlementId)),
      sells: true,
      buys: true,
    })
  }
  return shops.sort((a, b) => a.spread - b.spread || (a.service < b.service ? -1 : 1))
}

export type TradeSide = 'buy' | 'sell'

/** A price in whole gold: rounded up, and at least 1 gp (designer decision: no fractions). */
export const wholeGp = (gp: number): number => Math.max(1, Math.ceil(gp - 1e-9))

export type Quote = {
  /** gp for the whole trade: the sum of the whole-gold unit prices. */
  total: number
  /** The first and the last unit's price (whole gold), as the trade moves the market. */
  unitFirst: number
  unitLast: number
  shop: Shop
}

/**
 * What buying or selling `amount` units would cost or fetch at a shop (the best one by default),
 * unit by unit as the trade moves the price. Each unit is priced at the pressure halfway through
 * it, so buying and selling the same units back meet the same middle prices and the spread never
 * gains money. Every unit price is whole gold, rounded up (wholeGp). Null when no shop here trades the good that way, or the amount is below 1.
 * Selling pays the party's `sellBonus` share more (gear/hooks.ts), before rounding, but never more
 * than SELL_BONUS_CAP × the middle price, so buying and selling back still never gains.
 */
export function quote(
  state: Market,
  content: Content,
  settlementId: string,
  good: Good,
  side: TradeSide,
  amount: number,
  shop?: string
): Quote | null {
  const n = Math.floor(amount)
  if (n < 1) return null
  const shops = shopsFor(state, content, settlementId, good).filter((s) =>
    side === 'buy' ? s.sells : s.buys
  )
  const chosen = shop === undefined ? shops[0] : shops.find((s) => s.service === shop)
  if (!chosen) return null
  const level = levelPrice(state, content, settlementId, good, state.day)
  const depth = marketDepth(content, sizeOf(state, settlementId), good)
  const p0 = pressure(tradeOf(state, settlementId, good), state.day)
  const bonus = side === 'sell' && state.party ? sellBonus({ party: state.party }, good) : 0
  const factor =
    side === 'buy'
      ? 1 + chosen.spread / 2
      : Math.min(SELL_BONUS_CAP, (1 - chosen.spread / 2) * (1 + bonus))
  // Prices are whole gold (designer decision): each unit's price is rounded up, at least 1 gp.
  const unit = (i: number) => {
    const p = side === 'sell' ? p0 + i + 0.5 : p0 - i - 0.5
    return wholeGp(level * Math.exp(-p / depth) * factor)
  }
  let total = 0
  for (let i = 0; i < n; i++) total += unit(i)
  return { total, unitFirst: unit(0), unitLast: unit(n - 1), shop: chosen }
}

/**
 * The party's net trades after trading `units` (sales positive) today: the old pressure is
 * folded to today (rounded to whole units) before adding.
 */
export function recordTrade(
  markets: GameState['markets'],
  settlementId: string,
  good: Good,
  units: number,
  day: number
): GameState['markets'] {
  const here = own(markets, settlementId) ?? {}
  const folded = Math.round(pressure(here[good], day))
  return { ...markets, [settlementId]: { ...here, [good]: { units: folded + units, day } } }
}
