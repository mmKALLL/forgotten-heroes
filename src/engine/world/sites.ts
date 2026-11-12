import type { PoiCategory } from '../../schema/constants'
import type { PoiState } from '../../schema/world'
import { createRng, nextFloat } from '../rng'

// How points of interest change over time (design §6, "Points of interest over time"). Nothing
// ticks: every status is derived from the day, the world seed and what is stored on the POI.

/** A site's boon (a siteReady option: a blessing, healing, a find) returns this many days after it was taken. */
export const BOON_COOLDOWN_DAYS = 30

/** Days until the site's boon returns: 0 when it is ready. */
export function boonReadyIn(poi: Pick<PoiState, 'boonDay'>, day: number): number {
  if (poi.boonDay === null) return 0
  return Math.max(0, poi.boonDay + BOON_COOLDOWN_DAYS - day)
}

// Dungeons and lairs live in cycles. Once cleared (by the party, the realm or an accident) a site
// lies empty REINHABIT_DAYS; then something moves in and holds it INHABITED_DAYS ± INHABITED_JITTER
// (drawn per site and per cycle), growing stronger, until the realm or an accident clears it and
// the cycle begins again. About four in five are inhabited at any time.

/** Days a cleared site lies empty before something moves in again. */
export const REINHABIT_DAYS = 30
/** Days a site stays inhabited, on average, before the realm or an accident clears it. */
export const INHABITED_DAYS = 120
/** Each inhabited spell is INHABITED_DAYS plus or minus up to this many days (seeded). */
export const INHABITED_JITTER = 20
/** An inhabited site gains a level of power every this many days... */
export const POWER_STEP_DAYS = 40
/** ...up to this many. */
export const MAX_POWER = 2
/** Each level of power adds this to the DC of every check at the site. */
export const POWER_DC = 1
/** From this power on, a hostile site adds 1 more threat (at most 3). */
export const POWER_THREAT_AT = 2
/** The categories that are cleared and fill up again. */
export const CYCLING_CATEGORIES: readonly PoiCategory[] = ['dungeon', 'lair']

type SitePoi = Pick<PoiState, 'category' | 'threat' | 'clearedDay'>

/** Dungeons and lairs, and any hostile site, are cleared and fill up again. */
export const cycles = (poi: Pick<PoiState, 'category' | 'threat'>): boolean =>
  CYCLING_CATEGORIES.includes(poi.category) || poi.threat > 0

/** Where a cycling site is in its cycle on a day. */
export type SiteStatus = {
  phase: 'empty' | 'inhabited'
  /** The day this phase began. */
  since: number
  /** The day it ends: something moves in, or the site is cleared. */
  until: number
  /** 0 to MAX_POWER while inhabited; 0 when empty. */
  power: number
  /** Who emptied it: the party, or the realm (soldiers or an accident). Null while inhabited. */
  clearedBy: 'party' | 'realm' | null
  /** Inhabited again after a clearing the party has seen happen or done (not since the world began). */
  reinhabited: boolean
}

/** A seeded float in [0, 1) for this site, salt and cycle: the same every time it is asked. */
function siteFloat(seed: number, id: string, salt: number, cycle: number): number {
  let h = 0x811c9dc5 ^ seed
  for (const ch of `${id}/${salt}/${cycle}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return nextFloat(createRng(h >>> 0))[0]
}

/** How long the n-th inhabited spell after this anchor lasts. */
const inhabitedDays = (seed: number, id: string, salt: number, n: number): number =>
  INHABITED_DAYS + Math.round((siteFloat(seed, id, salt, n) * 2 - 1) * INHABITED_JITTER)

/**
 * The cycles of a site from its anchor: the day the party last cleared it, or else a seeded day
 * within the first cycle before day 1, so a new world's sites start at mixed points of their
 * cycles (about four in five inhabited, at every power).
 */
function anchorOf(seed: number, id: string, poi: SitePoi): { day: number; salt: number } {
  if (poi.clearedDay !== null) return { day: poi.clearedDay, salt: poi.clearedDay }
  const first = REINHABIT_DAYS + inhabitedDays(seed, id, 0, 0)
  return { day: 1 - Math.floor(siteFloat(seed, id, 0, -1) * first), salt: 0 }
}

/** Every phase of the site's cycles from its anchor, until `stop` returns true. */
function walk(
  seed: number,
  id: string,
  poi: SitePoi,
  stop: (status: SiteStatus) => boolean
): SiteStatus {
  const anchor = anchorOf(seed, id, poi)
  let start = anchor.day
  for (let n = 0; ; n++) {
    const inhabited = start + REINHABIT_DAYS
    const empty: SiteStatus = {
      phase: 'empty',
      since: start,
      until: inhabited,
      power: 0,
      clearedBy: n === 0 && poi.clearedDay !== null ? 'party' : 'realm',
      reinhabited: false,
    }
    if (stop(empty)) return empty
    const end = inhabited + inhabitedDays(seed, id, anchor.salt, n)
    const held: SiteStatus = {
      phase: 'inhabited',
      since: inhabited,
      until: end,
      power: 0,
      clearedBy: null,
      reinhabited: poi.clearedDay !== null || n > 0,
    }
    if (stop(held)) return held
    start = end
  }
}

/** Where a dungeon or lair is in its cycle on this day; null for sites that don't cycle. */
export function siteStatus(seed: number, id: string, poi: SitePoi, day: number): SiteStatus | null {
  if (!cycles(poi)) return null
  const status = walk(seed, id, poi, (s) => day < s.until)
  if (status.phase === 'empty') return status
  const power = Math.min(MAX_POWER, Math.floor(Math.max(0, day - status.since) / POWER_STEP_DAYS))
  return { ...status, power }
}

/** True when the site is a dungeon or lair lying empty on this day. */
export const siteEmpty = (seed: number, id: string, poi: SitePoi, day: number): boolean =>
  siteStatus(seed, id, poi, day)?.phase === 'empty'

/**
 * What a site adds to its domain's threat on this day: a hostile site its own threat while
 * inhabited (one more from POWER_THREAT_AT power, at most 3), nothing while empty.
 */
export function siteThreat(seed: number, id: string, poi: SitePoi, day: number): number {
  if (poi.threat === 0) return 0
  const status = siteStatus(seed, id, poi, day)
  if (!status || status.phase === 'empty') return 0
  return Math.min(3, poi.threat + (status.power >= POWER_THREAT_AT ? 1 : 0))
}

/** A change in a site's cycle: the realm cleared it, or something moved in. */
export type SiteEvent = { day: number; kind: 'cleared' | 'inhabited' }

/** The realm's clearings and the re-inhabitings of a site after day `from`, up to day `to`. */
export function siteEvents(
  seed: number,
  id: string,
  poi: SitePoi,
  from: number,
  to: number
): SiteEvent[] {
  if (!cycles(poi) || to <= from) return []
  const events: SiteEvent[] = []
  walk(seed, id, poi, (s) => {
    const kind = s.phase === 'empty' ? 'cleared' : 'inhabited'
    // The party's own clearing is no news.
    const news = s.phase === 'inhabited' || s.clearedBy === 'realm'
    if (news && s.since > from && s.since <= to) events.push({ day: s.since, kind })
    return s.until > to
  })
  return events
}
