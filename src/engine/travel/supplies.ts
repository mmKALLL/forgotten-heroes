import type { Good } from '../../schema/constants'
import type { Goods } from '../../schema/state'

/** A new party carries this many days of food per member. */
export const STARTING_FOOD_DAYS = 5
/** Waterskins hold this many days of water per member. */
export const WATER_DAYS = 4

export const goodsOf = (goods: Goods, good: Good): number => goods[good] ?? 0
export const waterCapacity = (members: number): number => WATER_DAYS * members
export const startingGoods = (members: number): Goods => ({
  food: STARTING_FOOD_DAYS * members,
  water: waterCapacity(members),
})
