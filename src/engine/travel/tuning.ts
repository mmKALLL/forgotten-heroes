import type { Biome, Pace } from '../../schema/constants'

// Tuning numbers for foraging (design §7).
// Pace numbers live in pace.ts, speeds and fares in routes.ts, rations in supplies.ts.

/**
 * Survival DC to forage a day's water by terrain: easy by forests and rivers, hard in desert and
 * mountains. Nothing can be foraged at sea.
 */
export const FORAGE_DC: Readonly<Record<Exclude<Biome, 'sea'>, number>> = {
  plains: 10,
  forest: 10,
  jungle: 11,
  hills: 12,
  marsh: 13,
  mountains: 15,
  desert: 18,
}
/** Added to the forager's Survival at this pace: a forced march leaves no time to look. */
export const FORAGE_PACE_MODIFIER: Readonly<Record<Pace, number>> = {
  cautious: 0,
  steady: 0,
  brisk: 0,
  forced: -2,
}
