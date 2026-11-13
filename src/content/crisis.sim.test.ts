import { writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { runEnding, runOver } from '../engine/crisis/ending'
import { actCalendar } from '../engine/crisis/calendar'
import { crisisStatus } from '../engine/crisis/status'
import { challengeOf, decided } from '../engine/encounters/challenge'
import { newGame, type Action } from '../engine/state'
import { isAlive } from '../engine/town/camaraderie'
import { crusader, trader, type TraderOptions, type TraderWhy } from '../engine/travel/trader'
import { CAMARADERIE_DEATH, CAMARADERIE_PARTING, CRISIS_ACT_OPEN } from '../engine/constants'
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
  /** The day the act's lead was won: its prevention began (null when it never did). */
  lead: number | null
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
  /** The party's best level on LEVEL_DAYS (null once the run has ended or not reached). */
  levels: (number | null)[]
  /** The best living member's total XP on LEVEL_DAYS (as `levels`): what XP_BY_LEVEL is set from. */
  xps: (number | null)[]
  /** Road encounters and dungeon rooms: how many, their checks and failures, HP lost and deaths. */
  road: Risk
  rooms: Risk
  /** Delves: entered, cleared (the hoard), driven out; and the gold the hoards paid. */
  delves: { entered: number; cleared: number; driven: number; hoardGold: number }
  /** XP (the best member's) gained while delving, and in all. */
  xp: { delve: number; all: number }
  /** Camaraderie gained and lost by cause, summed over the run. */
  camaraderie: Record<string, number>
}

type Risk = { encounters: number; checks: number; fails: number; hp: number; deaths: number }
const noRisk = (): Risk => ({ encounters: 0, checks: 0, fails: 0, hp: 0, deaths: 0 })

/** The days the report samples the party's best level on. */
const LEVEL_DAYS = [30, 60, 100, 130, 160, 200, 230, 260, 300]
/** The designer's level targets (median, crusader): day → level (Plan 6, Interpretations). */
const LEVEL_TARGETS: Record<number, number> = { 30: 4, 100: 7, 200: 13, 300: 19 }

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
      lead: null,
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
    levels: LEVEL_DAYS.map(() => null),
    xps: LEVEL_DAYS.map(() => null),
    road: noRisk(),
    rooms: noRisk(),
    delves: { entered: 0, cleared: 0, driven: 0, hoardGold: 0 },
    xp: { delve: 0, all: 0 },
    camaraderie: {},
  }
  const seen = (state: GameState, id: string) => state.world.pois[id]?.discovered === true

  const onStep = (before: GameState, action: Action, after: GameState, why: TraderWhy) => {
    LEVEL_DAYS.forEach((d, i) => {
      if (run.levels[i] === null && before.day < d && after.day >= d && !runOver(after)) {
        run.levels[i] = bestLevel(after)
        run.xps[i] = Math.max(0, ...after.party.filter(isAlive).map((m) => m.xp))
      }
    })
    const xp = (s: GameState) => Math.max(0, ...s.party.map((m) => m.xp))
    const gained = xp(after) - xp(before)
    run.xp.all += gained
    if (before.delve) run.xp.delve += gained
    // Risk: an encounter is a room while delving, else a road (or site) encounter.
    const room = before.delve?.inRoom === true || after.delve?.inRoom === true
    const risk = room ? run.rooms : run.road
    if (after.encounter && after.encounter !== before.encounter && !before.encounter?.stage) {
      if (room || after.encounter.poi == null) risk.encounters++
    }
    if (room || (before.encounter && before.encounter.poi == null)) {
      if (action.type === 'chooseOption' && after.lastRoll && after.lastRoll !== before.lastRoll) {
        risk.checks++
        if (after.lastRoll.tier === 'fail' || after.lastRoll.tier === 'critFail') risk.fails++
      }
      const alive = before.party.filter(isAlive)
      for (const m of alive) {
        const now = after.party.find((x) => x.id === m.id)
        if (!now) continue
        risk.hp += Math.max(0, m.hp - now.hp)
        if (!isAlive(now)) risk.deaths++
      }
    }
    if (action.type === 'visitPoi' && !before.delve && after.delve) run.delves.entered++
    const cleared = (g: GameState) =>
      before.delve ? g.world.pois[before.delve.poi]?.clearedDay : null
    if (before.delve && cleared(after) !== cleared(before)) {
      run.delves.cleared++
      run.delves.hoardGold += Math.max(0, after.gold - before.gold)
    } else if (before.delve?.inRoom && !after.delve && action.type === 'chooseOption') {
      // A room that ended the delve without the hoard: driven out (or no one left standing).
      run.delves.driven++
    }
    // Camaraderie by cause (deaths and partings apart from the action that brought them).
    const shift = after.camaraderie - before.camaraderie
    if (shift !== 0) {
      const aliveBefore = new Set(before.party.filter(isAlive).map((m) => m.id))
      const died = after.party.filter((m) => aliveBefore.has(m.id) && !isAlive(m)).length
      const left = aliveBefore.size - after.party.filter(isAlive).length - died
      const tally = (k: string, v: number) => (run.camaraderie[k] = (run.camaraderie[k] ?? 0) + v)
      let rest = shift
      if (died > 0) {
        tally('deaths', -CAMARADERIE_DEATH * died)
        rest += CAMARADERIE_DEATH * died
      }
      if (left > 0) {
        tally('a member leaving', CAMARADERIE_PARTING * left)
        rest -= CAMARADERIE_PARTING * left
      }
      const roll = after.lastRoll !== before.lastRoll ? after.lastRoll : null
      const cause =
        action.type === 'chooseOption'
          ? roll && (roll.tier === 'fail' || roll.tier === 'critFail')
            ? 'failed checks'
            : rest < 0
              ? 'fleeing and other encounter losses'
              : 'encounter gains'
          : action.type === 'completeContract'
            ? 'contracts'
            : why === 'upkeep'
              ? action.type === 'rest'
                ? 'private rooms'
                : 'rounds at the inn'
              : rest < 0
                ? 'hunger and thirst'
                : 'other gains'
      if (rest !== 0) tally(cause, rest)
    }
    const c = after.crisis!
    const lead = c.acts[0].lead
    if (!seen(before, lead) && seen(after, lead)) {
      run.revealDay ??= after.day
      run.foundBy ??= foundBy(before, action)
    }
    if (before.crisis!.leads[0] === null && c.leads[0] !== null) run.learned = c.leads[0]
    c.acts.forEach((a, i) => {
      const act = run.acts[i]
      if (before.crisis!.leads[i] === null && c.leads[i] !== null) act.lead = c.leads[i]
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
  const stop = (s: GameState) => s.day >= days || (onward ? runOver(s) : runEnding(s) !== null)
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

    const over = (r: Run) => r.ending === 'fallen' || r.ending === 'disbanded'
    lines.push(`## Outcomes (seeds 1–${SEEDS.length}, up to day ${DAYS})`, '')
    row([
      'Policy',
      'Won',
      'Lost',
      'Fallen',
      'Disbanded',
      'Undecided',
      'Ended on (P10 / median / P90)',
      'Deaths',
    ])
    row(['---', '---', '---', '---', '---', '---', '---', '---'])
    for (const { policy, runs } of all) {
      row([
        policy,
        pct(share(runs, (r) => r.ending === 'won')),
        pct(share(runs, (r) => r.ending === 'lost')),
        pct(share(runs, (r) => r.ending === 'fallen')),
        pct(share(runs, (r) => r.ending === 'disbanded')),
        pct(share(runs, (r) => r.ending === null)),
        spread(runs.filter((r) => r.ending !== null).map((r) => r.day)),
        runs.reduce((n, r) => n + r.deaths, 0),
      ])
    }

    lines.push('', '## Runs over (fallen or disbanded) by day (won or lost counts as standing)', '')
    const FALL_DAYS = [30, 60, 100, 130, 200, 300, 360]
    row(['Policy', ...FALL_DAYS.map((d) => `Day ${d}`)])
    row(['---', ...FALL_DAYS.map(() => '---')])
    for (const { policy, runs } of all) {
      row([policy, ...FALL_DAYS.map((d) => pct(share(runs, (r) => over(r) && r.day <= d)))])
    }

    lines.push('', '## Levels: the best living level (P10 / median / P90, runs still going)', '')
    row(['Policy', ...LEVEL_DAYS.map((d) => `Day ${d}`)])
    row(['---', ...LEVEL_DAYS.map(() => '---')])
    for (const { policy, runs } of all) {
      row([
        policy,
        ...LEVEL_DAYS.map((_, i) => {
          const xs = nums(runs.map((r) => r.levels[i]))
          return xs.length === 0 ? '–' : `${spread(xs)} (${xs.length})`
        }),
      ])
    }

    lines.push('', '## XP: the best living member’s total (median, runs still going)', '')
    row(['Policy', ...LEVEL_DAYS.map((d) => `Day ${d}`)])
    row(['---', ...LEVEL_DAYS.map(() => '---')])
    for (const { policy, runs } of all) {
      row([policy, ...LEVEL_DAYS.map((_, i) => f0(median(nums(runs.map((r) => r.xps[i])))))])
    }

    lines.push(
      '',
      '## Each act’s prevention: of the runs that reach it alive, how many lose it',
      ''
    )
    row([
      'Policy',
      'Act',
      'Reach prevention',
      'Thwart',
      'Fail the act',
      'Die or disband in it',
      'Lose',
    ])
    row(['---', '---', '---', '---', '---', '---', '---'])
    for (const { policy, runs } of all.filter((p) => p.policy.startsWith('crusader'))) {
      for (let i = 0; i < 3; i++) {
        const reached = runs.filter((r) => r.acts[i].lead !== null)
        const thwarted = reached.filter((r) => r.acts[i].thwarted !== null)
        const failed = reached.filter((r) => r.acts[i].failed !== null)
        const ended = reached.filter((r) => r.acts[i].thwarted === null && over(r))
        row([
          policy,
          ['I', 'II', 'III'][i],
          reached.length,
          thwarted.length,
          failed.length,
          ended.length,
          pct((reached.length - thwarted.length) / Math.max(1, reached.length)),
        ])
      }
    }

    lines.push('', '## Dungeons against the road (all runs of each policy)', '')
    row([
      'Policy',
      'Where',
      'Encounters',
      'Checks failed',
      'HP lost an encounter',
      'Deaths per 100 encounters',
    ])
    row(['---', '---', '---', '---', '---', '---'])
    for (const { policy, runs } of all) {
      for (const where of ['road', 'rooms'] as const) {
        const sum = runs.reduce(
          (t, r) => ({
            encounters: t.encounters + r[where].encounters,
            checks: t.checks + r[where].checks,
            fails: t.fails + r[where].fails,
            hp: t.hp + r[where].hp,
            deaths: t.deaths + r[where].deaths,
          }),
          noRisk()
        )
        if (sum.encounters === 0) continue
        row([
          policy,
          where === 'road' ? 'road encounters' : 'dungeon rooms',
          sum.encounters,
          pct(sum.fails / Math.max(1, sum.checks)),
          (sum.hp / sum.encounters).toFixed(1),
          ((100 * sum.deaths) / sum.encounters).toFixed(1),
        ])
      }
    }
    lines.push('')
    row(['Policy', 'Delves', 'Cleared', 'Driven out', 'Hoard gold (mean)', 'XP from delving'])
    row(['---', '---', '---', '---', '---', '---'])
    for (const { policy, runs } of all) {
      const d = runs.reduce(
        (t, r) => ({
          entered: t.entered + r.delves.entered,
          cleared: t.cleared + r.delves.cleared,
          driven: t.driven + r.delves.driven,
          hoardGold: t.hoardGold + r.delves.hoardGold,
        }),
        { entered: 0, cleared: 0, driven: 0, hoardGold: 0 }
      )
      if (d.entered === 0) continue
      const xp = runs.reduce((t, r) => ({ d: t.d + r.xp.delve, a: t.a + r.xp.all }), { d: 0, a: 0 })
      row([
        policy,
        d.entered,
        d.cleared,
        d.driven,
        d.cleared > 0 ? f0(d.hoardGold / d.cleared) : '–',
        pct(xp.d / Math.max(1, xp.a)),
      ])
    }

    lines.push('', '## Camaraderie by cause (mean per run)', '')
    const causes = [
      ...new Set(all.flatMap((p) => p.runs.flatMap((r) => Object.keys(r.camaraderie)))),
    ]
    row(['Policy', ...causes])
    row(['---', ...causes.map(() => '---')])
    for (const { policy, runs } of all) {
      row([
        policy,
        ...causes.map((k) =>
          f0(runs.reduce((n, r) => n + (r.camaraderie[k] ?? 0), 0) / runs.length)
        ),
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
    // Plan 6 (designer, 2026-11-13).
    const early = share(crusade, (r) => over(r) && r.acts[0].lead === null)
    row([
      'About 75% of runs end (fallen or disbanded) before act I’s prevention',
      pct(early),
      ok(early >= 0.65 && early <= 0.85),
    ])
    const past30 = share(crusade, (r) => !(over(r) && r.day <= 30))
    row(['A run usually lives past day 30', pct(past30), ok(past30 >= 0.8)])
    for (let i = 0; i < 3; i++) {
      const reached = crusade.filter((r) => r.acts[i].lead !== null)
      const lost = reached.filter((r) => r.acts[i].thwarted === null).length
      row([
        `Act ${['I', 'II', 'III'][i]}: about half the runs reaching its prevention lose it`,
        reached.length > 0 ? `${pct(lost / reached.length)} of ${reached.length}` : '–',
        reached.length === 0
          ? '–'
          : ok(lost / reached.length >= 0.35 && lost / reached.length <= 0.65),
      ])
    }
    for (const [day, level] of Object.entries(LEVEL_TARGETS)) {
      const i = LEVEL_DAYS.indexOf(Number(day))
      const xs = nums(crusade.map((r) => r.levels[i]))
      const m = median(xs)
      row([
        `Median level about ${level} on day ${day}`,
        xs.length > 0 ? `${f0(m)} (${xs.length} runs)` : '–',
        xs.length === 0 ? '–' : ok(Math.abs(m - level) <= 1),
      ])
    }
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
