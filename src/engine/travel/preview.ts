import type { Content } from '../../content/build'
import type { Biome, Pace, Position } from '../../schema/constants'
import type { GameState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { inProgress } from '../encounters/run'
import { canAct } from '../rules/character'
import { otherEnd, routesFrom, settlementName } from '../world/geo'
import { ambushPositionForPace, paceHostileAvoidance } from './pace'
import {
  encounterChance,
  encounterRange,
  fareFor,
  journeyDays,
  routeTerrain,
  routeThreat,
} from './routes'
import { goodsOf, journeySupplies, waterCapacity, waterNeed } from './supplies'

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
  population: number
  regionName: string
  biome: Biome | null
  kingdomName: string
  /** The ruling ancestry's name. */
  rulerAncestry: string
  /** The settlement's own predominant ancestry. */
  ancestryName: string
  /** True for the kingdom's seat. */
  seat: boolean
  threatName: string
  threatLevel: number
  services: { id: string; name: string }[]
  /** The town map, as a path under assets/, or null. */
  banner: string | null
  coastal: boolean
}

export function placeInfo(state: GameState, content: Content, id: string): PlaceInfo | null {
  const site = own(content.settlements, id)
  const info = own(state.world.settlements, id)
  if (!site || !info) return null
  const region = own(content.regions, site.region)
  const regionState = own(state.world.regions, site.region)
  const kingdom = state.world.kingdoms.find((k) => k.id === regionState?.kingdom)
  const ancestry = (aid: string | undefined) => own(content.ancestries, aid)?.name ?? aid ?? '?'
  return {
    id,
    name: info.name,
    typeName: own(content.settlementTypes, info.type)?.name ?? info.type,
    sizeLabel: SIZE_LABELS[info.sizeTier],
    population: info.population,
    regionName: region?.name ?? site.region,
    biome: region?.biome ?? null,
    kingdomName: kingdom?.name ?? 'No kingdom',
    rulerAncestry: ancestry(kingdom?.ancestry),
    ancestryName: ancestry(info.ancestry),
    seat: kingdom?.capital === id,
    threatName: own(content.threats, regionState?.threat)?.name ?? 'None',
    threatLevel: regionState?.threatLevel ?? 0,
    services: info.services.map((s) => ({ id: s, name: own(content.services, s)?.name ?? s })),
    banner: own(content.towns, info.town)?.banner ?? null,
    coastal: site.coastal,
  }
}

/** One way to walk a road: what it costs and what it risks at that pace. */
export type PaceOption = {
  pace: Pace
  /** Covering tracks (cautious only): slower, but pursuers lose the trail and ambushes give Edge. */
  coverTracks: boolean
  days: number
  /** Food and water the whole party needs for the journey. */
  food: number
  water: number
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

function paceOptions(route: Route, members: number, threatLevel: number): PaceOption[] {
  const paces = route.terrain === 'sea' ? LAND_PACES.filter(([p]) => p === 'steady') : LAND_PACES
  return paces.map(([pace, coverTracks]) => {
    const { days, food, water } = journeySupplies(route, members, pace, coverTracks)
    return {
      pace,
      coverTracks,
      days,
      food,
      water,
      encounters: encounterRange(days),
      chance: encounterChance(route.danger, threatLevel, pace),
      hostileAvoided: paceHostileAvoidance(pace),
      ambush: ambushPositionForPace(pace, coverTracks),
    }
  })
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
  /** The encounter budget, fewest to most. */
  encounters: [number, number]
  /** The chance each slot above the fewest fills. */
  chance: number
  fare: number
  /** Every pace the road can be walked at, with its days, supplies and encounters. */
  paces: PaceOption[]
  /** Why there is no pace choice (SEA_PACE_NOTE at sea), or null. */
  paceNote: string | null
  available: boolean
  /** Why it can't be taken now, or null. */
  reason: string | null
}

/** The roads out of the current settlement, by route id. None while on the road. */
export function routeOptions(state: GameState, content: Content): RouteOption[] {
  const here = state.location
  if (here === null || state.travel) return []
  const busy = inProgress(state)
  const fit = state.party.some(canAct)
  return routesFrom(content, here).map((route) => {
    const to = otherEnd(route, here)
    const days = journeyDays(route)
    const threatLevel = routeThreat(state, content, route)
    const fare = fareFor(route, state.party.length)
    const reason = busy
      ? 'Finish the current encounter first.'
      : !fit
        ? 'No one is fit to travel.'
        : state.gold < fare
          ? `Passage costs ${fare} gp.`
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
      encounters: encounterRange(days),
      chance: encounterChance(route.danger, threatLevel),
      fare,
      paces: paceOptions(route, state.party.length, threatLevel),
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
    terrain: routeTerrain(content, t),
    danger: own(content.routes, t.route)?.danger ?? 0,
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
    waterCapacity: waterCapacity(state.party.length),
    foodDays: Math.floor(food / members),
    waterDays: Math.floor(water / (members * waterNeed(terrain))),
  }
}
