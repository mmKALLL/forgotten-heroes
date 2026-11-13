import { writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { load } from '../engine/economy/capacity'
import { goodPrice } from '../engine/economy/goods'
import { midPrice, quote, shopsFor } from '../engine/economy/market'
import { noticeBoard } from '../engine/town/contracts'
import { newGame, step, type Action } from '../engine/state'
import { trader, type TraderOptions, type TraderWhy } from '../engine/travel/trader'
import { wander } from '../engine/travel/wander'
import { settlementName } from '../engine/world/geo'
import { dangerLevel } from '../engine/world/danger'
import { gatherOptions, type GatherOption } from '../engine/world/gather'
import { isAlive, isHired, livingMembers } from '../engine/town/camaraderie'
import { MAX_EXHAUSTION } from '../engine/rules/character'
import { STARTING_GOLD } from '../engine/constants'
import { GameStateSchema, type GameState } from '../schema/state'
import { CONTRACT_KINDS, GOODS, type ContractKind, type Good } from '../schema/types'
import { loadBundledContent } from './bundled'

// The economy simulation (design §10, Plan 4 I1). The guard tests below run a few seeds with
// generous bounds; they never pin tuning values. The full report runs seeds 1–30 for 60 days under
// six policies (plus the game's 10 gp start, 120-day runs for levels and danger, and gathering
// probes) and writes markdown to the path in ECONOMY_REPORT:
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
/** The days the report samples the party's level and size on. */
const LEVEL_DAYS = [10, 15, 30, 60, 120]
/** The danger ramp's bands (DANGER_RAMP_DAYS): encounters and deaths are counted per band. */
const BAND_DAYS = 50

/**
 * The sim's own starting gold: the guards and the policy tables start every party with this, so
 * they don't move when the designer changes STARTING_GOLD. The report adds a section for a party
 * that starts with the game's STARTING_GOLD.
 */
const SIM_GOLD = 50

/** Gold under this with no cargo worth as much (and no contract in hand) is broke. */
const BROKE_GP = 5

type Policy =
  | 'trader'
  | 'trader, one recruit at most'
  | 'trader, no recruits'
  | 'contracts only'
  | 'trade only'
  | 'wander'

const POLICY_OPTIONS: Record<Exclude<Policy, 'wander'>, TraderOptions> = {
  trader: {},
  'trader, one recruit at most': { hireUpTo: 3 },
  'trader, no recruits': { hire: false },
  'contracts only': { trade: false },
  'trade only': { contracts: false },
}
/** The policies whose books the report opens (the trader variants share the trader's). */
const BOOKS: Policy[] = ['trader', 'contracts only', 'trade only']

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
    gearSold: number
  }
  spend: Record<
    'food' | 'lodging' | 'fares' | 'rumours' | 'animals' | 'losses' | 'upkeep' | 'hiring',
    number
  >
  /** Gathering days and what they brought home (at the local sell price), by week of play too. */
  gather: { days: number; gp: number; byWeek: { days: number; gp: number }[] }
  /** The party's best level and its living members on LEVEL_DAYS (null when not reached). */
  level: (number | null)[]
  members: (number | null)[]
  /** Still poor (worth under 2 × BROKE_GP, no contract) on day 30 and day 60: not recovered. */
  poor: (boolean | null)[]
  hires: number
  desertions: number
  /** Encounter checks rolled and succeeded (success or better), and deaths, per BAND_DAYS. */
  bands: { checks: number; successes: number; deaths: number }[]
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
      .filter((c) => (c.kind === 'courier' || c.kind === 'freight') && c.good === g)
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
    CONTRACT_KINDS.map((k) => [k, { taken: 0, done: 0, failed: 0 }])
  ) as Run['contracts']

/** What `units` of a good fetch at a settlement's market now (half the base price where none buys). */
const gatherValue = (state: GameState, at: string, good: Good, units: number): number =>
  quote(state, content, at, good, 'sell', units)?.total ?? units * goodPrice(content, good) * 0.5

/** A gathering option's expected value: each tier's units at the local sell price. */
const expectedGather = (state: GameState, option: GatherOption): number =>
  option.outcomes.reduce(
    (sum, o) =>
      sum +
      (o.units > 0 ? o.chance * gatherValue(state, state.location!, option.good, o.units) : 0),
    0
  )

/** Runs one seed under one policy until `days`, keeping the books. */
function simulate(
  seed: number,
  policy: Policy,
  days: number,
  gold = SIM_GOLD,
  extra: TraderOptions = {}
): { run: Run; state: GameState } {
  const start = { ...newGame(seed, content), gold }
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
    income: { contracts: 0, tradeProfit: 0, lootGold: 0, lootGoods: 0, lootSold: 0, gearSold: 0 },
    spend: {
      food: 0,
      lodging: 0,
      fares: 0,
      rumours: 0,
      animals: 0,
      losses: 0,
      upkeep: 0,
      hiring: 0,
    },
    gather: { days: 0, gp: 0, byWeek: [] },
    level: LEVEL_DAYS.map(() => null),
    members: LEVEL_DAYS.map(() => null),
    poor: [null, null],
    hires: 0,
    desertions: 0,
    bands: [],
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
    ;[30, 60].forEach((d, i) => {
      if (run.poor[i] === null && after.day >= d) {
        run.poor[i] = worth(after) < 2 * BROKE_GP && after.contracts.length === 0
      }
    })
    LEVEL_DAYS.forEach((d, i) => {
      if (run.level[i] !== null || after.day < d) return
      run.level[i] = Math.max(...after.party.map((c) => c.level))
      run.members[i] = livingMembers(after).length
    })
    const band = (day: number) =>
      (run.bands[Math.floor((day - 1) / BAND_DAYS)] ??= { checks: 0, successes: 0, deaths: 0 })
    const alive = new Set(livingMembers(before).map((c) => c.id))
    band(after.day).deaths += after.party.filter((c) => alive.has(c.id) && !isAlive(c)).length
    if (run.brokeDay === null && broke(after)) run.brokeDay = after.day
    for (const c of before.contracts) {
      if (!after.contracts.some((x) => x.id === c.id) && !(after.gold > before.gold && c.met)) {
        run.contracts[c.kind].failed++
      }
    }
  }

  const onStep = (before: GameState, action: Action, after: GameState, why: TraderWhy) => {
    const gold = after.gold - before.gold
    const here = before.location
    if (action.type === 'chooseOption' && after.lastRoll && after.lastRoll !== before.lastRoll) {
      const b = (run.bands[Math.floor((before.day - 1) / BAND_DAYS)] ??= {
        checks: 0,
        successes: 0,
        deaths: 0,
      })
      b.checks++
      if (after.lastRoll.tier === 'success' || after.lastRoll.tier === 'critSuccess') b.successes++
    }
    if (action.type !== 'dismissMember') {
      const left = new Set(after.party.map((c) => c.id))
      run.desertions += livingMembers(before).filter((c) => isHired(c) && !left.has(c.id)).length
    }
    if (action.type === 'gather' && here !== null) {
      const option = gatherOptions(before, content).find((x) => x.rule === action.rule)
      if (option) {
        // Food gathered is partly eaten the same day: count what the party ate too.
        const eaten = option.good === 'food' ? livingMembers(after).length : 0
        const units = Math.max(
          0,
          (after.goods[option.good] ?? 0) - (before.goods[option.good] ?? 0) + eaten
        )
        const gp = units > 0 ? gatherValue(after, here, option.good, units) : 0
        run.gather.days += days
        run.gather.gp += gp
        const week = Math.floor((before.day - 1) / 7)
        const w = (run.gather.byWeek[week] ??= { days: 0, gp: 0 })
        w.days += days
        w.gp += gp
      }
    }
    if (action.type === 'hireRecruit') {
      run.hires++
      run.spend.hiring -= gold
    }
    if (action.type === 'sellAccessory') run.income.gearSold += gold
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
        if (why === 'gather') {
          // Gathered: counted as gathering income, not loot.
        } else if ((why === 'encounter' || why === 'site' || why === 'explore') && isCargo(good)) {
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
    state = trader(start, content, 2000, {
      ...POLICY_OPTIONS[policy],
      ...extra,
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

  test(
    'from the game’s start, seeds 1–8 run 60 days (gathering, hiring, gear) and stay valid',
    { timeout: 60_000 },
    () => {
      for (let seed = 1; seed <= 8; seed++) {
        const { state } = simulate(seed, 'trader', 60, STARTING_GOLD)
        expect(GameStateSchema.parse(state)).toEqual(state)
      }
    }
  )

  test('food’s dearest mid price is at most 4.5× its cheapest (seeds 1–5, days 1 and 100)', () => {
    const food = priceSpreads([1, 2, 3, 4, 5], [1, 100]).food
    expect(Math.max(...food)).toBeLessThanOrEqual(4.5)
  })
})

describe.runIf(REPORT)('the economy report (ECONOMY_REPORT=path)', () => {
  test('seeds 1–30, 60 days, six policies', { timeout: 600_000 }, () => {
    const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)
    const DAYS = 60
    const policies: Policy[] = [
      'trader',
      'trader, one recruit at most',
      'trader, no recruits',
      'contracts only',
      'trade only',
      'wander',
    ]
    const all = policies.map((policy) => ({
      policy,
      runs: SEEDS.map((seed) => simulate(seed, policy, DAYS).run),
    }))
    const lines: string[] = []
    const row = (cells: (string | number)[]) => lines.push(`| ${cells.join(' | ')} |`)

    lines.push(`## Policies (seeds 1–${SEEDS.length}, ${DAYS} days, a ${SIM_GOLD} gp start)`, '')
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

    for (const { policy, runs } of all.filter((p) => BOOKS.includes(p.policy))) {
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
        ['Accessories sold', sum((r) => r.income.gearSold)],
        ['Gathering (local sell value)', sum((r) => r.gather.gp)],
      ]
      const spend: [string, number][] = [
        ['Food and waterskins', sum((r) => r.spend.food)],
        ['Lodging', sum((r) => r.spend.lodging)],
        ['Fares', sum((r) => r.spend.fares)],
        ['Rumours', sum((r) => r.spend.rumours)],
        ['Animals', sum((r) => r.spend.animals)],
        ['Animals’ upkeep', sum((r) => r.spend.upkeep)],
        ['Encounter losses', sum((r) => r.spend.losses)],
        ['Hiring fees', sum((r) => r.spend.hiring)],
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
      for (const kind of CONTRACT_KINDS) {
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

    const trader60 = all.find((p) => p.policy === 'trader')!.runs
    const brokeShare = (runs: Run[], day: number) =>
      runs.filter((r) => r.brokeDay !== null && r.brokeDay <= day).length / runs.length
    const deaths = (runs: Run[]) => runs.reduce((n, r) => n + r.deaths, 0)
    const spread = (xs: number[], digits = 0) => {
      const f = (n: number) => (Number.isFinite(n) ? n.toFixed(digits) : '–')
      return `${f(quantile(xs, 0.1))} / ${f(median(xs))} / ${f(quantile(xs, 0.9))}`
    }
    /** Every income source: contracts, trade, loot, accessories sold and gathering. */
    const income = (r: Run) =>
      r.income.contracts +
      Math.max(0, r.income.tradeProfit) +
      r.income.lootGold +
      r.income.lootSold +
      r.income.gearSold +
      r.gather.gp

    // The game's own start (STARTING_GOLD), with and without Plan 5a's additions to the policy.
    const poorVariants: { label: string; options: TraderOptions }[] = [
      { label: 'trader (gathers, hires, wears gear)', options: {} },
      { label: 'no gathering', options: { gather: false } },
      {
        label: 'none of gathering, hiring, gear',
        options: { gather: false, hire: false, gear: false },
      },
    ]
    const poor = poorVariants.map((v) => ({
      ...v,
      runs: SEEDS.map((seed) => simulate(seed, 'trader', DAYS, STARTING_GOLD, v.options).run),
    }))
    lines.push(
      '',
      `## The game's ${STARTING_GOLD} gp start (STARTING_GOLD), seeds 1–${SEEDS.length}, ${DAYS} days`,
      ''
    )
    row([
      'Trader',
      'gp/day by 30 (median)',
      'gp/day by 60 (median)',
      'Broke by 30',
      'Broke by 60',
      'Still poor on day 30 / 60',
      'Deaths',
    ])
    row(['---', '---', '---', '---', '---', '---', '---'])
    const stillPoor = (runs: Run[], i: number) =>
      runs.filter((r) => r.poor[i] === true).length / runs.length
    for (const { label, runs } of poor) {
      row([
        label,
        f1(median(runs.map((r) => r.perDay30))),
        f1(median(runs.map((r) => r.perDay))),
        pct(brokeShare(runs, 30)),
        pct(brokeShare(runs, 60)),
        `${pct(stillPoor(runs, 0))} / ${pct(stillPoor(runs, 1))}`,
        deaths(runs),
      ])
    }
    // What other starts would do (for the designer: STARTING_GOLD is theirs to set).
    lines.push('', 'The full trader with other starts:', '')
    row(['Start (gp)', 'Broke by 30', 'Broke by 60', 'Still poor on day 30', 'Deaths'])
    row(['---', '---', '---', '---', '---'])
    for (const gp of [15, 20, 25, 30]) {
      const runs = SEEDS.map((seed) => simulate(seed, 'trader', DAYS, gp).run)
      row([
        gp,
        pct(brokeShare(runs, 30)),
        pct(brokeShare(runs, 60)),
        pct(stillPoor(runs, 0)),
        deaths(runs),
      ])
    }
    const poorAt = (i: number) => poor[0].runs.map((r) => r.curve[i] ?? 0)
    lines.push(
      '',
      'Gold in hand, the full trader (P10 / median / P90): ' +
        CURVE_DAYS.map((d, i) => `day ${d} ${spread(poorAt(i))}`).join(', ') +
        '.'
    )

    const books = [
      { label: `${SIM_GOLD} gp trader`, runs: trader60 },
      { label: `${STARTING_GOLD} gp trader`, runs: poor[0].runs },
    ]
    lines.push('', `## Gathering (the trader, seeds 1–${SEEDS.length}, ${DAYS} days)`, '')
    row(['Start', 'Runs that gather', 'Days (mean)', 'gp (mean)', 'gp per day', 'Share of income'])
    row(['---', '---', '---', '---', '---', '---'])
    for (const { label, runs } of books) {
      const daysG = runs.reduce((n, r) => n + r.gather.days, 0)
      const gp = runs.reduce((n, r) => n + r.gather.gp, 0)
      const all = runs.reduce((n, r) => n + income(r), 0)
      row([
        label,
        `${runs.filter((r) => r.gather.days > 0).length}/${runs.length}`,
        f1(daysG / runs.length),
        f1(gp / runs.length),
        f1(gp / Math.max(1, daysG)),
        pct(gp / Math.max(1, all)),
      ])
    }
    const weeks = Math.ceil(DAYS / 7)
    lines.push('', 'gp per gathering day by week of play (gathering days in brackets):', '')
    row(['Start', ...Array.from({ length: weeks }, (_, w) => `Wk ${w + 1}`)])
    row(['---', ...Array.from({ length: weeks }, () => '---')])
    for (const { label, runs } of books) {
      row([
        label,
        ...Array.from({ length: weeks }, (_, w) => {
          const d = runs.reduce((n, r) => n + (r.gather.byWeek[w]?.days ?? 0), 0)
          const gp = runs.reduce((n, r) => n + (r.gather.byWeek[w]?.gp ?? 0), 0)
          return d > 0 ? `${f1(gp / d)} (${d})` : '–'
        }),
      ])
    }

    // Probes: a fresh starting party placed in each settlement (seeds 1–10).
    const PROBE_SEEDS = SEEDS.slice(0, 10)
    const byRule = new Map<string, number[]>()
    const domains: { state: GameState; id: string }[] = []
    for (const seed of PROBE_SEEDS) {
      const s0 = newGame(seed, content)
      for (const id of Object.keys(s0.world.settlements).sort()) {
        const at: GameState = { ...s0, location: id, travel: null }
        const options = gatherOptions(at, content)
        for (const o of options) {
          const list = byRule.get(o.rule) ?? []
          list.push(expectedGather(at, o))
          byRule.set(o.rule, list)
        }
        if (options.length > 0) domains.push({ state: at, id })
      }
    }
    const ruleMedians = [...byRule].map(([rule, xs]) => ({ rule, xs, med: median(xs) }))
    const mid = median(ruleMedians.map((r) => r.med))
    lines.push(
      '',
      `## Gathering rules: a fresh day's expected value for the starting party (seeds 1–${PROBE_SEEDS.length}, every settlement)`,
      ''
    )
    row(['Rule', 'Places', 'gp (P10 / median / P90)', '× the median rule'])
    row(['---', '---', '---', '---'])
    for (const { rule, xs, med } of ruleMedians.sort((a, b) => b.med - a.med)) {
      row([rule, xs.length, spread(xs, 1), `${(med / mid).toFixed(2)}×`])
    }

    // Saturation: the same party gathers the best option in one domain day after day, selling
    // what it brings home (food topped up so no one goes hungry), in every third domain.
    const PROBE_DAYS = 14
    const daily: number[][] = Array.from({ length: PROBE_DAYS }, () => [])
    const halfDay: number[] = []
    for (const { state: s0, id } of domains.filter((_, i) => i % 3 === 0)) {
      let st = s0
      const gp: number[] = []
      for (let d = 0; d < PROBE_DAYS; d++) {
        const ration = 2 * livingMembers(st).length
        st = { ...st, goods: { ...st.goods, food: ration } }
        const best = gatherOptions(st, content)
          .filter((x) => x.available)
          .map((x) => ({ x, v: expectedGather(st, x) }))
          .sort((a, b) => b.v - a.v)[0]
        if (!best) break
        daily[d].push(best.v)
        gp.push(best.v)
        st = step(st, { type: 'gather', rule: best.x.rule }, content)
        if (st.encounter) st = { ...st, encounter: null }
        const good = best.x.good
        const have = (st.goods[good] ?? 0) - (good === 'food' ? ration : 0)
        if (have > 0 && quote(st, content, id, good, 'sell', have)) {
          st = step(st, { type: 'sellGoods', good, amount: have }, content)
        }
      }
      const half = gp.findIndex((v) => v <= gp[0] / 2)
      halfDay.push(half < 0 ? PROBE_DAYS + 1 : half + 1)
    }
    const first = median(daily[0])
    lines.push(
      '',
      `## Gathering saturation: one domain, ${PROBE_DAYS} days running (${halfDay.length} domains, seeds 1–${PROBE_SEEDS.length})`,
      '',
      'Expected gp of the best option each day (median across domains), and its share of day 1:',
      ''
    )
    row(['Day', ...daily.map((_, d) => d + 1)])
    row(['---', ...daily.map(() => '---')])
    row(['gp', ...daily.map((xs) => f1(median(xs)))])
    row(['× day 1', ...daily.map((xs) => (median(xs) / first).toFixed(2))])
    lines.push(
      '',
      `The best option is first worth half its day-1 value on day ${spread(halfDay)} ` +
        `(P10 / median / P90; ${PROBE_DAYS + 1} = not within ${PROBE_DAYS} days).`
    )

    lines.push('', `## Recruiting (seeds 1–${SEEDS.length}, ${DAYS} days)`, '')
    row([
      'Start',
      'Members by 30 (P10 / median / P90)',
      'Members by 60',
      'Hires a run',
      'Sign-on fees a run (gp)',
      'Desertions (all runs)',
    ])
    row(['---', '---', '---', '---', '---', '---'])
    for (const { label, runs } of books) {
      const at = (day: number) =>
        runs.map((r) => r.members[LEVEL_DAYS.indexOf(day)]).filter((n): n is number => n !== null)
      row([
        label,
        spread(at(30)),
        spread(at(60)),
        f1(runs.reduce((n, r) => n + r.hires, 0) / runs.length),
        f1(runs.reduce((n, r) => n + r.spend.hiring, 0) / runs.length),
        runs.reduce((n, r) => n + r.desertions, 0),
      ])
    }

    // 120 days on seeds 1–10, for levels and the danger ramp.
    const LONG_DAYS = 120
    const long = PROBE_SEEDS.map((seed) => simulate(seed, 'trader', LONG_DAYS).run)
    lines.push('', '## Levels: the party’s best level (P10 / median / P90)', '')
    row(['Runs', ...LEVEL_DAYS.map((d) => `Day ${d}`)])
    row(['---', ...LEVEL_DAYS.map(() => '---')])
    const levelRow = (label: string, runs: Run[], upTo: number) =>
      row([
        label,
        ...LEVEL_DAYS.map((d, i) => {
          // A dead party's last rest can run past the end: only days the runs were meant to reach.
          const xs = runs.map((r) => r.level[i]).filter((n): n is number => n !== null)
          return xs.length > 0 && d <= upTo ? spread(xs) : '–'
        }),
      ])
    levelRow(`${SIM_GOLD} gp trader, seeds 1–${SEEDS.length}, ${DAYS} days`, trader60, DAYS)
    levelRow(
      `${STARTING_GOLD} gp trader, seeds 1–${SEEDS.length}, ${DAYS} days`,
      poor[0].runs,
      DAYS
    )
    levelRow(
      `${SIM_GOLD} gp trader, seeds 1–${PROBE_SEEDS.length}, ${LONG_DAYS} days`,
      long,
      LONG_DAYS
    )

    lines.push(
      '',
      `## Danger: the ${SIM_GOLD} gp trader by ${BAND_DAYS}-day band (seeds 1–${PROBE_SEEDS.length}, ${LONG_DAYS} days)`,
      ''
    )
    row(['Days', 'Danger', 'Encounter checks', 'Success or better', 'Deaths'])
    row(['---', '---', '---', '---', '---'])
    for (let b = 0; b * BAND_DAYS < LONG_DAYS; b++) {
      const checks = long.reduce((n, r) => n + (r.bands[b]?.checks ?? 0), 0)
      const wins = long.reduce((n, r) => n + (r.bands[b]?.successes ?? 0), 0)
      row([
        `${b * BAND_DAYS + 1}–${Math.min(LONG_DAYS, (b + 1) * BAND_DAYS)}`,
        `+${Math.round(dangerLevel(b * BAND_DAYS + 1) * 100)}%`,
        checks,
        pct(wins / Math.max(1, checks)),
        long.reduce((n, r) => n + (r.bands[b]?.deaths ?? 0), 0),
      ])
    }
    lines.push('', `Deaths over ${LONG_DAYS} days: ${deaths(long)} in ${long.length} runs.`)

    // How often each kind of contract is posted: every board in every world, weeks 1–9.
    const posted = Object.fromEntries(CONTRACT_KINDS.map((k) => [k, 0])) as Record<
      ContractKind,
      number
    >
    let boards = 0
    let withProcurement = 0
    for (const seed of SEEDS) {
      const state = newGame(seed, content)
      for (let week = 0; week < 9; week++) {
        for (const id of Object.keys(state.world.settlements)) {
          const offers = noticeBoard({ ...state, day: week * 7 + 1 }, content, id)
          if (offers.length === 0) continue
          boards++
          for (const o of offers) posted[o.kind]++
          if (offers.some((o) => o.kind === 'procurement')) withProcurement++
        }
      }
    }
    const offered = CONTRACT_KINDS.reduce((n, k) => n + posted[k], 0)
    lines.push('', '## Contracts posted (seeds 1–30, every board, weeks 1–9)', '')
    row(['Kind', 'Offers', 'Share'])
    row(['---', '---', '---'])
    for (const kind of CONTRACT_KINDS) row([kind, posted[kind], pct(posted[kind] / offered)])
    lines.push(
      '',
      `${boards} boards with offers; ${pct(withProcurement / boards)} of them post a procurement.`
    )

    lines.push('', '## Prices against the base price (seeds 1–30, days 1, 50 and 100)', '')
    row(['Good', 'Base gp', 'Cheapest', 'Median', 'Dearest'])
    row(['---', '---', '---', '---', '---'])
    {
      const mult = Object.fromEntries(GOODS.map((g) => [g, [] as number[]])) as Record<
        Good,
        number[]
      >
      for (const seed of SEEDS) {
        const state = newGame(seed, content)
        for (const day of [1, 50, 100]) {
          for (const good of GOODS) {
            const base = goodPrice(content, good)
            if (base <= 0) continue
            for (const id of Object.keys(state.world.settlements)) {
              mult[good].push(midPrice(state, content, id, good, day) / base)
            }
          }
        }
      }
      for (const good of GOODS) {
        const xs = mult[good]
        if (xs.length === 0) continue
        row([
          good,
          goodPrice(content, good),
          `${Math.min(...xs).toFixed(2)}×`,
          `${median(xs).toFixed(2)}×`,
          `${Math.max(...xs).toFixed(2)}×`,
        ])
      }
    }

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
