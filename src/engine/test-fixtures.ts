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
    disposition: 'neutral',
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
    disposition: 'neutral',
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
    disposition: 'hostile',
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
    disposition: 'pleasant',
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
            outcome: { text: 'You watch.' },
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
  disposition: 'neutral',
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
/** One site situation per fixture POI type: only played at a point of interest. */
const testSites = [
  {
    id: 'orc-war-camp-raid',
    title: 'War camp',
    disposition: 'hostile',
    site: true,
    stages: {
      start: {
        text: 'Orc tents ring a smoking fire.',
        options: [
          {
            id: 'sneak',
            kind: 'check',
            label: 'Slip in after dark',
            check: { skill: 'stealth', dc: 14 },
            outcomes: {
              fail: { text: 'Spotted.', effects: [{ effect: 'hp', amount: -3, target: 'all' }] },
              partial: {
                text: 'You get out with a little.',
                effects: [{ effect: 'gold', amount: 5 }],
              },
              success: {
                text: 'You loot the chief’s tent.',
                effects: [{ effect: 'gold', amount: 20 }],
              },
            },
          },
          { id: 'leave', kind: 'fixed', label: 'Leave it be', outcome: { text: 'You withdraw.' } },
        ],
      },
    },
  },
  {
    id: 'herbalist-visit',
    title: 'The herbalist',
    disposition: 'neutral',
    site: true,
    stages: {
      start: {
        text: 'An old woman sorts roots by her door.',
        options: [
          {
            id: 'buy',
            kind: 'fixed',
            label: 'Buy a poultice',
            requires: [{ req: 'gold', min: 5 }],
            outcome: {
              text: 'It stings, then soothes.',
              effects: [
                { effect: 'gold', amount: -5 },
                { effect: 'hp', amount: 4, target: 'all' },
              ],
            },
          },
          {
            id: 'talk',
            kind: 'fixed',
            label: 'Pass the time',
            outcome: { text: 'She talks of rain.' },
          },
        ],
      },
    },
  },
  {
    id: 'singing-stones',
    title: 'Singing stones',
    disposition: 'pleasant',
    wonder: true,
    site: true,
    stages: {
      start: {
        text: 'The wind hums through a ring of stones.',
        options: [
          {
            id: 'listen',
            kind: 'fixed',
            label: 'Listen',
            outcome: { text: 'You listen.' },
          },
        ],
      },
    },
  },
]

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
      service('adventuring-supplies', 'Adventuring supplies', [12, 10, 8, 6, 4, 2]),
      service('animals-mounts', 'Animals & mounts', [14, 12, 10, 8, 6, 4]),
      service('jewelry-trader', 'Jewelry trader', [22, 20, 18, 15, 12, 10]),
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
  'data/claude/land-spots.json': {
    kind: 'landSpots',
    source: 'claude',
    notes:
      '12 spots on the mainland, around greenvale-1, greenvale-2 and ashmoor-1; 4 on Far Isle.',
    entries: [
      { id: 'spot-0001', at: { x: 950, y: 950 }, island: 'mainland' },
      { id: 'spot-0002', at: { x: 1050, y: 1050 }, island: 'mainland', terrain: 'hills' },
      { id: 'spot-0003', at: { x: 1100, y: 950 }, island: 'mainland' },
      { id: 'spot-0004', at: { x: 1150, y: 1050 }, island: 'mainland', terrain: 'forest' },
      { id: 'spot-0005', at: { x: 1250, y: 950 }, island: 'mainland', terrain: 'hills' },
      { id: 'spot-0006', at: { x: 1350, y: 1050 }, island: 'mainland' },
      { id: 'spot-0007', at: { x: 1200, y: 1150 }, island: 'mainland' },
      { id: 'spot-0008', at: { x: 1250, y: 1250 }, island: 'mainland', terrain: 'marsh' },
      { id: 'spot-0009', at: { x: 1350, y: 1250 }, island: 'mainland' },
      { id: 'spot-0010', at: { x: 1350, y: 1350 }, island: 'mainland', terrain: 'forest' },
      { id: 'spot-0011', at: { x: 1100, y: 1250 }, island: 'mainland', terrain: 'hills' },
      { id: 'spot-0012', at: { x: 1000, y: 1150 }, island: 'mainland' },
      { id: 'spot-0013', at: { x: 1950, y: 1250 }, island: 'farisle' },
      { id: 'spot-0014', at: { x: 2050, y: 1250 }, island: 'farisle', terrain: 'hills' },
      { id: 'spot-0015', at: { x: 2050, y: 1350 }, island: 'farisle' },
      { id: 'spot-0016', at: { x: 1950, y: 1350 }, island: 'farisle', terrain: 'jungle' },
    ],
  },
  'data/procedural/poi-types.json': {
    kind: 'poiTypes',
    source: 'procedural',
    entries: [
      {
        id: 'orc-war-camp',
        category: 'lair',
        name: 'War camp',
        weight: 2,
        biomes: ['hills'],
        threats: ['orc-warband', 'bandits'],
        hostile: true,
        threat: { min: 1, max: 2 },
        pathDanger: 2,
        names: 'poi-name-camp',
        situations: ['orc-war-camp-raid'],
        icon: 'campfire',
      },
      {
        id: 'herbalist-hut',
        category: 'expert',
        name: 'Herbalist',
        biomes: ['forest', 'marsh'],
        water: true,
        names: 'poi-name-hut',
        situations: ['herbalist-visit'],
      },
      {
        id: 'singing-stones',
        category: 'wonder',
        name: 'Singing stones',
        weight: 0.5,
        pathDanger: 0,
        names: 'poi-name-stones',
        situations: ['singing-stones'],
      },
    ],
  },
  'data/procedural/poi-names.json': {
    kind: 'partsTables',
    source: 'procedural',
    entries: [
      { id: 'poi-name-camp', description: 'War camps', rows: [{ text: 'Redtusk camp' }] },
      { id: 'poi-name-hut', description: 'Hermit huts', rows: [{ text: 'Old Wen’s hut' }] },
      { id: 'poi-name-stones', description: 'Stone circles', rows: [{ text: 'The Hum' }] },
    ],
  },
  'data/claude/poi-situations.json': {
    kind: 'situations',
    source: 'claude',
    entries: testSites,
  },
}

const good = (id: string, unit: string, weight: number, price: number, spoilPerDay = 0) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  unit,
  weight,
  price,
  spoilPerDay,
  uses: `Test ${id}.`,
})

/**
 * Plan 4 content with round numbers (weights in kg): the 15 goods, four service roles, three
 * market rules, four producer rules, a mule, a cart and a riding horse, three person roles and one contract
 * template per kind.
 */
export const testEconomy: Record<string, unknown> = {
  'data/claude/goods.json': {
    kind: 'goods',
    source: 'claude',
    entries: [
      // Food doesn't spoil here, so travel tests count rations exactly (spoilage tests set it).
      good('food', 'ration', 1, 1),
      good('water', 'day', 2, 0),
      good('fuel', 'bundle', 5, 1),
      good('healing', 'kit', 1, 10),
      good('alchemicals', 'flask', 1, 20),
      good('arcana', 'bundle', 1, 50),
      good('arms', 'bundle', 5, 10),
      good('armour', 'set', 10, 20),
      good('gear', 'pack', 5, 5),
      good('timber', 'load', 20, 2),
      good('stone', 'load', 50, 2),
      good('metal', 'ingot', 20, 10),
      good('gems', 'pouch', 1, 100),
      good('relics', 'crate', 2, 100),
      good('luxuries', 'bolt', 5, 50),
    ],
  },
  'data/claude/service-roles.json': {
    kind: 'serviceRoles',
    source: 'claude',
    entries: [
      {
        id: 'inn-tavern',
        function: 'rest',
        actions: ['lodging', 'rumours', 'board', 'recruit', 'accessories'],
        // Plan 5a: an inn that also hires out and sells trinkets, so one service covers both.
        recruits: { offers: [1, 2], levels: [1, 3] },
        accessories: { offers: [1, 2], maxTier: 2 },
      },
      {
        id: 'adventuring-supplies',
        function: 'trade',
        trades: ['food', 'fuel', 'gear'],
        actions: ['market'],
      },
      { id: 'animals-mounts', function: 'hire', actions: ['animals'] },
      {
        id: 'jewelry-trader',
        function: 'trade',
        trades: ['gems', 'luxuries'],
        buysOnly: ['relics'],
        actions: ['market'],
        specialty: 'Loupes and quiet voices.',
      },
    ],
  },
  'data/claude/market-rules.json': {
    kind: 'marketRules',
    source: 'claude',
    entries: [
      { id: 'coast', label: 'Shipwrights', when: { coastal: true }, demand: { timber: 1 } },
      {
        id: 'under-threat',
        label: 'Raids',
        when: { threatAtLeast: 2 },
        demand: { arms: 2, armour: 1 },
      },
      { id: 'marsh', label: 'Soft ground', when: { biomes: ['marsh'] }, demand: { stone: 1 } },
    ],
  },
  'data/claude/producers.json': {
    kind: 'producers',
    source: 'claude',
    entries: [
      { id: 'fishing', label: 'Fishing boats', when: { coastal: true }, output: { food: 1 } },
      {
        id: 'herbs',
        label: 'Herb-gatherers',
        when: { biomes: ['marsh'] },
        output: { alchemicals: 2, healing: 1 },
      },
      { id: 'woods', label: 'Sawmills', when: { biomes: ['forest'] }, output: { timber: 3 } },
      {
        id: 'workshops',
        label: 'Workshops',
        when: { minSize: 4 },
        output: {
          fuel: 1,
          arcana: 1,
          arms: 1,
          armour: 1,
          gear: 1,
          stone: 1,
          metal: 1,
          gems: 1,
          relics: 1,
          luxuries: 1,
        },
      },
    ],
  },
  'data/claude/animals.json': {
    kind: 'animals',
    source: 'claude',
    entries: [
      { id: 'mule', name: 'Mule', price: 10, capacity: 100, upkeepPerDay: 1, stealable: true },
      {
        id: 'cart',
        name: 'Cart',
        price: 20,
        capacity: 200,
        needs: 'mule',
        roadsOnly: true,
        waterPerDay: 0,
      },
      {
        id: 'riding-horse',
        name: 'Riding horse',
        price: 80,
        hirePerDay: 1,
        capacity: 50,
        speed: 2,
        rider: true,
        maxPathDanger: 1,
        upkeepPerDay: 1,
        stealable: true,
      },
    ],
  },
  'data/claude/person-roles.json': {
    kind: 'personRoles',
    source: 'claude',
    entries: [
      { id: 'innkeeper', name: 'innkeeper', service: 'inn-tavern', weight: 3, titles: ['Old'] },
      { id: 'stablemaster', name: 'stablemaster', service: 'animals-mounts', minSize: 1 },
      { id: 'elder', name: 'elder', weight: 2, titles: ['Mother', 'Father'] },
    ],
  },
  'data/claude/contracts.json': {
    kind: 'contracts',
    source: 'claude',
    entries: [
      {
        id: 'carry-cloth',
        kind: 'courier',
        title: 'Cloth for {dest}',
        text: '{patron} needs {amount} {good} taken to {dest}.',
        km: { min: 40, max: 200 },
        goods: ['luxuries'],
        amount: { min: 2, max: 4 },
        urgentChance: 0.25,
        reputation: { patron: 6, settlement: 3 },
      },
      {
        id: 'bring-timber',
        kind: 'procurement',
        title: '{good} wanted',
        text: '{patron} will pay for {amount} {good}; {source} makes it.',
        km: { min: 0, max: 400 },
        goods: ['timber', 'stone'],
        amount: { min: 2, max: 5 },
        urgentChance: 0,
        reputation: { patron: 4, settlement: 2 },
      },
      {
        id: 'haul-fish',
        kind: 'freight',
        title: 'Salt fish for {dest}',
        text: '{patron} hands over {amount} {good} for the market in {dest}.',
        km: { min: 0, max: 200 },
        goods: ['food'],
        amount: { min: 6, max: 10 },
        urgentChance: 0,
        reputation: { patron: 3, settlement: 1 },
      },
      {
        id: 'see-pilgrim',
        kind: 'escort',
        title: 'A pilgrim to {dest}',
        text: '{patron} asks you to see a pilgrim safely to {dest}.',
        km: { min: 40, max: 150 },
        passengers: { min: 1, max: 1 },
        urgentChance: 0,
        pay: 1.5,
        reputation: { patron: 5, settlement: 3 },
      },
      {
        id: 'camp-bounty',
        kind: 'bounty',
        title: 'Bounty on {site}',
        text: '{patron} pays for clearing {site}.',
        minSize: 2,
        minStanding: 'known',
        km: { min: 0, max: 100 },
        poiCategories: ['lair'],
        urgentChance: 0,
        reputation: { patron: 8, settlement: 6 },
      },
      {
        id: 'visit-stones',
        kind: 'errand',
        title: 'A rubbing from {site}',
        text: '{patron} wants a rubbing of the carvings at {site}.',
        service: 'inn-tavern',
        km: { min: 0, max: 100 },
        poiCategories: ['landmark'],
        urgentChance: 0.5,
        reputation: { patron: 3, settlement: 1 },
      },
    ],
  },
}

/**
 * Plan 5a content: two accessory bases and six affixes (a skill, carry, strainFade, lucky,
 * sellBonus and ward hook), and three gather rules (timber in forest, stone in hills, healing
 * herbs in marsh).
 */
export const testProgression: Record<string, unknown> = {
  'data/procedural/accessories.json': {
    kind: 'accessoryParts',
    source: 'procedural',
    entries: [
      { id: 'ring', part: 'base', name: 'Ring', value: 10 },
      { id: 'cloak', part: 'base', name: 'Cloak', value: 20 },
      {
        id: 'fox-eyed',
        part: 'prefix',
        name: 'Fox-eyed',
        value: 30,
        hook: { hook: 'skill', skill: 'perception', amount: 1 },
      },
      {
        id: 'of-the-mule',
        part: 'suffix',
        name: 'of the Mule',
        value: 30,
        hook: { hook: 'carry', kg: 5 },
        bases: ['cloak'],
      },
      {
        id: 'tireless',
        part: 'prefix',
        name: 'Tireless',
        minTier: 2,
        value: 100,
        hook: { hook: 'strainFade' },
      },
      {
        id: 'of-fortune',
        part: 'suffix',
        name: 'of Fortune',
        minTier: 2,
        value: 120,
        hook: { hook: 'lucky' },
      },
      {
        id: 'haggler',
        part: 'prefix',
        name: "Haggler's",
        value: 40,
        hook: { hook: 'sellBonus', category: 'precious', share: 0.1 },
      },
      {
        id: 'of-warding',
        part: 'suffix',
        name: 'of Warding',
        value: 40,
        hook: { hook: 'ward', share: 0.03 },
      },
    ],
  },
  'data/claude/gathering.json': {
    kind: 'gatherRules',
    source: 'claude',
    entries: [
      {
        id: 'cut-timber',
        good: 'timber',
        label: 'Cut timber',
        biomes: ['forest'],
        skill: 'athletics',
        dc: 10,
        yield: { critFail: 0, fail: 0, partial: 1, success: 2, critSuccess: 3 },
      },
      {
        id: 'quarry-stone',
        good: 'stone',
        label: 'Quarry stone',
        biomes: ['hills'],
        skill: 'athletics',
        dc: 12,
        yield: { critFail: 0, fail: 0, partial: 1, success: 2, critSuccess: 3 },
      },
      {
        id: 'healing-herbs',
        good: 'healing',
        label: 'Gather healing herbs',
        biomes: ['marsh'],
        skill: 'medicine',
        dc: 14,
        yield: { critFail: 0, fail: 0, partial: 1, success: 2, critSuccess: 4 },
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
          disposition: 'neutral',
          text: '{Who} needs help.',
          slots: { who: { from: 'table', table: 'who' } },
          archetype: { id: 'test-need' },
          twist: { chance: 0.2, what: 'it is a trap' },
        },
      ],
    },
    ...testWorld,
    ...testEconomy,
    ...testProgression,
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
    poi: null,
    domain: null,
    used: [],
    log: [],
    ...overrides,
  }
}
