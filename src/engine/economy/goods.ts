import type { Content } from '../../content/build'
import type { GoodDef } from '../../schema/economy'
import { GOODS, GOOD_CATEGORY, type Good, type GoodCategory } from '../../schema/types'
import type { Goods } from '../../schema/state'

// The 15 goods of design §4 as cargo: weight (kg) and value at base price (food's shelf life is
// economy/food.ts). A good with no definition in the content weighs nothing, is worth nothing and
// never spoils, so a world without economy data still plays.

/** The content's definition of a good, or null when the data has none. */
export const goodDef = (content: Content, good: Good): GoodDef | null =>
  Object.hasOwn(content.goods, good) ? content.goods[good] : null

/** kg per unit (0 without a definition). */
export const goodWeight = (content: Content, good: Good): number =>
  goodDef(content, good)?.weight ?? 0

/** Base gp per unit, before supply and demand (0 without a definition). */
export const goodPrice = (content: Content, good: Good): number =>
  goodDef(content, good)?.price ?? 0

/** A good's name, e.g. "Gems"; its id without a definition. */
export const goodName = (content: Content, good: Good): string =>
  goodDef(content, good)?.name ?? good

/** The goods of one category, in design order. */
export const goodsInCategory = (category: GoodCategory): Good[] =>
  GOODS.filter((g) => GOOD_CATEGORY[g] === category)

const units = (goods: Goods, good: Good): number => goods[good] ?? 0

/** The total weight of these goods, in kg. */
export const goodsWeight = (goods: Goods, content: Content): number =>
  GOODS.reduce((sum, g) => sum + units(goods, g) * goodWeight(content, g), 0)

/** What these goods are worth at base price, optionally only those passing `filter`. */
export const goodsValue = (
  goods: Goods,
  content: Content,
  filter: (good: Good) => boolean = () => true
): number =>
  GOODS.filter(filter).reduce((sum, g) => sum + units(goods, g) * goodPrice(content, g), 0)

/** Most valuable first by base price; ties keep design order. */
export const byValue = (content: Content, goods: readonly Good[]): Good[] =>
  [...goods].sort((a, b) => goodPrice(content, b) - goodPrice(content, a))

/** A change to the goods carried, as the `goods` effect describes it (T1). */
export type GoodsChange = {
  good?: Good
  category?: GoodCategory
  amount?: number
  fraction?: number
}

/** Takes `n` units from a list of goods, the first in the list first. */
function take(goods: Goods, order: readonly Good[], n: number): Goods {
  const next = { ...goods }
  let left = n
  for (const g of order) {
    if (left <= 0) break
    const taken = Math.min(left, units(next, g))
    if (taken > 0) next[g] = units(next, g) - taken
    left -= taken
  }
  return next
}

/** Gives `n` units round-robin over a list of goods, the first in the list first. */
function give(goods: Goods, order: readonly Good[], n: number): Goods {
  const next = { ...goods }
  for (let i = 0; i < n && order.length > 0; i++) {
    const g = order[i % order.length]
    next[g] = units(next, g) + 1
  }
  return next
}

/**
 * Applies a `goods` change. A `fraction` takes that share of each good carried, rounded up
 * (theft). A category `amount` takes units from the most valuable goods first, or gives them
 * round-robin starting with the most valuable. Goods never drop below 0.
 */
export function changeGoods(goods: Goods, content: Content, change: GoodsChange): Goods {
  const targets = change.good ? [change.good] : byValue(content, goodsInCategory(change.category!))
  if (change.fraction !== undefined) {
    const next = { ...goods }
    for (const g of targets) {
      const lost = Math.ceil(units(goods, g) * change.fraction)
      if (lost > 0) next[g] = units(goods, g) - lost
    }
    return next
  }
  const amount = Math.trunc(change.amount ?? 0)
  return amount < 0 ? take(goods, targets, -amount) : give(goods, targets, amount)
}
