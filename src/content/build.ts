import { z } from 'zod'
import type { Source } from '../schema/common'
import { CONTENT_KINDS, contentFileSchema, type ContentEntry, type ContentKind } from '../schema/content'

export type Sourced<T> = T & { source: Source; file: string }
export type Content = { [K in ContentKind]: Record<string, Sourced<ContentEntry<K>>> }
export type ContentError = { file: string; message: string }

export const emptyContent = (): Content => ({
  classes: {},
  ancestries: {},
  names: {},
  settlementTypes: {},
  services: {},
})

const isKind = (kind: unknown): kind is ContentKind => typeof kind === 'string' && kind in CONTENT_KINDS

const FOLDER = /(?:^|\/)data\/([^/]+)\//

/** Pure: validates and merges JSON files keyed by path. Never throws; collects errors. */
export function buildContent(files: Record<string, unknown>): { content: Content; errors: ContentError[] } {
  const content = emptyContent()
  const errors: ContentError[] = []
  const sorted = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))

  for (const [file, json] of sorted) {
    const folder = FOLDER.exec(file)?.[1]
    if (!folder) {
      errors.push({ file, message: 'data files must live in data/<source>/' })
      continue
    }
    if (folder === '_schema') continue

    const kind = (json as { kind?: unknown } | null)?.kind
    if (!isKind(kind)) {
      const expected = Object.keys(CONTENT_KINDS).join(', ')
      errors.push({ file, message: `unknown kind ${JSON.stringify(kind)}; expected one of: ${expected}` })
      continue
    }

    const parsed = contentFileSchema(kind).safeParse(json)
    if (!parsed.success) {
      errors.push({ file, message: z.prettifyError(parsed.error) })
      continue
    }
    if (parsed.data.source !== folder) {
      errors.push({ file, message: `source "${parsed.data.source}" does not match folder data/${folder}/` })
      continue
    }

    const table = content[kind] as Record<string, Sourced<{ id: string }>>
    for (const entry of parsed.data.entries as { id: string }[]) {
      const existing = table[entry.id]
      if (existing) {
        errors.push({ file, message: `duplicate ${kind} id "${entry.id}" (already in ${existing.file})` })
        continue
      }
      table[entry.id] = { ...entry, source: parsed.data.source, file }
    }
  }
  return { content, errors }
}

/** Entries sorted by id, for deterministic iteration (and so deterministic RNG use). */
export const sortedEntries = <T extends { id: string }>(table: Record<string, T>): T[] =>
  Object.values(table).sort((a, b) => a.id.localeCompare(b.id))
