import { writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { load } from '../engine/economy/capacity'
import { goodPrice } from '../engine/economy/goods'
import { midPrice, shopsFor } from '../engine/economy/market'
import { newGame, type Action } from '../engine/state'
import { trader, type TraderOptions, type TraderWhy } from '../engine/travel/trader'
import { wander } from '../engine/travel/wander'
import { settlementName } from '../engine/world/geo'
import { MAX_EXHAUSTION } from '../engine/rules/character'
import { GameStateSchema, type GameState } from '../schema/state'
import { GOODS, type ContractKind, type Good } from '../schema/types'
import { loadBundledContent } from './bundled'

// The economy simulation (design §10, Plan 4 I1). The guard tests below run a few seeds with
// generous bounds; they never pin tuning values. The full report runs seeds 1–30 for 60 days under
// four policies and writes markdown to the path in ECONOMY_REPORT:
//
//   ECONOMY_REPORT=/tmp/economy.md pnpm vitest run src/content/economy.sim.test.ts
//
// docs/notes/economy-report.md records the numbers and what was tuned.

const content = loadBundledContent()
const REPORT = process.env.ECONOMY_REPORT

/** Goods the road eats; everything else is cargo. */
const isCargo = (good: Good) => good !== 'food' && good !== 'water'

/** The days the report's gold curve looks at. */
const CURVE_DAYS = [5, 10, 15, 20, 25, 30]

/** Gold under this with no cargo worth as much (and no contract in hand) is broke. */
const BROKE_GP = 5

type Policy = 'trader' | 'contracts only' | 'trade only' | 'wander'

const POLICY_OPTIONS: Record<Exclude<Policy, 'wander'>, TraderOptions> = {
  trader: {},
  'contracts only': { trade: false },
  'trade only': { contracts: false },
}

/** One trade: a good bought in one market and sold in another. */
type Sale = { good: Good; route: string; units: number; cost: number; revenue: number }

type Run = {
  seed: number
  policy: Policy
  days: number
  /** Net worth (gold + cargo at base price) per day, by day 30 and by the end. */
  perDay30: number
  /** Gold on days 5, 10, … 30 (CURVE_DAYS), as first seen on or after each. */
  curve: (number | null)[]
  /** The day the first contract was completed, if any. */
  firstPay: number | null
  perDay: number
  brokeDay: number | null
  deaths: number
  contracts: Record<ContractKind, { taken: number; done: number; failed: number }>
  income: {
    contracts: number
    tradeProfit: number
    lootGold: number
    lootGoods: number
    lootSold: number
  }
  spend: Record<'food' | 'lodging' | 'fares' | 'rumours' | 'animals' | 'losses' | 'upkeep', number>
  sales: Sale[]
  cargoBuys: number
  weightBound: number
  goldBound: number
  time: Record<'road' | 'town' | 'explore' | 'camp', number>
}

const worth = (state: GameState) =>
  state.gold +
  GOODS.filter(isCargo).reduce((sum, g) => {
    const held = state.contracts
      .filter((c) => c.kind === 'courier' && c.good === g)
      .reduce((n, c) => n + c.amount, 0)
    return sum + Math.max(0, (state.goods[g] ?? 0) - held) * goodPrice(content, g)
  }, 0)

/**
 * Broke: in a settlement with under BROKE_GP gold, no cargo worth as much, and no contract in
 * hand to be paid for (a party on its first job with 3 gp left is poor, not broke).
 */
const broke = (state: GameState) =>
  !state.travel &&
  state.location !== null &&
  Object.hasOwn(state.world.settlements, state.location) &&
  state.gold < BROKE_GP &&
  worth(state) - state.gold < BROKE_GP &&
  state.contracts.length === 0

const emptyKinds = () =>
  Object.fromEntries(
    (['courier', 'supply', 'escort', 'bounty', 'errand'] as const).map((k) => [
      k,
      { taken: 0, done: 0, failed: 0 },
    ])
  ) as Run['contracts']

/** Runs one seed under one policy until `days`, keeping the books. */
function simulate(
  seed: number,
  policy: Policy,
  days: number,
  gold?: number
): { run: Run; state: GameState } {
  const fresh = newGame(seed, content)
  const start = gold === undefined ? fresh : { ...fresh, gold }
  const run: Run = {
    seed,
    policy,
    days: 0,
    perDay30: 0,
    curve: CURVE_DAYS.map(() => null),
    firstPay: null,
    perDay: 0,
    brokeDay: null,
    deaths: 0,
    contracts: emptyKinds(),
    income: { contracts: 0, tradeProfit: 0, lootGold: 0, lootGoods: 0, lootSold: 0 },
    spend: { food: 0, lodging: 0, fares: 0, rumours: 0, animals: 0, losses: 0, upkeep: 0 },
    sales: [],
    cargoBuys: 0,
    weightBound: 0,
    goldBound: 0,
    time: { road: 0, town: 0, explore: 0, camp: 0 },
  }
  let worth30: number | null = null
  const basis: Partial<Record<Good, { cost: number; from: string | null }>> = {}

  const watch = (before: GameState, after: GameState) => {
    if (worth30 === null && after.day >= 30) worth30 = worth(after)
    CURVE_DAYS.forEach((d, i) => {
      if (run.curve[i] === null && after.day >= d) run.curve[i] = after.gold
    })
    if (run.brokeDay === null && broke(after)) run.brokeDay = after.day
    for (const c of before.contracts) {
      if (!after.contracts.some((x) => x.id === c.id) && !(after.gold > before.gold && c.met)) {
        run.contracts[c.kind].failed++
      }
    }
  }

  const onStep = (before: GameState, action: Action, after: GameState, why: TraderWhy) => {
    const gold = after.gold - before.gold
    const days = after.day - before.day
    const here = before.location
    const inTown = here !== null && !before.travel && Object.hasOwn(before.world.settlements, here)
    if (why === 'explore') run.time.explore += days
    else if (action.type === 'rest' && inTown) run.time.town += days
    else if (action.type === 'rest') run.time.camp += days
    else run.time.road += days
    // Goods gained or lost: cost basis and loot.
    for (const good of GOODS) {
      const was = before.goods[good] ?? 0
      const now = after.goods[good] ?? 0
      if (now === was) continue
      if (now > was) {
        const paid = why === 'cargo' || why === 'supply' ? -gold : 0
        const old = basis[good] ?? { cost: 0, from: null }
        basis[good] = {
          cost: (old.cost * was + paid) / now,
          from: why === 'cargo' ? here : old.from,
        }
        if ((why === 'encounter' || why === 'site' || why === 'explore') && isCargo(good)) {
          run.income.lootGoods += (now - was) * goodPrice(content, good)
        }
      } else if (why === 'sell' && action.type === 'sellGoods') {
        const units = was - now
        const b = basis[good] ?? { cost: 0, from: null }
        if (b.cost === 0) run.income.lootSold += gold
        else {
          run.income.tradeProfit += gold - b.cost * units
          const route = `${b.from ? settlementName(after, b.from) : '?'} → ${settlementName(after, here!)}`
          run.sales.push({ good, route, units, cost: b.cost * units, revenue: gold })
        }
      }
      if (now === 0) delete basis[good]
    }
    switch (why) {
      case 'contract':
        if (action.type === 'acceptContract') {
          const c = after.contracts.find((x) => x.id === action.offerId)
          if (c) run.contracts[c.kind].taken++
        } else if (action.type === 'completeContract') {
          const c = before.contracts.find((x) => x.id === action.id)
          if (c && !after.contracts.some((x) => x.id === c.id)) run.contracts[c.kind].done++
          run.income.contracts += gold
          if (gold > 0) run.firstPay ??= after.day
        }
        break
      case 'cargo': {
        run.cargoBuys++
        if (load(after, content).ratio >= 0.9) run.weightBound++
        if (after.gold < 25) run.goldBound++
        break
      }
      case 'provision':
        run.spend.food -= gold
        break
      case 'rest':
        run.spend.lodging -= gold
        break
      case 'rumours':
        run.spend.rumours -= gold
        break
      case 'animal':
        run.spend.animals -= gold
        break
      case 'travel':
        if (action.type === 'travel') run.spend.fares -= gold
        else if (gold < 0) run.spend.upkeep -= gold
        else run.income.lootGold += gold
        break
      case 'encounter':
      case 'site':
      case 'explore':
        if (gold > 0) run.income.lootGold += gold
        else run.spend.losses -= gold
        break
      default:
        break
    }
    watch(before, after)
  }

  let state = start
  if (policy === 'wander') {
    for (let leg = 0; leg < 300 && state.day < days; leg++) {
      const before = state
      state = wander(
        state,
        content,
        1,
        (_l, count) => (leg * 7 + seed) % count,
        (_l, count) => (leg * 3 + seed) % count
      )
      watch(before, state)
      if (!state.party.some((c) => c.exhaustion < MAX_EXHAUSTION)) break
    }
  } else {
    state = trader(start, content, 300, {
      ...POLICY_OPTIONS[policy],
      pick: (leg, count) => (leg * 7 + seed) % count,
      until: (s) => s.day >= days,
      onStep,
    })
  }
  run.days = state.day
  run.deaths = state.party.filter((c) => c.exhaustion >= MAX_EXHAUSTION).length
  const w0 = worth(start)
  run.perDay30 = ((worth30 ?? worth(state)) - w0) / Math.min(29, Math.max(1, state.day - 1))
  run.perDay = (worth(state) - w0) / Math.max(1, state.day - 1)
  return { run, state }
}

const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return NaN
  const sorted = [...xs].sort((a, b) => a - b)
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo)
}
const median = (xs: number[]) => quantile(xs, 0.5)
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '–')
const pct = (n: number) => `${Math.round(n * 100)}%`

/** Each traded good's dearest-to-cheapest mid price across a world, where some shop trades it. */
function priceSpreads(seeds: number[], days: number[]): Record<Good, number[]> {
  const spreads = Object.fromEntries(GOODS.map((g) => [g, [] as number[]])) as Record<
    Good,
    number[]
  >
  for (const seed of seeds) {
    const state = newGame(seed, content)
    for (const day of days) {
      for (const good of GOODS) {
        if (goodPrice(content, good) <= 0) continue
        const prices = Object.keys(state.world.settlements)
          .filter((id) => shopsFor(state, content, id, good).length > 0)
          .map((id) => midPrice(state, content, id, good, day))
        if (prices.length > 1) spreads[good].push(Math.max(...prices) / Math.min(...prices))
      }
    }
  }
  return spreads
}

describe('the economy (guards with generous bounds)', () => {
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => simulate(seed, 'trader', 30))

  test('the trader runs seeds 1–8 for 30 days and keeps a valid state', () => {
    for (const { state } of runs) {
      expect(GameStateSchema.parse(state)).toEqual(state)
      expect(state.day).toBeGreaterThanOrEqual(30)
    }
  })

  test('seeds 1–3 have no deaths', () => {
    expect(runs.slice(0, 3).map((r) => r.run.deaths)).toEqual([0, 0, 0])
  })

  test('the trader earns: median net worth a day is above 0', () => {
    expect(median(runs.map((r) => r.run.perDay30))).toBeGreaterThan(0)
  })

  test('fewer than a quarter of traders go broke by day 30', () => {
    expect(runs.filter((r) => r.run.brokeDay !== null).length / runs.length).toBeLessThan(0.25)
  })

  test('food’s dearest mid price is at most 4.5× its cheapest (seeds 1–5, days 1 and 100)', () => {
    const food = priceSpreads([1, 2, 3, 4, 5], [1, 100]).food
    expect(Math.max(...food)).toBeLessThanOrEqual(4.5)
  })
})

describe.runIf(REPORT)('the economy report (ECONOMY_REPORT=path)', () => {
  test('seeds 1–30, 60 days, four policies', { timeout: 600_000 }, () => {
    const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)
    const DAYS = 60
    const policies: Policy[] = ['trader', 'contracts only', 'trade only', 'wander']
    const all = policies.map((policy) => ({
      policy,
      runs: SEEDS.map((seed) => simulate(seed, policy, DAYS).run),
    }))
    const lines: string[] = []
    const row = (cells: (string | number)[]) => lines.push(`| ${cells.join(' | ')} |`)

    lines.push(`## Policies (seeds 1–${SEEDS.length}, ${DAYS} days)`, '')
    row([
      'Policy',
      'gp/day by 30 (P10 / median / P90)',
      'gp/day by 60 (P10 / median / P90)',
      'IQR by 60',
      'Broke by 30',
      'Broke by 60',
      'Deaths',
    ])
    row(['---', '---', '---', '---', '---', '---', '---'])
    for (const { policy, runs } of all) {
      const d30 = runs.map((r) => r.perDay30)
      const d60 = runs.map((r) => r.perDay)
      const brokeBy = (day: number) =>
        runs.filter((r) => r.brokeDay !== null && r.brokeDay <= day).length / runs.length
      row([
        policy,
        `${f1(quantile(d30, 0.1))} / ${f1(median(d30))} / ${f1(quantile(d30, 0.9))}`,
        `${f1(quantile(d60, 0.1))} / ${f1(median(d60))} / ${f1(quantile(d60, 0.9))}`,
        `${f1(quantile(d60, 0.25))} – ${f1(quantile(d60, 0.75))}`,
        pct(brokeBy(30)),
        pct(brokeBy(60)),
        runs.reduce((n, r) => n + r.deaths, 0),
      ])
    }

    lines.push('', '## The first 30 days: gold in hand (P10 / median / P90)', '')
    row(['Policy', ...CURVE_DAYS.map((d) => `Day ${d}`), 'First contract paid (median day)'])
    row(['---', ...CURVE_DAYS.map(() => '---'), '---'])
    for (const { policy, runs } of all) {
      const at = (i: number) => runs.map((r) => r.curve[i] ?? 0)
      const paid = runs.map((r) => r.firstPay).filter((d): d is number => d !== null)
      row([
        policy,
        ...CURVE_DAYS.map(
          (_, i) =>
            `${Math.round(quantile(at(i), 0.1))} / ${Math.round(median(at(i)))} / ${Math.round(quantile(at(i), 0.9))}`
        ),
        paid.length > 0 ? `${Math.round(median(paid))} (${paid.length}/${runs.length} runs)` : '–',
      ])
    }

    for (const { policy, runs } of all.filter((p) => p.policy !== 'wander')) {
      const n = runs.length
      const sum = (f: (r: Run) => number) => runs.reduce((s, r) => s + f(r), 0) / n
      lines.push('', `## ${policy}: where the money comes from (mean per run)`, '')
      row(['Income', 'gp', 'Spending', 'gp'])
      row(['---', '---', '---', '---'])
      const income: [string, number][] = [
        ['Contract pay', sum((r) => r.income.contracts)],
        ['Trade profit (sales − cost)', sum((r) => r.income.tradeProfit)],
        ['Loot: gold', sum((r) => r.income.lootGold)],
        ['Loot: goods (base value)', sum((r) => r.income.lootGoods)],
        ['Loot: goods sold for', sum((r) => r.income.lootSold)],
      ]
      const spend: [string, number][] = [
        ['Food and waterskins', sum((r) => r.spend.food)],
        ['Lodging', sum((r) => r.spend.lodging)],
        ['Fares', sum((r) => r.spend.fares)],
        ['Rumours', sum((r) => r.spend.rumours)],
        ['Animals', sum((r) => r.spend.animals)],
        ['Animals’ upkeep', sum((r) => r.spend.upkeep)],
        ['Encounter losses', sum((r) => r.spend.losses)],
      ]
      for (let i = 0; i < Math.max(income.length, spend.length); i++) {
        row([
          income[i]?.[0] ?? '',
          income[i] ? f1(income[i][1]) : '',
          spend[i]?.[0] ?? '',
          spend[i] ? f1(spend[i][1]) : '',
        ])
      }
      lines.push('', 'Contracts (taken / done / failed, all runs):', '')
      row(['Kind', 'Taken', 'Done', 'Failed'])
      row(['---', '---', '---', '---'])
      for (const kind of ['courier', 'supply', 'escort', 'bounty', 'errand'] as const) {
        const t = runs.reduce(
          (a, r) => ({
            taken: a.taken + r.contracts[kind].taken,
            done: a.done + r.contracts[kind].done,
            failed: a.failed + r.contracts[kind].failed,
          }),
          { taken: 0, done: 0, failed: 0 }
        )
        row([kind, t.taken, t.done, t.failed])
      }
      const time = (k: keyof Run['time']) => f1(sum((r) => r.time[k]))
      lines.push(
        '',
        `Time (mean days): road ${time('road')}, resting in town ${time('town')}, ` +
          `camping ${time('camp')}, exploring ${time('explore')}.`,
        `Cargo buys: ${runs.reduce((s, r) => s + r.cargoBuys, 0)}, of which ` +
          `${runs.reduce((s, r) => s + r.weightBound, 0)} left the party at 90%+ of its capacity ` +
          `and ${runs.reduce((s, r) => s + r.goldBound, 0)} left it under 25 gp.`
      )
      const sales = runs.flatMap((r) => r.sales)
      if (sales.length > 0) {
        const margins = sales.map((s) => (s.revenue - s.cost) / Math.max(1, s.cost))
        const med = median(margins)
        lines.push('', `Trade margins: median ${pct(med)} over ${sales.length} sales.`, '')
        row(['Good', 'Sales', 'Profit (all runs)', 'Median margin', 'Outlier (> 3× median)'])
        row(['---', '---', '---', '---', '---'])
        for (const good of GOODS) {
          const mine = sales.filter((s) => s.good === good)
          if (mine.length === 0) continue
          const m = median(mine.map((s) => (s.revenue - s.cost) / Math.max(1, s.cost)))
          const profit = mine.reduce((s, x) => s + x.revenue - x.cost, 0)
          row([good, mine.length, f1(profit), pct(m), m > 3 * med && med > 0 ? 'yes' : ''])
        }
        const routes = new Map<string, { profit: number; sales: number; cost: number }>()
        for (const s of sales) {
          const key = `${s.good}: ${s.route}`
          const r = routes.get(key) ?? { profit: 0, sales: 0, cost: 0 }
          routes.set(key, {
            profit: r.profit + s.revenue - s.cost,
            sales: r.sales + 1,
            cost: r.cost + s.cost,
          })
        }
        lines.push('', 'Best routes (by total profit, all runs):', '')
        row(['Route', 'Sales', 'Profit', 'Margin'])
        row(['---', '---', '---', '---'])
        for (const [key, r] of [...routes].sort((a, b) => b[1].profit - a[1].profit).slice(0, 8)) {
          row([key, r.sales, f1(r.profit), pct(r.profit / Math.max(1, r.cost))])
        }
      }
    }

    // For the designer's reference: the same trader with a 10 gp start (STARTING_GOLD is theirs).
    const poor = SEEDS.map((seed) => simulate(seed, 'trader', DAYS, 10).run)
    const poorBroke = (day: number) =>
      poor.filter((r) => r.brokeDay !== null && r.brokeDay <= day).length / poor.length
    const poorAt = (i: number) => poor.map((r) => r.curve[i] ?? 0)
    lines.push(
      '',
      '## Reference: the trader with a 10 gp start',
      '',
      `gp/day by 30: median ${f1(median(poor.map((r) => r.perDay30)))}; ` +
        `broke by 30: ${pct(poorBroke(30))}, by 60: ${pct(poorBroke(60))}; ` +
        `deaths: ${poor.reduce((n, r) => n + r.deaths, 0)}. Gold in hand (P10 / median / P90): ` +
        CURVE_DAYS.map(
          (d, i) =>
            `day ${d} ${Math.round(quantile(poorAt(i), 0.1))} / ${Math.round(median(poorAt(i)))} / ${Math.round(quantile(poorAt(i), 0.9))}`
        ).join(', ') +
        '.'
    )

    lines.push('', '## Price spreads: dearest ÷ cheapest mid price per world', '')
    lines.push('Seeds 1–30, days 1, 50 and 100, where some shop trades the good.', '')
    const spreads = priceSpreads(SEEDS, [1, 50, 100])
    row(['Good', 'Base gp', 'Min', 'Median', 'Max'])
    row(['---', '---', '---', '---', '---'])
    for (const good of GOODS) {
      const xs = spreads[good]
      if (xs.length === 0) continue
      row([
        good,
        goodPrice(content, good),
        `${f1(Math.min(...xs))}×`,
        `${f1(median(xs))}×`,
        `${f1(Math.max(...xs))}×`,
      ])
    }
    writeFileSync(REPORT!, lines.join('\n') + '\n')
    console.log(lines.join('\n'))
  })
})
