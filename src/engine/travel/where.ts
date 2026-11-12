import type { GameState } from '../../schema/state'

// Where the party is, for actions that only work in a settlement. Kept apart so the economy and
// town modules can use it without importing the travel actions.

/** In a settlement (not on the road, and not at a point of interest). */
export const inSettlement = (state: Pick<GameState, 'travel' | 'location' | 'world'>): boolean =>
  !state.travel && state.location !== null && Object.hasOwn(state.world.settlements, state.location)

/** Refusals start "Not here" at a point of interest, where there is nothing to buy or sell. */
export const notHere = (state: Pick<GameState, 'travel' | 'location'>, text: string): string =>
  !state.travel && state.location !== null
    ? `Not here: ${text[0].toLowerCase()}${text.slice(1)}`
    : text
