import { writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { partyWiped, runEnding } from '../engine/crisis/ending'
import { actCalendar } from '../engine/crisis/calendar'
import { crisisStatus } from '../engine/crisis/status'
import { challengeOf, decided } from '../engine/encounters/challenge'
import { newGame, type Action } from '../engine/state'
import { isAlive } from '../engine/town/camaraderie'
import { crusader, trader, type TraderOptions } from '../engine/travel/trader'
import { CRISIS_ACT_OPEN } from '../engine/constants'
import { GameStateSchema, type GameState } from '../schema/state'
import type { RunEnding } from '../schema/types'
import { loadBundledContent } from './bundled'

// The Crisis simulation (design §10b, Plan 5b I1; Plan 6 C: the phased calendar, so act n is
// played at its lead site, then its key site, between its open and due days). The guard tests below run a few seeds and never
// pin tuning values. The full report runs seeds 1–20 for up to 360 days under the crusader (which
// chases the Crisis, from a 50 gp start and from the game's) and the trader (which ignores it; once
// stopping when the Crisis is lost, once playing on to day 360 as a control for how long a party
// lasts), and writes markdown to the path in CRISIS_REPORT:
//
//   CRISIS_REPORT=/tmp/crisis.md pnpm vitest run src/content/crisis.sim.test.ts
//
// docs/notes/crisis-report.md records the numbers and what was tuned.

const content = loadBundledContent()
const REPORT = process.env.CRISIS_REPORT

type Policy = 'crusader' | 'crusader, game start' | 'trader' | 'trader, on to day 360'

/**
 * The sim's own starting gold, as in the economy report: the game's STARTING_GOLD start is fragile
 * (a broke party starves), which would hide the Crisis behind the economy. The report adds a
 * crusader that starts with the game's STARTING_GOLD.
 */
const SIM_GOLD = 50

/** The plan should be learned within 15 days of act I opening (never before it: Plan 6). */
const LEARN_BY = CRISIS_ACT_OPEN + 15

type FoundBy = 'rumour' | 'omen' | 'summons' | 'other'

type ActRun = {
  due: number
  /** The day the act's key site was found, thwarted, or failed (null when it didn't happen). */
  found: number | null
  thwarted: number | null
  failed: number | null
  /** Visits to its key site, and finale challenges decided there and won (Plan 6 S). */
  visits: number
  finales: number
  finaleWins: number
  /** The party's best level when the act was thwarted or failed. */
  level: number | null
}

type Run = {
  seed: number
  policy: Policy
  villain: string
  /** The day act I's lead site (where the plan is learned) became known, and how. */
  revealDay: number | null
  foundBy: FoundBy | null
  learned: number | null
  acts: ActRun[]
  ending: RunEnding | null
  day: number
  deaths: number
}

const bestLevel = (state: GameState) =>
  Math.max(0, ...state.party.filter(isAlive).map((c) => c.level))

/** How act I's lead site came to be known, from the action that revealed it. */
function foundBy(before: GameState, action: Action): FoundBy {
  if (action.type === 'listenRumours') return 'rumour'
  if (action.type === 'chooseOption' && (before.encounter?.situation.villains?.length ?? 0) > 0) {
    return 'omen'
  }
  if (action.type === 'travel' || action.type === 'continueJourney') return 'summons'
  return 'other'
}

/** Runs one seed under one policy until `days`, or until the run has ended, keeping the books. */
function simulate(
  seed: number,
  policy: Policy,
  days: number,
  extra: TraderOptions = {}
): { run: Run; state: GameState } {
  const fresh = newGame(seed, content)
  const start = policy === 'crusader, game start' ? fresh : { ...fresh, gold: SIM_GOLD }
  const crisis = start.crisis!
  const run: Run = {
    seed,
    policy,
    villain: crisis.villain,
    revealDay: null,
    foundBy: null,
    learned: null,
    acts: crisis.acts.map((_, i) => ({
      due: actCalendar(crisis, i).due,
      found: null,
      thwarted: null,
      failed: null,
      visits: 0,
      finales: 0,
      finaleWins: 0,
      level: null,
    })),
    ending: null,
    day: 0,
    deaths: 0,
  }
  const seen = (state: GameState, id: string) => state.world.pois[id]?.discovered === true

  const onStep = (before: GameState, action: Action, after: GameState) => {
    const c = after.crisis!
    const lead = c.acts[0].lead
    if (!seen(before, lead) && seen(after, lead)) {
      run.revealDay ??= after.day
      run.foundBy ??= foundBy(before, action)
    }
    if (before.crisis!.leads[0] === null && c.leads[0] !== null) run.learned = c.leads[0]
    c.acts.forEach((a, i) => {
      const act = run.acts[i]
      if (!seen(before, a.key) && seen(after, a.key)) act.found ??= after.day
      if (before.crisis!.thwarted[i] === null && c.thwarted[i] !== null) {
        act.thwarted = c.thwarted[i]
        act.level = bestLevel(after)
      }
      if (action.type === 'visitPoi' && before.location === a.key && after.encounter) act.visits++
      // A finale is the key site's skill challenge, counted once it is decided.
      const enc = before.encounter
      const challenge = enc && challengeOf(enc)
      const tally = after.encounter?.tally
      if (action.type === 'chooseOption' && enc?.poi === a.key && challenge && tally) {
        if (decided(tally, challenge) !== null) {
          act.finales++
          if (c.thwarted[i] !== null) act.finaleWins++
        }
      }
    })
  }

  // The control trader plays on past the Crisis's end: how long a party lasts without it.
  const onward = policy === 'trader, on to day 360'
  const stop = (s: GameState) => s.day >= days || (onward ? partyWiped(s) : runEnding(s) !== null)
  const pick = (leg: number, n: number) => (leg * 7 + seed) % n
  const options = { ...extra, until: stop, onStep, pick }
  const state = policy.startsWith('crusader')
    ? crusader(start, content, 5000, options)
    : trader(start, content, 5000, options)
  run.ending = runEnding(state)
  run.day = state.day
  run.deaths = state.party.filter((c) => !isAlive(c)).length
  const status = crisisStatus(state.crisis!, state.day)
  if (status.phase === 'lost' && status.act !== null) {
    run.acts[status.act].failed = status.endedDay
    run.acts[status.act].level = bestLevel(state)
  }
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
const f0 = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : '–')
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '–')
const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null)
const spread = (xs: number[]) =>
  xs.length === 0 ? '–' : `${f0(quantile(xs, 0.1))} / ${f0(median(xs))} / ${f0(quantile(xs, 0.9))}`

describe('the Crisis (guards)', () => {
  test('the crusader runs seeds 1–3 for 120 days and keeps a valid state', () => {
    for (const seed of [1, 2, 3]) {
      const { state } = simulate(seed, 'crusader', 120)
      expect(GameStateSchema.parse(state)).toEqual(state)
      expect(state.day >= 120 || runEnding(state) !== null).toBe(true)
    }
  })
})

describe.runIf(REPORT)('the Crisis report (CRISIS_REPORT=path)', () => {
  test('seeds 1–20, up to 360 days, crusader and trader', { timeout: 1_800_000 }, () => {
    const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)
    const DAYS = 360
    const policies: Policy[] = [
      'crusader',
      'crusader, game start',
      'trader',
      'trader, on to day 360',
    ]
    const all = policies.map((policy) => ({
      policy,
      runs: SEEDS.map((seed) => simulate(seed, policy, DAYS).run),
    }))
    const lines: string[] = []
    const row = (cells: (string | number)[]) => lines.push(`| ${cells.join(' | ')} |`)
    const share = (runs: Run[], ok: (r: Run) => boolean) =>
      runs.length === 0 ? NaN : runs.filter(ok).length / runs.length

    lines.push(`## Outcomes (seeds 1–${SEEDS.length}, up to day ${DAYS})`, '')
    row(['Policy', 'Won', 'Lost', 'Fallen', 'Undecided', 'Ended on (P10 / median / P90)', 'Deaths'])
    row(['---', '---', '---', '---', '---', '---', '---'])
    for (const { policy, runs } of all) {
      row([
        policy,
        pct(share(runs, (r) => r.ending === 'won')),
        pct(share(runs, (r) => r.ending === 'lost')),
        pct(share(runs, (r) => r.ending === 'fallen')),
        pct(share(runs, (r) => r.ending === null)),
        spread(runs.filter((r) => r.ending !== null).map((r) => r.day)),
        runs.reduce((n, r) => n + r.deaths, 0),
      ])
    }

    lines.push('', '## Parties fallen by day (a won or lost run counts as standing)', '')
    const FALL_DAYS = [60, 120, 240, 360]
    row(['Policy', ...FALL_DAYS.map((d) => `Day ${d}`)])
    row(['---', ...FALL_DAYS.map(() => '---')])
    for (const { policy, runs } of all) {
      row([
        policy,
        ...FALL_DAYS.map((d) => pct(share(runs, (r) => r.ending === 'fallen' && r.day <= d))),
      ])
    }

    lines.push('', '## Learning the plan', '')
    row([
      'Policy',
      'Act I lead known (P10 / median / P90 day)',
      'Plan learned (P10 / median / P90 day)',
      `Learned by day ${LEARN_BY}`,
      'Never learned',
      'Rumour / omen / summons / other',
    ])
    row(['---', '---', '---', '---', '---', '---'])
    for (const { policy, runs } of all) {
      const by = (k: FoundBy) => runs.filter((r) => r.foundBy === k).length
      row([
        policy,
        spread(nums(runs.map((r) => r.revealDay))),
        spread(nums(runs.map((r) => r.learned))),
        pct(share(runs, (r) => r.learned !== null && r.learned <= LEARN_BY)),
        runs.filter((r) => r.learned === null).length,
        `${by('rumour')} / ${by('omen')} / ${by('summons')} / ${by('other')}`,
      ])
    }

    // The traders never find an act site: only the crusaders have acts to show.
    for (const { policy, runs } of all.filter((p) => p.policy.startsWith('crusader'))) {
      lines.push('', `## ${policy}: the acts`, '')
      row([
        'Act',
        'Reached',
        'Site found (median day)',
        'Days to spare when found (P10 / median / P90)',
        'Thwarted',
        'Late',
        'Failed',
        'Days to spare when thwarted (P10 / median / P90)',
        'Level then (median)',
        'Visits a thwart',
        'Finales won',
      ])
      row(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---'])
      for (let i = 0; i < 3; i++) {
        const acts = runs.map((r) => r.acts[i])
        const reached = runs.filter((r) => i === 0 || r.acts[i - 1].thwarted !== null)
        const found = acts.filter((a) => a.found !== null)
        const thwarted = acts.filter((a) => a.thwarted !== null)
        const late = thwarted.filter((a) => a.thwarted! > a.due)
        const finales = acts.reduce((n, a) => n + a.finales, 0)
        const wins = acts.reduce((n, a) => n + a.finaleWins, 0)
        const visits = acts.reduce((n, a) => n + a.visits, 0)
        row([
          ['I', 'II', 'III'][i],
          reached.length,
          f0(median(found.map((a) => a.found!))),
          spread(found.map((a) => a.due - a.found!)),
          thwarted.length,
          late.length,
          acts.filter((a) => a.failed !== null).length,
          spread(thwarted.map((a) => a.due - a.thwarted!)),
          f0(median(nums(acts.map((a) => a.level)))),
          thwarted.length > 0 ? (visits / thwarted.length).toFixed(1) : '–',
          finales > 0 ? `${pct(wins / finales)} (${wins}/${finales})` : '–',
        ])
      }
    }

    const crusade = all.find((p) => p.policy === 'crusader')!.runs
    const villains = [...new Set(crusade.map((r) => r.villain))].sort()
    lines.push('', '## crusader: by villain', '')
    row(['Villain', 'Runs', 'Won', 'Lost', 'Fallen'])
    row(['---', '---', '---', '---', '---'])
    const winRate: Record<string, number> = {}
    for (const v of villains) {
      const runs = crusade.filter((r) => r.villain === v)
      winRate[v] = share(runs, (r) => r.ending === 'won')
      row([
        v,
        runs.length,
        pct(winRate[v]),
        pct(share(runs, (r) => r.ending === 'lost')),
        pct(share(runs, (r) => r.ending === 'fallen')),
      ])
    }

    lines.push('', '## crusader: every run', '')
    row(['Seed', 'Villain', 'Plan', 'Act I (due / found / thwarted)', 'Act II', 'Act III', 'End'])
    row(['---', '---', '---', '---', '---', '---', '---'])
    const cell = (a: ActRun) =>
      `${a.due} / ${a.found ?? '–'} / ${a.thwarted ?? (a.failed ? `failed ${a.failed}` : '–')}`
    for (const r of crusade) {
      row([
        r.seed,
        r.villain,
        r.learned ?? '–',
        ...r.acts.map(cell),
        `${r.ending ?? 'undecided'} (day ${r.day})`,
      ])
    }

    // The targets (Plan 5b I1).
    const learned25 = share(crusade, (r) => r.learned !== null && r.learned <= LEARN_BY)
    const spare = crusade.flatMap((r) => r.acts.filter((a) => a.found !== null))
    const spareMedian = median(spare.map((a) => a.due - a.found!))
    const won = share(crusade, (r) => r.ending === 'won')
    const thwarted = crusade.flatMap((r) => r.acts.filter((a) => a.thwarted !== null))
    const lateShare = thwarted.filter((a) => a.thwarted! > a.due).length / thwarted.length
    const traderLost = share(
      all.find((p) => p.policy === 'trader')!.runs,
      (r) => r.ending !== 'won'
    )
    const rates = Object.values(winRate)
    const ratio = Math.max(...rates) / Math.max(1e-9, Math.min(...rates))
    const ok = (b: boolean) => (b ? 'met' : 'not met')
    lines.push('', '## Targets', '')
    row(['Target', 'Value', ''])
    row(['---', '---', '---'])
    row([`Plan learned by day ${LEARN_BY} in ≥ 90% of runs`, pct(learned25), ok(learned25 >= 0.9)])
    row(['Median act site found with ≥ 30d to spare', `${f0(spareMedian)}d`, ok(spareMedian >= 30)])
    row(['Crusader wins 40–75%', pct(won), ok(won >= 0.4 && won <= 0.75)])
    // Apart from the party's survival: of the runs the Crisis decided, the share won.
    const decided = crusade.filter((r) => r.ending === 'won' || r.ending === 'lost')
    row([
      '(for reference) Won, of the runs the Crisis decided',
      `${pct(share(decided, (r) => r.ending === 'won'))} of ${decided.length}`,
      '',
    ])
    row(['< 25% of acts thwarted late', pct(lateShare), ok(lateShare < 0.25)])
    row([
      'The trader loses (or never wins) nearly every run',
      pct(traderLost),
      ok(traderLost >= 0.9),
    ])
    row([
      'No villain wins > 2× as often as another',
      villains.map((v) => `${v} ${pct(winRate[v])}`).join(', '),
      ok(ratio <= 2),
    ])
    lines.push(
      '',
      'An act fails the day after its due day (no leeway, Plan 6), so none is thwarted late.'
    )
    writeFileSync(REPORT!, lines.join('\n') + '\n')
    console.log(lines.join('\n'))
  })
})
