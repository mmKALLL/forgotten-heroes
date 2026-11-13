import type { Content } from '../content/build'
import type { GameState } from '../schema/state'
import type { RunEnding } from '../schema/types'
import { runEnding } from './crisis/ending'
import { actOpen, crisisStatus, planKnown } from './crisis/status'
import { actNumeral } from './crisis/text'

// What a save slot shows in the Saves menu (Plan 5b, U1). Plain data: the UI words it.

export type SlotSummary = {
  day: number
  gold: number
  party: { name: string; level: number }[]
  /** Where the party is, or where it is headed when on the road. */
  place: string
  onRoad: boolean
  /** How the run ended (the Crisis won or lost, or the party fallen); null while it goes on. */
  ending: RunEnding | null
  /** The Crisis act open once the plan is known ("Act II · 34d" to its due day); null otherwise. */
  crisis: { numeral: string; daysLeft: number } | null
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
    ending: runEnding(state),
    crisis: crisisLine(state),
  }
}

function crisisLine(state: GameState): SlotSummary['crisis'] {
  if (!state.crisis) return null
  const status = crisisStatus(state.crisis, state.day)
  if (!actOpen(status.phase) || status.act === null || !planKnown(state.crisis)) return null
  return { numeral: actNumeral(status.act), daysLeft: status.daysLeft! }
}
