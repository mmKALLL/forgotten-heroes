import type { Content } from '../../content/build'
import type { AnimalDef } from '../../schema/economy'
import type { Biome, Pace } from '../../schema/types'
import type { GameState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { inProgress } from '../encounters/run'
import { appendLog } from '../log'
import { animalDef, flyingCarpets, workingAnimals, type Hired } from '../economy/capacity'
import { inSettlement, notHere } from '../travel/where'
import { MAX_EXHAUSTION } from '../rules/character'
import {
  ANIMAL_RESALE,
  CAMEL_DESERT_WATER_MAX,
  CAMEL_DESERT_WATER_SAVING,
  MOUNT_ROUGH_SPEED,
  ROUGH_TERRAIN,
} from '../constants'

// Pack animals, carts and mounts (design §3, §5, §7): bought once and kept at no further cost (no
// upkeep: designer call 2026-11-13, their price is higher instead), or riding animals hired for one
// journey to a settlement and returned on arrival.

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

/** The present service that offers an action (its role lists it), or null. */
export function serviceWith(
  state: Pick<GameState, 'world' | 'location' | 'travel'>,
  content: Content,
  action: string
): string | null {
  if (!inSettlement(state) || state.location === null) return null
  const info = own(state.world.settlements, state.location)
  return (
    info?.services.find((s) =>
      (own(content.serviceRoles, s)?.actions as string[] | undefined)?.includes(action)
    ) ?? null
  )
}

/** A mount's speed on this terrain: its own (2 for horses), but MOUNT_ROUGH_SPEED in rough land. */
export const riderSpeed = (def: Pick<AnimalDef, 'speed'>, terrain: Biome): number =>
  ROUGH_TERRAIN.includes(terrain) ? Math.min(def.speed, MOUNT_ROUGH_SPEED) : def.speed

/**
 * The land speed multiplier mounts give. The party travels at its slowest traveller (designer
 * decision): mounts help only when every member rides (hired or owned riding animals), and then
 * at the slowest mount's speed on this terrain; anyone on foot, or any working pack animal or
 * vehicle (mule, donkey, cart, wagon), sets a walking pace (1). Spare riding animals are led at
 * the riders' pace and slow no one. A flying carpet, the party's only animal, flies at its own
 * speed on any terrain (flyingCarpets); among other animals it is rolled up and slows no one.
 */
export function mountSpeed(
  state: Pick<GameState, 'party' | 'animals' | 'travel'>,
  content: Content,
  terrain: Biome,
  hired: Hired | null = state.travel?.hired ?? null
): number {
  if (terrain === 'sea' || state.party.length === 0) return 1
  const carpets = flyingCarpets(state.animals, content, hired)
  if (carpets) return carpets.speed
  const mounts: AnimalDef[] = []
  let walkers = false
  const add = (id: string, n: number) => {
    const def = animalDef(content, id)
    if (!def || def.flies) return
    if (!def.rider) walkers = true
    else for (let i = 0; i < n; i++) mounts.push(def)
  }
  if (hired) add(hired.animal, hired.count)
  for (const [id, n] of Object.entries(workingAnimals(state.animals, content))) add(id, n)
  if (walkers || mounts.length < state.party.length) return 1
  const fastest = mounts.map((m) => riderSpeed(m, terrain)).sort((a, b) => b - a)
  return Math.max(1, fastest[state.party.length - 1])
}

/**
 * Units of water the party's animals (owned and hired) drink a day, before the terrain doubles it:
 * rounded up to whole units, since carried goods are whole (a camel's half unit still opens a skin).
 */
export function animalWater(
  state: Pick<GameState, 'animals' | 'travel'>,
  content: Content,
  hired: Hired | null = state.travel?.hired ?? null
): number {
  const owned = Object.entries(state.animals).reduce(
    (sum, [id, n]) => sum + n * (animalDef(content, id)?.waterPerDay ?? 0),
    0
  )
  const rented = hired ? hired.count * (animalDef(content, hired.animal)?.waterPerDay ?? 0) : 0
  return Math.ceil(owned + rented - 1e-9)
}

/** Working vehicles (`vehicle`: carts and wagons): each adds VEHICLE_HOSTILE to the hostile share. */
export const vehicleCount = (state: Pick<GameState, 'animals'>, content: Content): number =>
  Object.entries(workingAnimals(state.animals, content)).reduce(
    (sum, [id, n]) => sum + (animalDef(content, id)?.vehicle ? n : 0),
    0
  )

/**
 * The slow animal (`slow`: carts, wagons, the donkey) that makes the brisk and forced paces
 * unavailable, by name, or null when the party may hurry. Only working ones count.
 */
export function slowAnimal(state: Pick<GameState, 'animals'>, content: Content): string | null {
  for (const id of Object.keys(workingAnimals(state.animals, content)).sort()) {
    const def = animalDef(content, id)
    if (def?.slow) return def.name
  }
  return null
}

/** The paces a slow animal or vehicle rules out. */
export const HURRIED_PACES: readonly Pace[] = ['brisk', 'forced']

/**
 * Why the party can't set out at this pace, or null: on land, a working slow animal or vehicle (a
 * cart, a wagon, the donkey: slowAnimal) can't be hurried, so the brisk and forced paces are out.
 * The road preview shows them disabled with the reason, and depart refuses them.
 */
export function paceBlock(
  state: Pick<GameState, 'animals'>,
  content: Content,
  terrain: Biome,
  pace: Pace
): { name: string } | null {
  if (terrain === 'sea' || !HURRIED_PACES.includes(pace)) return null
  const name = slowAnimal(state, content)
  return name === null ? null : { name }
}

/** The English text of a pace block. */
export const paceBlockText = (b: { name: string }): string =>
  `The ${b.name.toLowerCase()} can't be hurried.`

/**
 * Whole units of water the party saves each day in the desert with camels (`desertWater`): each
 * working camel CAMEL_DESERT_WATER_SAVING of the living members' water, up to
 * CAMEL_DESERT_WATER_MAX, rounded to the nearest unit (halves up). 0 elsewhere or without camels.
 */
export function camelWaterSaving(
  state: Pick<GameState, 'animals' | 'party'>,
  content: Content,
  terrain: Biome | null
): number {
  if (terrain !== 'desert') return 0
  const living = state.party.filter((c) => c.exhaustion < MAX_EXHAUSTION).length
  const camels = Object.entries(workingAnimals(state.animals, content)).reduce(
    (sum, [id, n]) => sum + (animalDef(content, id)?.desertWater ? n : 0),
    0
  )
  const share = Math.min(CAMEL_DESERT_WATER_MAX, CAMEL_DESERT_WATER_SAVING * camels)
  // The desert doubles a member's water (travel/days.ts waterNeed).
  return Math.round(share * 2 * living)
}

/** Whether a route is a path to (or from) a point of interest, not a road between settlements. */
export const isSitePath = (state: Pick<GameState, 'world'>, route: Pick<Route, 'from' | 'to'>) =>
  Object.hasOwn(state.world.pois, route.from) || Object.hasOwn(state.world.pois, route.to)

/** Why the owned animals can't take a path to a site (a `roadsOnly` one, or rough for a horse), or null. */
export function animalBlock(
  state: Pick<GameState, 'world' | 'animals'>,
  content: Content,
  route: Pick<Route, 'from' | 'to' | 'danger'>
): { name: string; roadsOnly: boolean } | null {
  if (!isSitePath(state, route)) return null
  for (const [id, n] of Object.entries(state.animals)) {
    const def = animalDef(content, id)
    if (!def || n <= 0) continue
    if (def.roadsOnly) return { name: def.name, roadsOnly: true }
    if (def.maxPathDanger !== undefined && route.danger > def.maxPathDanger) {
      return { name: def.name, roadsOnly: false }
    }
  }
  return null
}

/** The English text of an animal block. */
export const animalBlockText = (b: { name: string; roadsOnly: boolean }): string =>
  b.roadsOnly
    ? `No road for the ${b.name.toLowerCase()}.`
    : `The path is too rough for the ${b.name.toLowerCase()}.`

/** Riding animals for hire here for this journey: one per member, by the day. */
export type HireOffer = { animal: string; name: string; count: number; perDay: number }

/**
 * What can be hired here for a journey along `route`: the cheapest riding animal for hire, one
 * per member, when an animals service is present and the road leads (by land) to a settlement.
 * None for a party on a flying carpet, which is faster than any horse.
 */
export function hireOffer(
  state: GameState,
  content: Content,
  route: Pick<Route, 'from' | 'to' | 'terrain'>
): HireOffer | null {
  if (route.terrain === 'sea' || !serviceWith(state, content, 'animals')) return null
  if (flyingCarpets(state.animals, content)) return null
  const to = route.from === state.location ? route.to : route.from
  if (!Object.hasOwn(state.world.settlements, to)) return null
  const def = Object.values(content.animals)
    .filter((a) => a.rider && a.hirePerDay !== undefined)
    .sort((a, b) => a.hirePerDay! - b.hirePerDay! || (a.id < b.id ? -1 : 1))[0]
  if (!def || state.party.length === 0) return null
  return { animal: def.id, name: def.name, count: state.party.length, perDay: def.hirePerDay! }
}

/** The hire for a journey of `days`, paid at departure. */
export const hireCost = (offer: Pick<HireOffer, 'count' | 'perDay'>, days: number): number =>
  Math.ceil(offer.perDay * offer.count * days)

/** What an animal sells back for, in whole gold rounded up. */
export const resaleValue = (def: Pick<AnimalDef, 'price'>): number =>
  Math.ceil(def.price * ANIMAL_RESALE - 1e-9)

/** One animal at an animals service, as the services panel offers it. */
export type AnimalOffer = {
  id: string
  name: string
  price: number
  /** What one sells back for here. */
  resale: number
  /** kg it carries or hauls. */
  capacity: number
  /** Land speed while ridden, or null if it carries no rider. */
  rides: number | null
  owned: number
  /** Why it can't be bought now (gold), or null. */
  buyReason: string | null
}

/**
 * Whether an animal is sold in this settlement (`soldIn`: the flying carpet only in the larger
 * desert towns). Without `soldIn`, every animals service sells it.
 */
export function soldHere(
  state: Pick<GameState, 'world'>,
  content: Content,
  def: Pick<AnimalDef, 'soldIn'>,
  settlementId: string
): boolean {
  const rule = def.soldIn
  if (!rule) return true
  const info = own(state.world.settlements, settlementId)
  const land = own(content.settlements, settlementId)?.region
  const biome = land === undefined ? undefined : own(content.regions, land)?.biome
  if (!info) return false
  if (rule.biomes && (biome === undefined || !rule.biomes.includes(biome))) return false
  return rule.minSizeTier === undefined || info.sizeTier >= rule.minSizeTier
}

/** The animals for sale here, cheapest first; none without an animals service. */
export function animalOffers(state: GameState, content: Content): AnimalOffer[] {
  if (!serviceWith(state, content, 'animals') || state.location === null) return []
  const here = state.location
  return Object.values(content.animals)
    .filter((def) => soldHere(state, content, def, here))
    .sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1))
    .map((def) => ({
      id: def.id,
      name: def.name,
      price: def.price,
      resale: resaleValue(def),
      capacity: def.capacity,
      rides: def.rider || def.flies ? def.speed : null,
      owned: state.animals[def.id] ?? 0,
      buyReason: state.gold < def.price ? 'not enough gold' : null,
    }))
}

/** Buys one animal (or cart) at an animals service. */
export function buyAnimal(state: GameState, content: Content, id: string): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Animals can only be bought in a settlement.'), 'bad')
  }
  if (!serviceWith(state, content, 'animals')) {
    return appendLog(state, 'No one here sells animals.', 'bad')
  }
  const def = animalDef(content, id)
  if (!def) return appendLog(state, `Unknown animal "${id}".`, 'bad')
  if (state.location === null || !soldHere(state, content, def, state.location)) {
    return appendLog(state, `No one here sells a ${def.name.toLowerCase()}.`, 'bad')
  }
  if (state.gold < def.price)
    return appendLog(state, `A ${def.name.toLowerCase()} costs ${def.price} gp.`, 'bad')
  const needs = def.needs && (state.animals[def.needs] ?? 0) <= (state.animals[id] ?? 0)
  const pull = needs
    ? ` It needs a ${animalDef(content, def.needs!)?.name.toLowerCase() ?? def.needs} to pull it.`
    : ''
  return appendLog(
    {
      ...state,
      gold: state.gold - def.price,
      animals: { ...state.animals, [id]: (state.animals[id] ?? 0) + 1 },
    },
    `Bought a ${def.name.toLowerCase()} for ${def.price} gp.${pull}`,
    'info'
  )
}

/** Sells one owned animal (or cart) at an animals service, for ANIMAL_RESALE of its price. */
export function sellAnimal(state: GameState, content: Content, id: string): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Animals can only be sold in a settlement.'), 'bad')
  }
  if (!serviceWith(state, content, 'animals')) {
    return appendLog(state, 'No one here buys animals.', 'bad')
  }
  const def = animalDef(content, id)
  const owned = state.animals[id] ?? 0
  if (!def || owned === 0) return appendLog(state, 'The party has none of those to sell.', 'bad')
  const gold = resaleValue(def)
  const animals = { ...state.animals }
  if (owned === 1) delete animals[id]
  else animals[id] = owned - 1
  return appendLog(
    { ...state, gold: state.gold + gold, animals },
    `Sold a ${def.name.toLowerCase()} for ${gold} gp.`,
    'info'
  )
}

/**
 * The `animals` effect: gains or loses owned animals. A loss without an animal takes stealable
 * ones, most valuable first (horse thieves).
 */
export function changeAnimals(
  state: GameState,
  content: Content,
  change: { animal?: string; amount: number }
): GameState {
  const animals = { ...state.animals }
  const set = (id: string, n: number) => {
    if (n > 0) animals[id] = n
    else delete animals[id]
  }
  if (change.animal) {
    set(change.animal, Math.max(0, (animals[change.animal] ?? 0) + change.amount))
    return { ...state, animals }
  }
  let left = -change.amount
  const stealable = Object.keys(animals)
    .map((id) => animalDef(content, id))
    .filter((d): d is AnimalDef => d !== null && d.stealable)
    .sort((a, b) => b.price - a.price || (a.id < b.id ? -1 : 1))
  for (const def of stealable) {
    if (left <= 0) break
    const taken = Math.min(left, animals[def.id] ?? 0)
    set(def.id, (animals[def.id] ?? 0) - taken)
    left -= taken
  }
  return { ...state, animals }
}
