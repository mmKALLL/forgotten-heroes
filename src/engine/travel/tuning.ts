import type { Biome, Pace } from '../../schema/constants'

// Tuning numbers for foraging, waterskins, lodging, selling supplies and stowing away (design §7).
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

/**
 * Foraging draws attention: on a journey that forages, this is added to the share of encounters
 * that are hostile (hostileShare in routes.ts), and covering tracks gives ambushes no Edge.
 */
export const FORAGE_HOSTILE_BONUS = 0.1

/** Water each member carries without extra waterskins, in days of drinking. */
export const WATER_DAYS = 4
/** Each extra waterskin holds this many days of water for one member (units of water). */
export const WATERSKIN_WATER = 2
/** A stop-gap price per waterskin until the Plan 4 market. */
export const WATERSKIN_PRICE = 2

/** Lodging per member per night (meals included). Plan 4 sets it by inn quality. */
export const LODGING_PRICE = 1

/** Supplies sell back for this share of their price (rounded down over the whole sale). */
export const SELL_SHARE = 0.5

/** The Stealth DC to stow away on a ship. */
export const STOWAWAY_DC = 13
/** Caught with no coin (or spotted at sea): the party works its passage off for this many days… */
export const STOWAWAY_WORK_DAYS = 2
/** …and the one who was caught gains this many levels of exhaustion. */
export const STOWAWAY_WORK_EXHAUSTION = 1
/** A critical failure starts a brawl: a hostile sea situation with this tag, if one exists… */
export const STOWAWAY_BRAWL_TAG = 'brawl'
/** …otherwise the one who was caught takes this much damage (rolled, inclusive). */
export const STOWAWAY_BRAWL_DAMAGE: readonly [number, number] = [3, 8]
