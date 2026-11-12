import type { Content } from '../content/build'
import { GameStateSchema, type GameState } from '../schema/state'
import { startingGoods } from './travel/supplies'
import { generateWorld, startingSettlement, worldSeed } from './world/generate'

export const SAVE_KEY = 'forgotten-heroes/save/v1'
/** Where a save that no longer loads is copied, so a new game doesn't destroy it. */
export const UNREADABLE_SAVE_KEY = `${SAVE_KEY}/unreadable`

/** Bump this (and GameStateSchema's `version` literal) when GameState's shape changes. */
export const CURRENT_SAVE_VERSION = 3

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
    case CURRENT_SAVE_VERSION:
      return raw
    default:
      throw new Error(`unsupported save version: ${String(version)}`)
  }
}

/** Old saves need the content: migrating to v3 rolls the world. */
export function deserialize(text: string, content: Content): GameState | null {
  try {
    const parsed = GameStateSchema.safeParse(migrate(JSON.parse(text), content))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
