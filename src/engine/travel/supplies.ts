import type { Content } from '../../content/build'
import type { Biome, Good, LogTone, Pace } from '../../schema/constants'
import type { Character, GameState, Goods } from '../../schema/state'
import type { Route } from '../../schema/world'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { inProgress } from '../encounters/run'
import { formatModifier } from '../format'
import { appendLog } from '../log'
import type { Rng } from '../rng'
import { statModifier } from '../rules/character'
import { rollCheck } from '../rules/checks'
import { fadeStrainAfter } from '../rules/strain'
import { settlementName } from '../world/geo'
import { DEFAULT_PACE, FORCED_MARCH_DC, rationMultiplier } from './pace'
import { journeyDays, routeTerrain } from './routes'
import { LODGING_PRICE, SELL_SHARE, WATER_DAYS, WATERSKIN_PRICE, WATERSKIN_WATER } from './tuning'

export { WATER_DAYS }

/** A new party carries this many days of food per member. */
export const STARTING_FOOD_DAYS = 5
/** A stop-gap price per ration until the Plan 4 market. */
export const FOOD_PRICE = 1
/** CON check DCs for a day without food, and a day without water. */
export const HUNGER_DC = 10
export const THIRST_DC = 15
/** A day in camp restores this share of max HP; a day in a settlement restores all of it. */
export const CAMP_HEAL = 0.25

export const goodsOf = (goods: Goods, good: Good): number => goods[good] ?? 0
/** Each member's own waterskin holds WATER_DAYS of water; each extra one adds WATERSKIN_WATER. */
export const waterCapacity = (members: number, waterskins = 0): number =>
  WATER_DAYS * members + WATERSKIN_WATER * waterskins
export const partyWaterCapacity = (state: Pick<GameState, 'party' | 'waterskins'>): number =>
  waterCapacity(state.party.length, state.waterskins)
export const startingGoods = (members: number): Goods => ({
  food: STARTING_FOOD_DAYS * members,
  water: waterCapacity(members),
})
/** Water per member per day: the desert takes twice as much. */
export const waterNeed = (terrain: Biome | null): number => (terrain === 'desert' ? 2 : 1)
export const refillWater = (goods: Goods, capacity: number): Goods => ({
  ...goods,
  water: Math.max(goodsOf(goods, 'water'), capacity),
})

/** The party's extra on top of the daily rations at this pace (a forced march eats more). */
const extraFor = (ration: number, pace: Pace): number =>
  Math.ceil(ration * (rationMultiplier(pace) - 1))

/** What the whole party eats and drinks in one day at this pace. */
export function dailyNeed(
  members: number,
  terrain: Biome | null,
  pace: Pace = DEFAULT_PACE
): { food: number; water: number } {
  const food = members
  const water = waterNeed(terrain) * members
  return { food: food + extraFor(food, pace), water: water + extraFor(water, pace) }
}

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

type Line = { text: string; tone: LogTone }

/** A CON check against a level of exhaustion; returns the character after it, and a log line. */
function endure(
  rng: Rng,
  c: Character,
  dc: number,
  what: string
): { rng: Rng; character: Character; line: Line } {
  const [roll, next] = rollCheck(rng, statModifier(c, 'con'), dc)
  const holds = roll.tier === 'success' || roll.tier === 'critSuccess'
  const line =
    `${c.name} ${what}: CON ${roll.kept} ${formatModifier(roll.modifier)} = ` +
    `${roll.total} vs DC ${dc}, ${holds ? 'holds up' : 'gains a level of exhaustion'}.`
  const character = holds ? c : { ...c, exhaustion: Math.min(MAX_EXHAUSTION, c.exhaustion + 1) }
  return { rng: next, character, line: { text: line, tone: holds ? 'info' : 'bad' } }
}

/**
 * One day passes. Members eat and drink in party order. Whoever goes without makes a CON check
 * (DC 10 without food, 15 without water) or gains a level of exhaustion. On a forced march the
 * party then eats its extra rations (what is left of them), and every member makes a CON check
 * (FORCED_MARCH_DC) or gains a level of exhaustion. Strain fades, except stacks gained today.
 * Returns the ids of those who went without, for rest.
 */
function consumeDay(
  state: GameState,
  terrain: Biome | null,
  pace: Pace
): { state: GameState; unfed: string[] } {
  let food = goodsOf(state.goods, 'food')
  let water = goodsOf(state.goods, 'water')
  const need = waterNeed(terrain)
  let rng = state.rng
  const unfed: string[] = []
  const lines: Line[] = []
  const party = state.party.map((c) => {
    const fed = food >= 1
    if (fed) food -= 1
    const watered = water >= need
    if (watered) water -= need
    let character = fadeStrainAfter(c, state.skillUses, state.day)
    if (!fed || !watered) {
      unfed.push(c.id)
      const lack = !fed && !watered ? 'food and water' : fed ? 'water' : 'food'
      const dc = watered ? HUNGER_DC : THIRST_DC
      const result = endure(rng, character, dc, `goes without ${lack}`)
      rng = result.rng
      character = result.character
      lines.push(result.line)
    }
    return character
  })
  const extra = dailyNeed(state.party.length, terrain, pace)
  food = Math.max(0, food - (extra.food - state.party.length))
  water = Math.max(0, water - (extra.water - need * state.party.length))
  const marched =
    pace === 'forced'
      ? party.map((c) => {
          const result = endure(rng, c, FORCED_MARCH_DC, 'pushes on')
          rng = result.rng
          lines.push(result.line)
          return result.character
        })
      : party
  let next: GameState = {
    ...state,
    rng,
    party: marched,
    day: state.day + 1,
    goods: { ...state.goods, food, water },
  }
  for (const line of lines) next = appendLog(next, line.text, line.tone)
  return { state: next, unfed }
}

/** A day on the road at this pace. */
export const passDay = (
  state: GameState,
  terrain: Biome | null,
  pace: Pace = DEFAULT_PACE
): GameState => consumeDay(state, terrain, pace).state

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
  const inTown = state.travel === null && state.location !== null
  const cost = inTown ? lodgingCost(state.party.length) : 0
  return { inTown, lodgingCost: cost, lodging: inTown && lodging && state.gold >= cost }
}

/**
 * A day of rest. In a settlement: all HP back and the waterskins refilled. The party takes
 * lodging (LODGING_PRICE per member, meals included, carried food untouched) when it wants to and
 * can pay; otherwise it eats its own food. In camp it eats carried food and heals a quarter of
 * max HP. Either way, everyone who ate and drank loses a level of exhaustion. Resting is never a
 * forced march. (Plan 4 sets lodging by inn quality.)
 */
export function rest(state: GameState, content: Content, lodging = true): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  const option = restOption(state, lodging)
  const terrain = state.travel ? routeTerrain(content, state.travel) : null
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
  const goods = option.inTown ? refillWater(after.goods, partyWaterCapacity(state)) : after.goods
  const place = option.inTown ? settlementName(state, state.location!) : ''
  const text = !option.inTown
    ? 'The party makes camp and rests a day.'
    : option.lodging
      ? `The party rests a day at an inn in ${place}: ${option.lodgingCost} gp, meals included.`
      : `The party rests a day in ${place}, eating its own food.`
  return appendLog({ ...after, party, goods }, text, 'good')
}

const inSettlement = (state: GameState): boolean => !state.travel && state.location !== null

/** Buys up to `amount` rations at FOOD_PRICE (as many as the gold allows) and refills water. */
export function buyFood(state: GameState, amount: number): GameState {
  if (!inSettlement(state)) {
    return appendLog(state, 'Food can only be bought in a settlement.', 'bad')
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
    return appendLog(state, 'Waterskins can only be bought in a settlement.', 'bad')
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
    return appendLog(state, 'Supplies can only be sold in a settlement.', 'bad')
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
