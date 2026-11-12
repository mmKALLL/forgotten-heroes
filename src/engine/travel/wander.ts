import type { Content } from '../../content/build'
import type { Character, GameState } from '../../schema/state'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { encounterOptions } from '../encounters/preview'
import { step } from '../state'
import { routeOptions } from './preview'
import { goodsOf } from './supplies'

/** Exhausted or badly hurt, but alive (a member at MAX_EXHAUSTION is beyond resting). */
const needsRest = (c: Character) =>
  c.exhaustion < MAX_EXHAUSTION && (c.exhaustion > 0 || c.hp < c.maxHp / 2)

/** Picks one of `count` choices for leg `leg`. */
export type Pick = (leg: number, count: number) => number

/** Days a wandering party rests in a settlement, at most, while anyone needs it. */
const MAX_REST_DAYS = 6

/**
 * A fixed policy for tests and the simulation smoke test (design §10). In a settlement it rests
 * (buying each day's rations) while anyone is exhausted or badly hurt, up to MAX_REST_DAYS. Each
 * leg then takes the available road at `pick(leg, count)`, at the pace at `pickPace(leg, count)`
 * among the road's pace options (covering tracks is one of them), buying the food that pace
 * needs first. It continues, choosing the first available option in every encounter and making
 * camp when stuck, until it arrives.
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
        const short = state.party.length - goodsOf(state.goods, 'food')
        if (short > 0) state = step(state, { type: 'buyFood', amount: short }, content)
        state = step(state, { type: 'rest' }, content)
      }
      const roads = routeOptions(state, content).filter((o) => o.available)
      if (roads.length === 0) {
        state = step(state, { type: 'rest' }, content)
        continue
      }
      const road = roads[pick(leg, roads.length)]
      const { pace, coverTracks, food } = road.paces[pickPace(leg, road.paces.length)]
      const missing = food - goodsOf(state.goods, 'food')
      if (missing > 0) state = step(state, { type: 'buyFood', amount: missing }, content)
      state = step(state, { type: 'travel', routeId: road.routeId, pace, coverTracks }, content)
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
