import type { Content } from '../../content/build'
import type { Pace } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { inProgress } from '../encounters/run'
import { appendLog } from '../log'
import { load } from '../economy/capacity'
import { quote } from '../economy/market'
import { buyGoods, maxBuy, type BuyLimit } from '../economy/trade'
import { landSpeed } from '../travel/routes'
import { goodsOf, inSettlement, refillWater, waterCapacity } from '../travel/supplies'
import { forecastJourney } from '../travel/warnings'
import { paceFor } from '../travel/journey'
import { otherEnd, settlementName } from '../world/geo'
import { edgeById } from '../world/graph'
import { animalWater, camelWaterSaving, hireOffer } from './animals'
import { escortPassengers } from './contract-hooks'

// "Provision for this road" (a click-saver, Plan 4 designer decisions): one action buys the food a
// road needs at a pace, within the gold and the weight, and fills as much water as the road needs
// (no more). Waterskins are bought by hand only (designer decision): the plan says how many more
// the road needs, and warns when its water makes the party encumbered.

/** The road and how it would be walked, as the travel action names them. */
export type ProvisionFor = {
  routeId: string
  pace?: Pace
  /** Riding hired mounts (they drink, and change the days). */
  hire?: boolean
}

export type ProvisionPlan = {
  /** Rations to buy, and their price at the best shop here. */
  food: number
  foodCost: number
  /**
   * Extra waterskins the road needs that the party lacks: never bought here (designer decision),
   * only warned about, so the player buys them at the market.
   */
  waterskinsShort: number
  /** Water poured in free: as much as the road needs, never more than the skins hold. */
  water: number
  total: number
  /**
   * The water for this road would leave the party encumbered (slower, no forced march) when it
   * would be light without it: shown as a warning before the click (designer decision).
   */
  waterEncumbers: boolean
  /** What stops it buying all the road needs: the gold, the weight, or nothing. */
  limit: BuyLimit
  /** No food to buy and no water to fill (waterskins aside): the party has what it can buy. */
  ready: boolean
}

/** A safety cap on the units the plan adds one by one. */
const MAX_STEPS = 200

/**
 * What the party must buy here so the food and water it carries last the road at this pace
 * without foraging (the forecast the roads-out preview uses): rations, within the gold and short of
 * being overloaded, and the water the skins it has can hold; and how many more waterskins the road
 * would need (waterskinsShort, not bought). Null outside a settlement, for a road that doesn't
 * start here, or mid-encounter.
 */
export function provisionPlan(
  state: GameState,
  content: Content,
  plan: ProvisionFor
): ProvisionPlan | null {
  const here = state.location
  if (!inSettlement(state) || here === null || inProgress(state)) return null
  const route = edgeById(state, content, plan.routeId)
  if (!route || (route.from !== here && route.to !== here)) return null
  const offer = plan.hire ? hireOffer(state, content, route) : null
  const hired = offer && { animal: offer.animal, count: offer.count }
  const pace = paceFor(route, plan.pace)
  const members = state.party.length
  const forecast = (s: GameState) =>
    forecastJourney(s, route, pace, false, {
      speed: landSpeed(s, content, route.terrain, hired),
      animalWater: animalWater(s, content, hired),
      waterSaving: camelWaterSaving(s, content, route.terrain),
      escorts: escortPassengers(s),
    })
  const runsOut = (s: GameState, code: 'foodRunsOut' | 'waterRunsOut') =>
    forecast(s).warnings.some((w) => w.code === code)

  // Waterskins: how many more would hold the road's water. Bought by hand only.
  let limit: BuyLimit = null
  let short = 0
  const withSkins = (n: number): GameState => {
    const waterskins = state.waterskins + n
    return {
      ...state,
      waterskins,
      goods: refillWater(state.goods, waterCapacity(members, waterskins)),
    }
  }
  const carried = goodsOf(state.goods, 'water')
  while (runsOut(withSkins(short), 'waterRunsOut') && short < MAX_STEPS) short += 1
  // Only the water the road needs: the fewest units (at least what is carried) that last it.
  const full = withSkins(0)
  const capacity = goodsOf(full.goods, 'water')
  const withWater = (w: number): GameState => ({ ...full, goods: { ...full.goods, water: w } })
  let needed = carried
  while (needed < capacity && runsOut(withWater(needed), 'waterRunsOut')) needed += 1
  const skinned = withWater(needed)

  // Food: the fewest rations after which the food lasts the road.
  const withFood = (n: number): GameState => ({
    ...skinned,
    goods: { ...skinned.goods, food: goodsOf(skinned.goods, 'food') + n },
  })
  let food = 0
  while (runsOut(withFood(food), 'foodRunsOut') && food < MAX_STEPS) food += 1
  if (food > 0) {
    const most = maxBuy(skinned, content, 'food', food)
    if (most.units < food) limit = limit ?? most.limit
    food = most.units
  }
  const foodCost = food > 0 ? (quote(skinned, content, here, 'food', 'buy', food)?.total ?? 0) : 0
  const water = Math.max(0, needed - carried)
  const after = withFood(food)
  const dry = { ...after, goods: { ...after.goods, water: carried } }
  const waterEncumbers =
    water > 0 && load(after, content).level !== 'light' && load(dry, content).level === 'light'
  return {
    food,
    foodCost,
    waterskinsShort: short,
    water,
    total: foodCost,
    waterEncumbers,
    limit,
    // A party that can't afford a single ration isn't ready, it is broke.
    ready: food === 0 && water === 0 && limit === null,
  }
}

/** Buys and fills what provisionPlan says, logging each purchase (and the waterskins short). */
export function provision(state: GameState, content: Content, plan: ProvisionFor): GameState {
  const p = provisionPlan(state, content, plan)
  if (!p) return appendLog(state, 'There is nothing to provision here.', 'bad')
  const route = edgeById(state, content, plan.routeId)!
  const to = settlementName(state, otherEnd(route, state.location!))
  if (p.ready)
    return appendLog(state, `The party already has what the road to ${to} needs.`, 'info')
  let next = p.food > 0 ? buyGoods(state, content, 'food', p.food) : state
  next = { ...next, goods: { ...next.goods, water: goodsOf(state.goods, 'water') + p.water } }
  const short =
    p.limit === 'gold'
      ? ', all the gold allows'
      : p.limit === 'weight'
        ? ', all the party can carry'
        : ''
  const heavy = p.waterEncumbers
    ? ' The water leaves the party encumbered: slower, and no forced march.'
    : ''
  const skins =
    p.waterskinsShort > 0
      ? ` The road needs ${p.waterskinsShort} more waterskin${p.waterskinsShort === 1 ? '' : 's'}.`
      : ''
  return appendLog(
    next,
    `Provisioned for the road to ${to}${short}.${heavy}${skins}`,
    p.limit || p.waterEncumbers || skins ? 'bad' : 'info'
  )
}
