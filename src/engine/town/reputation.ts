import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { STANDINGS, type LogTone, type Standing } from '../../schema/types'
import { STANDING_POINTS, STANDING_SPREAD, TRADE_REP_GP, TRADE_REP_MAX } from '../constants'
import { appendLog } from '../log'
import { domainAt } from '../world/pois'
import { personDisplayName } from './people'

/**
 * Reputation (design §8, Plan 4 B2): points with each settlement, read as a standing tier. Nothing
 * decays; points change only through what the party does. A kingdom's reputation is derived from
 * its settlements' (kingdomReputation); notable people have none (designer call 2026-11-14).
 */

const STRANGER = STANDINGS.indexOf('stranger')

/** The standing tier for a number of points (thresholds in STANDING_POINTS). */
export function standingOf(points: number): Standing {
  for (let i = STANDINGS.length - 1; i > 0; i--) {
    if (points >= STANDING_POINTS[STANDINGS[i]]) return STANDINGS[i]
  }
  return STANDINGS[0]
}

/** The fewest points a standing needs (STANDING_POINTS), e.g. "needs reputation 5". */
export const standingFloor = (standing: Standing): number => STANDING_POINTS[standing]

/** Tiers above stranger (negative below): known is 1, disliked is −1. */
export const standingSteps = (standing: Standing): number => STANDINGS.indexOf(standing) - STRANGER

/** Whether `standing` is at least `min`. */
export const atLeast = (standing: Standing, min: Standing): boolean =>
  STANDINGS.indexOf(standing) >= STANDINGS.indexOf(min)

type RepState = Pick<GameState, 'reputation'>

/** Points with a settlement (0 if the party has none there, or for no settlement). */
export const settlementPoints = (state: RepState, id: string | null): number =>
  id !== null && Object.hasOwn(state.reputation.settlements, id)
    ? state.reputation.settlements[id]
    : 0

/** The party's standing with a settlement; a stranger where there is none (e.g. at sea). */
export const settlementStanding = (state: RepState, id: string | null): Standing =>
  standingOf(settlementPoints(state, id))

/**
 * The settlement an encounter's reputation and standing refer to: its domain, else where the party
 * is. On a land road that is the domain of the nearer end; at sea, the port the party sailed from
 * (travel/journey.ts placeOnRoute).
 */
export const encounterSettlement = (state: Pick<GameState, 'encounter' | 'world' | 'location'>) =>
  state.encounter?.domain ?? domainAt(state.world, state.location)

const settlementName = (state: Pick<GameState, 'world'>, id: string) =>
  Object.hasOwn(state.world.settlements, id) ? state.world.settlements[id].name : id

/** The name of the settlement an encounter's reputation refers to, for effect chips. */
export function encounterSettlementName(
  state: Pick<GameState, 'encounter' | 'world' | 'location'>
): string | undefined {
  const id = encounterSettlement(state)
  return id ? settlementName(state, id) : undefined
}

/** What a settlement thinks of the party at each tier, after its name: "Avarus trusts you now." */
const TIER_VERB: Record<Standing, string> = {
  hated: 'hates you',
  disliked: 'dislikes you',
  stranger: 'treats you as strangers',
  known: 'knows your name',
  liked: 'likes you',
  trusted: 'trusts you',
  honoured: 'honours you',
}

/** A line in the journal, and in the encounter's own log when one is open. */
function note(state: GameState, text: string, tone: LogTone): GameState {
  const next = appendLog(state, text, tone)
  if (!next.encounter) return next
  return { ...next, encounter: { ...next.encounter, log: [...next.encounter.log, { text, tone }] } }
}

export type ReputationChange = {
  settlement?: string | null
  amount: number
  /** Why, appended to the tier-change line, e.g. "for the courier run". */
  reason?: string
}

/**
 * Adds points with a settlement, logging "Avarus knows your name now." whenever a tier changes.
 * Pure.
 */
export function addReputation(
  state: GameState,
  change: ReputationChange,
  { quiet = false }: { quiet?: boolean } = {}
): GameState {
  const amount = Math.trunc(change.amount)
  if (amount === 0) return state
  let next = state
  const suffix = change.reason ? ` (${change.reason})` : ''
  const tone: LogTone = amount > 0 ? 'good' : 'bad'
  if (change.settlement) {
    const id = change.settlement
    const before = settlementPoints(next, id)
    next = {
      ...next,
      reputation: {
        ...next.reputation,
        settlements: { ...next.reputation.settlements, [id]: before + amount },
      },
    }
    const [was, now] = [standingOf(before), standingOf(before + amount)]
    if (!quiet && was !== now)
      next = note(next, `${settlementName(next, id)} ${TIER_VERB[now]} now${suffix}.`, tone)
  }
  return next
}

/** The kingdom holding a settlement's domain, if any. */
export const kingdomOf = (state: Pick<GameState, 'world'>, settlementId: string) =>
  state.world.kingdoms.find((k) => k.domains.includes(settlementId)) ?? null

/**
 * "A good word" (design §8): a patron's recommendation raises standing by `amount` with every
 * settlement of a kingdom, with one journal line rather than one per settlement. Pure.
 */
export function goodWord(state: GameState, kingdomId: string, amount: number): GameState {
  const kingdom = state.world.kingdoms.find((k) => k.id === kingdomId)
  if (!kingdom || amount === 0) return state
  let next = state
  for (const id of kingdom.domains)
    next = addReputation(next, { settlement: id, amount }, { quiet: true })
  const text =
    amount > 0
      ? `Word of you spreads through ${kingdom.name}: ${formatSigned(amount)} reputation in each of its settlements.`
      : `Ill word of you spreads through ${kingdom.name}: ${formatSigned(amount)} reputation in each of its settlements.`
  return note(next, text, amount > 0 ? 'good' : 'bad')
}

const formatSigned = (n: number) => (n > 0 ? `+${n}` : `−${-n}`)

/**
 * How the settlement's standing moves its markets' buy/sell spread (a fraction, added to the
 * spread): −STANDING_SPREAD per tier above stranger, + per tier below.
 */
export function standingSpreadModifier(state: RepState, settlementId: string): number {
  const steps = standingSteps(settlementStanding(state, settlementId))
  return steps === 0 ? 0 : -steps * STANDING_SPREAD
}

/**
 * A kingdom's reputation (design §8, designer call 2026-11-14): derived, never stored. It is the
 * average of the points with each of its settlements (0 where the party has none), rounded to a
 * whole point; for tooltips now, and for favours later.
 */
export type KingdomReputation = {
  id: string
  name: string
  /** The average of its settlements' points, rounded. */
  points: number
  standing: Standing
  /** How many settlements it holds. */
  settlements: number
}

/** The reputation of the kingdom holding a settlement's domain; null outside any kingdom. */
export function kingdomReputation(
  state: Pick<GameState, 'world' | 'reputation'>,
  settlementId: string
): KingdomReputation | null {
  const kingdom = kingdomOf(state, settlementId)
  if (!kingdom || kingdom.domains.length === 0) return null
  const total = kingdom.domains.reduce((sum, id) => sum + settlementPoints(state, id), 0)
  // + 0 turns a rounded −0 into 0.
  const points = Math.round(total / kingdom.domains.length) + 0
  return {
    id: kingdom.id,
    name: kingdom.name,
    points,
    standing: standingOf(points),
    settlements: kingdom.domains.length,
  }
}

/** The notable person who keeps a service in a settlement (their role's service), if any. */
export function shopKeeper(
  state: Pick<GameState, 'world'>,
  content: Content,
  settlementId: string,
  serviceId: string
): string | null {
  for (const [id, person] of Object.entries(state.world.people)) {
    if (person.settlement !== settlementId || !Object.hasOwn(content.personRoles, person.role))
      continue
    if (content.personRoles[person.role].service === serviceId) return id
  }
  return null
}

const TRADED = 'traded:'

/** gp traded in the current settlement since arriving (kept in doneHere as "traded:<gp>"). */
export const tradedHere = (state: Pick<GameState, 'doneHere'>): number =>
  Number(state.doneHere.find((d) => d.startsWith(TRADED))?.slice(TRADED.length) ?? 0)

/**
 * Trading volume earns standing where the party is: a point per TRADE_REP_GP traded (bought plus
 * sold), at most TRADE_REP_MAX per arrival. Call it after each trade with the gp it moved. Pure.
 */
export function tradeReputation(state: GameState, gp: number): GameState {
  const here = state.location
  if (!here || !Object.hasOwn(state.world.settlements, here) || gp <= 0) return state
  const before = tradedHere(state)
  const after = before + gp
  const points = (total: number) => Math.min(TRADE_REP_MAX, Math.floor(total / TRADE_REP_GP))
  const doneHere = [...state.doneHere.filter((d) => !d.startsWith(TRADED)), `${TRADED}${after}`]
  return addReputation(
    { ...state, doneHere },
    {
      settlement: here,
      amount: points(after) - points(before),
      reason: 'trade',
    }
  )
}

export type PersonRow = {
  id: string
  /** With their title, e.g. "Mother Ada Stone". */
  name: string
  /** The role's name, e.g. "innkeeper". */
  role: string
}

/** The notable people of the settlement the party is in (flavour and roles: no reputation). */
export function peopleRows(state: GameState, content: Content): PersonRow[] {
  const here = state.location
  if (!here) return []
  return Object.entries(state.world.people)
    .filter(([, p]) => p.settlement === here)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, p]) => ({
      id,
      name: personDisplayName(state.world, content, id),
      role: Object.hasOwn(content.personRoles, p.role) ? content.personRoles[p.role].name : p.role,
    }))
}

/** Why a `standing` requirement isn't met, e.g. "needs reputation 5 in Avarus"; null if met. */
export function unmetStanding(state: GameState, min: Standing): string | null {
  const id = encounterSettlement(state)
  if (atLeast(settlementStanding(state, id), min)) return null
  return `needs reputation ${standingFloor(min)}${id ? ` in ${settlementName(state, id)}` : ''}`
}

/**
 * What a number of reputation points means (the UI shows the points; this goes in their tooltip):
 * the standing, its range of points, and what it does to spreads and the rumour check.
 */
export type StandingView = {
  points: number
  standing: Standing
  /** The range of points of this standing: no floor for hated, no ceiling for honoured. */
  min: number | null
  max: number | null
  /** Percentage points the buy/sell spread narrows (negative: widens). */
  spread: number
  /** How much lower the rumour DC is (negative: higher). */
  rumourDc: number
}

export function standingView(points: number): StandingView {
  const standing = standingOf(points)
  const i = STANDINGS.indexOf(standing)
  const floor = STANDING_POINTS[standing]
  const steps = standingSteps(standing)
  return {
    points,
    standing,
    min: Number.isFinite(floor) ? floor : null,
    max: i + 1 < STANDINGS.length ? STANDING_POINTS[STANDINGS[i + 1]] - 1 : null,
    spread: Math.round(steps * STANDING_SPREAD * 100),
    rumourDc: steps,
  }
}
