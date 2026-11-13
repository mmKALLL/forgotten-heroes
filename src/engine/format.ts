import type { FaceRange } from './rules/checks'

export const formatModifier = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

/** Never shows a possible outcome as 0% or a failable one as 100%. */
/** A whole number with a true minus sign, and no plus: reputation points, "−4". */
export const formatPoints = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : `${n}`)

export function formatPercent(p: number): string {
  const rounded = Math.round(p * 100)
  if (rounded === 0 && p > 0) return '<1%'
  if (rounded === 100 && p < 1) return '>99%'
  return `${rounded}%`
}

/** A d20 face range: '20' for one face, '11–19' (en dash) for several. */
export const formatFaces = (r: FaceRange): string =>
  r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`

/** A tier's threshold on the d20: '12+' (its lowest face); the lone critical faces stay '1' and '20'. */
export const formatFacesShort = (r: FaceRange): string =>
  r.min === r.max && (r.min === 1 || r.min === 20) ? `${r.min}` : `${r.min}+`

/** A price in gold pieces: whole above 10, else to one decimal place ("0.8", "12"). */
export const formatGp = (gp: number): string =>
  gp >= 10 ? `${Math.round(gp)}` : `${Math.round(gp * 10) / 10}`

/**
 * The first letter upper case. Site names are stored as they read mid-sentence ("the Last
 * Beacon"); a name that begins a sentence or stands alone (a heading, a button, a map label) goes
 * through this.
 */
export const capitalFirst = (text: string): string =>
  text ? text.charAt(0).toUpperCase() + text.slice(1) : text
