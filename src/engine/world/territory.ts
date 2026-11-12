import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { Biome } from '../../schema/constants'
import { PX_PER_KM, type MapPoint } from '../../schema/world'
import { KM_PER_DAY } from '../travel/routes'
import { straightKm } from './geo'

// Domain territory (design §6): every settlement is a domain that owns the land spots nearest to it
// in travel days. Computed from content and memoised, never stored, so it can't go stale.

/** The land-spot grid read off the map (scripts/map/sample_land_spots.py): 100 px apart. */
export const SPOT_SPACING_PX = 100
/** The grid's spacing in km, about 21. */
export const SPOT_SPACING_KM = SPOT_SPACING_PX / PX_PER_KM
/** Two spots, or a spot and a settlement, closer than this are linked (≈1.6 grid steps). */
export const SPOT_LINK_KM = 1.6 * SPOT_SPACING_KM
/** Off-road travel winds: km on foot are the straight line × this. */
export const OFF_ROAD_WINDING = 1.2

export type Territory = {
  /** The domain (settlement id) each reachable spot belongs to, by spot id. */
  domainOf: Record<string, string>
  /** Off-road km from each reachable spot to its domain's settlement, by spot id. */
  km: Record<string, number>
  /** Domains that border each other or are joined by a route (sea routes too), sorted. */
  adjacent: Record<string, string[]>
  /** Each domain's spots, sorted; every settlement has an entry, maybe empty. */
  spots: Record<string, string[]>
}

/** A node of the spot graph: a land spot, or a settlement (a source). */
type Node = { id: string; at: MapPoint; island: string; terrain?: Biome; settlement: boolean }

/** A node's neighbours with the straight km to each, both directions. */
type Graph = { nodes: Node[]; index: Map<string, number>; links: { to: number; km: number }[][] }

const graphs = new WeakMap<Content, Graph>()

/** Spots and settlements, linked within SPOT_LINK_KM on the same island. */
function spotGraph(content: Content): Graph {
  const cached = graphs.get(content)
  if (cached) return cached
  const nodes: Node[] = [
    ...sortedEntries(content.settlements).map((s) => ({
      id: s.id,
      at: s.at,
      island: s.island,
      settlement: true,
    })),
    ...sortedEntries(content.landSpots).map((s) => ({
      id: s.id,
      at: s.at,
      island: s.island,
      terrain: s.terrain,
      settlement: false,
    })),
  ]
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const links: { to: number; km: number }[][] = nodes.map(() => [])
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      if (a.island !== b.island || (a.settlement && b.settlement)) continue
      const km = straightKm(a.at, b.at)
      if (km > SPOT_LINK_KM) continue
      links[i].push({ to: j, km })
      links[j].push({ to: i, km })
    }
  }
  const graph = { nodes, index, links }
  graphs.set(content, graph)
  return graph
}

/** A settlement's land biome, the terrain of spots that don't name their own. */
function landBiome(content: Content, settlementId: string): Biome {
  const region = content.settlements[settlementId].region
  return Object.hasOwn(content.regions, region) ? content.regions[region].biome : 'plains'
}

/** Days to walk `km` off-road into a spot of this terrain. */
const daysFor = (km: number, terrain: Biome): number =>
  (km * OFF_ROAD_WINDING) / KM_PER_DAY[terrain]

const EPSILON = 1e-9

type Label = { days: number; km: number; source: string }

/**
 * Dijkstra in days from the given settlements over the spot graph. Entering a spot costs its own
 * terrain's speed, or the source settlement's land biome when it has none; ties go to the lower
 * settlement id. Settlements other than the sources are not walked through.
 */
function reach(content: Content, graph: Graph, sources: readonly string[]): (Label | null)[] {
  const best: (Label | null)[] = graph.nodes.map(() => null)
  const done = graph.nodes.map(() => false)
  const biomes = new Map(sources.map((id) => [id, landBiome(content, id)]))
  for (const id of sources) {
    const i = graph.index.get(id)
    if (i !== undefined) best[i] = { days: 0, km: 0, source: id }
  }
  const better = (a: Label, b: Label | null) =>
    b === null ||
    a.days < b.days - EPSILON ||
    (Math.abs(a.days - b.days) <= EPSILON && byCodeUnit(a.source, b.source) < 0)
  for (;;) {
    let next = -1
    for (let i = 0; i < best.length; i++) {
      if (done[i] || best[i] === null) continue
      if (next < 0 || better(best[i]!, best[next])) next = i
    }
    if (next < 0) break
    done[next] = true
    const from = best[next]!
    // Only the sources start walks; other settlements are destinations, not waypoints.
    if (graph.nodes[next].settlement && from.days > 0) continue
    for (const { to, km } of graph.links[next]) {
      const node = graph.nodes[to]
      if (done[to] || node.settlement) continue
      const terrain = node.terrain ?? biomes.get(from.source)!
      const label = {
        days: from.days + daysFor(km, terrain),
        km: from.km + km * OFF_ROAD_WINDING,
        source: from.source,
      }
      if (better(label, best[to])) best[to] = label
    }
  }
  return best
}

const memo = new WeakMap<Content, Territory>()

/**
 * Which domain each land spot belongs to, how far it is from its settlement, and which domains
 * border each other. Memoised per Content object.
 */
export function territory(content: Content): Territory {
  const cached = memo.get(content)
  if (cached) return cached
  const graph = spotGraph(content)
  const settlements = sortedEntries(content.settlements).map((s) => s.id)
  const labels = reach(content, graph, settlements)

  const domainOf: Record<string, string> = {}
  const km: Record<string, number> = {}
  const spots: Record<string, string[]> = Object.fromEntries(settlements.map((id) => [id, []]))
  graph.nodes.forEach((node, i) => {
    const label = labels[i]
    if (node.settlement || label === null) return
    domainOf[node.id] = label.source
    km[node.id] = label.km
    spots[label.source].push(node.id)
  })

  const near = new Map(settlements.map((id) => [id, new Set<string>()]))
  const join = (a: string | undefined, b: string | undefined) => {
    if (!a || !b || a === b || !near.has(a) || !near.has(b)) return
    near.get(a)!.add(b)
    near.get(b)!.add(a)
  }
  const owner = (i: number) =>
    graph.nodes[i].settlement ? graph.nodes[i].id : domainOf[graph.nodes[i].id]
  graph.links.forEach((list, i) => {
    for (const { to } of list) join(owner(i), owner(to))
  })
  for (const route of sortedEntries(content.routes)) join(route.from, route.to)

  const result: Territory = {
    domainOf,
    km,
    spots,
    adjacent: Object.fromEntries([...near].map(([id, set]) => [id, [...set].sort(byCodeUnit)])),
  }
  memo.set(content, result)
  return result
}

const fromOne = new WeakMap<Content, Map<string, Record<string, number>>>()

/**
 * Off-road km from one settlement to every spot it can reach, along its quickest way (the same
 * walk as territory, from this settlement alone). Memoised per Content object and settlement.
 */
export function offRoadKm(content: Content, settlementId: string): Record<string, number> {
  let cache = fromOne.get(content)
  if (!cache) {
    cache = new Map()
    fromOne.set(content, cache)
  }
  const cached = cache.get(settlementId)
  if (cached) return cached
  const result: Record<string, number> = {}
  if (Object.hasOwn(content.settlements, settlementId)) {
    const graph = spotGraph(content)
    reach(content, graph, [settlementId]).forEach((label, i) => {
      if (label && !graph.nodes[i].settlement) result[graph.nodes[i].id] = label.km
    })
  }
  cache.set(settlementId, result)
  return result
}
