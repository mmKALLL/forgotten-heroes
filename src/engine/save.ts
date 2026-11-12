import type { Content } from '../content/build'
import { GameStateSchema, type GameState } from '../schema/state'
import { WorldStateSchema } from '../schema/world'
import { generateCrisis } from './crisis/generate'
import { CAMARADERIE_START } from './constants'
import { generatePeople } from './town/people'
import { startingGoods } from './travel/supplies'
import { generateWorld, startingSettlement, worldSeed } from './world/generate'

export const SAVE_KEY = 'forgotten-heroes/save/v1'
/** Where a save that no longer loads is copied, so a new game doesn't destroy it. */
export const UNREADABLE_SAVE_KEY = `${SAVE_KEY}/unreadable`

/** Bump this (and GameStateSchema's `version` literal) when GameState's shape changes. */
export const CURRENT_SAVE_VERSION = 11

export const serialize = (state: GameState): string => JSON.stringify(state)

/** v1 → v2 (Plan 2): no encounter in progress, an empty follow-up queue and no skill uses yet. */
export const v1ToV2 = (raw: Record<string, unknown>): Record<string, unknown> => ({
  ...raw,
  version: 2,
  encounter: null,
  followUps: [],
  skillUses: [],
})

/**
 * v2 → v3 (Plan 3): a world rolled from the save's seed, the party at that world's starting
 * place with fresh supplies, no journey, and no strain yet.
 */
export function v2ToV3(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  const world = generateWorld(worldSeed(typeof raw.seed === 'number' ? raw.seed : 0), content)
  const party = Array.isArray(raw.party)
    ? raw.party.map((c: Record<string, unknown>) => ({ ...c, strain: {} }))
    : raw.party
  return {
    ...raw,
    version: 3,
    party,
    world,
    location: startingSettlement(world, content),
    travel: null,
    goods: startingGoods(Array.isArray(raw.party) ? raw.party.length : 0),
  }
}

/**
 * v3 → v4 (Plan 3b): the world re-rolled from the save's seed, now with lands, domains and points
 * of interest (settlement names may change; the journal keeps the old ones). The party stays
 * where it is when that settlement still exists, and stays on the road when its route still
 * exists; otherwise it is put at the world's starting place. Everything else is kept.
 */
export function v3ToV4(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  const world = generateWorld(worldSeed(typeof raw.seed === 'number' ? raw.seed : 0), content)
  const travel = raw.travel as { route?: unknown } | null | undefined
  const onRoad =
    travel != null &&
    typeof travel.route === 'string' &&
    Object.hasOwn(content.routes, travel.route)
  if (onRoad) return { ...raw, version: 4, world }
  const here = raw.location
  const stays = typeof here === 'string' && Object.hasOwn(world.settlements, here)
  return {
    ...raw,
    version: 4,
    world,
    travel: null,
    location: stays ? here : startingSettlement(world, content),
  }
}

/**
 * v4 → v5 (Plan 3b fixes): each POI keeps its type's category, and `cleared` becomes the day it
 * was cleared (the save's current day, so a site cleared before stays empty a while yet).
 */
export function v4ToV5(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  const world = raw.world as { pois?: Record<string, Record<string, unknown>> } | undefined
  const day = typeof raw.day === 'number' ? raw.day : 1
  if (!world?.pois) return { ...raw, version: 5 }
  const pois = Object.fromEntries(
    Object.entries(world.pois).map(([id, poi]) => {
      const { cleared, ...rest } = poi
      const type = typeof poi.type === 'string' ? poi.type : ''
      const known = Object.hasOwn(content.poiTypes, type) ? content.poiTypes[type] : null
      const fallback = typeof poi.threat === 'number' && poi.threat > 0 ? 'lair' : 'landmark'
      return [
        id,
        {
          ...rest,
          category: known?.category ?? fallback,
          clearedDay: cleared === true ? day : null,
        },
      ]
    })
  )
  return { ...raw, version: 5, world: { ...world, pois } }
}

/**
 * v5 → v6 (Plan 4): the world's notable people, rolled from its seed and settlements just as a
 * new game rolls them, and no trades, prices, reputation, contracts or animals yet. A journey
 * under way has no hired mounts. Goods and waterskins stay as they are (the old goods are a
 * subset of the 15).
 */
export function v5ToV6(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  const world = raw.world as
    | { seed?: unknown; settlements?: Parameters<typeof generatePeople>[2]['settlements'] }
    | undefined
  const travel = raw.travel as Record<string, unknown> | null | undefined
  const people =
    world && typeof world.seed === 'number' && world.settlements
      ? generatePeople(world.seed, content, { settlements: world.settlements })
      : {}
  return {
    ...raw,
    version: 6,
    world: world ? { ...world, people } : world,
    travel: travel ? { ...travel, hired: null } : travel,
    markets: {},
    priceBook: {},
    spoilage: {},
    animals: {},
    upkeepOwed: 0,
    reputation: { settlements: {}, people: {} },
    contracts: [],
    contractsTaken: [],
    doneHere: [],
  }
}

/** An old pace (and its covering-tracks flag) as a v7 pace: covering tracks is now Stealthy. */
const v7Pace = (pace: unknown, coverTracks: unknown): unknown =>
  coverTracks === true && pace === 'cautious' ? 'stealthy' : pace

/** A v6 day on the road ({ day, pace, coverTracks }) as a v7 one ({ day, pace }). */
const v7PaceDay = (d: unknown): unknown => {
  if (typeof d !== 'object' || d === null) return d
  const { coverTracks, ...rest } = d as Record<string, unknown>
  return { ...rest, pace: v7Pace(rest.pace, coverTracks) }
}

/**
 * v6 → v7 (Plan 4, paces): covering tracks is no longer a flag on the cautious pace but a pace of
 * its own, Stealthy. A journey, and every day logged for pursuit (the journey's pace log and each
 * follow-up's trail), that was cautious with covered tracks becomes stealthy; the flag goes. A
 * journey under way keeps the speed it set out at.
 */
export function v6ToV7(raw: Record<string, unknown>): Record<string, unknown> {
  const travel = raw.travel as Record<string, unknown> | null | undefined
  const days = (log: unknown) => (Array.isArray(log) ? log.map(v7PaceDay) : log)
  const nextTravel = travel
    ? (() => {
        const { coverTracks, ...rest } = travel
        return { ...rest, pace: v7Pace(rest.pace, coverTracks), paceLog: days(rest.paceLog) }
      })()
    : travel
  const followUps = Array.isArray(raw.followUps)
    ? raw.followUps.map((f: Record<string, unknown>) =>
        f && Array.isArray(f.trail) ? { ...f, trail: days(f.trail) } : f
      )
    : raw.followUps
  return { ...raw, version: 7, travel: nextTravel, followUps }
}

/**
 * v7 → v8 (Plan 4, supply contracts split): a supply contract becomes a procurement: bring the
 * goods to where it is due. (Freight is new: no old contract is one.)
 */
export function v7ToV8(raw: Record<string, unknown>): Record<string, unknown> {
  const contracts = Array.isArray(raw.contracts)
    ? raw.contracts.map((c: Record<string, unknown>) =>
        c && c.kind === 'supply' ? { ...c, kind: 'procurement' } : c
      )
    : raw.contracts
  return { ...raw, version: 8, contracts }
}

/** A pace that no longer exists, as today's: Cautious (removed, designer decision) is Stealthy. */
const v9Pace = (pace: unknown): unknown => (pace === 'cautious' ? 'stealthy' : pace)

/**
 * v8 → v9 (Plan 4 fixes): the Cautious pace is gone. A journey, every day logged for pursuit (the
 * journey's pace log and each follow-up's trail) that was cautious becomes stealthy. A journey
 * under way keeps the speed it set out at.
 */
export function v8ToV9(raw: Record<string, unknown>): Record<string, unknown> {
  const day = (d: unknown): unknown =>
    typeof d === 'object' && d !== null
      ? { ...d, pace: v9Pace((d as Record<string, unknown>).pace) }
      : d
  const days = (log: unknown) => (Array.isArray(log) ? log.map(day) : log)
  const travel = raw.travel as Record<string, unknown> | null | undefined
  const nextTravel = travel
    ? { ...travel, pace: v9Pace(travel.pace), paceLog: days(travel.paceLog) }
    : travel
  const followUps = Array.isArray(raw.followUps)
    ? raw.followUps.map((f: Record<string, unknown>) =>
        f && Array.isArray(f.trail) ? { ...f, trail: days(f.trail) } : f
      )
    : raw.followUps
  return { ...raw, version: 9, travel: nextTravel, followUps }
}

/**
 * v9 → v10 (Plan 5a): every character has no XP yet, no wage (they are all founders) and wears
 * nothing; the party carries no gear, starts at CAMARADERIE_START and owes no wages, has gathered
 * nothing, hired and bought nothing, and spent no luck. An open encounter had no danger applied.
 */
export function v9ToV10(raw: Record<string, unknown>): Record<string, unknown> {
  const party = Array.isArray(raw.party)
    ? raw.party.map((c: Record<string, unknown>) => ({ ...c, xp: 0, wage: 0, accessory: null }))
    : raw.party
  const encounter = raw.encounter as Record<string, unknown> | null | undefined
  return {
    ...raw,
    version: 10,
    party,
    encounter: encounter ? { ...encounter, danger: 0 } : encounter,
    gear: [],
    camaraderie: CAMARADERIE_START,
    wagesOwed: 0,
    gathered: {},
    recruitsTaken: [],
    gearTaken: [],
    luckUsed: {},
  }
}

/**
 * v10 → v11 (Plan 5b): the world's Crisis, rolled from the save's world seed as a new game rolls
 * it, but starting on the save's current day (so an old run gets the full time for act I) and from
 * where the party is (on the road, where its journey set out from). Its sites join the world's
 * POIs. A save that already has a Crisis keeps it; one whose world doesn't parse gets none.
 */
export function v10ToV11(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  if (raw.crisis !== undefined) return { ...raw, version: 11 }
  const world = WorldStateSchema.safeParse(raw.world)
  const day = typeof raw.day === 'number' && raw.day >= 1 ? Math.floor(raw.day) : 1
  const travel = raw.travel as { from?: unknown } | null | undefined
  const where = travel ? travel.from : raw.location
  const start = typeof where === 'string' ? where : null
  const rolled = world.success
    ? generateCrisis(world.data, content, { startDay: day, start })
    : null
  if (!rolled) return { ...raw, version: 11, crisis: null }
  // Only the Crisis's own sites are added; the saved POIs stay exactly as they were.
  const sites = Object.entries(rolled.world.pois).filter(
    ([id]) => !Object.hasOwn(world.data!.pois, id)
  )
  const pois = { ...(raw.world as { pois: object }).pois, ...Object.fromEntries(sites) }
  return {
    ...raw,
    version: 11,
    world: { ...(raw.world as object), pois },
    crisis: rolled.crisis,
  }
}

/**
 * Upgrades a parsed save to the current version, one step at a time.
 * When GameState changes, add `case n: return migrate(vNToVNPlus1(raw), content)` above the
 * current case. Unknown versions throw, so `deserialize` reports them as unreadable.
 */
export function migrate(raw: unknown, content: Content): unknown {
  const version =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as { version?: unknown }).version
      : undefined
  switch (version) {
    case 1:
      return migrate(v1ToV2(raw as Record<string, unknown>), content)
    case 2:
      return migrate(v2ToV3(raw as Record<string, unknown>, content), content)
    case 3:
      return migrate(v3ToV4(raw as Record<string, unknown>, content), content)
    case 4:
      return migrate(v4ToV5(raw as Record<string, unknown>, content), content)
    case 5:
      return migrate(v5ToV6(raw as Record<string, unknown>, content), content)
    case 6:
      return migrate(v6ToV7(raw as Record<string, unknown>), content)
    case 7:
      return migrate(v7ToV8(raw as Record<string, unknown>), content)
    case 8:
      return migrate(v8ToV9(raw as Record<string, unknown>), content)
    case 9:
      return migrate(v9ToV10(raw as Record<string, unknown>), content)
    case 10:
      return migrate(v10ToV11(raw as Record<string, unknown>, content), content)
    case CURRENT_SAVE_VERSION:
      return raw
    default:
      throw new Error(`unsupported save version: ${String(version)}`)
  }
}

/**
 * Carried goods are whole units. Before Plan 4's fixes a camel's half unit of water could leave a
 * fraction behind, which made the save unreadable: such a fraction is rounded down on load.
 */
export function wholeGoods(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const goods = (raw as { goods?: unknown }).goods
  if (typeof goods !== 'object' || goods === null) return raw
  const whole = Object.fromEntries(
    Object.entries(goods).map(([g, n]) => [g, typeof n === 'number' ? Math.floor(n + 1e-9) : n])
  )
  return { ...raw, goods: whole }
}

/** Old saves need the content: migrating to v3 rolls the world. */
export function deserialize(text: string, content: Content): GameState | null {
  try {
    const parsed = GameStateSchema.safeParse(wholeGoods(migrate(JSON.parse(text), content)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
