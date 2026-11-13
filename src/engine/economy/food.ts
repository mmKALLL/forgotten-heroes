import type { Content } from '../../content/build'
import type { FoodLot, GameState } from '../../schema/state'
import { appendLog } from '../log'
import { goodDef } from './goods'
import { SPOIL_SHOW_DAYS } from '../constants'

// Food keeps a shelf life (design §4, designer call 2026-11-13): every batch the party gets keeps
// the food's `shelfDays` (14), then what is left of it spoils at once. `goods.food` stays the
// quantity every reader uses; `GameState.foodLots` only says how old it is, oldest first.
//
// The lots follow `goods.food` (syncFoodLots) rather than every writer keeping them: food that
// appears is a new batch dated the day it appeared, and food that goes (eaten, sold, stolen,
// delivered, dropped) goes oldest first. The step syncs after every action, and a day syncs before
// the party eats and again as it ends, so food got on the road is dated the day it was got.

const total = (lots: readonly FoodLot[]): number => lots.reduce((n, l) => n + l.amount, 0)

/**
 * The lots made to add up to `food`: any extra is a new batch dated `day` (kept in day order,
 * merged with a batch of the same day), and any shortfall comes off the oldest first. Returns the
 * same array when they already agree.
 */
export function syncLots(lots: readonly FoodLot[], food: number, day: number): FoodLot[] {
  const have = total(lots)
  if (have === food) return lots as FoodLot[]
  if (food > have) {
    const extra = food - have
    const at = lots.findIndex((l) => l.day >= day)
    if (at === -1) return [...lots, { day, amount: extra }]
    if (lots[at].day === day) {
      return lots.map((l, i) => (i === at ? { ...l, amount: l.amount + extra } : l))
    }
    return [...lots.slice(0, at), { day, amount: extra }, ...lots.slice(at)]
  }
  return takeOldest(lots, have - food)
}

/** The lots after `n` units come off the oldest first (empty lots dropped). */
function takeOldest(lots: readonly FoodLot[], n: number): FoodLot[] {
  let left = n
  const next: FoodLot[] = []
  for (const l of lots) {
    const taken = Math.min(left, l.amount)
    left -= taken
    if (l.amount > taken) next.push(taken > 0 ? { ...l, amount: l.amount - taken } : l)
  }
  return next
}

/** The party's food lots, agreeing with `goods.food` (new food dated `day`, today by default). */
export const foodLotsOf = (
  state: Pick<GameState, 'goods' | 'foodLots' | 'day'>,
  day = state.day
): FoodLot[] => syncLots(state.foodLots, state.goods.food ?? 0, day)

/** The state with its food lots agreeing with `goods.food`; the same state when they do. */
export function syncFoodLots(state: GameState, day = state.day): GameState {
  const foodLots = foodLotsOf(state, day)
  return foodLots === state.foodLots ? state : { ...state, foodLots }
}

/** How many days the food keeps, or null when it never spoils (no `shelfDays` in the content). */
export const shelfDays = (content: Content | undefined): number | null =>
  (content && goodDef(content, 'food')?.shelfDays) ?? null

/** The day a batch got on `day` is gone: it spoils as the day before it ends. */
export const spoilsOn = (lot: Pick<FoodLot, 'day'>, shelf: number): number => lot.day + shelf

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`)

/**
 * A day has ended (`state.day` is the new day): food got during it becomes a batch dated the day
 * that ended, and every batch whose shelf life is up spoils at once. Logged, e.g. "3 rations of
 * food spoiled."
 */
export function spoilFood(state: GameState, content: Content): GameState {
  const synced = syncFoodLots(state, state.day - 1)
  const shelf = shelfDays(content)
  if (shelf === null) return synced
  const fresh = synced.foodLots.filter((l) => spoilsOn(l, shelf) > state.day)
  const lost = total(synced.foodLots) - total(fresh)
  if (lost === 0) return synced
  const next: GameState = {
    ...synced,
    foodLots: fresh,
    goods: { ...synced.goods, food: (synced.goods.food ?? 0) - lost },
  }
  const def = goodDef(content, 'food')!
  return appendLog(
    next,
    `${lost} ${plural(lost, def.unit)} of ${def.name.toLowerCase()} spoiled.`,
    'bad'
  )
}

/** Food that will spoil soon: `amount` rations in `inDays` days (1 is as today ends). */
export type Spoiling = { amount: number; inDays: number }

/**
 * The food spoiling within SPOIL_SHOW_DAYS days, soonest first, one entry per day (what the goods
 * bar shows; nothing further off).
 */
export function spoilingSoon(state: GameState, content: Content): Spoiling[] {
  const shelf = shelfDays(content)
  if (shelf === null) return []
  const soon: Spoiling[] = []
  for (const lot of foodLotsOf(state)) {
    const inDays = spoilsOn(lot, shelf) - state.day
    if (inDays > SPOIL_SHOW_DAYS) break
    const last = soon.at(-1)
    if (last && last.inDays === inDays) last.amount += lot.amount
    else soon.push({ amount: lot.amount, inDays: Math.max(1, inDays) })
  }
  return soon
}
