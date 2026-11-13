import type { Content } from '../../content/build'
import type { Character, ContractState, GameState } from '../../schema/state'
import { GOODS, type Good, type Pace } from '../../schema/types'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { challengePreview, encounterOptions } from '../encounters/preview'
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
import { gatherOptions, type GatherOption } from '../world/gather'
import { recruitOffers } from '../town/recruits'
import { roundOption } from '../town/services'
import { delvePreview } from '../world/delve'
import { dungeonOf } from '../world/dungeons'
import { livingMembers } from '../town/camaraderie'
import { accessorySales } from '../gear/accessories'
import { statModifier } from '../rules/character'
import { step, type Action } from '../state'
import { actOpen, crisisDecided, crisisStatus } from '../crisis/status'
import { crisisSites } from '../crisis/sites'
import { runOver } from '../crisis/ending'
import { siteLand } from '../crisis/text'
import { routeOptions, type RouteOption } from './preview'
import { poiReach, settlementReach } from './reach'
import {
  goodsOf,
  maxWaterskins,
  partyWaterCapacity,
  restOption,
  waterCapacity,
  waterNeed,
} from './supplies'
import type { Pick } from './wander'
import {
  ENCUMBERED_SPEED,
  MAX_CONTRACTS,
  NEWS_PRICE,
  STALE_DAYS,
  WATERSKIN_PRICE,
  WATERSKIN_WATER,
} from '../constants'

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
  /** A day's gathering, and selling what it brought home. */
  | 'gather'
  | 'hire'
  /** Putting on or selling an accessory. */
  | 'gear'
  /** The crusader resting until fit for a Crisis site. */
  | 'crusade'
  /** Keeping the party together: a round at the inn, a night in a private room (Plan 6 B). */
  | 'upkeep'
  /** Pressing on or withdrawing in a dungeon (Plan 6 B). */
  | 'delve'

export type TraderOptions = {
  /** Buy cargo from the price book (default true). Off: a contracts-only adventurer. */
  trade?: boolean
  /** Take notice-board contracts (default true). */
  contracts?: boolean
  /** Explore now and then, and visit known sites (default true). */
  explore?: boolean
  /** Gather local goods when poor and without work (default true). */
  gather?: boolean
  /** Hire recruits when the purse can carry their sign-on fee and food (default true)... */
  hire?: boolean
  /** ...up to this many living members (default 4). */
  hireUpTo?: number
  /** Wear accessories found or bought, and sell the spares (default true). */
  gear?: boolean
  /** Chase the Crisis (default false): the crusader policy (see `crusader`). */
  crusade?: boolean
  /**
   * Keep camaraderie up (default true): stand a round on arriving at an inn while it is below
   * ROUND_BELOW, and take a private room for a night while it is below PRIVATE_BELOW.
   */
  upkeep?: boolean
  /**
   * Delve authored dungeons near the party's level (default: with `crusade`): go to a known one
   * whose suggested level is at most the party's best + DELVE_LEVEL_LEAD, and press on room by
   * room while the party is fit and the next room's risk is bearable.
   */
  delve?: boolean
  /** Stops before the next leg once this holds (e.g. a day reached). */
  until?: (state: GameState) => boolean
  /** Picks among equal choices (a road to scout, a site to visit) for leg `leg`. */
  pick?: Pick
  /** Called after every action, with why it was taken. */
  onStep?: (before: GameState, action: Action, after: GameState, why: TraderWhy) => void
}

/**
 * Without work, the trader gathers while it has less gold than this (or two days of food for the
 * party): about what a first courier job's road food needs, so it doesn't set out broke.
 */
const GATHER_BELOW = 20
/** ...and stops once the land has been picked over this much (its yield halved). */
const GATHER_DEPLETED = 0.5
/** Food kept from a gathering day for the road, in days for the party; the rest is sold. */
const GATHER_FOOD_DAYS = 6
/** A recruit is hired only with the sign-on fee plus this many days of the recruit's food in hand. */
const HIRE_RESERVE_DAYS = 30
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
/** The crusader rests at most this many days in a row to be fit for a Crisis site. */
const MAX_FIT_REST_DAYS = 10
/**
 * The crusader goes after the Crisis only with this much gold per living member (food
 * for the chase) and no contract in hand; poorer, it works as the trader does (contracts, cargo,
 * gathering) until it has it.
 */
const CRUSADE_GOLD_PER_MEMBER = 15
/** Days the crusader expects to spend at a Crisis site: food (and water) carried for them. */
const CRUSADE_SITE_FOOD_DAYS = 1
/**
 * After this many legs in a row with no day passing (stuck: too laden to set out, too poor to
 * lighten, or too poor to provision a desert road), the policy rests a day instead of spinning.
 * (Plan 5b I1 added it for the crusader; Plan 6 found a trader stuck the same way.)
 */
const MAX_STALLED_LEGS = 3
/** Below this camaraderie the policy stands the party a round on arriving at an inn. */
const ROUND_BELOW = 85
/** Below this it also takes a private room for a night, where an inn has one. */
const PRIVATE_BELOW = 65
/** The delver goes to dungeons suggested for at most its best level + this. */
const DELVE_LEVEL_LEAD = 1
/** ...within this many steady days of the settlement it is in... */
const MAX_DELVE_DAYS = 4
/** ...and leaves a dungeon it withdrew from or was driven out of alone this many days. */
const DELVE_AGAIN_DAYS = 14
/** Between rooms it presses on while everyone standing has this share of their HP... */
const DELVE_FIT_HP = 0.35
/** ...and the next room's chance to drive the party out is at most this. */
const DELVE_MAX_RISK = 0.7
/** With upkeep in mind, a check that flees (tagged `retreat`) is worth this much less than its odds. */
const FLEE_PENALTY = 0.2

/** Exhausted or badly hurt, but alive (a member at MAX_EXHAUSTION is beyond resting). */
const needsRest = (c: Character) =>
  c.exhaustion < MAX_EXHAUSTION && (c.exhaustion > 0 || c.hp < c.maxHp / 2)
const healthy = (state: GameState) =>
  state.party.every((c) => c.exhaustion === 0 && c.hp >= c.maxHp * 0.75)

/** What the crusader is after: a known Crisis site, or else the land of the current act. */
export type CrusadeGoal = { poi: string; land: null } | { poi: null; land: string }

/**
 * The crusader's goal (Plans 5b I1 and 6), from what the player knows: while an act is open, the
 * site it is played at (its lead, then its key site) once found, else that site's land once a clue
 * names it. Null with no Crisis, while no act is open, once it is decided, or with nothing known
 * to go after.
 */
export function crusadeGoal(state: GameState, content: Content): CrusadeGoal | null {
  const crisis = state.crisis
  if (!crisis || crisisDecided(crisis, state.day)) return null
  const found = (id: string) =>
    Object.hasOwn(state.world.pois, id) && state.world.pois[id].discovered
  const site = crisisStatus(crisis, state.day).target
  if (site === null) return null
  if (found(site)) return { poi: site, land: null }
  const clues = crisis.clues[crisisStatus(crisis, state.day).act!] ?? 0
  const land = clues >= 1 ? siteLand(state, content, site) : undefined
  return land ? { poi: null, land } : null
}

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
    gather: true,
    hire: true,
    hireUpTo: 4,
    gear: true,
    upkeep: true,
    pick: ((leg, count) => leg % count) as Pick,
    ...options,
  }
  const delves = o.delve ?? o.crusade ?? false
  let state = start
  /** What each carried unit of cargo cost on average (loot and couriers' goods cost nothing). */
  const basis: Partial<Record<Good, number>> = {}
  const visitedAt: Record<string, number> = {}
  /** The day the trader last read each settlement's notice board. */
  const boardSeen: Record<string, number> = {}
  let plan: TradePlan | null = null
  /** The crusader's searches for the current act: the settlements whose domain it explored. */
  let searched = { act: -1, at: new Set<string>() }
  /** Days rested in a row to be fit for a Crisis site. */
  let fitRest = 0

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

  /**
   * A fixed option that ends the encounter without doing anything for the Crisis: leaving. The
   * crusader never takes one at a Crisis site while it has another choice.
   */
  const retreats = (option: { id: string; kind: string }): boolean => {
    if (option.kind !== 'fixed' || !state.encounter) return false
    const raw = currentOptions(state.encounter).find((x) => x.id === option.id)
    if (raw?.kind !== 'fixed' || raw.outcome.goto) return false
    return !raw.outcome.effects.some((e) =>
      ['learnPlan', 'revealKeySite', 'crisisClue', 'thwartAct'].includes(e.effect)
    )
  }

  const resolveEncounter = () => {
    for (let guard = 0; state.encounter && guard < 50 && !runOver(state); guard++) {
      const all = encounterOptions(state).filter((x) => x.available)
      const poi = state.encounter.poi
      // At a Crisis site, and in a dungeon room once in (between rooms it may withdraw), the
      // crusader doesn't back out while it has another choice.
      const pressOn =
        o.crusade &&
        poi != null &&
        (crisisSites(state.crisis).includes(poi) || (delves && state.delve?.inRoom === true))
      const onward = pressOn ? all.filter((x) => !retreats(x)) : all
      const options = onward.length > 0 ? onward : all
      const raw = state.encounter ? currentOptions(state.encounter) : []
      // Fleeing costs camaraderie whatever the roll (Plan 6): with upkeep in mind, a flight is
      // worth FLEE_PENALTY less than its odds.
      const flees = (id: string) =>
        o.upkeep && (raw.find((x) => x.id === id)?.tags?.includes('retreat') ?? false)
      const worth = (x: (typeof options)[number]) =>
        x.check!.successChance - (flees(x.id) ? FLEE_PENALTY : 0)
      const checks = options.filter((x) => x.check !== null).sort((a, b) => worth(b) - worth(a))
      // A fixed option that costs coin (a toll, a healer's fee) is the last resort.
      const costs = (id: string) => {
        const o = raw.find((x) => x.id === id)
        return (
          o?.kind === 'fixed' && o.outcome.effects.some((e) => e.effect === 'gold' && e.amount < 0)
        )
      }
      const fixed = options.filter((x) => x.kind === 'fixed')
      const best = checks[0]
      const free =
        fixed.find((x) => !costs(x.id) && !flees(x.id)) ??
        (best && worth(best) >= 0.4 ? undefined : fixed.find((x) => !costs(x.id)))
      // In a skill challenge (Plan 6 S), the round with the best chance of winning it.
      const round = challengePreview(state)?.best
      const inRound = round ? options.find((x) => x.id === round) : undefined
      const choice =
        inRound ??
        (best && best.check!.successChance >= 0.5
          ? best
          : (free ??
            (best && (pressOn || best.check!.successChance >= 0.25) ? best : (fixed[0] ?? best))))
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
    if (o.crusade && crusadeStep(here).target !== null) return null
    // A dungeon at the party's level waits: contracts after it.
    if (dungeonTarget(here) !== null) return null
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

  /** What a gathering day is expected to fetch here: each tier's units at the local sell price. */
  const gatherValue = (option: GatherOption): number => {
    const here = state.location!
    return option.outcomes.reduce((sum, out) => {
      if (out.units <= 0) return sum
      const sold = quote(state, content, here, option.good, 'sell', out.units)?.total
      return sum + out.chance * (sold ?? out.units * goodPrice(content, option.good) * 0.5)
    }, 0)
  }

  /**
   * Poor and without work: a day gathering the local good worth the most here, then selling it
   * (food is kept for the road). Not once the land is picked over to half its yield. True when
   * the day was spent.
   */
  const gatherWhenPoor = (): boolean => {
    if (!o.gather || state.contracts.length > 0) return false
    const ration = quote(state, content, state.location!, 'food', 'buy', 1)?.unitFirst ?? 1
    const reserve = Math.max(GATHER_BELOW, 2 * livingMembers(state).length * ration)
    if (state.gold >= reserve) return false
    const best = gatherOptions(state, content)
      .filter((x) => x.available && x.depleted < GATHER_DEPLETED)
      .map((x) => ({ x, value: gatherValue(x) }))
      .sort((a, b) => b.value - a.value)[0]
    if (!best || best.value <= 0) return false
    act({ type: 'gather', rule: best.x.rule }, 'gather')
    if (state.encounter) {
      resolveEncounter()
      return true
    }
    const good = best.x.good
    const keep =
      good === 'food' ? GATHER_FOOD_DAYS * livingMembers(state).length : reserved(state, good)
    const spare = (state.goods[good] ?? 0) - keep
    if (spare > 0 && quote(state, content, state.location!, good, 'sell', spare)) {
      act({ type: 'sellGoods', good, amount: spare }, 'gather')
    }
    return true
  }

  /**
   * With the sign-on fee and HIRE_RESERVE_DAYS of the recruit's food in hand, hires the best
   * recruit on offer (the highest level, then the lowest fee), up to `hireUpTo` living members.
   */
  const hire = () => {
    if (!o.hire) return
    const ration = quote(state, content, state.location!, 'food', 'buy', 1)?.unitFirst ?? 1
    const keep = HIRE_RESERVE_DAYS * ration
    for (let n = livingMembers(state).length; n < o.hireUpTo; n++) {
      const offer = recruitOffers(state, content, state.location!)
        .filter((x) => x.available && state.gold >= x.fee + keep)
        .sort((a, b) => b.level - a.level || a.fee - b.fee)[0]
      if (!offer) return
      act({ type: 'hireRecruit', offerId: offer.id }, 'hire')
    }
  }

  /**
   * Puts each carried accessory (the dearest first) on a member who wears none: a skill hook on
   * the best user of that skill, anything else on the first free member. Spares are sold where a
   * shop buys them.
   */
  const wearGear = () => {
    if (!o.gear || state.encounter) return
    for (const a of [...state.gear].sort((x, y) => y.value - x.value)) {
      const free = livingMembers(state).filter((c) => c.accessory === null)
      if (free.length === 0) break
      const skill = a.hooks.flatMap((h) => (h.hook === 'skill' ? [h.skill] : []))[0]
      const who = skill
        ? [...free].sort((x, y) => statModifier(y, skill) - statModifier(x, skill))[0]
        : free[0]
      act({ type: 'equipAccessory', characterId: who.id, id: a.id }, 'gear')
    }
    for (const sale of accessorySales(state, content)) {
      if (sale.available) act({ type: 'sellAccessory', id: sale.accessory.id }, 'gear')
    }
  }

  /** Gold kept back from upkeep: lodging and the next road's food. */
  const upkeepReserve = () => RESERVE_PER_MEMBER * livingMembers(state).length + BROKE_GOLD

  /**
   * Keeping the party together, as a player watching the camaraderie bar would (Plan 6 B): a round
   * on arriving at an inn while it is below ROUND_BELOW, and a night in a private room while it is
   * below PRIVATE_BELOW, each when the purse keeps its reserve.
   */
  const upkeep = () => {
    if (!o.upkeep || livingMembers(state).length < 2) return
    const inn = serviceWith(state, content, 'round')
    const round = roundOption(state)
    if (
      inn &&
      state.camaraderie < ROUND_BELOW &&
      round.available &&
      state.gold - round.cost >= upkeepReserve()
    ) {
      act({ type: 'useService', service: inn, action: 'round' }, 'upkeep')
    }
    const room = restOption(state, content, 'private')
    if (
      state.camaraderie < PRIVATE_BELOW &&
      room.room === 'private' &&
      state.gold - room.lodgingCost >= upkeepReserve()
    ) {
      act({ type: 'rest', lodging: 'private' }, 'upkeep')
    }
  }

  /** Visits to dungeons: the day the delver last left each. */
  const delvedAt: Record<string, number> = {}
  const bestLevel = () => Math.max(1, ...livingMembers(state).map((c) => c.level))

  /**
   * The dungeon the delver goes to from settlement `here`: the nearest known, inhabited authored
   * dungeon within MAX_DELVE_DAYS whose suggested level is at most its best + DELVE_LEVEL_LEAD (or
   * not yet known: one look inside tells it), not left within DELVE_AGAIN_DAYS. Only when fit,
   * with no contract in hand and no Crisis site to go to.
   */
  const dungeonTarget = (here: string): string | null => {
    if (!delves || state.contracts.length > 0 || !healthy(state)) return null
    if (state.gold < crusadeGold()) return null
    let best: { id: string; days: number } | null = null
    for (const [id, poi] of Object.entries(state.world.pois)) {
      if (!poi.discovered || !dungeonOf(content, poi)) continue
      if (state.day - (delvedAt[id] ?? -Infinity) < DELVE_AGAIN_DAYS) continue
      if (siteStatus(state.world.seed, id, poi, state.day)?.phase === 'empty') continue
      const level = delvePreview(state, content, id)?.suggestedLevel ?? null
      if (level !== null && level > bestLevel() + DELVE_LEVEL_LEAD) continue
      const days = poiReach(state, content, here, id)?.days ?? null
      if (days === null || days > MAX_DELVE_DAYS) continue
      if (!best || days < best.days) best = { id, days }
    }
    return best?.id ?? null
  }

  /**
   * In a dungeon between rooms: press on while everyone standing has DELVE_FIT_HP of their HP and
   * the next room's risk is at most DELVE_MAX_RISK, else withdraw.
   */
  const delveOn = () => {
    for (let guard = 0; state.delve && !state.delve.inRoom && guard < 12; guard++) {
      const here = state.delve.poi
      const preview = delvePreview(state, content, here)
      const fit = livingMembers(state).every((c) => c.hp >= c.maxHp * DELVE_FIT_HP)
      if (delves && preview && fit && (preview.risk ?? 1) <= DELVE_MAX_RISK) {
        act({ type: 'pressOn' }, 'delve')
        resolveEncounter()
      } else act({ type: 'withdraw' }, 'delve')
    }
  }

  /** The gold the crusader wants in hand to go after the Crisis. */
  const crusadeGold = () => CRUSADE_GOLD_PER_MEMBER * livingMembers(state).length

  /** The crusader's goal while it is free to pursue it: no contract in hand, and gold enough. */
  const pursuing = (): CrusadeGoal | null =>
    o.crusade && state.contracts.length === 0 && state.gold >= crusadeGold()
      ? crusadeGoal(state, content)
      : null

  /**
   * In town, the crusader first eats: with under two days of food, it pours out water (free here)
   * to make room and buys two days' worth.
   */
  const eatFirst = () => {
    const mouths = livingMembers(state).length
    const short = 2 * mouths - goodsOf(state.goods, 'food')
    if (short <= 0 || !quote(state, content, state.location!, 'food', 'buy', 1)) return
    const kg = short * goodWeight(content, 'food') - room()
    const water = goodsOf(state.goods, 'water')
    if (kg > 0 && water > 0) {
      const pour = Math.min(water, Math.ceil(kg / goodWeight(content, 'water')))
      act({ type: 'dropGoods', good: 'water', amount: pour }, 'drop')
    }
    act({ type: 'buyGoods', good: 'food', amount: short }, 'provision')
  }

  /** The land a settlement lies in (a `regions` id). */
  const landOf = (id: string) =>
    Object.hasOwn(content.settlements, id) ? content.settlements[id].region : undefined

  /**
   * Where the crusader heads next for its goal, from settlement `here`: the site itself, or in the
   * act's land the nearest settlement whose domain it hasn't searched yet for this act (all of
   * them searched: start over). Null with no goal or when here is the place to search.
   */
  const crusadeTarget = (goal: CrusadeGoal, here: string): string | null => {
    if (goal.poi !== null) return goal.poi
    const act = crisisStatus(state.crisis!, state.day).act!
    if (searched.act !== act) searched = { act, at: new Set() }
    const near = [...settlementReach(content, here)]
      .filter(([id]) => landOf(id) === goal.land && Object.hasOwn(state.world.settlements, id))
      .sort((a, b) => a[1].days - b[1].days)
      .map(([id]) => id)
    const ours = landOf(here) === goal.land
    if (ours && !searched.at.has(here)) return null
    const next = near.find((id) => id !== here && !searched.at.has(id))
    if (next) return next
    // Every domain of the land searched: search them again, starting here.
    searched = { act, at: new Set() }
    return ours ? null : (near[0] ?? null)
  }

  /**
   * The crusader's next road toward its goal from settlement `here`, when it can take it: one it
   * can supply, and for the road to a Crisis site, with the water for the way back and the days
   * there (CRUSADE_SITE_FOOD_DAYS). Null without a goal, when here is the place to search, or when
   * the road can't be supplied ('gold' or 'weight' says why).
   */
  const crusadeStep = (
    here: string
  ): { target: string; road: RouteOption } | { target: null; short: 'gold' | 'weight' | null } => {
    const goal = pursuing()
    const target = goal ? crusadeTarget(goal, here) : null
    if (!target) return { target: null, short: null }
    const roads = routeOptions(state, content).filter((r) => r.available)
    const road = roadToward(state, content, roads, target)
    if (!road) return { target: null, short: null }
    const p = provisionPlan(state, content, { routeId: road.routeId, pace: 'steady' })
    const skins = maxWaterskins(state, content)
    if (!p || p.limit !== null) return { target: null, short: p?.limit ?? null }
    if (p.waterskinsShort > skins.units) return { target: null, short: skins.limit }
    const trip = siteTrip(road)
    if (trip) {
      // All of it carried (if slowly); the skins and the food paid with coin to spare.
      if (!trip.fits) return { target: null, short: 'weight' }
      const ration = quote(state, content, here, 'food', 'buy', 1)?.unitFirst ?? 1
      const food = Math.max(0, trip.food - goodsOf(state.goods, 'food')) * ration
      if (trip.skins * WATERSKIN_PRICE + food > state.gold - BROKE_GOLD) {
        return { target: null, short: 'gold' }
      }
    }
    return { target, road }
  }

  /**
   * For the crusader's road to a Crisis site: the water and food for the way there and back and
   * CRUSADE_SITE_FOOD_DAYS there (the desert drinks twice), and the waterskins still to buy for it.
   * Null for any other road.
   */
  const siteTrip = (
    road: RouteOption
  ): { water: number; food: number; skins: number; fits: boolean } | null => {
    if (!o.crusade || !Object.hasOwn(state.world.pois, road.to)) return null
    const dungeon = delves && dungeonOf(content, state.world.pois[road.to]) !== undefined
    if (!dungeon && !crisisSites(state.crisis).includes(road.to)) return null
    const mouths = state.party.length + escortPassengers(state)
    const type = state.world.pois[road.to].type
    const spring = Object.hasOwn(content.poiTypes, type) && content.poiTypes[type].water
    const plan = (slow: boolean) => {
      const way = slow ? Math.ceil(road.days / ENCUMBERED_SPEED) : road.days
      const days = 2 * way + CRUSADE_SITE_FOOD_DAYS
      // A site with a spring refills the skins on arrival: water for the way there only.
      const wet = spring ? way : days
      const water = mouths * wet * waterNeed(road.terrain)
      const food = mouths * (days + 1)
      const level = load({ ...state, goods: { ...state.goods, water, food } }, content).level
      const skins = Math.ceil(Math.max(0, water - partyWaterCapacity(state)) / WATERSKIN_WATER)
      return { water, food, skins, level }
    }
    // Light if it can be; else laden, which takes longer and needs more.
    const light = plan(false)
    const trip = light.level === 'light' ? light : plan(true)
    return { ...trip, fits: trip.level !== 'overloaded' }
  }

  /**
   * The crusader's business in a settlement before it sets out (Plan 5b I1): listen for talk of the
   * Crisis, search this domain once per act when it lies in the act's land, and rest until fit
   * before going to a Crisis site. True when that took the leg.
   */
  const crusadeInTown = (here: string): boolean => {
    const goal = crusadeGoal(state, content)
    const crisis = state.crisis
    if (!crisis || crisisDecided(crisis, state.day)) return false
    if (state.contracts.length > 0 || state.gold < crusadeGold()) return false
    const phase = crisisStatus(crisis, state.day).phase
    // Talk: in an open act with nothing to go on (it may name the lead site), and in the land the
    // act points to (a clue).
    const talk =
      (actOpen(phase) && goal === null) || (goal?.land != null && landOf(here) === goal.land)
    const option = talk ? rumourOption(state, content) : null
    if (option && state.gold >= option.cost + BROKE_GOLD) {
      act({ type: 'listenRumours' }, 'rumours')
      if (state.encounter) resolveEncounter()
      return true
    }
    const now = pursuing()
    if (now?.land != null && landOf(here) === now.land && crusadeTarget(now, here) === null) {
      searched.at.add(here)
      if (exploreOption(state, content)) {
        act({ type: 'explore' }, 'explore')
        resolveEncounter()
        return true
      }
    }
    // Too much to carry for the road to the Crisis: a mule, once it can spare the coin.
    const mule = content.animals[PACK_ANIMAL]
    const step = now ? crusadeStep(here) : null
    if (
      step &&
      'short' in step &&
      step.short === 'weight' &&
      mule &&
      (state.animals[PACK_ANIMAL] ?? 0) === 0 &&
      state.gold >= mule.price + crusadeGold() &&
      serviceWith(state, content, 'animals')
    ) {
      act({ type: 'buyAnimal', animal: PACK_ANIMAL }, 'animal')
    }
    if (now?.poi != null && !healthy(state) && fitRest < MAX_FIT_REST_DAYS) {
      const inn = restOption(state, content)
      const lodging = inn.lodging && state.gold - inn.lodgingCost >= RESERVE_PER_MEMBER
      const short = livingMembers(state).length - goodsOf(state.goods, 'food')
      if (!lodging && short > 0) act({ type: 'buyGoods', good: 'food', amount: short }, 'crusade')
      if (lodging || goodsOf(state.goods, 'food') >= livingMembers(state).length) {
        fitRest++
        act({ type: 'rest', lodging }, 'crusade')
        return true
      }
    }
    return false
  }

  /** One leg's business in a settlement, ending on the road (or resting when there is none). */
  const inTown = (leg: number) => {
    const here = state.location!
    boardSeen[here] = state.day
    if (o.crusade) eatFirst()
    wearGear()
    for (const c of [...state.contracts]) {
      const refused = completeRefusal(state, content, c)
      if (refused === null) {
        act({ type: 'completeContract', id: c.id, reward: 'gold' }, 'contract')
      } else if (c.met && c.to === here) {
        // Met but refused where it is due (its goods were lost on the way): give it up rather
        // than carry it about for ever.
        act({ type: 'abandonContract', id: c.id }, 'contract')
      }
    }
    // Sell first: the coin may pay for the inn.
    sellCargo()
    upkeep()
    // Spare waterskins are refilled on arrival and their water weighs a lot: when laden, pour it
    // out (water is free in town, and provisioning pours in what the next road needs). The skins
    // are kept: they are dear (a lasting upgrade), so selling and rebuying them would waste coin.
    const spareWater = goodsOf(state.goods, 'water') - waterCapacity(state.party.length)
    if (state.waterskins > 0 && spareWater > 0 && load(state, content).ratio > 0.8) {
      act({ type: 'dropGoods', good: 'water', amount: spareWater }, 'drop')
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
    hire()
    if (o.contracts) {
      for (let taken = 0; taken < MAX_CONTRACTS; taken++) {
        const offer = pickOffer(here)
        if (!offer) break
        act({ type: 'acceptContract', offerId: offer.id }, 'contract')
        if (!state.contracts.some((c) => c.id === offer.id)) break
      }
      buySupplies()
    }
    if (o.crusade && crusadeInTown(here)) return
    if (gatherWhenPoor()) return
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
    // Where to: the Crisis (crusading), a contract, the cargo run, a site now and then, or a
    // market not yet known.
    const contract = [...state.contracts].sort((a, b) => a.deadline - b.deadline)[0]
    const crusading = o.crusade ? crusadeStep(here).target : null
    if (crusading) plan = null
    let target: string | null =
      crusading ??
      (contract ? contractTarget(state, content, contract) : null) ??
      dungeonTarget(here)
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
    const errand = contract !== undefined || plan !== null || crusading !== null || target !== null
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
    const insist = contract !== undefined || crusading !== null
    if (!watered(road) && insist && target) {
      const other = roadToward(state, content, roads.filter(watered), target)
      if (!other && contract !== undefined) {
        act({ type: 'abandonContract', id: contract.id }, 'contract')
        return
      }
      if (other) road = other
    }
    // A road the purse or the packs can't supply is no road for a poor party: take the
    // shortest one that can be supplied instead, unless a contract insists.
    if (!watered(road) || (!supplied(road) && !insist)) {
      const shortest = [...(free.length > 0 ? free : roads)].sort((a, b) => a.days - b.days)
      road = shortest.find(supplied) ?? shortest.find(watered) ?? road
    }
    const pace = paceFor(state, content, road)
    // The crusader's road to a Crisis site: the waterskins for the way back too.
    const trip = siteTrip(road)
    if (trip && trip.skins > 0) act({ type: 'buyWaterskin', count: trip.skins }, 'provision')
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
      // The crusader stays for days: food for them too.
      const extra = trip ? CRUSADE_SITE_FOOD_DAYS : 0
      act({ type: 'buyGoods', good: 'food', amount: mouths * (road.days + 1 + extra) }, 'provision')
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
    fitRest = 0
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
      if (state.delve) {
        delveOn()
        delvedAt[here] = state.day
      }
    }
    wearGear()
    lighten()
    const roads = routeOptions(state, content).filter((r) => r.available)
    if (roads.length === 0) {
      act({ type: 'rest', lodging: false }, 'rest')
      return
    }
    const contract = state.contracts.find((c) => c.met || c.poi !== here)
    const target = contract ? contractTarget(state, content, contract) : (plan?.to ?? null)
    // Crusading: back to the nearest settlement, to rest and come again.
    const town = o.crusade
      ? [...roads]
          .filter((r) => Object.hasOwn(state.world.settlements, r.to))
          .sort((a, b) => a.days - b.days)[0]
      : undefined
    const road =
      town ??
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

  /** Legs in a row in which no day passed (the policy then rests a day rather than spin). */
  let stalled = 0
  let lastDay = state.day
  for (let leg = 0; leg < legs && !o.until?.(state); leg++) {
    if (runOver(state)) break
    if (state.encounter) resolveEncounter()
    stalled = state.day === lastDay ? stalled + 1 : 0
    lastDay = state.day
    if (stalled >= MAX_STALLED_LEGS && !state.travel && state.location !== null) {
      const inn = restOption(state, content)
      act({ type: 'rest', lodging: inn.lodging }, 'rest')
      continue
    }
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

/**
 * The crusader (Plan 5b I1): a sim policy for the Crisis report, not a rule. It trades as the
 * trader does, but goes to the reveal site once it is known; with an act's land known, travels
 * there, listens at its taverns and searches each of its domains in turn; and with the act's site
 * known, rests until fit (HP at 75%, no exhaustion), goes there and plays it on every arrival
 * (never backing out) until the act is thwarted.
 *
 * It sets out only when it can: no contract in hand, CRUSADE_GOLD_PER_MEMBER gold, and a road it
 * can supply (to a site, with the water and food there and back, buying a mule when the load is
 * too much). Otherwise it works as the trader does until it can. In town it eats first.
 */
export function crusader(
  start: GameState,
  content: Content,
  legs: number,
  options: TraderOptions = {}
): GameState {
  return trader(start, content, legs, { ...options, crusade: true })
}
