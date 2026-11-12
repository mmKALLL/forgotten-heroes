import type { Content } from '../../content/build'
import type { Pace } from '../../schema/constants'
import type { GameState, TravelState } from '../../schema/state'
import { drawEncounter, inProgress, type Place } from '../encounters/run'
import { appendLog } from '../log'
import { withRng } from '../rng'
import { canAct } from '../rules/character'
import { otherEnd, settlementName } from '../world/geo'
import { DEFAULT_PACE, coversTracks, logPaceDay } from './pace'
import { foldTrail } from './pursuit'
import {
  encounterChance,
  encounterRange,
  fareFor,
  journeyDays,
  kmPerDay,
  rollEncounterDays,
  routeTerrain,
  routeThreat,
} from './routes'
import { buyFood, passDay, refillWater, rest, runsShort } from './supplies'

export type TravelAction =
  | { type: 'travel'; routeId: string; pace?: Pace; coverTracks?: boolean }
  | { type: 'continueJourney' }
  | { type: 'rest' }
  | { type: 'buyFood'; amount: number }

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
 * Sets out from the current settlement along one of its routes, at a pace (steady by default).
 * Covering tracks only counts at a cautious pace; at sea the ship sets the pace.
 */
export function depart(
  state: GameState,
  content: Content,
  routeId: string,
  requestedPace: Pace = DEFAULT_PACE,
  requestedCover = false
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
  const fare = fareFor(route, state.party.length)
  if (state.gold < fare) return appendLog(state, `Passage costs ${fare} gp.`, 'bad')

  const { pace, coverTracks } = paceFor(route, requestedPace, requestedCover)
  const to = otherEnd(route, here)
  const length = journeyDays(route, pace, coverTracks)
  const chance = encounterChance(route.danger, routeThreat(state, content, route), pace)
  const [encounterDays, rng] = withRng(state.rng, (d) =>
    rollEncounterDays(d, length, encounterRange(length), chance)
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
  }
  const how = PACE_PHRASE[pace] + (coverTracks ? ', covering its tracks' : '')
  const passage = fare > 0 ? `, ${fare} gp passage` : ''
  const ship =
    route.terrain === 'sea' && (requestedPace !== DEFAULT_PACE || requestedCover)
      ? ' The ship sets the pace.'
      : ''
  return appendLog(
    { ...state, rng, gold: state.gold - fare, location: null, travel },
    `The party sets out for ${settlementName(state, to)}${how}: ${route.km} km, ` +
      `about ${days(length)}${passage}.${ship}`,
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
    goods: refillWater(state.goods, state.party.length),
    followUps: foldTrail(state.followUps, travel.paceLog, isPursuit(content)),
  }
  return appendLog(
    arrived,
    `Arrived at ${settlementName(state, travel.to)} after ${days(travel.daysDone)} on the road. ` +
      'The waterskins are refilled.',
    'good'
  )
}

/**
 * Walks on, day by day, until something happens: an encounter (on its drawn day), a day someone
 * went short of food or water, a party that can't go on, or arrival. Quiet days become one line.
 * Each day walked is recorded with its pace, for pursuit.
 */
export function continueJourney(state: GameState, content: Content): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  if (!state.travel) return appendLog(state, 'The party is not on the road.', 'bad')
  // The route was removed from the data since this save: skip to the destination.
  if (!Object.hasOwn(content.routes, state.travel.route)) return arrive(state, content)

  let next = state
  let quiet = 0
  const flush = (s: GameState): GameState => {
    if (quiet === 0) return s
    const t = s.travel!
    const text =
      `${quiet === 1 ? 'A quiet day' : `${quiet} quiet days`} on the road to ` +
      `${settlementName(s, t.to)} (${Math.round(t.kmDone)} of ${t.km} km).`
    quiet = 0
    return appendLog(s, text, 'info')
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
      return depart(state, content, action.routeId, action.pace, action.coverTracks)
    case 'continueJourney':
      return continueJourney(state, content)
    case 'rest':
      return rest(state, content)
    case 'buyFood':
      return buyFood(state, action.amount)
  }
}
