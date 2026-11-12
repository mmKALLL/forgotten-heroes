import type { Content } from '../../content/build'
import type { Character, ContractState, GameState } from '../../schema/state'
import { GOODS, type Good, type Pace } from '../../schema/types'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { encounterOptions } from '../encounters/preview'
import { currentOptions } from '../encounters/run'
import { load } from '../economy/capacity'
import { goodPrice, goodWeight } from '../economy/goods'
import { marketDepth, quote } from '../economy/market'
import { serviceWith } from '../town/animals'
import { nearestProducer } from '../economy/supply'
import { completeRefusal, escortPassengers, noticeBoard, type Offer } from '../town/contracts'
import { provisionPlan } from '../town/provision'
import { rumourOption } from '../town/rumours'
import { newsTargets } from '../town/services'
import { exploreOption } from '../world/explore'
import { siteStatus } from '../world/sites'
import { step, type Action } from '../state'
import { routeOptions, type RouteOption } from './preview'
import { poiReach, settlementReach } from './reach'
import { goodsOf, maxWaterskins, restOption } from './supplies'
import type { Pick } from './wander'
import { MAX_CONTRACTS, NEWS_PRICE, STALE_DAYS } from '../constants'

// The trader: a smoke policy for the economy report (design §10, Plan 4 I1). It plays like a
// sensible, cautious merchant-adventurer, using only what the player could see: the price book,
// the notice board and the previews. It is not a test of good play, only of the numbers.

/** Why the trader took an action, for the economy report's bookkeeping. */
export type TraderWhy =
  | 'provision'
  | 'cargo'
  | 'supply'
  | 'sell'
  | 'rest'
  | 'rumours'
  | 'contract'
  | 'animal'
  | 'travel'
  | 'encounter'
  | 'site'
  | 'explore'
  | 'drop'

export type TraderOptions = {
  /** Buy cargo from the price book (default true). Off: a contracts-only adventurer. */
  trade?: boolean
  /** Take notice-board contracts (default true). */
  contracts?: boolean
  /** Explore now and then, and visit known sites (default true). */
  explore?: boolean
  /** Stops before the next leg once this holds (e.g. a day reached). */
  until?: (state: GameState) => boolean
  /** Picks among equal choices (a road to scout, a site to visit) for leg `leg`. */
  pick?: Pick
  /** Called after every action, with why it was taken. */
  onStep?: (before: GameState, action: Action, after: GameState, why: TraderWhy) => void
}

/** Days the trader rests in a settlement, at most, while anyone needs it. */
const MAX_REST_DAYS = 6
/** Gold kept back from cargo for lodging and the next road's food, per member. */
const RESERVE_PER_MEMBER = 6
/** Below this much gold the trader sells whatever fetches half its base price. */
const BROKE_GOLD = 10
/** A trade is planned only if it is expected to earn this much, and this share of its cost. */
const MIN_TRADE_PROFIT = 4
const MIN_TRADE_MARGIN = 0.15
/** Away from its plan, cargo is sold only at this share of the best price known elsewhere. */
const SELL_HERE_SHARE = 0.9
/** Stale prices are trusted this much less. */
const STALE_TRUST = 0.85
/**
 * With this much gold, where an animals service sells one, the trader buys a mule if the cargo it
 * could carry would earn twice its price on the next run.
 */
const MULE_AT_GOLD = 40
const PACK_ANIMAL = 'mule'
/** Every this many legs (when healthy and free) the trader explores or visits a known site. */
const EXPLORE_EVERY = 5
/** The trader buys a courier's news of a contract's destination while it keeps this much gold. */
const NEWS_AT_GOLD = 60
/** Urgent work is only taken for runs of at most this many steady days. */
const URGENT_MAX_DAYS = 5
/** Contracts further than this many steady days away are left for bigger outfits. */
const MAX_HAUL_DAYS = 8
/** Sites are only visited this many days' walk from town. */
const MAX_SITE_DAYS = 2
/** Notice boards refresh weekly. */
const BOARD_WEEK = 7
/** A visited site is left alone this many days. */
const REVISIT_DAYS = 30

/** Exhausted or badly hurt, but alive (a member at MAX_EXHAUSTION is beyond resting). */
const needsRest = (c: Character) =>
  c.exhaustion < MAX_EXHAUSTION && (c.exhaustion > 0 || c.hp < c.maxHp / 2)
const healthy = (state: GameState) =>
  state.party.every((c) => c.exhaustion === 0 && c.hp >= c.maxHp * 0.75)

/** Cargo is everything but food and water, which the road eats. */
const isCargo = (good: Good) => good !== 'food' && good !== 'water'

/** Units of a good held for contracts (a courier's or freight's cargo, a procurement's goods). */
const reserved = (state: GameState, good: Good) =>
  state.contracts
    .filter(
      (c) =>
        (c.kind === 'courier' || c.kind === 'freight' || c.kind === 'procurement') &&
        c.good === good
    )
    .reduce((sum, c) => sum + c.amount, 0)

const sizeOf = (state: GameState, id: string) => state.world.settlements[id]?.sizeTier ?? 0

/** One unit's price n units into a trade that moves the market by a factor of e every `depth`. */
const unitAt = (first: number, depth: number, n: number, side: 'buy' | 'sell') =>
  first * Math.exp((side === 'buy' ? n : -n) / depth)

/** A cargo run the price book suggests: buy here, sell there. */
export type TradePlan = {
  good: Good
  to: string
  units: number
  cost: number
  /** Expected sales, at the price book's (possibly stale) price. */
  revenue: number
  days: number
}

/**
 * The best cargo run from here by expected profit a day, within `budget` gp and `room` kg, to any
 * settlement in the price book reachable by road or sea (or only to `dest`). Each unit bought
 * raises the price here and each sold lowers it there, by the markets' depths.
 */
export function bestTrade(
  state: GameState,
  content: Content,
  budget: number,
  room: number,
  dest: string | null = null
): TradePlan | null {
  const here = state.location
  if (here === null || budget <= 0) return null
  const reach = settlementReach(content, here)
  let best: (TradePlan & { perDay: number }) | null = null
  for (const good of GOODS) {
    if (!isCargo(good)) continue
    const buy = quote(state, content, here, good, 'buy', 1)
    if (!buy) continue
    const weight = goodWeight(content, good)
    const depth = marketDepth(content, sizeOf(state, here), good)
    for (const [to, entry] of Object.entries(state.priceBook)) {
      if (to === here || (dest !== null && to !== dest)) continue
      const sell0 = entry.prices[good]?.sell
      const way = reach.get(to)
      if (!sell0 || !way) continue
      const trust = state.day - entry.day > STALE_DAYS ? STALE_TRUST : 1
      const away = marketDepth(content, sizeOf(state, to), good)
      let units = 0
      let cost = 0
      let revenue = 0
      for (;;) {
        const price = unitAt(buy.unitFirst, depth, units, 'buy')
        const fetch = unitAt(sell0 * trust, away, units, 'sell')
        if (fetch <= price * (1 + MIN_TRADE_MARGIN / 2)) break
        if (cost + price > budget || (units + 1) * weight > room) break
        units++
        cost += price
        revenue += fetch
      }
      const profit = revenue - cost
      if (units === 0 || profit < MIN_TRADE_PROFIT || profit < cost * MIN_TRADE_MARGIN) continue
      const days = Math.max(1, way.days)
      const perDay = profit / days
      if (!best || perDay > best.perDay) {
        best = { good, to, units, cost: Math.ceil(cost), revenue, days, perDay }
      }
    }
  }
  if (!best) return null
  const { perDay: _, ...plan } = best
  return plan
}

/** The best price another reachable market is known to pay for a good. */
function bestKnownSell(state: GameState, content: Content, good: Good): number {
  const here = state.location
  if (here === null) return 0
  const reach = settlementReach(content, here)
  let best = 0
  for (const [id, entry] of Object.entries(state.priceBook)) {
    if (id === here || !reach.has(id)) continue
    const sell = entry.prices[good]?.sell ?? 0
    const trust = state.day - entry.day > STALE_DAYS ? STALE_TRUST : 1
    best = Math.max(best, sell * trust)
  }
  return best
}

/**
 * Where a contract sends the party next: its site until met, then where it is completed. A
 * procurement first goes to its source (the nearest producer) until the goods are carried.
 */
function contractTarget(state: GameState, content: Content, c: ContractState): string {
  if (c.poi && !c.met) return c.poi
  if (c.kind === 'procurement' && !c.met && c.good && (state.goods[c.good] ?? 0) < c.amount) {
    const source = nearestProducer(state, content, c.to, c.good)?.id
    // At the source and still short (nothing sold there): any other road will do for now.
    if (source && source !== state.location) return source
  }
  return c.to
}

/** Steady days from a settlement to a settlement or a site (by road, then its path). */
function daysTo(state: GameState, content: Content, from: string, target: string): number | null {
  if (from === target) return 0
  if (Object.hasOwn(state.world.pois, target)) {
    return poiReach(state, content, from, target)?.days ?? null
  }
  return settlementReach(content, from).get(target)?.days ?? null
}

/** The road out of here that leads soonest to `target`, if any. */
function roadToward(
  state: GameState,
  content: Content,
  roads: RouteOption[],
  target: string
): RouteOption | null {
  let best: { road: RouteOption; days: number } | null = null
  for (const road of roads) {
    const rest = daysTo(state, content, road.to, target)
    if (rest === null) continue
    // Sites are only a way to a settlement when they are the target.
    if (road.to !== target && Object.hasOwn(state.world.pois, road.to)) continue
    const days = road.days + rest
    if (!best || days < best.days) best = { road, days }
  }
  return best?.road ?? null
}

/**
 * The pace for a road: steady, or as fast as a contract's deadline needs (brisk, then forced
 * while everyone is fresh). Only steady, brisk and forced are used, so new paces don't matter.
 */
function paceFor(state: GameState, content: Content, road: RouteOption): Pace {
  const has = (p: Pace) => road.paces.some((o) => o.pace === p)
  let need: Pace = 'steady'
  for (const c of state.contracts) {
    if (c.met) continue
    const target = contractTarget(state, content, c)
    const rest = daysTo(state, content, road.to, target)
    if (rest === null) continue
    const left = c.deadline - state.day
    const days = road.days + rest
    if (days <= left) continue
    const pace: Pace = days / 1.25 <= left || !healthy(state) ? 'brisk' : 'forced'
    if (pace === 'forced' || need === 'steady') need = pace
  }
  if (!has(need)) return has('brisk') ? 'brisk' : (road.paces[0]?.pace ?? 'steady')
  return need
}

/**
 * A fixed "sensible merchant" policy for the economy report (design §10). In a settlement it
 * completes what contracts it can, rests while anyone is exhausted or badly hurt, sells cargo
 * where the price is as good as any it knows (or at its plan's market), listens for rumours, buys
 * a mule once it can afford one, and takes the notice-board contract worth the most a day that it
 * can meet at a steady or brisk pace (forced only for urgent work, and only fresh). Then it heads
 * for its contract's destination or site, or the best cargo run in its price book, or else every
 * EXPLORE_EVERY legs it explores or visits a known site, or scouts the nearest market it doesn't
 * know. It provisions for each road, buys cargo with what it can spare, keeping the load light,
 * and in encounters takes the likeliest check (or a fixed option when every check is a long shot).
 */
export function trader(
  start: GameState,
  content: Content,
  legs: number,
  options: TraderOptions = {}
): GameState {
  const o = {
    trade: true,
    contracts: true,
    explore: true,
    pick: ((leg, count) => leg % count) as Pick,
    ...options,
  }
  let state = start
  /** What each carried unit of cargo cost on average (loot and couriers' goods cost nothing). */
  const basis: Partial<Record<Good, number>> = {}
  const visitedAt: Record<string, number> = {}
  /** The day the trader last read each settlement's notice board. */
  const boardSeen: Record<string, number> = {}
  let plan: TradePlan | null = null

  const act = (action: Action, why: TraderWhy) => {
    const before = state
    state = step(state, action, content)
    for (const good of GOODS) {
      const was = before.goods[good] ?? 0
      const now = state.goods[good] ?? 0
      if (now <= 0) delete basis[good]
      else if (now > was) {
        const paid = why === 'cargo' || why === 'supply' ? before.gold - state.gold : 0
        basis[good] = ((basis[good] ?? 0) * was + paid) / now
      }
    }
    o.onStep?.(before, action, state, why)
  }

  const resolveEncounter = () => {
    for (let guard = 0; state.encounter && guard < 50; guard++) {
      const options = encounterOptions(state).filter((x) => x.available)
      const checks = options
        .filter((x) => x.check !== null)
        .sort((a, b) => b.check!.successChance - a.check!.successChance)
      // A fixed option that costs coin (a toll, a healer's fee) is the last resort.
      const raw = state.encounter ? currentOptions(state.encounter) : []
      const costs = (id: string) => {
        const o = raw.find((x) => x.id === id)
        return (
          o?.kind === 'fixed' && o.outcome.effects.some((e) => e.effect === 'gold' && e.amount < 0)
        )
      }
      const fixed = options.filter((x) => x.kind === 'fixed')
      const free = fixed.find((x) => !costs(x.id))
      const best = checks[0]
      const choice =
        best && best.check!.successChance >= 0.5
          ? best
          : (free ?? (best && best.check!.successChance >= 0.25 ? best : (fixed[0] ?? best)))
      if (!choice) {
        act({ type: 'closeEncounter' }, 'encounter')
        break
      }
      const stage = state.encounter
      act({ type: 'chooseOption', optionId: choice.id }, 'encounter')
      if (state.encounter === stage) act({ type: 'closeEncounter' }, 'encounter')
    }
    if (state.encounter) act({ type: 'closeEncounter' }, 'encounter')
  }

  const room = () => {
    const l = load(state, content)
    return Math.max(0, l.capacity - l.weight)
  }

  /** Sells cargo where it pays: at the plan's market, near the best known price, or when broke. */
  const sellCargo = () => {
    const here = state.location!
    for (const good of GOODS) {
      if (!isCargo(good)) continue
      const spare = (state.goods[good] ?? 0) - reserved(state, good)
      if (spare <= 0) continue
      const first = quote(state, content, here, good, 'sell', 1)
      if (!first) continue
      const depth = marketDepth(content, sizeOf(state, here), good)
      const cost = basis[good] ?? 0
      const atPlan = plan !== null && plan.to === here && plan.good === good
      const floor =
        state.gold < BROKE_GOLD
          ? goodPrice(content, good) * 0.5
          : atPlan
            ? cost
            : Math.max(
                cost * (1 + MIN_TRADE_MARGIN / 2),
                SELL_HERE_SHARE * bestKnownSell(state, content, good)
              )
      let n = 0
      while (n < spare && unitAt(first.unitFirst, depth, n, 'sell') >= floor) n++
      if (n > 0) act({ type: 'sellGoods', good, amount: n }, 'sell')
    }
    if (plan && plan.to === here) plan = null
  }

  /** The contract worth the most a day that the trader can meet and carry; null for none. */
  const pickOffer = (here: string): Offer | null => {
    if (state.contracts.length >= MAX_CONTRACTS) return null
    const going = state.contracts.find((c) => !c.met)
    let best: { offer: Offer; perDay: number } | null = null
    const roads = routeOptions(state, content).filter((r) => r.available)
    for (const offer of noticeBoard(state, content, here)) {
      if (!offer.available) continue
      if (
        going &&
        (offer.source ?? offer.poi ?? offer.to) !== contractTarget(state, content, going)
      )
        continue
      // A day in hand for the road's delays: met at a steady pace, or at a brisk one (forced
      // only when fresh) on a short urgent run.
      const brisk = Math.ceil(offer.steadyDays / 1.25) + 1
      const quick = brisk <= offer.days || (healthy(state) && offer.forcedDays + 1 <= offer.days)
      if (offer.steadyDays > offer.days && !(quick && offer.steadyDays <= URGENT_MAX_DAYS)) continue
      if (offer.kind === 'bounty' && !healthy(state)) continue
      // Long hauls through wild country outlast what two people can carry.
      if (offer.steadyDays > MAX_HAUL_DAYS) continue
      // Food for the road (the passengers' too): what is carried, and coin for the rest.
      const mouths = state.party.length + offer.passengers
      const short = mouths * (offer.steadyDays + 1) - goodsOf(state.goods, 'food')
      const ration = quote(state, content, here, 'food', 'buy', 1)?.unitFirst ?? 1
      if (short > 0 && state.gold < short * ration * 1.2) continue
      let cost = 0
      // The road's food weighs too.
      let kg = mouths * offer.steadyDays * goodWeight(content, 'food')
      if (offer.good) {
        kg += goodWeight(content, offer.good) * offer.amount
        if (offer.kind === 'procurement') {
          // Bought at the source: at its price-book price if known, else the base price.
          const known = offer.source ? state.priceBook[offer.source]?.prices[offer.good]?.buy : null
          cost = Math.ceil((known ?? goodPrice(content, offer.good)) * offer.amount)
          if (cost > state.gold - RESERVE_PER_MEMBER * state.party.length) continue
        }
      }
      if (kg > room()) continue
      // A road the party can't carry the food and water for is no road (a desert crossing).
      const goal = offer.source ?? offer.to
      const first = roads && !offer.poi ? roadToward(state, content, roads, goal) : null
      if (first) {
        const p = provisionPlan(state, content, { routeId: first.routeId, pace: 'steady' })
        if (p?.limit === 'weight') continue
      }
      // A site is there and back; a procurement's days are already the round trip.
      const trip = offer.poi ? offer.steadyDays * 2 : offer.steadyDays
      // Cargo the price book says would sell at the destination rides along.
      const spare = state.gold - cost - BROKE_GOLD - Math.max(0, short) * ration
      const cargo =
        o.trade && !offer.poi ? bestTrade(state, content, spare, room() - kg, goal) : null
      const perDay =
        (offer.pay - cost + (cargo ? cargo.revenue - cargo.cost : 0)) / Math.max(1, trip)
      if (perDay > 0 && (!best || perDay > best.perDay)) best = { offer, perDay }
    }
    return best?.offer ?? null
  }

  /** Buys what procurement contracts still need, where it is sold (never at the board's town). */
  const buySupplies = () => {
    const here = state.location!
    for (const c of state.contracts) {
      if (c.kind !== 'procurement' || !c.good || c.met || c.to === here) continue
      const missing = reserved(state, c.good) - (state.goods[c.good] ?? 0)
      if (missing > 0 && quote(state, content, here, c.good, 'buy', missing)) {
        act({ type: 'buyGoods', good: c.good, amount: missing }, 'supply')
      }
    }
  }

  /** A known, inhabited site with a path from here that hasn't been visited lately. */
  const siteToVisit = (roads: RouteOption[], leg: number): string | null => {
    // Near enough that the water lasts there and back (there is seldom a spring).
    const sites = roads
      .filter((r) => r.days <= MAX_SITE_DAYS)
      .map((r) => r.to)
      .filter((id) => Object.hasOwn(state.world.pois, id))
      .filter((id) => {
        const poi = state.world.pois[id]
        const status = siteStatus(state.world.seed, id, poi, state.day)
        return status?.phase !== 'empty' && state.day - (visitedAt[id] ?? -Infinity) > REVISIT_DAYS
      })
    return sites.length > 0 ? sites[o.pick(leg, sites.length)] : null
  }

  /** The nearest settlement by land whose notice board the trader hasn't read this week. */
  const freshBoard = (here: string): string | null => {
    const near = [...settlementReach(content, here)].sort((a, b) => a[1].days - b[1].days)
    const fresh = near.find(
      ([id]) =>
        Object.hasOwn(state.world.settlements, id) &&
        state.day - (boardSeen[id] ?? -Infinity) > BOARD_WEEK
    )
    return fresh?.[0] ?? null
  }

  /** The nearest reachable market the price book doesn't know, or knows only stale. */
  const scoutTarget = (here: string): string | null => {
    const near = [...settlementReach(content, here)].sort((a, b) => a[1].days - b[1].days)
    const unknown = near.find(([id]) => {
      const entry = state.priceBook[id]
      return (
        Object.hasOwn(state.world.settlements, id) && (!entry || state.day - entry.day > STALE_DAYS)
      )
    })
    return unknown?.[0] ?? null
  }

  /** Lightens an overloaded party: cheapest goods per kg first, never food or water. */
  const lighten = () => {
    for (
      let guard = 0;
      guard < GOODS.length && load(state, content).level === 'overloaded';
      guard++
    ) {
      const heavy = GOODS.filter((g) => isCargo(g) && (state.goods[g] ?? 0) > reserved(state, g))
        .map((g) => ({ g, perKg: goodPrice(content, g) / Math.max(0.01, goodWeight(content, g)) }))
        .sort((a, b) => a.perKg - b.perKg)[0]
      if (!heavy) break
      const l = load(state, content)
      const kg = l.weight - l.capacity
      const units = Math.min(
        (state.goods[heavy.g] ?? 0) - reserved(state, heavy.g),
        Math.ceil(kg / Math.max(0.01, goodWeight(content, heavy.g)))
      )
      act({ type: 'dropGoods', good: heavy.g, amount: units }, 'drop')
    }
  }

  /** One leg's business in a settlement, ending on the road (or resting when there is none). */
  const inTown = (leg: number) => {
    const here = state.location!
    boardSeen[here] = state.day
    for (const c of [...state.contracts]) {
      if (completeRefusal(state, content, c) === null) {
        act({ type: 'completeContract', id: c.id, reward: 'gold' }, 'contract')
      }
    }
    // Sell first: the coin may pay for the inn.
    sellCargo()
    // Spare waterskins are refilled on arrival and weigh a lot: sell them back when laden
    // (provisioning buys them again for a dry road).
    if (state.waterskins > 0 && load(state, content).ratio > 0.8) {
      act({ type: 'sellWaterskin', count: state.waterskins }, 'sell')
    }
    for (let day = 0; day < MAX_REST_DAYS && state.party.some(needsRest); day++) {
      const inn = restOption(state, content)
      const lodging = inn.lodging && state.gold - inn.lodgingCost >= RESERVE_PER_MEMBER
      const short = state.party.length - goodsOf(state.goods, 'food')
      if (short > 0 && !lodging) {
        // Water is free in town: pour some out if the food won't fit.
        const kg = short * goodWeight(content, 'food') - room()
        const water = goodsOf(state.goods, 'water')
        if (kg > 0 && water > 0) {
          const pour = Math.min(water, Math.ceil(kg / goodWeight(content, 'water')))
          act({ type: 'dropGoods', good: 'water', amount: pour }, 'drop')
        }
        act({ type: 'buyGoods', good: 'food', amount: short }, 'provision')
      }
      // Resting hungry only makes things worse.
      if (!lodging && goodsOf(state.goods, 'food') < state.party.length) break
      act({ type: 'rest', lodging }, 'rest')
    }
    const option = o.trade ? rumourOption(state, content) : null
    if (option && state.gold >= option.cost + BROKE_GOLD * 2) {
      act({ type: 'listenRumours' }, 'rumours')
    }
    // A mule, once the cargo it could carry would pay for it on the next run.
    const mule = content.animals[PACK_ANIMAL]
    if (
      o.trade &&
      mule &&
      state.gold >= MULE_AT_GOLD &&
      (state.animals[PACK_ANIMAL] ?? 0) === 0 &&
      serviceWith(state, content, 'animals')
    ) {
      const budget = state.gold - mule.price - RESERVE_PER_MEMBER * state.party.length
      const profit = (p: TradePlan | null) => (p ? p.revenue - p.cost : 0)
      const gain =
        profit(bestTrade(state, content, budget, room() + mule.capacity)) -
        profit(bestTrade(state, content, budget, room()))
      if (gain >= mule.price) act({ type: 'buyAnimal', animal: PACK_ANIMAL }, 'animal')
    }
    // Broke: spare waterskins and pack animals go back for coin.
    if (state.gold < BROKE_GOLD) {
      if (state.waterskins > 0) act({ type: 'sellWaterskin', count: state.waterskins }, 'sell')
      for (const id of Object.keys(state.animals)) {
        if ((state.animals[id] ?? 0) > 0 && serviceWith(state, content, 'animals')) {
          act({ type: 'sellAnimal', animal: id }, 'animal')
        }
      }
    }
    if (o.contracts) {
      for (let taken = 0; taken < MAX_CONTRACTS; taken++) {
        const offer = pickOffer(here)
        if (!offer) break
        act({ type: 'acceptContract', offerId: offer.id }, 'contract')
        if (!state.contracts.some((c) => c.id === offer.id)) break
      }
      buySupplies()
    }
    // A courier's news of a contract's destination, so cargo can ride along.
    const courier = o.trade ? serviceWith(state, content, 'news') : null
    for (const c of state.contracts) {
      const known = state.priceBook[c.to]
      if (!courier || c.met || c.to === here || state.gold < NEWS_PRICE + NEWS_AT_GOLD) continue
      if (known && state.day - known.day <= STALE_DAYS) continue
      if (!newsTargets(state, content).some((t) => t.id === c.to)) continue
      act({ type: 'useService', service: courier, action: 'news', settlement: c.to }, 'rumours')
    }
    lighten()

    const options = routeOptions(state, content)
    const roads = options.filter((r) => r.available)
    if (roads.length === 0) {
      const ship = options.find((r) => r.stowaway !== null)
      if (ship) act({ type: 'travel', routeId: ship.routeId, stowaway: true }, 'travel')
      else act({ type: 'rest', lodging: false }, 'rest')
      return
    }
    // Where to: a contract, the cargo run, a site now and then, or a market not yet known.
    const contract = [...state.contracts].sort((a, b) => a.deadline - b.deadline)[0]
    let target: string | null = contract ? contractTarget(state, content, contract) : null
    const spare = () =>
      Math.max(0, state.gold - RESERVE_PER_MEMBER * state.party.length - BROKE_GOLD)
    if (!target && o.trade) {
      plan = plan && plan.to !== here ? plan : bestTrade(state, content, spare(), room())
      target = plan?.to ?? null
    }
    if (!target && o.explore && leg % EXPLORE_EVERY === 0 && healthy(state)) {
      const site = siteToVisit(roads, leg)
      if (site) target = site
      else if ((exploreOption(state, content)?.findChance ?? 0) >= 0.3) {
        act({ type: 'explore' }, 'explore')
        resolveEncounter()
        return
      }
    }
    // Poor, or with nothing better to do: look for work at a board not read this week.
    if (!target && o.contracts && (state.gold < BROKE_GOLD * 3 || !o.trade)) {
      target = freshBoard(here)
    }
    if (!target && o.trade) target = scoutTarget(here)
    // Without a contract or a cargo run, passage money is better kept: walk where a road goes.
    const free = roads.filter((r) => r.fare === 0)
    const errand = contract !== undefined || plan !== null
    const toward = target ? roadToward(state, content, errand ? roads : free, target) : null
    let road =
      toward ??
      (free.length > 0 ? free[o.pick(leg, free.length)] : roads[o.pick(leg, roads.length)])
    // Provisioning buys no waterskins (designer decision): a road whose water the party can't
    // buy or carry the skins for is never taken, not even for a contract, since thirst kills. A
    // contract with no such road to it is given up.
    const planFor = (r: RouteOption) =>
      provisionPlan(state, content, { routeId: r.routeId, pace: paceFor(state, content, r) })
    const watered = (r: RouteOption) =>
      (planFor(r)?.waterskinsShort ?? 0) <= maxWaterskins(state, content).units
    const supplied = (r: RouteOption) => planFor(r)?.limit === null && watered(r)
    if (!watered(road) && contract !== undefined && target) {
      const other = roadToward(state, content, roads.filter(watered), target)
      if (!other) {
        act({ type: 'abandonContract', id: contract.id }, 'contract')
        return
      }
      road = other
    }
    // A road the purse or the packs can't supply is no road for a poor party: take the
    // shortest one that can be supplied instead, unless a contract insists.
    if (!watered(road) || (!supplied(road) && contract === undefined)) {
      const shortest = [...(free.length > 0 ? free : roads)].sort((a, b) => a.days - b.days)
      road = shortest.find(supplied) ?? shortest.find(watered) ?? road
    }
    const pace = paceFor(state, content, road)
    // Buy the waterskins the road needs first.
    const skins =
      provisionPlan(state, content, { routeId: road.routeId, pace })?.waterskinsShort ?? 0
    if (skins > 0) act({ type: 'buyWaterskin', count: skins }, 'provision')
    act({ type: 'provision', routeId: road.routeId, pace }, 'provision')
    const mouths = state.party.length + escortPassengers(state)
    // Provisioning fills waterskins first; if that leaves no room for the food, trade skins
    // for rations (foraging may find water, it seldom finds a meal).
    const paced = () =>
      routeOptions(state, content, false)
        .find((r) => r.routeId === road.routeId)
        ?.paces.find((p) => p.pace === pace)
    const hungry = () => paced()?.warnings.some((w) => w.code === 'foodRunsOut') ?? false
    if (hungry() && state.waterskins > 0 && load(state, content).level !== 'light') {
      act({ type: 'sellWaterskin', count: state.waterskins }, 'sell')
      const missing = (paced()?.food.needed ?? 0) - goodsOf(state.goods, 'food')
      if (missing > 0) act({ type: 'buyGoods', good: 'food', amount: missing }, 'provision')
    }
    // There is no market at a site: food for the way back too.
    if (Object.hasOwn(state.world.pois, road.to)) {
      act({ type: 'buyGoods', good: 'food', amount: mouths * (road.days + 1) }, 'provision')
    }
    // Cargo for wherever the road leads: the plan, or what pays at the contract's destination.
    if (o.trade) {
      const goal = plan?.to ?? target
      const cargo = goal ? bestTrade(state, content, spare(), room(), goal) : null
      if (cargo) {
        act({ type: 'buyGoods', good: cargo.good, amount: cargo.units }, 'cargo')
        if (!plan) plan = cargo
      }
    }
    const fresh = routeOptions(state, content).find((r) => r.routeId === road.routeId)
    if (!fresh?.available) {
      lighten()
      return
    }
    // No forced march once the water and the food make the party encumbered: brisk instead,
    // topped up for the longer road.
    let go = pace
    if (go === 'forced' && load(state, content).level !== 'light') {
      go = 'brisk'
      act({ type: 'provision', routeId: road.routeId, pace: go }, 'provision')
    }
    act({ type: 'travel', routeId: road.routeId, pace: go }, 'travel')
  }

  /** At a site: visit it once, then head back out toward the next settlement. */
  const atSite = (leg: number) => {
    const here = state.location!
    const poi = state.world.pois[here]
    if (
      poi?.discovered &&
      !state.visited &&
      siteStatus(state.world.seed, here, poi, state.day)?.phase !== 'empty'
    ) {
      visitedAt[here] = state.day
      act({ type: 'visitPoi' }, 'site')
      resolveEncounter()
    }
    lighten()
    const roads = routeOptions(state, content).filter((r) => r.available)
    if (roads.length === 0) {
      act({ type: 'rest', lodging: false }, 'rest')
      return
    }
    const contract = state.contracts.find((c) => c.met || c.poi !== here)
    const target = contract ? contractTarget(state, content, contract) : (plan?.to ?? null)
    const road =
      (target ? roadToward(state, content, roads, target) : null) ??
      roads[o.pick(leg, roads.length)]
    // No market here to restock: never a pace whose food or water runs out when another lasts,
    // and never a forced march on short supplies.
    const has = (p: Pace) => road.paces.some((o) => o.pace === p)
    const lasts = (p: Pace) =>
      road.paces
        .find((o) => o.pace === p)
        ?.warnings.every((w) => w.code !== 'waterRunsOut' && w.code !== 'foodRunsOut') ?? false
    const wanted = paceFor(state, content, road)
    const pace = lasts(wanted)
      ? wanted
      : ((['steady', 'brisk', 'stealthy'] as Pace[]).find(lasts) ??
        (['brisk', 'steady'] as Pace[]).find(has) ??
        wanted)
    act({ type: 'travel', routeId: road.routeId, pace }, 'travel')
  }

  for (let leg = 0; leg < legs && !o.until?.(state); leg++) {
    if (!state.party.some((c) => c.exhaustion < MAX_EXHAUSTION)) break
    if (state.encounter) resolveEncounter()
    if (!state.travel && state.location !== null) {
      if (Object.hasOwn(state.world.pois, state.location)) atSite(leg)
      else inTown(leg)
      if (state.encounter) resolveEncounter()
    }
    for (let guard = 0; state.travel && guard < 100; guard++) {
      if (state.encounter) {
        resolveEncounter()
        continue
      }
      const before = state.day
      act({ type: 'continueJourney' }, 'travel')
      if (state.travel && !state.encounter && state.day === before) {
        act({ type: 'rest' }, 'rest')
      }
    }
    if (state.encounter) resolveEncounter()
  }
  return state
}
