import type { Content } from '../../content/build'
import { SERVICE_FUNCTIONS, type ServiceAction, type ServiceFunction } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { inProgress } from '../encounters/run'
import { appendLog } from '../log'
import { MAX_EXHAUSTION } from '../rules/character'
import { qualityEffects, serviceQuality, type QualityEffect } from '../economy/market'
import { heardPrices, marketTalk } from '../economy/trade'
import { withRng } from '../rng'
import { otherEnd, routesFrom, settlementName, straightKm } from '../world/geo'
import { inSettlement, notHere } from '../travel/where'
import { serviceWith } from './animals'
import { rumourOption, rumourRefusal } from './rumours'
import { noticeBoard } from './contracts'
import { recruitOffers } from './recruits'
import { bondGain, changeCamaraderie, livingMembers, shiftCamaraderie } from './camaraderie'
import { accessoryOffers } from '../gear/accessories'
import {
  BLESSING_PRICE,
  CAMARADERIE_ROUND,
  COURIER_ALL_PRICE,
  COURIER_ALL_SPEED,
  COURIER_KM_PER_DAY,
  COURIER_NEIGHBOURS_PRICE,
  COMMON_ROOM_HEAL,
  HEALER_PRICE,
  LODGING_PRICE,
  OFF_ROAD_WINDING,
  PRIVATE_ROOM_EXHAUSTION,
  PRIVATE_ROOM_FADE,
  PRIVATE_ROOM_HEAL,
  PRIVATE_ROOM_MIN_QUALITY,
  PRIVATE_ROOM_PRICE,
  ROUND_PRICE,
} from '../constants'

// The services of a settlement (design §5): lodging tiers, healers, temples and couriers. What a
// service does is its role (content `serviceRoles`); quality is derived (economy/market.ts).

export type Room = 'common' | 'private'

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

/** A room at the inn here: its price for the party and the Strain stacks a night fades. */
export type LodgingOption = {
  room: Room
  service: string
  cost: number
  fade: number
  /** The share of each member's max HP a night there heals. */
  heal: number
  /** What a night there does, very short (English): "40% HP · −1 exhaustion · −1 strain". */
  effect: string
}

/**
 * A night's rest at the inn (supplies.ts `rest`): a day, `heal` of each member's own max HP back,
 * `lifts` exhaustion and `fade` Strain stacks.
 */
const roomEffect = (heal: number, fade: number, lifts: number, camaraderie = 0): string =>
  [
    `${Math.round(heal * 100)}% HP · −${lifts} exhaustion · −${fade} strain`,
    camaraderie > 0 && `+${camaraderie} camaraderie`,
  ]
    .filter(Boolean)
    .join(' · ')

/**
 * The rooms of the inn here (a service whose role offers lodging): a common room, and a private
 * room where the inn's quality is PRIVATE_ROOM_MIN_QUALITY or better. None without an inn.
 */
export function lodgingOptions(state: GameState, content: Content): LodgingOption[] {
  const inn = serviceWith(state, content, 'lodging')
  if (!inn || state.location === null) return []
  const members = state.party.length
  const rooms: LodgingOption[] = [
    {
      room: 'common',
      service: inn,
      cost: LODGING_PRICE * members,
      fade: 1,
      heal: COMMON_ROOM_HEAL,
      effect: roomEffect(COMMON_ROOM_HEAL, 1, 1),
    },
  ]
  if (serviceQuality(state, state.location, inn) >= PRIVATE_ROOM_MIN_QUALITY) {
    rooms.push({
      room: 'private',
      service: inn,
      cost: PRIVATE_ROOM_PRICE * members,
      fade: PRIVATE_ROOM_FADE,
      heal: PRIVATE_ROOM_HEAL,
      // A night in good rooms also brings the party closer, once per arrival (bond).
      effect: roomEffect(
        PRIVATE_ROOM_HEAL,
        PRIVATE_ROOM_FADE,
        PRIVATE_ROOM_EXHAUSTION,
        bondGain(state)
      ),
    })
  }
  return rooms
}

/** The refusal for want of coin; the UI shows it only on the disabled button (designer). */
export const NOT_ENOUGH_GOLD = 'not enough gold'

/** Once-per-arrival key (doneHere) for standing a round. */
const ROUND = 'round'

/** Standing the party a round at the inn (Plan 6): its price, what it does, and whether it can. */
export type RoundOption = {
  /** gp: ROUND_PRICE per living member. */
  cost: number
  /** The camaraderie it adds (CAMARADERIE_ROUND, less at the top of the scale). */
  camaraderie: number
  available: boolean
  /** Why not (English), or null. */
  reason: string | null
}

/** What standing a round here would cost and bring; flat gains, a per-member price. */
export function roundOption(state: GameState): RoundOption {
  const cost = ROUND_PRICE * livingMembers(state).length
  const camaraderie =
    shiftCamaraderie(state.camaraderie, CAMARADERIE_ROUND).value - state.camaraderie
  const reason = state.doneHere.includes(ROUND)
    ? 'already stood a round this visit'
    : state.gold < cost
      ? NOT_ENOUGH_GOLD
      : null
  return { cost, camaraderie, available: reason === null, reason }
}

/** Stands the party a round: pays roundOption's cost for its camaraderie, once per arrival. */
function standRound(state: GameState): GameState {
  const option = roundOption(state)
  if (!option.available) return appendLog(state, `No round: ${option.reason}.`, 'bad')
  const paid = appendLog(
    { ...state, gold: state.gold - option.cost, doneHere: [...state.doneHere, ROUND] },
    `You stand the party a round for ${option.cost} gp.`,
    'good'
  )
  return changeCamaraderie(paid, CAMARADERIE_ROUND, 'a round at the inn')
}

/** Members a healer would treat: alive, and hurt or exhausted. */
export const needsHealer = (state: Pick<GameState, 'party'>): string[] =>
  state.party
    .filter((c) => c.exhaustion < MAX_EXHAUSTION && (c.hp < c.maxHp || c.exhaustion > 0))
    .map((c) => c.id)

/** How far a courier's news reaches (design §5): the neighbouring towns, or every town. */
export type NewsReach = 'neighbours' | 'all'
export const NEWS_REACHES: readonly NewsReach[] = ['neighbours', 'all']

/** A town whose news a courier brings: how far, how old its news is and the day it is from. */
export type NewsTown = { id: string; name: string; km: number; age: number; day: number }

/** One courier option here: what it costs, the towns whose prices it would make fresher. */
export type NewsOption = {
  reach: NewsReach
  cost: number
  /** What it does, very short (English), for the button's second line. */
  effect: string
  /** The towns it would update (only those it makes fresher), nearest first. */
  towns: NewsTown[]
  available: boolean
  /** Why not (English), or null. */
  reason: string | null
}

const NEWS_PRICES: Record<NewsReach, number> = {
  neighbours: COURIER_NEIGHBOURS_PRICE,
  all: COURIER_ALL_PRICE,
}

const NEWS_EFFECTS: Record<NewsReach, string> = {
  neighbours: 'Neighbours’ prices',
  all: 'Every town’s prices',
}

/** How old news from `km` away is: the days it takes to arrive at `speed` × the courier's pace. */
export const newsAge = (km: number, speed = 1): number =>
  Math.ceil(km / (COURIER_KM_PER_DAY * speed))

/** The day a courier's news from a town `age` days away is from. */
const newsDay = (state: Pick<GameState, 'day'>, age: number) => Math.max(1, state.day - age)

/**
 * The settlements a courier here reaches with `reach`, nearest first, each with the age of its
 * news. Neighbours are the settlements one route away, sea routes included (ships carry letters);
 * every town is every settlement of the world, its news travelling COURIER_ALL_SPEED × faster.
 * Distance is the straight km × OFF_ROAD_WINDING, as for any heard price.
 */
function courierTowns(state: GameState, content: Content, reach: NewsReach): NewsTown[] {
  const here = state.location
  const site = here === null ? undefined : own(content.settlements, here)
  if (!site || here === null) return []
  const ids =
    reach === 'neighbours'
      ? new Set(routesFrom(content, here).map((r) => otherEnd(r, here)))
      : new Set(Object.keys(content.settlements))
  const speed = reach === 'all' ? COURIER_ALL_SPEED : 1
  return Object.values(content.settlements)
    .filter((s) => s.id !== here && ids.has(s.id))
    .filter((s) => Object.hasOwn(state.world.settlements, s.id))
    .map((s) => {
      const km = Math.round(straightKm(site.at, s.at) * OFF_ROAD_WINDING)
      const age = newsAge(km, speed)
      return { id: s.id, name: settlementName(state, s.id), km, age, day: newsDay(state, age) }
    })
    .sort((a, b) => a.km - b.km || (a.id < b.id ? -1 : 1))
}

/** Of the towns a courier reaches, those whose prices its news would make fresher. */
const fresher = (state: GameState, towns: NewsTown[]): NewsTown[] =>
  towns.filter((t) => {
    const known = own(state.priceBook, t.id)
    return !known || known.day < t.day
  })

/**
 * The courier's two options here (design §5): the neighbours' news for COURIER_NEIGHBOURS_PRICE
 * and every town's for COURIER_ALL_PRICE, each with exactly the towns it would update (the price
 * book keeps what it knows as fresh or fresher). None without a courier.
 */
export function newsOptions(state: GameState, content: Content): NewsOption[] {
  if (!serviceWith(state, content, 'news')) return []
  return NEWS_REACHES.map((reach) => {
    const reached = courierTowns(state, content, reach)
    const towns = fresher(state, reached)
    const cost = NEWS_PRICES[reach]
    const reason =
      reached.length === 0
        ? 'no town a courier reaches'
        : towns.length === 0
          ? reach === 'neighbours'
            ? 'you know fresher prices from every neighbour'
            : 'you know fresher prices from every town'
          : state.gold < cost
            ? NOT_ENOUGH_GOLD
            : null
    return { reach, cost, effect: NEWS_EFFECTS[reach], towns, available: reason === null, reason }
  })
}

/** One thing a service offers, with its price and whether it can be done now. */
export type ServiceActionView = {
  action: ServiceAction
  /** gp, or null when it has no fixed price (market, animals, passage). */
  cost: number | null
  available: boolean
  /** Why not, or null. */
  reason: string | null
  /**
   * What it does, very short (English), for the button's second line: "+1 Inspiration". Null
   * where the button doesn't buy an effect (lists, the market) or lodging, whose rooms each carry
   * their own (LodgingOption.effect).
   */
  effect: string | null
}

/** The Inspiration a temple's blessing gives. */
const BLESSING_INSPIRATION = 1

/** The exhaustion levels a healer takes off each member treated. */
const HEALER_EXHAUSTION = 1

export type ServiceRow = {
  service: string
  name: string
  function: ServiceFunction
  quality: number
  /** What its quality does here (a shop's spread, an inn's private rooms), for its pips. */
  qualityEffects: QualityEffect[]
  specialty: string | null
  actions: ServiceActionView[]
  /** Nothing the engine supports yet: shown as "coming later". */
  later: boolean
}

function actionView(
  state: GameState,
  content: Content,
  service: string,
  action: ServiceAction
): ServiceActionView {
  const view = (
    cost: number | null,
    reason: string | null = null,
    effect: string | null = null
  ): ServiceActionView => ({
    action,
    cost,
    available: reason === null && (cost === null || state.gold >= cost),
    reason: reason ?? (cost !== null && state.gold < cost ? NOT_ENOUGH_GOLD : null),
    effect,
  })
  switch (action) {
    case 'lodging':
      return view(lodgingOptions(state, content)[0]?.cost ?? null)
    case 'heal': {
      const treated = needsHealer(state).length
      return view(
        treated * HEALER_PRICE,
        treated === 0 ? 'no one needs healing' : null,
        `Full HP · −${HEALER_EXHAUSTION} exhaustion`
      )
    }
    case 'bless':
      return view(
        BLESSING_PRICE,
        state.doneHere.includes(`bless:${service}`) ? 'already blessed this visit' : null,
        `+${BLESSING_INSPIRATION} Inspiration`
      )
    case 'news': {
      // Two options, each with its own price and effect (newsOptions), like lodging's rooms.
      const options = newsOptions(state, content)
      return view(
        null,
        options.some((o) => o.available) ? null : (options[0]?.reason ?? 'no news to bring')
      )
    }
    case 'rumours': {
      // Listening is the listenRumours action, previewed by rumourOption.
      const option = rumourOption(state, content)
      return view(
        option?.cost ?? null,
        rumourRefusal(state, content) ?? (option ? null : 'no one is able to act')
      )
    }
    case 'board': {
      // Offers are taken one by one (acceptContract), listed by noticeBoard.
      const offers = noticeBoard(state, content, state.location!)
      return view(
        null,
        offers.length === 0
          ? 'no work posted this week'
          : offers.some((o) => o.available)
            ? null
            : (offers[0].reason ?? 'nothing you can take')
      )
    }
    case 'round': {
      const option = roundOption(state)
      return view(option.cost, option.reason, `+${option.camaraderie} camaraderie`)
    }
    case 'recruit': {
      // Recruits are hired one by one (hireRecruit), listed by recruitOffers.
      const offers = recruitOffers(state, content, state.location!).filter(
        (o) => o.service === service
      )
      return view(
        null,
        offers.length === 0
          ? 'no one is looking for work this week'
          : offers.some((o) => o.available)
            ? null
            : (offers[0].reason ?? 'no one you can hire')
      )
    }
    case 'accessories': {
      // Bought one by one (buyAccessory), listed by accessoryOffers; sold back from the gear.
      const offers = accessoryOffers(state, content, state.location!)
      return view(
        null,
        offers.some((o) => o.service === service) || state.gear.length > 0
          ? null
          : 'nothing for sale this week'
      )
    }
    default:
      return view(null)
  }
}

/** The services here, grouped by function (design §5 order), each with what it offers. */
export function serviceRows(state: GameState, content: Content): ServiceRow[] {
  const here = state.location
  if (!inSettlement(state) || here === null) return []
  const info = state.world.settlements[here]
  const rows = info.services.map((service): ServiceRow => {
    const role = own(content.serviceRoles, service)
    const actions = (role?.actions ?? []).map((a) => actionView(state, content, service, a))
    const quality = serviceQuality(state, here, service)
    const trades = (role?.trades.length ?? 0) + (role?.buysOnly.length ?? 0) > 0
    return {
      service,
      name: own(content.services, service)?.name ?? service,
      function: role?.function ?? 'trade',
      quality,
      qualityEffects: qualityEffects(quality, {
        trades,
        lodging: role?.actions.includes('lodging') ?? false,
      }),
      specialty: role?.specialty ?? null,
      actions,
      later: actions.length === 0,
    }
  })
  const order = (f: ServiceFunction) => SERVICE_FUNCTIONS.indexOf(f)
  return rows.sort((a, b) => order(a.function) - order(b.function) || (a.name < b.name ? -1 : 1))
}

export type ServiceUse =
  | { type: 'useService'; service: string; action: 'heal' }
  | { type: 'useService'; service: string; action: 'bless' }
  | { type: 'useService'; service: string; action: 'round' }
  | { type: 'useService'; service: string; action: 'news'; reach: NewsReach }

/** Refuses unless the service is here and its role offers the action. */
function serviceHere(
  state: GameState,
  content: Content,
  service: string,
  action: ServiceAction
): string | null {
  if (inProgress(state)) return 'Finish the current encounter first.'
  if (!inSettlement(state) || state.location === null) {
    return notHere(state, 'Services are only found in a settlement.')
  }
  const present = state.world.settlements[state.location].services.includes(service)
  const offers = own(content.serviceRoles, service)?.actions.includes(action) ?? false
  return present && offers ? null : `No one here offers that.`
}

/**
 * A healer: all HP back and one level of exhaustion off for each member who needs it, at
 * HEALER_PRICE each. No day passes.
 */
function heal(state: GameState): GameState {
  const treated = needsHealer(state)
  if (treated.length === 0) return appendLog(state, 'No one needs healing.', 'info')
  const cost = treated.length * HEALER_PRICE
  if (state.gold < cost) return appendLog(state, `The healer asks ${cost} gp.`, 'bad')
  const party = state.party.map((c) =>
    treated.includes(c.id)
      ? { ...c, hp: c.maxHp, exhaustion: Math.max(0, c.exhaustion - HEALER_EXHAUSTION) }
      : c
  )
  return appendLog(
    { ...state, gold: state.gold - cost, party },
    `The healer tends to ${treated.length === 1 ? 'one of you' : `${treated.length} of you`} ` +
      `for ${cost} gp.`,
    'good'
  )
}

/** A temple's blessing: BLESSING_PRICE for 1 Inspiration, once per arrival at each temple. */
function bless(state: GameState, service: string): GameState {
  const key = `bless:${service}`
  if (state.doneHere.includes(key)) {
    return appendLog(state, 'You have already been blessed here.', 'bad')
  }
  if (state.gold < BLESSING_PRICE) {
    return appendLog(state, `A blessing asks an offering of ${BLESSING_PRICE} gp.`, 'bad')
  }
  return appendLog(
    {
      ...state,
      gold: state.gold - BLESSING_PRICE,
      inspiration: state.inspiration + BLESSING_INSPIRATION,
      doneHere: [...state.doneHere, key],
    },
    `You make an offering of ${BLESSING_PRICE} gp and are blessed. Inspiration gained!`,
    'good'
  )
}

/**
 * A courier's news (newsOptions): the prices of the neighbouring towns, or of every town, heard
 * (not seen) and each as old as the news took to come from there, plus what talk says of their
 * shortages and gluts. Towns whose prices the book knows as fresh or fresher are left as they are;
 * refused when there are none.
 */
function news(state: GameState, content: Content, reach: NewsReach): GameState {
  const option = newsOptions(state, content).find((o) => o.reach === reach)
  if (!option) return appendLog(state, 'No courier here brings news.', 'bad')
  if (!option.available) return appendLog(state, `No news: ${option.reason}.`, 'bad')
  // Heard, not seen: a little off, like a rumour's prices (RUMOUR_SKEW).
  const [entries, rng] = withRng(state.rng, (d) =>
    option.towns.map((t) => [
      t.id,
      { day: t.day, heard: true, prices: heardPrices(d, state, content, t.id, t.day) },
    ])
  )
  const ages = option.towns.map((t) => t.age)
  const [young, old] = [Math.min(...ages), Math.max(...ages)]
  const age = young === old ? daysOld(young) : `${young}–${daysOld(old)}`
  const towns = option.towns.length === 1 ? option.towns[0].name : `${option.towns.length} towns`
  let told = appendLog(
    {
      ...state,
      rng,
      gold: state.gold - option.cost,
      priceBook: { ...state.priceBook, ...Object.fromEntries(entries) },
    },
    `For ${option.cost} gp couriers bring the prices of ${towns}, ${age} old.`,
    'info'
  )
  for (const t of option.towns) {
    const talk = marketTalk(state, content, t.id, t.day)
    if (talk) told = appendLog(told, talk, 'info')
  }
  return told
}

/** "a day", "3 days": how old news is. */
const daysOld = (days: number) => (days === 1 ? 'a day' : `${days} days`)

export function useService(state: GameState, content: Content, use: ServiceUse): GameState {
  const refused = serviceHere(state, content, use.service, use.action)
  if (refused) return appendLog(state, refused, 'bad')
  switch (use.action) {
    case 'heal':
      return heal(state)
    case 'bless':
      return bless(state, use.service)
    case 'round':
      return standRound(state)
    case 'news':
      return news(state, content, use.reach)
  }
}
