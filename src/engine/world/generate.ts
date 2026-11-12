import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { WorldState } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { generateRegionPolitics } from './politics'
import { generateSettlements } from './settlements'

/** Mixed into the run seed, so the world and the run draw from separate streams. */
export const WORLD_SALT = 0x5eeda17a

export const worldSeed = (seed: number): number => (seed ^ WORLD_SALT) >>> 0

/**
 * Mixed into the world seed for the starting pick, so where a party starts doesn't follow from
 * the first draws that rolled the world (the kingdom count and seeds).
 */
export const START_SALT = 0x57a27ed5

/** The political layer for a world seed: kingdoms, regional threats and settlements. Pure. */
export function generateWorld(seed: number, content: Content): WorldState {
  return withRng(createRng(seed), (d) => {
    const usedNames = new Set<string>()
    const { kingdoms, regions } = generateRegionPolitics(d, content, usedNames)
    const settlements = generateSettlements(d, content, kingdoms, regions, usedNames)
    return { seed, kingdoms, regions, settlements }
  })[0]
}

/**
 * How a new party picks where it begins (design §6), chosen when creating the party:
 * - calm: a small settlement in the calmest mainland region;
 * - random: any mainland settlement, of any size or danger.
 */
export const START_MODES = ['calm', 'random'] as const
export type StartMode = (typeof START_MODES)[number]

/** Types a party doesn't start in on a calm start: it begins small. */
const GRAND = ['capital', 'city']

/**
 * Where a new party begins, on the largest land mass (the mainland). Picked with the world's
 * seed, so a world always starts in the same place for the same mode. Null for an empty world.
 */
export function startingSettlement(
  world: WorldState,
  content: Content,
  mode: StartMode = 'calm'
): string | null {
  const sites = sortedEntries(content.settlements).filter((s) =>
    Object.hasOwn(world.settlements, s.id)
  )
  if (sites.length === 0) return null
  const sizes = new Map<string, number>()
  for (const s of sites) sizes.set(s.island, (sizes.get(s.island) ?? 0) + 1)
  const [mainland] = [...sizes].sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))[0]
  const onMainland = sites.filter((s) => s.island === mainland)
  const pick = (pool: typeof sites) =>
    withRng(createRng((world.seed ^ START_SALT) >>> 0), (d) => d.pick(pool).id)[0]
  if (mode === 'random') return pick(onMainland)

  const small = onMainland.filter((s) => !GRAND.includes(world.settlements[s.id].type))
  const pool = small.length > 0 ? small : onMainland
  const level = (region: string) =>
    Object.hasOwn(world.regions, region) ? world.regions[region].threatLevel : 3
  const calmest = Math.min(...pool.map((s) => level(s.region)))
  return pick(pool.filter((s) => level(s.region) === calmest))
}
