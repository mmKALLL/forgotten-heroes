import { buildContent, type Content } from '../content/build'
import { SituationSchema } from '../schema/encounter'
import type { Character, EncounterState, GameState } from '../schema/state'
import { newGame } from './state'

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
    'data/procedural/parts.json': {
      kind: 'partsTables',
      source: 'procedural',
      entries: [
        { id: 'who', description: 'A stranger', rows: [{ text: '{who-attitude} {who-job}' }] },
        { id: 'who-attitude', description: 'Attitude', rows: [{ text: 'a wary' }, { text: 'an angry', weight: 0 }] },
        { id: 'who-job', description: 'Job', rows: [{ text: 'tinker' }, { text: 'pilgrim' }] },
        { id: 'stakes', description: 'Stakes', rows: [{ text: 'A child waits at home.' }] },
      ],
    },
    'data/imported/creatures.json': {
      kind: 'creatures',
      source: 'imported',
      entries: [
        { id: 'wolf', name: 'Wolf', group: 'a pack of wolves', type: 'beast', cr: 0.25, description: 'Hungry.' },
        { id: 'bandit', name: 'Bandit', group: 'a band of bandits', type: 'humanoid', cr: 0.125, description: 'Armed.' },
        { id: 'ogre', name: 'Ogre', group: 'an ogre and its cronies', type: 'giant', cr: 2, description: 'Big.' },
      ],
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

/** A fighter and a bard with known stats, for encounter tests. */
export const brom = makeCharacter({
  id: 'brom',
  name: 'Brom',
  abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 },
  skillProficiencies: ['athletics', 'intimidation'],
  hp: 20,
  maxHp: 20,
})
export const lyra = makeCharacter({
  id: 'lyra',
  name: 'Lyra',
  classId: 'bard',
  abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
  skillProficiencies: ['persuasion', 'deception', 'insight'],
  hp: 16,
  maxHp: 16,
})

export function makeState(overrides: Partial<GameState> = {}): GameState {
  return { ...newGame(1, fixtureContent()), party: [brom, lyra], gold: 20, ...overrides }
}

export function makeEncounter(overrides: Partial<EncounterState> = {}): EncounterState {
  return {
    situation: SituationSchema.parse({ id: 'test-road', title: 'Test road', stages: { start: { text: 'A road.' } } }),
    source: 'original',
    stage: 'start',
    position: 'normal',
    slots: {},
    twist: false,
    twistRevealed: false,
    nextCheckModifier: 0,
    used: [],
    log: [],
    ...overrides,
  }
}
