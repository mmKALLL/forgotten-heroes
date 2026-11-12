import { describe, expect, test } from 'vitest'
import { EffectSchema } from '../../schema/encounter'
import type { ContractKind } from '../../schema/types'
import type { ContractState, GameState } from '../../schema/state'
import { applyEffects } from '../encounters/effects'
import { step, type Action } from '../state'
import { fixtureContent, makeEncounter, makeState } from '../test-fixtures'
import { passDay } from '../travel/days'
import { routeOptions } from '../travel/preview'
import { FAIL_REP, GOOD_WORD_POINTS, MAX_CONTRACTS, SOLD_CARGO_REP } from '../constants'
import { maxSell } from '../economy/trade'
import { kingdomOf } from './reputation'
import { marketLevels } from '../economy/market'
import { supplyOf } from '../economy/supply'
import { cycles, siteEmpty } from '../world/sites'
import { cargoInfo, contractRows, noticeBoard, sellCargoPreview, type Offer } from './contracts'

const content = fixtureContent()
const HERE = 'greenvale-1'
const ROAD = 'greenvale-1-greenvale-2'

/** At a settlement with an inn (and its board) everywhere, gold and supplies. */
function at(location: string, overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location, day: 1, gold: 100, goods: { food: 20, water: 8 } })
  const settlements = { ...s.world.settlements }
  for (const id of Object.keys(settlements)) {
    const services = [...new Set([...settlements[id].services, 'inn-tavern'])]
    settlements[id] = { ...settlements[id], services }
  }
  return { ...s, world: { ...s.world, settlements }, ...overrides }
}
const act = (s: GameState, a: Action) => step(s, a, content)
const patron = (s: GameState) =>
  Object.keys(s.world.people).find((id) => s.world.people[id].settlement === HERE)!

function contract(s: GameState, overrides: Partial<ContractState> = {}): ContractState {
  return {
    id: 'c-test',
    template: 'see-pilgrim',
    kind: 'escort',
    patron: patron(s),
    from: HERE,
    to: 'greenvale-2',
    good: null,
    amount: 0,
    poi: null,
    passengers: 1,
    accepted: s.day,
    deadline: s.day + 5,
    pay: 30,
    urgent: false,
    reputation: { patron: 5, settlement: 3 },
    met: false,
    ...overrides,
  }
}

/** Sets out along a road and walks it (with no encounters drawn) until the journey ends. */
function journey(s: GameState, routeId: string, pace: 'steady' | 'forced'): GameState {
  let next = act(s, { type: 'travel', routeId, pace, forage: false })
  next = { ...next, travel: { ...next.travel!, encounterDays: [] } }
  for (let i = 0; i < 10 && next.travel; i++) next = act(next, { type: 'continueJourney' })
  return next
}

/** The first week whose board here has an offer of this kind. */
function boardWith(
  kind: ContractKind,
  base = at(HERE),
  using = content
): { state: GameState; offer: Offer } {
  for (let week = 0; week < 60; week++) {
    const state = { ...base, day: week * 7 + 1 }
    const offer = noticeBoard(state, using, HERE).find((o) => o.kind === kind)
    if (offer) return { state, offer }
  }
  throw new Error(`no ${kind} offer`)
}

const signature = (offers: Offer[]) => JSON.stringify(offers.map(({ id: _, ...o }) => o))

/**
 * The fixture with a building boom in the capitals (timber and stone wanted) and no workshops:
 * Greenvale is short of timber, which Far Isle's woods make across the sea.
 */
const boom = (() => {
  const { workshops: _, ...producers } = content.producers
  const rule = {
    ...content.marketRules.coast,
    id: 'boom',
    label: 'Boom',
    when: { types: ['capital'] },
    demand: { timber: 2, stone: 2 },
  }
  return { ...content, producers, marketRules: { ...content.marketRules, boom: rule } }
})()

describe('noticeBoard', () => {
  test('is the same all week and changes from week to week', () => {
    const s = at(HERE)
    const week = noticeBoard({ ...s, day: 8 }, content, HERE)
    expect(week.length).toBeGreaterThan(0)
    // The same offers; only the deadline if taken today moves with the day.
    expect(noticeBoard({ ...s, day: 14 }, content, HERE)).toEqual(
      week.map((o) => ({ ...o, deadline: o.deadline + 6 }))
    )
    const weeks = new Set(
      Array.from({ length: 8 }, (_, w) =>
        signature(noticeBoard({ ...s, day: w * 7 + 1 }, content, HERE))
      )
    )
    expect(weeks.size).toBeGreaterThan(1)
  })

  test('offers fit their templates: real roads, deadlines, and urgency only where forcing helps', () => {
    const s = at(HERE)
    for (let w = 0; w < 30; w++) {
      for (const o of noticeBoard({ ...s, day: w * 7 + 1 }, content, HERE)) {
        const t = content.contracts[o.template]
        // A procurement's km is there and back to its source; the template bounds the way there.
        const km = o.kind === 'procurement' ? o.km / 2 : o.km
        expect(km).toBeGreaterThanOrEqual(t.km.min)
        expect(km).toBeLessThanOrEqual(t.km.max)
        if (o.urgent) {
          expect(o.days).toBeLessThan(o.steadyDays)
          expect(o.days).toBeGreaterThanOrEqual(o.forcedDays)
        } else expect(o.days).toBeGreaterThanOrEqual(o.steadyDays)
        expect(o.locked === null).toBe(!t.minStanding)
        expect(o.deadline).toBe(w * 7 + 1 + o.days)
      }
    }
  })

  test('a taken offer is not offered again; a courier’s goods are handed over', () => {
    const { state, offer } = boardWith('courier')
    const taken = act(state, { type: 'acceptContract', offerId: offer.id })
    expect(taken.contracts).toHaveLength(1)
    expect(taken.contracts[0]).toMatchObject({ deadline: state.day + offer.days, pay: offer.pay })
    expect(taken.goods[offer.good!]).toBe((state.goods[offer.good!] ?? 0) + offer.amount)
    expect(noticeBoard(taken, content, HERE).map((o) => o.id)).not.toContain(offer.id)
  })

  test('procurement is posted only for a shortage here, sourced at the nearest producer', () => {
    const s = at(HERE)
    const offers = (c: typeof content) =>
      Array.from({ length: 30 }, (_, w) =>
        noticeBoard({ ...s, day: w * 7 + 1 }, c, HERE).filter((o) => o.kind === 'procurement')
      ).flat()
    // The plain fixture has no shortage in Greenvale: no procurement there.
    expect(offers(content)).toEqual([])
    const found = offers(boom)
    expect(found.length).toBeGreaterThan(0)
    for (const o of found) {
      const week = Number(/-w(\d+)-/.exec(o.id)![1])
      expect(marketLevels(s, boom, HERE, week * 7 + 1).timber.shortage).toBe(true)
      expect(o).toMatchObject({ good: 'timber', to: HERE, source: 'farisle-1' })
      // There and back to Far Isle (265 km, 9 steady days each way).
      expect(o.km).toBe(530)
      expect(o.steadyDays).toBe(18)
      expect(o.days).toBeGreaterThanOrEqual(o.steadyDays)
      // The goods at their base price, plus the sourcing.
      expect(o.pay).toBeGreaterThan(o.amount * boom.goods.timber.price)
    }
    // What the board shows is what the contract holds.
    const { state, offer } = boardWith('procurement', s, boom)
    const taken = step(state, { type: 'acceptContract', offerId: offer.id }, boom)
    expect(taken.contracts[0]).toMatchObject({
      kind: 'procurement',
      deadline: state.day + offer.days,
      pay: offer.pay,
      good: 'timber',
      amount: offer.amount,
    })
    expect(taken.goods).toEqual(state.goods)
    expect(contractRows(taken, boom)[0].sourceName).toBe(offer.sourceName)
  })

  test('freight carries goods made here to where they are scarcer', () => {
    const s = at(HERE)
    for (let w = 0; w < 30; w++) {
      for (const o of noticeBoard({ ...s, day: w * 7 + 1 }, content, HERE)) {
        if (o.kind !== 'freight') continue
        expect(supplyOf(s, content, HERE, o.good!).level).toBeGreaterThanOrEqual(1)
        expect(supplyOf(s, content, o.to, o.good!).level).toBeLessThan(
          supplyOf(s, content, HERE, o.good!).level
        )
      }
    }
  })

  test('a courier with no room is refused', () => {
    const heavy = at(HERE, { goods: { food: 20, water: 8, stone: 1 } })
    const { state, offer } = boardWith('courier', heavy)
    expect(offer.available).toBe(false)
    expect(offer.reason).toContain('no room')
    expect(act(state, { type: 'acceptContract', offerId: offer.id }).contracts).toEqual([])
  })

  test(`at most ${MAX_CONTRACTS} contracts at once`, () => {
    const base = at(HERE)
    const held = Array.from({ length: MAX_CONTRACTS }, (_, i) =>
      contract(base, { id: `c-held-${i}` })
    )
    const { state, offer } = boardWith('courier', { ...base, contracts: held })
    expect(offer.available).toBe(false)
    expect(act(state, { type: 'acceptContract', offerId: offer.id }).contracts).toEqual(held)
  })
})

describe('deadlines', () => {
  const urgent = (s: GameState) => ({
    ...s,
    contracts: [contract(s, { deadline: s.day + 2, urgent: true })],
  })

  test('an urgent deadline is missed at a steady pace but met on a forced march', () => {
    const s = urgent(at(HERE))
    const paces = routeOptions(s, content).find((r) => r.routeId === ROAD)!.paces
    const steady = paces.find((p) => p.pace === 'steady')!
    const forced = paces.find((p) => p.pace === 'forced')!
    expect(steady.deadlines).toEqual([
      { contractId: 'c-test', arrivesDay: s.day + steady.days, deadline: s.day + 2, inTime: false },
    ])
    expect(forced.deadlines[0].inTime).toBe(true)

    const slow = journey(s, ROAD, 'steady')
    expect(slow.day).toBe(steady.deadlines[0].arrivesDay)
    expect(slow.contracts).toEqual([])
    expect(slow.reputation.people[patron(s)]).toBe(-FAIL_REP)

    const fast = journey(s, ROAD, 'forced')
    expect(fast.day).toBe(forced.deadlines[0].arrivesDay)
    expect(fast.contracts[0].met).toBe(true)
    const paid = act(fast, { type: 'completeContract', id: 'c-test', reward: 'gold' })
    expect(paid.gold).toBe(fast.gold + 30)
    expect(paid.contracts).toEqual([])
  })

  test('an unmet contract fails once its deadline passes', () => {
    const s = at(HERE, { contracts: [contract(at(HERE), { deadline: 1 })] })
    const after = act(s, { type: 'rest', lodging: false })
    expect(after.contracts).toEqual([])
    expect(after.reputation.settlements[HERE]).toBe(-FAIL_REP)
    expect(after.log.some((e) => e.text.includes('Time has run out'))).toBe(true)
  })
})

describe('completing each kind', () => {
  test('a courier arrives with its goods and hands them over', () => {
    const s = at(HERE, {
      goods: { food: 20, water: 8, luxuries: 2 },
      contracts: [
        contract(at(HERE), {
          kind: 'courier',
          template: 'carry-cloth',
          good: 'luxuries',
          amount: 2,
          passengers: 0,
        }),
      ],
    })
    const there = journey(s, ROAD, 'steady')
    expect(there.contracts[0].met).toBe(true)
    expect(contractRows(there, content)[0].canComplete).toBe(true)
    const done = act(there, { type: 'completeContract', id: 'c-test', reward: 'gold' })
    expect(done.goods.luxuries).toBe(0)
    expect(done.gold).toBe(there.gold + 30)
  })

  test('a procurement completes only when the party brings the goods in', () => {
    const c = contract(at(HERE), {
      kind: 'procurement',
      template: 'bring-timber',
      to: HERE,
      good: 'timber',
      amount: 1,
      passengers: 0,
    })
    // Carrying the goods at the board isn't enough: they must be brought in from elsewhere.
    const s = at(HERE, { contracts: [c], goods: { food: 6, water: 4, timber: 1 } })
    expect(contractRows(s, content)[0].reason).toMatch(/bring 1 timber in from elsewhere/)
    expect(act(s, { type: 'completeContract', id: 'c-test', reward: 'gold' }).contracts).toEqual([
      c,
    ])
    // Away and back with the timber: met on arrival, then handed over.
    const away = { ...s, location: 'greenvale-2' }
    const back = journey(away, ROAD, 'steady')
    expect(back.location).toBe(HERE)
    expect(back.contracts[0].met).toBe(true)
    const done = act(back, { type: 'completeContract', id: 'c-test', reward: 'gold' })
    expect(done.goods.timber).toBe(0)
    expect(done.gold).toBe(back.gold + c.pay)
  })

  test('a freight’s goods are cargo: handed over, never sold, and paid for if lost', () => {
    const { state, offer } = boardWith('freight')
    expect(offer.good).toBe('food')
    const taken = act(state, { type: 'acceptContract', offerId: offer.id })
    expect(taken.goods.food).toBe((state.goods.food ?? 0) + offer.amount)
    expect(taken.contracts[0]).toMatchObject({ kind: 'freight', pay: offer.pay })
    // Only the party's own food sells; the cargo stays, and goes back if the job is given up.
    const sold = act(taken, { type: 'sellGoods', good: 'food', amount: 999 })
    expect(sold.goods.food).toBe(offer.amount)
    const again = act(sold, { type: 'sellGoods', good: 'food', amount: 1 })
    expect(again.goods.food).toBe(offer.amount)
    expect(again.log.at(-1)!.text).toMatch(/cargo/)
    const quit = act(sold, { type: 'abandonContract', id: offer.id })
    expect(quit.goods.food).toBe(0)
    expect(quit.gold).toBe(sold.gold)
  })

  test('cargo is reserved; selling it on purpose breaks the contract, as the preview says', () => {
    const { state, offer } = boardWith('freight')
    const taken = act(state, { type: 'acceptContract', offerId: offer.id })
    const own = state.goods.food ?? 0
    expect(maxSell(taken, 'food')).toBe(own)
    expect(cargoInfo(taken, content)).toMatchObject({
      reserved: { food: offer.amount },
      lots: [{ contractId: offer.id, good: 'food', amount: offer.amount, carried: offer.amount }],
    })
    const sale = sellCargoPreview(taken, content, offer.id)!
    expect(sale.units).toBe(offer.amount)
    expect(sale.text).toMatch(/breaks/)
    const sold = act(taken, { type: 'sellCargo', contractId: offer.id })
    expect(sold.contracts).toEqual([])
    expect(sold.goods.food).toBe(own)
    expect(sold.gold).toBe(taken.gold + sale.gold - sale.owed)
    const lost = taken.reputation.people[offer.patron] ?? 0
    expect(sold.reputation.people[offer.patron]).toBe(lost - sale.standing)
    expect(sale.standing).toBe(SOLD_CARGO_REP)
    expect(sold.reputation.settlements[HERE]).toBe(
      (taken.reputation.settlements[HERE] ?? 0) - SOLD_CARGO_REP
    )
    // No other contract's cargo, and nothing on the road.
    const away = { ...taken, location: null, travel: null }
    expect(sellCargoPreview(away, content, offer.id)).toBeNull()
    expect(act(taken, { type: 'sellCargo', contractId: 'nope' }).contracts).toEqual(taken.contracts)
  })
  test('a bounty is met by clearing its site, then claimed back home', () => {
    const base = at(HERE)
    const poi = Object.keys(base.world.pois)[0]
    const c = contract(base, {
      kind: 'bounty',
      template: 'camp-bounty',
      to: HERE,
      poi,
      passengers: 0,
    })
    const s = { ...base, contracts: [c], encounter: makeEncounter({ poi }) }
    const cleared = applyEffects(s, [EffectSchema.parse({ effect: 'clearPoi' })], { content })
    expect(cleared.contracts[0].met).toBe(true)
    const done = act(
      { ...cleared, encounter: null },
      { type: 'completeContract', id: 'c-test', reward: 'gold' }
    )
    expect(done.contracts).toEqual([])
  })

  test('a bounty whose site the realm empties first is void, at no cost', () => {
    const base = at(HERE)
    const [poi, p] = Object.entries(base.world.pois).find(([, x]) => cycles(x))!
    let day = 1
    while (!siteEmpty(base.world.seed, poi, p, day)) day++
    const c = contract(base, {
      kind: 'bounty',
      template: 'camp-bounty',
      to: HERE,
      poi,
      passengers: 0,
      deadline: day + 5,
    })
    const s = { ...base, day, contracts: [c] }
    // Any action: the void is noticed after it.
    const after = act(s, { type: 'abandonContract', id: 'none' })
    expect(after.contracts).toEqual([])
    expect(after.reputation).toEqual(s.reputation)
    expect(after.log.at(-1)!.text).toMatch(/is void/)
    // Met before it emptied (cleared by the party): still to be claimed.
    const met = act(
      { ...s, contracts: [{ ...c, met: true }] },
      { type: 'abandonContract', id: 'x' }
    )
    expect(met.contracts).toHaveLength(1)
  })

  test('an errand is met by visiting its site', () => {
    const base = at(HERE)
    const [poi, state] = Object.entries(base.world.pois).find(([, p]) => p.category !== 'lair')!
    const pois = { ...base.world.pois, [poi]: { ...state, discovered: true } }
    const c = contract(base, {
      kind: 'errand',
      template: 'visit-stones',
      to: HERE,
      poi,
      passengers: 0,
    })
    const s = { ...base, location: poi, world: { ...base.world, pois }, contracts: [c] }
    expect(act(s, { type: 'visitPoi' }).contracts[0].met).toBe(true)
  })

  test('a good word raises every settlement of the kingdom instead of paying', () => {
    const s = at('greenvale-2', { contracts: [contract(at(HERE), { met: true })] })
    const done = act(s, { type: 'completeContract', id: 'c-test', reward: 'goodWord' })
    expect(done.gold).toBe(s.gold)
    const kingdom = kingdomOf(s, HERE)!
    for (const id of kingdom.domains) {
      expect(done.reputation.settlements[id]).toBe(GOOD_WORD_POINTS)
    }
    expect(done.reputation.people[patron(s)]).toBe(5)
  })
})

describe('XP for contracts', () => {
  test('a completed contract pays XP by its pay, with a good word as with gold', () => {
    const xpFor = (reward: 'gold' | 'goodWord', pay = 30) => {
      const s = at('greenvale-2', { contracts: [contract(at(HERE), { met: true, pay })] })
      const done = act(s, { type: 'completeContract', id: 'c-test', reward })
      return done.party.map((c, i) => c.xp - s.party[i].xp)
    }
    const [gold] = xpFor('gold')
    expect(gold).toBeGreaterThan(0)
    expect(xpFor('goodWord')).toEqual([gold, gold])
    expect(xpFor('gold', 60)[0]).toBeGreaterThan(gold)
  })
})

describe('on the road', () => {
  test('escorted passengers eat and drink as members', () => {
    const s = at(HERE, { contracts: [contract(at(HERE), { passengers: 2 })] })
    const fed = passDay(s, 'plains')
    expect(fed.goods.food).toBe(20 - 4)
    expect(passDay(at(HERE), 'plains').goods.food).toBe(20 - 2)
  })

  test('a courier that gives up pays for the cargo it lost', () => {
    const c = contract(at(HERE), {
      kind: 'courier',
      template: 'carry-cloth',
      good: 'luxuries',
      amount: 2,
      passengers: 0,
    })
    const s = at(HERE, { contracts: [c], goods: { food: 20, water: 8, luxuries: 1 }, gold: 100 })
    const gone = act(s, { type: 'abandonContract', id: 'c-test' })
    expect(gone.goods.luxuries).toBe(0)
    expect(gone.gold).toBe(100 - content.goods.luxuries.price)
    expect(gone.reputation.people[patron(s)]).toBe(-FAIL_REP)
  })
})
