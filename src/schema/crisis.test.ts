import { describe, expect, test } from 'vitest'
import { CrisisStateSchema, RunRecordSchema, VillainSchema } from './crisis'
import { EffectSchema, SituationSchema } from './encounter'

const act = (n: number, site = `act-site-${n}`) => ({
  id: `act-${n}`,
  name: `Act ${n}`,
  goal: 'do something dreadful',
  site,
  clue: '{villain} was seen in {land}.',
  thwarted: 'Stopped.',
  failed: 'Done.',
})

const villain = (acts: unknown[]) => ({
  id: 'the-test-villain',
  name: 'The Test Villain',
  threats: ['bandits'],
  summary: 'A villain.',
  omen: 'Something stirs.',
  plan: 'The plan.',
  reveal: 'reveal-site',
  acts,
  victory: 'Won.',
})

describe('villains', () => {
  test('parse with defaults', () => {
    const v = VillainSchema.parse(villain([act(1), act(2), act(3)]))
    expect(v.weight).toBe(1)
    expect(v.acts[0]).toMatchObject({ biomes: [], seat: false })
  })

  test('need exactly three acts with distinct ids and distinct site types', () => {
    expect(VillainSchema.safeParse(villain([act(1), act(2)])).success).toBe(false)
    expect(VillainSchema.safeParse(villain([act(1), act(2), act(3), act(4)])).success).toBe(false)
    expect(VillainSchema.safeParse(villain([act(1), act(2), act(3, 'act-site-1')])).success).toBe(
      false
    )
    expect(VillainSchema.safeParse(villain([act(1), act(2), act(2)])).success).toBe(false)
    expect(VillainSchema.safeParse(villain([act(1), act(2), act(3, 'reveal-site')])).success).toBe(
      false
    )
  })
})

describe('crisis effects', () => {
  test('crisisClue takes 1–2 (default 1)', () => {
    expect(EffectSchema.parse({ effect: 'crisisClue' })).toEqual({
      effect: 'crisisClue',
      amount: 1,
    })
    expect(EffectSchema.safeParse({ effect: 'crisisClue', amount: 2 }).success).toBe(true)
    expect(EffectSchema.safeParse({ effect: 'crisisClue', amount: 3 }).success).toBe(false)
    expect(EffectSchema.safeParse({ effect: 'crisisClue', amount: 0 }).success).toBe(false)
  })

  test('learnPlan and thwartAct parse', () => {
    expect(EffectSchema.parse({ effect: 'learnPlan' })).toEqual({ effect: 'learnPlan' })
    expect(EffectSchema.parse({ effect: 'thwartAct' })).toEqual({ effect: 'thwartAct' })
  })

  test('a situation names no villains by default', () => {
    const s = SituationSchema.parse({ id: 'x', title: 'X', stages: { start: { text: '.' } } })
    expect(s.villains).toEqual([])
  })
})

describe('crisis state', () => {
  const crisis = {
    villain: 'the-test-villain',
    name: 'Morvaine, the Test Villain',
    startDay: 1,
    reveal: 'poi-9',
    acts: [1, 2, 3].map((n) => ({ id: `act-${n}`, poi: `poi-${9 + n}`, due: 100 * n })),
  }

  test('parses with nothing done yet', () => {
    expect(CrisisStateSchema.parse(crisis)).toMatchObject({
      learned: null,
      clues: [0, 0, 0],
      thwarted: [null, null, null],
      endSeen: false,
    })
  })

  test('has exactly three acts', () => {
    expect(CrisisStateSchema.safeParse({ ...crisis, acts: crisis.acts.slice(0, 2) }).success).toBe(
      false
    )
    expect(CrisisStateSchema.safeParse({ ...crisis, clues: [0, 0] }).success).toBe(false)
  })

  test('a run record parses', () => {
    const record = {
      id: '5',
      seed: 5,
      ending: 'fallen',
      day: 88,
      villain: 'Morvaine, the Test Villain',
      acts: ['thwarted', null, null],
      party: [{ name: 'Ada', ancestry: 'human', classId: 'fighter', level: 3, fallen: true }],
      place: 'Greenvale',
      recorded: '2026-11-13T12:00:00.000Z',
    }
    expect(RunRecordSchema.parse(record)).toEqual(record)
    expect(RunRecordSchema.safeParse({ ...record, ending: 'draw' }).success).toBe(false)
  })
})
