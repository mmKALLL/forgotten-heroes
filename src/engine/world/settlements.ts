import { sortedEntries, type Content } from '../../content/build'
import { SIZE_TIERS } from '../../schema/constants'
import type {
  RegionKingdom,
  RegionState,
  Settlement,
  SettlementState,
  Town,
} from '../../schema/world'
import type { Draw } from '../rng'
import { generatePlaceName } from './names'

/** Settlement types a plain map marker can be; kingdom seats are "capital", other framed markers "city". */
export const MARKER_TYPES = ['hamlet', 'village', 'town', 'city', 'fort'] as const
/** The prototype's population thresholds: above each, the next size tier. */
export const POPULATION_TIERS = [76, 400, 1000, 4000, 10000]
/** A service that passes its d20 roll still only appears this often (prototype). */
export const SERVICE_CHANCE = 0.9
/** Services that need the sea. */
export const COASTAL_SERVICES: readonly string[] = ['port']
/** A named town needs at least this score to be placed (see townScore). */
export const MIN_TOWN_MATCH = 2
/** Settlements are this much poorer where the threat is rampant (level 3). */
export const RAMPANT_WEALTH = -1
/** How often a settlement's ancestry is the ruling one, when its town doesn't name one. */
export const RULING_ANCESTRY_SHARE = 0.75

export const sizeTierOf = (population: number): number =>
  POPULATION_TIERS.filter((t) => population > t).length

/**
 * Which services a settlement has: each passes when 1d20 + wealth beats its threshold for the
 * size tier (then a 90% chance), as in the prototype. Coastal-only services need the sea. Beyond
 * the type's maxServices, random ones are dropped.
 */
export function rollServices(
  d: Draw,
  content: Content,
  tier: number,
  wealth: number,
  coastal: boolean,
  max: number
): string[] {
  const present = sortedEntries(content.services).filter(
    (s) =>
      (coastal || !COASTAL_SERVICES.includes(s.id)) &&
      d.int(1, 20) + wealth > s.presenceThresholdBySize[tier] &&
      d.float() < SERVICE_CHANCE
  )
  while (present.length > max) present.splice(d.int(0, present.length - 1), 1)
  return present.map((s) => s.id)
}

/**
 * How well a named town fits a marker: null when it can't go there (a coastal town inland, or a
 * town pinned elsewhere), otherwise matching hints add up. A pinned town scores 100 at its site.
 */
export function townScore(
  town: Town,
  site: Settlement,
  biome: string | undefined,
  typeId: string,
  tier: number
): number | null {
  if (town.site) return town.site === site.id ? 100 : null
  if (town.coastal && !site.coastal) return null
  let score = 0
  if (town.coastal) score += 2
  if (biome && town.biomes.some((b) => b === biome)) score += 2
  if (town.capital) score += typeId === 'capital' ? 3 : -2
  if (town.size) {
    const gap = Math.abs(SIZE_TIERS.indexOf(town.size) - tier)
    score += gap === 0 ? 2 : gap === 1 ? 1 : -1
  }
  if (town.altaeus) score += 1
  return score
}

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

/**
 * Types, sizes, wealth, services, ancestries and names for every marker. Kingdom seats are rolled
 * first, so towns described as capitals can claim them; then the rest in id order.
 */
export function generateSettlements(
  d: Draw,
  content: Content,
  kingdoms: readonly RegionKingdom[],
  regionStates: Readonly<Record<string, RegionState>>,
  usedNames: Set<string>
): Record<string, SettlementState> {
  const seats = new Set(kingdoms.map((k) => k.capital))
  const sites = sortedEntries(content.settlements)
  const ordered = [
    ...sites.filter((s) => seats.has(s.id)),
    ...sites.filter((s) => !seats.has(s.id)),
  ]
  const markerTypes = MARKER_TYPES.flatMap((id) => own(content.settlementTypes, id) ?? [])
  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const towns = sortedEntries(content.towns)
  const townNames = towns.map((t) => t.name)
  const usedTowns = new Set<string>()
  /** Settlement names so far. Generated names avoid town names; this guards the rare clash anyway. */
  const named = new Set<string>()
  const result: Record<string, SettlementState> = {}

  for (const site of ordered) {
    const regionState = own(regionStates, site.region)
    const kingdom = kingdoms.find((k) => k.id === regionState?.kingdom)
    const typeId = seats.has(site.id)
      ? 'capital'
      : site.capital
        ? 'city'
        : d.weighted(markerTypes, (t) => t.ratio).id
    const type = own(content.settlementTypes, typeId)
    if (!type) throw new Error(`content has no settlement type "${typeId}"`)
    const population = d.int(type.minPopulation, type.maxPopulation)
    const sizeTier = sizeTierOf(population)

    const biome = own(content.regions, site.region)?.biome
    const fits = towns
      .filter((t) => !usedTowns.has(t.id) && !named.has(t.name))
      .map((t) => ({ town: t, score: townScore(t, site, biome, typeId, sizeTier) }))
      .filter(
        (f): f is typeof f & { score: number } => f.score !== null && f.score >= MIN_TOWN_MATCH
      )
    const pinned = fits.find((f) => f.town.site === site.id)
    const town = pinned?.town ?? (fits.length > 0 ? d.weighted(fits, (f) => f.score).town : null)
    if (town) usedTowns.add(town.id)
    const name = town?.name ?? generatePlaceName(d, content, new Set([...usedNames, ...townNames]))
    usedNames.add(name)
    named.add(name)

    const rampant = (regionState?.threatLevel ?? 0) >= 3 ? RAMPANT_WEALTH : 0
    const wealth = Math.max(-4, Math.min(6, d.int(-2, 2) + (town?.wealth ?? 0) + rampant))
    const ancestry =
      town?.ancestry ??
      (kingdom && (playable.length === 0 || d.float() < RULING_ANCESTRY_SHARE)
        ? kingdom.ancestry
        : playable.length > 0
          ? d.pick(playable).id
          : 'human')
    result[site.id] = {
      name,
      town: town?.id ?? null,
      type: type.id,
      population,
      sizeTier,
      wealth,
      ancestry,
      services: rollServices(d, content, sizeTier, wealth, site.coastal, type.maxServices),
    }
  }
  return result
}
