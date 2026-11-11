import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { Kingdom, RegionState } from '../../schema/world'
import type { Draw } from '../rng'
import { generatePlaceName, realmName } from './names'

export const KINGDOMS = { min: 4, max: 6 }
/** A kingdom's total defence, split evenly across its regions. */
export const DEFENCE = { min: 4, max: 10 }
/** Seeds prefer regions with a capital marker, by this factor. */
export const CAPITAL_SEED_WEIGHT = 3
/** Ruling ancestries are picked by weight; any playable ancestry not listed weighs 1. */
export const RULER_WEIGHTS: Readonly<Record<string, number>> = { human: 3 }
/** A threat's weight in a region of a biome it favours, and in one it doesn't. */
export const FAVOURED = 3
export const UNFAVOURED = 0.5

export type Politics = { kingdoms: Kingdom[]; regions: Record<string, RegionState> }

/** How far a threat outweighs the garrison, from 0 (held) to 3 (rampant). */
export const threatLevelFor = (strength: number, garrison: number): number =>
  Math.min(3, Math.max(0, Math.round(strength - garrison)))

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
 * Divides the regions among kingdoms: seeds first (preferring capital markers), then the
 * smallest kingdom that can grow claims a neighbouring region, until every region is owned.
 * A region no kingdom can reach founds its own. `kingdomCount` overrides the roll (for tests).
 */
export function generatePolitics(
  d: Draw,
  content: Content,
  usedNames: Set<string>,
  kingdomCount?: number
): Politics {
  const regionIds = sortedEntries(content.regions).map((r) => r.id)
  if (regionIds.length === 0) return { kingdoms: [], regions: {} }
  const sites = sortedEntries(content.settlements)
  const capitalRegions = new Set(sites.filter((s) => s.capital).map((s) => s.region))
  const count = Math.min(regionIds.length, kingdomCount ?? d.int(KINGDOMS.min, KINGDOMS.max))

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
  const result: Kingdom[] = []
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
      defence: d.int(DEFENCE.min, DEFENCE.max),
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
