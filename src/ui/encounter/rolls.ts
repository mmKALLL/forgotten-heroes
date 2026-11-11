import type { EncounterState, GameState } from '../../schema/state'

/** Index of the encounter log's latest roll, or −1. */
export const lastRollIndex = (encounter: EncounterState): number =>
  encounter.log.findLastIndex((e) => e.roll)

/**
 * True when `next` adds a roll to the encounter shown in `prev`: the dice animate it, and what it
 * led to stays hidden until they settle. The first log entry is kept by every step of an
 * encounter, so a different one means a different encounter.
 */
export function addsRoll(prev: GameState, next: GameState): boolean {
  const a = prev.encounter
  const b = next.encounter
  if (!a || !b || a.log[0] !== b.log[0]) return false
  return lastRollIndex(b) > lastRollIndex(a)
}
