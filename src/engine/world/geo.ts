import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { PX_PER_KM, type MapPoint, type Route } from '../../schema/world'

export const straightKm = (a: MapPoint, b: MapPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y) / PX_PER_KM

/** The routes that start or end at a settlement, sorted by id. */
export const routesFrom = (content: Content, settlementId: string): Route[] =>
  sortedEntries(content.routes).filter((r) => r.from === settlementId || r.to === settlementId)

export const otherEnd = (route: Route, settlementId: string): string =>
  route.from === settlementId ? route.to : route.from

/**
 * Groups of settlements joined by the routes `use` accepts, each sorted by id, in order of their
 * first member. `among` limits the settlements considered (e.g. one island).
 */
export function components(
  content: Content,
  use: (route: Route) => boolean = () => true,
  among?: ReadonlySet<string>
): string[][] {
  const ids = sortedEntries(content.settlements)
    .map((s) => s.id)
    .filter((id) => !among || among.has(id))
  const links = new Map(ids.map((id) => [id, [] as string[]]))
  for (const route of sortedEntries(content.routes)) {
    if (!use(route) || !links.has(route.from) || !links.has(route.to)) continue
    links.get(route.from)!.push(route.to)
    links.get(route.to)!.push(route.from)
  }
  const seen = new Set<string>()
  const groups: string[][] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    const group: string[] = []
    const queue = [id]
    seen.add(id)
    while (queue.length > 0) {
      const next = queue.shift()!
      group.push(next)
      for (const linked of links.get(next)!) {
        if (seen.has(linked)) continue
        seen.add(linked)
        queue.push(linked)
      }
    }
    groups.push(group.sort(byCodeUnit))
  }
  return groups
}

/** A settlement's name in this world, or its id when the political layer doesn't know it. */
export const settlementName = (state: Pick<GameState, 'world'>, id: string): string =>
  Object.hasOwn(state.world.settlements, id) ? state.world.settlements[id].name : id
