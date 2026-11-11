import { describe, expect, test } from 'vitest'
import { buildContent } from './build'
import { localize, overlay, valueAtPath } from './localize'

const situation = {
  id: 'ferry',
  title: 'The ferry',
  stages: {
    start: {
      text: 'A river.',
      options: [
        {
          id: 'pay',
          kind: 'fixed',
          label: 'Pay',
          outcome: { text: 'You cross.', effects: [{ effect: 'log', text: 'Paid.' }] },
        },
      ],
    },
  },
}

const { content, errors } = buildContent({
  'data/claude/situations.json': { kind: 'situations', source: 'claude', entries: [situation] },
  'data/locales/ja/situations.json': {
    kind: 'translations',
    source: 'claude',
    locale: 'ja',
    target: 'situations',
    entries: [
      {
        id: 'ferry',
        fields: {
          title: '渡し舟',
          'stages.start.options.pay.label': '払う',
          'stages.start.options.pay.outcome.effects.0.text': '支払った。',
        },
      },
    ],
  },
})

describe('localize', () => {
  test('the fixture loads', () => expect(errors).toEqual([]))

  test('paths address record keys, array items by id, and array items by index', () => {
    expect(valueAtPath(situation, 'stages.start.options.pay.label')).toBe('Pay')
    expect(valueAtPath(situation, 'stages.start.options.0.outcome.text')).toBe('You cross.')
    expect(valueAtPath(situation, 'stages.start.options.nope.label')).toBeUndefined()
    expect(valueAtPath(situation, 'toString')).toBeUndefined()
  })

  test('overlays the translated strings; untranslated ones stay English', () => {
    const ja = localize(content.situations.ferry, 'situations', 'ja', content)
    expect(ja.title).toBe('渡し舟')
    const pay = ja.stages.start.options[0]
    expect(pay.label).toBe('払う')
    expect(pay.kind === 'fixed' && pay.outcome.effects[0]).toMatchObject({ text: '支払った。' })
    expect(ja.stages.start.text).toBe('A river.')
    expect(pay.kind === 'fixed' && pay.outcome.text).toBe('You cross.')
  })

  test('does not mutate the entry, and English is the entry itself', () => {
    const entry = content.situations.ferry
    localize(entry, 'situations', 'ja', content)
    expect(entry.title).toBe('The ferry')
    expect(entry.stages.start.options[0].label).toBe('Pay')
    expect(localize(entry, 'situations', 'en', content)).toBe(entry)
  })

  test('paths that do not reach a string are ignored at render time', () => {
    expect(overlay(situation, { 'stages.start': 'x', 'stages.gone.text': 'y' })).toEqual(situation)
  })
})
