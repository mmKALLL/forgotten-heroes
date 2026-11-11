import { sortedEntries, byCodeUnit, type Content } from '../../content/build'
import type { SlotSource } from '../../schema/encounter'
import type { Draw } from '../rng'

/** {who}, {Who} (capitalised), {who-job}. Slot names are ids, so only the first letter may be upper case. */
const SLOT = /\{([A-Za-z][a-z0-9]*(?:-[a-z0-9]+)*)\}/g

const uncapitalise = (name: string) => name[0].toLowerCase() + name.slice(1)
const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)

/** The distinct slot names used in a text, in order of first use. */
export function slotNames(text: string): string[] {
  return [...new Set([...text.matchAll(SLOT)].map((m) => uncapitalise(m[1])))]
}

/** Replaces {name} and {Name}. Unknown slots stay visible, so a mistake shows up in play. */
export function fillText(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(SLOT, (match, raw: string) => {
    const name = uncapitalise(raw)
    if (!Object.hasOwn(values, name)) return match
    return raw === name ? values[name] : capitalise(values[name])
  })
}

export const MAX_TABLE_DEPTH = 5

/** Picks a weighted row and expands any {other-table} references inside it. */
export function rollTable(d: Draw, content: Content, tableId: string, depth = 0): string {
  if (depth > MAX_TABLE_DEPTH) throw new Error(`parts table "${tableId}" is too deeply nested (a loop?)`)
  if (!Object.hasOwn(content.partsTables, tableId)) throw new Error(`unknown parts table "${tableId}"`)
  const row = d.weighted(content.partsTables[tableId].rows, (r) => r.weight)
  const values = Object.fromEntries(slotNames(row.text).map((name) => [name, rollTable(d, content, name, depth + 1)]))
  return fillText(row.text, values)
}

/** Fills a situation's declared slots. Slots are rolled in id order so a seed always gives the same text. */
export function rollSlots(d: Draw, content: Content, slots: Readonly<Record<string, SlotSource>>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const name of Object.keys(slots).sort(byCodeUnit)) {
    const source = slots[name]
    if (source.from === 'table') {
      values[name] = rollTable(d, content, source.table)
      continue
    }
    const matches = sortedEntries(content.creatures).filter(
      (c) =>
        (source.types.length === 0 || source.types.includes(c.type)) &&
        (source.maxCr === undefined || c.cr <= source.maxCr)
    )
    if (matches.length === 0) throw new Error(`no creature matches slot "${name}"`)
    const creature = d.pick(matches)
    values[name] = source.form === 'name' ? creature.name : creature.group
  }
  return values
}
