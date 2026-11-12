import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { STANDINGS, type LogTone, type Standing } from '../../schema/types'
import { STANDING_POINTS, STANDING_SPREAD, TRADE_REP_GP, TRADE_REP_MAX } from '../constants'
import { appendLog } from '../log'
import { domainAt } from '../world/pois'
import { personDisplayName } from './people'

/**
 * Reputation (design §8, Plan 4 B2): points with each settlement and each notable person, read
 * as a standing tier. Nothing decays; points change only through what the party does.
 */

const STRANGER = STANDINGS.indexOf('stranger')

/** The standing tier for a number of points (thresholds in STANDING_POINTS). */
export function standingOf(points: number): Standing {
  for (let i = STANDINGS.length - 1; i > 0; i--) {
    if (points >= STANDING_POINTS[STANDINGS[i]]) return STANDINGS[i]
  }
  return STANDINGS[0]
}

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

/** Points with a notable person. */
export const personPoints = (state: RepState, id: string): number =>
  Object.hasOwn(state.reputation.people, id) ? state.reputation.people[id] : 0

/** The party's standing with a settlement; a stranger where there is none (e.g. at sea). */
export const settlementStanding = (state: RepState, id: string | null): Standing =>
  standingOf(settlementPoints(state, id))

/** The party's standing with a notable person. */
export const personStanding = (state: RepState, id: string): Standing =>
  standingOf(personPoints(state, id))

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

/** What someone thinks of the party at each tier, after their name: "Avarus trusts you now." */
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
  person?: string | null
  amount: number
  /** Why, appended to the tier-change line, e.g. "for the courier run". */
  reason?: string
}

/**
 * Adds points with a settlement and/or a person, logging "Avarus knows your name now." whenever a
 * tier changes. `content` gives people their titles in that line. Pure.
 */
export function addReputation(
  state: GameState,
  change: ReputationChange,
  content?: Content,
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
  if (change.person) {
    const id = change.person
    const before = personPoints(next, id)
    next = {
      ...next,
      reputation: {
        ...next.reputation,
        people: { ...next.reputation.people, [id]: before + amount },
      },
    }
    const [was, now] = [standingOf(before), standingOf(before + amount)]
    if (!quiet && was !== now) {
      const who = content ? personDisplayName(next.world, content, id) : next.world.people[id]?.name
      next = note(next, `${who ?? id} ${TIER_VERB[now]} now${suffix}.`, tone)
    }
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
    next = addReputation(next, { settlement: id, amount }, undefined, { quiet: true })
  const text =
    amount > 0
      ? `Word of you spreads through ${kingdom.name}: ${formatSigned(amount)} standing in each of its settlements.`
      : `Ill word of you spreads through ${kingdom.name}: ${formatSigned(amount)} standing in each of its settlements.`
  return note(next, text, amount > 0 ? 'good' : 'bad')
}

const formatSigned = (n: number) => (n > 0 ? `+${n}` : `−${-n}`)

/**
 * How standing moves a market's buy/sell spread (a fraction, added to the spread): −STANDING_SPREAD
 * per tier above stranger, + per tier below. A shop kept by a notable person (`personId`) uses the
 * better of the settlement's and the keeper's standing.
 */
export function standingSpreadModifier(
  state: RepState,
  settlementId: string,
  personId?: string | null
): number {
  let steps = standingSteps(settlementStanding(state, settlementId))
  if (personId) steps = Math.max(steps, standingSteps(personStanding(state, personId)))
  return steps === 0 ? 0 : -steps * STANDING_SPREAD
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
  standing: Standing
  points: number
}

/** The notable people of the settlement the party is in, with the party's standing with each. */
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
      standing: personStanding(state, id),
      points: personPoints(state, id),
    }))
}

/** Why a `standing` requirement isn't met, e.g. "needs standing known in Avarus"; null if met. */
export function unmetStanding(state: GameState, min: Standing): string | null {
  const id = encounterSettlement(state)
  if (atLeast(settlementStanding(state, id), min)) return null
  return `needs standing ${min}${id ? ` in ${settlementName(state, id)}` : ''}`
}
