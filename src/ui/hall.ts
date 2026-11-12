import { RunRecordSchema, type RunRecord } from '../schema/crisis'

// The Hall of the Fallen (Plan 5b U3, design §6): every run that ended, kept in local storage.
// The engine builds the records (`runRecord`); this module only keeps them. Every storage call is
// guarded: blocked or full storage leaves the game playable, with no Hall.

export const HALL_KEY = 'forgotten-heroes/hall/v1'

/** How many runs the Hall keeps; the oldest are dropped first. */
export const HALL_CAP = 50

/** The Hall as stored, every entry as it is; null when it can't be read (storage, or not JSON). */
function readRaw(): unknown[] | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(HALL_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : null
  } catch {
    return null
  }
}

const recordId = (entry: unknown): unknown =>
  typeof entry === 'object' && entry !== null ? (entry as { id?: unknown }).id : undefined

/**
 * The Hall's records, newest first. Records that no longer validate are skipped here, but kept in
 * storage (a later version may read them again).
 */
export function readHall(): RunRecord[] {
  return (readRaw() ?? []).flatMap((r) => {
    const parsed = RunRecordSchema.safeParse(r)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * Records a run, once: a run that ends again (lost, then fallen) replaces its record and moves to
 * the top. Returns whether the Hall changed (false when the run's ending is already recorded).
 */
export function recordRun(record: RunRecord): boolean {
  const held = readHall().find((r) => r.id === record.id)
  if (held && held.ending === record.ending) return false
  // A Hall that isn't a list can't be added to without losing it: it is started again.
  const stored = readRaw() ?? []
  const next = [record, ...stored.filter((r) => recordId(r) !== record.id)].slice(0, HALL_CAP)
  try {
    localStorage.setItem(HALL_KEY, JSON.stringify(next))
  } catch {
    return false // storage full or blocked: the run goes unrecorded
  }
  return true
}
