import { describe, expect, test } from 'vitest'
import { AccessoryPartSchema, AccessorySchema, RuleHookSchema } from './gear'
import { GatherRuleSchema } from './gather'
import { HOOK_KINDS } from './types'

const ok = (schema: { safeParse: (x: unknown) => { success: boolean } }, x: unknown) =>
  schema.safeParse(x).success

describe('rule hooks', () => {
  test('one schema option per hook kind', () => {
    const kinds = RuleHookSchema.options.map((o) => o.shape.hook.value)
    expect([...kinds].sort()).toEqual([...HOOK_KINDS].sort())
  })

  test('parse each kind, with bounded amounts', () => {
    expect(ok(RuleHookSchema, { hook: 'skill', skill: 'perception', amount: 1 })).toBe(true)
    expect(ok(RuleHookSchema, { hook: 'skill', skill: 'perception', amount: 3 })).toBe(false)
    expect(ok(RuleHookSchema, { hook: 'skill', skill: 'juggling', amount: 1 })).toBe(false)
    expect(ok(RuleHookSchema, { hook: 'activity', activity: 'gather', amount: 2 })).toBe(true)
    expect(ok(RuleHookSchema, { hook: 'activity', activity: 'fish', amount: 2 })).toBe(false)
    expect(ok(RuleHookSchema, { hook: 'carry', kg: 5 })).toBe(true)
    expect(ok(RuleHookSchema, { hook: 'carry', kg: 0 })).toBe(false)
    expect(ok(RuleHookSchema, { hook: 'lucky' })).toBe(true)
    expect(ok(RuleHookSchema, { hook: 'sellBonus', category: 'precious', share: 0.1 })).toBe(true)
    expect(ok(RuleHookSchema, { hook: 'sellBonus', category: 'precious', share: 0.5 })).toBe(false)
    expect(ok(RuleHookSchema, { hook: 'ward', share: 0.03 })).toBe(true)
    expect(ok(RuleHookSchema, { hook: 'ward', share: 0.3 })).toBe(false)
    expect(ok(RuleHookSchema, { hook: 'fly' })).toBe(false)
    expect(RuleHookSchema.parse({ hook: 'strainFade' })).toEqual({ hook: 'strainFade', amount: 1 })
  })
})

describe('accessory parts', () => {
  const base = { id: 'ring', part: 'base', name: 'Ring', value: 20 }
  const prefix = {
    id: 'fox-eyed',
    part: 'prefix',
    name: 'Fox-eyed',
    value: 30,
    hook: { hook: 'skill', skill: 'perception', amount: 1 },
  }

  test('fill in defaults', () => {
    expect(AccessoryPartSchema.parse(base)).toEqual({ ...base, weight: 1, minTier: 1 })
  })

  test('an affix needs a hook and a base has none', () => {
    expect(ok(AccessoryPartSchema, prefix)).toBe(true)
    expect(ok(AccessoryPartSchema, { ...prefix, hook: undefined })).toBe(false)
    expect(ok(AccessoryPartSchema, { ...base, hook: prefix.hook })).toBe(false)
  })

  test('only affixes are limited to bases, and tiers are 1 or 2', () => {
    expect(ok(AccessoryPartSchema, { ...prefix, bases: ['ring'] })).toBe(true)
    expect(ok(AccessoryPartSchema, { ...base, bases: ['ring'] })).toBe(false)
    expect(ok(AccessoryPartSchema, { ...prefix, minTier: 3 })).toBe(false)
  })

  test('an accessory is a self-contained snapshot', () => {
    const worn = {
      id: 'a-1',
      name: 'Fox-eyed Ring',
      tier: 1,
      hooks: [{ hook: 'skill', skill: 'perception', amount: 1 }],
      value: 50,
    }
    expect(AccessorySchema.parse(worn)).toEqual(worn)
    expect(ok(AccessorySchema, { ...worn, tier: 3 })).toBe(false)
  })
})

describe('gather rules', () => {
  const rule = {
    id: 'cut-timber',
    good: 'timber',
    label: 'Cut timber',
    biomes: ['forest'],
    skill: 'athletics',
    dc: 10,
    yield: { critFail: 0, fail: 0, partial: 1, success: 2, critSuccess: 3 },
  }

  test('parse a rule', () => {
    expect(GatherRuleSchema.parse(rule)).toEqual(rule)
  })

  test('never at sea, and every tier has a yield', () => {
    expect(ok(GatherRuleSchema, { ...rule, biomes: ['forest', 'sea'] })).toBe(false)
    expect(ok(GatherRuleSchema, { ...rule, biomes: [] })).toBe(false)
    expect(ok(GatherRuleSchema, { ...rule, yield: { success: 2 } })).toBe(false)
    expect(ok(GatherRuleSchema, { ...rule, dc: 31 })).toBe(false)
  })
})
