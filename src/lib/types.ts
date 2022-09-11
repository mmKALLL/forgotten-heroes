export type Outcome = {
  message: string
  options?: Action
}

export type Action = {
  label: string
  handler: <T extends GameState>(gs: T) => T
}

export type Player = {
  gold: number
  leader: Character
  followers: Character[]
  inventory: HeldItem[]
}

export type Character = {
  name: string
  level: number
  hp: number
  maxHp: number
  race: Race
  class: Class
  hitDie: number
  str: number
  dex: number
  vit: number
  int: number
  wis: number
  cha: number
  xp: number // resets between levels
  totalXp: number
}

export type Item = {
  name: string
  id: number
  tags: ItemTag[]
  equippableSlot?: EquipSlot
  equipComponents?: EquipComponent[]
  consumableComponents?: ConsumableComponent[]
  rarity: number // higher means rarer. Generally 0.0 = common, 0.2 = sturdy, 0.35 = uncommon, 0.5 = fine craft, 0.7 = magical, 0.9 = legendary/artifact
  price: number
  purchaseUnit?: number // how many to buy at once, useful for e.g. arrows etc
}

export type HeldItem = Item & {
  heldQuantity: number
  equippedToIndex: number | 'leader' | null
}

export type ItemTag =
  | 'consumable'
  | 'instant-consume-on-buy'
  | 'food'
  | 'drink'
  | 'general-supplies'
  | 'magical-supplies'
  | 'armory-supplies'
  // | 'equipment' // Can check equippableSlot instead
  | 'trinket'
  | 'throwable'
export type EquipSlot = 'weapon' | 'armor' | 'accessory'

export type EquipComponent =
  | {
      type: 'weapon'
      minDamage: number
      maxDamage: number
    }
  | {
      type: 'passive'
      statBoosts: Partial<Character>
    }
export type Target = 'self' | 'one-ally' | 'all-ally' | 'one-enemy' | 'all-enemy'
export type ConsumableComponent = { type: 'heal'; target: Target; amount: number }

export type GameState = { player: Player } & (SettlementGS | TravelGS | CombatGS)

export type SettlementGS = {
  screen: 'settlement'
  map: Settlement
  activeService?: SettlementService
}

// TODO: Boilerplate
export type TravelGS = {
  screen: 'travel'
}

export type CombatGS = {
  screen: 'combat'
}

export type Position = {
  x: number
  y: number
}

export type Race = 'human' | 'elf' | 'dwarf' | 'orc' | 'goblin' | 'undead' | 'drake'
export const raceNames: Race[] = ['human', 'elf', 'dwarf', 'orc', 'goblin', 'undead', 'drake']
export type RaceDistribution = { name: Race; ratio: number }[]

export type Class = 'fighter' | 'wizard' | 'rogue' | 'cleric'
export const classNames: Class[] = ['fighter', 'wizard', 'rogue', 'cleric']

// Used for generating a settlement
export type SettlementType = {
  name: string
  type: 'lifeplace' | 'traders' | 'military' | 'other'
  minPopulation: number
  maxPopulation: number
  ratio: number // ratio among settlements in an country
  predominantRace: Race
  hostileChance: number
  worldMapType: 'marked' | 'unmarked'
  worldMapRadiuses: { noSettlementRange: number; noEventRange: number }
}

// Settlement "instance"
export type Settlement = {
  name: string
  type: SettlementType
  population: number
  primaryRace: Race
  hostility: number
  renown: number
  services: SettlementService[]
  x: number
  y: number
}

export type Country = {
  name: string
  settlements: Settlement[]
  primaryRace: Race
  raceDistribution: RaceDistribution
}

export type SettlementService = {
  id: number
  name: string
  // actions: Action[]
  quality: number
  itemSaleTags: ItemTag[]
  itemSaleList: Item[]
  typicalRarity: number
  maxRarity: number
  purchasePriceMultiplier: number
  sellPriceMultiplier: number
}
