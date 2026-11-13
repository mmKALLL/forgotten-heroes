import { describe, expect, test } from 'vitest'
import { emptyContent } from '../../content/build'
import { fixtureContent } from '../test-fixtures'
import { byValue, changeGoods, goodsInCategory, goodsValue, goodsWeight } from './goods'

const content = fixtureContent()

describe('goods', () => {
  test('weight and value at base price', () => {
    // food 1 kg / 1 gp, gems 1 kg / 100 gp, stone 50 kg / 2 gp
    expect(goodsWeight({ food: 4, gems: 2, stone: 1 }, content)).toBe(56)
    expect(goodsValue({ food: 4, gems: 2, stone: 1 }, content)).toBe(206)
    expect(goodsValue({ food: 4, gems: 2 }, content, (g) => g === 'gems')).toBe(200)
  })

  test('goods without a definition weigh nothing and are worth nothing', () => {
    expect(goodsWeight({ food: 10, gems: 3 }, emptyContent())).toBe(0)
    expect(goodsValue({ food: 10, gems: 3 }, emptyContent())).toBe(0)
  })

  test('categories in design order, and most valuable first', () => {
    expect(goodsInCategory('precious')).toEqual(['gems', 'relics', 'luxuries'])
    expect(byValue(content, goodsInCategory('consumables'))).toEqual([
      'arcana',
      'alchemicals',
      'healing',
    ])
  })
})

describe('changeGoods', () => {
  test('a fraction takes that share of what is carried, rounded up', () => {
    expect(changeGoods({ gems: 3 }, content, { good: 'gems', fraction: 0.5 })).toEqual({ gems: 1 })
    expect(changeGoods({ gems: 0 }, content, { good: 'gems', fraction: 0.5 })).toEqual({ gems: 0 })
  })

  test('a category amount takes the most valuable first, never below 0', () => {
    const goods = { healing: 3, alchemicals: 1, arcana: 1 }
    expect(changeGoods(goods, content, { category: 'consumables', amount: -2 })).toEqual({
      healing: 3,
      alchemicals: 0,
      arcana: 0,
    })
    expect(changeGoods(goods, content, { category: 'consumables', amount: -9 })).toEqual({
      healing: 0,
      alchemicals: 0,
      arcana: 0,
    })
  })

  test('a category gain spreads round-robin, most valuable first', () => {
    expect(changeGoods({}, content, { category: 'consumables', amount: 4 })).toEqual({
      arcana: 2,
      alchemicals: 1,
      healing: 1,
    })
  })

  test('a category fraction takes from each good', () => {
    expect(
      changeGoods({ gems: 3, relics: 1, luxuries: 4 }, content, {
        category: 'precious',
        fraction: 0.5,
      })
    ).toEqual({ gems: 1, relics: 0, luxuries: 2 })
  })

  test('a single good gains and loses', () => {
    expect(changeGoods({ healing: 1 }, content, { good: 'healing', amount: 2 })).toEqual({
      healing: 3,
    })
    expect(changeGoods({ healing: 1 }, content, { good: 'healing', amount: -2 })).toEqual({
      healing: 0,
    })
  })
})
