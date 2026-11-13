import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { SituationSchema, type Situation } from '../../schema/encounter'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { encounterOptions } from '../encounters/preview'
import { createRng } from '../rng'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { DANGER_RAMP_DAYS, DANGER_RAMP_MAX, DANGER_RAMP_STEP } from '../constants'
import { actCalendar } from '../crisis/calendar'
import { dangerInfo, dangerLevel, harden, rampLevel } from './danger'

const content = fixtureContent()

/** A DC 13 check whose failure costs the actor 4 HP. */
const ford = SituationSchema.parse({
  id: 'ford',
  title: 'Ford',
  stages: {
    start: {
      text: 'A swollen ford.',
      options: [
        {
          id: 'wade',
          kind: 'check',
          label: 'Wade across',
          check: { skill: 'athletics', dc: 13 },
          outcomes: {
            fail: {
              text: 'Swept off your feet.',
              effects: [
                { effect: 'hp', amount: -4, target: 'actor' },
                { effect: 'hp', amount: 2, target: 'all' },
                { effect: 'gold', amount: -3 },
              ],
            },
            partial: { text: 'Soaked.' },
            success: { text: 'Across.' },
          },
        },
      ],
    },
  },
})
const withFord: Content = {
  ...content,
  situations: { ...content.situations, ford: { ...ford, source: 'claude', file: 'test' } },
}

/** Day 101: two steps of danger. */
const DAY_TWO_STEPS = 1 + 2 * DANGER_RAMP_DAYS

const start = (id: string, day: number, using = content, seed = 1): GameState =>
  step(
    { ...makeState({ day }), rng: createRng(seed) },
    { type: 'startEncounter', situationId: id },
    using
  )
const checkDc = (situation: Situation, stage: string, option: string) => {
  const found = situation.stages[stage].options.find((o) => o.id === option)!
  return found.kind === 'check' ? Number(found.check.dc) : NaN
}
const hpOf = (situation: Situation) => {
  const option = situation.stages.start.options[0]
  return option.kind === 'check' ? option.outcomes.fail.effects : []
}

/** A day with no Crisis to surge. */
const on = (day: number) => ({ day, crisis: null })

describe('dangerLevel and dangerInfo', () => {
  test('steps up every DANGER_RAMP_DAYS days and stops at the cap', () => {
    expect(rampLevel(1)).toBe(0)
    expect(rampLevel(DANGER_RAMP_DAYS)).toBe(0)
    expect(rampLevel(DANGER_RAMP_DAYS + 1)).toBe(DANGER_RAMP_STEP)
    expect(rampLevel(2 * DANGER_RAMP_DAYS)).toBe(DANGER_RAMP_STEP)
    expect(rampLevel(DAY_TWO_STEPS)).toBe(2 * DANGER_RAMP_STEP)
    expect(rampLevel(1000 * DANGER_RAMP_DAYS)).toBe(DANGER_RAMP_MAX)
    expect(dangerLevel(on(DAY_TWO_STEPS))).toBe(rampLevel(DAY_TWO_STEPS))
  })

  test('says how dangerous the roads are and when it next rises', () => {
    expect(dangerInfo(on(1))).toEqual({
      share: 0,
      percent: 0,
      nextDay: DANGER_RAMP_DAYS + 1,
      text: 'The roads are as they have always been',
      surge: null,
      wait: null,
    })
    const later = dangerInfo(on(DAY_TWO_STEPS))
    expect(later.percent).toBe(Math.round(200 * DANGER_RAMP_STEP))
    expect(later.nextDay).toBe(1 + 3 * DANGER_RAMP_DAYS)
    expect(later.text).toBe(`The roads grow more dangerous: +${later.percent}%`)
    expect(dangerInfo(on(1000 * DANGER_RAMP_DAYS)).nextDay).toBeNull()
  })

  test('the Crisis surges in the last days before a surging act is due, until it is thwarted', () => {
    // The fixture's act II surges and is due on day 200.
    const base = makeState()
    const crisis = { ...base.crisis!, leads: [35, 140, null], thwarted: [50, null, null] }
    const at = (day: number, c = crisis) => dangerLevel({ day, crisis: c }, content)
    const surge = (day: number, c = crisis) => at(day, c) - rampLevel(day)
    expect(surge(170)).toBeCloseTo(0)
    expect(surge(185)).toBeGreaterThan(0)
    expect(surge(195)).toBeGreaterThan(surge(185))
    expect(surge(195, { ...crisis, thwarted: [50, 194, null] })).toBeCloseTo(0)
    // Act I doesn't surge; without content there is no surge either.
    expect(surge(95, { ...crisis, thwarted: [null, null, null] })).toBeCloseTo(0)
    expect(dangerLevel({ day: 195, crisis })).toBe(rampLevel(195))
    // The danger mark says why.
    const info = dangerInfo({ day: 195, crisis }, content)
    expect(info.surge!.text).toMatch(/^Act II, The Test Act 2, is near its day: \+\d+%$/)
    expect(info.percent).toBe(Math.round(at(195) * 100))
  })

  test('the waiting penalty grows each day an open act’s lead goes unfollowed, then drops', () => {
    const base = makeState()
    const crisis: CrisisState = {
      ...base.crisis!,
      leads: [null, null, null],
      thwarted: [null, null, null],
    }
    const from = actCalendar(crisis, 0).waiting
    const wait = (day: number, c = crisis) => dangerLevel({ day, crisis: c }) - rampLevel(day)
    expect(wait(from - 1)).toBeCloseTo(0)
    expect(wait(from)).toBeGreaterThan(0)
    expect(wait(from + 5)).toBeGreaterThan(wait(from))
    // Winning the lead ends it; it stacks with the ramp (and needs no content).
    expect(wait(from + 5, { ...crisis, leads: [from + 2, null, null] })).toBeCloseTo(0)
    const info = dangerInfo({ day: from + 5, crisis }, content)
    expect(info.wait!.percent).toBe(Math.round(wait(from + 5) * 100))
    expect(info.percent).toBe(Math.round(dangerLevel({ day: from + 5, crisis }) * 100))
    // Act II's begins on its own waiting day, while its lead is not won, and says which act.
    const two = { ...crisis, leads: [35, null, null], thwarted: [60, null, null] }
    const from2 = actCalendar(two, 1).waiting
    expect(from2).toBeGreaterThan(from)
    expect(wait(from2 - 1, two)).toBeCloseTo(0)
    expect(dangerInfo({ day: from2 + 3, crisis: two }, content).wait!.text).toMatch(
      /^Act II, The Test Act 2: its lead goes unfollowed: \+\d+%/
    )
  })

  test('an encounter started while waiting is hardened by it (preview == actual)', () => {
    const base = makeState()
    const crisis: CrisisState = {
      ...base.crisis!,
      leads: [null, null, null],
      thwarted: [null, null, null],
    }
    const day = actCalendar(crisis, 0).waiting + 10
    const state = step(
      { ...base, day, crisis },
      { type: 'startEncounter', situationId: 'ford' },
      withFord
    )
    expect(state.encounter!.danger).toBe(dangerLevel(state, withFord))
    expect(state.encounter!.danger).toBeGreaterThan(rampLevel(day))
    const [wade] = encounterOptions(state)
    const rolled = step(state, { type: 'chooseOption', optionId: 'wade' }, withFord)
    expect(rolled.lastRoll!.dc).toBe(wade.check!.dc)
  })
})

describe('harden', () => {
  test('raises DCs by a share of themselves plus the bonus, and wounds by the share', () => {
    const hard = harden(ford, { dcBonus: 0, danger: 0.2 })
    expect(checkDc(hard, 'start', 'wade')).toBe(16) // 13 + round(2.6)
    expect(hpOf(hard)).toEqual([
      { effect: 'hp', amount: -5, target: 'actor' }, // −ceil(4.8)
      { effect: 'hp', amount: 2, target: 'all' }, // healing unchanged
      { effect: 'gold', amount: -3 }, // gold unchanged
    ])
    // Site power and danger stack.
    expect(checkDc(harden(ford, { dcBonus: 2, danger: 0.2 }), 'start', 'wade')).toBe(18)
    expect(harden(ford, { dcBonus: 0, danger: 0 })).toBe(ford)
  })
})

describe('danger in encounters', () => {
  test('a DC 13 check on day 101 shows and rolls DC 16 (preview == actual)', () => {
    const early = start('ford', 1, withFord)
    expect(early.encounter!.danger).toBe(0)
    expect(encounterOptions(early)[0].check!.dc).toBe(13)

    const state = start('ford', DAY_TWO_STEPS, withFord)
    expect(state.encounter!.danger).toBe(2 * DANGER_RAMP_STEP)
    const [wade] = encounterOptions(state)
    expect(wade.check!.dc).toBe(16)
    const rolled = step(state, { type: 'chooseOption', optionId: 'wade' }, withFord)
    expect(rolled.lastRoll!.dc).toBe(wade.check!.dc)
  })

  test('a −4 HP outcome hurts 5 on day 101, in the preview and in play', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = start('ford', DAY_TWO_STEPS, withFord, seed)
      const fail = encounterOptions(state)[0].outcomes.find((o) => o.tier === 'fail')!
      expect(!fail.hidden && fail.effects).toContain('Brom −5 HP')
      const after = step(
        state,
        { type: 'chooseOption', optionId: 'wade', actorId: 'brom' },
        withFord
      )
      if (after.lastRoll!.tier !== 'fail') continue
      const before = state.party[0]
      expect(after.party[0].hp).toBe(Math.min(before.maxHp, before.hp - 5 + 2))
      return
    }
    throw new Error('no failed wade in 60 seeds')
  })

  test('the twist stages joined from the twist table are hardened too', () => {
    // Same seed, same twist kind: danger draws nothing from the RNG.
    for (let seed = 1; seed <= 20; seed++) {
      const calm = start('stranger', 1, content, seed).encounter!
      const hard = start('stranger', DAY_TWO_STEPS, content, seed).encounter!
      expect(hard.twistKind).toEqual(calm.twistKind)
      const twistStages = Object.keys(calm.situation.stages).filter((id) => id.startsWith('twist-'))
      expect(twistStages.length).toBeGreaterThan(0)
      for (const id of twistStages) {
        for (const option of calm.situation.stages[id].options) {
          if (option.kind !== 'check') continue
          const dc = Number(option.check.dc)
          expect(checkDc(hard.situation, id, option.id)).toBe(dc + Math.round(dc * 0.2))
        }
      }
      const opening = (e: typeof calm) => e.situation.twist!.opening.find((x) => x.effect === 'hp')
      const calmHit = opening(calm)
      if (calmHit?.effect === 'hp' && calmHit.amount < 0) {
        const hardHit = opening(hard)!
        expect(hardHit.effect === 'hp' && hardHit.amount).toBeLessThan(calmHit.amount)
      }
    }
  })

  test('is deterministic, and an open encounter keeps its DCs on a later day', () => {
    const state = start('ford', DAY_TWO_STEPS, withFord)
    expect(start('ford', DAY_TWO_STEPS, withFord)).toEqual(state)
    const later = { ...state, day: state.day + 5 * DANGER_RAMP_DAYS }
    expect(encounterOptions(later)[0].check!.dc).toBe(encounterOptions(state)[0].check!.dc)
  })
})
