import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { poiPaths } from '../world/graph'
import { journeyDays } from './routes'

// How far other places are by road (design §7–§8): the quickest way there over the content routes,
// in days on foot at a steady pace and at a forced march. Rumours date heard prices by it, and
// contracts set their deadlines by it.

/** The quickest way to a place: its km, and the days at a steady pace and on a forced march. */
export type Reach = { km: number; days: number; forcedDays: number }

const cache = new WeakMap<Content, Map<string, Map<string, Reach>>>()

/** The days a leg takes on foot at a steady pace and at a forced march (a ship ignores pace). */
const legDays = (route: Pick<Route, 'km' | 'terrain'>) => ({
  days: journeyDays(route, 'steady'),
  forcedDays: journeyDays(route, 'forced'),
})

/**
 * Every settlement reachable from `from` over the content routes (land and sea), by the fewest
 * steady days (then km, then id), not counting `from` itself. Derived from content only, so it is
 * cached per content.
 */
export function settlementReach(content: Content, from: string): Map<string, Reach> {
  let byFrom = cache.get(content)
  if (!byFrom) cache.set(content, (byFrom = new Map()))
  const known = byFrom.get(from)
  if (known) return known
  const routes = sortedEntries(content.routes)
  const best = new Map<string, Reach>([[from, { km: 0, days: 0, forcedDays: 0 }]])
  const done = new Set<string>()
  for (;;) {
    let next: [string, Reach] | null = null
    for (const [id, r] of best) {
      if (done.has(id)) continue
      if (
        !next ||
        r.days < next[1].days ||
        (r.days === next[1].days && (r.km < next[1].km || (r.km === next[1].km && id < next[0])))
      )
        next = [id, r]
    }
    if (!next) break
    const [id, r] = next
    done.add(id)
    for (const route of routes) {
      if (route.from !== id && route.to !== id) continue
      const other = route.from === id ? route.to : route.from
      if (done.has(other) || !Object.hasOwn(content.settlements, other)) continue
      const leg = legDays(route)
      const cand = {
        km: r.km + route.km,
        days: r.days + leg.days,
        forcedDays: r.forcedDays + leg.forcedDays,
      }
      const old = best.get(other)
      if (!old || cand.days < old.days || (cand.days === old.days && cand.km < old.km))
        best.set(other, cand)
    }
  }
  best.delete(from)
  byFrom.set(from, best)
  return best
}

/** The quickest way from a settlement to a point of interest: by road to one of its paths, then the path. */
export function poiReach(
  state: Pick<GameState, 'world'>,
  content: Content,
  from: string,
  poiId: string
): Reach | null {
  const roads = settlementReach(content, from)
  let best: Reach | null = null
  for (const path of poiPaths(state, content, poiId)) {
    const start = path.to === from ? { km: 0, days: 0, forcedDays: 0 } : roads.get(path.to)
    if (!start) continue
    const leg = legDays(path)
    const cand = {
      km: start.km + path.km,
      days: start.days + leg.days,
      forcedDays: start.forcedDays + leg.forcedDays,
    }
    if (!best || cand.days < best.days || (cand.days === best.days && cand.km < best.km))
      best = cand
  }
  return best
}

/** The settlements reachable from `from`, nearest first (steady days, then km, then id). */
export function nearestSettlements(content: Content, from: string): (Reach & { id: string })[] {
  return [...settlementReach(content, from)]
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => a.days - b.days || a.km - b.km || byCodeUnit(a.id, b.id))
}
