import { settlementServiceMetadata, settlementServicesBySize, settlementTypeData } from '../data'
import { nameGen } from '../generators/towns'
import {
  raceNames,
  type Country,
  type RaceDistribution,
  type Player,
  type Position,
  type Settlement,
  type SettlementType,
  type SettlementService,
} from '../types'
import { generateSettlementServiceItemSaleList } from './data-utils'
import { getRandomValue, getRandomWeightedValue, clamp, randomInt } from './general-utils'

export function generateCountry(player: Player, isStartingCountry: boolean): Country {
  const primaryRace = getRandomValue(raceNames)
  const raceDistribution = [
    { name: primaryRace, ratio: 6 },
    { name: getRandomValue(raceNames), ratio: 2 },
    { name: getRandomValue(raceNames), ratio: 1 },
    { name: getRandomValue(raceNames), ratio: 0.5 },
  ]
  const extraFriendliness = isStartingCountry ? 0 : randomInt(-2, 8)
  const settlements = (
    isStartingCountry ? [...Array(randomInt(5, 8))] : [...Array(randomInt(4, 30))]
  )
    .map((_, i) => generateSettlement(player, raceDistribution, extraFriendliness))
    .map((settlement) => ({ ...settlement, ...generateSettlementPosition(settlement.type) }))

  return {
    name: `Country of ${nameGen(3)}`,
    primaryRace,
    raceDistribution,
    settlements,
  }
}

function generateSettlement(
  player: Player,
  raceDistribution: RaceDistribution,
  extraFriendliness: number
): Omit<Settlement, 'x' | 'y'> {
  const settlementType = getRandomWeightedValue(settlementTypeData)
  const race = getRandomWeightedValue(raceDistribution)
  const population = randomInt(settlementType.minPopulation, settlementType.maxPopulation)
  const friendliness = clamp(
    (settlementType.hostileChance + extraFriendliness) *
      (race.name !== player.leader.race ? (population > 10000 ? 3 : 2) : 1) *
      (Math.random() + 0.5),
    0,
    1
  )
  return {
    name: nameGen(3),
    type: settlementType,
    population,
    primaryRace: race.name,
    friendliness,
    services: generateSettlementServices(population, settlementType),
    renown: friendliness > 0.8 ? -2 : friendliness > 0.4 ? -1 : 0,
  }
}

function generateSettlementPosition(settlementType: SettlementType): Position {
  // TODO: Take settlement restrictions into account
  return { x: randomInt(1, 80), y: randomInt(1, 50) }
}

function generateSettlementServices(
  population,
  settlementType: SettlementType
): SettlementService[] {
  const index =
    population > 10000
      ? 5 // Metropolis
      : population > 4000
      ? 4 // City
      : population > 1000
      ? 3 // Town
      : population > 400
      ? 2 // Village
      : population > 76
      ? 1 // Hamlet
      : 0 // Small settlement
  const settlementServices = settlementServicesBySize
    .filter((service) => {
      const tier = clamp(settlementType.type === 'traders' ? index + 1 : index, 0, 5)
      const chance = service.ratios[tier]
      return Math.random() < 0.9 && randomInt(1, 20) > chance
    })
    .map((service): SettlementService => {
      const metadata = settlementServiceMetadata[service.id]
      const quality = Math.random() + Math.log10(population) / 10 - 0.25
      const purchasePriceMultiplier = 1 + Math.random() / 3
      return {
        ...metadata,
        ...service,
        // prettier-ignore
        quality,
        purchasePriceMultiplier: purchasePriceMultiplier,
        sellPriceMultiplier: 1 - Math.random() / 3,
        itemSaleList: generateSettlementServiceItemSaleList({
          ...metadata,
          quality,
          purchasePriceMultiplier,
        }),
      }
    })
    .slice()
    .sort((a, b) => a.quality - b.quality)
    .slice(0, settlementType.maxServices)
  return settlementServices
}

export function formatSettlementName(settlement: Settlement): string {
  return `${settlement.type.name} of ${settlement.name}`
}
