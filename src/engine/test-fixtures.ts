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
        twist: {
          text: 'A trap!',
          effects: [
            { effect: 'gold', amount: -10 },
            { effect: 'hp', amount: -3, target: 'random' },
          ],
        },
      },
    },
    {
      id: 'careful',
      kind: 'fixed',
      label: 'Help carefully',
      outcome: {
        text: 'You help, warily.',
        effects: [{ effect: 'gold', amount: 4 }],
        twist: { text: 'You saw it coming.' },
      },
    },
    {
      id: 'read',
      kind: 'check',
      label: 'Read them',
      once: true,
      check: { skill: 'insight', dc: 'dc' },
      outcomes: {
        fail: {
          text: 'You cannot tell.',
          effects: [{ effect: 'nextCheckModifier', amount: -2 }],
          stay: true,
        },
        partial: { text: 'Something is off.', effects: [{ effect: 'revealTwist' }], stay: true },
        success: {
          text: '{actor} reads them.',
          effects: [{ effect: 'revealTwist' }, { effect: 'position', position: 'edge' }],
          stay: true,
        },
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
        success: {
          text: 'Their purse.',
          effects: [
            { effect: 'gold', amount: 12 },
            { effect: 'followUp', situation: 'grudge', after: 1 },
          ],
        },
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
        options: [
          { id: 'leave', kind: 'fixed', label: 'Leave', outcome: { text: 'You walk on.' } },
        ],
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
              fail: {
                text: '{actor} slips.',
                effects: [
                  { effect: 'hp', amount: -3, target: 'actor' },
                  { effect: 'position', position: 'exposed' },
                ],
                stay: true,
              },
              partial: {
                text: 'A scraped climb.',
                effects: [{ effect: 'hp', amount: -1, target: 'actor' }],
                goto: 'ledge',
              },
              success: {
                text: 'Up you go.',
                effects: [{ effect: 'position', position: 'edge' }],
                goto: 'ledge',
              },
            },
          },
          {
            id: 'around',
            kind: 'fixed',
            label: 'Go around',
            outcome: { text: 'A long detour.', effects: [{ effect: 'days', amount: 1 }] },
          },
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
              fail: {
                text: 'A bad fall.',
                effects: [{ effect: 'hp', amount: -6, target: 'actor' }],
              },
              partial: {
                text: 'You make it, bruised.',
                effects: [{ effect: 'hp', amount: -2, target: 'actor' }],
              },
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
            outcomes: {
              fail: { text: 'Beaten.', effects: [{ effect: 'hp', amount: -4, target: 'all' }] },
              partial: { text: 'A draw.' },
              success: { text: 'They flee.' },
            },
          },
          {
            id: 'pay',
            kind: 'fixed',
            label: 'Pay them back',
            requires: [{ req: 'gold', min: 5 }],
            outcome: { text: 'You pay.', effects: [{ effect: 'gold', amount: -5 }] },
          },
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
        options: [
          {
            id: 'watch',
            kind: 'fixed',
            label: 'Watch',
            outcome: { text: 'You watch.', effects: [{ effect: 'inspiration', amount: 1 }] },
          },
        ],
      },
    },
  },
]

/** A small twist table: ambush (weight 3), theft (weight 1, two stages) and one never drawn. */
const testTwists = [
  {
    id: 'ambush',
    name: 'Ambush',
    weight: 3,
    what: 'they were bait for {ambushers}',
    opening: [{ effect: 'hp', amount: -3, target: 'random' }],
    slots: { ambushers: { from: 'creature', types: ['humanoid'] } },
    stages: {
      start: {
        text: '{Ambushers} attack!',
        options: [
          {
            id: 'fight',
            kind: 'check',
            label: 'Fight',
            check: { skill: 'athletics', dc: 12, combat: true },
            outcomes: {
              fail: { text: 'Bloodied.', effects: [{ effect: 'hp', amount: -4, target: 'all' }] },
              partial: {
                text: 'Bruised.',
                effects: [{ effect: 'hp', amount: -2, target: 'actor' }],
              },
              success: { text: 'They flee.', effects: [{ effect: 'gold', amount: 5 }] },
            },
          },
          {
            id: 'flee',
            kind: 'fixed',
            label: 'Flee',
            outcome: { text: 'You run.', effects: [{ effect: 'days', amount: 1 }] },
          },
        ],
      },
    },
  },
  {
    id: 'theft',
    name: 'Theft',
    what: 'they meant to rob you',
    opening: [{ effect: 'gold', amount: -5 }],
    stages: {
      start: {
        text: 'They run off with a purse.',
        options: [
          {
            id: 'chase',
            kind: 'check',
            label: 'Chase',
            check: { skill: 'athletics', dc: 12 },
            outcomes: {
              fail: {
                text: 'Gone.',
                effects: [{ effect: 'exhaustion', amount: 1, target: 'actor' }],
              },
              partial: { text: 'You corner them.', goto: 'cornered' },
              success: { text: 'Caught.', effects: [{ effect: 'gold', amount: 5 }] },
            },
          },
          { id: 'let-go', kind: 'fixed', label: 'Let them go', outcome: { text: 'Gone.' } },
        ],
      },
      cornered: {
        text: 'Cornered, they draw a knife.',
        options: [
          {
            id: 'grab',
            kind: 'check',
            label: 'Grab the purse',
            check: { skill: 'athletics', dc: 10 },
            outcomes: {
              fail: { text: 'Cut.', effects: [{ effect: 'hp', amount: -2, target: 'actor' }] },
              partial: { text: 'Half of it.', effects: [{ effect: 'gold', amount: 2 }] },
              success: { text: 'All of it.', effects: [{ effect: 'gold', amount: 5 }] },
            },
          },
          { id: 'leave', kind: 'fixed', label: 'Leave it', outcome: { text: 'You leave.' } },
        ],
      },
    },
  },
  {
    id: 'never',
    name: 'Never',
    weight: 0,
    what: 'this is never drawn',
    opening: [{ effect: 'gold', amount: -1 }],
    stages: {
      start: {
        text: 'Never.',
        options: [
          { id: 'a', kind: 'fixed', label: 'A', outcome: { text: 'A.' } },
          {
            id: 'b',
            kind: 'fixed',
            label: 'B',
            outcome: { text: 'B.', effects: [{ effect: 'days', amount: 1 }] },
          },
        ],
      },
    },
  },
]

/** Someone in need whose twist comes from the twist table. Weight 0: only started on purpose. */
const stranger = {
  id: 'stranger',
  title: 'Stranger',
  weight: 0,
  twist: { chance: 0.5, what: 'they are not what they seem', table: true },
  stages: {
    start: {
      text: 'A stranger needs help.',
      options: [
        {
          id: 'trust',
          kind: 'fixed',
          label: 'Help them',
          outcome: {
            text: 'They pay you.',
            effects: [{ effect: 'gold', amount: 10 }],
            twist: {
              text: 'You walked right into it.',
              effects: [{ effect: 'position', position: 'exposed' }, { effect: 'openingHit' }],
              goto: '@twist',
            },
          },
        },
        {
          id: 'careful',
          kind: 'fixed',
          label: 'Help carefully',
          outcome: {
            text: 'They thank you.',
            effects: [{ effect: 'gold', amount: 4 }],
            twist: {
              text: 'You saw it coming.',
              effects: [
                { effect: 'position', position: 'normal' },
                { effect: 'position', position: 'edge', if: { cond: 'twistRevealed' } },
              ],
              goto: '@twist',
            },
          },
        },
        {
          id: 'read',
          kind: 'check',
          label: 'Read them',
          once: true,
          check: { skill: 'insight', dc: 10 },
          outcomes: {
            fail: {
              text: 'Misread.',
              effects: [{ effect: 'nextCheckModifier', amount: -2, reason: 'misread' }],
              stay: true,
            },
            partial: { text: 'Hm.', effects: [{ effect: 'revealTwist' }], stay: true },
            success: { text: 'Got it.', effects: [{ effect: 'revealTwist' }], stay: true },
            critSuccess: {
              text: 'Exactly.',
              effects: [{ effect: 'revealTwist', kind: true }],
              stay: true,
            },
          },
        },
        { id: 'leave', kind: 'fixed', label: 'Leave', outcome: { text: 'You walk on.' } },
      ],
    },
  },
}

const settlementType = (
  id: string,
  minPopulation: number,
  maxPopulation: number,
  maxServices: number,
  ratio: number
) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  category: id === 'fort' ? 'military' : 'lifeplace',
  minPopulation,
  maxPopulation,
  maxServices,
  ratio,
  hostileChance: 0.1,
  predominantAncestry: 'human',
})

const service = (id: string, name: string, presenceThresholdBySize: number[]) => ({
  id,
  name,
  presenceThresholdBySize,
  itemSaleTags: [],
  typicalRarity: 0,
  maxRarity: 0,
})

/**
 * A tiny world: Greenvale (plains) and Ashmoor (marsh) on the mainland, and Far Isle across the
 * sea. Greenvale 1 and Far Isle 1 have capital markers. Distances fit the 4.84 px/km scale.
 */
export const testWorld: Record<string, unknown> = {
  'data/original/settlement-types.json': {
    kind: 'settlementTypes',
    source: 'original',
    entries: [
      settlementType('hamlet', 50, 150, 4, 2.5),
      settlementType('village', 300, 1200, 6, 2),
      settlementType('town', 1000, 6000, 8, 1),
      settlementType('city', 4000, 15000, 10, 0.5),
      settlementType('capital', 12000, 50000, 12, 0.1),
      settlementType('fort', 200, 400, 4, 0.75),
    ],
  },
  'data/original/services.json': {
    kind: 'services',
    source: 'original',
    entries: [
      service('inn-tavern', 'Inn/Tavern', [10, 8, 6, 4, 2, 1]),
      service('port', 'Port', [19, 18, 16, 14, 12, 10]),
      service('magic-items', 'Magic items', [25, 22, 19, 16, 15, 14]),
    ],
  },
  'data/claude/regions.json': {
    kind: 'regions',
    source: 'claude',
    entries: [
      { id: 'greenvale', name: 'Greenvale', biome: 'plains', label: { x: 1150, y: 950 } },
      { id: 'ashmoor', name: 'Ashmoor', biome: 'marsh', label: { x: 1300, y: 1350 } },
      { id: 'farisle', name: 'Far Isle', biome: 'forest', label: { x: 2000, y: 1250 } },
    ],
  },
  'data/claude/settlements.json': {
    kind: 'settlements',
    source: 'claude',
    entries: [
      {
        id: 'greenvale-1',
        at: { x: 1000, y: 1000 },
        region: 'greenvale',
        island: 'mainland',
        capital: true,
        coastal: true,
      },
      { id: 'greenvale-2', at: { x: 1300, y: 1000 }, region: 'greenvale', island: 'mainland' },
      {
        id: 'ashmoor-1',
        at: { x: 1300, y: 1300 },
        region: 'ashmoor',
        island: 'mainland',
        coastal: true,
      },
      {
        id: 'farisle-1',
        at: { x: 2000, y: 1300 },
        region: 'farisle',
        island: 'farisle',
        capital: true,
        coastal: true,
      },
    ],
  },
  'data/claude/routes.json': {
    kind: 'routes',
    source: 'claude',
    entries: [
      {
        id: 'greenvale-1-greenvale-2',
        from: 'greenvale-1',
        to: 'greenvale-2',
        km: 75,
        terrain: 'plains',
        danger: 0,
      },
      {
        id: 'ashmoor-1-greenvale-2',
        from: 'greenvale-2',
        to: 'ashmoor-1',
        km: 75,
        terrain: 'marsh',
        danger: 2,
      },
      {
        id: 'ashmoor-1-greenvale-1',
        from: 'greenvale-1',
        to: 'ashmoor-1',
        km: 105,
        terrain: 'forest',
        danger: 1,
      },
      {
        id: 'ashmoor-1-farisle-1',
        from: 'ashmoor-1',
        to: 'farisle-1',
        km: 160,
        terrain: 'sea',
        danger: 1,
      },
    ],
  },
  'data/original/towns.json': {
    kind: 'towns',
    source: 'original',
    entries: [
      {
        id: 'harbourne',
        name: 'Harbourne',
        description: 'rich seaside town',
        alignment: 'LN',
        size: 'town',
        biomes: ['plains'],
        coastal: true,
        wealth: 2,
        banner: 'town maps/Harbourne - rich seaside town - LN.jpg',
      },
      {
        id: 'mirefold',
        name: 'Mirefold',
        description: 'poor marsh village',
        size: 'village',
        biomes: ['marsh'],
        wealth: -2,
      },
    ],
  },
  'data/original/place-names.json': {
    kind: 'placeNames',
    source: 'original',
    entries: [
      {
        id: 'test-compound',
        style: 'english',
        first: ['raven', 'stone', 'ash'],
        second: ['ford', 'hold', 'stone'],
      },
    ],
  },
  'data/claude/threats.json': {
    kind: 'threats',
    source: 'claude',
    entries: [
      {
        id: 'orc-warband',
        name: 'Orc warband',
        description: 'Raiders.',
        biomes: ['hills', 'mountains'],
        strength: { min: 2, max: 4 },
      },
      {
        id: 'bog-cult',
        name: 'Bog cult',
        description: 'Drowners.',
        biomes: ['marsh'],
        strength: { min: 1, max: 3 },
      },
      { id: 'bandits', name: 'Bandits', description: 'Thieves.', strength: { min: 1, max: 2 } },
    ],
  },
  'data/claude/world-parts.json': {
    kind: 'partsTables',
    source: 'claude',
    entries: [
      {
        id: 'realm-name',
        description: 'Realm names',
        rows: [{ text: 'Kingdom of {place}' }, { text: '{Place} Marches' }],
      },
    ],
  },
}

export function fixtureContent(): Content {
  const { content, errors } = buildContent({
    'data/original/classes.json': {
      kind: 'classes',
      source: 'original',
      entries: [
        {
          id: 'fighter',
          name: 'Fighter',
          hitDie: 10,
          baseAbilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 },
          skillProficiencies: ['athletics', 'intimidation'],
        },
        {
          id: 'bard',
          name: 'Bard',
          hitDie: 8,
          baseAbilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
          skillProficiencies: ['persuasion', 'performance'],
        },
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
      entries: [
        { id: 'test-names', ancestries: ['human'], given: ['Ada', 'Bram'], family: ['Stone'] },
      ],
    },
    'data/procedural/parts.json': {
      kind: 'partsTables',
      source: 'procedural',
      entries: [
        { id: 'who', description: 'A stranger', rows: [{ text: '{who-attitude} {who-job}' }] },
        {
          id: 'who-attitude',
          description: 'Attitude',
          rows: [{ text: 'a wary' }, { text: 'an angry', weight: 0 }],
        },
        { id: 'who-job', description: 'Job', rows: [{ text: 'tinker' }, { text: 'pilgrim' }] },
        { id: 'stakes', description: 'Stakes', rows: [{ text: 'A child waits at home.' }] },
      ],
    },
    'data/imported/creatures.json': {
      kind: 'creatures',
      source: 'imported',
      entries: [
        {
          id: 'wolf',
          name: 'Wolf',
          group: 'a pack of wolves',
          type: 'beast',
          cr: 0.25,
          description: 'Hungry.',
        },
        {
          id: 'bandit',
          name: 'Bandit',
          group: 'a band of bandits',
          type: 'humanoid',
          cr: 0.125,
          description: 'Armed.',
        },
        {
          id: 'ogre',
          name: 'Ogre',
          group: 'an ogre and its cronies',
          type: 'giant',
          cr: 2,
          description: 'Big.',
        },
      ],
    },
    'data/claude/archetypes.json': { kind: 'archetypes', source: 'claude', entries: [testNeed] },
    'data/original/situations.json': {
      kind: 'situations',
      source: 'original',
      entries: testSituations,
    },
    'data/procedural/twists.json': { kind: 'twists', source: 'procedural', entries: testTwists },
    'data/claude/situations.json': { kind: 'situations', source: 'claude', entries: [stranger] },
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
    ...testWorld,
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
    strain: {},
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
    situation: SituationSchema.parse({
      id: 'test-road',
      title: 'Test road',
      stages: { start: { text: 'A road.' } },
    }),
    source: 'original',
    stage: 'start',
    position: 'normal',
    slots: {},
    twist: false,
    twistRevealed: false,
    twistKind: null,
    twistKindRevealed: false,
    nextCheckModifier: 0,
    nextCheckReason: null,
    used: [],
    log: [],
    ...overrides,
  }
}
