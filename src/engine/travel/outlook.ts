import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { animalWater, camelWaterSaving } from '../town/animals'
import { escortPassengers } from '../town/contract-hooks'
import { kmPerDay, routeTerrain } from './routes'
import { forecastJourney } from './warnings'

/** Whether the food and the water carried last to the end of the road (true when they do). */
export type SupplyOutlook = { food: boolean; water: boolean }

/**
 * The supplies on the rest of the journey under way: whether the food and the water carried,
 * with average foraging if the journey forages, last the km still to go at its pace (the same
 * forecast as the roads-out preview). Both true off the road or when the road has gone.
 */
export function supplyOutlook(state: GameState, content: Content): SupplyOutlook {
  const travel = state.travel
  const terrain = travel ? routeTerrain(state, content, travel) : null
  if (!travel || !terrain || travel.kmDone >= travel.km) return { food: true, water: true }
  const { warnings } = forecastJourney(
    state,
    { km: travel.km - travel.kmDone, terrain },
    travel.pace,
    travel.forage,
    {
      // The speed the journey set out at (load and exhaustion are fixed at departure).
      speed: travel.kmPerDay / kmPerDay(terrain, travel.pace),
      content,
      animalWater: animalWater(state, content),
      waterSaving: camelWaterSaving(state, content, terrain),
      escorts: escortPassengers(state),
    }
  )
  return {
    food: !warnings.some((w) => w.code === 'foodRunsOut'),
    water: !warnings.some((w) => w.code === 'waterRunsOut'),
  }
}

export const suppliesLast = (o: SupplyOutlook): boolean => o.food && o.water
