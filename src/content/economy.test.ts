import { describe, expect, test } from 'vitest'
import { economyIssues } from '../engine/economy/validate'
import { generateWorld, worldSeed } from '../engine/world/generate'
import { domainThreatLevel } from '../engine/world/pois'
import { siteEmpty } from '../engine/world/sites'
import { straightKm } from '../engine/world/geo'
import type { ContractTemplate, MarketRule } from '../schema/economy'
import { CONTRACT_KINDS, GOOD_CATEGORY, GOODS, type Good, type PoiCategory } from '../schema/types'
import type { WorldState } from '../schema/world'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()
const SEEDS = [1, 2, 3, 4, 5]
/** Two days far enough apart that threat levels and site cycles differ. */
const DAYS = [1, 100]
/** Water is refilled free in settlements, so it is never bought or sold. */
const TRADED = GOODS.filter((good) => good !== 'water')

const worlds = SEEDS.map((seed) => generateWorld(worldSeed(seed), content))

/** What a market rule's conditions look at, for one settlement on one day. */
type Place = {
  type: string
  size: number
  biome: string
  coastal: boolean
  wealth: number
  threat: number
  near: Set<PoiCategory>
  services: string[]
}

function places(world: WorldState, day: number): Place[] {
  return Object.entries(world.settlements).map(([id, s]) => {
    const site = content.settlements[id]
    const near = new Set(
      Object.entries(world.pois)
        .filter(([poiId, p]) => p.domain === id && !siteEmpty(world.seed, poiId, p, day))
        .map(([, p]) => p.category)
    )
    return {
      type: s.type,
      size: s.sizeTier,
      biome: content.regions[site.region].biome,
      coastal: site.coastal,
      wealth: s.wealth,
      threat: domainThreatLevel(world, id, day),
      near,
      services: s.services,
    }
  })
}

const applies = ({ when }: MarketRule, p: Place): boolean =>
  (when.types === undefined || when.types.includes(p.type)) &&
  (when.biomes === undefined || (when.biomes as string[]).includes(p.biome)) &&
  (when.coastal === undefined || when.coastal === p.coastal) &&
  (when.minSize === undefined || p.size >= when.minSize) &&
  (when.maxSize === undefined || p.size <= when.maxSize) &&
  (when.threatAtLeast === undefined || p.threat >= when.threatAtLeast) &&
  (when.nearPoi === undefined || when.nearPoi.some((c) => p.near.has(c))) &&
  (when.minWealth === undefined || p.wealth >= when.minWealth)

const clamp = (n: number) => Math.max(-3, Math.min(3, n))

/** Demand minus supply for a good at a place: the exponent of its price step (A2). */
function netLevel(place: Place, good: Good): number {
  let supply = 0
  let demand = 0
  for (const rule of Object.values(content.marketRules)) {
    if (!applies(rule, place)) continue
    supply += rule.supply[good] ?? 0
    demand += rule.demand[good] ?? 0
  }
  return clamp(demand) - clamp(supply)
}

/**
 * A data-level stand-in for A2's PRICE_STEP (1.25), so this test runs before the market engine
 * exists. I1 checks the same spread with the real midPrice, drift included.
 */
const PRICE_STEP_PROXY = 1.25

describe('the economy data', () => {
  test('has no issues', () => {
    expect(economyIssues(content)).toEqual([])
  })

  test('defines all 15 goods, every service role, and the animals and people B1 names', () => {
    expect(Object.keys(content.goods).sort()).toEqual([...GOODS].sort())
    expect(Object.keys(content.serviceRoles).sort()).toEqual(Object.keys(content.services).sort())
    expect(Object.keys(content.marketRules).length).toBeGreaterThanOrEqual(25)
    expect(Object.keys(content.marketRules).length).toBeLessThanOrEqual(40)
    for (const id of ['mule', 'cart', 'riding-horse']) expect(content.animals).toHaveProperty(id)
    expect(Object.keys(content.personRoles).length).toBeGreaterThanOrEqual(10)
    expect(Object.keys(content.personRoles).length).toBeLessThanOrEqual(15)
  })

  test('precious goods are light and materials heavy (kg per unit)', () => {
    for (const good of GOODS) {
      const { weight } = content.goods[good]
      if (GOOD_CATEGORY[good] === 'precious') expect(weight, good).toBeLessThanOrEqual(2)
      if (GOOD_CATEGORY[good] === 'materials') expect(weight, good).toBeGreaterThanOrEqual(10)
    }
  })

  test('only food spoils, and only water is free', () => {
    for (const good of GOODS) {
      const def = content.goods[good]
      expect(def.spoilPerDay > 0, good).toBe(good === 'food')
      expect(def.price === 0, good).toBe(good === 'water')
    }
  })

  test.each(SEEDS)('seed %i: every traded good is buyable and sellable somewhere', (seed) => {
    const world = worlds[seed - 1]
    const buyable = new Set<Good>(TRADED.filter((g) => GOOD_CATEGORY[g] === 'essentials'))
    const sellable = new Set<Good>()
    for (const s of Object.values(world.settlements)) {
      for (const service of s.services) {
        const role = content.serviceRoles[service]
        for (const good of role.trades) {
          buyable.add(good)
          sellable.add(good)
        }
        for (const good of role.buysOnly) sellable.add(good)
      }
    }
    expect(TRADED.filter((g) => !buyable.has(g))).toEqual([])
    expect(TRADED.filter((g) => !sellable.has(g))).toEqual([])
  })

  test.each(SEEDS)(
    'seed %i: each good’s dearest mid price is 1.5–4× its cheapest (data proxy)',
    (seed) => {
      const world = worlds[seed - 1]
      const outOfRange: string[] = []
      for (const day of DAYS) {
        const all = places(world, day)
        for (const good of TRADED) {
          const nets = all.map((p) => netLevel(p, good))
          const ratio = PRICE_STEP_PROXY ** (Math.max(...nets) - Math.min(...nets))
          if (ratio < 1.5 || ratio > 4) {
            outOfRange.push(`day ${day} ${good}: ${ratio.toFixed(2)}×`)
          }
        }
      }
      expect(outOfRange).toEqual([])
    }
  )

  test('every market rule applies somewhere in seeds 1–5', () => {
    const all = worlds.flatMap((world) => DAYS.flatMap((day) => places(world, day)))
    const unused = Object.values(content.marketRules)
      .filter((rule) => !all.some((p) => applies(rule, p)))
      .map((rule) => rule.id)
    expect(unused).toEqual([])
  })

  test('contract templates cover all five kinds', () => {
    const templates = Object.values(content.contracts)
    expect(templates.length).toBeGreaterThanOrEqual(15)
    expect(templates.length).toBeLessThanOrEqual(25)
    expect(new Set(templates.map((t) => t.kind))).toEqual(new Set(CONTRACT_KINDS))
  })

  /**
   * A data-level stand-in for B4's noticeBoard: a board big enough, with the service, and a
   * destination (another settlement on the same island) or an inhabited site of the right
   * kind within the template's km, as the crow flies.
   */
  test('every contract template can be offered somewhere in seeds 1–5', () => {
    const offered = (template: ContractTemplate, world: WorldState): boolean =>
      Object.entries(world.settlements).some(([id, s]) => {
        if (s.sizeTier < template.minSize) return false
        if (template.service !== undefined && !s.services.includes(template.service)) return false
        const here = content.settlements[id]
        const within = (km: number) => km >= template.km.min && km <= template.km.max
        if (template.poiCategories === undefined) {
          return Object.values(content.settlements).some(
            (there) =>
              there.id !== id &&
              there.island === here.island &&
              within(straightKm(here.at, there.at))
          )
        }
        return Object.entries(world.pois).some(
          ([poiId, poi]) =>
            template.poiCategories!.includes(poi.category) &&
            !siteEmpty(world.seed, poiId, poi, 1) &&
            within(straightKm(here.at, content.landSpots[poi.spot].at))
        )
      })
    const never = Object.values(content.contracts)
      .filter((template) => !worlds.some((world) => offered(template, world)))
      .map((template) => template.id)
    expect(never).toEqual([])
  })

  test('every person role can appear: its service turns up in seeds 1–5', () => {
    const present = new Set(
      worlds.flatMap((world) => Object.values(world.settlements).flatMap((s) => s.services))
    )
    const absent = Object.values(content.personRoles)
      .filter((role) => role.service !== undefined && !present.has(role.service))
      .map((role) => role.id)
    expect(absent).toEqual([])
  })
})
