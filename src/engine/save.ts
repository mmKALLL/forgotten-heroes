import { GameStateSchema, type GameState } from '../schema/state'

export const SAVE_KEY = 'forgotten-heroes/save/v1'
/** Where a save that no longer loads is copied, so a new game doesn't destroy it. */
export const UNREADABLE_SAVE_KEY = `${SAVE_KEY}/unreadable`

/** Bump this (and GameStateSchema's `version` literal) when GameState's shape changes. */
export const CURRENT_SAVE_VERSION = 2

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
 * Upgrades a parsed save to the current version, one step at a time.
 * When GameState changes, add `case n: return migrate(vNToVNPlus1(raw))` above the current case.
 * Unknown versions throw, so `deserialize` reports them as unreadable.
 */
export function migrate(raw: unknown): unknown {
  const version =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as { version?: unknown }).version
      : undefined
  switch (version) {
    case 1:
      return migrate(v1ToV2(raw as Record<string, unknown>))
    case CURRENT_SAVE_VERSION:
      return raw
    default:
      throw new Error(`unsupported save version: ${String(version)}`)
  }
}

export function deserialize(text: string): GameState | null {
  try {
    const parsed = GameStateSchema.safeParse(migrate(JSON.parse(text)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
