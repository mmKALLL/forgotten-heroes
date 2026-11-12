import type { Content } from '../content/build'
import type { GameState } from '../schema/state'

// What a save slot shows in the Saves menu (Plan 5b, U1). Plain data: the UI words it.

/** How a run ended: the Crisis won or lost, or the party fallen. */
export type RunEnding = 'won' | 'lost' | 'fallen'

export type SlotSummary = {
  day: number
  gold: number
  party: { name: string; level: number }[]
  /** Where the party is, or where it is headed when on the road. */
  place: string
  onRoad: boolean
  /** Null while the run goes on. Filled from the run's ending once the engine has one (Plan 5b, E5). */
  ending: RunEnding | null
}

/** A settlement's or a site's name in this world (the id itself if it is gone). */
const placeName = (state: GameState, id: string): string =>
  (Object.hasOwn(state.world.settlements, id) && state.world.settlements[id].name) ||
  (Object.hasOwn(state.world.pois, id) && state.world.pois[id].name) ||
  id

export function slotSummary(state: GameState, _content: Content): SlotSummary {
  const onRoad = state.travel !== null
  const at = state.travel?.to ?? state.location
  return {
    day: state.day,
    gold: state.gold,
    party: state.party.map((c) => ({ name: c.name, level: c.level })),
    place: at === null ? '' : placeName(state, at),
    onRoad,
    ending: null,
  }
}
