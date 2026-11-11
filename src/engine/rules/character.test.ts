import { describe, expect, test } from 'vitest'
import { makeCharacter } from '../test-fixtures'
import { canAct, chooseActor, rankActors, statModifier } from './character'

const bard = makeCharacter({
  id: 'bard',
  abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
  skillProficiencies: ['persuasion'],
})
const fighter = makeCharacter({
  id: 'fighter',
  abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 },
  skillProficiencies: ['athletics', 'intimidation'],
})

describe('statModifier', () => {
  test('ability modifier plus proficiency when proficient', () => {
    expect(statModifier(bard, 'persuasion')).toBe(5) // +3 CHA, +2 proficiency
    expect(statModifier(fighter, 'persuasion')).toBe(-1)
    expect(statModifier(fighter, 'str')).toBe(3) // raw ability: no proficiency
  })
  test('each exhaustion level costs 2', () => {
    expect(statModifier({ ...bard, exhaustion: 2 }, 'persuasion')).toBe(1)
  })
})

describe('actor selection', () => {
  test('the best-suited member acts', () => {
    expect(chooseActor([fighter, bard], 'persuasion')?.characterId).toBe('bard')
    expect(chooseActor([fighter, bard], 'athletics')?.characterId).toBe('fighter')
  })
  test('conditions can change who is best', () => {
    const tired = { ...bard, exhaustion: 4 }
    expect(chooseActor([fighter, tired], 'persuasion')?.characterId).toBe('fighter')
  })
  test('downed members cannot act', () => {
    const downed = { ...bard, hp: 0 }
    expect(canAct(downed)).toBe(false)
    expect(rankActors([fighter, downed], 'persuasion').map((r) => r.characterId)).toEqual(['fighter'])
  })
  test('ties go to the higher raw ability score, then party order', () => {
    const a = makeCharacter({ id: 'a', abilities: { ...bard.abilities, cha: 16 }, skillProficiencies: [] })
    const b = makeCharacter({ id: 'b', abilities: { ...bard.abilities, cha: 17 }, skillProficiencies: [] })
    expect(chooseActor([a, b], 'persuasion')?.characterId).toBe('b') // both +3
    expect(chooseActor([a, { ...a, id: 'a2' }], 'persuasion')?.characterId).toBe('a')
  })
  test('the player can override the choice', () => {
    expect(chooseActor([fighter, bard], 'persuasion', 'fighter')?.characterId).toBe('fighter')
  })
  test('an override pointing at a downed member falls back to the best', () => {
    const downed = { ...fighter, hp: 0 }
    expect(chooseActor([downed, bard], 'persuasion', 'fighter')?.characterId).toBe('bard')
  })
  test('nobody able to act gives null', () => {
    expect(chooseActor([{ ...bard, hp: 0 }], 'persuasion')).toBeNull()
  })
})
