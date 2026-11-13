import { describe, expect, test } from 'vitest'
import { CrisisStateSchema, RunRecordSchema, VillainSchema } from './crisis'
import { EffectSchema, SituationSchema } from './encounter'

const act = (n: number, site = `act-site-${n}`) => ({
  id: `act-${n}`,
  name: `Act ${n}`,
  goal: 'do something dreadful',
  lead: 'lead-site',
  site,
  leadCr: 2 + 6 * (n - 1),
  keyCr: 6 * n,
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
  acts,
  victory: 'Won.',
})

describe('villains', () => {
  test('parse with defaults', () => {
    const v = VillainSchema.parse(villain([act(1), act(2), act(3)]))
    expect(v.weight).toBe(1)
    expect(v.boss).toBe('finale')
    expect(v.acts[0]).toMatchObject({ biomes: [], seat: false, surge: false })
  })

  test('need exactly three acts with distinct ids and key site types; leads may be shared', () => {
    expect(VillainSchema.safeParse(villain([act(1), act(2)])).success).toBe(false)
    expect(VillainSchema.safeParse(villain([act(1), act(2), act(3), act(4)])).success).toBe(false)
    expect(VillainSchema.safeParse(villain([act(1), act(2), act(3, 'act-site-1')])).success).toBe(
      false
    )
    expect(VillainSchema.safeParse(villain([act(1), act(2), act(2)])).success).toBe(false)
    expect(VillainSchema.safeParse(villain([act(1), act(2), act(3, 'lead-site')])).success).toBe(
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

  test('learnPlan, revealKeySite and thwartAct parse', () => {
    expect(EffectSchema.parse({ effect: 'learnPlan' })).toEqual({ effect: 'learnPlan' })
    expect(EffectSchema.parse({ effect: 'revealKeySite' })).toEqual({ effect: 'revealKeySite' })
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
    acts: [1, 2, 3].map((n) => ({ id: `act-${n}`, lead: `poi-${2 * n}`, key: `poi-${2 * n + 1}` })),
  }

  test('parses with nothing done yet', () => {
    expect(CrisisStateSchema.parse(crisis)).toMatchObject({
      leads: [null, null, null],
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
