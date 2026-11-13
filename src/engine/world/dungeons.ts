import { sortedEntries, type Content } from '../../content/build'
import type { Dungeon } from '../../schema/dungeon'
import type { Biome } from '../../schema/types'
import type { LandSpot, PoiState, WorldState } from '../../schema/world'
import { daysTo } from '../crisis/generate'
import { createRng, withRng, type Draw } from '../rng'
import { domainThreatLevel, freeSpots } from './pois'
import { territory } from './territory'
import {
  DUNGEON_COUNT,
  DUNGEON_NEAR_COUNT,
  DUNGEON_NEAR_CR,
  DUNGEON_NEAR_DAYS,
  LAIR_CR_BY_THREAT,
} from '../constants'

// Authored dungeons in the world (Plan 6 D2, design §6): each placed at most once, on a free land
// spot of its biomes, as a POI of the placeholder type DUNGEON_TYPE that names it. They are placed
// once the start is known (newGame), from their own salted stream, so the rest of the world (and
// the Crisis) is unchanged; at least DUNGEON_NEAR_COUNT low ones lie near the start.

/** Mixed into the world seed, so placing the dungeons changes no other world draw. */
export const DUNGEON_SALT = 0xd0a6e0a5

/** The poiTypes id of an authored dungeon's site (data/claude/dungeon-sites.json). */
export const DUNGEON_TYPE = 'authored-dungeon'

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/** The authored dungeon delved at a POI, if it names one the content has. */
export const dungeonOf = (
  content: Content,
  poi: Pick<PoiState, 'dungeon'> | undefined
): Dungeon | undefined => own(content.dungeons, poi?.dungeon)

/**
 * The challenge rating a site plays at on a day: an authored dungeon its own; a lair or other
 * hostile site (or an old generic dungeon) LAIR_CR_BY_THREAT by its threat plus its domain's
 * threat level that day. Null for the rest (shrines, experts, the Crisis's sites).
 */
export function siteCr(
  world: Pick<WorldState, 'seed' | 'lands' | 'domains' | 'pois'>,
  content: Content,
  id: string,
  day: number
): number | null {
  const poi = own(world.pois, id)
  if (!poi) return null
  const dungeon = dungeonOf(content, poi)
  if (dungeon) return dungeon.cr
  if (poi.threat === 0 && poi.category !== 'lair' && poi.category !== 'dungeon') return null
  const base = LAIR_CR_BY_THREAT[Math.min(LAIR_CR_BY_THREAT.length - 1, Math.max(1, poi.threat))]
  return base + domainThreatLevel(world, poi.domain, day)
}

/** A spot's terrain: its own, or its domain's land's biome. */
function terrainOf(content: Content, spot: LandSpot, domain: string): Biome | undefined {
  return spot.terrain ?? own(content.regions, own(content.settlements, domain)?.region)?.biome
}

/** The number of a "poi-<n>" id (0 for any other id). */
const poiNumber = (id: string): number => Number(/^poi-(\d+)$/.exec(id)?.[1] ?? 0)

/** The items in a seeded order (Fisher–Yates). */
function shuffled<T>(d: Draw, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = d.int(0, i)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

type Site = { domain: string; spot: LandSpot }

/**
 * The authored dungeons of a world, as new hidden POIs (ids after the highest "poi-<n>"): up to
 * DUNGEON_COUNT, each at most once (none already in the world again), in a seeded order. First,
 * DUNGEON_NEAR_COUNT of CR ≤ DUNGEON_NEAR_CR go on free spots within DUNGEON_NEAR_DAYS steady days
 * of `start` (by road and path), of their biomes when one is in reach, else on any near free spot.
 * Then the rest each go on a free spot of their biomes anywhere, or are left out. A free spot is
 * POI_MIN_KM from its settlement and POI_SPACING_KM from every other POI (pois.ts freeSpots).
 * Pure; the same world and start always place the same dungeons.
 */
export function placeDungeons(
  world: WorldState,
  content: Content,
  start: string | null
): Record<string, PoiState> {
  const type = own(content.poiTypes, DUNGEON_TYPE)
  const already = new Set(Object.values(world.pois).flatMap((p) => p.dungeon ?? []))
  const dungeons = sortedEntries(content.dungeons).filter((g) => !already.has(g.id))
  if (!type || dungeons.length === 0) return {}
  const land = territory(content)
  const domains = sortedEntries(content.settlements)
    .filter((s) => Object.hasOwn(world.domains, s.id))
    .map((s) => s.id)
  const placed: LandSpot[] = Object.values(world.pois).flatMap(
    (p) => own(content.landSpots, p.spot) ?? []
  )
  const free = (): Site[] =>
    domains.flatMap((domain) =>
      freeSpots(content, land, domain, placed).map((spot) => ({ domain, spot }))
    )
  const fits = (g: Dungeon, s: Site) => {
    const terrain = terrainOf(content, s.spot, s.domain)
    return terrain !== undefined && g.biomes.includes(terrain)
  }
  const firstId = 1 + Math.max(0, ...Object.keys(world.pois).map(poiNumber))
  const pois: Record<string, PoiState> = {}
  const room = DUNGEON_COUNT - already.size
  const place = (g: Dungeon, s: Site) => {
    placed.push(s.spot)
    pois[`poi-${firstId + Object.keys(pois).length}`] = {
      type: type.id,
      dungeon: g.id,
      category: type.category,
      spot: s.spot.id,
      domain: s.domain,
      name: g.name,
      threat: 0,
      discovered: false,
      clearedDay: null,
      boonDay: null,
    }
  }
  withRng(createRng((world.seed ^ DUNGEON_SALT) >>> 0), (d) => {
    const order = shuffled(d, dungeons)
    const done = new Set<string>()
    if (start !== null) {
      // Steady days from the start to each free spot, measured once.
      const days = new Map<string, number>()
      for (const s of free()) {
        const n = daysTo(content, start, s.domain, s.spot)
        if (n !== undefined && n <= DUNGEON_NEAR_DAYS) days.set(s.spot.id, n)
      }
      const nearLow = () =>
        order.filter((g) => g.cr <= DUNGEON_NEAR_CR && !done.has(g.id) && !already.has(g.id))
      const lowAlready = Object.values(world.pois).filter((p) => {
        const g = dungeonOf(content, p)
        if (!g || g.cr > DUNGEON_NEAR_CR) return false
        const spot = own(content.landSpots, p.spot)
        const n = spot ? daysTo(content, start, p.domain, spot) : undefined
        return n !== undefined && n <= DUNGEON_NEAR_DAYS
      }).length
      for (let i = lowAlready; i < DUNGEON_NEAR_COUNT && done.size < room; i++) {
        const near = free().filter((s) => days.has(s.spot.id))
        const lows = nearLow()
        if (near.length === 0 || lows.length === 0) break
        const fitting = lows.find((g) => near.some((s) => fits(g, s)))
        const g = fitting ?? lows[0]
        const pool = fitting ? near.filter((s) => fits(g, s)) : near
        place(g, d.pick(pool))
        done.add(g.id)
      }
    }
    for (const g of order) {
      if (done.size >= room) break
      if (done.has(g.id)) continue
      const pool = free().filter((s) => fits(g, s))
      if (pool.length === 0) continue
      place(g, d.pick(pool))
      done.add(g.id)
    }
  })
  return pois
}
