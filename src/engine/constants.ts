import type { Biome, Pace, Standing, Tier } from '../schema/types'
import { PX_PER_KM } from '../schema/world'

// The engine's balance and tuning numbers, by topic (docs/notes/constants.md). Each section names
// the module that uses them. Edit a value and run `pnpm test`: some tests pin exact values or
// measure statistics. This module imports only vocabulary, never other engine modules.

// Starting party (state.ts)

/** Members in a new party. */
export const STARTING_PARTY_SIZE = 2
/** Gold a new party starts with. */
export const STARTING_GOLD = 10

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
  sea: 40,
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
/** A common room per member per night (meals included), at any inn. */
export const LODGING_PRICE = 1
/** What an extra waterskin sells back for. */
export const WATERSKIN_SELL_PRICE = 1

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

// Markets (economy/market.ts)

/** Each level of demand over supply multiplies a price by this (and each level under divides). */
export const PRICE_STEP = 1.25
/** A market's summed supply or demand level for a good stays within ±this. */
export const MARKET_LEVEL_MAX = 3
/** Prices drift up to ±this share around their level, in slow waves. */
export const DRIFT = 0.15
/** The drift's waves: a new seeded value every this many days, eased in between. */
export const DRIFT_PERIOD_DAYS = 10
/** A market recovers half of the party's bulk trading in this many days. */
export const RECOVERY_HALF_LIFE_DAYS = 10
/**
 * Units of a good (at depth 1) a market absorbs, by size tier (outpost first): trading this many
 * moves the price by a factor of e (about 63% down when selling).
 */
export const MARKET_DEPTH: readonly number[] = [3, 5, 8, 12, 20, 30]
/** The gap between buying and selling at an average shop, by size tier (outpost first). */
export const SPREAD_BY_SIZE: readonly number[] = [0.4, 0.34, 0.28, 0.22, 0.18, 0.15]
/** Each point of shop quality above 3 narrows the spread by this much (and below widens it). */
export const SPREAD_PER_QUALITY = 0.03
/** No spread is narrower than this, whatever the quality or standing. */
export const SPREAD_MIN = 0.05
/** The market stalls every settlement has for essentials trade at this quality (the worst spread). */
export const STALL_QUALITY = 1

// Trading and the price book (economy/trade.ts)

/** Prices in the price book older than this many days are shown as stale. */
export const STALE_DAYS = 14

// Services and animals (town/services.ts, town/animals.ts)

/** A private room per member per night (meals included), at an inn of PRIVATE_ROOM_MIN_QUALITY+. */
export const PRIVATE_ROOM_PRICE = 3
/** Only inns of at least this quality have private rooms. */
export const PRIVATE_ROOM_MIN_QUALITY = 3
/** Strain stacks a night in a private room fades (a common room or camp fades 1). */
export const PRIVATE_ROOM_FADE = 2
/** A healer's fee per member treated: all HP back and one level of exhaustion off, no day spent. */
export const HEALER_PRICE = 10
/** A temple's blessing (1 Inspiration), once per arrival at each temple. */
export const BLESSING_PRICE = 10
/** A courier's news of one market on the same island. */
export const NEWS_PRICE = 5
/** How far news travels in a day: a heard price is a day older per this many km between towns. */
export const COURIER_KM_PER_DAY = 40
/** Animals sell back for this share of their price. */
export const ANIMAL_RESALE = 0.5
/** Ridden in rough terrain, mounts are only this much faster than walking. */
export const MOUNT_ROUGH_SPEED = 1.25
/** The terrain where mounts manage only MOUNT_ROUGH_SPEED. */
export const ROUGH_TERRAIN: readonly Biome[] = ['mountains', 'marsh', 'jungle']

// Visible wealth (economy/wealth.ts, routes.ts, run.ts)

/** Each this many gp of visible wealth per member is one step. */
export const WEALTH_STEP_GP = 100
/** Visible wealth counts at most this many steps. */
export const WEALTH_MAX_STEPS = 4
/** Each step adds this to the hostile share on the road. */
export const WEALTH_HOSTILE_PER_STEP = 0.05
/** Each step makes thieves and tolls (WEALTH_TAGS) this much likelier when drawn: × (1 + this × steps). */
export const WEALTH_TAG_WEIGHT = 0.5
/** Coin up to this much per member doesn't show… */
export const PURSE_FREE_PER_MEMBER = 50
/** …and this share of the coin above it counts as visible wealth. */
export const PURSE_SHARE = 0.5

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

// Reputation (town/reputation.ts)

/** The fewest points for each standing (hated has no floor). Points are whole numbers. */
export const STANDING_POINTS: Readonly<Record<Standing, number>> = {
  hated: -Infinity,
  disliked: -19,
  stranger: -4,
  known: 5,
  liked: 15,
  trusted: 30,
  honoured: 50,
}
/** Each standing tier above stranger narrows a market's buy/sell spread this much (below: widens). */
export const STANDING_SPREAD = 0.02
/** Trading this many gp (bought plus sold) in a settlement earns a point of standing there... */
export const TRADE_REP_GP = 50
/** ...up to this many points per arrival. */
export const TRADE_REP_MAX = 3

// Rumours at the tavern (town/rumours.ts)

/** The DC to hear something useful (Insight or Persuasion), less 1 per standing tier above stranger. */
export const RUMOUR_DC = 12
/** A round for the table, per member. */
export const RUMOUR_PRICE = 1
/** Nearby towns whose prices each tier brings (a critical failure brings one false rumour). */
export const RUMOUR_PRICES: Readonly<Record<Tier, number>> = {
  critFail: 1,
  fail: 0,
  partial: 1,
  success: 2,
  critSuccess: 3,
}
/** Heard prices are off by up to ±this share (seeded). */
export const RUMOUR_SKEW = 0.1
/** A false rumour's prices are off by this share, up or down, with no tell. */
export const FALSE_RUMOUR_SKEW = 0.4

// Contracts and notice boards (town/contracts.ts)

/** Offers on a notice board each week, by size tier (outpost first). */
export const BOARD_SIZE: readonly number[] = [1, 2, 2, 3, 3, 4]
/** Contracts the party may hold at once. */
export const MAX_CONTRACTS = 3
/** gp per steady day to the destination, before the template's pay and urgency. */
export const CONTRACT_PAY_PER_DAY = 6
/** Each threat level at the destination adds this share to the pay. */
export const CONTRACT_PAY_PER_THREAT = 0.1
/** An urgent offer pays this many times as much. */
export const URGENT_PAY = 1.5
/** A deadline is the steady days to the destination × a seeded slack in this range... */
export const DEADLINE_SLACK: readonly [number, number] = [1.1, 1.4]
/** ...or in this one for an urgent offer (never less than a forced march, always less than steady). */
export const URGENT_SLACK: readonly [number, number] = [0.75, 0.9]
/** "A good word": standing gained with every settlement of the patron's kingdom, instead of the gold. */
export const GOOD_WORD_POINTS = 3
/** A failed or abandoned contract costs this much standing with the patron and their settlement. */
export const FAIL_REP = 5
/** Each this many gp of a lost cargo the party can't pay costs one more point of standing. */
export const DEBT_REP_GP = 10
/** Escorted passengers draw attention: added to the hostile share on the road. */
export const ESCORT_HOSTILE = 0.1

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
