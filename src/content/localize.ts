import type { Locale, TranslatableKind } from '../schema/content'
import type { Content, ContentError } from './build'

/**
 * Content translations are overlays: a translation names an entry and maps dotted paths to text.
 * English is the source language, so 'en' never has an overlay. The engine never sees them: the
 * UI overlays the strings at render time, and anything untranslated stays English.
 */
export type Language = 'en' | Locale

/** How Content.translations is keyed. */
export const translationKey = (locale: Locale, target: TranslatableKind, id: string): string =>
  `${locale}/${target}/${id}`

/** One step into a value: a record key, or an array item by its `id` or else its index. */
function child(value: unknown, segment: string): unknown {
  if (Array.isArray(value)) {
    const byId = value.find(
      (item) =>
        item !== null && typeof item === 'object' && (item as { id?: unknown }).id === segment
    )
    if (byId !== undefined) return byId
    return /^\d+$/.test(segment) ? value[Number(segment)] : undefined
  }
  if (value !== null && typeof value === 'object' && Object.hasOwn(value, segment)) {
    return (value as Record<string, unknown>)[segment]
  }
  return undefined
}

/** The value at a dotted path such as "stages.start.options.read.label", or undefined. */
export function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, segment) => child(v, segment), value)
}

/** A copy of `value` with the string at `path` replaced. Unresolvable paths leave it unchanged. */
function withText<T>(value: T, segments: string[], text: string): T {
  if (segments.length === 0) return (typeof value === 'string' ? text : value) as T
  const [segment, ...rest] = segments
  const next = child(value, segment)
  if (next === undefined) return value
  const replaced = withText(next, rest, text)
  if (replaced === next) return value
  if (Array.isArray(value)) return value.map((item) => (item === next ? replaced : item)) as T
  return { ...(value as object), [segment]: replaced } as T
}

/** The translated fields of one entry, or null (always null for English). */
export function translationFields(
  content: Content,
  language: Language,
  kind: TranslatableKind,
  id: string
): Readonly<Record<string, string>> | null {
  if (language === 'en') return null
  const key = translationKey(language, kind, id)
  return Object.hasOwn(content.translations, key) ? content.translations[key].fields : null
}

/** `entry` with every translated field overlaid; untranslated fields keep their English text. */
export function overlay<T>(entry: T, fields: Readonly<Record<string, string>> | null): T {
  if (!fields) return entry
  return Object.entries(fields).reduce(
    (e, [path, text]) => withText(e, path.split('.'), text),
    entry
  )
}

/** `entry` (of `kind`) in `language`; English, or an entry without a translation, comes back as is. */
export function localize<T extends { id: string }>(
  entry: T,
  kind: TranslatableKind,
  language: Language,
  content: Content
): T {
  return overlay(entry, translationFields(content, language, kind, entry.id))
}

/** Every translation must name an existing entry, and every path must reach a string in it. */
export function translationErrors(content: Content): ContentError[] {
  const errors: ContentError[] = []
  for (const t of Object.values(content.translations)) {
    const table = content[t.target] as Record<string, unknown>
    if (!Object.hasOwn(table, t.id)) {
      errors.push({
        file: t.file,
        message: `${t.locale} translation of unknown ${t.target} "${t.id}"`,
      })
      continue
    }
    for (const path of Object.keys(t.fields)) {
      if (typeof valueAtPath(table[t.id], path) !== 'string') {
        errors.push({
          file: t.file,
          message: `${t.locale} translation of ${t.target} "${t.id}": "${path}" is not a text field`,
        })
      }
    }
  }
  return errors
}
