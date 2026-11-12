import type { Biome, Pace } from '../../schema/types'
import type { Character, GameState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { canAct, statModifier } from '../rules/character'
import { tierOdds } from '../rules/checks'
import { expectedForage } from './forage'
import { FORCED_MARCH_DC } from './pace'
import { journeyDays } from './routes'
import { dailyNeed, goodsOf, partyWaterCapacity, waterNeed } from './supplies'

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

/** A forced march this likely to kill someone (exhaustion level 6) gets a severe warning. */
export const DEADLY_MARCH_CHANCE = 0.1

/** Warnings the UI should show as severe. */
export const isSevere = (w: TravelWarning): boolean => w.code === 'forcedMarchDeadly'

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

export type RouteForecast = {
  days: number
  water: WaterForecast
  food: SupplyForecast
  warnings: TravelWarning[]
}

/** Water, food and warnings for taking this road at this pace with the party as it is now. */
export function forecastJourney(
  state: Pick<GameState, 'party' | 'goods' | 'waterskins'>,
  route: Pick<Route, 'km' | 'terrain'>,
  pace: Pace,
  coverTracks = false,
  forage = true
): RouteForecast {
  const members = state.party.length
  const terrain: Biome = route.terrain
  const days = journeyDays(route, pace, coverTracks)
  const need = dailyNeed(members, terrain, pace)
  const base = { food: members, water: waterNeed(terrain) * members }
  const found = forage ? expectedForage(state, terrain, pace) : { food: 0, water: 0 }
  const capacity = partyWaterCapacity(state)
  const carried = { food: goodsOf(state.goods, 'food'), water: goodsOf(state.goods, 'water') }

  const water = simulate(days, carried.water, found.water, capacity, base.water, need.water)
  const food = simulate(days, carried.food, found.food, Infinity, base.food, need.food)
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
        missing: Math.max(0, days * base.food - carried.food),
        withForaging: found.food > 0,
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
  }
}
