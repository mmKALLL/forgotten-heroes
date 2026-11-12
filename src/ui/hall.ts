import { RunRecordSchema, type RunRecord } from '../schema/crisis'

// The Hall of the Fallen (Plan 5b U3, design §6): every run that ended, kept in local storage.
// The engine builds the records (`runRecord`); this module only keeps them. Every storage call is
// guarded: blocked or full storage leaves the game playable, with no Hall.

export const HALL_KEY = 'forgotten-heroes/hall/v1'

/** How many runs the Hall keeps; the oldest are dropped first. */
export const HALL_CAP = 50

/** The Hall's records, newest first. Records that no longer validate are dropped. */
export function readHall(): RunRecord[] {
  let raw: unknown
  try {
    raw = JSON.parse(localStorage.getItem(HALL_KEY) ?? '[]')
  } catch {
    return [] // storage blocked, or the Hall is not JSON
  }
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r) => {
    const parsed = RunRecordSchema.safeParse(r)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * Records a run, once: a run that ends again (lost, then fallen) replaces its record and moves to
 * the top. Returns whether the Hall changed (false when the run's ending is already recorded).
 */
export function recordRun(record: RunRecord): boolean {
  const hall = readHall()
  const held = hall.find((r) => r.id === record.id)
  if (held && held.ending === record.ending) return false
  const next = [record, ...hall.filter((r) => r.id !== record.id)].slice(0, HALL_CAP)
  try {
    localStorage.setItem(HALL_KEY, JSON.stringify(next))
  } catch {
    return false // storage full or blocked: the run goes unrecorded
  }
  return true
}
