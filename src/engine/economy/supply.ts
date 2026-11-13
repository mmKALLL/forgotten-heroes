import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { ProducerRule } from '../../schema/economy'
import { GOODS, type Good, type PoiCategory } from '../../schema/types'
import type { GameState } from '../../schema/state'
import type { WorldState } from '../../schema/world'
import { settlementReach } from '../travel/reach'
import { MARKET_LEVEL_MAX, SUPPLY_DAYS_PER_LEVEL, SUPPLY_MIN } from '../constants'

// Geographic supply (design §4, designer decision): goods are made in particular settlements,
// chosen by the producer rules (data/claude/producers.json) on land, type, size, wealth, the
// sites in the domain and its services (a smith makes arms only where metal is to hand). A
// market's supply of a good is the best producer within reach, less a level for every
// SUPPLY_DAYS_PER_LEVEL steady days of road: near a producer it is cheap, far from any it is scarce. Nothing here changes after the world is rolled, so the whole table is worked
// out once per world and content (like territory) and kept.

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

/** What a settlement offers a producer rule: its type, size, land, coast, wealth, sites, services. */
type ProducerPlace = {
  type: string
  sizeTier: number
  biome: string | null
  coastal: boolean
  wealth: number
  /** Categories of every site in its domain, inhabited or not. */
  pois: PoiCategory[]
  services: string[]
}

/**
 * Whether every condition of a producer rule holds in a settlement. `supply` is the settlement's
 * supply level of each good from the rules without inputs (for a rule's `supplyAtLeast`).
 */
export function producerApplies(
  rule: ProducerRule,
  place: ProducerPlace,
  supply: (good: Good) => number = () => SUPPLY_MIN
): boolean {
  const w = rule.when
  return (
    (w.types === undefined || w.types.includes(place.type)) &&
    (w.biomes === undefined || (place.biome !== null && w.biomes.some((b) => b === place.biome))) &&
    (w.coastal === undefined || w.coastal === place.coastal) &&
    (w.minSize === undefined || place.sizeTier >= w.minSize) &&
    (w.maxSize === undefined || place.sizeTier <= w.maxSize) &&
    (w.minWealth === undefined || place.wealth >= w.minWealth) &&
    (w.nearPoi === undefined || w.nearPoi.some((c) => place.pois.includes(c))) &&
    (w.services === undefined || w.services.some((s) => place.services.includes(s))) &&
    (w.supplyAtLeast === undefined ||
      (Object.entries(w.supplyAtLeast) as [Good, number][]).every(
        ([good, level]) => supply(good) >= level
      ))
  )
}

/** Where a market's supply of a good comes from. */
export type SupplySource = {
  /** The supply level here, SUPPLY_MIN..MARKET_LEVEL_MAX. */
  level: number
  /** The producer it comes from (this settlement itself when it makes the good); null if none. */
  from: string | null
  /** Steady days of road from that producer (0 here); null if none. */
  days: number | null
  /** That producer's output level, 1–3 (0 if none). */
  output: number
}

type SupplyTable = {
  /** Output level per settlement and good (only the goods it makes), and the rules behind it. */
  output: Record<string, Partial<Record<Good, number>>>
  rules: Record<string, Partial<Record<Good, string[]>>>
  supply: Record<string, Record<Good, SupplySource>>
}

const NONE: SupplySource = { level: SUPPLY_MIN, from: null, days: null, output: 0 }

const memo = new WeakMap<Content, WeakMap<WorldState['settlements'], SupplyTable>>()

/** The best producer of each good within reach of every settlement, given what each makes. */
function supplyFrom(
  ids: string[],
  output: SupplyTable['output'],
  reach: (id: string) => ReturnType<typeof settlementReach>
): SupplyTable['supply'] {
  const supply: SupplyTable['supply'] = {}
  for (const id of ids) {
    const roads = reach(id)
    const row = Object.fromEntries(GOODS.map((g) => [g, NONE])) as Record<Good, SupplySource>
    for (const from of ids) {
      const days = from === id ? 0 : roads.get(from)?.days
      if (days === undefined) continue
      for (const [good, out] of Object.entries(output[from]) as [Good, number][]) {
        const level = Math.max(
          SUPPLY_MIN,
          Math.min(MARKET_LEVEL_MAX, out - Math.floor(days / SUPPLY_DAYS_PER_LEVEL))
        )
        const best = row[good]
        // The higher level wins; then the nearer producer, then the bigger one, then the id.
        if (
          best.from === null ||
          level > best.level ||
          (level === best.level && (days < best.days! || (days === best.days && out > best.output)))
        ) {
          row[good] = { level, from, days, output: out }
        }
      }
    }
    supply[id] = row
  }
  return supply
}

/**
 * Two passes: the rules without inputs first (mines, fields, workshops), then the rules whose
 * inputs must be to hand (`supplyAtLeast`, e.g. a smith making arms where metal is near), judged
 * on the first pass's supply. A rule's inputs never come from another input rule, so it is exact.
 */
function build(world: WorldState, content: Content): SupplyTable {
  const all = sortedEntries(content.producers)
  const ids = Object.keys(world.settlements).sort(byCodeUnit)
  const poisOf = new Map<string, Set<PoiCategory>>()
  for (const poi of Object.values(world.pois)) {
    if (!poisOf.has(poi.domain)) poisOf.set(poi.domain, new Set())
    poisOf.get(poi.domain)!.add(poi.category)
  }
  const places = new Map<string, ProducerPlace>()
  for (const id of ids) {
    const info = world.settlements[id]
    const site = own(content.settlements, id)
    places.set(id, {
      type: info.type,
      sizeTier: info.sizeTier,
      biome: site ? (own(content.regions, site.region)?.biome ?? null) : null,
      coastal: site?.coastal ?? false,
      wealth: info.wealth,
      pois: [...(poisOf.get(id) ?? [])],
      services: info.services,
    })
  }
  const roads = new Map<string, ReturnType<typeof settlementReach>>()
  const reach = (id: string) => {
    if (!roads.has(id)) roads.set(id, settlementReach(content, id))
    return roads.get(id)!
  }
  const output: SupplyTable['output'] = {}
  const why: SupplyTable['rules'] = {}
  const apply = (rules: ProducerRule[], supply?: SupplyTable['supply']) => {
    for (const id of ids) {
      const made = (output[id] ??= {})
      const by = (why[id] ??= {})
      const level = (good: Good) => supply?.[id][good].level ?? SUPPLY_MIN
      for (const rule of rules) {
        if (!producerApplies(rule, places.get(id)!, level)) continue
        for (const [good, out] of Object.entries(rule.output) as [Good, number][]) {
          made[good] = Math.min(MARKET_LEVEL_MAX, (made[good] ?? 0) + out)
          by[good] = [...(by[good] ?? []), rule.id]
        }
      }
    }
  }
  const raw = all.filter((rule) => rule.when.supplyAtLeast === undefined)
  const worked = all.filter((rule) => rule.when.supplyAtLeast !== undefined)
  apply(raw)
  if (worked.length > 0) apply(worked, supplyFrom(ids, output, reach))
  return { output, rules: why, supply: supplyFrom(ids, output, reach) }
}

function table(world: WorldState, content: Content): SupplyTable {
  let byWorld = memo.get(content)
  if (!byWorld) memo.set(content, (byWorld = new WeakMap()))
  let t = byWorld.get(world.settlements)
  if (!t) byWorld.set(world.settlements, (t = build(world, content)))
  return t
}

/** A market's supply of a good: its level and the producer it comes from. */
export function supplyOf(
  state: Pick<GameState, 'world'>,
  content: Content,
  settlementId: string,
  good: Good
): SupplySource {
  return own(table(state.world, content).supply, settlementId)?.[good] ?? NONE
}

/** What a settlement makes: each good's output level (1–3) and the producer rules behind it. */
export function production(
  state: Pick<GameState, 'world'>,
  content: Content,
  settlementId: string
): { good: Good; output: number; rules: string[] }[] {
  const t = table(state.world, content)
  const made = own(t.output, settlementId) ?? {}
  return GOODS.filter((g) => (made[g] ?? 0) > 0).map((good) => ({
    good,
    output: made[good]!,
    rules: own(t.rules, settlementId)?.[good] ?? [],
  }))
}

/** Every settlement that makes a good, with its output level. */
export function producersOf(
  state: Pick<GameState, 'world'>,
  content: Content,
  good: Good
): { id: string; output: number }[] {
  const t = table(state.world, content)
  return Object.keys(t.output)
    .filter((id) => (t.output[id][good] ?? 0) > 0)
    .map((id) => ({ id, output: t.output[id][good]! }))
}

/**
 * The nearest settlement that makes a good, from `from` by road or sea (itself at 0 days), with
 * its steady and forced-march days; null when none can be reached.
 */
export function nearestProducer(
  state: Pick<GameState, 'world'>,
  content: Content,
  from: string,
  good: Good
): { id: string; km: number; days: number; forcedDays: number } | null {
  const roads = settlementReach(content, from)
  let best: { id: string; km: number; days: number; forcedDays: number } | null = null
  for (const { id } of producersOf(state, content, good)) {
    const r = id === from ? { km: 0, days: 0, forcedDays: 0 } : roads.get(id)
    if (!r) continue
    if (!best || r.days < best.days || (r.days === best.days && r.km < best.km)) {
      best = { id, ...r }
    }
  }
  return best
}
