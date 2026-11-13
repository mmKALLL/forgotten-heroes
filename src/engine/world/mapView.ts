import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import type { Kingdom, MapPoint } from '../../schema/world'
import { journeyProgress } from '../travel/preview'
import { nodeOf } from './graph'

// The world map's view model: where the party is drawn, and the kingdoms in the order the map
// lists them.

const lerp = (a: MapPoint, b: MapPoint, t: number): MapPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/**
 * Where the party is on the map: its settlement or site, or on the road the share of the way it
 * has travelled, with `dayShare` of the day under way (auto-travel's glide; 0 at the day's
 * start). Null if it is nowhere on the map.
 */
export function partyPoint(state: GameState, content: Content, dayShare = 0): MapPoint | null {
  const at = (id: string): MapPoint | null => nodeOf(state, content, id)?.at ?? null
  const travel = state.travel
  if (travel) {
    const from = at(travel.from)
    const to = at(travel.to)
    return from && to ? lerp(from, to, journeyProgress(travel, dayShare)) : null
  }
  return state.location ? at(state.location) : null
}

/**
 * The kingdoms nearest first (designer call): by the straight distance from the party to the
 * kingdom's nearest domain, so the one it stands in leads. Ties, and a party nowhere on the map,
 * keep the world's order.
 */
export function kingdomsByDistance(state: GameState, content: Content): Kingdom[] {
  const from = partyPoint(state, content)
  const kingdoms = state.world.kingdoms
  if (!from) return [...kingdoms]
  const distance = (k: Kingdom) =>
    Math.min(
      ...k.domains.map((d) => {
        const at = Object.hasOwn(content.settlements, d) ? content.settlements[d].at : null
        return at ? Math.hypot(at.x - from.x, at.y - from.y) : Infinity
      })
    )
  return kingdoms
    .map((k, i) => ({ k, i, d: distance(k) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(({ k }) => k)
}
