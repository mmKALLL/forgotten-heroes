import type { Event, Item, ItemTag, SettlementService, SettlementType } from './types'

export const settlementTypeData: SettlementType[] = [
  {
    name: 'Military camp',
    type: 'military',
    minPopulation: 5,
    maxPopulation: 20,
    maxServices: 2,
    ratio: 0.5,
    hostileChance: 0.15,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 1, noEventRange: 1 },
  },
  {
    name: 'Caravan',
    type: 'traders',
    minPopulation: 2,
    maxPopulation: 20,
    maxServices: 2,
    ratio: 0.5,
    hostileChance: 0.05,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 1, noEventRange: 1 },
  },
  {
    name: 'Cottage',
    type: 'lifeplace',
    minPopulation: 1,
    maxPopulation: 10,
    maxServices: 1,
    ratio: 3,
    hostileChance: 0.15,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 1, noEventRange: 1 },
  },
  {
    name: 'Large encampment',
    type: 'military',
    minPopulation: 50,
    maxPopulation: 100,
    maxServices: 3,
    ratio: 1,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 2, noEventRange: 1 },
  },
  {
    name: 'Hamlet',
    type: 'lifeplace',
    minPopulation: 50,
    maxPopulation: 150,
    maxServices: 4,
    ratio: 2.5,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 3, noEventRange: 1 },
  },
  {
    name: 'Work crew (eg: woodcutters, miners, farmers)',
    type: 'traders',
    minPopulation: 50,
    maxPopulation: 200,
    maxServices: 3,
    ratio: 1,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 2, noEventRange: 1 },
  },
  {
    name: 'Stationed garrison',
    type: 'military',
    minPopulation: 100,
    maxPopulation: 300,
    maxServices: 3,
    ratio: 1,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 4, noEventRange: 2 },
  },
  {
    name: 'Fort',
    type: 'military',
    minPopulation: 200,
    maxPopulation: 400,
    maxServices: 4,
    ratio: 0.75,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 5, noEventRange: 2 },
  },
  {
    name: 'Village',
    type: 'lifeplace',
    minPopulation: 300,
    maxPopulation: 1200,
    maxServices: 6,
    ratio: 2,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 5, noEventRange: 1 },
  },
  {
    name: 'Encamped Army',
    type: 'military',
    minPopulation: 1000,
    maxPopulation: 3000,
    maxServices: 5,
    ratio: 0.25,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 3, noEventRange: 2 },
  },
  {
    name: 'Refugee encampment',
    type: 'lifeplace',
    minPopulation: 300,
    maxPopulation: 5000,
    maxServices: 6,
    ratio: 0.15,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 2, noEventRange: 1 },
  },
  {
    name: 'Town',
    type: 'lifeplace',
    minPopulation: 1000,
    maxPopulation: 6000,
    maxServices: 8,
    ratio: 1,
    hostileChance: 0.1,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 4, noEventRange: 1 },
  },
  {
    name: 'City',
    type: 'lifeplace',
    minPopulation: 4000,
    maxPopulation: 15000,
    maxServices: 10,
    ratio: 0.5,
    hostileChance: 0.04,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 5, noEventRange: 2 },
  },
  {
    name: 'Capital',
    type: 'lifeplace',
    minPopulation: 12000,
    maxPopulation: 50000,
    maxServices: 12,
    ratio: 0.1,
    hostileChance: 0.04,
    predominantRace: 'human',
    worldMapType: 'unmarked',
    worldMapRadiuses: { noSettlementRange: 6, noEventRange: 2 },
  },
]

export const settlementServicesBySize = [
  { id: 0, name: 'Inn / Tavern', ratios: [10, 8, 6, 4, 2, 1] },
  { id: 1, name: 'Adventuring Supplies', ratios: [17, 14, 10, 5, 2, 1] },
  { id: 2, name: 'Animals and Mounts', ratios: [12, 11, 9, 7, 5, 3] },
  { id: 3, name: 'Books and Maps', ratios: [18, 17, 15, 13, 11, 9] },
  { id: 4, name: 'Jewelry trader', ratios: [20, 19, 18, 16, 14, 12] },
  { id: 5, name: 'Armourer', ratios: [18, 16, 14, 12, 10, 8] },
  { id: 6, name: 'Bank', ratios: [17, 15, 13, 10, 8, 6] },
  { id: 7, name: 'Finesmith', ratios: [18, 17, 15, 13, 11, 9] },
  { id: 8, name: 'Tailor', ratios: [15, 13, 11, 10, 8, 6] },
  { id: 9, name: 'Potions, poisons, herbs', ratios: [18, 17, 16, 14, 12, 10] },
  { id: 10, name: 'Church', ratios: [16, 14, 12, 10, 8, 6] },
  { id: 11, name: 'Food & drink', ratios: [14, 12, 10, 8, 6, 4] },
  { id: 12, name: 'High Temple', ratios: [18, 16, 14, 12, 10, 8] },
  { id: 13, name: 'Spell tomes and scrolls', ratios: [20, 19, 17, 15, 13, 11] },
  { id: 14, name: 'Thieving supplies', ratios: [19, 18, 16, 14, 12, 10] },
  { id: 15, name: 'Weapons Shop', ratios: [17, 15, 13, 11, 9, 7] },
  { id: 16, name: 'Vehicles and transportation', ratios: [15, 12, 13, 10, 8, 6] },
  { id: 17, name: "Adventurer's Guild", ratios: [19, 18, 16, 14, 12, 10] },
  { id: 18, name: 'Magic Items', ratios: [25, 22, 19, 16, 15, 14] },
  { id: 19, name: 'Blacksmith', ratios: [12, 10, 8, 6, 4, 2] },
  { id: 20, name: 'Necromancer', ratios: [20, 19, 18, 17, 16, 16] },
  { id: 21, name: 'Couriers', ratios: [19, 18, 17, 15, 13, 11] },
  { id: 22, name: 'Brothel', ratios: [17, 15, 13, 11, 9, 7] },
  { id: 23, name: 'Land Sales', ratios: [16, 15, 13, 10, 8, 6] },
  { id: 24, name: 'Carpenter', ratios: [15, 13, 10, 8, 6, 4] },
  { id: 25, name: "Entertainer's Guild ", ratios: [20, 18, 16, 13, 11, 9] },
  { id: 26, name: 'Healer', ratios: [18, 15, 12, 10, 7, 4] },
  { id: 27, name: 'Port (if coastal)', ratios: [19, 18, 16, 14, 12, 10] },
  { id: 28, name: "Worker's Union", ratios: [19, 18, 16, 11, 9, 7] },
  { id: 29, name: 'Stonemason', ratios: [18, 15, 12, 10, 7, 4] },
  { id: 30, name: 'University', ratios: [22, 20, 18, 16, 14, 12] },
  { id: 31, name: 'Mercenaries', ratios: [19, 18, 17, 16, 14, 12] },
  { id: 32, name: 'Arena', ratios: [19, 18, 16, 12, 10, 8] },
]

export const settlementServiceMetadata: {
  [key: number]: Pick<
    SettlementService,
    'id' | 'name' | 'itemSaleTags' | 'typicalRarity' | 'maxRarity'
  >
} = {
  0: {
    id: 0,
    name: 'Inn / Tavern',
    itemSaleTags: ['drink', 'food', 'inn-service'],
    typicalRarity: 0.1,
    maxRarity: 0.5,
  },
  1: {
    id: 1,
    name: 'Adventuring Supplies',
    itemSaleTags: ['general-supplies', 'food', 'clothing'],
    typicalRarity: 0.15,
    maxRarity: 0.5,
  },
  2: {
    id: 2,
    name: 'Animals and Mounts',
    itemSaleTags: ['mount'],
    typicalRarity: 0.3,
    maxRarity: 1,
  },
  3: {
    id: 3,
    name: 'Books and Maps',
    itemSaleTags: ['magical-supplies'],
    typicalRarity: 0.15,
    maxRarity: 1,
  },
  4: {
    id: 4,
    name: 'Jewelry trader',
    itemSaleTags: ['trinket', 'jewel'],
    typicalRarity: 0.25,
    maxRarity: 0.75,
  },
  5: {
    id: 5,
    name: 'Armourer',
    itemSaleTags: ['armor', 'clothing'],
    typicalRarity: 0.25,
    maxRarity: 0.85,
  },
  6: { id: 6, name: 'Bank', itemSaleTags: ['bank-service'], typicalRarity: 0.25, maxRarity: 1 },
  7: {
    id: 7,
    name: 'Finesmith',
    itemSaleTags: ['trinket', 'accessory'],
    typicalRarity: 0.5,
    maxRarity: 1,
  },
  8: { id: 8, name: 'Tailor', itemSaleTags: ['clothing'], typicalRarity: 0.25, maxRarity: 0.5 },
  9: {
    id: 9,
    name: 'Potions, poisons, herbs',
    itemSaleTags: ['potion'],
    typicalRarity: 0.3,
    maxRarity: 1,
  },
  10: {
    id: 10,
    name: 'Church',
    itemSaleTags: ['holy-service', 'holy-symbol'],
    typicalRarity: 0.4,
    maxRarity: 0.8,
  },
  11: { id: 11, name: 'Food & drink', itemSaleTags: [], typicalRarity: 0.25, maxRarity: 0.5 },
  12: {
    id: 12,
    name: 'High Temple',
    itemSaleTags: ['holy-service'],
    typicalRarity: 0.6,
    maxRarity: 1,
  },
  13: {
    id: 13,
    name: 'Spell tomes and scrolls',
    itemSaleTags: ['magical-supplies'],
    typicalRarity: 0.25,
    maxRarity: 0.5,
  },
  14: {
    id: 14,
    name: 'Thieving supplies',
    itemSaleTags: ['general-supplies'],
    typicalRarity: 0.6,
    maxRarity: 1,
  },
  15: {
    id: 15,
    name: 'Weapons Shop',
    itemSaleTags: ['weapon'],
    typicalRarity: 0.25,
    maxRarity: 0.85,
  },
  16: {
    id: 16,
    name: 'Vehicles and transportation',
    itemSaleTags: ['transport-service'],
    typicalRarity: 0.2,
    maxRarity: 0.5,
  },
  17: {
    id: 17,
    name: "Adventurer's Guild",
    itemSaleTags: ['general-supplies', 'clothing', 'weapon', 'armor', 'magical-supplies'],
    typicalRarity: 0.2,
    maxRarity: 0.4,
  },
  18: {
    id: 18,
    name: 'Magic Items',
    itemSaleTags: ['weapon', 'armor', 'accessory', 'consumable'],
    typicalRarity: 0.8,
    maxRarity: 1,
  },
  19: {
    id: 19,
    name: 'Blacksmith',
    itemSaleTags: ['weapon', 'armor', 'trinket'],
    typicalRarity: 0.3,
    maxRarity: 0.6,
  },
  20: {
    id: 20,
    name: 'Necromancer',
    itemSaleTags: ['holy-service', 'jewel'],
    typicalRarity: 1,
    maxRarity: 1,
  },
  21: {
    id: 21,
    name: 'Couriers',
    itemSaleTags: ['transport-service'],
    typicalRarity: 0.05,
    maxRarity: 0.1,
  },
  22: {
    id: 22,
    name: 'Brothel',
    itemSaleTags: ['massage-service'],
    typicalRarity: 0.2,
    maxRarity: 0.75,
  },
  23: {
    id: 23,
    name: 'Land Sales',
    itemSaleTags: ['real-estate-service'],
    typicalRarity: 0.4,
    maxRarity: 1,
  },
  24: { id: 24, name: 'Carpenter', itemSaleTags: [], typicalRarity: 0.25, maxRarity: 0.5 },
  25: {
    id: 25,
    name: "Entertainer's Guild",
    itemSaleTags: ['massage-service'],
    typicalRarity: 0.15,
    maxRarity: 0.5,
  },
  26: {
    id: 26,
    name: 'Healer',
    itemSaleTags: ['potion', 'holy-service'],
    typicalRarity: 0.3,
    maxRarity: 0.5,
  },
  27: {
    id: 27,
    name: 'Port (if coastal)',
    itemSaleTags: ['transport-service'],
    typicalRarity: 0.25,
    maxRarity: 0.5,
  },
  28: { id: 28, name: "Worker's Union", itemSaleTags: [], typicalRarity: 0.25, maxRarity: 0.5 },
  29: { id: 29, name: 'Stonemason', itemSaleTags: [], typicalRarity: 0.25, maxRarity: 0.5 },
  30: { id: 30, name: 'University', itemSaleTags: [], typicalRarity: 0.25, maxRarity: 0.5 },
  31: { id: 31, name: 'Mercenaries', itemSaleTags: [], typicalRarity: 0.25, maxRarity: 0.5 },
  32: { id: 32, name: 'Arena', itemSaleTags: ['arena-service'], typicalRarity: 0.4, maxRarity: 1 },
}

const itemData: Item[] = [
  {
    name: 'Red potion',
    id: 'red-potion',
    tags: ['consumable', 'general-supplies', 'stackable', 'potion'],
    consumableEffectComponents: [{ type: 'heal', target: 'one-ally', amount: 12 }],
    rarity: 0.3,
    price: 30,
  },
  {
    name: 'Bread',
    id: 'bread',
    tags: ['general-supplies', 'stackable', 'food'],
    consumableEffectComponents: [{ type: 'nourish', duration: { hours: 8 } }],
    rarity: 0.04,
    price: 1,
  },
  {
    name: 'Ration',
    id: 'ration',
    tags: ['general-supplies', 'stackable', 'food'],
    consumableEffectComponents: [{ type: 'nourish', duration: { days: 1 } }],
    rarity: 0.15,
    price: 3,
  },
  {
    name: 'Elven bread',
    id: 'elven-bread',
    tags: ['general-supplies', 'stackable', 'food'],
    consumableEffectComponents: [{ type: 'nourish', duration: { days: 7 } }],
    rarity: 0.65,
    price: 30,
  },
  {
    name: 'Short sword',
    id: 'short-sword',
    tags: ['weapon'],
    equippableSlot: 'weapon',
    rarity: 0.05,
    price: 40,
  },
  {
    name: 'Beers',
    id: 'beers',
    tags: ['instant-consume-on-buy', 'drink'],
    consumableEffectComponents: [
      { type: 'heal', target: 'all-ally', amount: 2 },
      {
        type: 'buff',
        target: 'all-ally',
        stat: 'dex',
        amount: -1,
        duration: { hours: 8 },
      },
    ],
    rarity: 0.05,
    price: 2,
  },
]

export const itemList = itemData.reduce((acc, cur) => {
  acc[cur.id] = cur
  return acc
}, {} as { [key: string]: Item })

const combatDescription: 'Initiate combat.'

// First two are written by hand, rest are generated by ChatGPT
// TODO: Need to actually implement the effects of the outcomes
export const eventData: Event[] = [
  {
    participants: [{ race: 'human', class: 'commoner', level: 3, amount: 4 }],
    biomes: ['river', 'plains', 'lifeplace', 'traders'],
    rarity: 0.75,
    message:
      "A group of fishermen are sitting by a small pond, fishing, drinking ale and laughing at each other's jokes.",
    secret: 'One of the fishermen carries an amulet that improves foraging skill.',
    options: [
      {
        label: 'Approach',
        description: 'Approach the fishermen calmly and join their group.',
        handler: () => 'They will offer food and ale if the players need it.',
      },
      {
        label: 'Steal',
        description: 'Try to make off with their valuables while they are distracted.',
        handler: {
          stat: 'dex',
          outcomes: [
            { message: 'The fishermen noticed you and prepare for battle!', d20max: 10 },
            { message: 'The fishermen noticed you and secured their belongings.', d20max: 15 },
            {
              message: 'You were able to steal their wallets, containing 4 gp in total.',
              d20max: 20,
            },
            {
              message:
                'You were able to pickpocket one of the fishermen. Gained an Amulet of Foraging!',
            },
          ],
        },
      },
      {
        label: 'Fight',
        description: combatDescription,
        handler: triggerEventCombat(),
      },
      {
        label: 'Ignore',
        description: 'Let them continue in peace.',
        handler: 'Nothing happens.',
      },
    ],
  },
  {
    participants: null,
    biomes: ['forest'],
    rarity: 0.25,
    message:
      'You past through a barren section of forest that was damaged about a decade ago by a forest fire. In the middle of the desolation, you find a circle of trees that seems untouched by the fire that destroyed the surroundings.',
    secret:
      'The trees are imbued with magic that protects them from fire. It remains from an ancient ritual performed at the location, which was as a meeting place for high elves.',
    options: [
      {
        label: 'Investigate the trees',
        description: 'See if the trees have anything special about them.',
        handler:
          "You notice that some of the trees are warm to the touch, but don't have other special characteristics.",
      },
      {
        label: 'Use arcana knowledge',
        description: 'Try to find clues related to the use of magic.',
        handler: {
          stat: 'int',
          outcomes: [
            'You notice that the trees are protected against fire.',
            'You notice that some sort of ritual or enchantment has been placed around the area a long time ago.',
          ],
        },
      },
      {
        label: 'Burn the trees',
        description: 'Try to set a fire to the remaining trees.',
        handler:
          "The fire has trouble catching onto the trees. It's as if the trees are entirely inflammable.",
      },
      {
        label: 'Rip bark from the trees',
        description: 'Take a piece of bark with you for future use.',
        handler: () => 'You gained a piece of bark. What are you going to do with it?',
      },
      {
        label: 'Ignore',
        description: 'Ignore the trees.',
        handler: () => 'Nothing happens.',
      },
    ],
  },
  {
    participants: [
      { race: 'dwarf', class: 'fighter', level: 5, amount: 2 },
      { race: 'human', class: 'rogue', level: 4, amount: 1 },
    ],
    biomes: ['mountains'],
    rarity: 0.6,
    message:
      "The group stumbles upon an abandoned dwarven mine. It's filled with rubble and looks like it hasn't been used in decades.",
    secret:
      'There is a hidden passage that leads to a treasure room. The passage is heavily trapped.',
    options: [
      {
        label: 'Explore the mine',
        description: 'Investigate the abandoned dwarven mine.',
        handler: [
          'The party finds nothing out of the ordinary, just rubble and old equipment scattered throughout the mine.',
          'The party finds a map that shows the location of a hidden treasure room!',
        ],
      },
      {
        label: 'Search for the treasure room',
        description: 'Use the map to find the treasure room.',
        handler: () =>
          'The party finds the hidden passage and successfully navigates through the traps to the treasure room. They find a chest filled with gold and gems, as well as a magical dwarven warhammer.',
      },
      {
        label: 'Leave the mine',
        description: 'Abandon the mine and move on.',
        handler: () => 'Nothing happens.',
      },
    ],
  },
  {
    participants: [
      { race: 'half-elf', class: 'bard', level: 3, amount: 1 },
      { race: 'human', class: 'wizard', level: 3, amount: 1 },
    ],
    biomes: ['swamp', 'jungle'],
    rarity: 0.5,
    message:
      "The party encounters a group of lizardfolk who are performing a ritual. They're gathered around a large stone altar and seem to be offering a sacrifice to their deity.",
    secret:
      "The sacrifice is a powerful magical artifact that the lizardfolk have been guarding for generations. It's rumored to be able to control the weather and bring great fortune to its owner.",
    options: [
      {
        label: 'Approach the lizardfolk',
        description:
          'Attempt to communicate with the lizardfolk and learn more about their ritual.',
        handler: () =>
          'The party is able to communicate with the lizardfolk and learn more about their culture and traditions. However, they are unable to learn anything about the artifact.',
      },
      {
        label: 'Steal the artifact',
        description: 'Attempt to steal the artifact while the lizardfolk are distracted.',
        handler: () =>
          '30%: The party is able to steal the artifact without being detected. 50%: The party is detected and must fight their way out. 20%: The lizardfolk call upon their deity and a powerful elemental is summoned to defend the artifact.',
      },
      {
        label: 'Trade for the artifact',
        description: 'Attempt to negotiate with the lizardfolk for the artifact.',
        handler: () =>
          'The lizardfolk are willing to trade the artifact for a rare magical herb that grows in the nearby jungle. The party must find the herb and return it to the lizardfolk in exchange for the artifact.',
      },
      {
        label: 'Leave the lizardfolk alone',
        description: 'Ignore the lizardfolk and move on.',
        handler: () => 'Nothing happens.',
      },
    ],
  },
  {
    participants: [{ race: 'half-elf', class: 'ranger', level: 5, amount: 1 }],
    biomes: ['mountain'],
    rarity: 0.5,
    message:
      'As you climb the mountain, you come across a narrow, treacherous path. Suddenly, a group of mountain goats cross your path, but they are being chased by a pack of wolves.',
    secret: 'The alpha wolf has an enchanted collar that can only be removed with a special key.',
    options: [
      {
        label: 'Fight the wolves',
        description: 'Attack the wolves and try to save the goats.',
        handler: () =>
          '50%: Successfully defeat the wolves and save the goats, 30%: Save the goats but lose some party members, 20%: Lose the fight.',
      },
      {
        label: 'Sneak past the wolves',
        description: 'Try to sneak past the wolves and continue on your journey.',
        handler: () => '70%: Successfully sneak past the wolves, 30%: Get detected and attacked.',
      },
      {
        label: 'Save the wolves',
        description: 'Attempt to drive the goats away to protect the wolves.',
        handler: () =>
          'The wolves become aggressive and attack the party, losing the goats. 70%: Successfully defeat the wolves, 30%: Lose the fight.',
      },
    ],
  },
  {
    participants: [{ race: 'dwarf', class: 'fighter', level: 4, amount: 1 }],
    biomes: ['cave'],
    rarity: 0.4,
    message:
      'You enter a dark cave and are greeted by the sound of dripping water. You notice a deep pit in the ground that is barely visible in the darkness.',
    secret: 'The pit is a trap, with spikes at the bottom.',
    options: [
      {
        label: 'Investigate the pit',
        description: 'Approach and investigate the pit.',
        handler: () =>
          'You spot the spikes at the bottom and realize that it is a trap, likely set up by goblins or other creatures. Beware.',
      },
      {
        label: 'Jump over the pit',
        description: 'Attempt to jump over the pit.',
        handler: () =>
          '50%: Successfully jump over the pit, 50%: Fail to jump and fall into the spikes, taking damage.',
      },
      {
        label: 'Find a way around the pit',
        description: 'Try to find a different way around the pit.',
        handler: () =>
          'You manage to find a path that leads around the pit, avoiding the trap. However, you also find a group of goblins waiting for you. 50%: Successfully defeat the goblins, 50%: Lose the fight.',
      },
    ],
  },
]
