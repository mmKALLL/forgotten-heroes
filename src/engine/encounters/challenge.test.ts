import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { SituationSchema, type Situation } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { createRng } from '../rng'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { tierOdds } from '../rules/checks'
import { CHALLENGE_MARKS } from '../constants'
import {
  NO_TALLY,
  challengeOdds,
  marksChip,
  playsRound,
  type RoundChoice,
  type RoundResult,
} from './challenge'
import { challengePreview, encounterOptions } from './preview'
import { asRoom } from './room'
import { validateSituation, lintSituation } from './validate'

// A duel: an approach, then a 3-successes-before-2-failures challenge. No wounds, so a run's odds
// depend only on the dice; a talk that wins the Edge; a sure, once-only bomb; and a way out.
const duel = SituationSchema.parse({
  id: 'duel',
  title: 'The duel',
  disposition: 'hostile',
  start: 'approach',
  stages: {
    approach: {
      text: 'A champion waits.',
      options: [
        {
          id: 'face',
          kind: 'fixed',
          label: 'Face him',
          outcome: { text: 'You step up.', goto: 'duel' },
        },
        { id: 'go', kind: 'fixed', label: 'Go', outcome: { text: 'You go.' } },
      ],
    },
    duel: {
      text: 'He raises his blade.',
      challenge: {
        successes: 3,
        failures: 2,
        win: { text: 'He yields.', effects: [{ effect: 'gold', amount: 10 }] },
        lose: { text: 'You are beaten.', effects: [{ effect: 'inspiration', amount: 1 }] },
      },
      options: [
        {
          id: 'strike',
          kind: 'check',
          label: 'Strike',
          check: { skill: 'athletics', dc: 14, combat: true },
          outcomes: {
            fail: { text: 'He parries.' },
            partial: { text: 'Steel rings.' },
            success: { text: 'A hit.' },
          },
        },
        {
          id: 'taunt',
          kind: 'check',
          label: 'Taunt',
          check: { skill: 'persuasion', dc: 16 },
          outcomes: {
            fail: {
              text: 'He laughs.',
              effects: [{ effect: 'position', position: 'exposed' }],
            },
            partial: { text: 'He scowls.' },
            success: {
              text: 'He loses his temper.',
              effects: [{ effect: 'position', position: 'edge' }],
            },
          },
        },
        {
          id: 'bomb',
          kind: 'fixed',
          label: 'Throw fire',
          once: true,
          requires: [{ req: 'goods', good: 'alchemicals', min: 1 }],
          outcome: {
            text: 'Fire.',
            effects: [{ effect: 'goods', good: 'alchemicals', amount: -1 }],
            tally: { successes: 1 },
          },
        },
        {
          id: 'flee',
          kind: 'fixed',
          label: 'Flee',
          tags: ['retreat'],
          outcome: { text: 'You run.' },
        },
      ],
    },
  },
})

const withDuel = (base: Content, situation: Situation = duel): Content => ({
  ...base,
  situations: { ...base.situations, duel: { ...situation, source: 'claude', file: 'x' } },
})
const content = withDuel(fixtureContent())

const play = (state: GameState, optionId: string) =>
  step(state, { type: 'chooseOption', optionId }, content)
/** At the duel, with a seed and (for the bomb) one alchemist's fire. */
function atDuel(seed: number, goods: GameState['goods'] = {}): GameState {
  const started = step(
    { ...makeState({ goods }), rng: createRng(seed) },
    { type: 'startEncounter', situationId: 'duel' },
    content
  )
  return play(started, 'face')
}
/** Strain builds over a long challenge; the odds don't foresee it, so the sampling clears it. */
const unstrained = (s: GameState): GameState => ({
  ...s,
  skillUses: [],
  party: s.party.map((c) => ({ ...c, strain: {} })),
})

/** Plays the duel with the best option every round until it ends. */
function bestPlay(state: GameState): GameState {
  let s = state
  for (let guard = 0; guard < 50 && s.encounter?.stage === 'duel'; guard++)
    s = play(unstrained(s), challengePreview(s)!.best!)
  return s
}

describe('a challenge stage', () => {
  test('the tally is null before it, 0/0 on entering it, and the preview shows it', () => {
    const started = step(makeState(), { type: 'startEncounter', situationId: 'duel' }, content)
    expect(started.encounter!.tally).toBeNull()
    expect(challengePreview(started)).toBeNull()
    const at = play(started, 'face')
    expect(at.encounter!.tally).toEqual(NO_TALLY)
    const preview = challengePreview(at)!
    expect(preview.need).toEqual({ successes: 3, failures: 2 })
    expect(preview.chance).toBeGreaterThan(0)
    expect(preview.chance).toBeLessThan(1)
    expect(Object.keys(preview.ifChosen).sort()).toEqual(['strike', 'taunt'])
  })

  test('each round marks the tally by its tier, stays on the stage, pays no XP, and its row shows the marks', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const at = atDuel(seed)
      const rows = encounterOptions(at).find((o) => o.id === 'strike')!.outcomes
      const after = play(at, 'strike')
      const tier = after.lastRoll!.tier
      const marks = CHALLENGE_MARKS[tier]
      if (after.encounter!.stage === 'duel') expect(after.encounter!.tally).toEqual(marks)
      expect(after.party.map((c) => c.xp)).toEqual(at.party.map((c) => c.xp))
      const row = rows.find((r) => r.tier === tier)!
      if (!row.hidden) {
        expect(row.effects[0]).toBe(marksChip(marks))
        expect(row.next).toBe('stay')
        expect(row.xp).toBe(0)
      }
    }
  })

  test('it ends exactly at its successes or failures, with the win or lose branch', () => {
    let wins = 0
    for (let seed = 1; seed <= 200; seed++) {
      const at = atDuel(seed)
      const end = bestPlay(at)
      const { stage, tally } = end.encounter!
      expect(stage).toBeNull()
      const won = tally!.successes >= 3
      expect(won !== tally!.failures >= 2).toBe(true)
      // One round can overshoot by one (a critical), never more.
      expect(tally!.successes).toBeLessThanOrEqual(won ? 4 : 2)
      expect(tally!.failures).toBeLessThanOrEqual(won ? 1 : 3)
      expect(end.gold - at.gold).toBe(won ? 10 : 0)
      expect(end.inspiration - at.inspiration >= (won ? 0 : 1)).toBe(true)
      if (won) wins++
    }
    expect(wins).toBeGreaterThan(0)
    expect(wins).toBeLessThan(200)
  })

  test('a once-only fixed option is a sure success; a fixed option without a tally works as before', () => {
    const at = atDuel(1, { alchemicals: 1 })
    expect(challengePreview(at)!.ifChosen.bomb).toBeDefined()
    const bombed = play(at, 'bomb')
    expect(bombed.encounter!.tally).toEqual({ successes: 1, failures: 0 })
    expect(bombed.goods.alchemicals ?? 0).toBe(0)
    expect(challengePreview(bombed)!.ifChosen.bomb).toBeUndefined()
    const fled = play(at, 'flee')
    expect(fled.encounter!.stage).toBeNull()
    expect(fled.encounter!.tally).toEqual(NO_TALLY)
    expect(fled.gold).toBe(at.gold)
  })

  test('the win and lose previews are what ending it does', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
      let s = atDuel(seed)
      for (let guard = 0; guard < 50 && s.encounter?.stage === 'duel'; guard++) {
        const { win, lose } = challengePreview(s)!
        const next = play(unstrained(s), challengePreview(s)!.best!)
        if (next.encounter!.stage === null) {
          const won = next.encounter!.tally!.successes >= 3
          const shown = won ? win : lose
          const texts = next.encounter!.log.map((l) => l.text)
          expect(texts).toContain(`${shown.text} (${shown.effects.join(', ')})`)
          seen.add(won ? 'win' : 'lose')
        }
        s = next
      }
    }
    expect([...seen].sort()).toEqual(['lose', 'win'])
  })

  test('is deterministic', () => {
    expect(bestPlay(atDuel(7))).toEqual(bestPlay(atDuel(7)))
  })
})

describe('the chance of winning', () => {
  /** One check option's rounds at a modifier and DC, with the default marks and no footing. */
  const plain = (id: string, modifier: number, dc: number): RoundChoice => ({
    id,
    once: null,
    results: (): RoundResult[] => {
      const odds = tierOdds(modifier, dc)
      return (Object.keys(odds) as (keyof typeof odds)[]).map((tier) => ({
        p: odds[tier],
        marks: CHALLENGE_MARKS[tier],
        position: 'normal',
        modifier: 0,
      }))
    },
  })

  test('with one option it equals the direct recursion over the tally', () => {
    const odds = tierOdds(5, 15)
    const direct = (s: number, f: number): number => {
      if (s >= 4) return 1
      if (f >= 3) return 0
      // A partial leaves the tally as it was: the round is played again.
      const moving =
        odds.critSuccess * direct(s + 2, f) +
        odds.success * direct(s + 1, f) +
        odds.fail * direct(s, f + 1) +
        odds.critFail * direct(s, f + 2)
      return moving / (1 - odds.partial)
    }
    const { chance } = challengeOdds(
      [plain('a', 5, 15)],
      { successes: 4, failures: 3 },
      {
        tally: NO_TALLY,
        position: 'normal',
        modifier: 0,
        used: [],
      }
    )
    expect(chance).toBeCloseTo(direct(0, 0), 10)
  })

  test('the best of two options is at least as good as either alone', () => {
    const from = { tally: NO_TALLY, position: 'normal' as const, modifier: 0, used: [] }
    const need = { successes: 3, failures: 2 }
    const both = challengeOdds([plain('a', 5, 15), plain('b', 3, 12)], need, from)
    const a = challengeOdds([plain('a', 5, 15)], need, from).chance
    const b = challengeOdds([plain('b', 3, 12)], need, from).chance
    // The best option can change with the tally, so mixing them may beat either alone.
    expect(both.chance).toBeGreaterThanOrEqual(Math.max(a, b) - 1e-12)
    expect(both.ifChosen.a).toBeGreaterThanOrEqual(a - 1e-12)
    expect(Math.max(both.ifChosen.a, both.ifChosen.b)).toBeCloseTo(both.chance, 12)
  })

  test('the preview matches a simulated run of the engine with the best option each round', () => {
    const at = atDuel(1)
    const expected = challengePreview(at)!.chance
    const N = 3000
    let wins = 0
    for (let seed = 1; seed <= N; seed++) {
      const end = bestPlay({ ...at, rng: createRng(seed * 7919) })
      if (end.encounter!.tally!.successes >= 3) wins++
    }
    // About 4 standard errors.
    const tolerance = 4 * Math.sqrt((expected * (1 - expected)) / N)
    expect(Math.abs(wins / N - expected)).toBeLessThan(tolerance)
  })
})

describe('content rules', () => {
  test('a dungeon room pays the hoard on the win and drives out on the loss, never on a round', () => {
    const hoard = {
      effect: 'hoard' as const,
      gold: { min: 1, max: 2 },
      precious: 0,
      accessories: 0,
      tier: 1 as const,
      xp: 0,
    }
    const room = asRoom(duel, { wound: 2, hoard })
    const challenge = room.stages.duel.challenge!
    expect(challenge.win.effects).toContainEqual(hoard)
    expect(challenge.lose.effects).toContainEqual({ effect: 'driveOut' })
    for (const o of room.stages.duel.options.filter(playsRound)) {
      const json = JSON.stringify(o)
      expect(json).not.toContain('driveOut')
      expect(json).not.toContain('"hoard"')
    }
  })

  test('the validator and lint accept the duel and catch misused rounds', () => {
    expect(validateSituation(duel, content)).toEqual([])
    expect(lintSituation(duel, content)).toEqual([])
    const broken = structuredClone(duel)
    const [strike, , bomb] = broken.stages.duel.options
    if (strike.kind === 'check') strike.outcomes.fail.goto = 'approach'
    bomb.once = undefined
    broken.stages.duel.challenge!.win.text = '{actor} wins.'
    const issues = validateSituation(broken, withDuel(fixtureContent(), broken))
    expect(issues).toContain(
      "duel/strike fail: a challenge round can't goto or stay; the tally decides"
    )
    expect(issues).toContain('duel/bomb: a fixed option that tallies must be once')
    expect(issues).toContain('duel challenge win: {actor} only works in check outcomes')
  })
})
