import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type {
  DomainState,
  Kingdom,
  LandState,
  RegionKingdom,
  RegionState,
} from '../../schema/world'
import type { Draw } from '../rng'
import { generatePlaceName, realmName } from './names'
import type { Territory } from './territory'

/** How many kingdoms a world rolls, capped by the number of capital markers. */
export const KINGDOMS = { min: 8, max: 12 }
/** A kingdom's total defence, split across its domains by distance from the seat. */
export const DEFENCE = { min: 10, max: 25 }
/** A domain h hops from its seat weighs 1 / (1 + SEAT_FALLOFF × h) in the garrison split. */
export const SEAT_FALLOFF = 0.5
/** A frontier domain in a land the kingdom already holds is this much likelier to be claimed. */
export const SAME_LAND_WEIGHT = 2
/** Ruling ancestries are picked by weight; any playable ancestry not listed weighs 1. */
export const RULER_WEIGHTS: Readonly<Record<string, number>> = { human: 3 }
/** A threat's weight in a region of a biome it favours, and in one it doesn't. */
export const FAVOURED = 3
export const UNFAVOURED = 0.5

export type Politics = {
  kingdoms: Kingdom[]
  lands: Record<string, LandState>
  domains: Record<string, DomainState>
}

/** How far a threat outweighs the garrison, from 0 (held) to 3 (rampant). */
export const threatLevelFor = (strength: number, garrison: number): number =>
  Math.min(3, Math.max(0, Math.round(strength - garrison)))

/** Hops from the kingdom's seat to each of its domains, over its own domains only. */
export function seatHops(
  kingdom: Pick<Kingdom, 'seat' | 'domains'>,
  territory: Pick<Territory, 'adjacent'>
): Record<string, number> {
  const own = new Set(kingdom.domains)
  const hops: Record<string, number> = { [kingdom.seat]: 0 }
  const queue = [kingdom.seat]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of territory.adjacent[id] ?? []) {
      if (!own.has(next) || Object.hasOwn(hops, next)) continue
      hops[next] = hops[id] + 1
      queue.push(next)
    }
  }
  // Every domain is reached through its own kingdom's, but stay safe for odd data.
  const far = Math.max(0, ...Object.values(hops)) + 1
  for (const id of kingdom.domains) if (!Object.hasOwn(hops, id)) hops[id] = far
  return hops
}

/** Each land's roaming threat, weighted towards threats that favour its biome, and its strength. */
function rollLands(d: Draw, content: Content): Record<string, LandState> {
  const lands: Record<string, LandState> = {}
  const regions = sortedEntries(content.regions)
  if (regions.length === 0) return lands
  const threats = sortedEntries(content.threats)
  if (threats.length === 0) throw new Error('content has no threats')
  for (const region of regions) {
    const threat = d.weighted(threats, (t) =>
      t.biomes.length === 0 ? 1 : t.biomes.includes(region.biome) ? FAVOURED : UNFAVOURED
    )
    lands[region.id] = {
      threat: threat.id,
      threatStrength: d.int(threat.strength.min, threat.strength.max),
    }
  }
  return lands
}

/**
 * The political layer over domains (design §6). Kingdoms are seeded at distinct capital markers
 * (KINGDOMS, at most one per marker), then the smallest kingdom that can grow claims a bordering
 * domain, preferring lands it already holds (SAME_LAND_WEIGHT). A domain no kingdom can reach
 * founds its own, seated at its settlement. Each kingdom's defence is split into garrisons that
 * thin out with hops from the seat (SEAT_FALLOFF). Every land rolls its threat.
 * `kingdomCount` overrides the roll (for tests).
 */
export function generatePolitics(
  d: Draw,
  content: Content,
  territory: Pick<Territory, 'adjacent'>,
  usedNames: Set<string>,
  kingdomCount?: number
): Politics {
  const sites = sortedEntries(content.settlements)
  if (sites.length === 0) return { kingdoms: [], lands: rollLands(d, content), domains: {} }
  const capitals = sites.filter((s) => s.capital).map((s) => s.id)
  const count = Math.min(capitals.length, kingdomCount ?? d.int(KINGDOMS.min, KINGDOMS.max))

  const owner = new Map<string, number>()
  const seats: string[] = []
  const free = [...capitals]
  for (let k = 0; k < count; k++) {
    const seat = free.splice(d.int(0, free.length - 1), 1)[0]
    owner.set(seat, k)
    seats.push(seat)
  }
  const landOf = (id: string) => content.settlements[id].region
  while (owner.size < sites.length) {
    const held = seats.map(() => [] as string[])
    for (const [id, k] of owner) held[k].push(id)
    const frontier = (k: number) =>
      [...new Set(held[k].flatMap((id) => territory.adjacent[id] ?? []))]
        .filter((id) => !owner.has(id) && Object.hasOwn(content.settlements, id))
        .sort(byCodeUnit)
    const growable = seats.map((_, k) => k).filter((k) => frontier(k).length > 0)
    if (growable.length === 0) {
      const founder = sites.find((s) => !owner.has(s.id))!.id
      owner.set(founder, seats.length)
      seats.push(founder)
      continue
    }
    const smallest = Math.min(...growable.map((k) => held[k].length))
    const k = d.pick(growable.filter((g) => held[g].length === smallest))
    const lands = new Set(held[k].map(landOf))
    owner.set(
      d.weighted(frontier(k), (id) => (lands.has(landOf(id)) ? SAME_LAND_WEIGHT : 1)),
      k
    )
  }

  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const kingdoms: Kingdom[] = seats.map((seat, k) => {
    const place = generatePlaceName(d, content, usedNames)
    usedNames.add(place)
    return {
      id: `kingdom-${k + 1}`,
      name: realmName(d, content, place),
      ancestry:
        playable.length > 0 ? d.weighted(playable, (a) => RULER_WEIGHTS[a.id] ?? 1).id : 'human',
      seat,
      domains: sites.filter((s) => owner.get(s.id) === k).map((s) => s.id),
      defence: d.int(DEFENCE.min, DEFENCE.max),
    }
  })

  const domains: Record<string, DomainState> = {}
  for (const kingdom of kingdoms) {
    const hops = seatHops(kingdom, territory)
    const weight = (id: string) => 1 / (1 + SEAT_FALLOFF * hops[id])
    const total = kingdom.domains.reduce((sum, id) => sum + weight(id), 0)
    for (const id of kingdom.domains) {
      domains[id] = {
        kingdom: kingdom.id,
        land: landOf(id),
        garrison: (kingdom.defence * weight(id)) / total,
      }
    }
  }
  return { kingdoms, lands: rollLands(d, content), domains }
}

// ---------------------------------------------------------------------------------------------
// The v3 layer over regions, still used by generateWorld until GameState v4.
// ---------------------------------------------------------------------------------------------

const REGION_KINGDOMS = { min: 4, max: 6 }
const REGION_DEFENCE = { min: 4, max: 10 }
/** Seeds prefer regions with a capital marker, by this factor. */
const CAPITAL_SEED_WEIGHT = 3

export type RegionPolitics = { kingdoms: RegionKingdom[]; regions: Record<string, RegionState> }

/** Regions joined by at least one route (by land or by sea), each list sorted. */
function neighbours(content: Content): Map<string, string[]> {
  const links = new Map<string, Set<string>>()
  const regionOf = (id: string) =>
    Object.hasOwn(content.settlements, id) ? content.settlements[id].region : undefined
  for (const route of sortedEntries(content.routes)) {
    const a = regionOf(route.from)
    const b = regionOf(route.to)
    if (!a || !b || a === b) continue
    if (!links.has(a)) links.set(a, new Set())
    if (!links.has(b)) links.set(b, new Set())
    links.get(a)!.add(b)
    links.get(b)!.add(a)
  }
  return new Map([...links].map(([id, set]) => [id, [...set].sort(byCodeUnit)]))
}

/**
 * The v3 political layer, until GameState v4 moves the world over to domains. Divides the regions among kingdoms: seeds first (preferring capital markers), then the
 * smallest kingdom that can grow claims a neighbouring region, until every region is owned.
 * A region no kingdom can reach founds its own. `kingdomCount` overrides the roll (for tests).
 */
export function generateRegionPolitics(
  d: Draw,
  content: Content,
  usedNames: Set<string>,
  kingdomCount?: number
): RegionPolitics {
  const regionIds = sortedEntries(content.regions).map((r) => r.id)
  if (regionIds.length === 0) return { kingdoms: [], regions: {} }
  const sites = sortedEntries(content.settlements)
  const capitalRegions = new Set(sites.filter((s) => s.capital).map((s) => s.region))
  const count = Math.min(
    regionIds.length,
    kingdomCount ?? d.int(REGION_KINGDOMS.min, REGION_KINGDOMS.max)
  )

  // count ≤ the number of regions, so there is always a free region to seed.
  const owner = new Map<string, number>()
  for (let k = 0; k < count; k++) {
    const free = regionIds.filter((id) => !owner.has(id))
    owner.set(
      d.weighted(free, (id) => (capitalRegions.has(id) ? CAPITAL_SEED_WEIGHT : 1)),
      k
    )
  }
  const links = neighbours(content)
  let kingdoms = count
  while (owner.size < regionIds.length) {
    const frontier = (k: number) =>
      [...owner]
        .filter(([, owned]) => owned === k)
        .flatMap(([id]) => links.get(id) ?? [])
        .filter((id, i, all) => !owner.has(id) && all.indexOf(id) === i)
        .sort(byCodeUnit)
    const sizes = Array.from(
      { length: kingdoms },
      (_, k) => [...owner.values()].filter((o) => o === k).length
    )
    const growable = sizes.map((_, k) => k).filter((k) => frontier(k).length > 0)
    if (growable.length === 0) {
      owner.set(
        regionIds.find((id) => !owner.has(id))!,
        kingdoms++
      )
      continue
    }
    const smallest = Math.min(...growable.map((k) => sizes[k]))
    const k = d.pick(growable.filter((g) => sizes[g] === smallest))
    owner.set(d.pick(frontier(k)), k)
  }

  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const result: RegionKingdom[] = []
  for (let k = 0; k < kingdoms; k++) {
    const regions = regionIds.filter((id) => owner.get(id) === k)
    const land = sites.filter((s) => regions.includes(s.region))
    const markers = land.filter((s) => s.capital)
    const place = generatePlaceName(d, content, usedNames)
    usedNames.add(place)
    result.push({
      id: `kingdom-${k + 1}`,
      name: realmName(d, content, place),
      ancestry:
        playable.length > 0 ? d.weighted(playable, (a) => RULER_WEIGHTS[a.id] ?? 1).id : 'human',
      capital: d.pick(markers.length > 0 ? markers : land).id,
      regions,
      defence: d.int(REGION_DEFENCE.min, REGION_DEFENCE.max),
    })
  }

  const threats = sortedEntries(content.threats)
  if (threats.length === 0) throw new Error('content has no threats')
  const regions: Record<string, RegionState> = {}
  for (const region of sortedEntries(content.regions)) {
    const kingdom = result[owner.get(region.id)!]
    const threat = d.weighted(threats, (t) =>
      t.biomes.length === 0 ? 1 : t.biomes.includes(region.biome) ? FAVOURED : UNFAVOURED
    )
    const strength = d.int(threat.strength.min, threat.strength.max)
    regions[region.id] = {
      kingdom: kingdom.id,
      threat: threat.id,
      threatStrength: strength,
      threatLevel: threatLevelFor(strength, kingdom.defence / kingdom.regions.length),
    }
  }
  return { kingdoms: result, regions }
}
