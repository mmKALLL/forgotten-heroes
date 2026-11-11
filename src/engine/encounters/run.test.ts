import { describe, expect, test } from 'vitest'
import { GameStateSchema, type GameState } from '../../schema/state'
import { createRng } from '../rng'
import { applyEffects } from './effects'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import type { Content } from '../../content/build'
import { SituationSchema } from '../../schema/encounter'
import { currentOptions, encounterOver, inProgress } from './run'

const content = fixtureContent()
const start = (situationId: string, state: GameState = makeState()) =>
  step(state, { type: 'startEncounter', situationId }, content)
const choose = (state: GameState, optionId: string, actorId?: string) =>
  step(state, { type: 'chooseOption', optionId, actorId }, content)
/** The same state with a different RNG seed, to sample many rolls. */
const reseed = (state: GameState, seed: number): GameState => ({ ...state, rng: createRng(seed) })
const withTwist = (state: GameState, twist: boolean): GameState => ({
  ...state,
  encounter: { ...state.encounter!, twist },
})

describe('startEncounter', () => {
  test('compiles the situation, fills slots and opens on the start stage', () => {
    const state = start('roadside')
    const encounter = state.encounter!
    expect(encounter.stage).toBe('start')
    expect(encounter.source).toBe('original')
    expect(encounter.position).toBe('normal')
    expect(encounter.nextCheckReason).toBeNull()
    expect(encounter.slots.who).toMatch(/^a wary (tinker|pilgrim)$/)
    expect(encounter.log).toEqual([
      {
        text: `${encounter.slots.who.replace('a', 'A')} begs for help. A child waits at home.`,
        tone: 'info',
      },
    ])
    expect(currentOptions(encounter).map((o) => o.id)).toEqual([
      'trust',
      'careful',
      'read',
      'rob',
      'donate',
      'leave',
    ])
    expect(state.log.at(-1)?.text).toMatch(/^Roadside\. A wary/)
    expect(GameStateSchema.parse(state)).toEqual(state)
  })

  test('is deterministic, and the hidden twist follows its chance', () => {
    expect(start('roadside')).toEqual(start('roadside'))
    const twists = Array.from(
      { length: 200 },
      (_, seed) => start('roadside', reseed(makeState(), seed)).encounter!.twist
    )
    const share = twists.filter(Boolean).length / twists.length
    expect(share).toBeGreaterThan(0.35)
    expect(share).toBeLessThan(0.65)
    expect(start('cliff').encounter!.twist).toBe(false) // no twist defined
  })

  test('a start stage that does not exist (even an Object.prototype key) logs and starts nothing', () => {
    for (const start of ['nowhere', 'constructor']) {
      const bad = SituationSchema.parse({
        id: 'bad',
        title: 'Bad',
        start,
        stages: { begin: { text: '' } },
      })
      const broken: Content = {
        ...content,
        situations: { ...content.situations, bad: { ...bad, source: 'original', file: 'x' } },
      }
      const state = step(makeState(), { type: 'startEncounter', situationId: 'bad' }, broken)
      expect(state.encounter).toBeNull()
      expect(state.log.at(-1)).toMatchObject({ text: `Bad has no stage "${start}".`, tone: 'bad' })
    }
  })

  test('another encounter cannot start while one is in progress', () => {
    const roadside = start(
      'roadside',
      makeState({ followUps: [{ situationId: 'grudge', wait: 0 }] })
    )
    for (const action of [
      { type: 'startEncounter', situationId: 'cliff' },
      { type: 'drawEncounter' },
    ] as const) {
      const after = step(roadside, action, content)
      expect({ ...after, log: roadside.log }).toEqual(roadside)
      expect(after.log.at(-1)).toMatchObject({
        text: 'Finish the current encounter first.',
        tone: 'bad',
      })
    }
    const over = { ...roadside, encounter: { ...roadside.encounter!, stage: null } }
    expect(start('cliff', over).encounter?.situation.id).toBe('cliff')
  })

  test('no one fit to travel: starting or drawing logs and starts nothing', () => {
    const downed = makeState({
      party: makeState().party.map((c) => ({ ...c, hp: 0 })),
      followUps: [{ situationId: 'grudge', wait: 0 }],
    })
    for (const action of [
      { type: 'startEncounter', situationId: 'cliff' },
      { type: 'drawEncounter' },
    ] as const) {
      const after = step(downed, action, content)
      expect({ ...after, log: downed.log }).toEqual(downed) // the due follow-up stays queued
      expect(after.log.at(-1)).toMatchObject({ text: 'No one is fit to travel on.', tone: 'bad' })
    }
  })

  test('slots fill the title and the twist', () => {
    const roadside = content.situations.roadside
    const titled: Content = {
      ...content,
      situations: {
        ...content.situations,
        roadside: {
          ...roadside,
          title: 'Meeting {who}',
          twist: { chance: 0.5, what: '{Who} is bait', table: false, opening: [] },
        },
      },
    }
    const state = step(makeState(), { type: 'startEncounter', situationId: 'roadside' }, titled)
    const who = state.encounter!.slots.who
    expect(state.log.at(-1)?.text).toMatch(new RegExp(`^Meeting ${who}\\. `))
    expect(state.encounter!.situation.title).toBe(`Meeting ${who}`)
    expect(state.encounter!.situation.twist?.what).toBe(`${who.replace('a', 'A')} is bait`)
  })

  test('an unknown situation logs and starts nothing', () => {
    const state = start('nope')
    expect(state.encounter).toBeNull()
    expect(state.log.at(-1)).toMatchObject({ text: 'Unknown encounter "nope".', tone: 'bad' })
  })
})

describe('fixed options', () => {
  test('apply the outcome and end the encounter', () => {
    const after = choose(withTwist(start('roadside'), false), 'trust')
    expect(after.gold).toBe(20 + 20) // reward 2 doubles the archetype's 10 gp
    expect(after.encounter?.stage).toBeNull()
    expect(after.encounter?.log.at(-1)?.text).toMatch(/thanks you\. \(\+20 gp\)$/)
  })

  test('the twist branch replaces the outcome when the twist is true', () => {
    const before = withTwist(start('roadside'), true)
    const after = choose(before, 'trust')
    expect(after.gold).toBe(0) // 20 − 20
    const hp = (s: GameState) => s.party.reduce((sum, c) => sum + c.hp, 0)
    expect(hp(after)).toBe(hp(before) - 3)
    expect(after.encounter?.log.at(-1)?.text).toBe('A trap! (−20 gp, someone −3 HP)')
  })

  test('unmet requirements block the option and change nothing but the journal', () => {
    const poor = start('roadside', makeState({ gold: 5 }))
    const after = choose(poor, 'donate')
    expect(after.encounter).toEqual(poor.encounter)
    expect(after.gold).toBe(5)
    expect(after.log.at(-1)).toMatchObject({ text: 'Give them money: needs 20 gp.', tone: 'bad' })
  })
})

describe('check options', () => {
  test("roll with the best actor for the skill, or the player's choice", () => {
    expect(choose(start('roadside'), 'read').lastRoll).toMatchObject({
      stat: 'insight',
      actorId: 'lyra',
      dc: 12,
    })
    expect(choose(start('roadside'), 'read', 'brom').lastRoll?.actorId).toBe('brom')
  })

  test('an unknown stage (even an Object.prototype key) has no options, and choosing does nothing', () => {
    const roadside = start('roadside')
    for (const stage of ['nowhere', 'toString']) {
      const lost = { ...roadside, encounter: { ...roadside.encounter!, stage } }
      expect(currentOptions(lost.encounter)).toEqual([])
      expect(choose(lost, 'trust')).toEqual(lost)
    }
  })

  test('once options stay on the stage, then disappear; choosing them again is a no-op', () => {
    const after = choose(start('roadside'), 'read')
    expect(after.encounter?.stage).toBe('start')
    expect(after.encounter?.used).toEqual(['start/read'])
    expect(currentOptions(after.encounter!).map((o) => o.id)).not.toContain('read')
    expect(choose(after, 'read')).toEqual(after)
  })

  test('Edge rolls with advantage, Exposed with disadvantage, and the roll spends the position', () => {
    const cliff = start('cliff')
    const edge = choose(
      { ...cliff, encounter: { ...cliff.encounter!, position: 'edge' } },
      'around'
    )
    expect(edge.encounter?.position).toBe('edge') // fixed options don't spend it
    for (const [position, mode] of [
      ['edge', 'advantage'],
      ['exposed', 'disadvantage'],
    ] as const) {
      const after = choose({ ...cliff, encounter: { ...cliff.encounter!, position } }, 'climb')
      expect(after.lastRoll?.mode).toBe(mode)
      expect(after.lastRoll?.dice).toHaveLength(2)
    }
  })

  test('a nextCheckModifier applies to the next roll only, then resets', () => {
    const cliff = start('cliff')
    const normal = choose(cliff, 'climb', 'brom').lastRoll!.modifier
    const penalised = applyEffects(cliff, [
      { effect: 'nextCheckModifier', amount: -2, reason: 'misread' },
    ])
    const first = choose(penalised, 'climb', 'brom')
    expect(first.lastRoll?.modifier).toBe(normal - 2)
    expect(first.encounter).toMatchObject({ nextCheckModifier: 0, nextCheckReason: null })
    const again = {
      ...first,
      encounter: { ...first.encounter!, stage: 'start', position: 'normal' as const },
    }
    expect(choose(again, 'climb', 'brom').lastRoll?.modifier).toBe(normal)
  })

  test('a failed read sets −2 for the check after it, not the read itself', () => {
    const normal = choose(start('roadside'), 'rob', 'lyra').lastRoll!.modifier
    for (let seed = 0; seed < 100; seed++) {
      const misread = choose(reseed(start('roadside'), seed), 'read', 'lyra')
      if (misread.lastRoll?.tier !== 'fail' && misread.lastRoll?.tier !== 'critFail') continue
      expect(misread.encounter?.nextCheckModifier).toBe(-2)
      expect(misread.encounter?.log.at(-1)?.text).toBe('You cannot tell. (−2 to the next check)')
      expect(choose(misread, 'rob', 'lyra').lastRoll?.modifier).toBe(normal - 2)
      return
    }
    throw new Error('no failed read in 100 seeds')
  })

  test('outcomes set the next position and stage', () => {
    for (let seed = 0; seed < 60; seed++) {
      const after = choose(reseed(start('cliff'), seed), 'climb')
      const tier = after.lastRoll!.tier
      const expected = {
        critFail: ['exposed', 'start'],
        fail: ['exposed', 'start'],
        partial: ['normal', 'ledge'],
        success: ['edge', 'ledge'],
        critSuccess: ['edge', 'ledge'],
      }[tier]
      expect([after.encounter?.position, after.encounter?.stage]).toEqual(expected)
      if (after.encounter?.stage === 'ledge')
        expect(after.encounter.log.at(-1)?.text).toBe('A gap yawns on the ledge.')
    }
  })

  test('{actor} in outcome text is the member who rolled', () => {
    for (let seed = 0; seed < 40; seed++) {
      const after = choose(reseed(start('cliff'), seed), 'climb', 'lyra')
      if (after.lastRoll?.tier === 'fail') {
        expect(after.encounter?.log.at(-1)?.text).toBe('Lyra slips. (Lyra −3 HP, Exposed)')
        return
      }
    }
    throw new Error('no failed climb in 40 seeds')
  })

  test('a natural 20 grants Inspiration, except on combat checks', () => {
    const crit = (situationId: string, optionId: string) => {
      for (let seed = 0; seed < 400; seed++) {
        const before = reseed(start(situationId), seed)
        const after = choose(before, optionId)
        if (after.lastRoll?.tier === 'critSuccess') return after.inspiration - before.inspiration
      }
      throw new Error('no critical success in 400 seeds')
    }
    expect(crit('cliff', 'climb')).toBe(1)
    expect(crit('grudge', 'fight')).toBe(0)
  })

  test('each check records a skill use; practice rolls and old uses do not stay', () => {
    const old = { day: 1, characterId: 'brom', skill: 'stealth' as const }
    const state = start('cliff', makeState({ day: 9, skillUses: [old, { ...old, day: 3 }] }))
    const after = choose(state, 'climb')
    expect(after.skillUses).toEqual([
      { ...old, day: 3 },
      { day: 9, characterId: 'brom', skill: 'athletics' },
    ])
    const practised = step(
      makeState(),
      { type: 'practiceCheck', stat: 'athletics', dc: 10, mode: 'normal' },
      content
    )
    expect(practised.skillUses).toEqual([])
  })

  test('the encounter ends when no one is left standing', () => {
    const frail = makeState({ party: makeState().party.map((c) => ({ ...c, hp: 1 })) })
    for (let seed = 0; seed < 100; seed++) {
      const after = choose(reseed(start('grudge', frail), seed), 'fight')
      if (after.lastRoll?.tier === 'fail' || after.lastRoll?.tier === 'critFail') {
        expect(after.encounter?.stage).toBeNull()
        expect(after.log.at(-1)).toMatchObject({ text: 'No one is left standing.', tone: 'bad' })
        return
      }
    }
    throw new Error('no failed fight in 100 seeds')
  })

  test('choosing never mutates the input state', () => {
    const before = start('cliff')
    const snapshot = structuredClone(before)
    choose(before, 'climb')
    expect(before).toEqual(snapshot)
  })
})

describe('encounterOver', () => {
  const down = (state: GameState): GameState => ({
    ...state,
    party: state.party.map((c) => ({ ...c, hp: 0 })),
  })

  test('is true with no encounter or an ended one, false while options can be chosen', () => {
    expect(encounterOver(makeState())).toBe(true)
    const cliff = start('cliff')
    expect(encounterOver(cliff)).toBe(false)
    expect(inProgress(cliff)).toBe(true)
    expect(encounterOver({ ...cliff, encounter: { ...cliff.encounter!, stage: null } })).toBe(true)
  })

  test('a downed party with only checks (or unaffordable options) left is over, and can move on', () => {
    // Grudge: a check, and a fixed option that needs 5 gp.
    const stuck = down(start('grudge', makeState({ gold: 0 })))
    expect(encounterOver(stuck)).toBe(true)
    expect(inProgress(stuck)).toBe(false)
    // Fixed options need no one to act: going around the cliff is still possible.
    expect(encounterOver(down(start('cliff')))).toBe(false)
    // Closing works, and a new encounter is refused only because no one can travel.
    expect(step(stuck, { type: 'closeEncounter' }, content).encounter).toBeNull()
    const again = step(stuck, { type: 'startEncounter', situationId: 'cliff' }, content)
    expect(again.log.at(-1)?.text).toBe('No one is fit to travel on.')
  })
})

describe('drawing encounters and follow-ups', () => {
  const draw = (state: GameState, sources?: ('original' | 'procedural')[]) =>
    step(state, { type: 'drawEncounter', sources }, content)

  test('random draws respect the source filter and never pick follow-up-only situations', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = reseed(makeState(), seed)
      expect(draw(state).encounter?.situation.id).not.toBe('grudge')
      expect(draw(state, ['procedural']).encounter?.situation.id).toBe('plea')
    }
  })

  test('an empty filter logs and starts nothing', () => {
    const after = step(makeState(), { type: 'drawEncounter', sources: [] }, content)
    expect(after.encounter).toBeNull()
    expect(after.log.at(-1)?.tone).toBe('bad')
  })

  test('a follow-up fires after its wait, whatever the filter', () => {
    const queued = makeState({ followUps: [{ situationId: 'grudge', wait: 1 }] })
    const first = draw(queued, ['procedural'])
    expect(first.encounter?.situation.id).toBe('plea')
    expect(first.followUps).toEqual([{ situationId: 'grudge', wait: 0 }])
    const second = draw(step(first, { type: 'closeEncounter' }, content), ['procedural'])
    expect(second.encounter?.situation.id).toBe('grudge')
    expect(second.followUps).toEqual([])
  })

  test('every encounter that starts moves the other queued follow-ups one closer', () => {
    const queued = makeState({ followUps: [{ situationId: 'grudge', wait: 2 }] })
    expect(start('cliff', queued).followUps).toEqual([{ situationId: 'grudge', wait: 1 }])
    const due = makeState({
      followUps: [
        { situationId: 'grudge', wait: 0 },
        { situationId: 'cliff', wait: 2 },
      ],
    })
    const after = draw(due)
    expect(after.encounter?.situation.id).toBe('grudge')
    expect(after.followUps).toEqual([{ situationId: 'cliff', wait: 1 }])
  })

  test('a due follow-up to a situation that no longer exists is dropped, and the draw is random', () => {
    const stale = makeState({
      followUps: [
        { situationId: 'gone', wait: 0 },
        { situationId: 'grudge', wait: 1 },
      ],
    })
    const after = draw(stale, ['procedural'])
    expect(after.encounter?.situation.id).toBe('plea')
    expect(after.followUps).toEqual([{ situationId: 'grudge', wait: 0 }])
  })

  test('follow-ups queued during an encounter are not moved by its own start', () => {
    for (let seed = 0; seed < 200; seed++) {
      const after = choose(reseed(start('roadside'), seed), 'rob', 'lyra')
      if (after.lastRoll?.tier !== 'success') continue
      expect(after.followUps).toEqual([{ situationId: 'grudge', wait: 1 }])
      return
    }
    throw new Error('no successful robbery in 200 seeds')
  })

  test('closeEncounter clears the encounter', () => {
    expect(step(start('cliff'), { type: 'closeEncounter' }, content).encounter).toBeNull()
  })
})
