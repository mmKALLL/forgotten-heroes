import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { PoiCategory } from '../../schema/constants'
import type { DomainState, LandSpot, LandState, PoiState, PoiType } from '../../schema/world'
import { fillText, rollTable, slotNames } from '../encounters/slots'
import type { Draw } from '../rng'
import { straightKm } from './geo'
import { NAME_TRIES } from './names'
import { threatLevelFor } from './politics'
import { territory, type Territory } from './territory'

// Points of interest (design §6): dungeons, experts, lairs, shrines, landmarks, wonders and quest
// sites, placed on land spots per domain when the world is rolled. All start hidden.

/**
 * A domain's expected POIs are its spots / POI_SPOTS_EACH. With the ~400 Altaeus land spots this
 * gives about 40–60 per world (mean ≈ 49), most domains holding 0 or 1.
 */
export const POI_SPOTS_EACH = 8
/** No domain gets more than this many POIs; most get 0 or 1. */
export const POI_MAX_PER_DOMAIN = 2
/** The closest a POI may stand to its settlement, and to another POI. */
export const POI_MIN_KM = 8
/** A type whose biome matches the spot, or whose threats name the land's threat, weighs this much more. */
export const POI_FAVOURED = 3

/** The parts of a world the threat of a domain depends on. */
export type PoiWorld = {
  lands: Record<string, LandState>
  domains: Record<string, DomainState>
  pois: Record<string, PoiState>
}

/**
 * How many POIs a domain with this many spots draws: its expected share (spots / spotsEach),
 * rounded up or down at random so the fraction is kept on average, at most POI_MAX_PER_DOMAIN.
 */
export function poisPerDomain(d: Draw, spots: number, spotsEach = POI_SPOTS_EACH): number {
  const expected = spots / spotsEach
  const whole = Math.floor(expected)
  const extra = d.float() < expected - whole ? 1 : 0
  return Math.max(0, Math.min(POI_MAX_PER_DOMAIN, whole + extra))
}

const own = <T>(table: Record<string, T>, id: string | undefined): T | undefined =>
  id !== undefined && Object.hasOwn(table, id) ? table[id] : undefined

/**
 * A name from a POI type's parts table. `{threat}` and `{land}` are the land's threat and name;
 * other slots expand as nested tables. Falls back to the type's own name without a table.
 */
function poiName(d: Draw, content: Content, type: PoiType, values: Record<string, string>): string {
  const table = own(content.partsTables, type.names)
  if (!table) return type.name
  const row = d.weighted(table.rows, (r) => r.weight)
  const filled = { ...values }
  for (const name of slotNames(row.text)) {
    if (!Object.hasOwn(filled, name)) filled[name] = rollTable(d, content, name)
  }
  return fillText(row.text, filled)
}

/**
 * A lair keyed to threats is the land's threat made concrete: it is only drawn where one of its
 * threats holds the land. Other types (and lairs without threats) may stand anywhere; for them the
 * threats are only a favour (POI_FAVOURED).
 */
export function lairFits(type: PoiType, land: LandState | undefined): boolean {
  if (type.category !== 'lair' || type.threats.length === 0) return true
  return land !== undefined && type.threats.includes(land.threat)
}

export type PoiOptions = {
  /** Overrides POI_SPOTS_EACH (for tests). */
  spotsEach?: number
  /**
   * Names already taken in the world. A POI name is redrawn (up to NAME_TRIES times) to avoid
   * them, and each POI's name is added. Names never repeat within one call either way.
   */
  usedNames?: Set<string>
}

/**
 * The POIs of a world, ids `poi-<n>` in generation order. Domains are walked in id order; each
 * draws its count (poisPerDomain), then for each POI a free spot of its territory at least
 * POI_MIN_KM from its settlement and every POI so far (fewer when none is left), and a type by
 * weight, POI_FAVOURED× when the type's biomes match the spot's terrain (or the land's biome) or
 * its threats name the land's threat. A lair keyed to other threats is not drawn (lairFits). Hostile types roll their threat. Names avoid repeats while
 * the type's table allows (see PoiOptions.usedNames).
 */
export function generatePois(
  d: Draw,
  content: Content,
  territory: Pick<Territory, 'spots'>,
  lands: Readonly<Record<string, LandState>>,
  options: PoiOptions = {}
): Record<string, PoiState> {
  const types = sortedEntries(content.poiTypes).filter((t) => t.weight > 0)
  const result: Record<string, PoiState> = {}
  if (types.length === 0) return result
  const placed: LandSpot[] = []
  const used = options.usedNames ?? new Set<string>()
  for (const site of sortedEntries(content.settlements)) {
    const spots = (territory.spots[site.id] ?? []).flatMap((id) => own(content.landSpots, id) ?? [])
    const land = own(lands, site.region)
    const fitting = types.filter((t) => lairFits(t, land))
    if (spots.length === 0 || fitting.length === 0) continue
    const count = poisPerDomain(d, spots.length, options.spotsEach)
    const region = own(content.regions, site.region)
    const threat = own(content.threats, land?.threat)
    for (let i = 0; i < count; i++) {
      const free = spots.filter(
        (s) =>
          straightKm(s.at, site.at) >= POI_MIN_KM &&
          placed.every((p) => p !== s && straightKm(p.at, s.at) >= POI_MIN_KM)
      )
      if (free.length === 0) break
      const spot = d.pick(free)
      placed.push(spot)
      const terrain = spot.terrain ?? region?.biome
      const type = d.weighted(fitting, (t) => {
        const favoured =
          (terrain !== undefined && t.biomes.includes(terrain)) ||
          (land !== undefined && t.threats.includes(land.threat))
        return t.weight * (favoured ? POI_FAVOURED : 1)
      })
      const values = { threat: threat?.name ?? '', land: region?.name ?? site.region }
      let name = poiName(d, content, type, values)
      for (let tries = 1; tries < NAME_TRIES && used.has(name); tries++) {
        name = poiName(d, content, type, values)
      }
      used.add(name)
      result[`poi-${Object.keys(result).length + 1}`] = {
        type: type.id,
        spot: spot.id,
        domain: site.id,
        name,
        threat: type.threat ? d.int(type.threat.min, type.threat.max) : 0,
        discovered: false,
        cleared: false,
        boonDay: null,
      }
    }
  }
  return result
}

/** The threat holding a domain: its land's strength plus every uncleared hostile POI in it. */
export function domainThreatStrength(world: PoiWorld, domainId: string): number {
  const domain = own(world.domains, domainId)
  if (!domain) return 0
  const land = own(world.lands, domain.land)?.threatStrength ?? 0
  const lairs = Object.values(world.pois)
    .filter((p) => p.domain === domainId && !p.cleared)
    .reduce((sum, p) => sum + p.threat, 0)
  return land + lairs
}

/**
 * What the party knows lairs add to a domain's threat: the threat of its discovered, uncleared
 * POIs. Undiscovered ones still count in the level (domainThreatLevel), silently.
 */
export function knownLairThreat(world: Pick<PoiWorld, 'pois'>, domainId: string): number {
  return Object.values(world.pois)
    .filter((p) => p.domain === domainId && p.discovered && !p.cleared)
    .reduce((sum, p) => sum + p.threat, 0)
}

/** How far the threat outweighs the domain's garrison, 0 (held) to 3 (rampant); derived, never stored. */
export function domainThreatLevel(world: PoiWorld, domainId: string): number {
  const domain = own(world.domains, domainId)
  if (!domain) return 0
  return threatLevelFor(domainThreatStrength(world, domainId), domain.garrison)
}

/** What discoverPoi looks for: how many, where, and of which category. */
export type PoiSearch = {
  count: number
  scope: 'domain' | 'land'
  category?: PoiCategory
}

/**
 * The undiscovered POIs a clue or a search in `domainId` would reveal, nearest first, at most
 * `count`. Within the domain the nearest is by territory km from its settlement; with scope
 * "land", POIs in the land's other domains follow, by straight-line km from the settlement.
 * Ties go to the lower id.
 */
export function poisToDiscover(
  world: Pick<PoiWorld, 'domains' | 'pois'>,
  content: Content,
  domainId: string | null,
  { count, scope, category }: PoiSearch
): string[] {
  const domain = domainId === null ? undefined : own(world.domains, domainId)
  const home = domainId === null ? undefined : own(content.settlements, domainId)
  if (!domain || !home) return []
  const land = territory(content)
  const distance = (poi: PoiState): [number, number] => {
    const spot = own(content.landSpots, poi.spot)
    const straight = spot ? straightKm(spot.at, home.at) : Infinity
    return poi.domain === domainId ? [0, land.km[poi.spot] ?? straight] : [1, straight]
  }
  return Object.entries(world.pois)
    .filter(([, poi]) => {
      if (poi.discovered) return false
      if (category && own(content.poiTypes, poi.type)?.category !== category) return false
      if (poi.domain === domainId) return true
      return scope === 'land' && own(world.domains, poi.domain)?.land === domain.land
    })
    .map(([id, poi]) => ({ id, d: distance(poi) }))
    .sort((a, b) => a.d[0] - b.d[0] || a.d[1] - b.d[1] || byCodeUnit(a.id, b.id))
    .slice(0, count)
    .map((p) => p.id)
}

/** The domain a place belongs to: a settlement is its own, a POI its owner's. Null otherwise. */
export function domainAt(
  world: Pick<PoiWorld, 'domains' | 'pois'>,
  id: string | null
): string | null {
  if (id === null) return null
  if (Object.hasOwn(world.domains, id)) return id
  return own(world.pois, id)?.domain ?? null
}
