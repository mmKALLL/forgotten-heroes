import type { Content } from '../../content/build'
import type { Biome, Pace } from '../../schema/types'
import type { GameState, Goods } from '../../schema/state'
import type { Route } from '../../schema/world'
import { inProgress } from '../encounters/run'
import { appendLog } from '../log'
import { MAX_EXHAUSTION } from '../rules/character'
import { fadeStrainAfter } from '../rules/strain'
import { settlementName } from '../world/geo'
import { springAt, terrainHere } from '../world/graph'
import { consumeDay, dailyNeed, endOfDay, goodsOf, waterNeed } from './days'
import { inSettlement, notHere } from './where'
import { load } from '../economy/capacity'
import type { BuyLimit } from '../economy/trade'
import { lodgingOptions, type Room } from '../town/services'
import { bond, changeCamaraderie, shiftCamaraderie } from '../town/camaraderie'
import { campKitCheer, campKitHp } from '../rules/upgrades'
import { journeyDays } from './routes'
import {
  CAMP_HEAL,
  DEFAULT_PACE,
  LODGING_PRICE,
  PRIVATE_ROOM_EXHAUSTION,
  PRIVATE_ROOM_FADE,
  STARTING_FOOD_DAYS,
  WATERSKIN_PRICE,
  WATERSKIN_SELL_PRICE,
  WATERSKIN_WATER,
  WATER_DAYS,
} from '../constants'

export { dailyNeed, goodsOf, passDay, waterNeed } from './days'
export { inSettlement, notHere } from './where'

/** Each member's own waterskin holds WATER_DAYS of water; each extra one adds WATERSKIN_WATER. */
export const waterCapacity = (members: number, waterskins = 0): number =>
  WATER_DAYS * members + WATERSKIN_WATER * waterskins
export const partyWaterCapacity = (state: Pick<GameState, 'party' | 'waterskins'>): number =>
  waterCapacity(state.party.length, state.waterskins)
export const startingGoods = (members: number): Goods => ({
  food: STARTING_FOOD_DAYS * members,
  water: waterCapacity(members),
})
export const refillWater = (goods: Goods, capacity: number): Goods => ({
  ...goods,
  water: Math.max(goodsOf(goods, 'water'), capacity),
})

/**
 * Refilling by itself (arriving in a settlement, resting there, a spring; designer decision):
 * every member's own skin is filled, and the extra waterskins only as far as the party stays
 * unencumbered. Provisioning for a road fills them as far as that road needs.
 */
export function autoRefill(state: GameState, content: Content): Goods {
  const full = partyWaterCapacity(state)
  const now = goodsOf(state.goods, 'water')
  if (now >= full) return state.goods
  const floor = Math.max(now, waterCapacity(state.party.length))
  const light = (water: number) =>
    load({ ...state, goods: { ...state.goods, water } }, content).level === 'light'
  let water = full
  while (water > floor && !light(water)) water -= 1
  return { ...state.goods, water: Math.min(full, Math.max(floor, water)) }
}

/** The days a route takes and the food and water it needs at this pace, for previews. */
export function journeySupplies(
  route: Pick<Route, 'km' | 'terrain'>,
  members: number,
  pace: Pace = DEFAULT_PACE
): { days: number; food: number; water: number } {
  const days = journeyDays(route, pace)
  const need = dailyNeed(members, route.terrain, pace)
  return { days, food: days * need.food, water: days * need.water }
}

/**
 * True when today's food or water won't stretch to everyone's daily ration, less the water camels
 * save (`saving`, town/animals.ts camelWaterSaving). (A forced march's extra is eaten if it is
 * there; going without it costs nothing more.)
 */
export const runsShort = (state: GameState, terrain: Biome | null, saving = 0): boolean =>
  goodsOf(state.goods, 'food') < state.party.length ||
  goodsOf(state.goods, 'water') + saving < waterNeed(terrain) * state.party.length

/** A common room for the whole party for one night. */
export const lodgingCost = (members: number): number => LODGING_PRICE * members

/** What a day of rest here would be: in town at an inn (if wanted and affordable), or not. */
export type RestOption = {
  inTown: boolean
  /** The room for the party tonight (0 outside a settlement or without an inn). */
  lodgingCost: number
  /** True when the party would stay at an inn: meals included, carried supplies untouched. */
  lodging: boolean
  /** The room it would take, or null. */
  room: Room | null
  /** In camp: the share of max HP each member regains (CAMP_HEAL); 1 in town (all of it). */
  healShare: number
  /** In camp: the HP each member regains on top of the share, from the camp kit (else 0). */
  kitHp: number
  /** In camp: the camaraderie the camp kit's rest brings now (once a stop or journey), else 0. */
  cheer: number
}

/** Once-per-arrival key (doneHere) for the camp kit's camaraderie. */
const CAMPFIRE = 'campfire'

/**
 * How the party would rest: `lodging` true (or "common") takes a common room, "private" a private
 * room where the inn has them (else a common room), false its own food. It stays at an inn only
 * when there is one and it can pay.
 */
export function restOption(
  state: GameState,
  content: Content,
  lodging: boolean | Room = true
): RestOption {
  const inTown = inSettlement(state)
  const rooms = inTown ? lodgingOptions(state, content) : []
  const common = rooms.find((r) => r.room === 'common')
  const wanted = lodging === false ? null : lodging === 'private' ? 'private' : 'common'
  const room = rooms.find((r) => r.room === wanted) ?? common
  const stays = wanted !== null && room !== undefined && state.gold >= room.cost
  const cheer =
    inTown || state.doneHere.includes(CAMPFIRE)
      ? 0
      : shiftCamaraderie(state.camaraderie, campKitCheer(state)).value - state.camaraderie
  return {
    inTown,
    lodgingCost: (wanted !== null ? room?.cost : common?.cost) ?? 0,
    lodging: stays,
    room: stays ? room!.room : null,
    healShare: inTown ? 1 : CAMP_HEAL,
    kitHp: inTown ? 0 : campKitHp(state),
    cheer,
  }
}

/**
 * A day of rest. In a settlement: all HP back and the waterskins refilled. With an inn, the party
 * takes a room when it wants to and can pay (meals included, carried food untouched): a common
 * room fades one Strain stack and lifts a level of exhaustion, a private room PRIVATE_ROOM_FADE and
 * PRIVATE_ROOM_EXHAUSTION. Otherwise it eats its own food.
 * In camp (on the road or at a point of interest) it eats carried food, drinking as the terrain
 * there needs, and heals a quarter of max HP; at a site with a spring or well (`water`) the
 * waterskins are refilled after the day's drinking. Either way, everyone who ate and drank loses
 * a level of exhaustion, and the day ends as any day does (endOfDay: spoilage). Resting is never a forced march.
 */
export function rest(
  state: GameState,
  content: Content,
  lodging: boolean | Room = true
): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  const option = restOption(state, content, lodging)
  // Water is free in town; in camp the party drinks what the terrain there asks.
  const terrain = option.inTown ? null : terrainHere(state, content)
  const spring = !state.travel && springAt(state, content, state.location)
  const fades = option.room === 'private' ? PRIVATE_ROOM_FADE : 1
  // A private room lifts more exhaustion too (designer call 2026-11-13).
  const lifts = option.room === 'private' ? PRIVATE_ROOM_EXHAUSTION : 1
  const { state: after, unfed } = option.lodging
    ? {
        state: endOfDay(
          {
            ...state,
            day: state.day + 1,
            gold: state.gold - option.lodgingCost,
            party: state.party.map((c) => fadeStrainAfter(c, state.skillUses, state.day, fades)),
          },
          content
        ),
        unfed: [] as string[],
      }
    : consumeDay(state, terrain, DEFAULT_PACE, content)
  const party = after.party.map((c) => {
    if (c.exhaustion >= MAX_EXHAUSTION) return c
    const hp = option.inTown
      ? c.maxHp
      : Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * option.healShare) + option.kitHp)
    const exhaustion = unfed.includes(c.id) ? c.exhaustion : Math.max(0, c.exhaustion - lifts)
    return { ...c, hp, exhaustion }
  })
  const refill = option.inTown || spring
  const goods = refill
    ? autoRefill({ ...after, waterskins: state.waterskins }, content)
    : after.goods
  const place = option.inTown ? settlementName(state, state.location!) : ''
  const text = !option.inTown
    ? spring
      ? 'The party makes camp by the water and rests a day. The waterskins are refilled.'
      : 'The party makes camp and rests a day.'
    : option.lodging
      ? `The party rests a day at an inn in ${place}` +
        `${option.room === 'private' ? ', in a private room' : ''}: ` +
        `${option.lodgingCost} gp, meals included.`
      : `The party rests a day in ${place}, eating its own food.`
  const rested = appendLog({ ...after, party, goods }, text, 'good')
  // A night in a private room brings the party closer, once per arrival; so does a good camp
  // (the camp kit, once a stop or journey).
  if (option.cheer > 0) {
    const marked = { ...rested, doneHere: [...rested.doneHere, CAMPFIRE] }
    return changeCamaraderie(marked, option.cheer, 'a good night by the fire')
  }
  return option.room === 'private' ? bond(rested) : rested
}

/** A safety cap on the waterskins bought at once. */
const MAX_SKINS = 999

/**
 * The most extra waterskins the party can buy here (up to `wanted`): as many as the gold allows,
 * and no more than it could carry full without being overloaded (the weight check of maxBuy).
 * 0 outside a settlement or mid-encounter.
 */
export function maxWaterskins(
  state: GameState,
  content: Content,
  wanted = MAX_SKINS
): { units: number; limit: BuyLimit } {
  if (inProgress(state) || !inSettlement(state)) return { units: 0, limit: null }
  const asked = Math.min(MAX_SKINS, Math.max(0, Math.floor(wanted)))
  const affordable = Math.floor(Math.max(0, state.gold) / WATERSKIN_PRICE)
  const carries = (n: number) => {
    const water = waterCapacity(state.party.length, state.waterskins + n)
    const goods = refillWater(state.goods, water)
    return load({ ...state, goods }, content).level !== 'overloaded'
  }
  const cap = Math.min(asked, affordable)
  let units = 0
  while (units < cap && carries(units + 1)) units += 1
  const limit: BuyLimit = units >= asked ? null : units < cap ? 'weight' : 'gold'
  return { units, limit }
}

/**
 * Buys up to `count` extra waterskins at WATERSKIN_PRICE (maxWaterskins: as many as the gold
 * allows, and refused when their water would overload the party). Each holds WATERSKIN_WATER more
 * water, filled free as far as the party stays unencumbered (autoRefill).
 */
export function buyWaterskin(state: GameState, content: Content, count = 1): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Waterskins can only be bought in a settlement.'), 'bad')
  }
  const { units: bought, limit } = maxWaterskins(state, content, count)
  if (bought === 0) {
    return appendLog(
      state,
      limit === 'weight'
        ? 'Too heavy: the party could not carry the water in another waterskin.'
        : `Waterskins cost ${WATERSKIN_PRICE} gp each.`,
      'bad'
    )
  }
  const waterskins = state.waterskins + bought
  const skinned = { ...state, gold: state.gold - bought * WATERSKIN_PRICE, waterskins }
  const goods = autoRefill(skinned, content)
  const full = goodsOf(goods, 'water') >= waterCapacity(state.party.length, waterskins)
  return appendLog(
    { ...skinned, goods },
    `Bought ${bought} waterskin${bought === 1 ? '' : 's'} for ${bought * WATERSKIN_PRICE} gp ` +
      (full
        ? `and filled ${bought === 1 ? 'it' : 'them'}.`
        : 'and filled them as far as the party stays unencumbered.'),
    'info'
  )
}

/**
 * Sells up to `count` extra waterskins for WATERSKIN_SELL_PRICE each (desperate measures). Water
 * beyond the smaller capacity is poured out. Food and other goods are sold at the market
 * (economy/trade.ts).
 */
export function sellWaterskin(state: GameState, count = 1): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Waterskins can only be sold in a settlement.'), 'bad')
  }
  const skins = Math.min(Math.max(0, Math.floor(count)), state.waterskins)
  if (skins === 0) return appendLog(state, 'There is no waterskin to sell.', 'bad')
  const gold = skins * WATERSKIN_SELL_PRICE
  const left = state.waterskins - skins
  const goods = {
    ...state.goods,
    water: Math.min(goodsOf(state.goods, 'water'), waterCapacity(state.party.length, left)),
  }
  return appendLog(
    { ...state, gold: state.gold + gold, waterskins: left, goods },
    `Sold ${skins} waterskin${skins === 1 ? '' : 's'} for ${gold} gp.`,
    'info'
  )
}
