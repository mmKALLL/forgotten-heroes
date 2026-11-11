import { describe, expect, test } from 'vitest'
import { EffectSchema, type Effect } from '../../schema/encounter'
import { makeEncounter, makeState } from '../test-fixtures'
import { applyEffects, describeEffect } from './effects'

const fx = (...effects: unknown[]): Effect[] => effects.map((e) => EffectSchema.parse(e))
const hp = (state: ReturnType<typeof makeState>) => state.party.map((c) => c.hp)

describe('applyEffects', () => {
  const state = makeState({ gold: 10, encounter: makeEncounter() })

  test('gold changes but never drops below 0', () => {
    expect(applyEffects(state, fx({ effect: 'gold', amount: 5 })).gold).toBe(15)
    expect(applyEffects(state, fx({ effect: 'gold', amount: -25 })).gold).toBe(0)
  })

  test('hp to the actor or to all, clamped to 0..maxHp', () => {
    expect(hp(applyEffects(state, fx({ effect: 'hp', amount: -5, target: 'actor' }), { actorId: 'lyra' }))).toEqual([20, 11])
    expect(hp(applyEffects(state, fx({ effect: 'hp', amount: -30, target: 'all' })))).toEqual([0, 0])
    const hurt = { ...state, party: state.party.map((c) => ({ ...c, hp: 5 })) }
    expect(hp(applyEffects(hurt, fx({ effect: 'hp', amount: 100, target: 'all' })))).toEqual([20, 16])
  })

  test('hp to a random member hits one conscious member, is seeded and advances the rng', () => {
    const effects = fx({ effect: 'hp', amount: -3, target: 'random' })
    const a = applyEffects(state, effects)
    expect(applyEffects(state, effects)).toEqual(a)
    expect(a.rng).not.toEqual(state.rng)
    expect(hp(a).filter((h, i) => h !== hp(state)[i])).toHaveLength(1)
    const bromDown = { ...state, party: state.party.map((c) => (c.id === 'brom' ? { ...c, hp: 0 } : c)) }
    expect(hp(applyEffects(bromDown, effects))).toEqual([0, 13])
  })

  test('an actor effect without an actor falls back to a random conscious member', () => {
    const after = applyEffects(state, fx({ effect: 'hp', amount: -2, target: 'actor' }))
    expect(hp(after).reduce((a, b) => a + b)).toBe(20 + 16 - 2)
  })

  test('exhaustion is clamped to 0..6', () => {
    const after = applyEffects(state, fx({ effect: 'exhaustion', amount: 9, target: 'all' }))
    expect(after.party.map((c) => c.exhaustion)).toEqual([6, 6])
    const rested = applyEffects(after, fx({ effect: 'exhaustion', amount: -2, target: 'actor' }), { actorId: 'brom' })
    expect(rested.party.map((c) => c.exhaustion)).toEqual([4, 6])
    expect(applyEffects(state, fx({ effect: 'exhaustion', amount: -1, target: 'all' })).party[0].exhaustion).toBe(0)
  })

  test('inspiration and days', () => {
    const after = applyEffects(state, fx({ effect: 'inspiration', amount: 1 }, { effect: 'days', amount: 2 }))
    expect(after.inspiration).toBe(state.inspiration + 1)
    expect(after.day).toBe(state.day + 2)
  })

  test('position and revealTwist change the encounter', () => {
    const after = applyEffects(state, fx({ effect: 'position', position: 'edge' }, { effect: 'revealTwist' }))
    expect(after.encounter?.position).toBe('edge')
    expect(after.encounter?.twistRevealed).toBe(true)
    const noEncounter = makeState()
    expect(applyEffects(noEncounter, fx({ effect: 'position', position: 'edge' }))).toEqual(noEncounter)
  })

  test('nextCheckModifier adds up on the encounter, and does nothing outside one', () => {
    const after = applyEffects(state, fx({ effect: 'nextCheckModifier', amount: -2 }))
    expect(after.encounter?.nextCheckModifier).toBe(-2)
    expect(applyEffects(after, fx({ effect: 'nextCheckModifier', amount: 1 })).encounter?.nextCheckModifier).toBe(-1)
    const noEncounter = makeState()
    expect(applyEffects(noEncounter, fx({ effect: 'nextCheckModifier', amount: -2 }))).toEqual(noEncounter)
  })

  test('followUp queues a situation', () => {
    const after = applyEffects(state, fx({ effect: 'followUp', situation: 'revenge', after: 2 }))
    expect(after.followUps).toEqual([{ situationId: 'revenge', wait: 2 }])
  })

  test('log writes to the journal and the encounter log', () => {
    const after = applyEffects(state, fx({ effect: 'log', text: 'Rain begins.', tone: 'bad' }))
    expect(after.log.at(-1)).toEqual({ day: state.day, text: 'Rain begins.', tone: 'bad' })
    expect(after.encounter?.log.at(-1)).toEqual({ text: 'Rain begins.', tone: 'bad' })
  })

  test('effects apply in order and never mutate the input', () => {
    const snapshot = structuredClone(state)
    const after = applyEffects(state, fx({ effect: 'gold', amount: -10 }, { effect: 'gold', amount: 4 }))
    expect(after.gold).toBe(4)
    expect(state).toEqual(snapshot)
  })
})

describe('describeEffect', () => {
  test.each([
    [{ effect: 'gold', amount: 10 }, '+10 gp'],
    [{ effect: 'gold', amount: -5 }, '−5 gp'],
    [{ effect: 'hp', amount: -3, target: 'actor' }, 'Lyra −3 HP'],
    [{ effect: 'hp', amount: 4, target: 'all' }, 'everyone +4 HP'],
    [{ effect: 'hp', amount: -2, target: 'random' }, 'someone −2 HP'],
    [{ effect: 'exhaustion', amount: 1, target: 'all' }, 'everyone +1 exhaustion'],
    [{ effect: 'inspiration', amount: 1 }, '+1 inspiration'],
    [{ effect: 'days', amount: 1 }, '1 day passes'],
    [{ effect: 'days', amount: 3 }, '3 days pass'],
    [{ effect: 'position', position: 'edge' }, 'Edge'],
    [{ effect: 'position', position: 'exposed' }, 'Exposed'],
    [{ effect: 'followUp', situation: 'revenge' }, 'consequences later'],
    [{ effect: 'nextCheckModifier', amount: -2 }, '−2 to the next check'],
    [{ effect: 'nextCheckModifier', amount: 1 }, '+1 to the next check'],
    [{ effect: 'revealTwist' }, 'reveals how likely the twist is'],
  ])('%j reads "%s"', (effect, text) => {
    expect(describeEffect(EffectSchema.parse(effect), 'Lyra')).toBe(text)
  })

  test('log effects are shown as text, not as a chip', () => {
    expect(describeEffect(EffectSchema.parse({ effect: 'log', text: 'Rain.' }), 'Lyra')).toBeNull()
  })
})
