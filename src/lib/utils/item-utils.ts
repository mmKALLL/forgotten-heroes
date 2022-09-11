import type { GameState, Item } from '../types'
import { handleEffectComponents } from './effect-component-handler'
import { assertNever } from './general-utils'

export function generateItemDescription(item: Item) {
  return (
    item.tags.map((tag) => `[${tag}]`).join('') +
    ' ' +
    item.consumableEffectComponents
      .map((component) =>
        component.type === 'buff'
          ? `Provides a ${component.amount} ${component.amount > 0 ? 'buff' : 'debuff'} on ${
              component.stat
            } to ${component.target}.`
          : component.type === 'heal'
          ? 'Heals a bit or something TODO'
          : component.type === 'attack'
          ? 'Does an attack or something TODO'
          : component.type === 'damage'
          ? 'Deals some damage or something TODO'
          : assertNever(component)
      )
      .join('\n')
  )
}

// Curry the item and price into a callback
export function attemptToPurchase<T extends GameState>(item: Item, price: number): (gs: T) => T {
  return (gs: T) => {
    if (gs.player.gold >= price) {
      let newPlayer = { ...gs.player, gold: gs.player.gold - price }
      if (item.tags.includes('instant-consume-on-buy')) {
        return handleEffectComponents({ ...gs, player: newPlayer }, item.consumableEffectComponents)
      } else if (item.tags.includes('stackable')) {
        const itemIndex = newPlayer.inventory.findIndex((heldItem) => heldItem.id === item.id)
        if (itemIndex === -1) {
          newPlayer.inventory.push({
            ...item,
            heldQuantity: item.purchaseUnit,
            equippedToIndex: null,
          })
        } else {
          newPlayer.inventory[itemIndex].heldQuantity += item.purchaseUnit ?? 1
        }
      } else {
        newPlayer.inventory.push({
          ...item,
          heldQuantity: item.purchaseUnit,
          equippedToIndex: null,
        })
      }

      return {
        ...gs,
        player: newPlayer,
      }
    }
    return gs
  }
}
