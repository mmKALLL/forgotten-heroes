import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { SituationSchema, SituationTemplateSchema } from '../../schema/encounter'
import { fixtureContent } from '../test-fixtures'
import { contentIssues, lintSituation, validateSituation, validateTwistKind } from './validate'

const content = fixtureContent()
const situation = (stages: object, extra: object = {}) =>
  SituationSchema.parse({ id: 'broken', title: 'Broken', disposition: 'neutral', ...extra, stages })
const fixed = (id: string, outcome: object = { text: 'Done.' }) => ({
  id,
  kind: 'fixed',
  label: id,
  outcome,
})
const check = (id: string, outcomes: object, dc: number | string = 12) => ({
  id,
  kind: 'check',
  label: id,
  check: { skill: 'athletics', dc },
  outcomes: {
    fail: { text: 'No.' },
    partial: { text: 'Meh.' },
    success: { text: 'Yes.' },
    ...outcomes,
  },
})
const issues = (stages: object, extra?: object) =>
  validateSituation(situation(stages, extra), content)
const table = (id: string, rows: { text: string; weight: number }[]) => ({
  id,
  description: '',
  rows,
  source: 'procedural' as const,
  file: 'x',
})

describe('validateSituation', () => {
  test('the fixture content is clean', () => {
    expect(contentIssues(content)).toEqual({})
  })

  test('unknown archetypes, and DC expressions outside archetypes', () => {
    expect(issues({ start: { text: '', archetype: { id: 'nope' } } })).toEqual([
      'stage start: unknown archetype "nope"',
    ])
    expect(issues({ start: { text: '', options: [check('a', {}, 'dc+1'), fixed('b')] } })).toEqual([
      'start/a: DC "dc+1" needs an archetype on its stage',
    ])
  })

  test('missing and unreachable stages, duplicate ids, goto with stay', () => {
    const found = issues({
      start: {
        text: '',
        options: [
          check('a', { success: { text: '', goto: 'nowhere' } }),
          fixed('a', { text: '', goto: 'start', stay: true }),
        ],
      },
      island: { text: '', options: [fixed('x'), fixed('y')] },
    })
    expect(found).toEqual([
      'start/a success: goto unknown stage "nowhere"',
      'start: duplicate option id "a"',
      'start/a outcome: both goto and stay',
      'stage island is unreachable',
    ])
    expect(issues({ only: { text: '' } }, { start: 'begin' })).toContain(
      'start stage "begin" does not exist'
    )
  })

  test('slots must be declared, and {actor} only appears in check outcomes', () => {
    expect(
      issues({
        start: {
          text: '{Who} and {actor} wait.',
          options: [
            check('a', { success: { text: '{actor} wins {loot}.' } }),
            fixed('b', { text: '{actor} leaves.' }),
          ],
        },
      })
    ).toEqual([
      'stage start: slot {who} is not declared',
      'stage start: {actor} only works in check outcomes',
      'start/a success: slot {loot} is not declared',
      'start/b outcome: {actor} only works in check outcomes',
    ])
  })

  test('slot sources must resolve: tables, nested tables, creatures', () => {
    const loopy = {
      ...content,
      partsTables: {
        ...content.partsTables,
        a: {
          id: 'a',
          description: '',
          rows: [{ text: '{b}', weight: 1 }],
          source: 'procedural' as const,
          file: 'x',
        },
        b: {
          id: 'b',
          description: '',
          rows: [{ text: '{a} {gone}', weight: 1 }],
          source: 'procedural' as const,
          file: 'x',
        },
      },
    }
    const s = situation(
      { start: { text: '{x} {y} {z}', options: [fixed('a'), fixed('b')] } },
      {
        slots: {
          x: { from: 'table', table: 'missing' },
          y: { from: 'table', table: 'a' },
          z: { from: 'creature', types: ['dragon'] },
        },
      }
    )
    expect(validateSituation(s, loopy)).toEqual([
      'slot x: unknown parts table "missing"',
      'slot y: parts table loop: a → b → a',
      'slot y: unknown parts table "gone"',
      'slot z: no creature matches',
    ])
  })

  test('a parts table needs at least one row with weight > 0, nested tables included', () => {
    const zeroed: Content = {
      ...content,
      partsTables: {
        ...content.partsTables,
        outer: table('outer', [{ text: '{never}', weight: 1 }]),
        never: table('never', [
          { text: 'a', weight: 0 },
          { text: 'b', weight: 0 },
        ]),
      },
    }
    const s = situation(
      { start: { text: '{x}', options: [fixed('a'), fixed('b')] } },
      { slots: { x: { from: 'table', table: 'outer' } } }
    )
    expect(validateSituation(s, zeroed)).toEqual([
      'slot x: parts table "never" has no row with weight > 0',
    ])
  })

  test('the title and the twist may use declared slots only', () => {
    expect(
      issues(
        { start: { text: '{who}', options: [fixed('a'), fixed('b')] } },
        {
          title: 'Meeting {who} and {gone}',
          slots: { who: { from: 'table', table: 'who' } },
          twist: { chance: 0.5, what: '{Who} is bait for {actor}' },
        }
      )
    ).toEqual(['title: slot {gone} is not declared', 'twist: {actor} only works in check outcomes'])
  })

  test('effects: follow-up targets, actor targets in fixed options, twists without a twist', () => {
    expect(
      issues({
        start: {
          text: '',
          options: [
            fixed('a', {
              text: '',
              effects: [
                { effect: 'followUp', situation: 'nope' },
                { effect: 'hp', amount: -1, target: 'actor' },
              ],
            }),
            check('b', {
              success: {
                text: '',
                effects: [{ effect: 'revealTwist' }],
                twist: { text: 'Gotcha.' },
              },
            }),
          ],
        },
      })
    ).toEqual([
      'start/b success twist: twist branch but the situation has no twist',
      'start/a outcome: follow-up to unknown situation "nope"',
      'start/a outcome: fixed options have no actor; use "all" or "random"',
      'start/b success: revealTwist but the situation has no twist',
    ])
  })

  test('effects: clearPoi only in a site situation', () => {
    const stages = {
      start: {
        text: '',
        options: [fixed('a', { text: '', effects: [{ effect: 'clearPoi' }] }), fixed('b')],
      },
    }
    expect(issues(stages)).toEqual(['start/a outcome: clearPoi only works in a site situation'])
    expect(issues(stages, { site: true })).toEqual([])
  })

  test('effects: learnPlan and thwartAct only in a site situation; omens name real villains', () => {
    const stages = {
      start: {
        text: '',
        options: [
          fixed('a', { text: '', effects: [{ effect: 'learnPlan' }, { effect: 'thwartAct' }] }),
          fixed('b'),
        ],
      },
    }
    expect(issues(stages)).toEqual([
      'start/a outcome: learnPlan only works in a site situation',
      'start/a outcome: thwartAct only works in a site situation',
    ])
    expect(issues(stages, { site: true })).toEqual([])
    const omen = { start: { text: '', options: [fixed('a'), fixed('b')] } }
    expect(issues(omen, { villains: ['test-villain'] })).toEqual([])
    expect(issues(omen, { villains: ['nobody'] })).toEqual(['unknown villain "nobody"'])
  })

  test('requirements: siteReady only in a site situation', () => {
    const stages = {
      start: {
        text: '',
        options: [{ ...fixed('a'), requires: [{ req: 'siteReady' }] }, fixed('b')],
      },
    }
    expect(issues(stages)).toEqual(['start/a: siteReady only works in a site situation'])
    expect(issues(stages, { site: true })).toEqual([])
  })

  test('a dungeon room is also a site situation', () => {
    const stages = { start: { text: '', options: [fixed('a'), fixed('b')] } }
    expect(issues(stages, { room: true })).toEqual(['a dungeon room needs site: true'])
    expect(issues(stages, { room: true, site: true })).toEqual([])
  })

  test('requirements: an option that needs a good spends it in every outcome', () => {
    const spend = { effect: 'goods', good: 'healing', amount: -1 }
    const needs = [{ req: 'goods', good: 'healing', min: 1 }]
    const stages = (success: object) => ({
      start: {
        text: '',
        options: [
          {
            ...check('salve', {
              fail: { text: 'No.', effects: [spend] },
              partial: { text: 'Meh.', effects: [spend] },
              success,
            }),
            requires: needs,
          },
          fixed('b'),
        ],
      },
    })
    expect(issues(stages({ text: 'Yes.' }))).toEqual([
      "start/salve success: needs healing but doesn't spend it",
    ])
    expect(issues(stages({ text: 'Yes.', effects: [spend] }))).toEqual([])
  })
})

describe('contentIssues', () => {
  test('an id shared by a situation and a template is reported, and both keep their issues', () => {
    const broken = SituationSchema.parse({
      id: 'plea',
      title: 'Plea',
      stages: { start: { text: '{gone}', options: [fixed('a'), fixed('b')] } },
    })
    const template = SituationTemplateSchema.parse({
      ...content.situationTemplates.plea,
      text: '{lost}',
    })
    const clash: Content = {
      ...content,
      situations: { ...content.situations, plea: { ...broken, source: 'original', file: 'x' } },
      situationTemplates: { plea: { ...template, source: 'procedural', file: 'y' } },
    }
    expect(contentIssues(clash)).toEqual({
      plea: [
        'duplicate situation id "plea"',
        'stage start: slot {gone} is not declared',
        'stage start: slot {lost} is not declared',
      ],
    })
  })
})

describe('lintSituation', () => {
  test('regular stages need at least 2 options', () => {
    expect(
      lintSituation(situation({ start: { text: '', options: [fixed('a')] } }), content)
    ).toEqual(['stage start has 1 option(s); regular encounters need at least 2'])
  })

  test('every regular stage keeps an option that is neither once nor gated by requirements', () => {
    const gated = (id: string) => ({ ...fixed(id), requires: [{ req: 'gold', min: 5 }] })
    expect(
      lintSituation(
        situation({ start: { text: '', options: [{ ...fixed('a'), once: true }, gated('b')] } }),
        content
      )
    ).toEqual([
      'stage start: every option is once or has requirements, so the stage can become a dead end',
    ])
    expect(
      lintSituation(
        situation({ start: { text: '', options: [{ ...fixed('a'), once: true }, fixed('b')] } }),
        content
      )
    ).toEqual([])
  })

  test('wonders are one stage, one fixed option, and flavour only', () => {
    const wonder = (options: object[]) =>
      situation({ start: { text: '', options } }, { wonder: true })
    expect(
      lintSituation(
        wonder([fixed('look', { text: '', effects: [{ effect: 'log', text: 'Lovely.' }] })]),
        content
      )
    ).toEqual([])
    expect(
      lintSituation(
        wonder([fixed('look', { text: '', effects: [{ effect: 'inspiration', amount: 1 }] })]),
        content
      )
    ).toEqual([
      'start/look outcome: wonders are flavour only, with no effects but log (inspiration)',
    ])
    expect(
      lintSituation(
        wonder([fixed('look', { text: '', effects: [{ effect: 'gold', amount: 5 }] })]),
        content
      )
    ).toEqual(['start/look outcome: wonders are flavour only, with no effects but log (gold)'])
    expect(lintSituation(wonder([fixed('a'), fixed('b')]), content)).toEqual([
      'a wonder is one stage with one fixed option',
    ])
    expect(
      lintSituation(
        wonder([fixed('a', { text: '', effects: [{ effect: 'days', amount: 1 }] })]),
        content
      )
    ).toEqual(['start/a outcome: wonders are flavour only, with no effects but log (days)'])
    expect(
      lintSituation(
        wonder([fixed('a', { text: '', effects: [{ effect: 'nextCheckModifier', amount: -2 }] })]),
        content
      )
    ).toEqual([
      'start/a outcome: wonders are flavour only, with no effects but log (nextCheckModifier)',
    ])
  })

  test('archetype options count towards the minimum', () => {
    const s = situation(
      { start: { text: '{who}', archetype: { id: 'test-need' } } },
      { slots: { who: { from: 'table', table: 'who' } } }
    )
    expect(lintSituation(s, content)).toEqual([])
  })
})

test('region tags must name known regions', () => {
  const situation = SituationSchema.parse({
    id: 'somewhere',
    title: 'Somewhere',
    regions: ['ashmoor', 'atlantis'],
    stages: { start: { text: 'Here.', options: [] } },
  })
  expect(validateSituation(situation, fixtureContent())).toContain('unknown region "atlantis"')
})

test('twist kinds may only name known regions and threats', () => {
  const kind = { ...content.twists.theft, regions: ['atlantis'], threats: ['bandits', 'krakens'] }
  expect(validateTwistKind(kind, content)).toEqual(
    expect.arrayContaining(['unknown region "atlantis"', 'unknown threat "krakens"'])
  )
})

describe('disposition', () => {
  const two = { start: { text: '', options: [fixed('a'), fixed('b')] } }

  test('every situation that can be drawn needs one', () => {
    expect(lintSituation(situation(two, { disposition: undefined }), content)).toEqual([
      'needs a disposition: hostile, neutral or pleasant',
    ])
    expect(
      lintSituation(situation(two, { disposition: undefined, followUpOnly: true }), content)
    ).toEqual([])
  })

  test('a wonder is never hostile', () => {
    const wonder = { start: { text: '', options: [fixed('look')] } }
    expect(
      lintSituation(situation(wonder, { wonder: true, disposition: 'hostile' }), content)
    ).toEqual(['a wonder is pleasant or neutral, never hostile'])
    expect(
      lintSituation(situation(wonder, { wonder: true, disposition: 'pleasant' }), content)
    ).toEqual([])
  })
})
