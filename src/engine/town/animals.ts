import type { Content } from '../../content/build'
import type { AnimalDef } from '../../schema/economy'
import type { Biome } from '../../schema/types'
import type { GameState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { appendLog } from '../log'
import { animalDef, workingAnimals, type Hired } from '../economy/capacity'
import { inSettlement, notHere } from '../travel/where'
import { ANIMAL_RESALE, MOUNT_ROUGH_SPEED, ROUGH_TERRAIN } from '../constants'

// Pack animals, carts and mounts (design §3, §7): bought and kept (with daily upkeep), or riding
// animals hired for one journey to a settlement and returned on arrival.

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
 * The land speed multiplier mounts give: when every member has a mount (hired or owned riding
 * animals), the slowest mount's speed on this terrain; otherwise 1 (the party walks).
 */
export function mountSpeed(
  state: Pick<GameState, 'party' | 'animals' | 'travel'>,
  content: Content,
  terrain: Biome,
  hired: Hired | null = state.travel?.hired ?? null
): number {
  if (terrain === 'sea' || state.party.length === 0) return 1
  const mounts: AnimalDef[] = []
  const add = (id: string, n: number) => {
    const def = animalDef(content, id)
    if (def?.rider) for (let i = 0; i < n; i++) mounts.push(def)
  }
  if (hired) add(hired.animal, hired.count)
  for (const [id, n] of Object.entries(workingAnimals(state.animals, content))) add(id, n)
  if (mounts.length < state.party.length) return 1
  const fastest = mounts.map((m) => riderSpeed(m, terrain)).sort((a, b) => b - a)
  return Math.max(1, fastest[state.party.length - 1])
}

/** Units of water the party's animals (owned and hired) drink a day, before the terrain doubles it. */
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
  return owned + rented
}

/** What the owned animals cost a day: fodder, stabling and care. */
export const animalUpkeep = (state: Pick<GameState, 'animals'>, content: Content): number =>
  Object.entries(state.animals).reduce(
    (sum, [id, n]) => sum + n * (animalDef(content, id)?.upkeepPerDay ?? 0),
    0
  )

/**
 * A day's upkeep for the owned animals, with anything owed from before, paid as far as the gold
 * goes; the rest stays owed (upkeepOwed).
 */
export function payUpkeep(state: GameState, content: Content): GameState {
  const due = animalUpkeep(state, content) + state.upkeepOwed
  if (due <= 0) return state
  const paid = Math.min(state.gold, Math.floor(due))
  const owed = Math.round((due - paid) * 100) / 100
  const next = { ...state, gold: state.gold - paid, upkeepOwed: owed }
  // Fractions of a gp carry over quietly: only a whole gp the purse can't cover is news.
  if (paid < Math.floor(due) && state.upkeepOwed < 1) {
    return appendLog(next, 'There is no coin left for the animals’ fodder and stabling.', 'bad')
  }
  return next
}

/** Whether a route is a path to (or from) a point of interest, not a road between settlements. */
export const isSitePath = (state: Pick<GameState, 'world'>, route: Pick<Route, 'from' | 'to'>) =>
  Object.hasOwn(state.world.pois, route.from) || Object.hasOwn(state.world.pois, route.to)

/** Why the owned animals can't take a path to a site (a cart keeps to roads), or null. */
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
 */
export function hireOffer(
  state: GameState,
  content: Content,
  route: Pick<Route, 'from' | 'to' | 'terrain'>
): HireOffer | null {
  if (route.terrain === 'sea' || !serviceWith(state, content, 'animals')) return null
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

/** What an animal sells back for. */
export const resaleValue = (def: Pick<AnimalDef, 'price'>): number =>
  Math.floor(def.price * ANIMAL_RESALE)

/** One animal at an animals service, as the services panel offers it. */
export type AnimalOffer = {
  id: string
  name: string
  price: number
  /** What one sells back for here. */
  resale: number
  /** kg it carries or hauls. */
  capacity: number
  /** gp a day while owned. */
  upkeep: number
  /** Land speed while ridden, or null if it carries no rider. */
  rides: number | null
  owned: number
  /** Why it can't be bought now (gold), or null. */
  buyReason: string | null
}

/** The animals for sale here, cheapest first; none without an animals service. */
export function animalOffers(state: GameState, content: Content): AnimalOffer[] {
  if (!serviceWith(state, content, 'animals')) return []
  return Object.values(content.animals)
    .sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1))
    .map((def) => ({
      id: def.id,
      name: def.name,
      price: def.price,
      resale: resaleValue(def),
      capacity: def.capacity,
      upkeep: def.upkeepPerDay,
      rides: def.rider ? def.speed : null,
      owned: state.animals[def.id] ?? 0,
      buyReason: state.gold < def.price ? `costs ${def.price} gp` : null,
    }))
}

/** Buys one animal (or cart) at an animals service. */
export function buyAnimal(state: GameState, content: Content, id: string): GameState {
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Animals can only be bought in a settlement.'), 'bad')
  }
  if (!serviceWith(state, content, 'animals')) {
    return appendLog(state, 'No one here sells animals.', 'bad')
  }
  const def = animalDef(content, id)
  if (!def) return appendLog(state, `Unknown animal "${id}".`, 'bad')
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
