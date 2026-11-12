import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { DomainState, Kingdom, LandState } from '../../schema/world'
import type { Draw } from '../rng'
import { generatePlaceName, realmName } from './names'
import type { Territory } from './territory'

/** How many kingdoms a world rolls, capped by the number of capital markers. */
export const KINGDOMS = { min: 8, max: 12 }
/**
 * A kingdom's total defence, split across its domains by distance from the seat. Tuned with the
 * POIs in place: about 12.5% of domains are Rampant on Altaeus, 7% before lairs and dungeons add
 * their threat (docs/notes/threat-levels.md).
 */
export const DEFENCE = { min: 9, max: 22 }
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
