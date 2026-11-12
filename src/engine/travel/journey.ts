import type { Content } from '../../content/build'
import type { Pace } from '../../schema/constants'
import type { GameState, TravelState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { drawEncounter, inProgress, startEncounter, type Place } from '../encounters/run'
import { appendLog } from '../log'
import { withRng } from '../rng'
import { canAct } from '../rules/character'
import { otherEnd, settlementName } from '../world/geo'
import { DEFAULT_PACE, coversTracks, logPaceDay } from './pace'
import { forageDay, type ForageResult } from './forage'
import { foldTrail } from './pursuit'
import {
  canMeetEncounters,
  fareFor,
  journeyDays,
  kmPerDay,
  rollEncounterDays,
  routeEncounters,
  routeTerrain,
  routeThreat,
} from './routes'
import {
  buyFood,
  buyWaterskin,
  partyWaterCapacity,
  passDay,
  refillWater,
  rest,
  runsShort,
  sellSupplies,
} from './supplies'
import { stowAway, stowawayRefusal, type StowawayOutcome } from './stowaway'

/**
 * The pace, covering tracks and foraging are chosen at departure only (design §7): no action
 * changes them on the road.
 */
export type TravelAction =
  | {
      type: 'travel'
      routeId: string
      pace?: Pace
      coverTracks?: boolean
      /** Forage each day on land (default true). */
      forage?: boolean
      /** Sneak aboard a ship the party can't pay for (stowaway.ts). */
      stowaway?: boolean
    }
  | { type: 'continueJourney' }
  | { type: 'rest'; lodging?: boolean }
  | { type: 'buyFood'; amount: number }
  | { type: 'buyWaterskin'; count?: number }
  | { type: 'sellSupplies'; food?: number; waterskins?: number }

export type DepartOptions = {
  pace?: Pace
  coverTracks?: boolean
  forage?: boolean
  stowaway?: boolean
}

const BUSY = 'Finish the current encounter first.'
const UNFIT = 'No one is fit to travel on.'
/** A safety cap on the days one Continue may walk; real journeys are far shorter. */
export const MAX_DAYS_PER_CONTINUE = 60

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`)

/** How the departure line names the pace (steady goes unsaid). */
const PACE_PHRASE: Readonly<Record<Pace, string>> = {
  cautious: ' at a cautious pace',
  steady: '',
  brisk: ' at a brisk pace',
  forced: ' on a forced march',
}

/** The pace a route is really travelled at: a ship sails at its own speed, so always steady. */
export function paceFor(
  route: { terrain: string },
  pace: Pace = DEFAULT_PACE,
  coverTracks = false
): { pace: Pace; coverTracks: boolean } {
  if (route.terrain === 'sea') return { pace: DEFAULT_PACE, coverTracks: false }
  return { pace, coverTracks: coversTracks(pace, coverTracks) }
}

/**
 * Sets out from the current settlement along one of its routes, at a pace (steady by default),
 * foraging each day on land unless told not to. Covering tracks only counts at a cautious pace;
 * at sea the ship sets the pace. A party that can't pay a ship's fare may stow away instead.
 */
export function depart(
  state: GameState,
  content: Content,
  routeId: string,
  options: DepartOptions = {}
): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const here = state.location
  if (state.travel || here === null) {
    return appendLog(state, 'The party is already on the road.', 'bad')
  }
  const route = Object.hasOwn(content.routes, routeId) ? content.routes[routeId] : undefined
  if (!route || (route.from !== here && route.to !== here)) {
    return appendLog(
      state,
      `No road "${routeId}" leads from ${settlementName(state, here)}.`,
      'bad'
    )
  }
  if (!state.party.some(canAct)) return appendLog(state, UNFIT, 'bad')
  if (options.stowaway) {
    const refused = stowawayRefusal(state, route)
    if (refused) return appendLog(state, refused, 'bad')
    const site = Object.hasOwn(content.settlements, here) ? content.settlements[here] : null
    const place: Place | null = site ? { biome: route.terrain, region: site.region } : null
    const { state: aboard, outcome, brawl } = stowAway(state, content, place)
    const out = setOut(aboard, content, route, here, options, STOWAWAY_PHRASE[outcome])
    if (!brawl) return out
    const at = placeOnRoute(content, out.travel!) ?? place ?? undefined
    return startEncounter(out, content, brawl, at)
  }
  const fare = fareFor(route, state.party.length)
  if (state.gold < fare) return appendLog(state, `Passage costs ${fare} gp.`, 'bad')
  const passage = fare > 0 ? `, ${fare} gp passage` : ''
  return setOut({ ...state, gold: state.gold - fare }, content, route, here, options, passage)
}

/** How the departure line ends for a stowaway, by what happened on the gangplank. */
const STOWAWAY_PHRASE: Readonly<Record<StowawayOutcome, string>> = {
  unseen: ', hidden in the hold',
  fined: ', below decks',
  worked: ', working its passage',
  brawl: ', below decks',
}

/** Starts the journey itself, once the fare (or the stowaway check) is settled. */
function setOut(
  state: GameState,
  content: Content,
  route: Route,
  here: string,
  options: DepartOptions,
  passage: string
): GameState {
  const requestedPace = options.pace ?? DEFAULT_PACE
  const requestedCover = options.coverTracks ?? false
  const { pace, coverTracks } = paceFor(route, requestedPace, requestedCover)
  const to = otherEnd(route, here)
  const length = journeyDays(route, pace, coverTracks)
  const { encounters, chance } = routeEncounters(
    canMeetEncounters(content, route),
    length,
    route.danger,
    routeThreat(state, content, route),
    pace
  )
  const [encounterDays, rng] = withRng(state.rng, (d) =>
    rollEncounterDays(d, length, encounters, chance)
  )
  const travel: TravelState = {
    route: route.id,
    from: here,
    to,
    km: route.km,
    kmPerDay: kmPerDay(route.terrain, pace, coverTracks),
    kmDone: 0,
    daysDone: 0,
    days: length,
    encounterDays,
    pace,
    coverTracks,
    paceLog: [],
    forage: (options.forage ?? true) && route.terrain !== 'sea',
  }
  const how = PACE_PHRASE[pace] + (coverTracks ? ', covering its tracks' : '')
  const ship =
    route.terrain === 'sea' && (requestedPace !== DEFAULT_PACE || requestedCover)
      ? ' The ship sets the pace.'
      : ''
  const noForage = route.terrain !== 'sea' && options.forage === false ? ' No foraging.' : ''
  return appendLog(
    { ...state, rng, location: null, travel },
    `The party sets out for ${settlementName(state, to)}${how}: ${route.km} km, ` +
      `about ${days(length)}${passage}.${ship}${noForage}`,
    'info'
  )
}

/**
 * Where an encounter on this journey happens (the route's terrain and the nearer end's region),
 * and how the party is moving.
 */
export function placeOnRoute(content: Content, travel: TravelState): Place | null {
  const route = Object.hasOwn(content.routes, travel.route) ? content.routes[travel.route] : null
  const end = travel.kmDone < travel.km / 2 ? travel.from : travel.to
  const site = Object.hasOwn(content.settlements, end) ? content.settlements[end] : null
  if (!route || !site) return null
  return {
    biome: route.terrain,
    region: site.region,
    pace: travel.pace,
    coverTracks: travel.coverTracks,
  }
}

/** Pursuits keep the finished journey's days, so their pace can still be judged later. */
const isPursuit = (content: Content) => (id: string) =>
  Object.hasOwn(content.situations, id) && content.situations[id].pursuit === true

function arrive(state: GameState, content: Content): GameState {
  const travel = state.travel!
  const arrived: GameState = {
    ...state,
    travel: null,
    location: travel.to,
    goods: refillWater(state.goods, partyWaterCapacity(state)),
    followUps: foldTrail(state.followUps, travel.paceLog, isPursuit(content)),
  }
  return appendLog(
    arrived,
    `Arrived at ${settlementName(state, travel.to)} after ${days(travel.daysDone)} on the road. ` +
      'The waterskins are refilled.',
    'good'
  )
}

/** The finds of the days foraged since the last summary line. */
type ForageTally = { dc: number; foragers: string[]; food: number; water: number; full: boolean }

const names = (list: readonly string[]): string =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`

/** e.g. "Foraging (Survival DC 10, Brom): 4 water, 2 food. The waterskins are full." */
function forageText(t: ForageTally): string {
  const found = [t.water > 0 && `${t.water} water`, t.food > 0 && `${t.food} food`].filter(Boolean)
  return (
    `Foraging (Survival DC ${t.dc}, ${names(t.foragers)}): ` +
    `${found.length > 0 ? found.join(', ') : 'nothing found'}.` +
    (t.full ? ' The waterskins are full.' : '')
  )
}

/**
 * Walks on, day by day, until something happens: an encounter (on its drawn day), a day someone
 * went short of food or water, a party that can't go on, or arrival. Each day on land the
 * best-suited member forages first (unless the journey set out without foraging). Quiet days and
 * their foraging become one line. Each day walked is recorded with its pace, for pursuit.
 */
export function continueJourney(state: GameState, content: Content): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  if (!state.travel) return appendLog(state, 'The party is not on the road.', 'bad')
  // The route was removed from the data since this save: skip to the destination.
  if (!Object.hasOwn(content.routes, state.travel.route)) return arrive(state, content)

  let next = state
  let quiet = 0
  let tally: ForageTally | null = null
  const strainLines: string[] = []
  const flush = (s: GameState): GameState => {
    const t = s.travel!
    const parts: string[] = []
    if (quiet > 0) {
      parts.push(
        `${quiet === 1 ? 'A quiet day' : `${quiet} quiet days`} on the road to ` +
          `${settlementName(s, t.to)} (${Math.round(t.kmDone)} of ${t.km} km).`
      )
    }
    if (tally) parts.push(forageText(tally))
    let out = parts.length > 0 ? appendLog(s, parts.join(' '), 'info') : s
    for (const line of strainLines) out = appendLog(out, line, 'bad')
    quiet = 0
    tally = null
    strainLines.length = 0
    return out
  }
  const record = (s: GameState, r: ForageResult) => {
    const name = s.party.find((c) => c.id === r.actorId)?.name ?? '?'
    const t: ForageTally = tally ?? { dc: r.dc, foragers: [], food: 0, water: 0, full: false }
    tally = {
      dc: r.dc,
      foragers: t.foragers.includes(name) ? t.foragers : [...t.foragers, name],
      food: t.food + r.food,
      water: t.water + r.water,
      full: t.full || r.wasted > 0,
    }
    if (r.strained > 0) {
      strainLines.push(`${name} is strained: Survival −${r.strained} until it fades.`)
    }
  }

  for (let guard = 0; guard <= MAX_DAYS_PER_CONTINUE; guard++) {
    const travel = next.travel!
    const fit = next.party.some(canAct)
    // A party that can't go on keeps its encounter days until it has made camp.
    if (fit && travel.encounterDays.length > 0 && travel.encounterDays[0] <= travel.daysDone) {
      const queued = {
        ...flush(next),
        travel: { ...travel, encounterDays: travel.encounterDays.slice(1) },
      }
      const place = placeOnRoute(content, travel) ?? undefined
      const drawn = drawEncounter(queued, content, undefined, place)
      if (drawn.encounter && drawn.encounter !== queued.encounter) return drawn
      // Nothing fits here, the party steered clear, or its pursuers lost it: the road goes on.
      next = drawn
      continue
    }
    if (travel.kmDone >= travel.km) return arrive(flush(next), content)
    if (!fit) return appendLog(flush(next), `${UNFIT} Make camp to recover.`, 'bad')

    const terrain = routeTerrain(content, travel)
    if (travel.forage) {
      const foraged = forageDay(next, terrain, travel.pace)
      next = foraged.state
      if (foraged.result) record(next, foraged.result)
    }
    const short = runsShort(next, terrain)
    if (short) next = flush(next)
    const day = travel.daysDone + 1
    const walked = logPaceDay(
      {
        ...travel,
        daysDone: day,
        kmDone: Math.min(travel.km, travel.kmDone + travel.kmPerDay),
      },
      next.day
    )
    next = { ...passDay(next, terrain, travel.pace), travel: walked }
    const eventful = travel.encounterDays[0] === day
    if (short && !eventful) return next
    if (!short && !eventful) quiet += 1
  }
  return flush(next)
}

export function stepTravel(state: GameState, action: TravelAction, content: Content): GameState {
  switch (action.type) {
    case 'travel':
      return depart(state, content, action.routeId, action)
    case 'continueJourney':
      return continueJourney(state, content)
    case 'rest':
      return rest(state, content, action.lodging)
    case 'buyFood':
      return buyFood(state, action.amount)
    case 'buyWaterskin':
      return buyWaterskin(state, action.count)
    case 'sellSupplies':
      return sellSupplies(state, action)
  }
}
