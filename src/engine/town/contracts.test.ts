import { describe, expect, test } from 'vitest'
import { EffectSchema } from '../../schema/encounter'
import type { ContractKind } from '../../schema/types'
import type { ContractState, GameState } from '../../schema/state'
import { applyEffects } from '../encounters/effects'
import { step, type Action } from '../state'
import { fixtureContent, makeEncounter, makeState } from '../test-fixtures'
import { passDay } from '../travel/days'
import { routeOptions } from '../travel/preview'
import { FAIL_REP, GOOD_WORD_POINTS, MAX_CONTRACTS } from '../constants'
import { kingdomOf } from './reputation'
import { contractRows, noticeBoard, type Offer } from './contracts'

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
function boardWith(kind: ContractKind, base = at(HERE)): { state: GameState; offer: Offer } {
  for (let week = 0; week < 60; week++) {
    const state = { ...base, day: week * 7 + 1 }
    const offer = noticeBoard(state, content, HERE).find((o) => o.kind === kind)
    if (offer) return { state, offer }
  }
  throw new Error(`no ${kind} offer`)
}

const signature = (offers: Offer[]) => JSON.stringify(offers.map(({ id: _, ...o }) => o))

describe('noticeBoard', () => {
  test('is the same all week and changes from week to week', () => {
    const s = at(HERE)
    const week = noticeBoard({ ...s, day: 8 }, content, HERE)
    expect(week.length).toBeGreaterThan(0)
    expect(noticeBoard({ ...s, day: 14 }, content, HERE)).toEqual(week)
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
        expect(o.km).toBeGreaterThanOrEqual(t.km.min)
        expect(o.km).toBeLessThanOrEqual(t.km.max)
        if (o.urgent) {
          expect(o.days).toBeLessThan(o.steadyDays)
          expect(o.days).toBeGreaterThanOrEqual(o.forcedDays)
        } else expect(o.days).toBeGreaterThanOrEqual(o.steadyDays)
        expect(o.locked === null).toBe(!t.minStanding)
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

  test('a supply run completes where the goods are wanted, and not without them', () => {
    const c = contract(at(HERE), {
      kind: 'supply',
      template: 'bring-timber',
      good: 'timber',
      amount: 3,
      passengers: 0,
    })
    const without = at('greenvale-2', { contracts: [c] })
    expect(
      act(without, { type: 'completeContract', id: 'c-test', reward: 'gold' }).contracts
    ).toEqual([c])
    const s = at('greenvale-2', { contracts: [c], goods: { food: 20, water: 8, timber: 3 } })
    const done = act(s, { type: 'completeContract', id: 'c-test', reward: 'gold' })
    expect(done.goods.timber).toBe(0)
    expect(done.contracts).toEqual([])
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
