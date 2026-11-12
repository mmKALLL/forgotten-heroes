import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { ProducerRule } from '../../schema/economy'
import { GOODS, type Good, type PoiCategory } from '../../schema/types'
import type { GameState } from '../../schema/state'
import type { WorldState } from '../../schema/world'
import { settlementReach } from '../travel/reach'
import { MARKET_LEVEL_MAX, SUPPLY_DAYS_PER_LEVEL, SUPPLY_MIN } from '../constants'

// Geographic supply (design §4, designer decision): goods are made in particular settlements,
// chosen by the producer rules (data/claude/producers.json) on land, type, size, wealth and the
// sites in the domain. A market's supply of a good is the best producer within reach, less a
// level for every SUPPLY_DAYS_PER_LEVEL steady days of road: near a producer it is cheap, far from
// any it is scarce. Nothing here changes after the world is rolled, so the whole table is worked
// out once per world and content (like territory) and kept.

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

/** What a settlement offers a producer rule: its type, size, land, coast, wealth and sites. */
type ProducerPlace = {
  type: string
  sizeTier: number
  biome: string | null
  coastal: boolean
  wealth: number
  /** Categories of every site in its domain, inhabited or not. */
  pois: PoiCategory[]
}

/** Whether every condition of a producer rule holds in a settlement. */
export function producerApplies(rule: ProducerRule, place: ProducerPlace): boolean {
  const w = rule.when
  return (
    (w.types === undefined || w.types.includes(place.type)) &&
    (w.biomes === undefined || (place.biome !== null && w.biomes.some((b) => b === place.biome))) &&
    (w.coastal === undefined || w.coastal === place.coastal) &&
    (w.minSize === undefined || place.sizeTier >= w.minSize) &&
    (w.maxSize === undefined || place.sizeTier <= w.maxSize) &&
    (w.minWealth === undefined || place.wealth >= w.minWealth) &&
    (w.nearPoi === undefined || w.nearPoi.some((c) => place.pois.includes(c)))
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

function build(world: WorldState, content: Content): SupplyTable {
  const rules = sortedEntries(content.producers)
  const ids = Object.keys(world.settlements).sort(byCodeUnit)
  const poisOf = new Map<string, Set<PoiCategory>>()
  for (const poi of Object.values(world.pois)) {
    if (!poisOf.has(poi.domain)) poisOf.set(poi.domain, new Set())
    poisOf.get(poi.domain)!.add(poi.category)
  }
  const output: SupplyTable['output'] = {}
  const why: SupplyTable['rules'] = {}
  for (const id of ids) {
    const info = world.settlements[id]
    const site = own(content.settlements, id)
    const place: ProducerPlace = {
      type: info.type,
      sizeTier: info.sizeTier,
      biome: site ? (own(content.regions, site.region)?.biome ?? null) : null,
      coastal: site?.coastal ?? false,
      wealth: info.wealth,
      pois: [...(poisOf.get(id) ?? [])],
    }
    const made: Partial<Record<Good, number>> = {}
    const by: Partial<Record<Good, string[]>> = {}
    for (const rule of rules) {
      if (!producerApplies(rule, place)) continue
      for (const [good, level] of Object.entries(rule.output) as [Good, number][]) {
        made[good] = Math.min(MARKET_LEVEL_MAX, (made[good] ?? 0) + level)
        by[good] = [...(by[good] ?? []), rule.id]
      }
    }
    output[id] = made
    why[id] = by
  }
  const supply: SupplyTable['supply'] = {}
  for (const id of ids) {
    const roads = settlementReach(content, id)
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
  return { output, rules: why, supply }
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
