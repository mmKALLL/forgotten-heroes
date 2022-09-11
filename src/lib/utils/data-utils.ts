import { itemList } from '../data'
import type { Action, GameState, Item, ItemTag, SettlementService } from '../types'

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
  return itemList.filter(
    (item) =>
      Math.random() < effQuality * 0.9 &&
      item.tags.some((tag) => itemSaleTags.includes(tag)) &&
      item.rarity < effQuality * maxRarity &&
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

// Curry the item and price into a callback
export function attemptToPurchase<T extends GameState>(item: Item, price: number): (gs: T) => T {
  return (gs: T) => {
    const inventoryItem = gs.player.inventory[item.id]
    if (gs.player.gold >= price) {
      return {
        ...gs,
        player: {
          ...gs.player,
          gold: gs.player.gold - price,
          inventory: {
            ...gs.player.inventory,
            [item.id]: {
              ...(inventoryItem ?? item),
              heldQuantity: (inventoryItem?.heldQuantity ?? 0) + 1,
              equippedToIndex: inventoryItem?.equippedToIndex ?? null,
            },
          },
        },
      }
    }
    return gs
  }
}
