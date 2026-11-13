import type { Content } from '../../content/build'
import type { RunRecord } from '../../schema/crisis'
import type { RunEnding } from '../../schema/types'
import type { GameState, LogEntry } from '../../schema/state'
import { isAlive } from '../town/camaraderie'
import { settlementName } from '../world/geo'
import { crisisStatus, planKnown } from './status'
import { villainOf } from './text'

// How a run ends (Plan 5b E5, design §11): the Crisis won or lost (the party may keep playing), or
// the whole party fallen, which ends the run for good. The summary and the Hall of the Fallen's
// record are built here, purely; the UI keeps the Hall.

/** Logged once, by the step in which the last living member dies. */
export const FALLEN_LINE = 'The last of the party falls. The road goes on without them.'

/**
 * No living member: every member has died (exhaustion MAX_EXHAUSTION). A downed member (0 HP) is
 * alive: a party that is all down still camps and recovers.
 */
export const partyWiped = (state: Pick<GameState, 'party'>): boolean => !state.party.some(isAlive)

/** How the run has ended: fallen first, then the Crisis won or lost; null while it goes on. */
export function runEnding(state: GameState): RunEnding | null {
  if (partyWiped(state)) return 'fallen'
  if (!state.crisis) return null
  const phase = crisisStatus(state.crisis, state.day).phase
  return phase === 'won' || phase === 'lost' ? phase : null
}

/** One member in a run summary. */
export type RunMember = {
  name: string
  ancestry: string
  classId: string
  level: number
  fallen: boolean
}

/** What the end screens show (design §9): the acts, the party, and what the run did. */
export type RunSummary = {
  ending: RunEnding | null
  day: number
  /** The villain's rolled name; null without a Crisis, or when its plan was never learned. */
  villain: string | null
  /** Each act, with the day it was thwarted or failed. Empty without a Crisis. */
  acts: { name: string; thwartedDay: number | null; failedDay: number | null }[]
  party: RunMember[]
  gold: number
  sitesDiscovered: number
  /** Sites the party has cleared (counted from each site's clearedDay). */
  sitesCleared: number
  /** The party's total XP, the dead included. */
  xp: number
  /** Where the party is (or, on the road, where it is bound). */
  place: string
  /** The journal's last five lines. */
  lastLines: LogEntry[]
}

/** Where the party is, for the summary: its place, or "on the road to …". */
function placeOf(state: GameState): string {
  if (state.travel) return `on the road to ${settlementName(state, state.travel.to)}`
  return state.location ? settlementName(state, state.location) : 'nowhere'
}

/** The run's summary for the end screens, at any point of the run. */
export function runSummary(state: GameState, content: Content): RunSummary {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  const status = crisis && crisisStatus(crisis, state.day)
  const pois = Object.values(state.world.pois)
  return {
    ending: runEnding(state),
    day: state.day,
    villain: crisis && planKnown(crisis) ? crisis.name : null,
    acts: crisis
      ? crisis.acts.map((a, i) => ({
          name: villain?.acts[i]?.name ?? a.id,
          thwartedDay: crisis.thwarted[i] ?? null,
          failedDay: status?.phase === 'lost' && status.act === i ? status.endedDay : null,
        }))
      : [],
    party: state.party.map((c) => ({
      name: c.name,
      ancestry: c.ancestry,
      classId: c.classId,
      level: c.level,
      fallen: !isAlive(c),
    })),
    gold: state.gold,
    sitesDiscovered: pois.filter((p) => p.discovered).length,
    sitesCleared: pois.filter((p) => p.clearedDay !== null).length,
    xp: state.party.reduce((sum, c) => sum + c.xp, 0),
    place: placeOf(state),
    lastLines: state.log.slice(-5),
  }
}

/**
 * How a recorded run's Crisis was decided, from its acts: a failed act lost it, three thwarted won
 * it; null while undecided. A party that fell may have decided it first.
 */
export function recordCrisis(record: Pick<RunRecord, 'acts'>): 'won' | 'lost' | null {
  if (record.acts.includes('failed')) return 'lost'
  return record.acts.length > 0 && record.acts.every((a) => a === 'thwarted') ? 'won' : null
}

/**
 * The Hall of the Fallen's record of this run (RunRecordSchema). Its id is the game seed, so a run
 * that ends again (lost, then fallen) updates its record instead of adding one. `recorded` is the
 * ISO date the UI stamps it with.
 */
export function runRecord(state: GameState, content: Content, recorded: string): RunRecord {
  const summary = runSummary(state, content)
  return {
    id: String(state.seed),
    seed: state.seed,
    ending: summary.ending,
    day: summary.day,
    villain: summary.villain,
    acts: summary.acts.map((a) =>
      a.thwartedDay !== null ? 'thwarted' : a.failedDay !== null ? 'failed' : null
    ),
    party: summary.party,
    place: summary.place,
    recorded,
  }
}
