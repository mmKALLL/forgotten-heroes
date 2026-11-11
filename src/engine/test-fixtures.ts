import { buildContent, type Content } from '../content/build'
import type { Character } from '../schema/state'

export function fixtureContent(): Content {
  const { content, errors } = buildContent({
    'data/original/classes.json': {
      kind: 'classes',
      source: 'original',
      entries: [
        { id: 'fighter', name: 'Fighter', hitDie: 10, baseAbilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 }, skillProficiencies: ['athletics', 'intimidation'] },
        { id: 'bard', name: 'Bard', hitDie: 8, baseAbilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 }, skillProficiencies: ['persuasion', 'performance'] },
      ],
    },
    'data/original/ancestries.json': {
      kind: 'ancestries',
      source: 'original',
      entries: [
        { id: 'human', name: 'Human', playable: true },
        { id: 'dwarf', name: 'Dwarf', playable: true },
        { id: 'drake', name: 'Drake', playable: false },
      ],
    },
    'data/original/names.json': {
      kind: 'names',
      source: 'original',
      entries: [{ id: 'test-names', ancestries: ['human'], given: ['Ada', 'Bram'], family: ['Stone'] }],
    },
  })
  if (errors.length > 0) throw new Error(JSON.stringify(errors, null, 2))
  return content
}

export function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c-test',
    name: 'Test Hero',
    ancestry: 'human',
    classId: 'fighter',
    level: 1,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    skillProficiencies: [],
    hitDie: 10,
    hp: 10,
    maxHp: 10,
    exhaustion: 0,
    ...overrides,
  }
}
