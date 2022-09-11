import { itemList } from '../data'
import type { Action, GameState, Item, ItemTag, SettlementService } from '../types'
import { attemptToPurchase } from './item-utils'

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
  quality,
  typicalRarity,
  maxRarity,
}: {
  itemSaleTags: ItemTag[]
  quality: number
  typicalRarity: number
  maxRarity: number
}): Item[] {
  const effQuality = quality / 2 + 0.6
  return Object.values(itemList).filter(
    (item) =>
      Math.random() < effQuality * 0.9 &&
      item.tags.some((tag) => itemSaleTags.includes(tag)) &&
      item.rarity < effQuality * maxRarity &&
      (item.rarity < typicalRarity * 2 || Math.random() < effQuality * 0.25) &&
      (item.rarity < typicalRarity || Math.random() < effQuality * 0.33) &&
      (item.rarity < typicalRarity / 2 || Math.random() < effQuality * 0.66)
  )
}

export function generateSettlementServiceTradingActions(service: SettlementService): Action[] {
  return service.itemSaleList.map((item) => ({
    label: `Buy ${item.name}`,
    handler: attemptToPurchase(item, item.price * service.purchasePriceMultiplier),
  }))
}
