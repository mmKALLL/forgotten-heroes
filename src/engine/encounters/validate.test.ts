import { describe, expect, test } from 'vitest'
import { SituationSchema } from '../../schema/encounter'
import { fixtureContent } from '../test-fixtures'
import { contentIssues, lintSituation, validateSituation } from './validate'

const content = fixtureContent()
const situation = (stages: object, extra: object = {}) =>
  SituationSchema.parse({ id: 'broken', title: 'Broken', ...extra, stages })
const fixed = (id: string, outcome: object = { text: 'Done.' }) => ({ id, kind: 'fixed', label: id, outcome })
const check = (id: string, outcomes: object, dc: number | string = 12) => ({
  id,
  kind: 'check',
  label: id,
  check: { skill: 'athletics', dc },
  outcomes: { fail: { text: 'No.' }, partial: { text: 'Meh.' }, success: { text: 'Yes.' }, ...outcomes },
})
const issues = (stages: object, extra?: object) => validateSituation(situation(stages, extra), content)

describe('validateSituation', () => {
  test('the fixture content is clean', () => {
    expect(contentIssues(content)).toEqual({})
  })

  test('unknown archetypes, and DC expressions outside archetypes', () => {
    expect(issues({ start: { text: '', archetype: { id: 'nope' } } })).toEqual(['stage start: unknown archetype "nope"'])
    expect(issues({ start: { text: '', options: [check('a', {}, 'dc+1'), fixed('b')] } })).toEqual([
      'start/a: DC "dc+1" needs an archetype on its stage',
    ])
  })

  test('missing and unreachable stages, duplicate ids, goto with stay', () => {
    const found = issues({
      start: { text: '', options: [check('a', { success: { text: '', goto: 'nowhere' } }), fixed('a', { text: '', goto: 'start', stay: true })] },
      island: { text: '', options: [fixed('x'), fixed('y')] },
    })
    expect(found).toEqual([
      'start/a success: goto unknown stage "nowhere"',
      'start: duplicate option id "a"',
      'start/a outcome: both goto and stay',
      'stage island is unreachable',
    ])
    expect(issues({ only: { text: '' } }, { start: 'begin' })).toContain('start stage "begin" does not exist')
  })

  test('slots must be declared, and {actor} only appears in check outcomes', () => {
    expect(
      issues({
        start: {
          text: '{Who} and {actor} wait.',
          options: [check('a', { success: { text: '{actor} wins {loot}.' } }), fixed('b', { text: '{actor} leaves.' })],
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
        a: { id: 'a', description: '', rows: [{ text: '{b}', weight: 1 }], source: 'procedural' as const, file: 'x' },
        b: { id: 'b', description: '', rows: [{ text: '{a} {gone}', weight: 1 }], source: 'procedural' as const, file: 'x' },
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

  test('effects: follow-up targets, actor targets in fixed options, twists without a twist', () => {
    expect(
      issues({
        start: {
          text: '',
          options: [
            fixed('a', { text: '', effects: [{ effect: 'followUp', situation: 'nope' }, { effect: 'hp', amount: -1, target: 'actor' }] }),
            check('b', { success: { text: '', effects: [{ effect: 'revealTwist' }], twist: { text: 'Gotcha.' } } }),
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
})

describe('lintSituation', () => {
  test('regular stages need at least 2 options', () => {
    expect(lintSituation(situation({ start: { text: '', options: [fixed('a')] } }), content)).toEqual([
      'stage start has 1 option(s); regular encounters need at least 2',
    ])
  })

  test('wonders are one stage, one fixed option, and never cost anything', () => {
    const wonder = (options: object[]) => situation({ start: { text: '', options } }, { wonder: true })
    expect(lintSituation(wonder([fixed('look', { text: '', effects: [{ effect: 'inspiration', amount: 1 }] })]), content)).toEqual([])
    expect(lintSituation(wonder([fixed('a'), fixed('b')]), content)).toEqual(['a wonder is one stage with one fixed option'])
    expect(lintSituation(wonder([fixed('a', { text: '', effects: [{ effect: 'days', amount: 1 }] })]), content)).toEqual([
      'start/a outcome: wonders never cost anything (days)',
    ])
    expect(lintSituation(wonder([fixed('a', { text: '', effects: [{ effect: 'nextCheckModifier', amount: -2 }] })]), content)).toEqual([
      'start/a outcome: wonders never cost anything (nextCheckModifier)',
    ])
  })

  test('archetype options count towards the minimum', () => {
    const s = situation({ start: { text: '{who}', archetype: { id: 'test-need' } } }, { slots: { who: { from: 'table', table: 'who' } } })
    expect(lintSituation(s, content)).toEqual([])
  })
})
