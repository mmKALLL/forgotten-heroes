export type Outcome = {
  message: string
  options?: Action
}

export type Action = {
  label: string
  description?: string
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
  race: Race
  class: Class
  hp: number
  maxHp: number
  buffs: Buff[] // also includes debuffs
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
  id: string
  tags: ItemTag[]
  equippableSlot?: EquipSlot
  equipComponents?: EquipComponent[]
  consumableEffectComponents?: EffectComponent[]
  rarity: number // higher means rarer. Generally 0.0 = common, 0.2 = sturdy, 0.35 = uncommon, 0.5 = fine craft, 0.7 = magical, 0.9 = legendary/artifact
  price: number
  purchaseUnit?: number // how many to buy at once, useful for e.g. arrows etc
}

export type HeldItem = Item & {
  heldQuantity: number
  equippedToIndex?: number | 'leader' | null
}

export type ItemTag =
  | 'consumable'
  | 'instant-consume-on-buy'
  | 'food'
  | 'drink'
  | 'potion'
  | 'stackable'
  | 'multi-use'
  | 'general-supplies'
  | 'magical-supplies'
  | 'armor'
  | 'weapon'
  | 'accessory'
  // | 'equipment' // Can check equippableSlot instead
  | 'trinket'
  | 'jewel'
  | 'throwable'
  | 'clothing'
  | 'holy-symbol'
  | 'holy-service'
  | 'inn-service'
  | 'bank-service'
  | 'arena-service'
  | 'massage-service'
  | 'transport-service'
  | 'real-estate-service'
  | 'mount'
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
export type Moment = { year: number; month: number; week: number; day: number; hour: number }
export type Duration = { months?: number; weeks?: number; days?: number; hours?: number }

export type Stat = 'str' | 'dex' | 'vit' | 'int' | 'wis' | 'cha'
export type Buff = {
  stat: Stat
  amount: number
  duration: Duration
}
export type EffectComponent =
  | {
      type: 'attack'
      target: Target
      hitType: 'physical' | 'magical' | 'ranged' | 'always-hit'
      hitStat: Stat | 'armor-class'
      hitBonus: number
      effects: EffectComponent[]
      missEffects?: EffectComponent[]
    }
  | { type: 'damage'; target: Target; amount: number }
  | { type: 'heal'; target: Target; amount: number }
  | ({ type: 'buff'; target: Target } & Buff)

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
  maxServices: number
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
