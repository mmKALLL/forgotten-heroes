import { describe, expect, test } from 'vitest'
import { SituationSchema, type CheckOption, type FixedOption } from '../../schema/encounter'
import { fixtureContent } from '../test-fixtures'
import {
  allSituations,
  compileSituation,
  instantiateArchetype,
  resolveDc,
  templateToSituation,
} from './compile'

const content = fixtureContent()

describe('resolveDc', () => {
  test.each([
    [14, 12, 14],
    ['dc', 12, 12],
    ['dc+2', 12, 14],
    ['dc-1', 12, 11],
    ['dc-20', 12, 1],
    ['dc+50', 12, 40],
  ] as const)('%s with base %i is %i', (dc, base, expected) => {
    expect(resolveDc(dc, base)).toBe(expected)
  })
})

describe('instantiateArchetype', () => {
  const options = instantiateArchetype(content.archetypes['test-need'], {
    id: 'test-need',
    dc: 12,
    reward: 2,
  })
  const byId = Object.fromEntries(options.map((o) => [o.id, o]))

  test('resolves relative DCs', () => {
    expect((byId.read as CheckOption).check.dc).toBe(12)
    expect((byId.rob as CheckOption).check.dc).toBe(14)
  })

  test('scales gold effects and gold requirements by reward, including twist branches', () => {
    const trust = byId.trust as FixedOption
    expect(trust.outcome.effects).toEqual([{ effect: 'gold', amount: 20 }])
    expect(trust.outcome.twist?.effects).toEqual([
      { effect: 'gold', amount: -20 },
      { effect: 'hp', amount: -3, target: 'random' },
    ])
    expect((byId.donate as FixedOption).requires).toEqual([{ req: 'gold', min: 20 }])
    expect((byId.rob as CheckOption).outcomes.success.effects[0]).toEqual({
      effect: 'gold',
      amount: 24,
    })
  })

  test('a zero reward drops gold requirements that would scale to 0', () => {
    const free = instantiateArchetype(content.archetypes['test-need'], {
      id: 'test-need',
      dc: 12,
      reward: 0,
    })
    expect(free.find((o) => o.id === 'donate')?.requires).toEqual([])
  })

  test('gold effects that scale to 0 (or −0) are dropped', () => {
    const free = instantiateArchetype(content.archetypes['test-need'], {
      id: 'test-need',
      dc: 12,
      reward: 0,
    })
    const trust = free.find((o) => o.id === 'trust') as FixedOption
    expect(trust.outcome.effects).toEqual([])
    expect(trust.outcome.twist?.effects).toEqual([{ effect: 'hp', amount: -3, target: 'random' }])
    const tiny = instantiateArchetype(content.archetypes['test-need'], {
      id: 'test-need',
      dc: 12,
      reward: 0.04,
    })
    expect((tiny.find((o) => o.id === 'trust') as FixedOption).outcome.twist?.effects).toEqual([
      { effect: 'hp', amount: -3, target: 'random' },
    ])
  })
})

describe('compileSituation', () => {
  test("puts archetype options before the stage's own and drops the reference", () => {
    const compiled = compileSituation(content.situations.roadside, content)
    expect(compiled.stages.start.options.map((o) => o.id)).toEqual([
      'trust',
      'careful',
      'read',
      'rob',
      'donate',
      'leave',
    ])
    expect(compiled.stages.start.archetype).toBeUndefined()
    expect(SituationSchema.parse(compiled)).toEqual(compiled)
  })

  test('keeps provenance fields out and leaves situations without archetypes alone', () => {
    const compiled = compileSituation(content.situations.cliff, content)
    expect(compiled).not.toHaveProperty('source')
    expect(compiled).not.toHaveProperty('file')
    expect(compiled.stages).toEqual(content.situations.cliff.stages)
  })

  test('an unknown archetype throws', () => {
    const broken = {
      ...content.situations.roadside,
      stages: { start: { text: '', options: [], archetype: { id: 'nope', dc: 13, reward: 1 } } },
    }
    expect(() => compileSituation(broken, content)).toThrow(/unknown archetype "nope"/)
  })
})

describe('templates', () => {
  test('a template becomes a one-stage situation that compiles', () => {
    const situation = templateToSituation(content.situationTemplates.plea)
    expect(situation).toMatchObject({
      id: 'plea',
      start: 'start',
      wonder: false,
      followUpOnly: false,
    })
    expect(situation.stages.start).toEqual({
      text: '{Who} needs help.',
      archetype: { id: 'test-need', dc: 13, reward: 1 },
      options: [],
    })
    expect(compileSituation(situation, content).stages.start.options).toHaveLength(5)
  })

  test('allSituations lists situations and templates with their source, sorted by id', () => {
    const all = allSituations(content)
    expect(all.map((s) => s.id)).toEqual([
      'cliff',
      'grudge',
      'herbalist-visit',
      'orc-war-camp-raid',
      'plea',
      'roadside',
      'singing-stones',
      'starfall',
      'stranger',
      'test-act-1',
      'test-act-2',
      'test-act-3',
      'test-omen',
      'test-reveal',
      'test-room-eels',
      'test-room-hall',
      'test-room-sluice',
      'test-room-vault',
    ])
    expect(all.find((s) => s.id === 'plea')?.source).toBe('procedural')
  })
})
