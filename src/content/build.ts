import { z } from 'zod'
import type { Source } from '../schema/common'
import {
  CONTENT_KINDS,
  fileSchemaFor,
  type ContentEntry,
  type ContentKind,
  type Locale,
  type TranslatableKind,
  type TranslationEntry,
  type TranslationsFile,
} from '../schema/content'
import { translationErrors, translationKey } from './localize'

export type Sourced<T> = T & { source: Source; file: string }
/** A loaded translation: its entry plus the file's locale and target kind. */
export type Translation = TranslationEntry & { locale: Locale; target: TranslatableKind }
type Stored<K extends ContentKind> = K extends 'translations' ? Translation : ContentEntry<K>
/** Every kind by id; translations are keyed "<locale>/<target>/<id>" (see translationKey). */
export type Content = { [K in ContentKind]: Record<string, Sourced<Stored<K>>> }
export type ContentError = { file: string; message: string }

export const emptyContent = (): Content => ({
  classes: {},
  ancestries: {},
  names: {},
  settlementTypes: {},
  services: {},
  skills: {},
  situations: {},
  situationTemplates: {},
  archetypes: {},
  partsTables: {},
  creatures: {},
  twists: {},
  regions: {},
  settlements: {},
  routes: {},
  towns: {},
  placeNames: {},
  threats: {},
  landSpots: {},
  poiTypes: {},
  goods: {},
  serviceRoles: {},
  marketRules: {},
  producers: {},
  animals: {},
  personRoles: {},
  contracts: {},
  accessoryParts: {},
  gatherRules: {},
  translations: {},
})

const isKind = (kind: unknown): kind is ContentKind =>
  typeof kind === 'string' && Object.hasOwn(CONTENT_KINDS, kind)

/** Locale-independent string order (UTF-16 code units), so sorting is the same on every machine. */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const FOLDER = /(?:^|\/)data\/([^/]+)\//
/** Translations live apart from the source folders: data/locales/<locale>/. */
const LOCALE_FOLDER = /(?:^|\/)data\/locales\/([^/]+)\//

/** Pure: validates and merges JSON files keyed by path. Never throws; collects errors. */
export function buildContent(files: Record<string, unknown>): {
  content: Content
  errors: ContentError[]
} {
  const content = emptyContent()
  const errors: ContentError[] = []
  const sorted = Object.entries(files).sort(([a], [b]) => byCodeUnit(a, b))

  for (const [file, json] of sorted) {
    const folder = FOLDER.exec(file)?.[1]
    if (!folder) {
      errors.push({ file, message: 'data files must live in data/<source>/' })
      continue
    }
    if (folder === '_schema') continue
    const localeFolder = folder === 'locales' ? LOCALE_FOLDER.exec(file)?.[1] : undefined
    if (folder === 'locales' && !localeFolder) {
      errors.push({ file, message: 'translation files must live in data/locales/<locale>/' })
      continue
    }

    const kind = (json as { kind?: unknown } | null)?.kind
    if (!isKind(kind)) {
      const expected = Object.keys(CONTENT_KINDS).join(', ')
      errors.push({
        file,
        message: `unknown kind ${JSON.stringify(kind)}; expected one of: ${expected}`,
      })
      continue
    }
    if (localeFolder && kind !== 'translations') {
      errors.push({ file, message: `only translations belong in data/locales/, not ${kind}` })
      continue
    }
    if (!localeFolder && kind === 'translations') {
      errors.push({ file, message: 'translations must live in data/locales/<locale>/' })
      continue
    }

    const parsed = fileSchemaFor(kind).safeParse(json)
    if (!parsed.success) {
      errors.push({ file, message: z.prettifyError(parsed.error) })
      continue
    }

    if (localeFolder) {
      // A translation's source says who wrote it; the folder names the locale instead.
      const data = parsed.data as TranslationsFile
      if (data.locale !== localeFolder) {
        errors.push({
          file,
          message: `locale "${data.locale}" does not match folder data/locales/${localeFolder}/`,
        })
        continue
      }
      for (const entry of data.entries) {
        const key = translationKey(data.locale, data.target, entry.id)
        if (Object.hasOwn(content.translations, key)) {
          const existing = content.translations[key]
          errors.push({
            file,
            message: `duplicate ${data.locale} translation of ${data.target} "${entry.id}" (already in ${existing.file})`,
          })
          continue
        }
        content.translations[key] = {
          ...entry,
          locale: data.locale,
          target: data.target,
          source: data.source,
          file,
        }
      }
      continue
    }

    if (parsed.data.source !== folder) {
      errors.push({
        file,
        message: `source "${parsed.data.source}" does not match folder data/${folder}/`,
      })
      continue
    }

    const table = content[kind] as Record<string, Sourced<{ id: string }>>
    for (const entry of parsed.data.entries as { id: string }[]) {
      if (Object.hasOwn(table, entry.id)) {
        const existing = table[entry.id]
        errors.push({
          file,
          message: `duplicate ${kind} id "${entry.id}" (already in ${existing.file})`,
        })
        continue
      }
      table[entry.id] = { ...entry, source: parsed.data.source, file }
    }
  }
  // Translations can only be checked once everything they point at has loaded.
  errors.push(...translationErrors(content))
  return { content, errors }
}

/** Entries sorted by id, for deterministic iteration (and so deterministic RNG use). */
export const sortedEntries = <T extends { id: string }>(table: Record<string, T>): T[] =>
  Object.values(table).sort((a, b) => byCodeUnit(a.id, b.id))
