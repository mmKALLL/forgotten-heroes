import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { ContractTemplate } from '../../schema/economy'
import type { ContractKind, Good, Standing } from '../../schema/types'
import type { ContractState, GameState } from '../../schema/state'
import { revealPois } from '../encounters/effects'
import { inProgress } from '../encounters/run'
import { fillText } from '../encounters/slots'
import { load } from '../economy/capacity'
import { goodName, goodPrice } from '../economy/goods'
import { marketLevels, quote, recordTrade } from '../economy/market'
import { observe } from '../economy/trade'
import { nearestProducer, supplyOf } from '../economy/supply'
import { appendLog } from '../log'
import { grantXp } from '../rules/progression'
import { createRng, withRng, type Draw } from '../rng'
import { poiReach, settlementReach, type Reach } from '../travel/reach'
import { inSettlement } from '../travel/where'
import { changeCamaraderie } from './camaraderie'
import { settlementName } from '../world/geo'
import { domainThreatLevel } from '../world/pois'
import { crisisSites } from '../crisis/sites'
import { siteEmpty } from '../world/sites'
import { personDisplayName } from './people'
import {
  addReputation,
  atLeast,
  goodWord,
  kingdomOf,
  personStanding,
  settlementStanding,
  shopKeeper,
} from './reputation'
import { RUMOUR_LEAD } from './rumours'
import {
  BOARD_SIZE,
  CAMARADERIE_CONTRACT,
  CONTRACT_PAY_PER_DAY,
  CONTRACT_XP_PER_GP,
  CONTRACT_PAY_PER_THREAT,
  DEADLINE_GRACE_DAYS,
  DEADLINE_SLACK,
  DEBT_REP_GP,
  FAIL_REP,
  GOOD_WORD_POINTS,
  MAX_CONTRACTS,
  OVERLOAD_RATIO,
  SOLD_CARGO_REP,
  URGENT_PAY,
  URGENT_SLACK,
} from '../constants'

export { escortPassengers, isEscorting, siteContractsMet } from './contract-hooks'

// Contracts from notice boards (design §8; Plan 4 B4). Nothing ticks: a board's offers are derived
// from the world seed, the settlement and the week, like a site's cycle. State keeps only the
// contracts the party took (and their offer ids, so a board never offers them again).

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

const BUSY = 'Finish the current encounter first.'
/** Kinds sent to a settlement; bounties and errands go to a site and report back. */
const TO_SETTLEMENT: readonly ContractKind[] = ['courier', 'freight', 'procurement', 'escort']
/** Kinds that hand goods over at the destination. */
const CARRIES_GOODS: readonly ContractKind[] = ['courier', 'freight', 'procurement']
/** Kinds whose goods the patron hands over on acceptance: the party carries them as cargo. */
const HANDED_OVER: readonly ContractKind[] = ['courier', 'freight']

/** The week a day falls in (day 1–7 is week 0): boards refresh each week. */
export const boardWeek = (day: number): number => Math.floor((day - 1) / 7)

/** A seeded RNG for a key: the same draws every time it is asked (FNV-1a of the key). */
export function keyedRng(seed: number, key: string) {
  let h = 0x811c9dc5 ^ seed
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return createRng(h >>> 0)
}

/** One offer on a notice board. */
export type Offer = {
  /** "c-<settlement>-w<week>-<slot>", or "-lead" for a rumour's lead. */
  id: string
  template: string
  kind: ContractKind
  title: string
  text: string
  patron: string
  patronName: string
  /** The board's settlement. */
  from: string
  /** Where it is delivered (courier, supply, escort) or reported (bounty, errand: `from`). */
  to: string
  toName: string
  /** A bounty's or errand's site, and its name. */
  poi: string | null
  poiName: string | null
  good: Good | null
  amount: number
  passengers: number
  /**
   * Procurement: the nearest settlement that makes the good (where the party might buy it), and
   * its name; null for other kinds.
   */
  source: string | null
  sourceName: string | null
  /** By the quickest road to the destination or site; for procurement, there and back to the source. */
  km: number
  /** Days there on foot at a steady pace and on a forced march. */
  steadyDays: number
  forcedDays: number
  /** Days from acceptance to the deadline (the last day it can be met). */
  days: number
  /** The deadline if taken today (an absolute day): today + `days`. */
  deadline: number
  pay: number
  /** Only met at a brisk pace or on a forced march. */
  urgent: boolean
  reputation: { patron: number; settlement: number }
  /** The service that posted it (a template's `service`), or null for the plain board. */
  service: string | null
  /** From a rumour's lead (rumours.ts). */
  lead: boolean
  /** The standing it needs, when the party doesn't have it yet; null otherwise. */
  locked: Standing | null
  available: boolean
  /** Why it can't be taken now (English), or null. */
  reason: string | null
}

/** Services here whose role posts a notice board. */
function boardServices(state: GameState, content: Content, here: string): string[] {
  const info = own(state.world.settlements, here)
  return (info?.services ?? []).filter((s) =>
    (own(content.serviceRoles, s)?.actions as string[] | undefined)?.includes('board')
  )
}

/** A destination or site an offer can name, with the road there. */
type Target = { id: string; reach: Reach }

/**
 * Freight: the goods of a template that `here` makes or has close by (supply 1 or more), which the
 * patron hands over. Procurement: those it is short of this week and that some producer within
 * the template's km makes (its nearest producer, for the sourcing).
 */
function freightGoods(
  state: GameState,
  content: Content,
  here: string,
  t: ContractTemplate
): Good[] {
  return (t.goods ?? []).filter((g) => supplyOf(state, content, here, g).level >= 1)
}

type Sourcing = { good: Good; source: string; reach: Reach }

function shortages(
  state: GameState,
  content: Content,
  here: string,
  t: ContractTemplate,
  weekStart: number
): Sourcing[] {
  const levels = marketLevels(state, content, here, weekStart)
  return (t.goods ?? []).flatMap((good) => {
    if (!levels[good].shortage) return []
    const near = nearestProducer(state, content, here, good)
    if (!near || near.id === here || near.km < t.km.min || near.km > t.km.max) return []
    // There and back: the deadline and the pay count the round trip.
    const reach = { km: near.km * 2, days: near.days * 2, forcedDays: near.forcedDays * 2 }
    return [{ good, source: near.id, reach }]
  })
}

/**
 * The settlements or sites a template can send the party to from `here`. A bounty's site must be
 * inhabited on `weekStart`, the board's first day, so the board stays the same all week.
 */
function targets(
  state: GameState,
  content: Content,
  here: string,
  template: ContractTemplate,
  weekStart: number
): Target[] {
  const inRange = (r: Reach) => r.km >= template.km.min && r.km <= template.km.max
  if (TO_SETTLEMENT.includes(template.kind)) {
    return [...settlementReach(content, here)]
      .filter(([id, r]) => id !== here && Object.hasOwn(state.world.settlements, id) && inRange(r))
      .map(([id, reach]) => ({ id, reach }))
      .sort((a, b) => byCodeUnit(a.id, b.id))
  }
  const categories = template.poiCategories ?? []
  // The Crisis's sites are never anyone's errand: they are found their own way (crisis/).
  const crisis = new Set(crisisSites(state.crisis))
  return Object.entries(state.world.pois)
    .filter(([id, poi]) => categories.includes(poi.category) && !crisis.has(id))
    .filter(
      ([id, poi]) => template.kind !== 'bounty' || !siteEmpty(state.world.seed, id, poi, weekStart)
    )
    .flatMap(([id]) => {
      const reach = poiReach(state, content, here, id)
      return reach && inRange(reach) ? [{ id, reach }] : []
    })
    .sort((a, b) => byCodeUnit(a.id, b.id))
}

/** The patron: the keeper of the template's service, else a notable person here (seeded). */
function patronFor(
  state: GameState,
  content: Content,
  here: string,
  template: ContractTemplate,
  d: Draw
): string | null {
  const keeper = template.service ? shopKeeper(state, content, here, template.service) : null
  if (keeper) return keeper
  const people = Object.keys(state.world.people)
    .filter((id) => state.world.people[id].settlement === here)
    .sort(byCodeUnit)
  return people.length > 0 ? d.pick(people) : null
}

/** The better of the settlement's and the patron's standing reaches `min`. */
const standingMet = (state: GameState, here: string, patron: string, min: Standing) =>
  atLeast(settlementStanding(state, here), min) || atLeast(personStanding(state, patron), min)

/**
 * Deadline days from acceptance: the steady days × DEADLINE_SLACK plus DEADLINE_GRACE_DAYS (for
 * the days encounters cost), or for an urgent offer × URGENT_SLACK,
 * kept at least the forced-march days and less than the steady days. An offer is only urgent
 * where a forced march is quicker than a steady pace.
 */
function deadlineDays(d: Draw, reach: Reach, urgentChance: number) {
  const urgent = d.float() < urgentChance && reach.forcedDays < reach.days
  const [lo, hi] = urgent ? URGENT_SLACK : DEADLINE_SLACK
  const slack = lo + d.float() * (hi - lo)
  const days = urgent
    ? Math.min(reach.days - 1, Math.max(reach.forcedDays, Math.round(reach.days * slack)))
    : Math.max(1, Math.ceil(reach.days * slack)) + DEADLINE_GRACE_DAYS
  return { urgent, days }
}

/** Fills a template's title or text for an offer or a contract. */
function fill(
  content: Content,
  text: string,
  v: {
    patronName: string
    toName: string
    poiName: string | null
    good: Good | null
    amount: number
    sourceName?: string | null
  }
): string {
  return fillText(text, {
    patron: v.patronName,
    dest: v.toName,
    site: v.poiName ?? '',
    good: v.good ? goodName(content, v.good).toLowerCase() : '',
    amount: String(v.amount),
    source: v.sourceName ?? '',
  })
}

/** A procurement's source: the nearest settlement that makes its good, from where it is due. */
function sourceOf(
  state: GameState,
  content: Content,
  c: Pick<ContractState, 'kind' | 'to' | 'good'>
) {
  if (c.kind !== 'procurement' || !c.good) return null
  return nearestProducer(state, content, c.to, c.good)?.id ?? null
}

/**
 * One offer from a template, drawn with its slot's seeded RNG; null when nothing fits. `posted`
 * holds the "template/target" pairs already on the board, so no offer is posted twice.
 */
function makeOffer(
  state: GameState,
  content: Content,
  here: string,
  template: ContractTemplate,
  id: string,
  d: Draw,
  lead: boolean,
  posted: ReadonlySet<string>
): Offer | null {
  const weekStart = boardWeek(state.day) * 7 + 1
  const procure = template.kind === 'procurement'
  const sourcing = procure ? shortages(state, content, here, template, weekStart) : []
  const goods = template.kind === 'freight' ? freightGoods(state, content, here, template) : null
  // Freight goes where its goods are scarcer than here.
  const scarcer = (to: string, g: Good) =>
    supplyOf(state, content, to, g).level < supplyOf(state, content, here, g).level
  const options = procure
    ? sourcing.map((x) => ({ id: here, reach: x.reach }))
    : targets(state, content, here, template, weekStart).filter(
        (t) =>
          !posted.has(`${template.id}/${t.id}`) && (!goods || goods.some((g) => scarcer(t.id, g)))
      )
  const patron = patronFor(state, content, here, template, d)
  if (options.length === 0 || !patron || (procure && posted.has(`${template.id}/${here}`))) {
    return null
  }
  const picked = procure ? d.pick(sourcing) : null
  const target = picked ? { id: here, reach: picked.reach } : d.pick(options)
  const site = TO_SETTLEMENT.includes(template.kind) ? null : target.id
  const to = site ? here : target.id
  const good: Good | null = picked
    ? picked.good
    : goods
      ? d.pick(goods.filter((g) => scarcer(to, g)))
      : template.goods
        ? d.pick(template.goods)
        : null
  const amount = template.amount ? d.int(template.amount.min, template.amount.max) : 0
  const passengers =
    template.kind === 'escort'
      ? template.passengers
        ? d.int(template.passengers.min, template.passengers.max)
        : 1
      : 0
  const { urgent, days } = deadlineDays(d, target.reach, template.urgentChance)
  const domain = site ? state.world.pois[site].domain : to
  const threat = domainThreatLevel(state.world, domain, weekStart)
  // Whole gold, rounded up (designer decision). A procurement's patron pays the goods' base value
  // on top of the fee for the sourcing (the round trip to the nearest producer); no advance.
  const pay = Math.max(
    1,
    Math.ceil(
      CONTRACT_PAY_PER_DAY *
        target.reach.days *
        template.pay *
        (urgent ? URGENT_PAY : 1) *
        (1 + CONTRACT_PAY_PER_THREAT * threat) +
        (procure && good ? amount * goodPrice(content, good) : 0)
    )
  )
  const source = picked?.source ?? null
  const sourceName = source ? settlementName(state, source) : null
  const patronName = personDisplayName(state.world, content, patron)
  const toName = settlementName(state, to)
  const poiName = site ? state.world.pois[site].name : null
  const values = { patronName, toName: site ? poiName! : toName, poiName, good, amount, sourceName }
  const locked =
    template.minStanding && !standingMet(state, here, patron, template.minStanding)
      ? template.minStanding
      : null
  return {
    id,
    template: template.id,
    kind: template.kind,
    title: fill(content, template.title, values),
    text: fill(content, template.text, values),
    patron,
    patronName,
    from: here,
    to,
    toName,
    poi: site,
    poiName,
    good,
    amount,
    passengers,
    source,
    sourceName,
    km: target.reach.km,
    steadyDays: target.reach.days,
    forcedDays: target.reach.forcedDays,
    days,
    deadline: state.day + days,
    pay,
    urgent,
    reputation: { ...template.reputation },
    service: template.service ?? null,
    lead,
    locked,
    available: true,
    reason: null,
  }
}

/** Why an offer can't be taken now (English), or null. */
function offerRefusal(state: GameState, content: Content, offer: Offer): string | null {
  if (offer.locked) return `needs standing ${offer.locked} in ${settlementName(state, offer.from)}`
  if (offer.kind === 'bounty' && offer.poi && bountyEmptied(state, offer.poi)) {
    return 'someone has cleared the site already'
  }
  if (state.contracts.length >= MAX_CONTRACTS) return `at most ${MAX_CONTRACTS} contracts at once`
  if (HANDED_OVER.includes(offer.kind) && offer.good) {
    const goods = { ...state.goods, [offer.good]: (state.goods[offer.good] ?? 0) + offer.amount }
    const laden = load(state, content, { goods })
    if (laden.weight > laden.capacity * OVERLOAD_RATIO + 1e-9) {
      return `no room to carry ${offer.amount} ${goodName(content, offer.good).toLowerCase()}`
    }
  }
  return null
}

/**
 * The offers on a settlement's notice board this week (derived from the world seed, the
 * settlement and the week): BOARD_SIZE[size] slots from the templates posted here (a template
 * with a `service` only where that service is; the rest where a board is), plus a rumour's lead
 * when the party has one here. Offers already taken are left out. Templates the party lacks the
 * standing for show as locked.
 */
export function noticeBoard(state: GameState, content: Content, settlementId: string): Offer[] {
  const info = own(state.world.settlements, settlementId)
  if (!info) return []
  const boards = boardServices(state, content, settlementId)
  const templates = sortedEntries(content.contracts).filter(
    (t) =>
      t.weight > 0 &&
      info.sizeTier >= t.minSize &&
      (t.service ? info.services.includes(t.service) : boards.length > 0)
  )
  if (templates.length === 0) return []
  const week = boardWeek(state.day)
  const seed = state.world.seed
  const posted = new Set<string>()
  const draw = (key: string, id: string, lead: boolean): Offer | null => {
    const [offer] = withRng(keyedRng(seed, key), (d) => {
      // A template that fits nowhere is set aside, and another drawn.
      let pool = templates
      while (pool.length > 0) {
        const template = d.weighted(pool, (t) => t.weight)
        const made = makeOffer(state, content, settlementId, template, id, d, lead, posted)
        if (made) {
          posted.add(`${made.template}/${made.poi ?? made.to}`)
          return made
        }
        pool = pool.filter((t) => t !== template)
      }
      return null
    })
    return offer
  }
  const prefix = `c-${settlementId}-w${week}`
  const offers: Offer[] = []
  const size = BOARD_SIZE[Math.min(info.sizeTier, BOARD_SIZE.length - 1)]
  for (let slot = 0; slot < size; slot++) {
    const offer = draw(`board/${settlementId}/${week}/${slot}`, `${prefix}-${slot}`, false)
    if (offer) offers.push(offer)
  }
  if (state.location === settlementId && state.doneHere.includes(RUMOUR_LEAD)) {
    const lead = draw(`lead/${settlementId}/${week}`, `${prefix}-lead`, true)
    if (lead) offers.push(lead)
  }
  return offers
    .filter((o) => !state.contractsTaken.includes(o.id))
    .map((o) => {
      const reason = offerRefusal(state, content, o)
      return { ...o, available: reason === null, reason }
    })
}

export type ContractAction =
  | { type: 'acceptContract'; offerId: string }
  | { type: 'abandonContract'; id: string }
  | { type: 'completeContract'; id: string; reward: ContractReward }
  /**
   * Sell a courier's or freight contract's cargo here: it breaks the contract (sellCargo). The UI
   * asks for a confirmation first (sellCargoPreview says what it costs).
   */
  | { type: 'sellCargo'; contractId: string; shop?: string }

/** Gold (and standing with the patron and their town), or a good word across their kingdom. */
export type ContractReward = 'gold' | 'goodWord'

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`)

/**
 * Takes an offer from the board here: at most MAX_CONTRACTS at once. A courier's goods are handed
 * over now (the party must have room), and a bounty's or errand's site is revealed.
 */
export function acceptContract(state: GameState, content: Content, offerId: string): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const here = state.location
  if (!inSettlement(state) || here === null) {
    return appendLog(state, 'Contracts are taken at a notice board in a settlement.', 'bad')
  }
  const offer = noticeBoard(state, content, here).find((o) => o.id === offerId)
  if (!offer) return appendLog(state, 'That offer is not on the board here.', 'bad')
  if (offer.reason) return appendLog(state, `You can't take that work: ${offer.reason}.`, 'bad')
  const contract: ContractState = {
    id: offer.id,
    template: offer.template,
    kind: offer.kind,
    patron: offer.patron,
    from: offer.from,
    to: offer.to,
    good: offer.good,
    amount: offer.amount,
    poi: offer.poi,
    passengers: offer.passengers,
    accepted: state.day,
    deadline: offer.deadline,
    pay: offer.pay,
    urgent: offer.urgent,
    reputation: offer.reputation,
    met: false,
  }
  let next: GameState = {
    ...state,
    contracts: [...state.contracts, contract],
    contractsTaken: [...state.contractsTaken, offer.id],
  }
  if (HANDED_OVER.includes(offer.kind) && offer.good) {
    next = {
      ...next,
      goods: { ...next.goods, [offer.good]: (next.goods[offer.good] ?? 0) + offer.amount },
    }
  }
  const where = offer.poiName ?? offer.toName
  next = appendLog(
    next,
    `You take on "${offer.title}" for ${offer.patronName}: ${where} within ` +
      `${days(offer.days)} (by day ${contract.deadline}), for ${offer.pay} gp.` +
      (offer.urgent ? ' It is urgent.' : '') +
      (HANDED_OVER.includes(offer.kind) && offer.good
        ? ` You are handed ${offer.amount} ${goodName(content, offer.good).toLowerCase()}.`
        : ''),
    'info'
  )
  return offer.poi && !state.world.pois[offer.poi].discovered
    ? revealPois(next, content, [offer.poi])
    : next
}

/** A contract's title, filled in as it was offered. */
export function contractTitle(state: GameState, content: Content, c: ContractState): string {
  const template = own(content.contracts, c.template)
  if (!template) return c.template
  const poiName = c.poi ? (own(state.world.pois, c.poi)?.name ?? c.poi) : null
  const source = sourceOf(state, content, c)
  return fill(content, template.title, {
    patronName: personDisplayName(state.world, content, c.patron),
    toName: poiName ?? settlementName(state, c.to),
    poiName,
    good: c.good,
    amount: c.amount,
    sourceName: source ? settlementName(state, source) : null,
  })
}

/**
 * A contract fails (its deadline passed, or the party gave it up): FAIL_REP standing lost with the
 * patron and their settlement. A courier's cargo goes back; what is missing is paid for at its
 * base price, as far as the gold goes, and each DEBT_REP_GP left unpaid costs a point more. When
 * the party sold the cargo (sellCargo), all of it is missing and the loss is SOLD_CARGO_REP.
 */
function failContract(
  state: GameState,
  content: Content,
  c: ContractState,
  why: 'expired' | 'abandoned' | 'sold'
): GameState {
  let next: GameState = { ...state, contracts: state.contracts.filter((x) => x.id !== c.id) }
  let debt = 0
  let cargo = ''
  if (HANDED_OVER.includes(c.kind) && c.good) {
    const carried = why === 'sold' ? 0 : Math.min(next.goods[c.good] ?? 0, c.amount)
    const owed = Math.ceil((c.amount - carried) * goodPrice(content, c.good))
    const paid = Math.min(Math.max(0, next.gold), owed)
    debt = owed - paid
    next = {
      ...next,
      gold: next.gold - paid,
      goods: { ...next.goods, [c.good]: (next.goods[c.good] ?? 0) - carried },
    }
    const name = goodName(content, c.good).toLowerCase()
    cargo =
      ` The ${name} ${carried > 0 ? 'goes back to the patron' : 'is gone'}` +
      (owed > 0 ? `, and you pay ${paid} gp for what is missing` : '') +
      (debt > 0 ? `, ${debt} gp short` : '') +
      '.'
  }
  const title = contractTitle(state, content, c)
  const opening = {
    expired: `Time has run out on "${title}".`,
    abandoned: `You give up "${title}".`,
    sold: `"${title}" is broken: the cargo was not yours to sell.`,
  }[why]
  next = appendLog(next, opening + cargo, 'bad')
  const amount = -((why === 'sold' ? SOLD_CARGO_REP : FAIL_REP) + Math.ceil(debt / DEBT_REP_GP))
  next = addReputation(next, { person: c.patron, amount, reason: 'a broken contract' }, content)
  return addReputation(next, { settlement: c.from, amount, reason: 'a broken contract' }, content)
}

/** One courier's or freight contract's cargo: the goods it reserves, and how many are carried. */
export type CargoLot = {
  contractId: string
  title: string
  patronName: string
  good: Good
  /** Units handed over (reserved). */
  amount: number
  /** Of those, the units still carried (the carried units go to the contracts in order taken). */
  carried: number
}

/** The cargo the party carries for contracts: reserved units per good, and each contract's lot. */
export type CargoInfo = {
  reserved: Partial<Record<Good, number>>
  lots: CargoLot[]
}

/**
 * The goods reserved as contract cargo (courier and freight), per good and per contract. Reserved
 * units are left out of sellGoods and maxSell; sellCargo sells a lot and breaks its contract.
 */
export function cargoInfo(state: GameState, content: Content): CargoInfo {
  const left: Partial<Record<Good, number>> = { ...state.goods }
  const reserved: Partial<Record<Good, number>> = {}
  const lots: CargoLot[] = []
  for (const c of state.contracts) {
    if (!HANDED_OVER.includes(c.kind) || !c.good) continue
    const carried = Math.min(c.amount, left[c.good] ?? 0)
    left[c.good] = (left[c.good] ?? 0) - carried
    reserved[c.good] = (reserved[c.good] ?? 0) + c.amount
    lots.push({
      contractId: c.id,
      title: contractTitle(state, content, c),
      patronName: personDisplayName(state.world, content, c.patron),
      good: c.good,
      amount: c.amount,
      carried,
    })
  }
  return { reserved, lots }
}

/** What selling a contract's cargo here would bring and cost (shown before the confirmation). */
export type CargoSale = {
  contractId: string
  good: Good
  /** Units sold: the lot's carried units. */
  units: number
  /** What the market here pays for them. */
  gold: number
  /** The patron's goods paid for at base price (all of the lot), as far as the gold goes. */
  owed: number
  /** Standing lost with the patron and with the board's settlement. */
  standing: number
  patronName: string
  fromName: string
  /** English, for the confirmation. */
  text: string
}

/** Why a contract's cargo can't be sold here now (English), or null. */
function cargoSaleRefusal(
  state: GameState,
  content: Content,
  c: ContractState | undefined,
  shop?: string
): string | null {
  if (inProgress(state)) return BUSY
  if (!c) return 'You hold no such contract.'
  if (!HANDED_OVER.includes(c.kind) || !c.good) return 'That contract carries no cargo.'
  if (!inSettlement(state) || state.location === null) return 'Cargo is sold in a settlement.'
  const lot = cargoInfo(state, content).lots.find((l) => l.contractId === c.id)
  if (!lot || lot.carried === 0) return 'None of that cargo is left to sell.'
  if (!quote(state, content, state.location, c.good, 'sell', lot.carried, shop)) {
    return `No one here buys ${goodName(content, c.good).toLowerCase()}.`
  }
  return null
}

/**
 * What selling a contract's cargo here would bring and cost, or null when it can't be sold here
 * now: the market's price for the carried units, the base value owed for all of the cargo (paid
 * as far as the gold, the market's pay included, goes), and the standing lost.
 */
export function sellCargoPreview(
  state: GameState,
  content: Content,
  contractId: string,
  shop?: string
): CargoSale | null {
  const c = state.contracts.find((x) => x.id === contractId)
  if (cargoSaleRefusal(state, content, c, shop)) return null
  const good = c!.good!
  const lot = cargoInfo(state, content).lots.find((l) => l.contractId === contractId)!
  const q = quote(state, content, state.location!, good, 'sell', lot.carried, shop)!
  const owed = Math.ceil(c!.amount * goodPrice(content, good))
  const debt = Math.max(0, owed - Math.max(0, state.gold + q.total))
  const standing = SOLD_CARGO_REP + Math.ceil(debt / DEBT_REP_GP)
  const name = goodName(content, good).toLowerCase()
  const fromName = settlementName(state, c!.from)
  return {
    contractId,
    good,
    units: lot.carried,
    gold: q.total,
    owed,
    standing,
    patronName: lot.patronName,
    fromName,
    text:
      `Selling the ${lot.carried} ${name} breaks "${lot.title}": the market pays ${q.total} gp, ` +
      `${lot.patronName} is owed ${owed} gp for the goods, and you lose ${standing} standing ` +
      `with ${lot.patronName} and with ${fromName}.`,
  }
}

/**
 * Sells a courier's or freight contract's cargo at the best shop here (or `shop`), deliberately:
 * the contract fails at once (failContract, 'sold'): the patron is owed the cargo's base value,
 * paid as far as the gold goes, and the party loses SOLD_CARGO_REP standing (and a point per
 * DEBT_REP_GP unpaid) with the patron and the board's settlement. No trade standing is earned.
 */
export function sellCargo(
  state: GameState,
  content: Content,
  contractId: string,
  shop?: string
): GameState {
  const c = state.contracts.find((x) => x.id === contractId)
  const refused = cargoSaleRefusal(state, content, c, shop)
  if (refused) return appendLog(state, refused, 'bad')
  const sale = sellCargoPreview(state, content, contractId, shop)!
  const here = state.location!
  const sold: GameState = appendLog(
    {
      ...state,
      gold: state.gold + sale.gold,
      goods: { ...state.goods, [sale.good]: (state.goods[sale.good] ?? 0) - sale.units },
      markets: recordTrade(state.markets, here, sale.good, sale.units, state.day),
    },
    `You sell ${sale.patronName}'s ${sale.units} ${goodName(content, sale.good).toLowerCase()} ` +
      `for ${sale.gold} gp.`,
    'bad'
  )
  return failContract(observe(sold, content, here), content, c!, 'sold')
}

/** Gives up a contract: it fails as if its deadline had passed. */
export function abandonContract(state: GameState, content: Content, id: string): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const c = state.contracts.find((x) => x.id === id)
  if (!c) return appendLog(state, 'You hold no such contract.', 'bad')
  return failContract(state, content, c, 'abandoned')
}

/** A bounty's site lies empty today: the realm (or an accident) cleared it, or the party did. */
const bountyEmptied = (state: GameState, poi: string): boolean =>
  Object.hasOwn(state.world.pois, poi) &&
  siteEmpty(state.world.seed, poi, state.world.pois[poi], state.day)

/**
 * A bounty whose site the site cycle emptied before the party cleared it (and before its
 * deadline) is void: it is dropped with a line in the journal, at no cost in standing. Called
 * after every action (state.ts step).
 */
export function voidBounties(state: GameState, content: Content): GameState {
  const voided = state.contracts.filter(
    (c) =>
      c.kind === 'bounty' &&
      !c.met &&
      c.poi !== null &&
      state.day <= c.deadline &&
      bountyEmptied(state, c.poi)
  )
  return voided.reduce((next, c) => {
    const site = own(next.world.pois, c.poi)?.name ?? c.poi
    return appendLog(
      { ...next, contracts: next.contracts.filter((x) => x.id !== c.id) },
      `Someone else has cleared ${site}: "${contractTitle(next, content, c)}" is void, ` +
        `and ${personDisplayName(next.world, content, c.patron)} holds nothing against you.`,
      'info'
    )
  }, state)
}

/** Contracts not met by their deadline fail. Called after every action (state.ts step). */
export function expireContracts(state: GameState, content: Content): GameState {
  return state.contracts
    .filter((c) => !c.met && state.day > c.deadline)
    .reduce((next, c) => failContract(next, content, c, 'expired'), state)
}

/**
 * Why a contract can't be completed here and now (English), or null. Courier, supply and escort
 * contracts complete at their destination by the deadline (or once met there); bounties and errands
 * once met, back at the board's settlement. Goods to hand over must be carried.
 */
export function completeRefusal(
  state: GameState,
  content: Content,
  c: ContractState
): string | null {
  if (inProgress(state)) return BUSY
  if (!inSettlement(state) || state.location !== c.to) {
    return `report to ${settlementName(state, c.to)}`
  }
  if (!c.met) {
    if (!TO_SETTLEMENT.includes(c.kind)) {
      return c.kind === 'bounty' ? 'the site is not cleared yet' : 'the site is not visited yet'
    }
    if (state.day > c.deadline) return 'too late'
    // Procured goods must be brought in from elsewhere: they count when the party arrives.
    if (c.kind === 'procurement') {
      return `bring ${c.amount} ${goodName(content, c.good!).toLowerCase()} in from elsewhere`
    }
  }
  if (CARRIES_GOODS.includes(c.kind) && c.good && (state.goods[c.good] ?? 0) < c.amount) {
    return `needs ${c.amount} ${goodName(content, c.good).toLowerCase()}`
  }
  return null
}

/**
 * Completes a contract here: goods are handed over, and the reward is either the pay (plus
 * standing with the patron and their settlement) or a good word (GOOD_WORD_POINTS with every
 * settlement of the patron's kingdom, plus the patron's standing) instead of the gold.
 */
export function completeContract(
  state: GameState,
  content: Content,
  id: string,
  reward: ContractReward
): GameState {
  const c = state.contracts.find((x) => x.id === id)
  if (!c) return appendLog(state, 'You hold no such contract.', 'bad')
  const refused = completeRefusal(state, content, c)
  if (refused) return appendLog(state, `Not yet: ${refused}.`, 'bad')
  let next: GameState = { ...state, contracts: state.contracts.filter((x) => x.id !== c.id) }
  if (CARRIES_GOODS.includes(c.kind) && c.good) {
    next = { ...next, goods: { ...next.goods, [c.good]: (next.goods[c.good] ?? 0) - c.amount } }
  }
  const title = contractTitle(state, content, c)
  const patron = personDisplayName(state.world, content, c.patron)
  const reason = 'a contract kept'
  // XP by the pay, whichever reward is taken.
  const xp = Math.round(c.pay * CONTRACT_XP_PER_GP)
  if (reward === 'gold') {
    next = appendLog(
      { ...next, gold: next.gold + c.pay },
      `"${title}" is done. ${patron} pays ${c.pay} gp.`,
      'good'
    )
    next = grantXp(next, xp, `"${title}"`)
    next = addReputation(next, { person: c.patron, amount: c.reputation.patron, reason }, content)
    return addReputation(
      next,
      { settlement: c.from, amount: c.reputation.settlement, reason },
      content
    )
  }
  next = appendLog(next, `"${title}" is done. ${patron} puts in a good word for you.`, 'good')
  next = grantXp(next, xp, `"${title}"`)
  next = addReputation(next, { person: c.patron, amount: c.reputation.patron, reason }, content)
  const kingdom = kingdomOf(state, c.from)
  return kingdom
    ? goodWord(next, kingdom.id, GOOD_WORD_POINTS)
    : addReputation(next, { settlement: c.from, amount: GOOD_WORD_POINTS, reason }, content)
}

/**
 * Arriving at a settlement: courier, supply and escort contracts bound here are met when the
 * party arrives by the deadline (with the goods, where there are goods to hand over). Then every
 * contract that can be completed here gets a line saying so. Called on arrival (travel/journey.ts).
 */
export function contractsOnArrival(state: GameState, content: Content): GameState {
  const here = state.location
  if (here === null || !inSettlement(state)) return state
  const contracts = state.contracts.map((c) => {
    if (c.met || c.to !== here || !TO_SETTLEMENT.includes(c.kind) || state.day > c.deadline) {
      return c
    }
    const carried =
      !c.good || !CARRIES_GOODS.includes(c.kind) || (state.goods[c.good] ?? 0) >= c.amount
    return carried ? { ...c, met: true } : c
  })
  let next: GameState = { ...state, contracts }
  for (const c of contracts) {
    if (c.to !== here || completeRefusal(next, content, c)) continue
    next = appendLog(
      next,
      `"${contractTitle(next, content, c)}" can be completed here: take the pay, or a good word.`,
      'good'
    )
  }
  return next
}

/** A contract with this destination, as a journey there would meet it (PaceOption.deadlines). */
export type ContractDeadline = {
  contractId: string
  arrivesDay: number
  deadline: number
  inTime: boolean
}

/**
 * For each active, unmet contract whose destination (or site) is `to`: the day a journey of
 * `journeyDays` from today arrives, the deadline, and whether that is in time.
 */
export function contractDeadlines(
  state: Pick<GameState, 'day' | 'contracts'>,
  to: string,
  journeyDays: number
): ContractDeadline[] {
  const arrivesDay = state.day + journeyDays
  return state.contracts
    .filter((c) => !c.met && (c.poi ?? c.to) === to)
    .map((c) => ({
      contractId: c.id,
      arrivesDay,
      deadline: c.deadline,
      inTime: arrivesDay <= c.deadline,
    }))
}

/** One contract the party holds, for the contracts panel. */
export type ContractRow = ContractState & {
  title: string
  text: string
  patronName: string
  fromName: string
  toName: string
  poiName: string | null
  /** Procurement: the nearest settlement that makes the good; null for other kinds. */
  sourceName: string | null
  /** Days left until the deadline (0 on the last day); null once met. */
  daysLeft: number | null
  canComplete: boolean
  /** Why it can't be completed here and now (English), or null. */
  reason: string | null
  /** What each reward would give. */
  rewards: {
    gold: { gold: number; patron: number; settlement: number }
    goodWord: { kingdom: string | null; settlements: number; points: number; patron: number }
  }
}

/** The contracts the party holds, in the order taken. */
export function contractRows(state: GameState, content: Content): ContractRow[] {
  return state.contracts.map((c) => {
    const template = own(content.contracts, c.template)
    const poiName = c.poi ? (own(state.world.pois, c.poi)?.name ?? c.poi) : null
    const patronName = personDisplayName(state.world, content, c.patron)
    const toName = settlementName(state, c.to)
    const source = sourceOf(state, content, c)
    const sourceName = source ? settlementName(state, source) : null
    const values = {
      patronName,
      toName: poiName ?? toName,
      poiName,
      good: c.good,
      amount: c.amount,
      sourceName,
    }
    const reason = completeRefusal(state, content, c)
    const kingdom = kingdomOf(state, c.from)
    return {
      ...c,
      title: template ? fill(content, template.title, values) : c.template,
      text: template ? fill(content, template.text, values) : '',
      patronName,
      fromName: settlementName(state, c.from),
      toName,
      poiName,
      sourceName,
      daysLeft: c.met ? null : c.deadline - state.day,
      canComplete: reason === null,
      reason,
      rewards: {
        gold: { gold: c.pay, patron: c.reputation.patron, settlement: c.reputation.settlement },
        goodWord: {
          kingdom: kingdom?.name ?? null,
          settlements: kingdom?.domains.length ?? 1,
          points: GOOD_WORD_POINTS,
          patron: c.reputation.patron,
        },
      },
    }
  })
}

export function stepContract(
  state: GameState,
  action: ContractAction,
  content: Content
): GameState {
  switch (action.type) {
    case 'acceptContract':
      return acceptContract(state, content, action.offerId)
    case 'abandonContract':
      return abandonContract(state, content, action.id)
    case 'completeContract': {
      const done = completeContract(state, content, action.id, action.reward)
      // A contract kept raises camaraderie (town/camaraderie.ts).
      return done.contracts.length < state.contracts.length
        ? changeCamaraderie(done, CAMARADERIE_CONTRACT, 'a contract kept')
        : done
    }
    case 'sellCargo':
      return sellCargo(state, content, action.contractId, action.shop)
  }
}
