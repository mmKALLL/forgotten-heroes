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
/** A random start skips settlements whose every route has at least this danger (notorious). */
export const START_UNSAFE_DANGER = 3
/** Camaraderie a new party starts at (0–40): Steady. The state schema's default repeats it. */
export const CAMARADERIE_START = 25

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
  stealthy: 1 / 2,
  steady: 1,
  brisk: 1.25,
  forced: 1.5,
}
/** Added to the hostile share at this pace: a hurried party is noticed (slow ones avoid instead). */
export const PACE_HOSTILE_BONUS: Readonly<Record<Pace, number>> = {
  stealthy: 0,
  steady: 0,
  brisk: 0.1,
  forced: 0.1,
}
/**
 * The share of hostile encounters a party at this pace steers clear of (applied when encounters
 * are drawn: an avoided one is a quiet day). Stealthy also covers the party's tracks.
 */
export const PACE_HOSTILE_AVOIDANCE: Readonly<Record<Pace, number>> = {
  stealthy: 0.5,
  steady: 0,
  brisk: 0,
  forced: 0,
}
/**
 * On land, a road this many steady days long or more is always at least a day shorter at a brisk
 * pace, and a forced march never slower than brisk (designer rule, travel/routes.ts journeyDays).
 */
export const HURRY_SAVES_FROM = 3
/** A forced march eats and drinks this share more per day on top of the daily ration. */
export const FORCED_MARCH_EXTRA_RATIONS = 0.5
/** Each forced-march day, every member makes a CON check against this DC or gains exhaustion. */
export const FORCED_MARCH_DC = 12
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
  stealthy: 0,
  steady: 0,
  brisk: 0,
  forced: -2,
}
/** Foraging draws attention: added to the hostile share (and a stealthy party loses its Edge). */
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
/**
 * Exhaustion slows travel (designer decision): land speed loses this share per level of
 * exhaustion of the most exhausted member, fixed at departure like the load...
 */
export const EXHAUSTION_SPEED_PENALTY = 0.1
/** ...but never below this share. */
export const EXHAUSTION_SPEED_MIN = 0.4

// Markets (economy/market.ts)

/** Each level of demand over supply multiplies a price by this (and each level under divides). */
export const PRICE_STEP = 1.25
/**
 * A market's supply or demand level for a good stays within ±this, and so does demand − supply:
 * a price is at most PRICE_STEP^3 ≈ 2× its base, or half of it, before drift.
 */
export const MARKET_LEVEL_MAX = 3
/** Prices drift up to ±this share around their level, in slow waves. */
export const DRIFT = 0.1

// Geographic supply (economy/supply.ts)

/** A producer's supply falls a level for every this many steady days of road to the market. */
export const SUPPLY_DAYS_PER_LEVEL = 3
/** The supply level of a good with no producer near enough: scarce. */
export const SUPPLY_MIN = -2
/** A shortage: demand is at least this many levels over supply (marked, and wanted on boards). */
export const SHORTAGE_GAP = 3
/** The drift's waves: a new seeded value every this many days, eased in between. */
export const DRIFT_PERIOD_DAYS = 10
/** A market recovers half of the party's bulk trading in this many days. */
export const RECOVERY_HALF_LIFE_DAYS = 10
/**
 * Units of a good (at depth 1) a market absorbs, by size tier (outpost first): trading this many
 * moves the price by a factor of e (about 63% down when selling).
 */
export const MARKET_DEPTH: readonly number[] = [6, 10, 16, 24, 40, 60]
/** The gap between buying and selling at an average shop, by size tier (outpost first). */
export const SPREAD_BY_SIZE: readonly number[] = [0.24, 0.2, 0.17, 0.14, 0.12, 0.1]
/** Each point of shop quality above 3 narrows the spread by this much (and below widens it). */
export const SPREAD_PER_QUALITY = 0.03
/** No spread is narrower than this, whatever the quality or standing. */
export const SPREAD_MIN = 0.02
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
/** A round for the table, whatever the party's size: dear enough to weigh against exploring's days. */
export const RUMOUR_PRICE = 5
/** ...plus this much more per RUMOUR_PRICE_DAYS days passed, rising linearly (5 gp on day 1, 10 on day 101). */
export const RUMOUR_PRICE_STEP = 5
export const RUMOUR_PRICE_DAYS = 100
/** Nearby towns whose prices each tier brings (a partial is idle gossip; nothing heard is false). */
export const RUMOUR_PRICES: Readonly<Record<Tier, number>> = {
  critFail: 0,
  fail: 0,
  partial: 0,
  success: 2,
  critSuccess: 3,
}
/** Heard prices (rumours and couriers) are off by up to ±this share (seeded). */
export const RUMOUR_SKEW = 0.1
/** A critical failure's trouble is a fight (a tavern brawl) this often, else a pickpocket. */
export const RUMOUR_TROUBLE_FIGHT = 0.5
/** What a pickpocket lifts on a rumour's critical failure: 1d6 gp, as far as the purse goes. */
export const PICKPOCKET_GP: readonly [number, number] = [1, 6]

// Contracts and notice boards (town/contracts.ts)

/** Offers on a notice board each week, by size tier (outpost first). */
export const BOARD_SIZE: readonly number[] = [1, 2, 2, 3, 3, 4]
/** Contracts the party may hold at once. */
export const MAX_CONTRACTS = 3
/** gp per steady day to the destination, before the template's pay and urgency. */
export const CONTRACT_PAY_PER_DAY = 10
/** Each threat level at the destination adds this share to the pay. */
export const CONTRACT_PAY_PER_THREAT = 0.1
/** An urgent offer pays this many times as much. */
export const URGENT_PAY = 1.5
/** A deadline is the steady days to the destination × a seeded slack in this range... */
export const DEADLINE_SLACK: readonly [number, number] = [1.25, 1.6]
/** ...plus this many days' grace (not for urgent offers): encounters on the road cost days. */
export const DEADLINE_GRACE_DAYS = 1
/** ...or in this one for an urgent offer (never less than a forced march, always less than steady). */
export const URGENT_SLACK: readonly [number, number] = [0.75, 0.9]
/** "A good word": standing gained with every settlement of the patron's kingdom, instead of the gold. */
export const GOOD_WORD_POINTS = 3
/** A failed or abandoned contract costs this much standing with the patron and their settlement. */
export const FAIL_REP = 5
/** Each this many gp of a lost cargo the party can't pay costs one more point of standing. */
export const DEBT_REP_GP = 10
/**
 * Selling a courier's or freight contract's cargo (sellCargo) breaks the contract on the spot:
 * this much standing lost with the patron and the board's settlement (instead of FAIL_REP).
 */
export const SOLD_CARGO_REP = 15
/** Escorted passengers draw attention: added to the hostile share on the road. */
export const ESCORT_HOSTILE = 0.1

// Recruits (town/recruits.ts)

/** Living members a party can have: hiring stops here (the dead don't count). */
export const PARTY_CAP = 6
/**
 * A recruit's one-time sign-on fee range (gp) by level 1–20, [low, high], before the service's
 * `fee`: a recruit's rolled stats and any old wound place them in it (designer, 2026-11-13, to
 * level 5; ×1.35 a level beyond).
 */
// prettier-ignore
export const RECRUIT_SIGNON: readonly (readonly [number, number])[] = [
  [20, 60], [40, 100], [75, 150], [140, 200], [200, 280],
  [270, 380], [360, 510], [490, 690], [660, 930], [900, 1250],
  [1200, 1700], [1650, 2300], [2200, 3100], [3000, 4150], [4000, 5650],
  [5450, 7600], [7350, 10250], [9900, 13850], [13350, 18700], [18050, 25250],
]
/** The 3d6 ability total that puts a recruit in the middle of the fee range (6 × 10.5). */
export const RECRUIT_STAT_MEAN = 63
/** The span of ability totals that runs from the low end of the fee range to the high (±2 SD). */
export const RECRUIT_STAT_SPAN = 29
/** The chance a recruit's two best rolls don't go to their class's two key abilities. */
export const RECRUIT_OFF_CLASS = 0.15
/** The share of recruits with an old wound (founders have none). */
export const OLD_WOUND_CHANCE = 0.2
/** An old wound lowers one ability by this much (never below 3). */
export const OLD_WOUND_PENALTY = 2
/** A wounded recruit's place in the fee range is multiplied by this: near the low end. */
export const OLD_WOUND_QUALITY = 0.3
/** The chance a recruit brings a tier-1 accessory, unless the service's `gear` says otherwise. */
export const RECRUIT_GEAR_CHANCE = 0.15
/** A recruit's accessory adds this share of its shop price to the sign-on fee. */
export const RECRUIT_GEAR_PRICE = 0.75
/** The share of recruits of the settlement's own ancestry; the rest are any playable one. */
export const RECRUIT_LOCAL_ANCESTRY = 0.75

// Camaraderie and desertion (town/camaraderie.ts)

// Losses that blame someone scale with the party (each × the living members − 1): more people pin
// it on someone. Gains are flat, so a bigger party costs more to keep happy (designer, 2026-11-13).

/** Camaraderie lost at the end of a day on which anyone went without food or water. */
export const CAMARADERIE_HUNGER = 5
/** Camaraderie lost for each member who dies. */
export const CAMARADERIE_DEATH = 10
/** Camaraderie lost for a failed encounter check, per living member beyond the first. */
export const CAMARADERIE_FAIL = 1
/** Camaraderie lost for a critically failed encounter check, per living member beyond the first. */
export const CAMARADERIE_CRIT_FAIL = 2
/** Camaraderie lost for fleeing (an option tagged `retreat`), per living member beyond the first. */
export const CAMARADERIE_RETREAT = 2
/** Camaraderie gained for each contract completed. */
export const CAMARADERIE_CONTRACT = 5
/** Camaraderie gained for a night in a private room, once per arrival. */
export const CAMARADERIE_BOND = 5
/** Camaraderie gained for standing the party a round at the inn, once per arrival. */
export const CAMARADERIE_ROUND = 3
/** A round at the inn, per living member (gp). */
export const ROUND_PRICE = 1
/** While camaraderie is Fractured, the chance each hired member deserts on arriving in a settlement. */
export const DESERT_CHANCE = 0.25

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

// Gathering (world/gather.ts)

/** A gather rule's DC is this much lower per output level of the good made in the domain (0–3). */
export const GATHER_DC_PER_OUTPUT = 1
/**
 * How much the land around a settlement yields before it is picked over, in fresh days' work (a
 * rule's success yield): the gathered units deplete it like a market of this depth.
 */
export const GATHER_DEPTH_DAYS = 2
/** HP the lead loses on a critical failure when no hostile situation fits the place. */
export const GATHER_INJURY = 3

// Rule hooks and accessories (gear/hooks.ts, gear/accessories.ts, economy/market.ts)

/** A sale with a `sellBonus` hook never pays more than this × the middle price (no arbitrage). */
export const SELL_BONUS_CAP = 1
/** A shop sells accessories back to the party at this share of their value. */
export const ACCESSORY_RESALE = 0.5
/** The chance each offer of a shop that sells tier 2 (Magic Items) is tier 2 rather than 1. */
export const ACCESSORY_SHOP_FINE_CHANCE = 0.35

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

// Progression and XP (rules/progression.ts; encounters/outcomes.ts, effects.ts; town/contracts.ts)

/**
 * Total XP needed for each level 1–MAX_LEVEL (cumulative, never reset). Checked by the economy
 * report (Plan 5a I1): about level 2 by day 15, 4 by day 60 and 5 by day 120.
 */
export const XP_BY_LEVEL: readonly number[] = [
  0, 300, 900, 1800, 3000, 4500, 6300, 8400, 10800, 13500,
]
/** XP for a successful check, per point of its final DC (site power and danger included). */
export const XP_PER_DC = 5
/** A critical success pays this many times a success's XP. */
export const XP_CRIT = 1.5
/** A partial success pays this share of a success's XP. */
export const XP_PARTIAL = 0.5
/** A failure (critical or not) still teaches this share of a success's XP. */
export const XP_FAIL = 0.25
/** A completed contract pays this much XP per gp of its pay (a good word too). */
export const CONTRACT_XP_PER_GP = 2
/** Clearing a dungeon or lair pays this much XP, times (1 + the site's power). */
export const XP_CLEAR = 150
/** Each point of interest discovered (exploring, rumours, clues, contracts) pays this much XP. */
export const XP_DISCOVER = 25

// World danger (world/danger.ts)

/** The world grows more dangerous every this many days (day 51, 101, …). */
export const DANGER_RAMP_DAYS = 50
/** Each step adds this share to encounter DCs and damage. */
export const DANGER_RAMP_STEP = 0.1
/** The danger share never rises above this (+100%, from day 501). */
export const DANGER_RAMP_MAX = 1

// The Crisis: rolling it (crisis/generate.ts)

/** A villain one of whose threats holds a land, and a domain that suits a site, weigh this much more. */
export const CRISIS_THREAT_FAVOUR = 3
/**
 * The reveal site lies this many steady days from the start (inclusive), by road and path. On
 * Altaeus domain hops vary too much in days (two hops are 7–19 days), so the near sites use days.
 */
export const CRISIS_REVEAL_DAYS: readonly [number, number] = [2, 8]
/** Act I's site lies this many steady days from the start (inclusive), by road and path. */
export const CRISIS_ACT1_DAYS: readonly [number, number] = [4, 12]
/** Acts II and III lie at least this many domain hops from the act before. */
export const CRISIS_ACT_SPREAD = 3
/** Act n is due about n × this many days after the Crisis starts (the designer's number). */
export const CRISIS_ACT_DAYS = 100
/** Each due day is moved by up to ± this many days (seeded). */
export const CRISIS_DUE_JITTER = 10

// The Crisis: deadlines and news (crisis/status.ts)

/** An act not thwarted this many days after its due day fails, and the Crisis is lost. */
export const CRISIS_LEEWAY_DAYS = 30
/** Each this many days late (or part of it) adds 1 to every DC at the act's site. */
export const CRISIS_LATE_STEP_DAYS = 10
/** The journal warns this many days before an act is due (once the plan is known). */
export const CRISIS_WARN_DAYS = 14

// The Crisis: clues and thwarting (crisis/progress.ts)

/** Clues to an act that reveal its site (the first, its land, comes with the act). */
export const CRISIS_SITE_CLUES = 2
/** Clues to an act that reveal the villain's weakness there: the party goes in with the Edge. */
export const CRISIS_WEAKNESS_CLUES = 3
/** Thwarting act n pays this much XP × n (rules/progression.ts gainXp). */
export const XP_THWART = 300

// The Crisis: rumours, the summons and omens (crisis/clues.ts)

/** Clues a rumour success in the current act's land gives (one more on a critical success). */
export const CRISIS_RUMOUR_CLUES = 1
/** From this day, arriving in a settlement while the plan is unknown brings the summons. */
export const CRISIS_SUMMONS_DAY = 15
/** An omen weighs this much more on a road in the current act's land. */
export const CRISIS_OMEN_FAVOUR = 3
