import type { Content } from '../../content/build'
import type { Character, GameState } from '../../schema/state'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { encounterOptions } from '../encounters/preview'
import { step } from '../state'
import { routeOptions, type PaceOption } from './preview'
import { FOOD_PRICE, goodsOf, restOption } from './supplies'
import { WATERSKIN_PRICE } from './tuning'

/** Exhausted or badly hurt, but alive (a member at MAX_EXHAUSTION is beyond resting). */
const needsRest = (c: Character) =>
  c.exhaustion < MAX_EXHAUSTION && (c.exhaustion > 0 || c.hp < c.maxHp / 2)

/** Picks one of `count` choices for leg `leg`. */
export type Pick = (leg: number, count: number) => number

/** Days a wandering party rests in a settlement, at most, while anyone needs it. */
const MAX_REST_DAYS = 6

/** A wandering party only takes lodging while it keeps at least this much gold for the road. */
const LODGING_RESERVE = 10

/** Extra waterskins a wandering party buys for one leg, at most. */
const MAX_WATERSKINS_PER_LEG = 6

const dry = (option: PaceOption) => option.warnings.some((w) => w.code === 'waterRunsOut')

/**
 * A fixed policy for tests and the simulation smoke test (design §10). In a settlement it rests
 * (at an inn while it keeps LODGING_RESERVE gold, otherwise buying each day's rations) while anyone is exhausted or
 * badly hurt, up to MAX_REST_DAYS. Each leg then takes the available road at `pick(leg, count)`,
 * at the pace at `pickPace(leg, count)` among the road's pace options (covering tracks is one of
 * them). Before setting out it buys waterskins while the preview says the water runs out even with
 * foraging (keeping enough gold for food), then the food that pace needs. With no road it can pay
 * for, it stows away on a ship if it can. It forages on the way, continues, chooses the first
 * available option in every encounter and makes camp when stuck, until it arrives.
 */
export function wander(
  start: GameState,
  content: Content,
  legs: number,
  pick: Pick = (leg, count) => leg % count,
  pickPace: Pick = (leg, count) => (leg + 2) % count
): GameState {
  let state = start
  for (let leg = 0; leg < legs; leg++) {
    if (!state.travel) {
      for (let day = 0; day < MAX_REST_DAYS && state.party.some(needsRest); day++) {
        const lodging = state.gold - restOption(state).lodgingCost >= LODGING_RESERVE
        const short = state.party.length - goodsOf(state.goods, 'food')
        if (short > 0 && !lodging) {
          state = step(state, { type: 'buyFood', amount: short }, content)
        }
        state = step(state, { type: 'rest', lodging }, content)
      }
      const options = routeOptions(state, content)
      const roads = options.filter((o) => o.available)
      if (roads.length === 0) {
        const ship = options.find((o) => o.stowaway !== null)
        state = ship
          ? step(state, { type: 'travel', routeId: ship.routeId, stowaway: true }, content)
          : step(state, { type: 'rest' }, content)
        if (!ship) continue
      } else {
        const road = roads[pick(leg, roads.length)]
        const index = pickPace(leg, road.paces.length)
        const paceOf = () =>
          routeOptions(state, content).find((o) => o.routeId === road.routeId)!.paces[index]
        let option = paceOf()
        const foodCost = () => Math.max(0, option.food.needed - option.food.carried) * FOOD_PRICE
        for (
          let bought = 0;
          dry(option) &&
          bought < MAX_WATERSKINS_PER_LEG &&
          state.gold - foodCost() >= WATERSKIN_PRICE;
          bought++
        ) {
          state = step(state, { type: 'buyWaterskin' }, content)
          option = paceOf()
        }
        const missing = option.food.needed - option.food.carried
        if (missing > 0) state = step(state, { type: 'buyFood', amount: missing }, content)
        const { pace, coverTracks } = option
        state = step(state, { type: 'travel', routeId: road.routeId, pace, coverTracks }, content)
      }
    }
    for (let guard = 0; state.travel && guard < 100; guard++) {
      if (state.encounter) {
        const option = encounterOptions(state).find((o) => o.available)
        state = option
          ? step(state, { type: 'chooseOption', optionId: option.id }, content)
          : step(state, { type: 'closeEncounter' }, content)
        continue
      }
      const before = state.day
      state = step(state, { type: 'continueJourney' }, content)
      if (state.travel && !state.encounter && state.day === before) {
        state = step(state, { type: 'rest' }, content)
      }
    }
    if (state.encounter) state = step(state, { type: 'closeEncounter' }, content)
  }
  return state
}
