import type { Content } from '../../content/build'
import { PACES, type Biome, type Pace, type PoiCategory, type Position } from '../../schema/types'
import type { GameState, TravelState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { inProgress } from '../encounters/run'
import { canAct } from '../rules/character'
import { otherEnd, settlementName } from '../world/geo'
import { edgeById, edgesFrom } from '../world/graph'
import { domainThreatLevel, knownLairThreat } from '../world/pois'
import { siteStatus, siteThreat, type SiteStatus } from '../world/sites'
import { ambushPositionForPace } from './pace'
import { load, overloadExcess, type Hired } from '../economy/capacity'
import { visibleWealth } from '../economy/wealth'
import { animalBlock, animalBlockText, animalWater, hireCost, hireOffer } from '../town/animals'
import {
  canMeetEncounters,
  fareFor,
  hostileShare,
  journeyDays,
  landSpeed,
  passengers,
  routeEncounters,
  type HostileShare,
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
import {
  contractDeadlines,
  escortPassengers,
  isEscorting,
  type ContractDeadline,
} from '../town/contracts'
import { POWER_DC } from '../constants'

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
    threatLevel: domainThreatLevel(state.world, id, state.day),
    lairThreat: knownLairThreat(state.world, id, state.day),
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
  /** A lair or active dungeon, feeding its domain's threat while inhabited. */
  hostile: boolean
  /** What it adds to its domain's threat now (siteThreat): 0 unless hostile and inhabited. */
  threat: number
  /** The threat roaming the land, which a hostile site may feed. */
  threatName: string
  /**
   * True when the site is that land threat made concrete (its type's `threats` name it); a
   * hostile site that isn't (e.g. a kobold mine) adds to the domain's threat on its own.
   */
  feedsLandThreat: boolean
  /** Dungeons and lairs are entered rather than visited. */
  entered: boolean
  /**
   * Where a dungeon or lair is in its cycle (siteStatus), with the days since the phase began;
   * null for other sites.
   */
  status: (SiteStatus & { days: number }) | null
  /** What its power adds to every check's DC on a visit (POWER_DC per level). */
  dcBonus: number
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
  const status = siteStatus(state.world.seed, id, poi, state.day)
  const landThreat = own(state.world.lands, land)?.threat
  return {
    id,
    name: poi.name,
    category: type?.category ?? poi.category,
    typeName: type?.name ?? poi.type,
    domainId: poi.domain,
    domainName: settlementName(state, poi.domain),
    kingdomName: kingdom?.name ?? 'No kingdom',
    landName: own(content.regions, land)?.name ?? land ?? '?',
    hostile,
    threat: siteThreat(state.world.seed, id, poi, state.day),
    threatName: own(content.threats, landThreat)?.name ?? 'None',
    feedsLandThreat: landThreat !== undefined && (type?.threats.includes(landThreat) ?? false),
    entered: poi.category === 'dungeon' || poi.category === 'lair',
    status: status && { ...status, days: Math.max(0, state.day - status.since) },
    dcBonus: (status?.power ?? 0) * POWER_DC,
    water: type?.water ?? false,
  }
}

/** One way to walk a road: what it costs and what it risks at that pace. */
export type PaceOption = {
  /** Stealthy covers the party's tracks: pursuers lose the trail, and ambushes give Edge. */
  pace: Pace
  days: number
  /** Water and food over the journey: needed, carried, expected foraging, and shortfalls. */
  water: WaterForecast
  food: SupplyForecast
  /** Who forages each day at this pace, the DC and the odds; null at sea or without foraging. */
  forage: ForageCheck | null
  /** Supply and exhaustion warnings, as codes with params (warningText for English). */
  warnings: TravelWarning[]
  /** The encounter budget, fewest to most, rolled once at departure (at most one a day). */
  encounters: [number, number]
  /** The chance each slot above the fewest fills (ENCOUNTER_SLOT_CHANCE, or 0). */
  chance: number
  /**
   * How likely each encounter is to be hostile (with foraging as chosen): `share` is after the
   * pace's avoidance (avoided ones are quiet days), with what raises it and what avoidance takes off.
   */
  hostile: HostileShare
  /** The footing an ambush meets the party on (with foraging as chosen). */
  ambush: Position
  /**
   * What foraging changes at this pace, to explain the toggle: the hostile share and ambush
   * footing with and without it. Null at sea, where no one forages.
   */
  forageTradeOff: {
    foraging: { hostile: number; ambush: Position }
    notForaging: { hostile: number; ambush: Position }
  } | null
  /**
   * For each active contract bound for this road's end (its destination or site): the day the
   * party would arrive at this pace, the deadline, and whether that is in time.
   */
  deadlines: ContractDeadline[]
}

function paceOptions(
  state: GameState,
  content: Content,
  route: Route,
  threatLevel: number,
  forage: boolean,
  meets: boolean,
  hired: Hired | null = null
): PaceOption[] {
  const laden = load(state, content, { hired })
  const sea = route.terrain === 'sea'
  // An encumbered party can't force a march (and an overloaded one can't set out at all).
  // The paces a land road offers, slowest first; a sea crossing has only steady.
  const paces = sea
    ? PACES.filter((p) => p === 'steady')
    : PACES.filter((p) => p !== 'forced' || laden.level === 'light')
  const speed = landSpeed(state, content, route.terrain, hired)
  const drink = animalWater(state, content, hired)
  const wealth = visibleWealth(state, content).steps
  const escort = isEscorting(state)
  const to = otherEnd(route, state.location ?? route.from)
  const heavy: TravelWarning[] =
    !sea && laden.level !== 'light'
      ? [
          {
            code: 'encumbered',
            params: { weight: Math.ceil(laden.weight), capacity: Math.floor(laden.capacity) },
          },
        ]
      : []
  return paces.map((pace) => {
    const forecast = forecastJourney(state, route, pace, forage, {
      speed,
      content,
      animalWater: drink,
      escorts: escortPassengers(state),
    })
    const { days, water, food } = forecast
    const warnings = [...heavy, ...forecast.warnings]
    // As the journey would record it (depart): no foraging at sea.
    const exposure = (foraging: boolean) => ({
      hostile: hostileShare(route.danger, threatLevel, pace, foraging, wealth, escort),
      ambush: ambushPositionForPace(pace, 'normal', foraging),
    })
    const chosen = exposure(forage && !sea)
    const on = exposure(true)
    const off = exposure(false)
    return {
      pace,
      days,
      water,
      food,
      forage: forage ? forageCheck(state, route.terrain, pace) : null,
      warnings,
      ...routeEncounters(meets, days),
      hostile: chosen.hostile,
      ambush: chosen.ambush,
      forageTradeOff: sea
        ? null
        : {
            foraging: { hostile: on.hostile.share, ambush: on.ambush },
            notForaging: { hostile: off.hostile.share, ambush: off.ambush },
          },
      deadlines: contractDeadlines(state, to, days),
    }
  })
}

/** Why a road can't be taken now, as a code with params (roadReasonText for English). */
export type RoadReason =
  | { code: 'busy' }
  | { code: 'unfit' }
  | { code: 'fare'; params: { gold: number } }
  /** Too heavy to set out on land: drop or sell `kg`. */
  | { code: 'overloaded'; params: { kg: number } }
  /** An owned animal can't take this path to a site: a cart keeps to roads, horses to easy paths. */
  | { code: 'animals'; params: { name: string; roadsOnly: boolean } }
  /** Hiring the mounts for this pace costs more than the party has. */
  | { code: 'hire'; params: { gold: number } }

/** The English text of a road reason, until every caller localises the codes. */
export function roadReasonText(r: RoadReason): string {
  switch (r.code) {
    case 'busy':
      return 'Finish the current encounter first.'
    case 'unfit':
      return 'No one is fit to travel.'
    case 'fare':
      return `Passage costs ${r.params.gold} gp.`
    case 'overloaded':
      return `Too heavy to set out: drop or sell ${r.params.kg} kg.`
    case 'animals':
      return animalBlockText(r.params)
    case 'hire':
      return `Hiring the mounts costs ${r.params.gold} gp.`
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
  /**
   * Riding hired mounts instead (town/animals.ts hireOffer): one per member, paid at departure
   * by the day. Each pace has its own days, cost and encounter budget. Null where none are for
   * hire (no animals service, a path to a site, or at sea).
   */
  mounted: MountedOption | null
}

/** A road ridden on hired mounts. */
export type MountedOption = {
  animal: string
  name: string
  count: number
  perDay: number
  /**
   * Each pace with the hire for its days, and why it can't be ridden now (or null): the road's
   * own reasons, judged with the mounts' capacity, or a hire the party can't pay.
   */
  paces: (PaceOption & { cost: number; reason: RoadReason | null })[]
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
  const laden = load(state, content)
  return edgesFrom(state, content, here).map((route) => {
    const to = otherEnd(route, here)
    const days = journeyDays(route, 'steady', landSpeed(state, content, route.terrain))
    const threatLevel = routeThreat(state, content, route)
    const fare = fareFor(route, passengers(state))
    const blocked = animalBlock(state, content, route)
    const offer = hireOffer(state, content, route)
    const meets = canMeetEncounters(content, route, state)
    const reason: RoadReason | null = busy
      ? { code: 'busy' }
      : !fit
        ? { code: 'unfit' }
        : blocked
          ? { code: 'animals', params: blocked }
          : route.terrain !== 'sea' && laden.level === 'overloaded'
            ? { code: 'overloaded', params: { kg: overloadExcess(laden) } }
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
      ...routeEncounters(meets, days),
      fare,
      stowaway: busy ? null : stowawayCheck(state, route),
      paces: paceOptions(state, content, route, threatLevel, forage, meets),
      paceNote: route.terrain === 'sea' ? SEA_PACE_NOTE : null,
      available: reason === null,
      reason,
      mounted:
        offer && mountedOption(state, content, route, offer, reason, threatLevel, forage, meets),
    }
  })
}

/** A road ridden on hired mounts: the road's reasons with the mounts' capacity, and the hire. */
function mountedOption(
  state: GameState,
  content: Content,
  route: Route,
  offer: NonNullable<ReturnType<typeof hireOffer>>,
  reason: RoadReason | null,
  threatLevel: number,
  forage: boolean,
  meets: boolean
): MountedOption {
  const hired = { animal: offer.animal, count: offer.count }
  const laden = load(state, content, { hired })
  // The mounts carry too: only their load decides whether the party is too heavy to set out.
  const road: RoadReason | null =
    reason?.code === 'overloaded' || reason === null
      ? laden.level === 'overloaded'
        ? { code: 'overloaded', params: { kg: overloadExcess(laden) } }
        : null
      : reason
  return {
    ...offer,
    paces: paceOptions(state, content, route, threatLevel, forage, meets, hired).map((p) => {
      const cost = hireCost(offer, p.days)
      const hire: RoadReason | null =
        state.gold < cost ? { code: 'hire', params: { gold: cost } } : null
      return { ...p, cost, reason: road ?? hire }
    }),
  }
}

export type JourneyInfo = {
  from: string
  fromName: string
  to: string
  toName: string
  km: number
  kmDone: number
  /** The share of the road travelled, 0 to 1 (journeyProgress). */
  progress: number
  daysDone: number
  days: number
  terrain: Biome | null
  danger: number
  pace: Pace
  /** False during an encounter or when no one can walk on (then only camp helps). */
  canMove: boolean
}

/** How far along its road a journey is, as a share of the km from 0 (setting out) to 1 (there). */
export const journeyProgress = (travel: Pick<TravelState, 'km' | 'kmDone'>): number =>
  travel.km > 0 ? Math.min(1, Math.max(0, travel.kmDone / travel.km)) : 1

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
    progress: journeyProgress(t),
    daysDone: t.daysDone,
    days: t.days,
    terrain: routeTerrain(state, content, t),
    danger: edgeById(state, content, t.route)?.danger ?? 0,
    pace: t.pace,
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
