import type { PoiState } from '../../schema/world'

// How points of interest change over time (design §6, "Points of interest over time"). Nothing
// ticks: every status is derived from the day and what is stored on the POI.

/** A site's boon (a siteReady option: a blessing, healing, a find) returns this many days after it was taken. */
export const BOON_COOLDOWN_DAYS = 30

/** Days until the site's boon returns: 0 when it is ready. */
export function boonReadyIn(poi: Pick<PoiState, 'boonDay'>, day: number): number {
  if (poi.boonDay === null) return 0
  return Math.max(0, poi.boonDay + BOON_COOLDOWN_DAYS - day)
}
