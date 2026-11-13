import type { Content } from '../../content/build'
import type { AnimalDef } from '../../schema/economy'
import type { Character, GameState, Goods, TravelState } from '../../schema/state'
import { MAX_EXHAUSTION, canAct } from '../rules/character'
import { goodsWeight } from './goods'
import { carryBonus } from '../gear/hooks'
import {
  CARRY_BASE_KG,
  CARRY_EXHAUSTED_AT,
  CARRY_EXHAUSTED_SHARE,
  CARRY_MAX,
  CARRY_MIN,
  CARRY_PER_STR,
  ENCUMBERED_SPEED,
  OVERLOAD_RATIO,
} from '../constants'

// Carrying capacity (design §3): what the party can haul, in kg, by STR, pack animals and carts.

/** Mounts hired for one journey (TravelState.hired). */
export type Hired = NonNullable<TravelState['hired']>

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * What one member carries: CARRY_BASE_KG × (1 + CARRY_PER_STR × (STR − 10)), within CARRY_MIN
 * and CARRY_MAX; halved from CARRY_EXHAUSTED_AT levels of exhaustion. A worn `carry` hook adds
 * its kg on top (gear/hooks.ts).
 */
export function memberCapacity(
  c: Pick<Character, 'abilities' | 'exhaustion'> & Partial<Pick<Character, 'accessory'>>
): number {
  const factor = clamp(1 + CARRY_PER_STR * (c.abilities.str - 10), CARRY_MIN, CARRY_MAX)
  const tired = c.exhaustion >= CARRY_EXHAUSTED_AT ? CARRY_EXHAUSTED_SHARE : 1
  return CARRY_BASE_KG * factor * tired + carryBonus(c)
}

export const animalDef = (content: Content, id: string): AnimalDef | null =>
  Object.hasOwn(content.animals, id) ? content.animals[id] : null

/**
 * Owned animals that can move: one that `needs` another (a cart needs a mule) counts only as
 * often as the other is owned. Unknown animals count for nothing.
 */
export function workingAnimals(
  animals: Readonly<Record<string, number>>,
  content: Content
): Record<string, number> {
  const working: Record<string, number> = {}
  for (const [id, count] of Object.entries(animals)) {
    const def = animalDef(content, id)
    if (!def || count <= 0) continue
    const n = def.needs ? Math.min(count, animals[def.needs] ?? 0) : count
    if (n > 0) working[id] = n
  }
  return working
}

/**
 * The flying carpets the party flies on (`flies` in animals.json), or null when it walks: they fly
 * only when they are its only animals, owned or hired (no mule or horse can keep up). Flying, the
 * carpets carry the whole party and their own `capacity` in cargo, whatever the members'
 * strength, at their `speed` on any terrain and any path (town/animals.ts mountSpeed).
 */
export function flyingCarpets(
  animals: Readonly<Record<string, number>>,
  content: Content,
  hired: Hired | null = null
): { count: number; capacity: number; speed: number } | null {
  if (hired && hired.count > 0) return null
  const working = Object.entries(workingAnimals(animals, content))
  if (working.length === 0) return null
  let count = 0
  let capacity = 0
  let speed = Infinity
  for (const [id, n] of working) {
    const def = animalDef(content, id)
    if (!def?.flies) return null
    count += n
    capacity += n * def.capacity
    speed = Math.min(speed, def.speed)
  }
  return { count, capacity, speed }
}

/**
 * What owned (working) animals and hired mounts carry. A flying carpet among other animals is
 * rolled up and carries nothing (flyingCarpets).
 */
export function animalCapacity(
  animals: Readonly<Record<string, number>>,
  content: Content,
  hired: Hired | null = null
): number {
  const owned = Object.entries(workingAnimals(animals, content)).reduce((sum, [id, n]) => {
    const def = animalDef(content, id)
    return def && !def.flies ? sum + n * def.capacity : sum
  }, 0)
  const rented = hired ? hired.count * (animalDef(content, hired.animal)?.capacity ?? 0) : 0
  return owned + rented
}

/**
 * The party's carrying capacity: every member able to act, plus owned animals and the mounts
 * hired for this journey (or `hired`, to preview hiring). On a flying carpet, the carpet's fixed
 * cargo instead (flyingCarpets).
 */
export function carryCapacity(
  state: Pick<GameState, 'party' | 'animals' | 'travel'>,
  content: Content,
  hired: Hired | null = state.travel?.hired ?? null
): number {
  const carpets = flyingCarpets(state.animals, content, hired)
  if (carpets) return carpets.capacity
  const members = state.party.filter(canAct).reduce((sum, c) => sum + memberCapacity(c), 0)
  return members + animalCapacity(state.animals, content, hired)
}

export type LoadLevel = 'light' | 'encumbered' | 'overloaded'

export type Load = {
  /** kg carried. */
  weight: number
  /** kg the party carries without slowing down. */
  capacity: number
  /** weight / capacity (Infinity when something is carried with no capacity at all). */
  ratio: number
  level: LoadLevel
}

/** A weapon's or armour's weight in kg (0 when unknown or none). */
export function pieceWeight(content: Content, id: string | null): number {
  if (!id) return 0
  if (Object.hasOwn(content.weapons, id)) return content.weapons[id].weight ?? 0
  return Object.hasOwn(content.armours, id) ? (content.armours[id].weight ?? 0) : 0
}

/**
 * What the party's weapons and armour weigh (Plan 7 Track C): what living members wear, and the
 * stash (town/arms.ts).
 */
export function gearWeight(
  state: Pick<GameState, 'party'> & Partial<Pick<GameState, 'stash'>>,
  content: Content
): number {
  const worn = state.party
    .filter((c) => c.exhaustion < MAX_EXHAUSTION)
    .reduce(
      (sum, c) => sum + pieceWeight(content, c.gear.weapon) + pieceWeight(content, c.gear.armour),
      0
    )
  return worn + (state.stash ?? []).reduce((sum, id) => sum + pieceWeight(content, id), 0)
}

/** Light up to capacity, encumbered up to OVERLOAD_RATIO × capacity, overloaded beyond. */
export const loadLevel = (ratio: number): LoadLevel =>
  ratio > OVERLOAD_RATIO ? 'overloaded' : ratio > 1 ? 'encumbered' : 'light'

/**
 * How heavily the party is laden: its goods, and its weapons and armour (gearWeight); with other
 * `goods` or `hired` mounts to preview a change.
 */
export function load(
  state: Pick<GameState, 'party' | 'animals' | 'travel' | 'goods'> &
    Partial<Pick<GameState, 'stash'>>,
  content: Content,
  options: { goods?: Goods; hired?: Hired | null } = {}
): Load {
  const weight = goodsWeight(options.goods ?? state.goods, content) + gearWeight(state, content)
  const capacity = carryCapacity(
    state,
    content,
    options.hired === undefined ? (state.travel?.hired ?? null) : options.hired
  )
  const ratio = weight === 0 ? 0 : capacity === 0 ? Infinity : weight / capacity
  return { weight, capacity, ratio, level: loadLevel(ratio) }
}

/** kg to drop or sell before an overloaded party may set out (0 when it may). */
export const overloadExcess = (l: Pick<Load, 'weight' | 'capacity'>): number =>
  Math.max(0, Math.ceil(l.weight - l.capacity * OVERLOAD_RATIO - 1e-9))

/** The share of its land speed the party keeps under this load. */
export const loadSpeed = (level: LoadLevel): number => (level === 'light' ? 1 : ENCUMBERED_SPEED)
