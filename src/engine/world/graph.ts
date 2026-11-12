import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { Biome } from '../../schema/types'
import type { GameState } from '../../schema/state'
import type { MapPoint, Route } from '../../schema/world'
import { straightKm } from './geo'
import { offRoadKm, territory } from './territory'
import { OFF_ROAD_WINDING, PATH_DETOUR } from '../constants'

// The travel graph (design §6–7): settlements and discovered points of interest are its nodes;
// content routes and the paths to discovered POIs are its edges. Travel, previews and the map read
// it instead of content.routes.

export type MapNode = {
  id: string
  kind: 'settlement' | 'poi'
  at: MapPoint
  /** The domain (settlement id) it is in: a settlement's own, a POI's owner. */
  domain: string
  /** The land (a `regions` id) of that domain. */
  land: string
  island: string
}

type World = Pick<GameState, 'world'>

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/** A settlement or a POI (discovered or not) as a map node; null for anything else. */
export function nodeOf(state: World, content: Content, id: string): MapNode | null {
  const site = own(content.settlements, id)
  if (site) {
    return {
      id,
      kind: 'settlement',
      at: site.at,
      domain: id,
      land: site.region,
      island: site.island,
    }
  }
  const poi = own(state.world.pois, id)
  const spot = own(content.landSpots, poi?.spot)
  const home = own(content.settlements, poi?.domain)
  if (!poi || !spot || !home) return null
  return {
    id,
    kind: 'poi',
    at: spot.at,
    domain: poi.domain,
    land: home.region,
    island: spot.island,
  }
}

export const pathId = (poiId: string, settlementId: string): string =>
  `path-${poiId}-${settlementId}`

/**
 * The paths from a POI (discovered or not): always one to its own settlement, plus one to every
 * other settlement on its island whose off-road km is within PATH_DETOUR of the own path's, so
 * the POI is a waypoint between towns. Sorted by id. Each runs from the POI to the settlement,
 * over the spot's terrain, as dangerous as the type's pathDanger.
 */
export function poiPaths(state: World, content: Content, poiId: string): Route[] {
  const poi = own(state.world.pois, poiId)
  const spot = own(content.landSpots, poi?.spot)
  const home = own(content.settlements, poi?.domain)
  if (!poi || !spot || !home) return []
  const terrain: Biome = spot.terrain ?? own(content.regions, home.region)?.biome ?? 'plains'
  const danger = own(content.poiTypes, poi.type)?.pathDanger ?? 1
  const ownKm = territory(content).km[spot.id] ?? straightKm(spot.at, home.at) * OFF_ROAD_WINDING
  const path = (to: string, km: number): Route => ({
    id: pathId(poiId, to),
    from: poiId,
    to,
    km: Math.max(1, Math.round(km)),
    terrain,
    danger,
  })
  const detours = sortedEntries(content.settlements)
    .filter((s) => s.id !== home.id && s.island === spot.island)
    .flatMap((s) => {
      const km = own(offRoadKm(content, s.id), spot.id)
      return km !== undefined && km <= PATH_DETOUR * ownKm + 1e-9 ? [path(s.id, km)] : []
    })
  return [path(home.id, ownKm), ...detours].sort((a, b) => byCodeUnit(a.id, b.id))
}

const discovered = (state: World, id: string): boolean =>
  own(state.world.pois, id)?.discovered === true

/**
 * The edges at a node, sorted by id: a settlement's content routes and the paths to it from
 * discovered POIs; a discovered POI's paths. An undiscovered POI has none.
 */
export function edgesFrom(state: World, content: Content, nodeId: string): Route[] {
  if (Object.hasOwn(state.world.pois, nodeId)) {
    return discovered(state, nodeId) ? poiPaths(state, content, nodeId) : []
  }
  const routes = sortedEntries(content.routes).filter((r) => r.from === nodeId || r.to === nodeId)
  const paths = Object.keys(state.world.pois)
    .filter((id) => discovered(state, id))
    .flatMap((id) => poiPaths(state, content, id))
    .filter((p) => p.to === nodeId)
  return [...routes, ...paths].sort((a, b) => byCodeUnit(a.id, b.id))
}

/**
 * The terrain where the party is: the spot of the POI it is visiting or at (or its domain's land),
 * its journey's route on the road, or its settlement's land. Null when unknown.
 */
export function terrainHere(
  state: Pick<GameState, 'world' | 'travel' | 'location' | 'encounter'>,
  content: Content,
  id: string | null = state.encounter?.poi ?? null
): Biome | null {
  const at = id ?? (state.travel ? null : state.location)
  if (at === null) {
    return state.travel ? (edgeById(state, content, state.travel.route)?.terrain ?? null) : null
  }
  const poi = own(state.world.pois, at)
  const spot = own(content.landSpots, poi?.spot)
  if (spot?.terrain) return spot.terrain
  const site = own(content.settlements, poi?.domain ?? at)
  return own(content.regions, site?.region)?.biome ?? null
}

/** A point of interest with a spring or well (its type's `water`): arriving or camping refills. */
export function springAt(
  state: Pick<GameState, 'world'>,
  content: Content,
  id: string | null
): boolean {
  const poi = own(state.world.pois, id)
  return own(content.poiTypes, poi?.type)?.water ?? false
}

const PATH = /^path-(poi-\d+)-(.+)$/

/** A content route or a path to a discovered POI, by id; null if there is none. */
export function edgeById(state: World, content: Content, id: string): Route | null {
  const route = own(content.routes, id)
  if (route) return route
  const poiId = PATH.exec(id)?.[1]
  if (!poiId || !discovered(state, poiId)) return null
  return poiPaths(state, content, poiId).find((p) => p.id === id) ?? null
}
