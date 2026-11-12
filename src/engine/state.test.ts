import { describe, expect, test } from 'vitest'
import { GameStateSchema, type GameState } from '../schema/state'
import { generateParty } from './party'
import { createRng } from './rng'
import { tierOdds } from './rules/checks'
import { newGame, previewCheck, step } from './state'
import { fixtureContent, makeCharacter } from './test-fixtures'
import { START_MODES, generateWorld, startingSettlement, worldSeed } from './world/generate'
import { generateCrisis } from './crisis/generate'

const content = fixtureContent()

describe('newGame', () => {
  test('is deterministic and schema-valid', () => {
    const a = newGame(99, content)
    expect(newGame(99, content)).toEqual(a)
    expect(GameStateSchema.parse(a)).toEqual(a)
    expect(a.party).toHaveLength(2)
    expect(a.log.length).toBeGreaterThan(0)
  })

  test('starts at a settlement of a freshly rolled world, with supplies and no strain', () => {
    const state = newGame(99, content)
    // The world as rolled, plus the Crisis's sites placed from the start (crisis/generate.ts).
    const world = generateWorld(worldSeed(99), content)
    expect(state.location).toBe(startingSettlement(world, content))
    const crisis = generateCrisis(world, content, { startDay: 1, start: state.location })!
    expect(state.world).toEqual(crisis.world)
    expect(state.crisis).toEqual(crisis.crisis)
    expect(state.travel).toBeNull()
    expect(state.goods).toEqual({ food: 10, water: 8 })
    expect(state.party.map((c) => c.strain)).toEqual([{}, {}])
    expect(state.log[0].text).toMatch(/ set out together from \w+\.$/)
  })

  test('starts where the chosen start mode says', () => {
    for (const mode of START_MODES) {
      const state = newGame(99, content, 2, mode)
      expect(state.location).toBe(startingSettlement(state.world, content, mode))
    }
  })

  test('rolling the world leaves the run’s random stream alone', () => {
    const [, rng] = generateParty(createRng(99), content, 2)
    expect(newGame(99, content).rng).toEqual(rng)
  })
})

describe('practiceCheck', () => {
  const base = (): GameState => ({
    ...newGame(1, content),
    party: [
      makeCharacter({
        id: 'bard',
        name: 'Lyra',
        abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
        skillProficiencies: ['persuasion'],
      }),
      makeCharacter({ id: 'fighter', name: 'Brom' }),
    ],
  })

  test('rolls with the best actor, advances rng, logs, and does not mutate input', () => {
    const before = base()
    const snapshot = structuredClone(before)
    const after = step(
      before,
      { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' },
      content
    )
    expect(before).toEqual(snapshot)
    expect(after.rng).not.toEqual(before.rng)
    expect(after.lastRoll?.actorId).toBe('bard')
    expect(after.lastRoll?.modifier).toBe(5)
    expect(after.log.length).toBe(before.log.length + 1)
    expect(after.log.at(-1)?.text).toMatch(/^Lyra rolls Persuasion/)
  })

  test('natural 20s grant inspiration', () => {
    let state = base()
    let crits = 0
    for (let i = 0; i < 400; i++) {
      state = step(
        state,
        { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' },
        content
      )
      if (state.lastRoll?.tier === 'critSuccess') crits++
    }
    expect(crits).toBeGreaterThan(0)
    expect(state.inspiration).toBe(crits)
  })

  test('nobody able to act logs and changes nothing else', () => {
    const state = { ...base(), party: base().party.map((c) => ({ ...c, hp: 0 })) }
    const after = step(
      state,
      { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' },
      content
    )
    expect(after.rng).toEqual(state.rng)
    expect(after.log.at(-1)?.tone).toBe('bad')
  })
})

describe('previewCheck', () => {
  const state: GameState = {
    ...newGame(4, content),
    party: [
      makeCharacter({
        id: 'fighter',
        name: 'Brom',
        abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 },
      }),
      makeCharacter({
        id: 'bard',
        name: 'Lyra',
        abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
        skillProficiencies: ['persuasion'],
      }),
    ],
  }

  test('shows the best actor, their modifier and exact odds', () => {
    // CHA 16 (+3) + proficiency (+2) = +5. Vs DC 15 on one d20:
    // 1 crit fail; 2–6 fail (total < 12); 7–9 partial (12–14); 10–19 success; 20 crit success.
    expect(previewCheck(state, 'persuasion', 15, 'normal')).toEqual({
      actorId: 'bard',
      actorName: 'Lyra',
      modifier: 5,
      dc: 15,
      odds: {
        critFail: 1 / 20,
        fail: 5 / 20,
        partial: 3 / 20,
        success: 10 / 20,
        critSuccess: 1 / 20,
      },
    })
  })

  test('previews the same normalised DC that step rolls against', () => {
    const preview = previewCheck(state, 'persuasion', 12.4, 'normal')
    expect(preview?.dc).toBe(12)
    expect(preview?.odds).toEqual(tierOdds(5, 12, 'normal'))
    expect(previewCheck(state, 'persuasion', 99, 'normal')?.dc).toBe(40)
    expect(previewCheck(state, 'persuasion', Number.NaN, 'normal')?.dc).toBe(1)
  })

  test('takes an ability override, e.g. Intimidation (CHA)', () => {
    expect(previewCheck(state, 'intimidation', 13, 'normal')).toMatchObject({
      actorId: 'fighter',
      modifier: 3,
    })
    expect(previewCheck(state, 'intimidation', 13, 'normal', undefined, 'cha')).toMatchObject({
      actorId: 'bard',
      modifier: 3,
    })
  })

  test('honours an actor override', () => {
    const preview = previewCheck(state, 'persuasion', 15, 'normal', 'fighter')
    expect(preview).toMatchObject({ actorId: 'fighter', actorName: 'Brom', modifier: -1 })
  })
})
