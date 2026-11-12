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
import { lodgingOptions, type Room } from '../town/services'
import { animalUpkeep } from '../town/animals'
import { journeyDays } from './routes'
import {
  CAMP_HEAL,
  DEFAULT_PACE,
  LODGING_PRICE,
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
 * True when today's food or water won't stretch to everyone's daily ration. (A forced march's
 * extra is eaten if it is there; going without it costs nothing more.)
 */
export const runsShort = (state: GameState, terrain: Biome | null): boolean =>
  goodsOf(state.goods, 'food') < state.party.length ||
  goodsOf(state.goods, 'water') < waterNeed(terrain) * state.party.length

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
  /** The owned animals' fodder and stabling for the day (paid wherever the party is). */
  stabling: number
}

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
  return {
    inTown,
    lodgingCost: (wanted !== null ? room?.cost : common?.cost) ?? 0,
    lodging: stays,
    room: stays ? room!.room : null,
    stabling: animalUpkeep(state, content),
  }
}

/**
 * A day of rest. In a settlement: all HP back and the waterskins refilled. With an inn, the party
 * takes a room when it wants to and can pay (meals included, carried food untouched): a common
 * room fades one Strain stack, a private room PRIVATE_ROOM_FADE. Otherwise it eats its own food.
 * In camp (on the road or at a point of interest) it eats carried food, drinking as the terrain
 * there needs, and heals a quarter of max HP; at a site with a spring or well (`water`) the
 * waterskins are refilled after the day's drinking. Either way, everyone who ate and drank loses
 * a level of exhaustion, and the day ends as any day does (endOfDay: spoilage and the animals'
 * keep). Resting is never a forced march.
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
    const hp = option.inTown ? c.maxHp : Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * CAMP_HEAL))
    const exhaustion = unfed.includes(c.id) ? c.exhaustion : Math.max(0, c.exhaustion - 1)
    return { ...c, hp, exhaustion }
  })
  const refill = option.inTown || spring
  const goods = refill
    ? autoRefill({ ...after, waterskins: state.waterskins }, content)
    : after.goods
  const place = option.inTown ? settlementName(state, state.location!) : ''
  const keep = option.stabling > 0 ? ` The animals’ keep: ${option.stabling} gp.` : ''
  const text = !option.inTown
    ? spring
      ? 'The party makes camp by the water and rests a day. The waterskins are refilled.'
      : 'The party makes camp and rests a day.'
    : option.lodging
      ? `The party rests a day at an inn in ${place}` +
        `${option.room === 'private' ? ', in a private room' : ''}: ` +
        `${option.lodgingCost} gp, meals included.${keep}`
      : `The party rests a day in ${place}, eating its own food.${keep}`
  return appendLog({ ...after, party, goods }, text, 'good')
}

/**
 * Buys up to `count` extra waterskins at WATERSKIN_PRICE (as many as the gold allows). Each holds
 * WATERSKIN_WATER more water; all of them are filled.
 */
export function buyWaterskin(state: GameState, count = 1): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Waterskins can only be bought in a settlement.'), 'bad')
  }
  const wanted = Math.max(0, Math.floor(count))
  const bought = Math.min(wanted, Math.floor(state.gold / WATERSKIN_PRICE))
  if (bought === 0) return appendLog(state, `Waterskins cost ${WATERSKIN_PRICE} gp each.`, 'bad')
  const waterskins = state.waterskins + bought
  const goods = refillWater(state.goods, waterCapacity(state.party.length, waterskins))
  return appendLog(
    { ...state, gold: state.gold - bought * WATERSKIN_PRICE, waterskins, goods },
    `Bought ${bought} waterskin${bought === 1 ? '' : 's'} for ${bought * WATERSKIN_PRICE} gp ` +
      `and filled ${bought === 1 ? 'it' : 'them'}.`,
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
