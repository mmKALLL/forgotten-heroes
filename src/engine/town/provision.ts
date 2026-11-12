import type { Content } from '../../content/build'
import type { Pace } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { inProgress } from '../encounters/run'
import { appendLog } from '../log'
import { load } from '../economy/capacity'
import { quote } from '../economy/market'
import { buyGoods, maxBuy, type BuyLimit } from '../economy/trade'
import { landSpeed } from '../travel/routes'
import {
  buyWaterskin,
  goodsOf,
  inSettlement,
  partyWaterCapacity,
  refillWater,
  waterCapacity,
} from '../travel/supplies'
import { forecastJourney } from '../travel/warnings'
import { paceFor } from '../travel/journey'
import { otherEnd, settlementName } from '../world/geo'
import { edgeById } from '../world/graph'
import { animalWater, hireOffer } from './animals'
import { escortPassengers } from './contract-hooks'
import { WATERSKIN_PRICE } from '../constants'

// "Provision for this road" (a click-saver, Plan 4 designer decisions): one action buys the food
// and the waterskins a road needs at a pace, and fills the water, within the gold and the weight.

/** The road and how it would be walked, as the travel action names them. */
export type ProvisionFor = {
  routeId: string
  pace?: Pace
  coverTracks?: boolean
  /** Riding hired mounts (they drink, and change the days). */
  hire?: boolean
}

export type ProvisionPlan = {
  /** Rations to buy, and their price at the best shop here. */
  food: number
  foodCost: number
  /** Extra waterskins to buy, and their price. */
  waterskins: number
  waterskinCost: number
  /** Water poured in free, to fill every skin. */
  water: number
  total: number
  /** What stops it buying all the road needs: the gold, the weight, or nothing. */
  limit: BuyLimit
  /** Nothing to buy or fill: the party already carries what the road needs. */
  ready: boolean
}

/** A safety cap on the units the plan adds one by one. */
const MAX_STEPS = 200

/**
 * What the party must buy here so the food and water it carries last the road at this pace
 * without foraging (the forecast the roads-out preview uses): rations, and extra waterskins when
 * the skins can't hold the water the road needs. Waterskins come first, since water can't be
 * bought on the road; the food is bought with what is left, within the gold and short of being
 * overloaded. Null outside a settlement, for a road that doesn't start here, or mid-encounter.
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
  const { pace, coverTracks } = paceFor(route, plan.pace, plan.coverTracks)
  const members = state.party.length
  const forecast = (s: GameState) =>
    forecastJourney(s, route, pace, coverTracks, false, {
      speed: landSpeed(s, content, route.terrain, hired),
      content,
      animalWater: animalWater(s, content, hired),
      escorts: escortPassengers(s),
    })
  const runsOut = (s: GameState, code: 'foodRunsOut' | 'waterRunsOut') =>
    forecast(s).warnings.some((w) => w.code === code)

  // Waterskins: enough to hold the road's water, as many as the gold and the weight allow.
  let limit: BuyLimit = null
  let skins = 0
  const withSkins = (n: number): GameState => {
    const waterskins = state.waterskins + n
    return {
      ...state,
      waterskins,
      goods: refillWater(state.goods, waterCapacity(members, waterskins)),
    }
  }
  while (runsOut(withSkins(skins), 'waterRunsOut') && skins < MAX_STEPS) skins += 1
  if (skins * WATERSKIN_PRICE > state.gold) {
    skins = Math.floor(state.gold / WATERSKIN_PRICE)
    limit = 'gold'
  }
  while (skins > 0 && load(withSkins(skins), content).level === 'overloaded') {
    skins -= 1
    limit = 'weight'
  }
  const skinned = { ...withSkins(skins), gold: state.gold - skins * WATERSKIN_PRICE }

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
  const water = Math.max(0, partyWaterCapacity(state) - goodsOf(state.goods, 'water'))
  const waterskinCost = skins * WATERSKIN_PRICE
  return {
    food,
    foodCost,
    waterskins: skins,
    waterskinCost,
    water,
    total: foodCost + waterskinCost,
    limit,
    // A party that can't afford a single ration isn't ready, it is broke.
    ready: food === 0 && skins === 0 && water === 0 && limit === null,
  }
}

/** Buys and fills what provisionPlan says, logging each purchase. */
export function provision(state: GameState, content: Content, plan: ProvisionFor): GameState {
  const p = provisionPlan(state, content, plan)
  if (!p) return appendLog(state, 'There is nothing to provision here.', 'bad')
  const route = edgeById(state, content, plan.routeId)!
  const to = settlementName(state, otherEnd(route, state.location!))
  if (p.ready)
    return appendLog(state, `The party already has what the road to ${to} needs.`, 'info')
  let next = p.waterskins > 0 ? buyWaterskin(state, p.waterskins) : state
  if (p.food > 0) next = buyGoods(next, content, 'food', p.food)
  next = { ...next, goods: refillWater(next.goods, partyWaterCapacity(next)) }
  const short =
    p.limit === 'gold'
      ? ', all the gold allows'
      : p.limit === 'weight'
        ? ', all the party can carry'
        : ''
  return appendLog(next, `Provisioned for the road to ${to}${short}.`, p.limit ? 'bad' : 'info')
}
