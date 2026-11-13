import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import type { Pace } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { WIDE_BERTH, drawEncounter, inProgress } from '../encounters/run'
import { createRng } from '../rng'
import { step, type Action } from '../state'
import { brom, fixtureContent, lyra, makeState } from '../test-fixtures'
import { settlementName } from '../world/geo'
import { placeOnRoute } from './journey'
import { PURSUIT_ESCAPED, PURSUIT_LOST } from './pursuit'
import { WATERSKIN_PRICE, WATERSKIN_SELL_PRICE } from '../constants'

const content = fixtureContent()
const at = (location: string, overrides: Partial<GameState> = {}): GameState =>
  makeState({ location, travel: null, goods: { food: 10, water: 8 }, ...overrides })
const act = (state: GameState, action: Action, c: Content = content) => step(state, action, c)
const travel = (
  state: GameState,
  routeId: string,
  c: Content = content,
  pace?: Pace,
  forage?: boolean
) => act(state, { type: 'travel', routeId, pace, forage }, c)
const go = (state: GameState, c: Content = content) => act(state, { type: 'continueJourney' }, c)
/** The same journey with its encounter days replaced. */
const encountersOn = (state: GameState, encounterDays: number[]): GameState => ({
  ...state,
  travel: { ...state.travel!, encounterDays },
})
const lastLine = (state: GameState) => state.log.at(-1)!.text
const texts = (state: GameState) => state.log.map((e) => e.text)

describe('travel', () => {
  test('sets out along a road from here, with its encounter days drawn', () => {
    const before = at('greenvale-1')
    const after = travel(before, 'greenvale-1-greenvale-2')
    expect(after.location).toBeNull()
    expect(after.day).toBe(before.day)
    expect(after.travel).toMatchObject({
      route: 'greenvale-1-greenvale-2',
      from: 'greenvale-1',
      to: 'greenvale-2',
      km: 75,
      kmPerDay: 30,
      kmDone: 0,
      daysDone: 0,
      days: 3,
      pace: 'steady',
      paceLog: [],
    })
    expect(after.travel!.encounterDays.length).toBeGreaterThanOrEqual(1)
    expect(after.travel!.encounterDays.length).toBeLessThanOrEqual(3)
    expect(lastLine(after)).toBe(
      `The party sets out for ${settlementName(after, 'greenvale-2')}: 75 km, about 3 days.`
    )
  })

  test('a route can be taken in either direction', () => {
    expect(travel(at('greenvale-2'), 'greenvale-1-greenvale-2').travel?.to).toBe('greenvale-1')
  })

  test('refuses roads from elsewhere, a second departure, and an open encounter', () => {
    const here = at('greenvale-1')
    expect(travel(here, 'ashmoor-1-farisle-1')).toMatchObject({
      travel: null,
      location: 'greenvale-1',
    })
    const gone = travel(here, 'greenvale-1-greenvale-2')
    expect(lastLine(travel(gone, 'greenvale-1-greenvale-2'))).toBe(
      'The party is already on the road.'
    )
    const busy = act(here, { type: 'startEncounter', situationId: 'cliff' })
    expect(lastLine(travel(busy, 'greenvale-1-greenvale-2'))).toBe(
      'Finish the current encounter first.'
    )
  })

  test('a sea crossing charges its fare up front', () => {
    const after = travel(at('ashmoor-1', { gold: 20 }), 'ashmoor-1-farisle-1')
    expect(after.gold).toBe(4)
    expect(lastLine(after)).toMatch(/, 16 gp passage\.$/)
    expect(lastLine(travel(at('ashmoor-1', { gold: 5 }), 'ashmoor-1-farisle-1'))).toBe(
      'Passage costs 16 gp.'
    )
    // An escorted passenger pays like a member: 3 aboard.
    const escort: GameState['contracts'][number] = {
      id: 'c-escort',
      template: 'see-pilgrim',
      kind: 'escort',
      patron: 'nobody',
      from: 'ashmoor-1',
      to: 'farisle-1',
      good: null,
      amount: 0,
      poi: null,
      passengers: 1,
      accepted: 1,
      deadline: 30,
      pay: 30,
      level: 1,
      urgent: false,
      reputation: { patron: 1, settlement: 1 },
      met: false,
    }
    const escorted = travel(
      at('ashmoor-1', { gold: 30, contracts: [escort] }),
      'ashmoor-1-farisle-1'
    )
    expect(escorted.gold).toBe(30 - 24)
  })

  test('the pace sets the speed and the length; stealthy covers the tracks', () => {
    const brisk = travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'brisk')
    expect(brisk.travel).toMatchObject({ pace: 'brisk', kmPerDay: 37.5, days: 2 })
    expect(lastLine(brisk)).toMatch(/ at a brisk pace: 75 km, about 2 days\.$/)
    const hidden = travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'stealthy')
    expect(hidden.travel).toMatchObject({ pace: 'stealthy', kmPerDay: 15, days: 5 })
    expect(lastLine(hidden)).toMatch(/ at a stealthy pace, covering its tracks: 75 km/)
  })

  test('a crossing with nothing to meet at sea draws no encounter days', () => {
    const quiet = travel(at('ashmoor-1', { gold: 20 }), 'ashmoor-1-farisle-1')
    expect(quiet.travel!.encounterDays).toEqual([])
    const salty = structuredClone(content)
    salty.situations.cliff.biomes = ['sea']
    const lively = travel(at('ashmoor-1', { gold: 20 }), 'ashmoor-1-farisle-1', salty)
    expect(lively.travel!.encounterDays.length).toBeGreaterThanOrEqual(1)
  })

  test('at sea the ship sets the pace', () => {
    const at_sea = travel(at('ashmoor-1', { gold: 20 }), 'ashmoor-1-farisle-1', content, 'forced')
    expect(at_sea.travel).toMatchObject({ pace: 'steady', kmPerDay: 40 })
    expect(lastLine(at_sea)).toMatch(/The ship sets the pace\.$/)
  })
})

describe('continueJourney', () => {
  test('a road gone from the data since the save turns the party back, not onwards', () => {
    const out = act(at('greenvale-1'), {
      type: 'travel',
      routeId: 'greenvale-1-greenvale-2',
      forage: false,
    })
    const lost = { ...out, travel: { ...out.travel!, route: 'path-poi-99-greenvale-2' } }
    const back = act(lost, { type: 'continueJourney' })
    expect(back).toMatchObject({ travel: null, location: 'greenvale-1', day: out.day })
    expect(back.log.at(-1)).toMatchObject({
      tone: 'bad',
      text:
        `The way to ${settlementName(out, 'greenvale-2')} can no longer be found. ` +
        `The party makes its way back to ${settlementName(out, 'greenvale-1')}.`,
    })
    // A start that is gone too: the far end will do.
    const gone = { ...lost, travel: { ...lost.travel, from: 'poi-99' } }
    expect(act(gone, { type: 'continueJourney' }).location).toBe('greenvale-2')
  })

  test('quiet days collapse into one line, then the party arrives', () => {
    const out = encountersOn(
      act(at('greenvale-1'), {
        type: 'travel',
        routeId: 'greenvale-1-greenvale-2',
        forage: false,
      }),
      []
    )
    const arrived = go(out)
    const name = settlementName(arrived, 'greenvale-2')
    expect(arrived).toMatchObject({ travel: null, location: 'greenvale-2', day: out.day + 3 })
    expect(arrived.goods).toEqual({ food: 4, water: 8 })
    expect(arrived.log.slice(-2).map((e) => e.text)).toEqual([
      `3 quiet days on the road to ${name} (75 of 75 km).`,
      `Arrived at ${name} after 3 days on the road. The waterskins are refilled.`,
    ])
  })

  test('arriving, or turning back, clears the once-per-arrival actions', () => {
    const here = at('greenvale-1', { doneHere: ['rumours', 'bless:church'] })
    const out = encountersOn(
      act(here, { type: 'travel', routeId: 'greenvale-1-greenvale-2', forage: false }),
      []
    )
    expect(go(out).doneHere).toEqual([])
    const lost = { ...out, travel: { ...out.travel!, route: 'path-poi-99-greenvale-2' } }
    expect(go(lost)).toMatchObject({ location: 'greenvale-1', doneHere: [] })
  })

  test('an encounter stops the march on its day; the road resumes once it is closed', () => {
    const out = encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2'), [2])
    const met = go(out)
    expect(inProgress(met)).toBe(true)
    expect(met.travel).toMatchObject({ daysDone: 2, kmDone: 60, encounterDays: [] })
    expect(met.log.some((e) => e.text.startsWith('A quiet day on the road to'))).toBe(true)
    expect(lastLine(go(met))).toBe('Finish the current encounter first.')
    expect(go(act(met, { type: 'closeEncounter' })).location).toBe('greenvale-2')
  })

  test('each day walked is recorded with its pace', () => {
    const out = encountersOn(
      travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'stealthy'),
      [2]
    )
    expect(go(out).travel!.paceLog).toEqual([
      { day: out.day, pace: 'stealthy' },
      { day: out.day + 1, pace: 'stealthy' },
    ])
  })

  test('a forced march eats more', () => {
    const out = encountersOn(
      travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'forced'),
      []
    )
    const arrived = go(out)
    expect(arrived.day).toBe(out.day + 2)
    expect(arrived.goods.food).toBe(10 - 2 * 3)
  })

  test('running short stops the march after that day, so the player sees it', () => {
    const out = encountersOn(
      travel(at('greenvale-1', { goods: { food: 1, water: 8 } }), 'greenvale-1-greenvale-2'),
      []
    )
    const hungry = go(out)
    expect(hungry.travel).toMatchObject({ daysDone: 1 })
    expect(lastLine(hungry)).toMatch(/goes without food/)
  })

  test('a party that can’t go on makes camp, then carries on', () => {
    const out = encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2'), [])
    const down = { ...out, party: out.party.map((c) => ({ ...c, hp: 0 })) }
    expect(lastLine(go(down))).toBe('No one is fit to travel on. Make camp to recover.')
    const camped = act(down, { type: 'rest' })
    expect(camped.party.every((c) => c.hp > 0)).toBe(true)
    expect(go(camped).location).toBe('greenvale-2')
  })

  test('a downed party does not spend an encounter day', () => {
    const out = encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2'), [1])
    const walked = { ...out, travel: { ...out.travel!, daysDone: 1, kmDone: 30 } }
    const down = { ...walked, party: walked.party.map((c) => ({ ...c, hp: 0 })) }
    expect(go(down).travel!.encounterDays).toEqual([1])
  })

  test('a party that drops on the last stretch still reaches the gates', () => {
    const out = encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2'), [])
    const there = { ...out, travel: { ...out.travel!, daysDone: 3, kmDone: 75 } }
    const down = { ...there, party: there.party.map((c) => ({ ...c, hp: 0 })) }
    expect(go(down).location).toBe('greenvale-2')
  })

  test('road encounters fit the route’s terrain', () => {
    const tagged = structuredClone(content)
    tagged.situations.cliff.biomes = ['hills']
    for (let seed = 0; seed < 40; seed++) {
      const out = travel(
        at('greenvale-2', { rng: createRng(seed) }),
        'ashmoor-1-greenvale-2',
        tagged
      )
      const met = go(encountersOn(out, [1]), tagged)
      expect(met.encounter?.situation.id).not.toBe('cliff')
    }
  })

  test('buying food and waterskins and selling them are actions too', () => {
    const fed = act(at('greenvale-1', { gold: 10 }), { type: 'buyGoods', good: 'food', amount: 2 })
    expect(fed.gold).toBeLessThan(10)
    expect(fed.goods.food).toBe(12)
    const skins = act(at('greenvale-1', { gold: 20 }), { type: 'buyWaterskin', count: 2 })
    expect(skins).toMatchObject({ gold: 20 - 2 * WATERSKIN_PRICE, waterskins: 2 })
    expect(act(skins, { type: 'sellWaterskin', count: 2 })).toMatchObject({
      gold: skins.gold + 2 * WATERSKIN_SELL_PRICE,
      waterskins: 0,
    })
  })
})

describe('pace on the road', () => {
  // Only the cliff can be drawn, and it is hostile.
  const hostile = structuredClone(content)
  hostile.situations.cliff.disposition = 'hostile'
  for (const id of ['roadside', 'starfall']) hostile.situations[id].weight = 0
  hostile.situationTemplates.plea.weight = 0
  const meet = (pace: Pace, seed = 0, forage = false) =>
    go(
      encountersOn(
        travel(
          at('greenvale-1', { rng: createRng(seed) }),
          'greenvale-1-greenvale-2',
          hostile,
          pace,
          forage
        ),
        [1]
      ),
      hostile
    )

  test('an ambush meets a brisk party Exposed, a steady one on normal footing', () => {
    expect(meet('brisk').encounter?.position).toBe('exposed')
    expect(meet('forced').encounter?.position).toBe('exposed')
    expect(meet('steady').encounter?.position).toBe('normal')
  })

  test('a stealthy party meets an ambush with Edge', () => {
    const met = (pace: Pace) =>
      Array.from({ length: 20 }, (_, seed) => meet(pace, seed)).find((s) => s.encounter)!
    expect(met('stealthy').encounter?.position).toBe('edge')
  })

  test('foraging gives a stealthy party away: the ambush meets it on normal footing', () => {
    const met = Array.from({ length: 20 }, (_, seed) => meet('stealthy', seed, true)).find(
      (s) => s.encounter
    )!
    expect(met.encounter?.position).toBe('normal')
    expect(meet('brisk', 0, true).encounter?.position).toBe('exposed')
  })

  test('a neutral encounter is not an ambush, whatever the pace', () => {
    expect(
      go(encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'brisk'), [1]))
        .encounter?.position
    ).toBe('normal')
  })

  test('a stealthy party gives some ambushes a wide berth and walks on', () => {
    const runs = Array.from({ length: 30 }, (_, seed) => meet('stealthy', seed))
    const avoided = runs.filter((s) => !s.encounter)
    expect(avoided.length).toBeGreaterThan(3)
    expect(avoided.length).toBeLessThan(25)
    for (const state of avoided) {
      expect(texts(state)).toContain(WIDE_BERTH)
      // The water runs short on the slow road: one more Continue walks on to the end.
      expect((state.travel ? go(state, hostile) : state).location).toBe('greenvale-2')
    }
  })
})

describe('pursuit', () => {
  const hunted = structuredClone(content)
  hunted.situations.grudge.pursuit = true
  /** Grudge queued today in Greenvale 1, then a journey with an encounter on day `on`. */
  const chased = (pace: Pace, on = 2) => {
    const base = at('greenvale-1')
    const queued = {
      ...base,
      followUps: [{ situationId: 'grudge', wait: 0, queuedDay: base.day }],
    }
    const out = travel(queued, 'greenvale-1-greenvale-2', hunted, pace)
    return go(encountersOn(out, [on]), hunted)
  }

  test('at a steady pace they catch up', () => {
    expect(chased('steady').encounter?.situation.id).toBe('grudge')
  })

  test('a stealthy pace covers the tracks and loses them, and the party walks on', () => {
    const after = chased('stealthy')
    expect(after.encounter).toBeNull()
    expect(after.followUps).toEqual([])
    expect(texts(after)).toContain(PURSUIT_LOST)
    // The march goes on past the encounter day, all the way there.
    expect(after.location).toBe('greenvale-2')
  })

  test('a brisk march outruns them for now', () => {
    const after = chased('brisk', 1)
    expect(after.encounter).toBeNull()
    expect(texts(after)).toContain(PURSUIT_ESCAPED)
    expect(after.followUps).toMatchObject([{ situationId: 'grudge', wait: 2, escapes: 1 }])
  })

  test('days spent resting in town count as standing still', () => {
    // Queued two days before the party left town; one brisk day is not enough to get away.
    const base = at('greenvale-1')
    const late = {
      ...base,
      day: base.day + 2,
      followUps: [{ situationId: 'grudge', wait: 0, queuedDay: base.day }],
    }
    const out = travel(late, 'greenvale-1-greenvale-2', hunted, 'brisk')
    expect(go(encountersOn(out, [1]), hunted).encounter?.situation.id).toBe('grudge')
  })

  test('a journey’s days stay on the trail after arrival', () => {
    const base = at('greenvale-1')
    const queued = {
      ...base,
      followUps: [{ situationId: 'grudge', wait: 5, queuedDay: base.day }],
    }
    const out = encountersOn(travel(queued, 'greenvale-1-greenvale-2', hunted, 'brisk'), [])
    const arrived = go(out, hunted)
    expect(arrived.followUps[0].trail).toEqual([
      { day: base.day, pace: 'brisk' },
      { day: base.day + 1, pace: 'brisk' },
    ])
  })
})

describe('foraging', () => {
  const plains = (overrides: Partial<GameState> = {}, forage?: boolean) =>
    encountersOn(
      act(at('greenvale-1', overrides), {
        type: 'travel',
        routeId: 'greenvale-1-greenvale-2',
        forage,
      }),
      []
    )
  const thirsty = (state: GameState) => texts(state).some((t) => /goes without water/.test(t))
  /** Brom with WIS 30 only fails on a natural 1. */
  const sage = { ...brom, abilities: { ...brom.abilities, wis: 30 } }

  test('each day on land the best Survival forages, and the finds join the day line', () => {
    const out = plains()
    const arrived = go(out)
    expect(arrived.location).toBe('greenvale-2')
    expect(texts(arrived)).toContainEqual(
      expect.stringMatching(
        /^3 quiet days on the road to .+ \(75 of 75 km\)\. Foraging \(Survival DC 10, Brom\): /
      )
    )
    expect(arrived.skillUses.filter((u) => u.skill === 'survival')).toEqual([
      { day: out.day, characterId: 'brom', skill: 'survival' },
      { day: out.day + 1, characterId: 'brom', skill: 'survival' },
      { day: out.day + 2, characterId: 'brom', skill: 'survival' },
    ])
  })

  test('a stack from a strained forage lasts the day and fades the following day', () => {
    // Two Survival checks already today: the day's forage is the third, and strains Brom.
    const today = at('greenvale-1').day
    const busy = {
      skillUses: [
        { day: today, characterId: 'brom', skill: 'survival' as const },
        { day: today, characterId: 'brom', skill: 'survival' as const },
      ],
    }
    const firstDay = go(encountersOn(plains(busy), [1]))
    expect(firstDay.day).toBe(today + 1)
    expect(firstDay.party[0].strain).toEqual({ survival: 1 })
    const arrived = go(act(firstDay, { type: 'closeEncounter' }))
    expect(arrived.location).toBe('greenvale-2')
    expect(arrived.party[0].strain).toEqual({})
  })

  test('foraging keeps a party without water going', () => {
    let withForage = 0
    let without = 0
    for (let seed = 0; seed < 30; seed++) {
      const dry = { party: [sage, lyra], goods: { food: 10, water: 0 }, rng: createRng(seed) }
      const run = (forage: boolean) => {
        // Setting out tops the water up: the party sets out dry all the same.
        let state = plains(dry, forage)
        state = { ...state, goods: { ...state.goods, water: 0 } }
        for (let i = 0; i < 5 && state.travel; i++) state = go(state)
        return state
      }
      if (thirsty(run(true))) withForage++
      if (thirsty(run(false))) without++
    }
    expect(without).toBe(30)
    expect(withForage).toBeLessThan(10)
  })

  test('a journey can set out without foraging', () => {
    const out = plains({}, false)
    expect(out.travel!.forage).toBe(false)
    expect(lastLine(out)).toMatch(/ No foraging\.$/)
    const arrived = go(out)
    expect(arrived.skillUses).toEqual([])
    expect(texts(arrived).some((t) => t.includes('Foraging'))).toBe(false)
  })

  test('there is nothing to forage at sea', () => {
    const out = encountersOn(travel(at('ashmoor-1', { gold: 20 }), 'ashmoor-1-farisle-1'), [])
    expect(out.travel!.forage).toBe(false)
    const arrived = go(out)
    expect(arrived.location).toBe('farisle-1')
    expect(arrived.skillUses).toEqual([])
  })
})

describe('stowing away', () => {
  const stow = (state: GameState, c: Content = content) =>
    act(state, { type: 'travel', routeId: 'ashmoor-1-farisle-1', stowaway: true }, c)
  /** The first seed whose stowaway roll lands on `tier`. */
  const rolled = (tier: string, gold = 5, c: Content = content) => {
    for (let seed = 0; seed < 500; seed++) {
      const before = at('ashmoor-1', { gold, rng: createRng(seed) })
      const after = stow(before, c)
      if (after.lastRoll?.tier === tier) return { before, after }
    }
    throw new Error(`no seed rolls ${tier}`)
  }

  test('only on a ship the party can’t pay for', () => {
    expect(
      lastLine(
        act(at('greenvale-1', { gold: 0 }), {
          type: 'travel',
          routeId: 'greenvale-1-greenvale-2',
          stowaway: true,
        })
      )
    ).toBe('Only a ship can be stowed away on.')
    expect(lastLine(stow(at('ashmoor-1', { gold: 20 })))).toBe('The party can pay its passage.')
  })

  test('the stealthiest member sneaks aboard, and it counts as a use of Stealth', () => {
    const { before, after } = rolled('success')
    expect(after.lastRoll).toMatchObject({ stat: 'stealth', actorId: 'lyra', dc: 13 })
    expect(after.skillUses).toEqual([{ day: before.day, characterId: 'lyra', skill: 'stealth' }])
    expect(after.gold).toBe(5)
    expect(after.travel).toMatchObject({ to: 'farisle-1', pace: 'steady' })
    expect(texts(after)).toContain('The party slips aboard unseen.')
    expect(lastLine(after)).toMatch(/, hidden in the hold\.$/)
  })

  test('a stack from the stowaway check outlasts the first day at sea', () => {
    const today = at('ashmoor-1').day
    const uses = [0, 1].map(() => ({ day: today, characterId: 'lyra', skill: 'stealth' as const }))
    for (let seed = 0; seed < 500; seed++) {
      const after = stow(at('ashmoor-1', { gold: 5, rng: createRng(seed), skillUses: uses }))
      if (after.lastRoll?.tier !== 'success') continue
      expect(after.party[1].strain).toEqual({ stealth: 1 })
      // A one-day crossing: the party lands the next day, the stack still on.
      const day1 = go({ ...after, travel: { ...after.travel!, km: 40, encounterDays: [] } })
      expect(day1.location).toBe('farisle-1')
      expect(day1.day).toBe(today + 1)
      expect(day1.party[1].strain).toEqual({ stealth: 1 })
      return
    }
    throw new Error('no seed rolls success')
  })

  test('caught with coin, the party is fined all of it and sails', () => {
    const { after } = rolled('fail')
    expect(after.gold).toBe(0)
    expect(after.travel?.to).toBe('farisle-1')
  })

  test('caught with no coin, or at the gangplank, it works its passage off', () => {
    for (const [tier, gold] of [
      ['fail', 0],
      ['partial', 5],
    ] as const) {
      const { before, after } = rolled(tier, gold)
      expect(after.day).toBe(before.day + 2)
      expect(after.gold).toBe(gold)
      expect(after.party.find((c) => c.id === 'lyra')!.exhaustion).toBe(1)
      expect(after.goods).toEqual(before.goods)
      expect(after.travel?.to).toBe('farisle-1')
      expect(lastLine(after)).toMatch(/, working its passage\.$/)
    }
  })

  test('a critical failure is a brawl: a hostile sea situation tagged brawl, or a beating', () => {
    const beaten = rolled('critFail')
    const hurt = beaten.before.party[1].hp - beaten.after.party[1].hp
    expect(hurt).toBeGreaterThanOrEqual(3)
    expect(hurt).toBeLessThanOrEqual(8)
    expect(beaten.after.travel?.to).toBe('farisle-1')
    expect(beaten.after.encounter).toBeNull()

    const rowdy = structuredClone(content)
    Object.assign(rowdy.situations.cliff, {
      tags: ['brawl'],
      biomes: ['sea'],
      disposition: 'hostile',
    })
    const brawl = rolled('critFail', 5, rowdy).after
    expect(brawl.encounter?.situation.id).toBe('cliff')
    expect(brawl.travel?.to).toBe('farisle-1')
  })
})

describe('pace is set at departure', () => {
  test('nothing on the road changes the pace or foraging', () => {
    const out = encountersOn(
      act(at('greenvale-1'), {
        type: 'travel',
        routeId: 'greenvale-1-greenvale-2',
        pace: 'stealthy',
        forage: false,
      }),
      []
    )
    const again = act(out, {
      type: 'travel',
      routeId: 'greenvale-1-greenvale-2',
      pace: 'forced',
      forage: true,
    })
    expect(lastLine(again)).toBe('The party is already on the road.')
    const set = { pace: 'stealthy', forage: false }
    expect(again.travel).toMatchObject(set)
    expect(act(out, { type: 'rest', lodging: true }).travel).toMatchObject(set)
    const met = go(encountersOn(act(out, { type: 'rest' }), [2]))
    expect(met.travel).toMatchObject(set)
    expect(met.travel!.paceLog.map((d) => d.pace)).toEqual(['stealthy', 'stealthy'])
    expect(texts(met).some((t) => t.includes('Foraging'))).toBe(false)
  })
})

describe('what is met on the road', () => {
  const place = (hostileShare: number) => ({
    biome: 'plains' as const,
    land: 'greenvale',
    domain: 'greenvale-1',
    hostileShare,
  })
  const draws = (c: Content, hostileShare: number) =>
    Array.from({ length: 40 }, (_, seed) =>
      drawEncounter(at('greenvale-1', { rng: createRng(seed) }), c, undefined, place(hostileShare))
    )
  const hostileCount = (states: GameState[]) =>
    states.filter((s) => s.encounter?.situation.disposition === 'hostile').length

  // The cliff turns hostile; the rest of the road stays neutral or pleasant.
  const mixed = structuredClone(content)
  mixed.situations.cliff.disposition = 'hostile'

  test('the hostile share decides whether each encounter is hostile', () => {
    expect(hostileCount(draws(mixed, 1))).toBe(40)
    expect(hostileCount(draws(mixed, 0))).toBe(0)
    const some = hostileCount(draws(mixed, 0.5))
    expect(some).toBeGreaterThan(5)
    expect(some).toBeLessThan(35)
  })

  test('with nothing of the drawn kind to meet, any fitting encounter is met', () => {
    // No regular situation in the fixtures is hostile.
    const met = draws(content, 1)
    expect(met.every((s) => s.encounter !== null)).toBe(true)
    expect(hostileCount(met)).toBe(0)
  })

  test('at most one encounter a day, even from an older save that lists a day twice', () => {
    const out = encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2'), [1, 1])
    const met = go(out)
    expect(met.encounter).not.toBeNull()
    expect(met.travel!.encounterDays).toEqual([])
    const next = go({ ...met, encounter: null })
    expect(next.encounter).toBeNull()
    expect(next.travel).toBeNull()
  })

  test('a pursuit that comes due takes the day’s encounter rather than adding one', () => {
    const hunted = structuredClone(content)
    hunted.situations.grudge.pursuit = true
    const base = at('greenvale-1')
    const queued = { ...base, followUps: [{ situationId: 'grudge', wait: 0, queuedDay: base.day }] }
    const out = encountersOn(travel(queued, 'greenvale-1-greenvale-2', hunted), [2])
    const met = go(out, hunted)
    expect(met.encounter?.situation.id).toBe('grudge')
    expect(met.travel!.encounterDays).toEqual([])
    expect(met.travel!.daysDone).toBe(2)
  })
})

describe('placeOnRoute', () => {
  test("near the far end, a road encounter is in that end's domain; at sea, the port sailed from", () => {
    const road = travel(at('greenvale-1'), 'greenvale-1-greenvale-2').travel!
    const late = { ...road, kmDone: road.km - 1 }
    expect(placeOnRoute(at('greenvale-1'), content, late)!.domain).toBe('greenvale-2')
    const sea = { ...late, route: 'ashmoor-1-farisle-1', from: 'ashmoor-1', to: 'farisle-1' }
    expect(placeOnRoute(at('ashmoor-1'), content, { ...sea, km: 160, kmDone: 150 })!.domain).toBe(
      'ashmoor-1'
    )
  })
})
