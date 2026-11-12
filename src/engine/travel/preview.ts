import type { Content } from '../../content/build'
import type { Biome, Pace, PoiCategory, Position } from '../../schema/constants'
import type { GameState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { inProgress } from '../encounters/run'
import { canAct } from '../rules/character'
import { otherEnd, settlementName } from '../world/geo'
import { edgeById, edgesFrom } from '../world/graph'
import { domainThreatLevel, knownLairThreat } from '../world/pois'
import { ambushPositionForPace, paceHostileAvoidance } from './pace'
import {
  canMeetEncounters,
  fareFor,
  journeyDays,
  routeEncounters,
  routeTerrain,
  routeThreat,
} from './routes'
import { forageCheck, type ForageCheck } from './forage'
import { stowawayCheck, type StowawayCheck } from './stowaway'
import { goodsOf, partyWaterCapacity, waterNeed } from './supplies'
import {
  forecastJourney,
  type SupplyForecast,
  type TravelWarning,
  type WaterForecast,
} from './warnings'

export const DANGER_LABELS = ['Safe', 'Watchful', 'Dangerous', 'Deadly'] as const
export const THREAT_LABELS = ['Held', 'Stirring', 'Rising', 'Rampant'] as const
export const SIZE_LABELS = ['Outpost', 'Hamlet', 'Village', 'Town', 'City', 'Metropolis'] as const
/** Shown instead of a pace choice for a crossing by ship. */
export const SEA_PACE_NOTE = 'At sea the ship sets the pace.'

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

export type PlaceInfo = {
  id: string
  name: string
  typeName: string
  sizeLabel: string
  /** 0 (outpost) to 5 (metropolis), by population; sizeLabel is its English name. */
  sizeTier: number
  population: number
  /** The land (map area) it stands in. */
  landName: string
  biome: Biome | null
  /** Its domain: the settlement itself (design §6). */
  domainId: string
  /** The domain's name: its settlement's. */
  domainName: string
  /** The kingdom holding the domain. */
  kingdomName: string
  /** The ruling ancestry's name. */
  rulerAncestry: string
  /** The settlement's own predominant ancestry. */
  ancestryName: string
  /** True for the kingdom's seat. */
  seat: boolean
  /** The threat roaming the land. */
  threatName: string
  /** The domain's threat level (domainThreatLevel): the land's threat and its lairs, against its garrison. */
  threatLevel: number
  /** What the lairs the party has found add to the domain's threat (knownLairThreat). */
  lairThreat: number
  services: { id: string; name: string }[]
  /** The town map, as a path under assets/, or null. */
  banner: string | null
  coastal: boolean
}

export function placeInfo(state: GameState, content: Content, id: string): PlaceInfo | null {
  const site = own(content.settlements, id)
  const info = own(state.world.settlements, id)
  if (!site || !info) return null
  const land = own(content.regions, site.region)
  const landState = own(state.world.lands, site.region)
  const domain = own(state.world.domains, id)
  const kingdom = state.world.kingdoms.find((k) => k.id === domain?.kingdom)
  const ancestry = (aid: string | undefined) => own(content.ancestries, aid)?.name ?? aid ?? '?'
  return {
    id,
    name: info.name,
    typeName: own(content.settlementTypes, info.type)?.name ?? info.type,
    sizeLabel: SIZE_LABELS[info.sizeTier],
    sizeTier: info.sizeTier,
    population: info.population,
    landName: land?.name ?? site.region,
    biome: land?.biome ?? null,
    domainId: id,
    domainName: info.name,
    kingdomName: kingdom?.name ?? 'No kingdom',
    rulerAncestry: ancestry(kingdom?.ancestry),
    ancestryName: ancestry(info.ancestry),
    seat: kingdom?.seat === id,
    threatName: own(content.threats, landState?.threat)?.name ?? 'None',
    threatLevel: domainThreatLevel(state.world, id),
    lairThreat: knownLairThreat(state.world, id),
    services: info.services.map((s) => ({ id: s, name: own(content.services, s)?.name ?? s })),
    banner: own(content.towns, info.town)?.banner ?? null,
    coastal: site.coastal,
  }
}

/** A discovered point of interest, as the panels describe it. */
export type PoiInfo = {
  id: string
  name: string
  /** Null when its type is missing from content. */
  category: PoiCategory | null
  typeName: string
  /** The domain that owns it (a settlement id), and that settlement's name. */
  domainId: string
  domainName: string
  /** The kingdom holding the domain. */
  kingdomName: string
  /** The land the domain lies in. */
  landName: string
  /** A lair or active dungeon, feeding its domain's threat until cleared. */
  hostile: boolean
  /** What it adds to its domain's threat now: 0 unless hostile and not cleared. */
  threat: number
  /** The threat roaming the land, which a hostile site feeds. */
  threatName: string
  cleared: boolean
  /** A spring or well: arriving refills the waterskins. */
  water: boolean
}

/** A discovered point of interest; null when it is unknown or not yet discovered. */
export function poiInfo(state: GameState, content: Content, id: string): PoiInfo | null {
  const poi = own(state.world.pois, id)
  if (!poi || !poi.discovered) return null
  const type = own(content.poiTypes, poi.type)
  const home = own(content.settlements, poi.domain)
  const domain = own(state.world.domains, poi.domain)
  const kingdom = state.world.kingdoms.find((k) => k.id === domain?.kingdom)
  const land = domain?.land ?? home?.region
  const hostile = type?.hostile ?? poi.threat > 0
  return {
    id,
    name: poi.name,
    category: type?.category ?? null,
    typeName: type?.name ?? poi.type,
    domainId: poi.domain,
    domainName: settlementName(state, poi.domain),
    kingdomName: kingdom?.name ?? 'No kingdom',
    landName: own(content.regions, land)?.name ?? land ?? '?',
    hostile,
    threat: hostile && !poi.cleared ? poi.threat : 0,
    threatName: own(content.threats, own(state.world.lands, land)?.threat)?.name ?? 'None',
    cleared: poi.cleared,
    water: type?.water ?? false,
  }
}

/** One way to walk a road: what it costs and what it risks at that pace. */
export type PaceOption = {
  pace: Pace
  /** Covering tracks (cautious only): slower, but pursuers lose the trail and ambushes give Edge. */
  coverTracks: boolean
  days: number
  /** Water and food over the journey: needed, carried, expected foraging, and shortfalls. */
  water: WaterForecast
  food: SupplyForecast
  /** Who forages each day at this pace, the DC and the odds; null at sea or without foraging. */
  forage: ForageCheck | null
  /** Supply and exhaustion warnings, as codes with params (warningText for English). */
  warnings: TravelWarning[]
  /** The encounter budget, fewest to most. */
  encounters: [number, number]
  /** The chance each slot above the fewest fills. */
  chance: number
  /** The share of hostile encounters the party steers clear of. */
  hostileAvoided: number
  /** The footing an ambush meets the party on. */
  ambush: Position
}

/** The paces a land road offers, in order; a sea crossing has only steady. */
const LAND_PACES: readonly [Pace, boolean][] = [
  ['cautious', false],
  ['cautious', true],
  ['steady', false],
  ['brisk', false],
  ['forced', false],
]

function paceOptions(
  state: GameState,
  route: Route,
  threatLevel: number,
  forage: boolean,
  meets: boolean
): PaceOption[] {
  const paces = route.terrain === 'sea' ? LAND_PACES.filter(([p]) => p === 'steady') : LAND_PACES
  return paces.map(([pace, coverTracks]) => {
    const { days, water, food, warnings } = forecastJourney(state, route, pace, coverTracks, forage)
    return {
      pace,
      coverTracks,
      days,
      water,
      food,
      forage: forage ? forageCheck(state, route.terrain, pace) : null,
      warnings,
      ...routeEncounters(meets, days, route.danger, threatLevel, pace),
      hostileAvoided: paceHostileAvoidance(pace),
      ambush: ambushPositionForPace(pace, coverTracks),
    }
  })
}

/** Why a road can't be taken now, as a code with params (roadReasonText for English). */
export type RoadReason =
  { code: 'busy' } | { code: 'unfit' } | { code: 'fare'; params: { gold: number } }

/** The English text of a road reason, until every caller localises the codes. */
export function roadReasonText(r: RoadReason): string {
  switch (r.code) {
    case 'busy':
      return 'Finish the current encounter first.'
    case 'unfit':
      return 'No one is fit to travel.'
    case 'fare':
      return `Passage costs ${r.params.gold} gp.`
  }
}

export type RouteOption = {
  routeId: string
  to: string
  toName: string
  km: number
  /** Days, encounters and chance at a steady pace; `paces` has every pace. */
  days: number
  terrain: Biome
  danger: number
  threatLevel: number
  /** The encounter budget, fewest to most ([0, 0] where nothing can be met, e.g. at sea). */
  encounters: [number, number]
  /** The chance each slot above the fewest fills (0 where nothing can be met). */
  chance: number
  fare: number
  /**
   * Stowing away on a ship the party can't pay for: who sneaks aboard, the DC and the odds; null
   * on land, when the fare is affordable, or when no one is fit.
   */
  stowaway: StowawayCheck | null
  /** Every pace the road can be walked at, with its days, supplies and encounters. */
  paces: PaceOption[]
  /** Why there is no pace choice (SEA_PACE_NOTE at sea), or null. */
  paceNote: string | null
  available: boolean
  /** Why it can't be taken now, or null. */
  reason: RoadReason | null
}

/**
 * The roads and paths out of the current settlement or point of interest, by id (edgesFrom).
 * None while on the road. Supplies assume the party forages each day on land unless `forage` is
 * false.
 */
export function routeOptions(state: GameState, content: Content, forage = true): RouteOption[] {
  const here = state.location
  if (here === null || state.travel) return []
  const busy = inProgress(state)
  const fit = state.party.some(canAct)
  return edgesFrom(state, content, here).map((route) => {
    const to = otherEnd(route, here)
    const days = journeyDays(route)
    const threatLevel = routeThreat(state, content, route)
    const fare = fareFor(route, state.party.length)
    const meets = canMeetEncounters(content, route, state)
    const reason: RoadReason | null = busy
      ? { code: 'busy' }
      : !fit
        ? { code: 'unfit' }
        : state.gold < fare
          ? { code: 'fare', params: { gold: fare } }
          : null
    return {
      routeId: route.id,
      to,
      toName: settlementName(state, to),
      km: route.km,
      days,
      terrain: route.terrain,
      danger: route.danger,
      threatLevel,
      ...routeEncounters(meets, days, route.danger, threatLevel),
      fare,
      stowaway: busy ? null : stowawayCheck(state, route),
      paces: paceOptions(state, route, threatLevel, forage, meets),
      paceNote: route.terrain === 'sea' ? SEA_PACE_NOTE : null,
      available: reason === null,
      reason,
    }
  })
}

export type JourneyInfo = {
  from: string
  fromName: string
  to: string
  toName: string
  km: number
  kmDone: number
  daysDone: number
  days: number
  terrain: Biome | null
  danger: number
  pace: Pace
  coverTracks: boolean
  /** False during an encounter or when no one can walk on (then only camp helps). */
  canMove: boolean
}

export function journeyInfo(state: GameState, content: Content): JourneyInfo | null {
  const t = state.travel
  if (!t) return null
  return {
    from: t.from,
    fromName: settlementName(state, t.from),
    to: t.to,
    toName: settlementName(state, t.to),
    km: t.km,
    kmDone: Math.round(t.kmDone),
    daysDone: t.daysDone,
    days: t.days,
    terrain: routeTerrain(state, content, t),
    danger: edgeById(state, content, t.route)?.danger ?? 0,
    pace: t.pace,
    coverTracks: t.coverTracks,
    canMove: !inProgress(state) && state.party.some(canAct),
  }
}

export type SuppliesInfo = {
  food: number
  water: number
  waterCapacity: number
  /** Whole days the food and water last for the whole party. */
  foodDays: number
  waterDays: number
}

export function suppliesInfo(state: GameState, terrain: Biome | null = null): SuppliesInfo {
  const members = Math.max(1, state.party.length)
  const food = goodsOf(state.goods, 'food')
  const water = goodsOf(state.goods, 'water')
  return {
    food,
    water,
    waterCapacity: partyWaterCapacity(state),
    foodDays: Math.floor(food / members),
    waterDays: Math.floor(water / (members * waterNeed(terrain))),
  }
}
