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
import { consumeDay, dailyNeed, goodsOf, waterNeed } from './days'
import { DEFAULT_PACE } from './pace'
import { journeyDays } from './routes'
import { LODGING_PRICE, SELL_SHARE, WATER_DAYS, WATERSKIN_PRICE, WATERSKIN_WATER } from './tuning'

export { HUNGER_DC, THIRST_DC, dailyNeed, goodsOf, passDay, waterNeed } from './days'
export { WATER_DAYS }

/** A new party carries this many days of food per member. */
export const STARTING_FOOD_DAYS = 5
/** A stop-gap price per ration until the Plan 4 market. */
export const FOOD_PRICE = 1
/** A day in camp restores this share of max HP; a day in a settlement restores all of it. */
export const CAMP_HEAL = 0.25

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

/** The days a route takes and the food and water it needs at this pace, for previews. */
export function journeySupplies(
  route: Pick<Route, 'km' | 'terrain'>,
  members: number,
  pace: Pace = DEFAULT_PACE,
  coverTracks = false
): { days: number; food: number; water: number } {
  const days = journeyDays(route, pace, coverTracks)
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

/** Lodging for the whole party for one night. */
export const lodgingCost = (members: number): number => LODGING_PRICE * members

/** What a day of rest here would be: in town at an inn (if wanted and affordable), or not. */
export type RestOption = {
  inTown: boolean
  /** Lodging for the party tonight (0 outside a settlement). */
  lodgingCost: number
  /** True when the party would stay at an inn: meals included, carried supplies untouched. */
  lodging: boolean
}

export function restOption(state: GameState, lodging = true): RestOption {
  const inTown = inSettlement(state)
  const cost = inTown ? lodgingCost(state.party.length) : 0
  return { inTown, lodgingCost: cost, lodging: inTown && lodging && state.gold >= cost }
}

/**
 * A day of rest. In a settlement: all HP back and the waterskins refilled. The party takes
 * lodging (LODGING_PRICE per member, meals included, carried food untouched) when it wants to and
 * can pay; otherwise it eats its own food. In camp (on the road or at a point of interest) it eats
 * carried food, drinking as the terrain there needs, and heals a quarter of max HP; at a site with
 * a spring or well (`water`) the waterskins are refilled after the day's drinking. Either way,
 * everyone who ate and drank loses a level of exhaustion. Resting is never a forced march. (Plan 4
 * sets lodging by inn quality.)
 */
export function rest(state: GameState, content: Content, lodging = true): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  const option = restOption(state, lodging)
  // Water is free in town; in camp the party drinks what the terrain there asks.
  const terrain = option.inTown ? null : terrainHere(state, content)
  const spring = !state.travel && springAt(state, content, state.location)
  const { state: after, unfed } = option.lodging
    ? {
        state: {
          ...state,
          day: state.day + 1,
          gold: state.gold - option.lodgingCost,
          party: state.party.map((c) => fadeStrainAfter(c, state.skillUses, state.day)),
        },
        unfed: [] as string[],
      }
    : consumeDay(state, terrain, DEFAULT_PACE)
  const party = after.party.map((c) => {
    if (c.exhaustion >= MAX_EXHAUSTION) return c
    const hp = option.inTown ? c.maxHp : Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * CAMP_HEAL))
    const exhaustion = unfed.includes(c.id) ? c.exhaustion : Math.max(0, c.exhaustion - 1)
    return { ...c, hp, exhaustion }
  })
  const refill = option.inTown || spring
  const goods = refill ? refillWater(after.goods, partyWaterCapacity(state)) : after.goods
  const place = option.inTown ? settlementName(state, state.location!) : ''
  const text = !option.inTown
    ? spring
      ? 'The party makes camp by the water and rests a day. The waterskins are refilled.'
      : 'The party makes camp and rests a day.'
    : option.lodging
      ? `The party rests a day at an inn in ${place}: ${option.lodgingCost} gp, meals included.`
      : `The party rests a day in ${place}, eating its own food.`
  return appendLog({ ...after, party, goods }, text, 'good')
}

/** In a settlement (not on the road, and not at a point of interest). */
export const inSettlement = (state: Pick<GameState, 'travel' | 'location' | 'world'>): boolean =>
  !state.travel && state.location !== null && Object.hasOwn(state.world.settlements, state.location)

/** Refusals start "Not here" at a point of interest, where there is nothing to buy or sell. */
const notHere = (state: GameState, text: string): string =>
  !state.travel && state.location !== null
    ? `Not here: ${text[0].toLowerCase()}${text.slice(1)}`
    : text

/** Buys up to `amount` rations at FOOD_PRICE (as many as the gold allows) and refills water. */
export function buyFood(state: GameState, amount: number): GameState {
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Food can only be bought in a settlement.'), 'bad')
  }
  const wanted = Math.max(0, Math.floor(amount))
  const bought = Math.min(wanted, Math.floor(state.gold / FOOD_PRICE))
  if (bought === 0) return appendLog(state, `Rations cost ${FOOD_PRICE} gp each.`, 'bad')
  const goods = refillWater(
    { ...state.goods, food: goodsOf(state.goods, 'food') + bought },
    partyWaterCapacity(state)
  )
  return appendLog(
    { ...state, gold: state.gold - bought * FOOD_PRICE, goods },
    `Bought ${bought} ration${bought === 1 ? '' : 's'} for ${bought * FOOD_PRICE} gp and refilled the waterskins.`,
    'info'
  )
}

/**
 * Buys up to `count` extra waterskins at WATERSKIN_PRICE (as many as the gold allows). Each holds
 * WATERSKIN_WATER more water; all of them are filled.
 */
export function buyWaterskin(state: GameState, count = 1): GameState {
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

/** What selling these supplies would fetch: SELL_SHARE of their price, rounded down. */
export const saleValue = (food: number, waterskins: number): number =>
  Math.floor((food * FOOD_PRICE + waterskins * WATERSKIN_PRICE) * SELL_SHARE)

/**
 * Sells carried food and extra waterskins for coin in a settlement, at SELL_SHARE of their price
 * (desperate measures). Asks for more than the party has sell what it has. Water is free in any
 * settlement, so it fetches nothing; carried water beyond the smaller capacity is poured out.
 */
export function sellSupplies(
  state: GameState,
  { food = 0, waterskins = 0 }: { food?: number; waterskins?: number }
): GameState {
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Supplies can only be sold in a settlement.'), 'bad')
  }
  const rations = Math.min(Math.max(0, Math.floor(food)), goodsOf(state.goods, 'food'))
  const skins = Math.min(Math.max(0, Math.floor(waterskins)), state.waterskins)
  if (rations === 0 && skins === 0) return appendLog(state, 'There is nothing to sell.', 'bad')
  const gold = saleValue(rations, skins)
  const left = state.waterskins - skins
  const goods = {
    ...state.goods,
    food: goodsOf(state.goods, 'food') - rations,
    water: Math.min(goodsOf(state.goods, 'water'), waterCapacity(state.party.length, left)),
  }
  const sold = [
    rations > 0 && `${rations} ration${rations === 1 ? '' : 's'}`,
    skins > 0 && `${skins} waterskin${skins === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return appendLog(
    { ...state, gold: state.gold + gold, waterskins: left, goods },
    `Sold ${sold.join(' and ')} for ${gold} gp.`,
    'info'
  )
}
