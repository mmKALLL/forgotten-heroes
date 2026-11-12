import type { Character, GameState } from '../../schema/state'
import {
  CAMARADERIE_MAX,
  CAMARADERIE_TIERS,
  type CamaraderieTier,
  type LogTone,
} from '../../schema/types'
import { formatGp } from '../format'
import { appendLog } from '../log'
import { withRng } from '../rng'
import { MAX_EXHAUSTION } from '../rules/character'
import { inSettlement } from '../travel/where'
import {
  CAMARADERIE_BOND,
  CAMARADERIE_DEATH,
  CAMARADERIE_HUNGER,
  CAMARADERIE_UNPAID,
  DESERT_CHANCE,
} from '../constants'

// Wages, camaraderie and desertion (Plan 5a, B2; design §3). Camaraderie is one party-wide value,
// 0–8, changed only by a few rules: unpaid wages, a day of hunger or thirst, a death, a contract
// kept, a night in a private room, and encounter effects. Its only effect for now: while it is
// Fractured, hired members may desert on arrival. Founders draw no wages and never desert.

/** A member who isn't dead (exhaustion 6). */
export const isAlive = (c: Character): boolean => c.exhaustion < MAX_EXHAUSTION
/** A hired member draws a wage; founders draw none, and are never dismissed and never desert. */
export const isHired = (c: Character): boolean => c.wage > 0
/** The living members: the party cap counts these. */
export const livingMembers = (state: Pick<GameState, 'party'>): Character[] =>
  state.party.filter(isAlive)

export const CAMARADERIE_LABELS: Readonly<Record<CamaraderieTier, string>> = {
  fractured: 'Fractured',
  strained: 'Strained',
  steady: 'Steady',
  close: 'Close',
  sworn: 'Sworn',
}

/** The tier a camaraderie value is in. */
export const camaraderieTier = (value: number): CamaraderieTier =>
  CAMARADERIE_TIERS.findLast((t) => value >= t.min)?.id ?? 'fractured'

/** Once-per-arrival key (doneHere) for the private-room bonus. */
const BOND = 'bond'

/**
 * Camaraderie after a change of `amount`, kept within 0–CAMARADERIE_MAX, and the journal line when
 * it crosses into another tier ("The party is strained: wages are owed."), else null.
 */
export function shiftCamaraderie(
  value: number,
  amount: number,
  why?: string
): { value: number; line: { text: string; tone: LogTone } | null } {
  const next = Math.max(0, Math.min(CAMARADERIE_MAX, value + amount))
  const tier = camaraderieTier(next)
  if (tier === camaraderieTier(value)) return { value: next, line: null }
  const text = `The party is ${CAMARADERIE_LABELS[tier].toLowerCase()}${why ? `: ${why}` : ''}.`
  return { value: next, line: { text, tone: next < value ? 'bad' : 'good' } }
}

/** Changes camaraderie by `amount`, logging a tier crossing with `why`. */
export function changeCamaraderie(state: GameState, amount: number, why?: string): GameState {
  const { value, line } = shiftCamaraderie(state.camaraderie, amount, why)
  const next = value === state.camaraderie ? state : { ...state, camaraderie: value }
  return line ? appendLog(next, line.text, line.tone) : next
}

/** gp a day the living hired members draw. */
export const wagesPerDay = (state: Pick<GameState, 'party'>): number =>
  livingMembers(state)
    .filter(isHired)
    .reduce((sum, c) => sum + c.wage, 0)

/**
 * The part of the owed wages that is owed to these members: the pool is split by wage among the
 * hired members still with the party (living or dead).
 */
export function owedTo(state: Pick<GameState, 'party' | 'wagesOwed'>, members: Character[]) {
  const total = state.party.filter(isHired).reduce((s, c) => s + c.wage, 0)
  const theirs = members.filter(isHired).reduce((s, c) => s + c.wage, 0)
  if (total <= 0 || state.wagesOwed <= 0) return 0
  return Math.round(((state.wagesOwed * theirs) / total) * 100) / 100
}

/**
 * A day's wages, at the end of the day (after the animals' upkeep): owed wages first, then
 * today's, in whole gp as far as the gold goes; the rest is owed (fractions carry quietly). A day
 * that ends with a whole gp owed costs CAMARADERIE_UNPAID, but only while a living hired member is
 * there to be owed (wages owed to the dead are paid when the gold comes, without grumbling).
 */
export function payWages(state: GameState): GameState {
  const due = wagesPerDay(state) + state.wagesOwed
  if (due <= 0) return state
  const paid = Math.min(Math.max(0, state.gold), Math.floor(due))
  const owed = Math.round((due - paid) * 100) / 100
  let next: GameState = { ...state, gold: state.gold - paid, wagesOwed: owed }
  if (owed < 1 || !livingMembers(state).some(isHired)) return next
  if (state.wagesOwed < 1) {
    next = appendLog(next, `There is no coin for the wages: ${formatGp(owed)} gp owed.`, 'bad')
  }
  return changeCamaraderie(next, -CAMARADERIE_UNPAID, 'wages are owed')
}

/** A day on which a living member went without food or water: CAMARADERIE_HUNGER, once a day. */
export const wentWithout = (state: GameState): GameState =>
  changeCamaraderie(state, -CAMARADERIE_HUNGER, 'someone went without food or water')

/**
 * After a step: CAMARADERIE_DEATH for each member who was alive before it and is dead after it
 * (the post-step pass in state.ts, so deaths from anywhere count).
 */
export function mournTheDead(before: GameState, after: GameState): GameState {
  const alive = new Set(livingMembers(before).map((c) => c.id))
  return after.party
    .filter((c) => alive.has(c.id) && !isAlive(c))
    .reduce((s, c) => changeCamaraderie(s, -CAMARADERIE_DEATH, `${c.name} is dead`), after)
}

/** A night in a private room: CAMARADERIE_BOND, once per arrival. */
export function bond(state: GameState): GameState {
  if (state.doneHere.includes(BOND)) return state
  const marked = { ...state, doneHere: [...state.doneHere, BOND] }
  return changeCamaraderie(marked, CAMARADERIE_BOND, 'a night in good rooms')
}

/**
 * On arrival in a settlement, while camaraderie is Fractured, each living hired member deserts
 * with DESERT_CHANCE (seeded). They take no gold or goods (a worn accessory stays in the party's
 * gear), and their share of the owed wages (owedTo) is written off. Founders never desert.
 */
export function desertOnArrival(state: GameState): GameState {
  if (camaraderieTier(state.camaraderie) !== 'fractured' || !inSettlement(state)) return state
  const hired = livingMembers(state).filter(isHired)
  if (hired.length === 0) return state
  const [leaving, rng] = withRng(state.rng, (d) => hired.filter(() => d.float() < DESERT_CHANCE))
  if (leaving.length === 0) return { ...state, rng }
  const ids = new Set(leaving.map((c) => c.id))
  const names = leaving.map((c) => c.name)
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return appendLog(
    {
      ...state,
      rng,
      party: state.party.filter((c) => !ids.has(c.id)),
      gear: [...state.gear, ...leaving.flatMap((c) => (c.accessory ? [c.accessory] : []))],
      wagesOwed: Math.round((state.wagesOwed - owedTo(state, leaving)) * 100) / 100,
    },
    `${who} ${names.length === 1 ? 'has' : 'have'} had enough and ` +
      `${names.length === 1 ? 'leaves' : 'leave'} the party. Their owed wages are written off.`,
    'bad'
  )
}

/** The party's camaraderie for the UI: the value, its tier and what is pulling it down now. */
export type CamaraderieInfo = {
  value: number
  max: number
  tier: CamaraderieTier
  label: string
  /** What is pulling it down now (English); the journal carries the history. */
  causes: string[]
  wagesPerDay: number
  wagesOwed: number
  /** The chance each hired member deserts on the next arrival (0 unless Fractured). */
  desertRisk: number
  /** The rule, for the tooltip: the chance each hired member deserts while Fractured. */
  desertChance: number
  /** The highest value that is still Fractured. */
  fracturedMax: number
}

export function camaraderieInfo(state: GameState): CamaraderieInfo {
  const tier = camaraderieTier(state.camaraderie)
  const wages = wagesPerDay(state)
  const living = livingMembers(state).length
  const hired = livingMembers(state).filter(isHired).length
  const desertRisk = tier === 'fractured' && hired > 0 ? DESERT_CHANCE : 0
  const causes: string[] = []
  if (state.wagesOwed >= 1 && hired > 0) {
    causes.push(`${formatGp(state.wagesOwed)} gp of wages owed`)
  } else if (wages > 0 && state.gold < wages) causes.push("the purse won't cover a day's wages")
  const short =
    (state.goods.food ?? 0) < living || (!inSettlement(state) && (state.goods.water ?? 0) < living)
  if (living > 0 && short) causes.push("food or water won't last everyone a day")
  if (desertRisk > 0) {
    causes.push(`hired members may desert on arrival (${Math.round(desertRisk * 100)}% each)`)
  }
  return {
    value: state.camaraderie,
    max: CAMARADERIE_MAX,
    tier,
    label: CAMARADERIE_LABELS[tier],
    causes,
    wagesPerDay: wages,
    wagesOwed: state.wagesOwed,
    desertRisk,
    desertChance: DESERT_CHANCE,
    fracturedMax: CAMARADERIE_TIERS[1].min - 1,
  }
}
