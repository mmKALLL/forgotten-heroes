import { settlementServiceActions, settlementServicesBySize, settlementTypeData } from '../data'
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
import { getRandomValue, getRandomWeightedValue, clamp, randomInt } from './general-utils'

export function generateCountry(player: Player, isStartingCountry: boolean): Country {
  const primaryRace = getRandomValue(raceNames)
  const raceDistribution = [
    { name: primaryRace, ratio: 0.8 },
    { name: getRandomValue(raceNames), ratio: 0.15 },
    { name: getRandomValue(raceNames), ratio: 0.05 },
  ]
  const extraHostility = isStartingCountry ? 0 : randomInt(-10, 40) / 100
  const settlements = [...Array(20)]
    .map((_, i) => generateSettlement(player, raceDistribution, extraHostility))
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
  extraHostility: number
): Omit<Settlement, 'x' | 'y'> {
  const settlementType = getRandomWeightedValue(settlementTypeData)
  const race = getRandomWeightedValue(raceDistribution)
  const population = randomInt(settlementType.minPopulation, settlementType.maxPopulation)
  const hostility = clamp(
    (settlementType.hostileChance + extraHostility) *
      (race.name !== player.race ? (population > 10000 ? 3 : 2) : 1) *
      (Math.random() + 0.5),
    0,
    1
  )
  return {
    name: nameGen(3),
    type: settlementType,
    population,
    primaryRace: race.name,
    hostility,
    services: generateSettlementServices(population, settlementType),
    renown: hostility > 0.8 ? -2 : hostility > 0.4 ? -1 : 0,
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
    .map(
      (service): SettlementService => ({
        ...service,
        actions: settlementServiceActions[service.id].actions.concat([
          {
            label: 'Go back',
            handler: (gs) =>
              gs.screen === 'settlement' ? { ...gs, activeService: undefined } : gs,
          },
        ]),
      })
    )
  return settlementServices
}