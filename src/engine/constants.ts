import type { Biome, Pace, Tier } from '../schema/types'
import { PX_PER_KM } from '../schema/world'

// The engine's balance and tuning numbers, by topic (docs/notes/constants.md). Each section names
// the module that uses them. Edit a value and run `pnpm test`: some tests pin exact values or
// measure statistics. This module imports only vocabulary, never other engine modules.

// Starting party (state.ts)

/** Members in a new party. */
export const STARTING_PARTY_SIZE = 2
/** Gold a new party starts with. */
export const STARTING_GOLD = 50

// Travel: speed, fares and encounters (routes.ts)

/** km per day on foot (or under sail) by terrain, at a steady pace. Morale will modify these later. */
export const KM_PER_DAY: Readonly<Record<Biome, number>> = {
  plains: 30,
  forest: 24,
  hills: 24,
  mountains: 15,
  marsh: 18,
  desert: 21,
  jungle: 18,
  sea: 75,
}
/** Passage on a ship, per member per day. */
export const SEA_FARE = 2
/** Journeys of up to this many days are short hops (0–2 encounters). */
export const SHORT_HOP_DAYS = 2
/** Journeys of this many days or more are long (2–4 encounters); between, 1–3. */
export const LONG_JOURNEY_DAYS = 5
/** The chance each encounter slot above the minimum fills, on every road and at every pace. */
export const ENCOUNTER_SLOT_CHANCE = 0.3
/** The share of encounters that are hostile before danger, threat, foraging and pace. */
export const HOSTILE_BASE = 0.1
/** Added to the hostile share per level of route danger. */
export const HOSTILE_PER_DANGER = 0.1
/** Added to the hostile share per threat level of the worse domain at either end. */
export const HOSTILE_PER_THREAT = 0.1
/** The hostile share stays within these bounds. */
export const HOSTILE_SHARE_RANGE: readonly [number, number] = [0.1, 0.85]

// Pace (pace.ts, warnings.ts)

/** The pace a journey takes unless the player picks another. */
export const DEFAULT_PACE: Pace = 'steady'
/** Speed multiplier on land. Ships sail at their own speed, whatever the pace. */
export const PACE_SPEED: Readonly<Record<Pace, number>> = {
  cautious: 2 / 3,
  steady: 1,
  brisk: 1.25,
  forced: 1.5,
}
/** Added to the hostile share at this pace: a hurried party is noticed (cautious avoids instead). */
export const PACE_HOSTILE_BONUS: Readonly<Record<Pace, number>> = {
  cautious: 0,
  steady: 0,
  brisk: 0.1,
  forced: 0.1,
}
/** The share of hostile encounters a cautious party avoids (applied when encounters are drawn). */
export const CAUTIOUS_HOSTILE_AVOIDANCE = 0.4
/** A forced march eats and drinks this share more per day on top of the daily ration. */
export const FORCED_MARCH_EXTRA_RATIONS = 0.5
/** Each forced-march day, every member makes a CON check against this DC or gains exhaustion. */
export const FORCED_MARCH_DC = 12
/** Covering tracks (cautious only) costs this many extra days per day travelled. */
export const COVER_TRACKS_EXTRA_DAYS = 0.25
/** A forced march this likely to kill someone (exhaustion level 6) gets a severe warning. */
export const DEADLY_MARCH_CHANCE = 0.1

// Pursuit (pursuit.ts)

/** Average speed (PACE_SPEED, 0 for a day standing still) at or above which the party outruns it. */
export const PURSUIT_ESCAPE_SPEED = 1.2
/** Outrun pursuers come back after this many more encounters... */
export const PURSUIT_ESCAPE_DELAY = 2
/** ...at most this many times; outrun once more, they give up. */
export const PURSUIT_MAX_ESCAPES = 2

// Foraging (forage.ts)

/** Survival DC to forage by terrain: easy by forests and rivers, hard in desert and mountains. */
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
/** Foraging draws attention: added to the hostile share (and covered tracks give no Edge). */
export const FORAGE_HOSTILE_BONUS = 0.1

// Supplies, prices and rest (supplies.ts, days.ts)

/** A new party carries this many days of food per member. */
export const STARTING_FOOD_DAYS = 5
/** A stop-gap price per ration until the Plan 4 market. */
export const FOOD_PRICE = 1
/** A day in camp restores this share of max HP; a day in a settlement restores all of it. */
export const CAMP_HEAL = 0.25
/** CON check DC for a day without food. */
export const HUNGER_DC = 10
/** CON check DC for a day without water. */
export const THIRST_DC = 15
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

// Carrying capacity and encumbrance (economy/capacity.ts). Weights are in kilograms.

/** What a member of STR 10 carries before slowing down. */
export const CARRY_BASE_KG = 20
/** Each point of STR above (or below) 10 adds (or takes) this share of CARRY_BASE_KG. */
export const CARRY_PER_STR = 0.1
/** The STR factor never drops below this… */
export const CARRY_MIN = 0.5
/** …nor rises above this. */
export const CARRY_MAX = 2.25
/** A member at this level of exhaustion or worse carries only CARRY_EXHAUSTED_SHARE. */
export const CARRY_EXHAUSTED_AT = 3
/** The share of their capacity an exhausted member carries. */
export const CARRY_EXHAUSTED_SHARE = 0.5
/** Above capacity the party is encumbered; above this many times capacity it is overloaded. */
export const OVERLOAD_RATIO = 1.5
/** An encumbered party walks at this share of its speed (and can't force a march). */
export const ENCUMBERED_SPEED = 2 / 3

// Stowing away (stowaway.ts)

/** The Stealth DC to stow away on a ship. */
export const STOWAWAY_DC = 13
/** Caught with no coin (or spotted at sea): the party works its passage off for this many days… */
export const STOWAWAY_WORK_DAYS = 2
/** …and the one who was caught gains this many levels of exhaustion. */
export const STOWAWAY_WORK_EXHAUSTION = 1
/** A brawl with no fitting situation (STOWAWAY_BRAWL_TAG): the one caught takes this damage (inclusive). */
export const STOWAWAY_BRAWL_DAMAGE: readonly [number, number] = [3, 8]

// Politics: kingdoms, garrisons and threats (politics.ts)

/** How many kingdoms a world rolls, capped by the number of capital markers. */
export const KINGDOMS = { min: 8, max: 12 }
/** A kingdom's total defence, split over its domains; sets the Rampant share (threat-levels.md). */
export const DEFENCE = { min: 9, max: 22 }
/** A domain h hops from its seat weighs 1 / (1 + SEAT_FALLOFF × h) in the garrison split. */
export const SEAT_FALLOFF = 0.5
/** A frontier domain in a land the kingdom already holds is this much likelier to be claimed. */
export const SAME_LAND_WEIGHT = 2
/** Ruling ancestries are picked by weight; any playable ancestry not listed weighs 1. */
export const RULER_WEIGHTS: Readonly<Record<string, number>> = { human: 3 }
/** A threat's weight in a region of a biome it favours… */
export const FAVOURED = 3
/** …and in one it doesn't. */
export const UNFAVOURED = 0.5

// Settlements (settlements.ts)

/** The prototype's population thresholds: above each, the next size tier. */
export const POPULATION_TIERS = [76, 400, 1000, 4000, 10000]
/** A service that passes its d20 roll still only appears this often (prototype). */
export const SERVICE_CHANCE = 0.9
/** A named town needs at least this score to be placed (see townScore). */
export const MIN_TOWN_MATCH = 2
/** Settlements are this much poorer where their domain's threat is rampant (level 3). */
export const RAMPANT_WEALTH = -1
/** How often a settlement's ancestry is the ruling one, when its town doesn't name one. */
export const RULING_ANCESTRY_SHARE = 0.75

// Notable people (town/people.ts)

/** Notable people per settlement, by size tier (outpost first), when enough roles fit. */
export const PEOPLE_BY_SIZE: readonly number[] = [1, 2, 2, 3, 4, 5]
/** How often a notable person shares their settlement's ancestry. */
export const PEOPLE_LOCAL_ANCESTRY = 0.75

// Points of interest (pois.ts)

/** A domain expects spots / this many POIs: about 40–60 per world on Altaeus (mean ≈ 49). */
export const POI_SPOTS_EACH = 8
/** No domain gets more than this many POIs; most get 0 or 1. */
export const POI_MAX_PER_DOMAIN = 2
/** The closest a POI may stand to its settlement. */
export const POI_MIN_KM = 8
/** The closest two POIs may stand: more than one spot step (SPOT_SPACING_KM ≈ 20.7 km). */
export const POI_SPACING_KM = 25
/** A type whose biome matches the spot, or whose threats name the land's threat, weighs this much more. */
export const POI_FAVOURED = 3

// Site cycles and boons (sites.ts)

/** A site's boon (a siteReady option: a blessing, healing, a find) returns this many days after it was taken. */
export const BOON_COOLDOWN_DAYS = 30
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

// Exploring a domain (explore.ts)

/** Added to the domain terrain's forage DC to find a site by searching. */
export const EXPLORE_DC_BONUS = 2
/** Camp days a search takes; a partial success takes one more. */
export const EXPLORE_DAYS = 2
/** Sites a search finds at each tier, and the extra days it takes. */
export const EXPLORE_FINDS: Readonly<Record<Tier, { found: number; extraDays: number }>> = {
  critFail: { found: 0, extraDays: 0 },
  fail: { found: 0, extraDays: 0 },
  partial: { found: 1, extraDays: 1 },
  success: { found: 1, extraDays: 0 },
  critSuccess: { found: 2, extraDays: 0 },
}

// Strain (strain.ts)

/** The use of a skill in one day that adds a Strain stack, and every later one (design §3). */
export const STRAIN_PER_DAY = 3
/** The use of a skill within STRAIN_WEEK_DAYS that adds a stack, and every later one. */
export const STRAIN_PER_WEEK = 10
/** The window STRAIN_PER_WEEK counts over. */
export const STRAIN_WEEK_DAYS = 7
/** Skill uses older than this many days are dropped; Strain looks back at most a week. */
export const SKILL_USE_DAYS = 7

// Checks and encounters (checks.ts, outcomes.ts, run.ts)

/** Totals this far below the DC still count as a partial success. */
export const PARTIAL_MARGIN = 3
/** Success chances in this band are close calls (design §9: the dice slow down and glow). */
export const HIGH_STAKES_BAND = [0.25, 0.75] as const
/** A twist kind tagged with the land, or with the threat holding it, weighs this much more. */
export const TWIST_PLACE_WEIGHT = 2

// Territory and paths (territory.ts, graph.ts)

/** The land-spot grid read off the map (scripts/map/sample_land_spots.py): 100 px apart. */
export const SPOT_SPACING_PX = 100
/** The grid's spacing in km, about 21. */
export const SPOT_SPACING_KM = SPOT_SPACING_PX / PX_PER_KM
/** Two spots, or a spot and a settlement, closer than this are linked (≈1.6 grid steps). */
export const SPOT_LINK_KM = 1.6 * SPOT_SPACING_KM
/** Off-road travel winds: km on foot are the straight line × this. */
export const OFF_ROAD_WINDING = 1.2
/** A POI also gets a path to another settlement on its island this much farther than its own. */
export const PATH_DETOUR = 1.25
