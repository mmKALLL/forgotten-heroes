import { sortedEntries, type Content } from '../../content/build'
import { fillText } from '../encounters/slots'
import type { Draw } from '../rng'

/** Random tries before generatePlaceName walks every combination for an unused one. */
export const NAME_TRIES = 20
/** The parts table with realm-name forms such as "Kingdom of {place}". */
export const REALM_TABLE = 'realm-name'

const capitalise = (text: string) => text[0].toUpperCase() + text.slice(1)
const combine = (first: string, second: string) => capitalise(first + second)

/**
 * A place name: a first part plus a second part from a weighted placeNames table, never the
 * same word twice ("Stonestone"). Avoids `used` names while it can.
 */
export function generatePlaceName(
  d: Draw,
  content: Content,
  used: ReadonlySet<string> = new Set()
): string {
  const tables = sortedEntries(content.placeNames)
  if (tables.length === 0) throw new Error('content has no placeNames tables')
  let name = ''
  for (let i = 0; i < NAME_TRIES; i++) {
    const table = d.weighted(tables, (t) => t.weight)
    const first = d.pick(table.first)
    const seconds = table.second.filter((s) => s.toLowerCase() !== first.toLowerCase())
    name = combine(first, d.pick(seconds.length > 0 ? seconds : table.second))
    if (!used.has(name)) return name
  }
  for (const table of tables) {
    for (const first of table.first) {
      for (const second of table.second) {
        const candidate = combine(first, second)
        if (first.toLowerCase() !== second.toLowerCase() && !used.has(candidate)) return candidate
      }
    }
  }
  return name
}

/** A realm's name from the realm-name table, e.g. "Principality of Ravenford". */
export function realmName(d: Draw, content: Content, place: string): string {
  if (!Object.hasOwn(content.partsTables, REALM_TABLE)) return `Kingdom of ${place}`
  const row = d.weighted(content.partsTables[REALM_TABLE].rows, (r) => r.weight)
  return fillText(row.text, { place })
}
