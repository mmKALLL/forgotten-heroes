import type { Content } from '../../content/build'
import type { Biome, Pace } from '../../schema/types'
import type { Character, FoodLot, GameState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { EXHAUSTION_PENALTY, canAct, statModifier } from '../rules/character'
import { tierOdds } from '../rules/checks'
import { expectedForage } from './forage'
import { exhaustionSpeed, journeyDays } from './routes'
import { dailyNeed, goodsOf, partyWaterCapacity, waterNeed } from './supplies'
import { foodLotsOf, shelfDays, spoilsOn } from '../economy/food'
import { DEADLY_MARCH_CHANCE, FORCED_MARCH_DC } from '../constants'

// Supply forecasts and warnings for a road at a pace (design §7): the preview warns clearly when a
// route at the chosen pace exceeds the party's water or food. Warnings are codes with params; the
// UI localises them (warningText is the English fallback).

/** How one supply holds up over a journey, assuming average foraging. */
export type SupplyForecast = {
  /** What the whole party eats or drinks over the journey at this pace. */
  needed: number
  carried: number
  /** Expected finds per day of foraging (0 at sea or without foraging). */
  expectedForage: number
  /** Days someone goes without, with average foraging. */
  shortfallDays: number
  /** The first such day (1-based), or null. */
  runsOutOnDay: number | null
}
export type WaterForecast = SupplyForecast & { capacity: number }
/** Food also counts the rations that spoil on the way (expected, with foraging). */
export type FoodForecast = SupplyForecast & { spoiled: number }

export type TravelWarning =
  | {
      code: 'waterRunsOut'
      params: { day: number; shortfallDays: number; withForaging: boolean }
    }
  /** Enough water only if foraging goes as well as average; carried water alone runs out. */
  | { code: 'waterReliesOnForaging'; params: { day: number } }
  | {
      code: 'foodRunsOut'
      params: { day: number; shortfallDays: number; missing: number; withForaging: boolean }
    }
  /**
   * Every forced-march day each member rolls CON or gains exhaustion; the worst-off member. Left
   * out when that member gets forcedMarchDeadly instead.
   */
  | {
      code: 'forcedMarchExhaustion'
      params: {
        days: number
        dc: number
        characterId: string
        name: string
        expectedLevels: number
      }
    }
  /**
   * Severe: the march could exhaust someone to death (MAX_EXHAUSTION) with at least
   * DEADLY_MARCH_CHANCE; the member most at risk and that chance.
   */
  | {
      code: 'forcedMarchDeadly'
      params: { days: number; dc: number; characterId: string; name: string; chance: number }
    }
  /** The party carries more than its capacity (kg): slower, and no forced march. */
  | { code: 'encumbered'; params: { weight: number; capacity: number } }
  /**
   * Someone sets out exhausted (designer decision): the party travels slower (exhaustionSpeed,
   * fixed at departure; 0 at sea, where the ship sets the speed) and their checks are worse
   * (EXHAUSTION_PENALTY per level). Severe when one more level (a failed hunger, thirst or
   * forced-march check) would kill the worst of them.
   */
  | {
      code: 'departingExhausted'
      params: {
        /** The exhausted members, most exhausted first. */
        members: { characterId: string; name: string; level: number }[]
        /** The worst level among them. */
        level: number
        /** The share of speed lost (0.2 is 20% slower). */
        speedPenalty: number
        /** The worst member's penalty to every check. */
        checkPenalty: number
        severe: boolean
      }
    }

/** Warnings the UI should show as severe. */
export const isSevere = (w: TravelWarning): boolean =>
  w.code === 'forcedMarchDeadly' || (w.code === 'departingExhausted' && w.params.severe)

/**
 * How a member's exhaustion may end up after `days` of forced-march CON checks: the chance of
 * each level, 0 to MAX_EXHAUSTION. Each level gained is −2 to the following days' checks
 * (statModifier), so failures compound; the last level is death and ends the walk.
 */
export function marchExhaustion(c: Character, days: number, dc: number): number[] {
  let levels: number[] = Array.from({ length: MAX_EXHAUSTION + 1 }, (_, l) =>
    l === c.exhaustion ? 1 : 0
  )
  for (let day = 0; day < days; day++) {
    const next = levels.map(() => 0)
    levels.forEach((p, level) => {
      if (p === 0) return
      if (level >= MAX_EXHAUSTION) {
        next[level] += p
        return
      }
      const odds = tierOdds(statModifier({ ...c, exhaustion: level }, 'con'), dc)
      const holds = odds.success + odds.critSuccess
      next[level] += p * holds
      next[level + 1] += p * (1 - holds)
    })
    levels = next
  }
  return levels
}

const EPSILON = 1e-9

type Run = { shortfallDays: number; runsOutOnDay: number | null }

/**
 * Walks the journey day by day: foraging first (water kept up to capacity), then the day's
 * rations. A day is short when the stock can't cover everyone's base ration (a forced march's
 * extra is eaten when it is there, like passDay).
 */
function simulate(
  days: number,
  carried: number,
  forage: number,
  capacity: number,
  base: number,
  full: number
): Run {
  let stock = carried
  let shortfallDays = 0
  let runsOutOnDay: number | null = null
  for (let day = 1; day <= days; day++) {
    stock = Math.max(stock, Math.min(capacity, stock + forage))
    if (stock + EPSILON < base) {
      shortfallDays++
      runsOutOnDay ??= day
    }
    stock = Math.max(0, stock - full)
  }
  return { shortfallDays, runsOutOnDay }
}

/**
 * The food over the journey as the road will treat it (travel/days.ts, economy/food.ts): each day
 * the day's finds are a new batch, the party eats the oldest batches first, and as the day ends
 * every batch whose shelf life (`shelf` days, none when null) is up spoils. `spoiled` is what spoils
 * on the way. Day 1 is `today`.
 */
function simulateFood(
  days: number,
  lots: readonly FoodLot[],
  today: number,
  forage: number,
  base: number,
  full: number,
  shelf: number | null
): Run & { spoiled: number } {
  let stock = lots.map((l) => ({ ...l }))
  let shortfallDays = 0
  let runsOutOnDay: number | null = null
  let spoiled = 0
  for (let day = 1; day <= days; day++) {
    const date = today + day - 1
    if (forage > 0) stock.push({ day: date, amount: forage })
    const total = stock.reduce((n, l) => n + l.amount, 0)
    if (total + EPSILON < base) {
      shortfallDays++
      runsOutOnDay ??= day
    }
    let eat = full
    for (const l of stock) {
      const taken = Math.min(eat, l.amount)
      l.amount -= taken
      eat -= taken
    }
    if (shelf !== null) {
      for (const l of stock) if (spoilsOn(l, shelf) <= date + 1) spoiled += l.amount
      stock = stock.filter((l) => spoilsOn(l, shelf) > date + 1)
    }
    stock = stock.filter((l) => l.amount > EPSILON)
  }
  return { shortfallDays, runsOutOnDay, spoiled }
}

export type RouteForecast = {
  days: number
  water: WaterForecast
  food: FoodForecast
  warnings: TravelWarning[]
}

/**
 * Water, food and warnings for taking this road at this pace with the party as it is now. `speed`
 * is its land speed (routes.ts landSpeed); with `content`, food spoils as it will on the road (its
 * batches by `foodLots`, from `day`; food beyond the lots is fresh today).
 */
export function forecastJourney(
  state: Pick<GameState, 'party' | 'goods' | 'waterskins'> &
    Partial<Pick<GameState, 'foodLots' | 'day'>>,
  route: Pick<Route, 'km' | 'terrain'>,
  pace: Pace,
  forage = true,
  {
    speed = 1,
    content,
    animalWater = 0,
    waterSaving = 0,
    escorts = 0,
  }: {
    speed?: number
    content?: Content
    animalWater?: number
    /** Whole units camels save the party each day (town/animals.ts camelWaterSaving). */
    waterSaving?: number
    escorts?: number
  } = {}
): RouteForecast {
  const members = state.party.length
  const terrain: Biome = route.terrain
  const days = journeyDays(route, pace, speed)
  // Escorted passengers eat and drink after the members (travel/days.ts).
  const party = dailyNeed(members + escorts, terrain, pace)
  // Animals drink from the carried water too; going short hurts no member, so only the total grows.
  // Camels' saving comes off the members' own water (travel/days.ts consumeDay).
  const need = {
    ...party,
    water: Math.max(0, party.water - waterSaving) + animalWater * waterNeed(terrain),
  }
  const base = { food: members, water: Math.max(0, waterNeed(terrain) * members - waterSaving) }
  const found = forage ? expectedForage(state, terrain, pace) : { food: 0, water: 0 }
  const capacity = partyWaterCapacity(state)
  const carried = { food: goodsOf(state.goods, 'food'), water: goodsOf(state.goods, 'water') }

  const water = simulate(days, carried.water, found.water, capacity, base.water, need.water)
  const today = state.day ?? 1
  const lots = foodLotsOf({ goods: state.goods, foodLots: state.foodLots ?? [], day: today })
  const shelf = shelfDays(content)
  const food = simulateFood(days, lots, today, found.food, base.food, need.food, shelf)
  const warnings: TravelWarning[] = []
  const foraging = found.water > 0
  if (water.runsOutOnDay !== null) {
    warnings.push({
      code: 'waterRunsOut',
      params: {
        day: water.runsOutOnDay,
        shortfallDays: water.shortfallDays,
        withForaging: foraging,
      },
    })
  } else if (foraging) {
    const dry = simulate(days, carried.water, 0, capacity, base.water, need.water)
    if (dry.runsOutOnDay !== null) {
      warnings.push({ code: 'waterReliesOnForaging', params: { day: dry.runsOutOnDay } })
    }
  }
  if (food.runsOutOnDay !== null) {
    warnings.push({
      code: 'foodRunsOut',
      params: {
        day: food.runsOutOnDay,
        shortfallDays: food.shortfallDays,
        // What spoils on the way was never there to eat.
        missing: Math.ceil(Math.max(0, days * base.food - carried.food + food.spoiled) - EPSILON),
        withForaging: found.food > 0,
      },
    })
  }
  const tired = state.party
    .filter((c) => c.exhaustion > 0 && c.exhaustion < MAX_EXHAUSTION)
    .sort((a, b) => b.exhaustion - a.exhaustion)
  if (tired.length > 0) {
    const level = tired[0].exhaustion
    warnings.push({
      code: 'departingExhausted',
      params: {
        members: tired.map((c) => ({ characterId: c.id, name: c.name, level: c.exhaustion })),
        level,
        speedPenalty: terrain === 'sea' ? 0 : 1 - exhaustionSpeed(state.party),
        checkPenalty: EXHAUSTION_PENALTY * level,
        severe: level >= MAX_EXHAUSTION - 1,
      },
    })
  }
  if (pace === 'forced' && terrain !== 'sea') {
    const risks = state.party.filter(canAct).map((c) => {
      const levels = marchExhaustion(c, days, FORCED_MARCH_DC)
      const expected = levels.reduce((sum, p, level) => sum + p * level, 0) - c.exhaustion
      return { c, expected, death: levels[MAX_EXHAUSTION] }
    })
    const deadliest = [...risks].sort((a, b) => b.death - a.death)[0]
    const deadly = deadliest && deadliest.death >= DEADLY_MARCH_CHANCE ? deadliest : null
    // The severe warning replaces the ordinary one for the same member, so the ordinary one names
    // the worst-off of the others.
    const worst = risks
      .filter((r) => r.c.id !== deadly?.c.id)
      .sort((a, b) => b.expected - a.expected)[0]
    if (worst) {
      warnings.push({
        code: 'forcedMarchExhaustion',
        params: {
          days,
          dc: FORCED_MARCH_DC,
          characterId: worst.c.id,
          name: worst.c.name,
          expectedLevels: worst.expected,
        },
      })
    }
    if (deadly) {
      warnings.push({
        code: 'forcedMarchDeadly',
        params: {
          days,
          dc: FORCED_MARCH_DC,
          characterId: deadly.c.id,
          name: deadly.c.name,
          chance: deadly.death,
        },
      })
    }
  }
  return {
    days,
    water: {
      needed: days * need.water,
      carried: carried.water,
      capacity,
      expectedForage: found.water,
      ...water,
    },
    food: {
      needed: days * need.food,
      carried: carried.food,
      expectedForage: found.food,
      ...food,
    },
    warnings,
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The English text of a warning, until the UI localises the codes. */
export function warningText(w: TravelWarning): string {
  switch (w.code) {
    case 'waterRunsOut':
      return (
        `Water runs out on day ${w.params.day}${w.params.withForaging ? ' even with foraging' : ''}` +
        ` (${plural(w.params.shortfallDays, 'day')} without).`
      )
    case 'waterReliesOnForaging':
      return `The water lasts only if foraging goes well: it runs out on day ${w.params.day} without.`
    case 'foodRunsOut':
      return (
        `Not enough food for the journey: it runs out on day ${w.params.day}` +
        (w.params.missing > 0 ? ` (${plural(w.params.missing, 'ration')} short).` : '.')
      )
    case 'forcedMarchExhaustion':
      return (
        `A forced march of ${plural(w.params.days, 'day')} (CON DC ${w.params.dc} each day) will ` +
        `likely exhaust ${w.params.name}: about ${w.params.expectedLevels.toFixed(1)} levels.`
      )
    case 'forcedMarchDeadly':
      return (
        `A forced march of ${plural(w.params.days, 'day')} could kill ${w.params.name} ` +
        `(${Math.round(w.params.chance * 100)}% chance of reaching the sixth level of exhaustion).`
      )
    case 'encumbered':
      return (
        `Encumbered: ${w.params.weight} of ${w.params.capacity} kg. ` +
        'The party walks slower and can’t force a march.'
      )
    case 'departingExhausted': {
      const { members, speedPenalty, checkPenalty, severe } = w.params
      const who = members.map((m) => `${m.name} (level ${m.level})`)
      const names = who.length === 1 ? who[0] : `${who.slice(0, -1).join(', ')} and ${who.at(-1)}`
      const slower =
        speedPenalty > 0 ? `the party travels ${Math.round(speedPenalty * 100)}% slower and ` : ''
      const checks =
        members.length === 1
          ? `every check is −${checkPenalty}`
          : `checks are up to −${checkPenalty}`
      const death = severe ? ` One more level of exhaustion would kill ${members[0].name}.` : ''
      return `${names} ${members.length === 1 ? 'is' : 'are'} exhausted: ${slower}${checks}.${death}`
    }
  }
}
