import { describe, expect, test } from 'vitest'
import {
  AnimalDefSchema,
  ContractTemplateSchema,
  GoodDefSchema,
  MarketRuleSchema,
  ProducerRuleSchema,
  PersonRoleSchema,
  ServiceRoleSchema,
} from './economy'
import { GOOD_CATEGORY, GOODS } from './types'

describe('vocabulary', () => {
  test('all 15 goods, each in a category, three of them precious', () => {
    expect(GOODS).toHaveLength(15)
    expect(Object.keys(GOOD_CATEGORY).sort()).toEqual([...GOODS].sort())
    expect(GOODS.filter((g) => GOOD_CATEGORY[g] === 'precious')).toEqual([
      'gems',
      'relics',
      'luxuries',
    ])
  })
})

describe('goods', () => {
  test('fill in defaults', () => {
    expect(
      GoodDefSchema.parse({
        id: 'food',
        name: 'Food',
        unit: 'ration',
        weight: 1,
        price: 1,
        uses: 'Eaten each day.',
      })
    ).toEqual({
      id: 'food',
      name: 'Food',
      unit: 'ration',
      weight: 1,
      price: 1,
      spoilPerDay: 0,
      depth: 1,
      uses: 'Eaten each day.',
    })
  })

  test('reject unknown goods, negative weights and spoilage above 1', () => {
    const base = { id: 'food', name: 'Food', unit: 'ration', weight: 1, price: 1, uses: '' }
    expect(GoodDefSchema.safeParse({ ...base, id: 'spices' }).success).toBe(false)
    expect(GoodDefSchema.safeParse({ ...base, weight: -1 }).success).toBe(false)
    expect(GoodDefSchema.safeParse({ ...base, spoilPerDay: 1.5 }).success).toBe(false)
  })
})

describe('service roles', () => {
  test('fill in defaults', () => {
    expect(ServiceRoleSchema.parse({ id: 'healer', function: 'temple' })).toEqual({
      id: 'healer',
      function: 'temple',
      trades: [],
      buysOnly: [],
      actions: [],
    })
  })

  test('reject unknown actions and functions', () => {
    expect(
      ServiceRoleSchema.safeParse({ id: 'arena', function: 'trade', actions: ['fight'] }).success
    ).toBe(false)
    expect(ServiceRoleSchema.safeParse({ id: 'arena', function: 'sport' }).success).toBe(false)
  })

  test('recruits and accessories need their actions (Plan 5a)', () => {
    const ok = (role: Record<string, unknown>) =>
      ServiceRoleSchema.safeParse({ id: 'guild', function: 'hire', ...role }).success
    const recruits = { offers: [1, 3], levels: [1, 3] }
    expect(ok({ actions: ['recruit'], recruits })).toBe(true)
    expect(ok({ actions: [], recruits })).toBe(false)
    expect(ok({ actions: ['recruit'], recruits: { ...recruits, offers: [3, 1] } })).toBe(false)
    expect(ok({ actions: ['accessories'], accessories: { offers: [2, 4], maxTier: 2 } })).toBe(true)
    expect(ok({ accessories: { offers: [2, 4], maxTier: 2 } })).toBe(false)
    expect(ok({ actions: ['accessories'], accessories: { offers: [2, 4], maxTier: 3 } })).toBe(
      false
    )
    expect(
      ServiceRoleSchema.parse({ id: 'guild', function: 'hire', actions: ['recruit'], recruits })
        .recruits
    ).toEqual({ ...recruits, fee: 1, wage: 1 })
  })
})

describe('market rules', () => {
  test('fill in defaults', () => {
    expect(
      MarketRuleSchema.parse({ id: 'coast', label: 'Coast', when: { coastal: true } })
    ).toEqual({ id: 'coast', label: 'Coast', when: { coastal: true }, demand: {} })
  })

  test('levels stay within −2..2, and threat within 0..3', () => {
    const rule = (over: Record<string, unknown>) =>
      MarketRuleSchema.safeParse({ id: 'r', label: 'R', when: {}, ...over }).success
    expect(rule({ demand: { arms: -2, food: 2 } })).toBe(true)
    expect(rule({ demand: { food: 3 } })).toBe(false)
    expect(rule({ demand: { arms: -3 } })).toBe(false)
    expect(rule({ demand: { arms: 1.5 } })).toBe(false)
    expect(rule({ demand: { spices: 1 } })).toBe(false)
    expect(rule({ when: { threatAtLeast: 4 } })).toBe(false)
  })
})

describe('producer rules', () => {
  test('output levels are 1–3 for known goods', () => {
    const rule = (output: Record<string, unknown>) =>
      ProducerRuleSchema.safeParse({ id: 'p', label: 'P', when: {}, output }).success
    expect(rule({ timber: 3, fuel: 1 })).toBe(true)
    expect(rule({ timber: 4 })).toBe(false)
    expect(rule({ timber: 0 })).toBe(false)
    expect(rule({ spices: 1 })).toBe(false)
  })
})

describe('animals', () => {
  test('fill in defaults', () => {
    expect(AnimalDefSchema.parse({ id: 'mule', name: 'Mule', price: 8, capacity: 90 })).toEqual({
      id: 'mule',
      name: 'Mule',
      price: 8,
      capacity: 90,
      speed: 1,
      rider: false,
      roadsOnly: false,
      waterPerDay: 1,
      upkeepPerDay: 0,
      stealable: false,
    })
  })

  test('a riding horse can be hired, ridden, kept and stolen', () => {
    const horse = AnimalDefSchema.parse({
      id: 'riding-horse',
      name: 'Riding horse',
      price: 75,
      hirePerDay: 1,
      capacity: 30,
      speed: 2,
      rider: true,
      upkeepPerDay: 0.5,
      stealable: true,
      maxPathDanger: 1,
    })
    expect(horse).toMatchObject({ hirePerDay: 1, upkeepPerDay: 0.5, stealable: true })
  })
})

describe('person roles', () => {
  test('fill in defaults and keep the service optional', () => {
    expect(PersonRoleSchema.parse({ id: 'elder', name: 'elder' })).toEqual({
      id: 'elder',
      name: 'elder',
      minSize: 0,
      weight: 1,
      titles: [],
    })
    expect(PersonRoleSchema.safeParse({ id: 'elder', name: 'elder', minSize: 6 }).success).toBe(
      false
    )
  })
})

describe('contract templates', () => {
  const courier = {
    id: 'carry-cloth',
    kind: 'courier',
    title: 'Cloth for {dest}',
    text: '{patron} needs {amount} {good} taken to {dest}.',
    minSize: 1,
    km: { min: 40, max: 200 },
    goods: ['luxuries'],
    amount: { min: 2, max: 6 },
    urgentChance: 0.2,
    reputation: { patron: 6, settlement: 3 },
  }
  const bounty = {
    id: 'clear-lair',
    kind: 'bounty',
    title: 'A bounty',
    text: '{patron} pays for clearing {site}.',
    minSize: 2,
    km: { min: 10, max: 60 },
    poiCategories: ['lair'],
    urgentChance: 0,
    reputation: { patron: 4, settlement: 4 },
  }

  test('fill in defaults', () => {
    expect(ContractTemplateSchema.parse(courier)).toEqual({ ...courier, weight: 1, pay: 1 })
  })

  test('supply and courier contracts need goods and an amount', () => {
    const { goods: _goods, ...noGoods } = courier
    const { amount: _amount, ...noAmount } = courier
    expect(ContractTemplateSchema.safeParse(noGoods).success).toBe(false)
    expect(ContractTemplateSchema.safeParse(noAmount).success).toBe(false)
    expect(ContractTemplateSchema.safeParse({ ...noGoods, kind: 'supply' }).success).toBe(false)
  })

  test('bounties and errands need POI categories', () => {
    expect(ContractTemplateSchema.safeParse(bounty).success).toBe(true)
    const { poiCategories: _categories, ...noSites } = bounty
    expect(ContractTemplateSchema.safeParse(noSites).success).toBe(false)
    expect(ContractTemplateSchema.safeParse({ ...noSites, kind: 'errand' }).success).toBe(false)
    expect(ContractTemplateSchema.safeParse({ ...noSites, kind: 'escort' }).success).toBe(true)
  })

  test('ranges run low to high', () => {
    expect(ContractTemplateSchema.safeParse({ ...courier, km: { min: 50, max: 10 } }).success).toBe(
      false
    )
    expect(
      ContractTemplateSchema.safeParse({ ...courier, amount: { min: 3, max: 1 } }).success
    ).toBe(false)
  })

  test('a gated template names a standing', () => {
    expect(ContractTemplateSchema.safeParse({ ...courier, minStanding: 'known' }).success).toBe(
      true
    )
    expect(ContractTemplateSchema.safeParse({ ...courier, minStanding: 'friend' }).success).toBe(
      false
    )
  })
})
