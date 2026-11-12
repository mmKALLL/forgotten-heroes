import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import type { Pace } from '../../schema/constants'
import type { GameState } from '../../schema/state'
import { WIDE_BERTH, inProgress } from '../encounters/run'
import { createRng } from '../rng'
import { step, type Action } from '../state'
import { brom, fixtureContent, lyra, makeState } from '../test-fixtures'
import { settlementName } from '../world/geo'
import { PURSUIT_ESCAPED, PURSUIT_LOST } from './pursuit'

const content = fixtureContent()
const at = (location: string, overrides: Partial<GameState> = {}): GameState =>
  makeState({ location, travel: null, goods: { food: 10, water: 8 }, ...overrides })
const act = (state: GameState, action: Action, c: Content = content) => step(state, action, c)
const travel = (
  state: GameState,
  routeId: string,
  c: Content = content,
  pace?: Pace,
  coverTracks?: boolean
) => act(state, { type: 'travel', routeId, pace, coverTracks }, c)
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
      coverTracks: false,
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
    expect(after.gold).toBe(8)
    expect(lastLine(after)).toMatch(/, 12 gp passage\.$/)
    expect(lastLine(travel(at('ashmoor-1', { gold: 5 }), 'ashmoor-1-farisle-1'))).toBe(
      'Passage costs 12 gp.'
    )
  })

  test('the pace sets the speed and the length; covering tracks only works when cautious', () => {
    const brisk = travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'brisk')
    expect(brisk.travel).toMatchObject({ pace: 'brisk', kmPerDay: 37.5, days: 2 })
    expect(lastLine(brisk)).toMatch(/ at a brisk pace: 75 km, about 2 days\.$/)
    const hidden = travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'cautious', true)
    expect(hidden.travel).toMatchObject({ pace: 'cautious', coverTracks: true, kmPerDay: 16 })
    expect(hidden.travel!.days).toBe(5)
    expect(lastLine(hidden)).toMatch(/ at a cautious pace, covering its tracks: 75 km/)
    const steady = travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'steady', true)
    expect(steady.travel).toMatchObject({ pace: 'steady', coverTracks: false })
  })

  test('at sea the ship sets the pace', () => {
    const at_sea = travel(
      at('ashmoor-1', { gold: 20 }),
      'ashmoor-1-farisle-1',
      content,
      'forced',
      true
    )
    expect(at_sea.travel).toMatchObject({ pace: 'steady', coverTracks: false, kmPerDay: 75 })
    expect(lastLine(at_sea)).toMatch(/The ship sets the pace\.$/)
  })
})

describe('continueJourney', () => {
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
      travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'cautious', true),
      [2]
    )
    expect(go(out).travel!.paceLog).toEqual([
      { day: out.day, pace: 'cautious', coverTracks: true },
      { day: out.day + 1, pace: 'cautious', coverTracks: true },
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

  test('buying food and waterskins and selling supplies are actions too', () => {
    expect(act(at('greenvale-1', { gold: 10 }), { type: 'buyFood', amount: 2 }).gold).toBe(8)
    const skins = act(at('greenvale-1', { gold: 10 }), { type: 'buyWaterskin', count: 2 })
    expect(skins).toMatchObject({ gold: 6, waterskins: 2 })
    expect(act(skins, { type: 'sellSupplies', waterskins: 2 })).toMatchObject({
      gold: 8,
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
  const meet = (pace: Pace, coverTracks = false, seed = 0) =>
    go(
      encountersOn(
        travel(
          at('greenvale-1', { rng: createRng(seed) }),
          'greenvale-1-greenvale-2',
          hostile,
          pace,
          coverTracks
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

  test('a cautious party meets an ambush on normal footing, or with Edge if it covered its tracks', () => {
    const met = (cover: boolean) =>
      Array.from({ length: 20 }, (_, seed) => meet('cautious', cover, seed)).find(
        (s) => s.encounter
      )!
    expect(met(false).encounter?.position).toBe('normal')
    expect(met(true).encounter?.position).toBe('edge')
  })

  test('a neutral encounter is not an ambush, whatever the pace', () => {
    expect(
      go(encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2', content, 'brisk'), [1]))
        .encounter?.position
    ).toBe('normal')
  })

  test('a cautious party gives some ambushes a wide berth and walks on', () => {
    const runs = Array.from({ length: 30 }, (_, seed) => meet('cautious', false, seed))
    const avoided = runs.filter((s) => !s.encounter)
    expect(avoided.length).toBeGreaterThan(3)
    expect(avoided.length).toBeLessThan(25)
    for (const state of avoided) {
      expect(texts(state)).toContain(WIDE_BERTH)
      expect(state.location).toBe('greenvale-2')
    }
  })
})

describe('pursuit', () => {
  const hunted = structuredClone(content)
  hunted.situations.grudge.pursuit = true
  /** Grudge queued today in Greenvale 1, then a journey with an encounter on day `on`. */
  const chased = (pace: Pace, coverTracks = false, on = 2) => {
    const base = at('greenvale-1')
    const queued = {
      ...base,
      followUps: [{ situationId: 'grudge', wait: 0, queuedDay: base.day }],
    }
    const out = travel(queued, 'greenvale-1-greenvale-2', hunted, pace, coverTracks)
    return go(encountersOn(out, [on]), hunted)
  }

  test('at a steady pace they catch up', () => {
    expect(chased('steady').encounter?.situation.id).toBe('grudge')
  })

  test('covered tracks lose them, and the party walks on', () => {
    const after = chased('cautious', true)
    expect(after.encounter).toBeNull()
    expect(after.followUps).toEqual([])
    expect(texts(after)).toContain(PURSUIT_LOST)
    // The march goes on past the encounter day, all the way there.
    expect(after.location).toBe('greenvale-2')
  })

  test('a brisk march outruns them for now', () => {
    const after = chased('brisk', false, 1)
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
      { day: base.day, pace: 'brisk', coverTracks: false },
      { day: base.day + 1, pace: 'brisk', coverTracks: false },
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

  test('foraging keeps a party without water going', () => {
    let withForage = 0
    let without = 0
    for (let seed = 0; seed < 30; seed++) {
      const dry = { party: [sage, lyra], goods: { food: 10, water: 0 }, rng: createRng(seed) }
      const run = (forage: boolean) => {
        let state = plains(dry, forage)
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
  test('nothing on the road changes the pace, covering tracks or foraging', () => {
    const out = encountersOn(
      act(at('greenvale-1'), {
        type: 'travel',
        routeId: 'greenvale-1-greenvale-2',
        pace: 'cautious',
        coverTracks: true,
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
    const set = { pace: 'cautious', coverTracks: true, forage: false }
    expect(again.travel).toMatchObject(set)
    expect(act(out, { type: 'rest', lodging: true }).travel).toMatchObject(set)
    const met = go(encountersOn(act(out, { type: 'rest' }), [2]))
    expect(met.travel).toMatchObject(set)
    expect(met.travel!.paceLog.map((d) => [d.pace, d.coverTracks])).toEqual([
      ['cautious', true],
      ['cautious', true],
    ])
    expect(texts(met).some((t) => t.includes('Foraging'))).toBe(false)
  })
})
