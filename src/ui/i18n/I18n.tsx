import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Content } from '../../content/build'
import { localize, translationFields, type Language } from '../../content/localize'
import { abilityOf, isSkill, statLabel } from '../../engine/rules/abilities'
import type { Tier } from '../../engine/rules/checks'
import type { Ability, CheckStat } from '../../schema/constants'
import type { TranslatableKind } from '../../schema/content'
import { en, type MessageKey, type Messages } from './en'
import { ja } from './ja'

export const LANGUAGES: readonly Language[] = ['en', 'ja']
const DICTIONARIES: Record<Language, Partial<Messages>> = { en, ja }
export const LANGUAGE_KEY = 'forgotten-heroes/ui/lang'

function loadLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'ja' ? 'ja' : 'en'
  } catch {
    return 'en'
  }
}

function saveLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language)
  } catch {
    // Storage unavailable (private mode, quota): the choice just won't persist.
  }
}

/** A UI string in `language`, falling back to English; `{name}` placeholders are filled from vars. */
export function translate(
  language: Language,
  key: MessageKey,
  vars: Readonly<Record<string, string | number>> = {}
): string {
  const text = DICTIONARIES[language][key] ?? en[key]
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match
  )
}

type Context = { language: Language; setLanguage: (l: Language) => void; content: Content | null }

const I18nContext = createContext<Context>({
  language: 'en',
  setLanguage: () => {},
  content: null,
})

/**
 * Holds the UI language (English by default, persisted per viewer) and the content whose
 * translations overlay entries at render time. Without a provider everything is English.
 */
export function I18nProvider({ content, children }: { content: Content; children: ReactNode }) {
  const [language, setLanguageState] = useState(loadLanguage)
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  const value = useMemo(
    () => ({
      language,
      content,
      setLanguage: (l: Language) => {
        setLanguageState(l)
        saveLanguage(l)
      },
    }),
    [language, content]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** UI strings and content names in the current language. */
export function useI18n() {
  const { language, setLanguage, content } = useContext(I18nContext)
  const t = (key: MessageKey, vars?: Readonly<Record<string, string | number>>) =>
    translate(language, key, vars)
  /** The translated fields of a content entry, or null (English, or untranslated). */
  const fields = (kind: TranslatableKind, id: string) =>
    content ? translationFields(content, language, kind, id) : null
  const stat = (s: CheckStat): string =>
    isSkill(s) ? (fields('skills', s)?.name ?? statLabel(s)) : t(`ability.${s}`)
  return {
    language,
    setLanguage,
    t,
    fields,
    /** A content entry with its translated text overlaid. */
    localize: <T extends { id: string }>(entry: T, kind: TranslatableKind): T =>
      content ? localize(entry, kind, language, content) : entry,
    /** A translated entry name, or `fallback` (what the English UI shows). */
    name: (kind: TranslatableKind, id: string, fallback: string): string =>
      fields(kind, id)?.name ?? fallback,
    stat,
    /** "Intimidation", or "Intimidation (CHA)" when a check pairs the skill with another ability. */
    check: (s: CheckStat, ability?: Ability): string =>
      ability && ability !== abilityOf(s)
        ? t('check.withAbility', { skill: stat(s), ability: t(`ability.${ability}`) })
        : stat(s),
    tier: (tier: Tier): string => t(`tier.${tier}`),
  }
}

export type I18n = ReturnType<typeof useI18n>

/** "EN / 日本語" in the top bar; switches the whole UI at once. */
export function LanguageToggle() {
  const { language, setLanguage, t } = useI18n()
  const labels: Record<Language, string> = { en: 'EN', ja: '日本語' }
  return (
    <div className="seg-toggle" role="group" aria-label={t('top.language')}>
      {LANGUAGES.map((l) => (
        <button key={l} lang={l} aria-pressed={language === l} onClick={() => setLanguage(l)}>
          {labels[l]}
        </button>
      ))}
    </div>
  )
}
