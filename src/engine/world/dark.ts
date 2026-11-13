import type { Content } from '../../content/build'
import type { DungeonRoom } from '../../schema/dungeon'
import type { Position } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { MAX_EXHAUSTION } from '../rules/character'
import type { RollMode } from '../rules/checks'
import { FUEL_PER_DARK_ROOM } from '../constants'

// Dark dungeon rooms and fuel (combat design §7b; Plan 7 Track D). A room marked `dark` is lit
// with FUEL_PER_DARK_ROOM fuel as the party enters it, if the party has it. Without fuel it is
// still explored, but the party is Exposed in every check there, fights included (`unlit` on the
// delve). A party that sees in the dark (seesInDark) needs neither: it burns no fuel. The delve
// preview plans the rooms ahead with the same function (lightRooms) the delve enters them with,
// so what it shows is what happens.

/** How a room is played: not dark (null), lit with fuel, seen by darkvision, or unlit (Exposed). */
export type RoomLight = 'lit' | 'darkvision' | 'unlit'

/**
 * The darkvision rule: every living member but one has a darkvision ancestry, or the only living
 * member has. A party of none sees nothing.
 */
export function seesInDark(state: Pick<GameState, 'party'>, content: Content): boolean {
  const living = state.party.filter((c) => c.exhaustion < MAX_EXHAUSTION)
  if (living.length === 0) return false
  const blind = living.filter((c) => content.ancestries[c.ancestry]?.darkvision !== true).length
  return living.length === 1 ? blind === 0 : blind <= 1
}

/**
 * How each of these rooms will be played if entered in order with the fuel the party has now:
 * null for a room that isn't dark; a dark one is lit while the fuel lasts, then unlit, or seen by
 * darkvision throughout.
 */
export function lightRooms(
  state: Pick<GameState, 'party' | 'goods'>,
  content: Content,
  rooms: readonly Pick<DungeonRoom, 'dark'>[]
): (RoomLight | null)[] {
  const darkvision = seesInDark(state, content)
  let fuel = state.goods.fuel ?? 0
  return rooms.map((room) => {
    if (!room.dark) return null
    if (darkvision) return 'darkvision'
    if (fuel < FUEL_PER_DARK_ROOM) return 'unlit'
    fuel -= FUEL_PER_DARK_ROOM
    return 'lit'
  })
}

/** The room being played is dark and unlit: the party is Exposed in every check there. */
export const roomUnlit = (state: Pick<GameState, 'delve'>): boolean =>
  state.delve?.inRoom === true && state.delve.unlit === true

/** A check's roll mode in an unlit room: Exposed on top (an Edge cancels it, as in 5e). */
export function darkMode(mode: RollMode, unlit: boolean): RollMode {
  if (!unlit) return mode
  return mode === 'advantage' ? 'normal' : 'disadvantage'
}

/** A fight's footing in an unlit room: Exposed on top (an Edge cancels it). */
export function darkFooting(position: Position, unlit: boolean): Position {
  if (!unlit) return position
  return position === 'edge' ? 'normal' : 'exposed'
}
