import { fillText } from '../engine/encounters/slots'
import type { Good } from '../schema/types'
import type { I18n } from './i18n/I18n'

/** What a contract or an offer needs to have its title and text filled (Offer, ContractRow). */
type Filled = {
  template: string
  title: string
  text: string
  patronName: string
  toName: string
  poiName: string | null
  good: Good | null
  amount: number
  sourceName: string | null
}

/**
 * A contract's title and text in the UI language: the template's translation (data/locales)
 * filled with the same names the engine fills the English with, or the engine's English.
 */
export function contractText(i18n: I18n, c: Filled): { title: string; text: string } {
  const fields = i18n.fields('contracts', c.template)
  if (!fields) return { title: c.title, text: c.text }
  const values = {
    patron: c.patronName,
    dest: c.poiName ?? c.toName,
    site: c.poiName ?? '',
    good: c.good ? i18n.name('goods', c.good, c.good) : '',
    amount: String(c.amount),
    source: c.sourceName ?? '',
  }
  return {
    title: fields.title ? fillText(fields.title, values) : c.title,
    text: fields.text ? fillText(fields.text, values) : c.text,
  }
}
