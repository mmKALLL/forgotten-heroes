import { describe, expect, test } from 'vitest'
import { buildContent, emptyContent } from '../../content/build'
import { fixtureContent, makeState, testEconomy } from '../test-fixtures'
import {
  byValue,
  changeGoods,
  goodsInCategory,
  goodsValue,
  goodsWeight,
  spoil,
  spoilDay,
} from './goods'

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

describe('spoilage', () => {
  const foodSpoils = (rate: number) => {
    const goods = testEconomy['data/claude/goods.json'] as { entries: { id: string }[] }
    const { content: c, errors } = buildContent({
      'data/claude/goods.json': {
        ...goods,
        entries: goods.entries.map((e) => (e.id === 'food' ? { ...e, spoilPerDay: rate } : e)),
      },
    })
    expect(errors).toEqual([])
    return c
  }
  const twoPercent = foodSpoils(0.02)

  test('20 food at 2% for 10 days loses exactly the summed floors; the carry stays in [0, 1)', () => {
    let goods = { food: 20 }
    let carry = {}
    let expected = 20
    let expectedCarry = 0
    for (let day = 0; day < 10; day++) {
      const due = expected * 0.02 + expectedCarry
      expected -= Math.floor(due)
      expectedCarry = due - Math.floor(due)
      const out = spoil(goods, carry, twoPercent)
      goods = out.goods as { food: number }
      carry = out.spoilage
      const c = (carry as { food?: number }).food ?? 0
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(1)
    }
    expect(goods.food).toBe(expected)
    expect(goods.food).toBe(17)
  })

  test('goods that do not spoil are untouched; a day of spoilage is logged', () => {
    const state = makeState({ goods: { food: 20, gems: 2 }, spoilage: {} })
    const after = spoilDay(state, foodSpoils(0.1))
    expect(after.goods).toEqual({ food: 18, gems: 2 })
    expect(after.log.at(-1)!.text).toBe('2 rations of food spoiled.')
    expect(spoilDay(state, content).goods).toEqual(state.goods)
  })
})
