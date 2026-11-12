import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { CrisisState, Villain } from '../../schema/crisis'
import { CRISIS_ACTS } from '../../schema/types'
import type { LandSpot, PoiState, WorldState } from '../../schema/world'
import { rollTable } from '../encounters/slots'
import { createRng, withRng, type Draw } from '../rng'
import { NAME_TRIES } from '../world/names'
import { domainAt, freeSpots, poiName } from '../world/pois'
import { territory } from '../world/territory'
import { poiReach } from '../travel/reach'
import {
  CRISIS_ACT1_DAYS,
  CRISIS_ACT_DAYS,
  CRISIS_ACT_SPREAD,
  CRISIS_DUE_JITTER,
  CRISIS_REVEAL_DAYS,
  CRISIS_THREAT_FAVOUR,
} from '../constants'
import { shortName } from './text'

// Rolling the Crisis (Plan 5b E1, design §10b): one villain per world, its reveal site and three
// act sites (new hidden POIs), and the acts' due days. It draws from its own salted stream, so the
// rest of the world is unchanged and a world always rolls the same Crisis.

/** Mixed into the world seed, so the Crisis changes no other world draw. */
export const CRISIS_SALT = 0xc415e5b1

/** When the Crisis starts and where the party is (a settlement or a POI; its domain counts). */
export type CrisisStart = { startDay: number; start: string | null }

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/** A villain can be rolled when it has weight and every table and site type it names exists. */
const usable = (content: Content, v: Villain): boolean =>
  v.weight > 0 &&
  (v.names === undefined || Object.hasOwn(content.partsTables, v.names)) &&
  [v.reveal, ...v.acts.map((a) => a.site)].every((id) => Object.hasOwn(content.poiTypes, id))

/** Domain hops from `from` over the domain adjacency, within the given domains only. */
export function hopsFrom(
  adjacent: Record<string, string[]>,
  from: string,
  within: ReadonlySet<string>
): Map<string, number> {
  const hops = new Map([[from, 0]])
  const queue = [from]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of adjacent[id] ?? []) {
      if (!within.has(next) || hops.has(next)) continue
      hops.set(next, hops.get(id)! + 1)
      queue.push(next)
    }
  }
  return hops
}

/** How far a measure lies outside a range: 0 inside it. */
const outside = (value: number, [min, max]: readonly [number, number]): number =>
  value < min ? min - value : value > max ? value - max : 0

type Site = { domain: string; spot: LandSpot }

/** How far a spot of a domain is, for a range (hops or days); undefined when out of reach. */
type Measure = (domain: string, spot: LandSpot) => number | undefined

/**
 * A domain for a site and a spot in it. Among the free spots of `pool` (sorted ids), those whose
 * measure lies in `range` (or, with none, the nearest to it) are kept; a domain of theirs is drawn
 * by `weight`, then one of its kept spots. With no free spot anywhere in the pool, any spot no POI
 * stands on (still POI_MIN_KM from its settlement) will do.
 */
function placeSite(
  d: Draw,
  content: Content,
  pool: readonly string[],
  measure: Measure,
  range: readonly [number, number],
  weight: (domain: string) => number,
  placed: readonly LandSpot[]
): Site | null {
  const land = territory(content)
  for (const strict of [true, false]) {
    const candidates = pool.flatMap((domain) =>
      (strict
        ? freeSpots(content, land, domain, placed)
        : freeSpots(content, land, domain, []).filter((s) => !placed.includes(s))
      ).flatMap((spot) => {
        const value = measure(domain, spot)
        return value === undefined ? [] : [{ domain, spot, off: outside(value, range) }]
      })
    )
    if (candidates.length === 0) continue
    const best = Math.min(...candidates.map((c) => c.off))
    const fitting = candidates.filter((c) => c.off === best)
    const domains = [...new Set(fitting.map((c) => c.domain))]
    const domain = d.weighted(domains, (id) => weight(id))
    const spot = d.pick(fitting.filter((c) => c.domain === domain).map((c) => c.spot))
    return { domain, spot }
  }
  return null
}

/** Steady days from a settlement to a spot, by road and then its path, as for a POI there. */
function daysTo(
  content: Content,
  from: string,
  domain: string,
  spot: LandSpot
): number | undefined {
  const probe: PoiState = {
    type: '',
    category: 'quest',
    spot: spot.id,
    domain,
    name: '',
    threat: 0,
    discovered: false,
    clearedDay: null,
    boonDay: null,
  }
  const world = { pois: { probe } } as unknown as WorldState
  return poiReach({ world }, content, from, 'probe')?.days
}

/**
 * Rolls this world's Crisis: a villain by weight (×CRISIS_THREAT_FAVOUR when one of its threats
 * holds a land here), its name, then the reveal site and the three act sites as new hidden POIs
 * on the start's island:
 * - the reveal site CRISIS_REVEAL_DAYS steady days from the start, act I CRISIS_ACT1_DAYS (by
 *   road, then the path from the site's settlement);
 * - acts II and III at least CRISIS_ACT_SPREAD domain hops from the act before;
 * - act I outside the start's own domain, and an act with `seat` in a kingdom seat's domain other
 *   than the start's (when there is one).
 * Within those, a domain weighs ×CRISIS_THREAT_FAVOUR where a threat of the villain holds its land
 * or (for an act) its land's biome is one the act favours. Each site takes a free spot; without
 * one in range, the nearest domain that has one. Act n is due on startDay + n × CRISIS_ACT_DAYS ±
 * CRISIS_DUE_JITTER. Null without a usable villain, a start or room for the sites. Pure.
 */
export function generateCrisis(
  world: WorldState,
  content: Content,
  { startDay, start }: CrisisStart
): { world: WorldState; crisis: CrisisState } | null {
  const villains = sortedEntries(content.villains).filter((v) => usable(content, v))
  const home = domainAt(world, start)
  const homeSite = own(content.settlements, home)
  if (villains.length === 0 || !home || !homeSite) return null
  const island = new Set(
    sortedEntries(content.settlements)
      .filter((s) => s.island === homeSite.island && Object.hasOwn(world.domains, s.id))
      .map((s) => s.id)
  )
  const pool = [...island].sort(byCodeUnit)
  const { adjacent } = territory(content)
  const held = new Set(Object.values(world.lands).map((l) => l.threat))
  const threatOf = (domain: string) => own(world.lands, own(world.domains, domain)?.land)?.threat
  const biomeOf = (domain: string) =>
    own(content.regions, own(content.settlements, domain)?.region)?.biome
  const landName = (domain: string) => {
    const region = own(content.settlements, domain)?.region
    return own(content.regions, region)?.name ?? region ?? domain
  }

  const rolled = withRng(createRng((world.seed ^ CRISIS_SALT) >>> 0), (d) => {
    const villain = d.weighted(
      villains,
      (v) => v.weight * (v.threats.some((t) => held.has(t)) ? CRISIS_THREAT_FAVOUR : 1)
    )
    const title = villain.name.replace(/^The /, 'the ')
    const name = villain.names ? `${rollTable(d, content, villain.names)}, ${title}` : villain.name
    const favoured = (biomes: readonly string[]) => (domain: string) => {
      const threat = threatOf(domain)
      const biome = biomeOf(domain)
      const fits =
        (threat !== undefined && villain.threats.includes(threat)) ||
        (biome !== undefined && biomes.includes(biome))
      return fits ? CRISIS_THREAT_FAVOUR : 1
    }
    const placed: LandSpot[] = Object.values(world.pois).flatMap(
      (p) => own(content.landSpots, p.spot) ?? []
    )
    const usedNames = new Set(Object.values(world.pois).map((p) => p.name))
    const seats = new Set(world.kingdoms.map((k) => k.seat).filter((s) => s !== home))

    const sites: Site[] = []
    const place = (
      measure: Measure,
      range: readonly [number, number],
      weight: (domain: string) => number,
      { seat = false, away = false } = {}
    ): Site | null => {
      // A seat act goes under a seat; act I lies outside the start's own domain. Each falls back
      // to the whole island when that is impossible.
      const seatPool = pool.filter((id) => seats.has(id))
      const awayPool = pool.filter((id) => id !== home)
      const pools = [seat && seatPool, away && awayPool, pool].filter(
        (p): p is string[] => Array.isArray(p) && p.length > 0
      )
      for (const p of pools) {
        const site = placeSite(d, content, p, measure, range, weight, placed)
        if (site) {
          placed.push(site.spot)
          sites.push(site)
          return site
        }
      }
      return null
    }
    const days: Measure = (domain, spot) => daysTo(content, home, domain, spot)
    const hops = (from: string): Measure => {
      const table = hopsFrom(adjacent, from, island)
      return (domain) => table.get(domain)
    }
    if (!place(days, CRISIS_REVEAL_DAYS, favoured([]))) return null
    let previous = home
    for (const [i, act] of villain.acts.entries()) {
      const measure = i === 0 ? days : hops(previous)
      const range: readonly [number, number] =
        i === 0 ? CRISIS_ACT1_DAYS : [CRISIS_ACT_SPREAD, Infinity]
      const site = place(measure, range, favoured(act.biomes), { seat: act.seat, away: i === 0 })
      if (!site) return null
      previous = site.domain
    }

    const types = [villain.reveal, ...villain.acts.map((a) => a.site)]
    const villainShort = shortName(name)
    const firstId = 1 + Math.max(0, ...Object.keys(world.pois).map(poiNumber))
    const pois: Record<string, PoiState> = {}
    sites.forEach((site, i) => {
      const type = content.poiTypes[types[i]]
      const values = { villain: villainShort, land: landName(site.domain) }
      let poiTitle = poiName(d, content, type, values)
      for (let tries = 1; tries < NAME_TRIES && usedNames.has(poiTitle); tries++) {
        poiTitle = poiName(d, content, type, values)
      }
      usedNames.add(poiTitle)
      pois[`poi-${firstId + i}`] = {
        type: type.id,
        category: type.category,
        spot: site.spot.id,
        domain: site.domain,
        name: poiTitle,
        threat: 0,
        discovered: false,
        clearedDay: null,
        boonDay: null,
      }
    })
    const ids = Object.keys(pois)
    const acts = villain.acts.map((act, i) => ({
      id: act.id,
      poi: ids[i + 1],
      due: startDay + (i + 1) * CRISIS_ACT_DAYS + d.int(-CRISIS_DUE_JITTER, CRISIS_DUE_JITTER),
    }))
    const crisis: CrisisState = {
      villain: villain.id,
      name,
      startDay,
      reveal: ids[0],
      acts,
      learned: null,
      clues: Array<number>(CRISIS_ACTS).fill(0),
      thwarted: Array<number | null>(CRISIS_ACTS).fill(null),
      endSeen: false,
    }
    return { pois, crisis }
  })[0]
  if (!rolled) return null
  return { world: { ...world, pois: { ...world.pois, ...rolled.pois } }, crisis: rolled.crisis }
}

/** The number of a "poi-<n>" id (0 for any other id). */
function poiNumber(id: string): number {
  const n = /^poi-(\d+)$/.exec(id)?.[1]
  return n === undefined ? 0 : Number(n)
}
