import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { Settlement, WorldState } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { generatePeople } from '../town/people'
import { generatePolitics } from './politics'
import { domainThreatLevel, generatePois } from './pois'
import { generateSettlements } from './settlements'
import { territory } from './territory'

/** Mixed into the run seed, so the world and the run draw from separate streams. */
export const WORLD_SALT = 0x5eeda17a

export const worldSeed = (seed: number): number => (seed ^ WORLD_SALT) >>> 0

/**
 * Mixed into the world seed for the starting pick, so where a party starts doesn't follow from
 * the first draws that rolled the world (the kingdom count and seeds).
 */
export const START_SALT = 0x57a27ed5

/**
 * The political layer for a world seed, in one RNG stream: domain territory (from content), then
 * kingdoms, land threats and garrisons, then points of interest, then settlements. Notable people
 * come last, from their own stream (town/people.ts). Pure.
 */
export function generateWorld(seed: number, content: Content): WorldState {
  const world = withRng(createRng(seed), (d) => {
    const usedNames = new Set<string>()
    const land = territory(content)
    const { kingdoms, lands, domains } = generatePolitics(d, content, land, usedNames)
    const pois = generatePois(d, content, land, lands, { usedNames })
    const settlements = generateSettlements(
      d,
      content,
      { seed, kingdoms, lands, domains, pois },
      usedNames
    )
    return { seed, kingdoms, lands, domains, pois, settlements }
  })[0]
  return { ...world, people: generatePeople(seed, content, world) }
}

/**
 * How a new party picks where it begins (design §6):
 * - random: any mainland settlement, of any size or danger (every new party, designer decision);
 * - calm: a small settlement in the calmest mainland domain (kept for tests and tools).
 */
export const START_MODES = ['calm', 'random'] as const
export type StartMode = (typeof START_MODES)[number]

/** Types a party doesn't start in on a calm start: it begins small. */
const GRAND = ['capital', 'city']

/**
 * The mainland: the land mass with the most of this world's settlements (ties by name), and its
 * settlements by id. Null for an empty world.
 */
export function mainlandSettlements(world: WorldState, content: Content): Settlement[] | null {
  const sites = sortedEntries(content.settlements).filter((s) =>
    Object.hasOwn(world.settlements, s.id)
  )
  if (sites.length === 0) return null
  const sizes = new Map<string, number>()
  for (const s of sites) sizes.set(s.island, (sizes.get(s.island) ?? 0) + 1)
  const [mainland] = [...sizes].sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))[0]
  return sites.filter((s) => s.island === mainland)
}

/**
 * Where a new party begins, on the largest land mass (the mainland). Picked with the world's
 * seed, so a world always starts in the same place for the same mode. Null for an empty world.
 */
export function startingSettlement(
  world: WorldState,
  content: Content,
  mode: StartMode = 'random'
): string | null {
  const onMainland = mainlandSettlements(world, content)
  if (onMainland === null) return null
  const pick = (pool: Settlement[]) =>
    withRng(createRng((world.seed ^ START_SALT) >>> 0), (d) => d.pick(pool).id)[0]
  if (mode === 'random') return pick(onMainland)

  const small = onMainland.filter((s) => !GRAND.includes(world.settlements[s.id].type))
  const pool = small.length > 0 ? small : onMainland
  const level = (id: string) =>
    Object.hasOwn(world.domains, id) ? domainThreatLevel(world, id, 1) : 3
  const calmest = Math.min(...pool.map((s) => level(s.id)))
  return pick(pool.filter((s) => level(s.id) === calmest))
}
