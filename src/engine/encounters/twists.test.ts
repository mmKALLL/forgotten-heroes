import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { SituationSchema, TwistKindSchema } from '../../schema/encounter'
import { GameStateSchema, type GameState } from '../../schema/state'
import { createRng } from '../rng'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { encounterOptions, twistInfo, type ShownOutcome } from './preview'
import { contentIssues, lintSituation, validateSituation, validateTwistKind } from './validate'

const content = fixtureContent()
const reseed = (state: GameState, seed: number): GameState => ({ ...state, rng: createRng(seed) })
const start = (situationId = 'stranger', state: GameState = makeState(), c: Content = content) =>
  step(state, { type: 'startEncounter', situationId }, c)
const choose = (state: GameState, optionId: string, c: Content = content) =>
  step(state, { type: 'chooseOption', optionId }, c)
const withTwist = (state: GameState, patch: object = {}): GameState => ({
  ...state,
  encounter: { ...state.encounter!, twist: true, ...patch },
})
/** The first seed whose stranger encounter draws `kind`. */
const seedFor = (kind: string) => {
  for (let seed = 0; seed < 500; seed++) {
    const state = start('stranger', reseed(makeState(), seed))
    if (state.encounter!.twistKind?.id === kind) return state
  }
  throw new Error(`no seed draws ${kind}`)
}
const hp = (state: GameState) => state.party.reduce((sum, c) => sum + c.hp, 0)
const shown = (state: GameState, optionId: string) =>
  encounterOptions(state).find((o) => o.id === optionId)!.outcomes[0] as ShownOutcome

describe('the twist table', () => {
  test('the kind is drawn when the encounter starts: deterministic per seed, by weight', () => {
    expect(start()).toEqual(start())
    const kinds = Array.from(
      { length: 400 },
      (_, seed) => start('stranger', reseed(makeState(), seed)).encounter!.twistKind!.id
    )
    const share = kinds.filter((k) => k === 'ambush').length / kinds.length
    expect(share).toBeGreaterThan(0.65) // weight 3 of 4
    expect(share).toBeLessThan(0.85)
    expect(kinds).toContain('theft')
    expect(kinds).not.toContain('never') // weight 0
  })

  test('situations without a table twist draw no kind', () => {
    expect(start('roadside').encounter!.twistKind).toBeNull()
    expect(start('cliff').encounter!.twistKind).toBeNull()
  })

  test('"kinds" limits the table', () => {
    const only: Content = {
      ...content,
      situations: {
        ...content.situations,
        stranger: {
          ...content.situations.stranger,
          twist: { ...content.situations.stranger.twist!, kinds: ['theft'] },
        },
      },
    }
    for (let seed = 0; seed < 20; seed++)
      expect(start('stranger', reseed(makeState(), seed), only).encounter!.twistKind!.id).toBe(
        'theft'
      )
  })

  test("the kind's stages, slots, escalation stage and opening hit join the snapshot", () => {
    const state = seedFor('ambush')
    const { situation, slots, twistKind } = state.encounter!
    expect(Object.keys(situation.stages).sort()).toEqual(['start', 'twist-start'])
    expect(situation.twist).toMatchObject({
      stage: 'twist-start',
      opening: [{ effect: 'hp', amount: -3, target: 'random' }],
    })
    expect(slots.ambushers).toMatch(/^a band of bandits$/)
    expect(twistKind).toEqual({ id: 'ambush', what: 'they were bait for a band of bandits' })
    expect(GameStateSchema.parse(state)).toEqual(state)

    const theft = seedFor('theft').encounter!.situation
    expect(Object.keys(theft.stages).sort()).toEqual(['start', 'twist-cornered', 'twist-start'])
    const chase = theft.stages['twist-start'].options[0]
    expect(chase.kind === 'check' && chase.outcomes.partial.goto).toBe('twist-cornered')
  })

  test('a save from before twist kinds loads with no kind drawn', () => {
    const state = start()
    const { twistKind: _k, twistKindRevealed: _r, ...old } = state.encounter!
    const loaded = GameStateSchema.parse({ ...state, encounter: old })
    expect(loaded.encounter!.twistKind).toBeNull()
    expect(loaded.encounter!.twistKindRevealed).toBe(false)
  })
})

describe('footing when the twist hits', () => {
  test('trusting help: Exposed, the opening hit, and on to the escalation stage', () => {
    const ambush = withTwist(seedFor('ambush'))
    const after = choose(ambush, 'trust')
    expect(after.encounter!.stage).toBe('twist-start')
    expect(after.encounter!.position).toBe('exposed')
    expect(hp(after)).toBe(hp(ambush) - 3)
    expect(after.gold).toBe(ambush.gold)
    expect(after.encounter!.twistKindRevealed).toBe(true)
    expect(after.encounter!.log.at(-1)?.text).toMatch(/^A band of bandits attack!$/)
    expect(after.encounter!.log.at(-2)?.text).toBe(
      'You walked right into it. (Exposed, someone −3 HP)'
    )

    // Theft's opening hit is gold, not blood.
    const theft = withTwist(seedFor('theft'))
    const robbed = choose(theft, 'trust')
    expect(robbed.gold).toBe(theft.gold - 5)
    expect(hp(robbed)).toBe(hp(theft))
    expect(robbed.encounter!.stage).toBe('twist-start')
  })

  test('cautious help: normal footing and no opening hit', () => {
    const state = withTwist(seedFor('ambush'), { position: 'exposed' })
    const after = choose(state, 'careful')
    expect(after.encounter!.stage).toBe('twist-start')
    expect(after.encounter!.position).toBe('normal')
    expect(hp(after)).toBe(hp(state))
  })

  test('cautious help after a read that revealed the odds: Edge', () => {
    const state = withTwist(seedFor('ambush'))
    let read: GameState | null = null
    for (let seed = 0; seed < 50 && !read; seed++) {
      const tried = choose(reseed(state, seed), 'read')
      if (tried.encounter!.twistRevealed) read = tried
    }
    expect(read).not.toBeNull()
    const after = choose(read!, 'careful')
    expect(after.encounter!.position).toBe('edge')
    expect(after.encounter!.stage).toBe('twist-start')
  })

  test('without the twist, help just ends the encounter', () => {
    const state = { ...seedFor('ambush') }
    const calm = { ...state, encounter: { ...state.encounter!, twist: false } }
    const after = choose(calm, 'trust')
    expect(after.encounter!.stage).toBeNull()
    expect(after.gold).toBe(calm.gold + 10)
  })

  test('a bespoke twist goes to its own stage and opening hit', () => {
    const bespoke = SituationSchema.parse({
      id: 'bespoke',
      title: 'Bespoke',
      twist: {
        chance: 1,
        what: 'it is a trap',
        stage: 'trap',
        opening: [{ effect: 'gold', amount: -7 }],
      },
      stages: {
        start: {
          text: 'Help?',
          options: [
            {
              id: 'trust',
              kind: 'fixed',
              label: 'Help',
              outcome: {
                text: 'Fine.',
                twist: { text: 'Trap!', effects: [{ effect: 'openingHit' }], goto: '@twist' },
              },
            },
            { id: 'leave', kind: 'fixed', label: 'Leave', outcome: { text: 'Bye.' } },
          ],
        },
        trap: {
          text: 'The trap springs.',
          options: [
            { id: 'a', kind: 'fixed', label: 'A', outcome: { text: 'A.' } },
            { id: 'b', kind: 'fixed', label: 'B', outcome: { text: 'B.' } },
          ],
        },
      },
    })
    const c: Content = {
      ...content,
      situations: { ...content.situations, bespoke: { ...bespoke, source: 'claude', file: 'x' } },
    }
    expect(validateSituation(bespoke, c)).toEqual([])
    const state = start('bespoke', makeState(), c)
    expect(state.encounter!.twistKind).toBeNull()
    const after = choose(state, 'trust', c)
    expect(after.encounter!.stage).toBe('trap')
    expect(after.gold).toBe(state.gold - 7)
  })
})

describe('previews', () => {
  test('twist branches stay generic until the kind is known', () => {
    const state = seedFor('ambush')
    expect(twistInfo(state)).toEqual({ what: 'they are not what they seem', chance: null })
    const trust = shown(state, 'trust').twist!
    expect(trust.effects).toEqual(['Exposed', 'an opening hit'])
    expect(trust.next).toBe('escalates')
    const careful = shown(state, 'careful').twist!
    expect(careful.effects).toEqual(['normal position', 'Edge (if you know the odds)'])

    const revealed = withTwist(state, { twistRevealed: true })
    expect(twistInfo(revealed)).toEqual({ what: 'they are not what they seem', chance: 0.5 })
    expect(shown(revealed, 'careful').twist!.effects).toEqual(['normal position', 'Edge'])
    expect(shown(revealed, 'trust').twist!.effects).toEqual(['Exposed', 'an opening hit'])

    const known = withTwist(state, { twistRevealed: true, twistKindRevealed: true })
    expect(twistInfo(known)?.what).toBe('they were bait for a band of bandits')
    expect(shown(known, 'trust').twist!.effects).toEqual(['Exposed', 'someone −3 HP'])
  })

  test('a great read reveals the kind', () => {
    const state = seedFor('theft')
    let crit: GameState | null = null
    for (let seed = 0; seed < 400 && !crit; seed++) {
      const tried = choose(reseed(state, seed), 'read')
      if (tried.lastRoll?.tier === 'critSuccess') crit = tried
    }
    expect(crit!.encounter!.twistKindRevealed).toBe(true)
    expect(twistInfo(crit!)?.what).toBe('they meant to rob you')
  })
})

describe('validation', () => {
  const need = (twist: object, trustTwist: object, extraStages: object = {}) =>
    SituationSchema.parse({
      id: 'need',
      title: 'Need',
      twist: { chance: 0.5, what: 'trouble', ...twist },
      stages: {
        start: {
          text: 'Help?',
          options: [
            {
              id: 'trust',
              kind: 'fixed',
              label: 'Help',
              outcome: { text: 'Fine.', twist: { text: 'Uh oh.', ...trustTwist } },
            },
            { id: 'leave', kind: 'fixed', label: 'Leave', outcome: { text: 'Bye.' } },
          ],
        },
        ...extraStages,
      },
    })

  test('the fixture table situation is valid and every kind joined in passes the lint', () => {
    expect(validateSituation(content.situations.stranger, content)).toEqual([])
    expect(lintSituation(content.situations.stranger, content)).toEqual([])
    expect(contentIssues(content)).toEqual({})
  })

  test('"@twist" needs a twist table or a twist stage, and a twist branch', () => {
    expect(validateSituation(need({}, { goto: '@twist' }), content)).toContain(
      'start/trust outcome twist: goto "@twist" needs a twist table or a twist "stage"'
    )
    const outside = SituationSchema.parse({
      id: 'outside',
      title: 'Outside',
      twist: { chance: 0.5, what: 'x', table: true },
      stages: {
        start: {
          text: 'Go?',
          options: [
            { id: 'go', kind: 'fixed', label: 'Go', outcome: { text: 'Go.', goto: '@twist' } },
            { id: 'stop', kind: 'fixed', label: 'Stop', outcome: { text: 'Stop.' } },
          ],
        },
      },
    })
    expect(validateSituation(outside, content)).toContain(
      'start/go outcome: goto "@twist" only works in a twist branch'
    )
    expect(validateSituation(need({ table: true }, { goto: '@twist' }), content)).toEqual([])
  })

  test('a table twist that never escalates leaves its stages unreachable', () => {
    expect(validateSituation(need({ table: true }, {}), content)).toContain(
      'stage twist-start is unreachable'
    )
  })

  test('twist setup: unknown kinds, a stage that does not exist, mixing table and stage', () => {
    expect(validateSituation(need({ table: true, kinds: ['nope'] }, {}), content)).toEqual(
      expect.arrayContaining([
        'twist: unknown twist kind "nope"',
        'twist: the twist table has no kind to draw',
      ])
    )
    expect(validateSituation(need({ stage: 'nowhere' }, { goto: '@twist' }), content)).toContain(
      'twist: stage "nowhere" does not exist'
    )
    expect(
      validateSituation(need({ table: true, stage: 'start' }, { goto: '@twist' }), content)
    ).toContain('twist: a table twist gets its stage from the table; drop "stage"')
  })

  test('conditions and the opening hit are checked', () => {
    const noTwist = SituationSchema.parse({
      id: 'plain',
      title: 'Plain',
      stages: {
        start: {
          text: 'Go?',
          options: [
            {
              id: 'go',
              kind: 'fixed',
              label: 'Go',
              outcome: {
                text: 'Go.',
                effects: [{ effect: 'position', position: 'edge', if: { cond: 'twistRevealed' } }],
              },
            },
            { id: 'stop', kind: 'fixed', label: 'Stop', outcome: { text: 'Stop.' } },
          ],
        },
      },
    })
    expect(validateSituation(noTwist, content)).toContain(
      'start/go outcome: condition twistRevealed but the situation has no twist'
    )
    expect(
      validateSituation(need({ stage: 'start' }, { effects: [{ effect: 'openingHit' }] }), content)
    ).toContain('start/trust outcome twist: openingHit but the twist has no opening hit')
    expect(
      validateSituation(
        need({ stage: 'start', opening: [{ effect: 'hp', amount: -2, target: 'actor' }] }, {}),
        content
      )
    ).toContain('twist opening: an opening hit has no actor; use "all" or "random"')
  })

  test('twist kinds are checked as stand-alone escalations', () => {
    expect(Object.values(content.twists).flatMap((k) => validateTwistKind(k, content))).toEqual([])
    const bad = TwistKindSchema.parse({
      id: 'bad',
      name: 'Bad',
      what: 'bad',
      opening: [{ effect: 'hp', amount: -1, target: 'actor' }],
      stages: {
        start: {
          text: 'Only one way out.',
          options: [
            {
              id: 'loop',
              kind: 'fixed',
              label: 'Loop',
              outcome: { text: 'Again.', goto: '@twist' },
            },
          ],
        },
      },
    })
    expect(validateTwistKind(bad, content)).toEqual(
      expect.arrayContaining([
        'opening: an opening hit has no actor; use "all" or "random"',
        'start/loop outcome: a twist kind can\'t goto "@twist"',
      ])
    )
    const thin = TwistKindSchema.parse({
      ...bad,
      opening: [],
      stages: {
        start: {
          text: 'One option.',
          options: [{ id: 'only', kind: 'fixed', label: 'Only', outcome: { text: 'Done.' } }],
        },
      },
    })
    expect(validateTwistKind(thin, content)).toEqual([
      'stage start has 1 option(s); regular encounters need at least 2',
    ])
  })
})
