import { describe, expect, test } from 'vitest'
import { buildContent } from '../../content/build'
import { translationFields } from '../../content/localize'
import { encounterOptions, twistInfo } from '../../engine/encounters/preview'
import { chooseOption, startEncounter } from '../../engine/encounters/run'
import { makeState } from '../../engine/test-fixtures'
import { localizeEncounterState } from './encounter'

const { content, errors } = buildContent({
  'data/claude/situations.json': {
    kind: 'situations',
    source: 'claude',
    entries: [
      {
        id: 'ferry',
        title: 'The ferry',
        twist: { chance: 0, what: 'the rope is rotten' },
        stages: {
          start: {
            text: 'A river.',
            options: [
              {
                id: 'pay',
                kind: 'fixed',
                label: 'Pay',
                outcome: { text: 'You cross.', effects: [{ effect: 'gold', amount: -2 }] },
              },
              {
                id: 'swim',
                kind: 'check',
                label: 'Swim',
                check: { skill: 'athletics', dc: 1 },
                outcomes: {
                  fail: { text: 'No.' },
                  partial: { text: '{actor} makes it.' },
                  success: { text: '{actor} makes it.' },
                  critSuccess: { text: '{actor} makes it.' },
                },
              },
            ],
          },
        },
      },
    ],
  },
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
          'twist.what': '綱が腐っている',
          'stages.start.text': '川がある。',
          'stages.start.options.pay.label': '払う',
          'stages.start.options.pay.outcome.text': '川を渡った。',
          'stages.start.options.swim.outcomes.partial.text': '{actor}は渡りきった。',
          'stages.start.options.swim.outcomes.success.text': '{actor}は渡りきった。',
          'stages.start.options.swim.outcomes.critSuccess.text': '{actor}は渡りきった。',
        },
      },
    ],
  },
})
const ja = translationFields(content, 'ja', 'situations', 'ferry')
const started = startEncounter(makeState({ gold: 10 }), content, 'ferry')

describe('localizeEncounterState', () => {
  test('the fixture loads', () => expect(errors).toEqual([]))

  test('without a translation the state is returned as is', () => {
    expect(localizeEncounterState(started, null)).toBe(started)
  })

  test('translates the title, twist, options and the opening line, leaving the state intact', () => {
    const view = localizeEncounterState(started, ja)
    expect(view.encounter!.situation.title).toBe('渡し舟')
    expect(twistInfo(view)?.what).toBe('綱が腐っている')
    expect(view.encounter!.log.map((e) => e.text)).toEqual(['川がある。'])
    const [pay, swim] = encounterOptions(view)
    expect(pay.label).toBe('払う')
    expect(swim.label).toBe('Swim') // untranslated: stays English
    expect(started.encounter!.situation.title).toBe('The ferry')
  })

  test('outcome lines keep their English effect chips; actor names are filled in', () => {
    const paid = localizeEncounterState(chooseOption(started, 'pay'), ja)
    expect(paid.encounter!.log.at(-1)!.text).toBe('川を渡った。 (−2 gp)')

    const swum = chooseOption(started, 'swim')
    const actor = swum.party.find((c) => c.id === swum.encounter!.log.at(-1)!.roll!.actorId)!
    // The roll's default XP is a chip like any other.
    expect(localizeEncounterState(swum, ja).encounter!.log.at(-1)!.text).toMatch(
      new RegExp(`^${actor.name}は渡りきった。 \\(\\+\\d+ XP\\)$`)
    )
  })
})
