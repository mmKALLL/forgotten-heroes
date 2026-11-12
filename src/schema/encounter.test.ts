import { describe, expect, test } from 'vitest'
import {
  DcSchema,
  EffectSchema,
  OptionSchema,
  RequirementSchema,
  SituationSchema,
  SituationTemplateSchema,
  SlotSourceSchema,
} from './encounter'

const fixed = (id: string) => ({ id, kind: 'fixed', label: id, outcome: { text: `You ${id}.` } })

describe('effects', () => {
  test('parse with defaults', () => {
    expect(EffectSchema.parse({ effect: 'followUp', situation: 'ambush' })).toEqual({
      effect: 'followUp',
      situation: 'ambush',
      after: 0,
    })
    expect(EffectSchema.parse({ effect: 'log', text: 'Rain.' })).toEqual({
      effect: 'log',
      text: 'Rain.',
      tone: 'info',
    })
  })

  test('reject unknown effects, missing targets and bad positions', () => {
    expect(EffectSchema.safeParse({ effect: 'goods', amount: 1 }).success).toBe(false)
    expect(EffectSchema.safeParse({ effect: 'hp', amount: -3 }).success).toBe(false)
    expect(
      EffectSchema.safeParse({ effect: 'exhaustion', amount: 1, target: 'random' }).success
    ).toBe(false)
    expect(EffectSchema.safeParse({ effect: 'position', position: 'advantage' }).success).toBe(
      false
    )
    expect(EffectSchema.safeParse({ effect: 'days', amount: 0 }).success).toBe(false)
  })

  test('xp, camaraderie and accessory loot (Plan 5a)', () => {
    const ok = (effect: Record<string, unknown>) => EffectSchema.safeParse(effect).success
    expect(ok({ effect: 'xp', amount: 50 })).toBe(true)
    expect(ok({ effect: 'xp', amount: -10 })).toBe(false)
    expect(ok({ effect: 'camaraderie', amount: -2 })).toBe(true)
    expect(ok({ effect: 'accessory', tier: 1 })).toBe(true)
    expect(ok({ effect: 'accessory', tier: 3 })).toBe(false)
  })
})

describe('trade effects and requirements (Plan 4)', () => {
  const ok = (effect: Record<string, unknown>) => EffectSchema.safeParse(effect).success

  test('a goods effect names one good or one category, and one amount or fraction', () => {
    expect(ok({ effect: 'goods', good: 'food', amount: -2 })).toBe(true)
    expect(ok({ effect: 'goods', category: 'precious', fraction: 0.5 })).toBe(true)
    expect(ok({ effect: 'goods', good: 'food', category: 'essentials', amount: 1 })).toBe(false)
    expect(ok({ effect: 'goods', amount: 1 })).toBe(false)
    expect(ok({ effect: 'goods', good: 'gems' })).toBe(false)
    expect(ok({ effect: 'goods', good: 'gems', amount: -1, fraction: 0.5 })).toBe(false)
    expect(ok({ effect: 'goods', good: 'gems', fraction: 0 })).toBe(false)
    expect(ok({ effect: 'goods', good: 'gems', fraction: 1.5 })).toBe(false)
    expect(ok({ effect: 'goods', good: 'spices', amount: 1 })).toBe(false)
    expect(ok({ effect: 'goods', category: 'trinkets', amount: 1 })).toBe(false)
  })

  test('reputation with the domain settlement', () => {
    expect(EffectSchema.parse({ effect: 'reputation', amount: -3 })).toEqual({
      effect: 'reputation',
      amount: -3,
    })
    expect(ok({ effect: 'reputation', amount: 1.5 })).toBe(false)
  })

  test('animals are gained by name, and lost by name or to thieves', () => {
    expect(ok({ effect: 'animals', animal: 'mule', amount: 1 })).toBe(true)
    expect(ok({ effect: 'animals', amount: -1 })).toBe(true)
    expect(ok({ effect: 'animals', amount: 1 })).toBe(false)
    expect(ok({ effect: 'animals', animal: 'mule', amount: 0 })).toBe(false)
  })

  test('requirements: goods carried and standing here', () => {
    expect(RequirementSchema.parse({ req: 'goods', good: 'healing', min: 1 })).toEqual({
      req: 'goods',
      good: 'healing',
      min: 1,
    })
    expect(RequirementSchema.safeParse({ req: 'goods', good: 'healing', min: 0 }).success).toBe(
      false
    )
    expect(RequirementSchema.parse({ req: 'standing', min: 'known' })).toEqual({
      req: 'standing',
      min: 'known',
    })
    expect(RequirementSchema.safeParse({ req: 'standing', min: 'pal' }).success).toBe(false)
  })
})

describe('DCs', () => {
  test.each([14, 1, 40, 'dc', 'dc+2', 'dc-1'])('%s is valid', (dc) => {
    expect(DcSchema.safeParse(dc).success).toBe(true)
  })
  test.each([0, 41, 12.5, 'dc*2', 'DC+1', '14'])('%s is invalid', (dc) => {
    expect(DcSchema.safeParse(dc).success).toBe(false)
  })
})

describe('options', () => {
  test('a check option with an ability override; crit tiers are optional', () => {
    const option = OptionSchema.parse({
      id: 'threaten',
      kind: 'check',
      label: 'Veiled threat',
      check: { skill: 'intimidation', ability: 'cha', dc: 13 },
      outcomes: {
        fail: {
          text: 'They laugh.',
          effects: [{ effect: 'position', position: 'exposed' }],
          stay: true,
        },
        partial: { text: 'They hesitate.' },
        success: { text: 'They back off.', twist: { text: 'It was a feint.' } },
      },
    })
    expect(option.kind === 'check' && option.check.ability).toBe('cha')
    expect(option.requires).toEqual([])
  })

  test('a check option needs fail, partial and success', () => {
    const bad = {
      id: 'x',
      kind: 'check',
      label: 'x',
      check: { skill: 'stealth', dc: 12 },
      outcomes: { fail: { text: '' } },
    }
    expect(OptionSchema.safeParse(bad).success).toBe(false)
  })
})

describe('situations', () => {
  test('defaults: start stage, weight, slots, not a wonder, not a site', () => {
    const s = SituationSchema.parse({
      id: 'quiet-road',
      title: 'Quiet road',
      stages: { start: { text: 'Nothing stirs.', options: [fixed('wait'), fixed('go')] } },
    })
    expect(s).toMatchObject({
      start: 'start',
      weight: 1,
      wonder: false,
      followUpOnly: false,
      site: false,
      slots: {},
      tags: [],
    })
  })

  test('stage ids must be kebab-case', () => {
    const bad = { id: 'x', title: 'x', stages: { Start: { text: '' } } }
    expect(SituationSchema.safeParse(bad).success).toBe(false)
  })

  test('slot sources', () => {
    expect(SlotSourceSchema.parse({ from: 'creature', types: ['humanoid'] })).toEqual({
      from: 'creature',
      types: ['humanoid'],
      form: 'group',
    })
    expect(SlotSourceSchema.safeParse({ from: 'creature', types: ['robot'] }).success).toBe(false)
  })

  test('a template is an archetype plus text and slots', () => {
    const t = SituationTemplateSchema.parse({
      id: 'roadside-plea',
      title: 'Roadside plea',
      text: '{Who} waves you down.',
      slots: { who: { from: 'table', table: 'who' } },
      archetype: { id: 'someone-in-need' },
      twist: { chance: 0.3, what: 'it is a trap' },
    })
    expect(t.archetype).toEqual({ id: 'someone-in-need', dc: 13, reward: 1 })
  })
})
