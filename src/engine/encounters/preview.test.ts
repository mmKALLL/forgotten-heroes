import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { TIERS, tierFaces, tierOdds } from '../rules/checks'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { applyEffects } from './effects'
import { encounterOptions, twistInfo } from './preview'

const content = fixtureContent()
const start = (situationId: string, state: GameState = makeState()) =>
  step(state, { type: 'startEncounter', situationId }, content)
const byId = (state: GameState, actorIds: Record<string, string> = {}) =>
  Object.fromEntries(encounterOptions(state, actorIds).map((o) => [o.id, o]))

describe('encounterOptions', () => {
  const roadside = start('roadside')

  test('check options show actor, skill, DC, exact odds and all five tiers', () => {
    const read = byId(roadside).read
    expect(read.check).toMatchObject({
      actorId: 'lyra',
      actorName: 'Lyra',
      label: 'Insight',
      modifier: 2,
      situationalModifier: 0,
      dc: 12,
      mode: 'normal',
    })
    expect(read.check?.odds).toEqual(tierOdds(2, 12, 'normal'))
    expect(read.check?.successChance).toBeCloseTo(0.55)
    expect(read.outcomes.map((o) => o.tier)).toEqual([...TIERS])
    expect(read.outcomes[0]).toMatchObject({ text: 'You cannot tell.', next: 'stay' }) // critFail falls back to fail
    expect(read.outcomes[3]).toEqual({
      tier: 'success',
      text: 'Lyra reads them.',
      effects: ['reveals how likely the twist is', 'Edge'],
      next: 'stay',
      twist: null,
    })
    expect(read.check?.actors.map((a) => a.id)).toEqual(['lyra', 'brom'])
  })

  test('an actor override changes the preview', () => {
    expect(byId(roadside, { read: 'brom' }).read.check).toMatchObject({
      actorId: 'brom',
      modifier: 1,
    })
  })

  test('the d20 faces use the effective modifier; the auto actor is named even when overridden', () => {
    const misread = applyEffects(roadside, [{ effect: 'nextCheckModifier', amount: -2 }])
    const read = byId(misread, { read: 'brom' }).read
    expect(read.check?.faces).toEqual(tierFaces(1 - 2, 12))
    expect(read.check).toMatchObject({ autoActorId: 'lyra', autoActorName: 'Lyra' })
  })

  test('the position sets the roll mode', () => {
    const edge = { ...roadside, encounter: { ...roadside.encounter!, position: 'edge' as const } }
    expect(byId(edge).read.check?.mode).toBe('advantage')
    expect(byId(edge).read.check?.odds).toEqual(tierOdds(2, 12, 'advantage'))
  })

  test('a next-check modifier shows separately and goes into the odds, as the roll uses it', () => {
    const misread = applyEffects(roadside, [{ effect: 'nextCheckModifier', amount: -2 }])
    const read = byId(misread).read
    expect(read.check).toMatchObject({
      modifier: 2,
      situationalModifier: -2,
      situationalReason: null,
    })
    const reasoned = applyEffects(roadside, [
      { effect: 'nextCheckModifier', amount: -2, reason: 'misread' },
    ])
    expect(byId(reasoned).read.check).toMatchObject({
      situationalModifier: -2,
      situationalReason: 'misread',
    })
    expect(read.check?.odds).toEqual(tierOdds(2 - 2, 12, 'normal'))
    expect(read.check?.actors.find((a) => a.id === 'lyra')?.modifier).toBe(2)
  })

  test('the high-stakes flag uses the same effective modifier', () => {
    const cliff = start('cliff')
    expect(byId(cliff).climb.check?.highStakes).toBe(true) // +5 vs 12: 70%
    const steadied = applyEffects(cliff, [{ effect: 'nextCheckModifier', amount: 2 }])
    expect(byId(steadied).climb.check?.successChance).toBeCloseTo(0.8)
    expect(byId(steadied).climb.check?.highStakes).toBe(false)
  })

  test('fixed options show their outcome and its twist branch', () => {
    const trust = byId(roadside).trust
    expect(trust.check).toBeNull()
    expect(trust.outcomes).toEqual([
      {
        tier: null,
        text: `${roadside.encounter!.slots.who.replace('a', 'A')} thanks you.`,
        effects: ['+20 gp'],
        next: 'end',
        twist: { text: 'A trap!', effects: ['−20 gp', 'someone −3 HP'], next: 'end' },
      },
    ])
  })

  test('unmet requirements make an option unavailable, with the reason', () => {
    const donate = byId(start('roadside', makeState({ gold: 5 }))).donate
    expect(donate).toMatchObject({ available: false, unmet: ['needs 20 gp'] })
  })

  test('used once options are gone, and checks need someone able to act', () => {
    const afterRead = step(roadside, { type: 'chooseOption', optionId: 'read' }, content)
    expect(Object.keys(byId(afterRead))).not.toContain('read')
    const downed = { ...roadside, party: roadside.party.map((c) => ({ ...c, hp: 0 })) }
    expect(byId(downed).rob).toMatchObject({
      available: false,
      unmet: ['no one can act'],
      check: null,
    })
  })

  test('the high-stakes flag comes from the odds and the outcomes', () => {
    expect(byId(start('cliff')).climb.check?.highStakes).toBe(true) // 70%, a fail costs HP
    expect(byId(roadside).read.check?.highStakes).toBe(false) // nothing costs HP
  })

  test('slots fill option labels and descriptions', () => {
    const roadside = content.situations.roadside
    const leave = {
      id: 'leave',
      kind: 'fixed' as const,
      label: 'Leave {who} be',
      description: '{Who} watches.',
      requires: [],
      outcome: { text: '', effects: [] },
    }
    const labelled = {
      ...content,
      situations: {
        ...content.situations,
        roadside: {
          ...roadside,
          stages: { start: { ...roadside.stages.start, options: [leave] } },
        },
      },
    }
    const state = step(makeState(), { type: 'startEncounter', situationId: 'roadside' }, labelled)
    const who = state.encounter!.slots.who
    expect(byId(state).leave).toMatchObject({
      label: `Leave ${who} be`,
      description: `${who.replace('a', 'A')} watches.`,
    })
  })

  test('no encounter, no options', () => {
    expect(encounterOptions(makeState())).toEqual([])
  })
})

describe('twistInfo', () => {
  test('what the twist is shows at once; its chance only once revealed', () => {
    const roadside = start('roadside')
    expect(twistInfo(roadside)).toEqual({ what: 'it is a trap', chance: null })
    const revealed = { ...roadside, encounter: { ...roadside.encounter!, twistRevealed: true } }
    expect(twistInfo(revealed)).toEqual({ what: 'it is a trap', chance: 0.5 })
    expect(twistInfo(start('cliff'))).toBeNull()
    expect(twistInfo(makeState())).toBeNull()
  })

  test('the revealTwist effect reveals the chance', () => {
    const roadside = start('roadside')
    const revealed = applyEffects(roadside, [{ effect: 'revealTwist' }])
    expect(twistInfo(revealed)).toEqual({ what: 'it is a trap', chance: 0.5 })
  })
})
