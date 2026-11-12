import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { SituationSchema } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { createRng } from '../rng'
import { checkXp } from '../rules/progression'
import { TIERS } from '../rules/checks'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { encounterOptions, type ShownOutcome } from './preview'

const content = fixtureContent()

/** A one-check situation whose success has an explicit `xp` effect. */
const taught = SituationSchema.parse({
  id: 'taught',
  title: 'Taught',
  stages: {
    start: {
      text: 'An old soldier shows you a trick.',
      options: [
        {
          id: 'learn',
          kind: 'check',
          label: 'Learn it',
          check: { skill: 'athletics', dc: 12 },
          outcomes: {
            fail: { text: 'Not today.' },
            partial: { text: 'Some of it.' },
            success: { text: 'You have it.', effects: [{ effect: 'xp', amount: 7 }] },
          },
        },
      ],
    },
  },
})
const withTaught: Content = {
  ...content,
  situations: { ...content.situations, taught: { ...taught, source: 'claude', file: 'test' } },
}

const start = (id: string, seed: number, using = content): GameState =>
  step({ ...makeState(), rng: createRng(seed) }, { type: 'startEncounter', situationId: id }, using)
const totalXp = (s: GameState) => s.party.map((c) => c.xp)
const gained = (before: GameState, after: GameState) =>
  after.party.map((c, i) => c.xp - before.party[i].xp)

describe('XP from encounter checks', () => {
  test('pays more for better tiers and harder checks, and something for failing', () => {
    expect(checkXp(13, 'critSuccess')).toBeGreaterThan(checkXp(13, 'success'))
    expect(checkXp(13, 'success')).toBeGreaterThan(checkXp(13, 'partial'))
    expect(checkXp(13, 'partial')).toBeGreaterThan(checkXp(13, 'fail'))
    expect(checkXp(13, 'fail')).toBeGreaterThan(0)
    expect(checkXp(13, 'critFail')).toBe(checkXp(13, 'fail'))
    expect(checkXp(16, 'success')).toBeGreaterThan(checkXp(13, 'success'))
  })

  test('the XP shown before the roll is the XP gained, whatever the tier (preview == actual)', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const state = start('cliff', seed)
      const option = encounterOptions(state).find((o) => o.id === 'climb')!
      const after = step(state, { type: 'chooseOption', optionId: 'climb' }, content)
      const tier = after.lastRoll!.tier
      seen.add(tier)
      const shown = option.outcomes.find((o) => o.tier === tier)
      const expected = shown && !shown.hidden ? shown.xp : checkXp(option.check!.dc, tier)
      for (const xp of gained(state, after)) expect(xp).toBe(expected)
      if (tier === 'success') expect(gained(state, after)[0]).toBe(option.check!.xp)
    }
    expect(seen.has('success') && seen.has('fail')).toBe(true)
  })

  test('the default XP shows as a chip on each outcome, and in the journal line', () => {
    const state = start('cliff', 1)
    const option = encounterOptions(state).find((o) => o.id === 'climb')!
    const success = option.outcomes.find((o) => o.tier === 'success') as ShownOutcome
    expect(option.check!.xp).toBeGreaterThan(0)
    expect(success.effects).toContain(`+${option.check!.xp} XP`)
  })

  test('an explicit xp effect replaces the default for that roll', () => {
    const state = start('taught', 1, withTaught)
    const option = encounterOptions(state).find((o) => o.id === 'learn')!
    const success = option.outcomes.find((o) => o.tier === 'success') as ShownOutcome
    expect(option.check!.xp).toBe(7)
    expect(success.xp).toBe(7)
    expect(success.effects.filter((e) => e.endsWith('XP'))).toEqual(['+7 XP'])
    for (let seed = 1; seed <= 60; seed++) {
      const s = start('taught', seed, withTaught)
      const after = step(s, { type: 'chooseOption', optionId: 'learn' }, withTaught)
      const tier = after.lastRoll!.tier
      if (tier !== 'success' && tier !== 'critSuccess') continue
      expect(gained(s, after)).toEqual([7, 7])
      return
    }
    throw new Error('no success in 60 seeds')
  })

  test('fixed options and wonders give no XP; the dead gain none', () => {
    const state = start('cliff', 1)
    const around = step(state, { type: 'chooseOption', optionId: 'around' }, content)
    expect(totalXp(around)).toEqual(totalXp(state))
    const wonder = start('starfall', 1)
    const [watch] = encounterOptions(wonder)
    for (const outcome of watch.outcomes) if (!outcome.hidden) expect(outcome.xp).toBe(0)
    const watched = step(wonder, { type: 'chooseOption', optionId: watch.id }, content)
    expect(totalXp(watched)).toEqual(totalXp(wonder))

    const dead = {
      ...state,
      party: state.party.map((c, i) => (i === 1 ? { ...c, exhaustion: 6 } : c)),
    }
    const after = step(
      dead,
      { type: 'chooseOption', optionId: 'climb', actorId: dead.party[0].id },
      content
    )
    expect(after.party[1].xp).toBe(dead.party[1].xp)
    expect(after.party[0].xp).toBeGreaterThan(dead.party[0].xp)
  })

  test('XP from checks is deterministic for a seed', () => {
    const run = () => step(start('cliff', 5), { type: 'chooseOption', optionId: 'climb' }, content)
    expect(run()).toEqual(run())
    expect(TIERS).toContain(run().lastRoll!.tier)
  })
})
