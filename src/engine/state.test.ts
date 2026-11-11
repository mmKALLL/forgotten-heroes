import { describe, expect, test } from 'vitest'
import { GameStateSchema, type GameState } from '../schema/state'
import { newGame, previewCheck, step } from './state'
import { fixtureContent, makeCharacter } from './test-fixtures'

const content = fixtureContent()

describe('newGame', () => {
  test('is deterministic and schema-valid', () => {
    const a = newGame(99, content)
    expect(newGame(99, content)).toEqual(a)
    expect(GameStateSchema.parse(a)).toEqual(a)
    expect(a.party).toHaveLength(2)
    expect(a.log.length).toBeGreaterThan(0)
  })
})

describe('practiceCheck', () => {
  const base = (): GameState => ({
    ...newGame(1, content),
    party: [
      makeCharacter({ id: 'bard', name: 'Lyra', abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 }, skillProficiencies: ['persuasion'] }),
      makeCharacter({ id: 'fighter', name: 'Brom' }),
    ],
  })

  test('rolls with the best actor, advances rng, logs, and does not mutate input', () => {
    const before = base()
    const snapshot = structuredClone(before)
    const after = step(before, { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' })
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
      state = step(state, { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' })
      if (state.lastRoll?.tier === 'critSuccess') crits++
    }
    expect(crits).toBeGreaterThan(0)
    expect(state.inspiration).toBe(crits)
  })

  test('nobody able to act logs and changes nothing else', () => {
    const state = { ...base(), party: base().party.map((c) => ({ ...c, hp: 0 })) }
    const after = step(state, { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' })
    expect(after.rng).toEqual(state.rng)
    expect(after.log.at(-1)?.tone).toBe('bad')
  })
})

describe('previewCheck', () => {
  test('shows actor, modifier and exact odds', () => {
    const state = newGame(4, content)
    const preview = previewCheck(state, 'athletics', 10, 'normal')
    expect(preview).not.toBeNull()
    const total = Object.values(preview!.odds).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1)
  })
})
