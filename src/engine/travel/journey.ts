import type { Content } from '../../content/build'
import type { Pace } from '../../schema/types'
import type { GameState, TravelState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { drawEncounter, inProgress, startEncounter, type Place } from '../encounters/run'
import { appendLog } from '../log'
import { withRng } from '../rng'
import { canAct } from '../rules/character'
import { otherEnd, settlementName } from '../world/geo'
import { edgeById, nodeOf } from '../world/graph'
import { domainAt } from '../world/pois'
import { logPaceDay } from './pace'
import { forageDay, type ForageResult } from './forage'
import { foldTrail } from './pursuit'
import {
  canMeetEncounters,
  fareFor,
  hostileShare,
  journeyDays,
  journeyKmPerDay,
  landSpeed,
  passengers,
  rollEncounterDays,
  routeEncounters,
  routeTerrain,
  routeThreat,
} from './routes'
import { autoRefill, buyWaterskin, passDay, rest, runsShort, sellWaterskin } from './supplies'
import { observe } from '../economy/trade'
import { stowAway, stowawayRefusal, type StowawayOutcome } from './stowaway'
import { suppliesLast, supplyOutlook } from './outlook'
import { load, overloadExcess, type Hired } from '../economy/capacity'
import { visibleWealth } from '../economy/wealth'
import { animalBlock, animalBlockText, hireCost, hireOffer } from '../town/animals'
import type { Room } from '../town/services'
import { contractsOnArrival, isEscorting } from '../town/contracts'
import { desertOnArrival } from '../town/camaraderie'
import { DEFAULT_PACE } from '../constants'

/**
 * The pace and foraging are chosen at departure only (design §7): no action
 * changes them on the road.
 */
export type TravelAction =
  | {
      type: 'travel'
      routeId: string
      /** Stealthy covers the party's tracks (pursuit.ts). */
      pace?: Pace
      /** Forage each day on land (default true). */
      forage?: boolean
      /** Sneak aboard a ship the party can't pay for (stowaway.ts). */
      stowaway?: boolean
      /** Hire riding animals for this journey (town/animals.ts hireOffer). */
      hire?: boolean
    }
  | { type: 'continueJourney' }
  /** A day of rest: true or "common" for a common room, "private", or false for own food. */
  | { type: 'rest'; lodging?: boolean | Room }
  | { type: 'buyWaterskin'; count?: number }
  | { type: 'sellWaterskin'; count?: number }

export type DepartOptions = {
  pace?: Pace
  forage?: boolean
  stowaway?: boolean
  hire?: boolean
}

const BUSY = 'Finish the current encounter first.'
const UNFIT = 'No one is fit to travel on.'
/** A safety cap on the days one Continue may walk; real journeys are far shorter. */
export const MAX_DAYS_PER_CONTINUE = 60

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`)

/** How the departure line names the pace (steady goes unsaid). */
const PACE_PHRASE: Readonly<Record<Pace, string>> = {
  stealthy: ' at a stealthy pace, covering its tracks',
  steady: '',
  brisk: ' at a brisk pace',
  forced: ' on a forced march',
}

/** The pace a route is really travelled at: a ship sails at its own speed, so always steady. */
export const paceFor = (route: { terrain: string }, pace: Pace = DEFAULT_PACE): Pace =>
  route.terrain === 'sea' ? DEFAULT_PACE : pace

/**
 * Sets out from the current settlement along one of its routes, at a pace (steady by default),
 * foraging each day on land unless told not to. At sea the ship sets the pace. A party that can't pay a ship's fare may stow away instead.
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
  const route = edgeById(state, content, routeId)
  if (!route || (route.from !== here && route.to !== here)) {
    return appendLog(
      state,
      `No road "${routeId}" leads from ${settlementName(state, here)}.`,
      'bad'
    )
  }
  if (!state.party.some(canAct)) return appendLog(state, UNFIT, 'bad')
  state = topUpWater(state, content, here)
  const blocked = animalBlock(state, content, route)
  if (blocked) return appendLog(state, animalBlockText(blocked), 'bad')
  const offer = options.hire ? hireOffer(state, content, route) : null
  if (options.hire && !offer)
    return appendLog(state, 'There are no mounts for hire for that road.', 'bad')
  const hired: Hired | null = offer && { animal: offer.animal, count: offer.count }
  // On land the party carries everything itself (and its mounts); a ship carries it at sea.
  const laden = load(state, content, { hired })
  if (route.terrain !== 'sea' && laden.level === 'overloaded') {
    return appendLog(
      state,
      `Too heavy to set out: drop or sell ${overloadExcess(laden)} kg.`,
      'bad'
    )
  }
  if (route.terrain !== 'sea' && laden.level === 'encumbered' && options.pace === 'forced') {
    return appendLog(state, 'Too heavily laden for a forced march.', 'bad')
  }
  if (options.stowaway) {
    const refused = stowawayRefusal(state, route)
    if (refused) return appendLog(state, refused, 'bad')
    const node = nodeOf(state, content, here)
    const place: Place | null = node
      ? { biome: route.terrain, land: node.land, domain: node.domain }
      : null
    const { state: aboard, outcome, brawl } = stowAway(state, content, place)
    const out = setOut(aboard, content, route, here, options, STOWAWAY_PHRASE[outcome])
    if (!brawl) return out
    const at = placeOnRoute(out, content, out.travel!) ?? place ?? undefined
    return startEncounter(out, content, brawl, at)
  }
  const fare = fareFor(route, passengers(state))
  if (state.gold < fare) return appendLog(state, `Passage costs ${fare} gp.`, 'bad')
  const passage = fare > 0 ? `, ${fare} gp passage` : ''
  if (offer && hired) {
    const pace = paceFor(route, options.pace)
    const length = journeyDays(route, pace, landSpeed(state, content, route.terrain, hired))
    const cost = hireCost(offer, length)
    if (state.gold < cost) {
      return appendLog(state, `Hiring ${offer.name.toLowerCase()}s costs ${cost} gp.`, 'bad')
    }
    const riding = `, riding hired ${offer.name.toLowerCase()}s (${cost} gp)`
    return setOut(
      { ...state, gold: state.gold - cost },
      content,
      route,
      here,
      options,
      riding,
      hired
    )
  }
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
  passage: string,
  hired: Hired | null = null
): GameState {
  const requestedPace = options.pace ?? DEFAULT_PACE
  const pace = paceFor(route, requestedPace)
  const to = otherEnd(route, here)
  const speed = landSpeed(state, content, route.terrain, hired)
  const heavy = route.terrain !== 'sea' && load(state, content, { hired }).level !== 'light'
  const length = journeyDays(route, pace, speed)
  const { encounters, chance } = routeEncounters(canMeetEncounters(content, route, state), length)
  const [encounterDays, rng] = withRng(state.rng, (d) =>
    rollEncounterDays(d, length, encounters, chance)
  )
  const travel: TravelState = {
    route: route.id,
    from: here,
    to,
    km: route.km,
    kmPerDay: journeyKmPerDay(route, pace, speed),
    kmDone: 0,
    daysDone: 0,
    days: length,
    encounterDays,
    pace,
    paceLog: [],
    forage: (options.forage ?? true) && route.terrain !== 'sea',
    hired,
  }
  const how = PACE_PHRASE[pace]
  const ship =
    route.terrain === 'sea' && requestedPace !== DEFAULT_PACE ? ' The ship sets the pace.' : ''
  const noForage = route.terrain !== 'sea' && options.forage === false ? ' No foraging.' : ''
  const laden = heavy ? ' Heavily laden, it goes slowly.' : ''
  return appendLog(
    { ...state, rng, location: null, travel },
    `The party sets out for ${settlementName(state, to)}${how}: ${route.km} km, ` +
      `about ${days(length)}${passage}.${ship}${noForage}${laden}`,
    'info'
  )
}

/**
 * Where an encounter on this journey happens (the route's terrain, and the land and domain of the
 * nearer end), how the party is moving, and the share of encounters that are hostile now
 * (hostileShare: the route's danger, the higher threat of its two ends, foraging and pace). At sea
 * the domain is the port the party sailed from, whose people hear of what it did (reputation
 * effects and standing requirements go there; see town/reputation.ts encounterSettlement).
 */
export function placeOnRoute(
  state: Pick<GameState, 'world' | 'day'> &
    Partial<Pick<GameState, 'goods' | 'gold' | 'party' | 'contracts'>>,
  content: Content,
  travel: TravelState
): Place | null {
  const route = edgeById(state, content, travel.route)
  const end = travel.kmDone < travel.km / 2 ? travel.from : travel.to
  const node = nodeOf(state, content, end)
  if (!route || !node) return null
  // Visible wealth draws thieves (economy/wealth.ts); without the party's goods there is none.
  const steps =
    state.goods && state.party && state.gold !== undefined
      ? visibleWealth({ goods: state.goods, gold: state.gold, party: state.party }, content).steps
      : 0
  return {
    biome: route.terrain,
    land: node.land,
    domain:
      route.terrain === 'sea'
        ? (nodeOf(state, content, travel.from)?.domain ?? node.domain)
        : node.domain,
    pace: travel.pace,
    forage: travel.forage,
    // The share drawn hostile: drawEncounter then lets the pace steer clear of some.
    hostileShare: hostileShare(
      route.danger,
      routeThreat(state, content, route),
      travel.pace,
      travel.forage,
      steps,
      isEscorting(state)
    ).drawn,
    wealthSteps: steps,
  }
}

/** Pursuits keep the finished journey's days, so their pace can still be judged later. */
const isPursuit = (content: Content) => (id: string) =>
  Object.hasOwn(content.situations, id) && content.situations[id].pursuit === true

/** Arriving anywhere refills the waterskins, except at a POI without a spring or well. */
function watered(state: GameState, content: Content, id: string): boolean {
  if (!Object.hasOwn(state.world.pois, id)) return true
  const type = state.world.pois[id].type
  return Object.hasOwn(content.poiTypes, type) && content.poiTypes[type].water
}

/**
 * Water is refilled wherever it is free and risk-free (designer decision): setting out from a
 * settlement or a site with a spring tops the skins up (autoRefill), unless that would make the
 * load heavier in kind (a party that poured water out to set out isn't loaded up again).
 */
function topUpWater(state: GameState, content: Content, here: string): GameState {
  if (!watered(state, content, here)) return state
  const goods = autoRefill(state, content)
  const same = load({ ...state, goods }, content).level === load(state, content).level
  return same ? { ...state, goods } : state
}

function arrive(state: GameState, content: Content): GameState {
  const travel = state.travel!
  const water = watered(state, content, travel.to)
  // Hired mounts are returned on arrival.
  const returned = travel.hired ? ' The hired mounts are returned.' : ''
  const arrived: GameState = {
    ...state,
    travel: null,
    location: travel.to,
    // A new arrival: the site here may be visited again, and once-per-arrival actions reset.
    visited: false,
    doneHere: [],
    goods: water ? autoRefill(state, content) : state.goods,
    followUps: foldTrail(state.followUps, travel.paceLog, isPursuit(content)),
  }
  // The party sees the market of the settlement it arrives in (economy/trade.ts), and its contracts
  // bound here are met (town/contracts.ts).
  const seen = observe(
    appendLog(
      arrived,
      `Arrived at ${settlementName(state, travel.to)} after ${days(travel.daysDone)} on the road.` +
        (water ? ' The waterskins are refilled.' : '') +
        returned,
      'good'
    ),
    content,
    travel.to
  )
  // A fractured party may lose hired members on arrival (town/camaraderie.ts).
  return desertOnArrival(contractsOnArrival(seen, content))
}

/**
 * A journey whose road is gone from the data: the party is put back where it set out from (or at
 * the far end, or the nearest domain's settlement, if that is gone too), and the journal says so.
 */
function turnBack(state: GameState, content: Content): GameState {
  const travel = state.travel!
  const places = [travel.from, travel.to]
  const candidates = [...places, ...places.map((id) => domainAt(state.world, id))]
  const back = candidates.find((id) => id !== null && nodeOf(state, content, id) !== null)
  if (!back) return appendLog(state, 'The way is lost, and there is no going back.', 'bad')
  return appendLog(
    { ...state, travel: null, location: back, visited: false, doneHere: [] },
    `The way to ${settlementName(state, travel.to)} can no longer be found. ` +
      `The party makes its way back to ${settlementName(state, back)}.`,
    'bad'
  )
}

/** The finds of the days foraged since the last summary line. */
type ForageTally = {
  dc: number
  foragers: string[]
  food: number
  water: number
  full: boolean
  inspired: boolean
}

const names = (list: readonly string[]): string =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`

/** e.g. "Foraging (Survival DC 10, Brom): 4 water, 2 food. The waterskins are full." */
function forageText(t: ForageTally): string {
  const found = [t.water > 0 && `${t.water} water`, t.food > 0 && `${t.food} food`].filter(Boolean)
  return (
    `Foraging (Survival DC ${t.dc}, ${names(t.foragers)}): ` +
    `${found.length > 0 ? found.join(', ') : 'nothing found'}.` +
    (t.full ? ' The waterskins are full.' : '') +
    (t.inspired ? ' Inspiration gained!' : '')
  )
}

/**
 * Walks on, day by day, until something happens: an encounter (on its drawn day), a day someone
 * went short of food or water, a supply warning (the day the food or water carried stops lasting
 * to the end of the road, when it did as this Continue began), a party that can't go on, or
 * arrival. Each day on land the
 * best-suited member forages first (unless the journey set out without foraging). Quiet days and
 * their foraging become one line. Each day walked is recorded with its pace, for pursuit.
 */
export function continueJourney(state: GameState, content: Content): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  if (!state.travel) return appendLog(state, 'The party is not on the road.', 'bad')
  // The route was removed from the data since this save (e.g. a path after content edits).
  if (!edgeById(state, content, state.travel.route)) return turnBack(state, content)

  let next = state
  let quiet = 0
  let tally: ForageTally | null = null
  // A supply warning stops the walk once: only when the supplies lasted as it began.
  const lasted = suppliesLast(supplyOutlook(state, content))
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
    const t: ForageTally = tally ?? {
      dc: r.dc,
      foragers: [],
      food: 0,
      water: 0,
      full: false,
      inspired: false,
    }
    tally = {
      dc: r.dc,
      foragers: t.foragers.includes(name) ? t.foragers : [...t.foragers, name],
      food: t.food + r.food,
      water: t.water + r.water,
      full: t.full || r.wasted > 0,
      inspired: t.inspired || r.inspired,
    }
    if (r.strained > 0) {
      strainLines.push(`${name} is strained: Survival −${r.strained} until it fades.`)
    }
  }

  for (let guard = 0; guard <= MAX_DAYS_PER_CONTINUE; guard++) {
    const travel = next.travel!
    const fit = next.party.some(canAct)
    // A party that can't go on keeps its encounter days until it has made camp. One encounter a
    // day at most: a due day is spent whole (older saves may list a day twice). A pursuit that
    // has come due takes that day's encounter (drawEncounter); it never adds a second.
    if (fit && travel.encounterDays.length > 0 && travel.encounterDays[0] <= travel.daysDone) {
      const queued = {
        ...flush(next),
        travel: {
          ...travel,
          encounterDays: travel.encounterDays.filter((d) => d > travel.daysDone),
        },
      }
      const place = placeOnRoute(next, content, travel) ?? undefined
      const drawn = drawEncounter(queued, content, undefined, place)
      if (drawn.encounter && drawn.encounter !== queued.encounter) return drawn
      // Nothing fits here, the party steered clear, or its pursuers lost it: the road goes on.
      next = drawn
      continue
    }
    if (travel.kmDone >= travel.km) return arrive(flush(next), content)
    if (!fit) return appendLog(flush(next), `${UNFIT} Make camp to recover.`, 'bad')

    const terrain = routeTerrain(next, content, travel)
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
    next = { ...passDay(next, terrain, travel.pace, content), travel: walked }
    const eventful = travel.encounterDays[0] === day
    if (short && !eventful) return next
    if (!short && !eventful) quiet += 1
    if (lasted && !short && !eventful && walked.kmDone < walked.km) {
      const outlook = supplyOutlook(next, content)
      if (!suppliesLast(outlook)) return supplyWarning(flush(next), outlook)
    }
  }
  return flush(next)
}

/** The journal line a supply warning stops the walk with. */
function supplyWarning(state: GameState, outlook: { food: boolean; water: boolean }): GameState {
  const what = !outlook.food && !outlook.water ? 'food and water' : !outlook.food ? 'food' : 'water'
  return appendLog(
    state,
    `At this rate the ${what} won’t last to ${settlementName(state, state.travel!.to)}.`,
    'bad'
  )
}

export function stepTravel(state: GameState, action: TravelAction, content: Content): GameState {
  switch (action.type) {
    case 'travel':
      return depart(state, content, action.routeId, action)
    case 'continueJourney':
      return continueJourney(state, content)
    case 'rest':
      return rest(state, content, action.lodging)
    case 'buyWaterskin':
      return buyWaterskin(state, content, action.count)
    case 'sellWaterskin':
      return sellWaterskin(state, action.count)
  }
}
