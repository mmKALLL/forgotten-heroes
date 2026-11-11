import { buildContent, type Content } from '../content/build'
import { SituationSchema } from '../schema/encounter'
import type { Character, EncounterState, GameState } from '../schema/state'
import { newGame } from './state'

/** A small someone-in-need archetype. Gold amounts scale with `reward`, "dc" DCs with `dc`. */
const testNeed = {
  id: 'test-need',
  name: 'Test need',
  description: 'Someone asks for help.',
  options: [
    {
      id: 'trust',
      kind: 'fixed',
      label: 'Help them',
      outcome: {
        text: '{Who} thanks you.',
        effects: [{ effect: 'gold', amount: 10 }],
        twist: { text: 'A trap!', effects: [{ effect: 'gold', amount: -10 }, { effect: 'hp', amount: -3, target: 'random' }] },
      },
    },
    {
      id: 'careful',
      kind: 'fixed',
      label: 'Help carefully',
      outcome: { text: 'You help, warily.', effects: [{ effect: 'gold', amount: 4 }], twist: { text: 'You saw it coming.' } },
    },
    {
      id: 'read',
      kind: 'check',
      label: 'Read them',
      once: true,
      check: { skill: 'insight', dc: 'dc' },
      outcomes: {
        fail: { text: 'You cannot tell.', stay: true },
        partial: { text: 'Something is off.', effects: [{ effect: 'revealTwist' }], stay: true },
        success: { text: '{actor} reads them.', effects: [{ effect: 'revealTwist' }, { effect: 'position', position: 'edge' }], stay: true },
      },
    },
    {
      id: 'rob',
      kind: 'check',
      label: 'Rob them',
      check: { skill: 'deception', dc: 'dc+2' },
      outcomes: {
        critFail: { text: 'Caught!', effects: [{ effect: 'hp', amount: -4, target: 'actor' }] },
        fail: { text: 'They run.' },
        partial: { text: 'A few coins.', effects: [{ effect: 'gold', amount: 3 }] },
        success: { text: 'Their purse.', effects: [{ effect: 'gold', amount: 12 }, { effect: 'followUp', situation: 'grudge', after: 1 }] },
      },
    },
    {
      id: 'donate',
      kind: 'fixed',
      label: 'Give them money',
      requires: [{ req: 'gold', min: 10 }],
      outcome: { text: 'You give.', effects: [{ effect: 'gold', amount: -10 }] },
    },
  ],
}

const testSituations = [
  {
    id: 'roadside',
    title: 'Roadside',
    slots: { who: { from: 'table', table: 'who' }, stakes: { from: 'table', table: 'stakes' } },
    twist: { chance: 0.5, what: 'it is a trap' },
    stages: {
      start: {
        text: '{Who} begs for help. {stakes}',
        archetype: { id: 'test-need', dc: 12, reward: 2 },
        options: [{ id: 'leave', kind: 'fixed', label: 'Leave', outcome: { text: 'You walk on.' } }],
      },
    },
  },
  {
    id: 'cliff',
    title: 'Cliff',
    stages: {
      start: {
        text: 'A cliff blocks the way.',
        options: [
          {
            id: 'climb',
            kind: 'check',
            label: 'Climb',
            check: { skill: 'athletics', dc: 12 },
            outcomes: {
              fail: { text: '{actor} slips.', effects: [{ effect: 'hp', amount: -3, target: 'actor' }, { effect: 'position', position: 'exposed' }], stay: true },
              partial: { text: 'A scraped climb.', effects: [{ effect: 'hp', amount: -1, target: 'actor' }], goto: 'ledge' },
              success: { text: 'Up you go.', effects: [{ effect: 'position', position: 'edge' }], goto: 'ledge' },
            },
          },
          { id: 'around', kind: 'fixed', label: 'Go around', outcome: { text: 'A long detour.', effects: [{ effect: 'days', amount: 1 }] } },
        ],
      },
      ledge: {
        text: 'A gap yawns on the ledge.',
        options: [
          {
            id: 'jump',
            kind: 'check',
            label: 'Jump',
            check: { skill: 'acrobatics', dc: 14 },
            outcomes: {
              fail: { text: 'A bad fall.', effects: [{ effect: 'hp', amount: -6, target: 'actor' }] },
              partial: { text: 'You make it, bruised.', effects: [{ effect: 'hp', amount: -2, target: 'actor' }] },
              success: { text: 'You find a cache.', effects: [{ effect: 'gold', amount: 15 }] },
            },
          },
          { id: 'back', kind: 'fixed', label: 'Climb back down', outcome: { text: 'Back down.' } },
        ],
      },
    },
  },
  {
    id: 'grudge',
    title: 'Grudge',
    followUpOnly: true,
    stages: {
      start: {
        text: 'The people you robbed are back.',
        options: [
          {
            id: 'fight',
            kind: 'check',
            label: 'Fight',
            check: { skill: 'athletics', dc: 13, combat: true },
            outcomes: { fail: { text: 'Beaten.', effects: [{ effect: 'hp', amount: -4, target: 'all' }] }, partial: { text: 'A draw.' }, success: { text: 'They flee.' } },
          },
          { id: 'pay', kind: 'fixed', label: 'Pay them back', requires: [{ req: 'gold', min: 5 }], outcome: { text: 'You pay.', effects: [{ effect: 'gold', amount: -5 }] } },
        ],
      },
    },
  },
  {
    id: 'starfall',
    title: 'Starfall',
    wonder: true,
    weight: 0.5,
    stages: {
      start: {
        text: 'Stars fall over the hills.',
        options: [{ id: 'watch', kind: 'fixed', label: 'Watch', outcome: { text: 'You watch.', effects: [{ effect: 'inspiration', amount: 1 }] } }],
      },
    },
  },
]

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
    'data/claude/archetypes.json': { kind: 'archetypes', source: 'claude', entries: [testNeed] },
    'data/original/situations.json': { kind: 'situations', source: 'original', entries: testSituations },
    'data/procedural/templates.json': {
      kind: 'situationTemplates',
      source: 'procedural',
      entries: [
        {
          id: 'plea',
          title: 'Plea',
          text: '{Who} needs help.',
          slots: { who: { from: 'table', table: 'who' } },
          archetype: { id: 'test-need' },
          twist: { chance: 0.2, what: 'it is a trap' },
        },
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
