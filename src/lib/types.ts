export type Outcome = {
  message: string
  options: Action
}

export type Action = {
  label: string
  handler: <T extends GameState>(gs: T) => T
}

export type Player = {
  race: Race
}

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
  actions: Action[]
}
