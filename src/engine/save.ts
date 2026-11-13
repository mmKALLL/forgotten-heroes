import type { Content } from '../content/build'
import { GameStateSchema, type GameState } from '../schema/state'
import { WorldStateSchema, type WorldState } from '../schema/world'
import { actCalendar } from './crisis/calendar'
import { generateCrisis, placeLeads } from './crisis/generate'
import { generatePeople } from './town/people'
import { startingGoods } from './travel/supplies'
import { generateWorld, mainlandSettlements, startingSettlement, worldSeed } from './world/generate'
import { straightKm } from './world/geo'
import { domainAt } from './world/pois'
import { placeDungeons } from './world/dungeons'

export const SAVE_KEY = 'forgotten-heroes/save/v1'
/** Where a save that no longer loads is copied, so a new game doesn't destroy it. */
export const UNREADABLE_SAVE_KEY = `${SAVE_KEY}/unreadable`

/** Bump this (and GameStateSchema's `version` literal) when GameState's shape changes. */
export const CURRENT_SAVE_VERSION = 14

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
 * nothing; the party carries no gear, starts Steady (5 of 8) and owes no wages, has gathered
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
    // Steady on the 0–8 scale of the time; v12 scales it ×5.
    camaraderie: 5,
    wagesOwed: 0,
    gathered: {},
    recruitsTaken: [],
    gearTaken: [],
    luckUsed: {},
  }
}

/**
 * The mainland settlement nearest (in a straight line) to `id`, a settlement or a site; the
 * mainland start when `id` is unknown. Null for an empty world.
 */
function nearestMainland(world: WorldState, content: Content, id: string | null): string | null {
  const domain = domainAt(world, id)
  const from =
    domain !== null && Object.hasOwn(content.settlements, domain)
      ? content.settlements[domain]
      : undefined
  const mainland = mainlandSettlements(world, content)
  if (!from || !mainland) return startingSettlement(world, content)
  const near = [...mainland].sort((a, b) => straightKm(from.at, a.at) - straightKm(from.at, b.at))
  return near[0]?.id ?? null
}

/**
 * v10 → v11 (Plan 5b): the world's Crisis, rolled from the save's world seed as a new game rolls
 * it, but starting on the save's current day (so an old run gets the full time for act I) and from
 * where the party is (on the road, where its journey set out from; on an island, the nearest
 * mainland settlement, as the Crisis lies on the mainland). Its sites join the world's POIs. A save that already has a Crisis keeps it; one whose world doesn't parse gets none.
 */
export function v10ToV11(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  if (raw.crisis !== undefined) return { ...raw, version: 11 }
  const world = WorldStateSchema.safeParse(raw.world)
  const day = typeof raw.day === 'number' && raw.day >= 1 ? Math.floor(raw.day) : 1
  const travel = raw.travel as { from?: unknown } | null | undefined
  const where = travel ? travel.from : raw.location
  const start = typeof where === 'string' ? where : null
  // Crisis sites lie on the mainland: a party on an island rolls from the nearest settlement there.
  const rolled = world.success
    ? (generateCrisis(world.data, content, { startDay: day, start }) ??
      generateCrisis(world.data, content, {
        startDay: day,
        start: nearestMainland(world.data, content, start),
      }))
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

/** A Plan 5b Crisis as a v11 (and v12) save stored it. */
type V11Crisis = {
  villain: string
  name: string
  startDay: number
  reveal: string
  acts: { id: string; poi: string; due: number }[]
  learned: number | null
  clues?: number[]
  thwarted?: (number | null)[]
  endSeen?: boolean
}

/** An old run that is migrated keeps at least this many days for the act it is in. */
const MIGRATED_ACT_DAYS_LEFT = 10

/**
 * v12 → v13 (Plan 6 C2–C3: the phased Crisis on a fixed calendar). The reveal site becomes act
 * I's lead site and each act's site its key site; acts II and III gain lead sites, placed as a new
 * game places them (crisis/generate.ts placeLeads). The calendar follows from the start day, with
 * no leeway: when the act the run is in would already be past (or within MIGRATED_ACT_DAYS_LEFT
 * of) its new due day, the start day moves on so that it has that long left. Progress maps over:
 * a learned plan wins act I's lead (its prevention); a later act whose old site was found (two
 * clues, or discovered) has its lead won too. A Crisis already in the new shape (rolled by the v10
 * → v11 step) is kept; one that can't be mapped (unknown villain, no room for the leads) is
 * dropped.
 */
export function v12ToV13(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  const old = raw.crisis as V11Crisis | null | undefined
  if (!old || typeof old !== 'object' || !('reveal' in old)) return { ...raw, version: 13 }
  const world = WorldStateSchema.safeParse(raw.world)
  const villain = Object.hasOwn(content.villains, old.villain)
    ? content.villains[old.villain]
    : null
  const keys = old.acts.map((a) => a.poi)
  const placed =
    world.success && villain && placeLeads(world.data, content, villain, old.name, keys)
  if (!placed) return { ...raw, version: 13, crisis: null }
  const day = typeof raw.day === 'number' && raw.day >= 1 ? Math.floor(raw.day) : 1
  const thwarted = old.thwarted ?? [null, null, null]
  const clues = old.clues ?? [0, 0, 0]
  const pois = (raw.world as { pois: Record<string, { discovered?: boolean }> }).pois
  const current = thwarted.findIndex((d) => d === null)
  const due = current < 0 ? day : actCalendar({ startDay: old.startDay }, current).due
  const startDay = old.startDay + Math.max(0, day + MIGRATED_ACT_DAYS_LEFT - due)
  const leads = old.acts.map((a, i) => {
    if (i === 0) return old.learned
    if (thwarted[i] !== null) return thwarted[i]
    const found = (clues[i] ?? 0) >= 2 || pois[a.poi]?.discovered === true
    return thwarted[i - 1] !== null && found ? day : null
  })
  return {
    ...raw,
    version: 13,
    world: { ...(raw.world as object), pois: { ...pois, ...placed.pois } },
    crisis: {
      villain: old.villain,
      name: old.name,
      startDay,
      acts: old.acts.map((a, i) => ({
        id: a.id,
        lead: i === 0 ? old.reveal : placed.ids[i - 1],
        key: a.poi,
      })),
      leads,
      clues,
      thwarted,
      endSeen: old.endSeen ?? false,
    },
  }
}

/**
 * v11 → v12 (Plan 6, track A): wages are gone. A member who drew a wage is marked `hired` (the
 * founders drew none), and the `wage` field goes; wages still owed are forgiven silently. No one
 * has an old wound. Camaraderie moves from the 0–8 scale to 0–40 (×5).
 */
export function v11ToV12(raw: Record<string, unknown>): Record<string, unknown> {
  const party = Array.isArray(raw.party)
    ? raw.party.map((c: Record<string, unknown>) => {
        if (typeof c !== 'object' || c === null) return c
        const { wage, ...rest } = c
        const hired = typeof wage === 'number' ? wage > 0 : rest.hired === true
        return { ...rest, hired, oldWound: rest.oldWound ?? null }
      })
    : raw.party
  const { wagesOwed: _forgiven, ...rest } = raw
  const camaraderie =
    typeof raw.camaraderie === 'number' && raw.version === 11
      ? raw.camaraderie * 5
      : raw.camaraderie
  return { ...rest, version: 12, party, camaraderie }
}

/**
 * v13 → v14 (Plan 6, track D): levelled work and authored dungeons. Contracts already taken are
 * level 1 (as they were paid), no delve is under way, and the authored dungeons are placed in the
 * old world as for a new one (world/dungeons.ts), near where the party is (on the road, the
 * journey's start): an old run gains them too. Its generic dungeons stay as they were.
 */
export function v13ToV14(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  const contracts = Array.isArray(raw.contracts)
    ? raw.contracts.map((c: Record<string, unknown>) =>
        typeof c === 'object' && c !== null ? { level: 1, ...c } : c
      )
    : raw.contracts
  const base = { ...raw, version: 14, contracts, delve: null }
  const world = WorldStateSchema.safeParse(raw.world)
  if (!world.success) return base
  const travel = raw.travel as { from?: unknown } | null | undefined
  const here =
    typeof raw.location === 'string'
      ? raw.location
      : typeof travel?.from === 'string'
        ? travel.from
        : null
  const start = domainAt(world.data, here)
  const placed = placeDungeons(world.data, content, start)
  const pois = (raw.world as { pois: Record<string, unknown> }).pois
  return { ...base, world: { ...(raw.world as object), pois: { ...pois, ...placed } } }
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
    case 11:
      return migrate(v11ToV12(raw as Record<string, unknown>), content)
    case 12:
      return migrate(v12ToV13(raw as Record<string, unknown>, content), content)
    case 13:
      return migrate(v13ToV14(raw as Record<string, unknown>, content), content)
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
