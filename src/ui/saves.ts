import type { Content } from '../content/build'
import { SAVE_KEY, UNREADABLE_SAVE_KEY, deserialize, serialize } from '../engine/save'
import type { GameState } from '../schema/state'

// Save slots in local storage (Plan 5b, U1; design §6: ironman, so no manual save or copying).
// Every storage call is guarded: blocked or full storage leaves the game playable, unsaved.

/** How many save slots there are. */
export const SLOT_COUNT = 3

/** The slot played last, remembered across reloads. */
export const ACTIVE_SLOT_KEY = 'forgotten-heroes/active-slot'

/** Slot 1 is the original single save's key, so an existing save is slot 1 without moving. */
export const slotKey = (slot: number): string =>
  slot === 1 ? SAVE_KEY : `${SAVE_KEY}/slot-${slot}`

/** Where a slot's save that no longer loads is copied, so a new game there doesn't destroy it. */
export const unreadableKey = (slot: number): string =>
  slot === 1 ? UNREADABLE_SAVE_KEY : `${slotKey(slot)}/unreadable`

export const SLOTS: readonly number[] = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1)

const isSlot = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT

function get(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage blocked or unavailable
  }
}

function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage full or blocked: the game still works, it just won't persist
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // storage blocked: nothing to do
  }
}

/** The remembered slot, or slot 1 (where a save from before slots lives). */
export function activeSlot(): number {
  const n = Number(get(ACTIVE_SLOT_KEY))
  return isSlot(n) ? n : 1
}

export function setActiveSlot(slot: number): void {
  if (isSlot(slot)) set(ACTIVE_SLOT_KEY, String(slot))
}

export type SlotContents =
  { kind: 'empty' } | { kind: 'unreadable' } | { kind: 'saved'; state: GameState }

/** What a slot holds, without changing anything. */
export function readSlot(slot: number, content: Content): SlotContents {
  const text = get(slotKey(slot))
  if (!text) return { kind: 'empty' }
  const state = deserialize(text, content)
  return state ? { kind: 'saved', state } : { kind: 'unreadable' }
}

/**
 * The slot's game, to play it. An unreadable save is first copied to the slot's backup key, as
 * the new game about to start there would overwrite it.
 */
export function loadSlot(slot: number, content: Content): GameState | null {
  const text = get(slotKey(slot))
  if (!text) return null
  const state = deserialize(text, content)
  if (!state) set(unreadableKey(slot), text)
  return state
}

/** Copies an unreadable save to its backup key before it is replaced (a no-op otherwise). */
export function backUpIfUnreadable(slot: number, content: Content): void {
  loadSlot(slot, content)
}

export function writeSlot(slot: number, state: GameState): void {
  set(slotKey(slot), serialize(state))
}

/** Empties a slot. An unreadable save is kept under its backup key. */
export function deleteSlot(slot: number, content: Content): void {
  backUpIfUnreadable(slot, content)
  remove(slotKey(slot))
}
