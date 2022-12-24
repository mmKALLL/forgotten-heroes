import { itemList } from '../data'
import type { FixedAction, GameState, Item, ItemTag, SettlementService } from '../types'
import { attemptToPurchase, generateItemDescription } from './item-utils'

export function generateSettlementServiceActions(service: SettlementService) {
  return generateSettlementServiceTradingActions(service).concat([
    {
      label: 'Go back',
      handler: (gs) => (gs.screen === 'settlement' ? { ...gs, activeService: undefined } : gs),
    },
  ])
}

export function generateSettlementServiceItemSaleList({
  itemSaleTags,
  purchasePriceMultiplier,
  quality,
  typicalRarity,
  maxRarity,
}: {
  itemSaleTags: ItemTag[]
  purchasePriceMultiplier: number
  quality: number
  typicalRarity: number
  maxRarity: number
}): Item[] {
  const effQuality = quality / 2 + 0.6
  return Object.values(itemList)
    .filter(
      (item) =>
        Math.random() < effQuality * 0.9 &&
        item.tags.some((tag) => itemSaleTags.includes(tag)) &&
        item.rarity < effQuality * maxRarity &&
        (item.rarity < typicalRarity * 2 || Math.random() < effQuality * 0.25) &&
        (item.rarity < typicalRarity || Math.random() < effQuality * 0.33) &&
        (item.rarity < typicalRarity / 2 || Math.random() < effQuality * 0.66)
    )
    .map((item) => ({ ...item, price: Math.round(item.price * purchasePriceMultiplier) }))
}

export function generateSettlementServiceTradingActions(service: SettlementService): FixedAction[] {
  return service.itemSaleList.map((item) => ({
    label: `Buy ${item.name}`,
    description: `Cost: ${item.price}. ${generateItemDescription(item)}`,
    handler: attemptToPurchase(item),
  }))
}
