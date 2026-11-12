import { describe, expect, test } from 'vitest'
import { EffectSchema } from '../../schema/encounter'
import type { Character, ContractState, GameState } from '../../schema/state'
import { CAMARADERIE_MAX } from '../../schema/types'
import { applyEffects } from '../encounters/effects'
import { createRng } from '../rng'
import { step, type Action } from '../state'
import {
  brom,
  fixtureContent,
  lyra,
  makeCharacter,
  makeEncounter,
  makeState,
} from '../test-fixtures'
import { passDay } from '../travel/days'
import { CAMARADERIE_DEATH, CAMARADERIE_HUNGER, DESERT_CHANCE } from '../constants'
import { camaraderieInfo, camaraderieTier, desertOnArrival, mournTheDead } from './camaraderie'

const content = fixtureContent()
const HERE = 'greenvale-1'
const ROAD = 'greenvale-1-greenvale-2'
const act = (s: GameState, a: Action) => step(s, a, content)

const hired = (id: string, wage = 1): Character =>
  makeCharacter({ id, name: `Hireling ${id}`, wage })

function at(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    location: HERE,
    day: 1,
    gold: 50,
    goods: { food: 20, water: 8 },
    party: [brom, lyra, hired('h1')],
    ...overrides,
  })
}
/** A day passes in town on the party's own food (spoilage, upkeep and wages follow). */
const aDay = (s: GameState) => passDay(s, null, 'steady', content)

describe('wages', () => {
  test('are paid daily, owed when broke (camaraderie drops that day), and paid first after', () => {
    const s = at({ party: [brom, lyra, hired('h1', 1), hired('h2', 2)] })
    const paid = aDay(s)
    expect(paid.gold).toBe(s.gold - 3)
    expect(paid.camaraderie).toBe(s.camaraderie)

    const broke = aDay({ ...s, gold: 0 })
    expect(broke.wagesOwed).toBe(3)
    expect(broke.camaraderie).toBeLessThan(s.camaraderie)

    const settled = aDay({ ...broke, gold: 50 })
    expect(settled.wagesOwed).toBe(0)
    expect(settled.gold).toBe(50 - 6)
  })

  test('founders and the dead draw no wages', () => {
    const s = at({ party: [brom, lyra, { ...hired('h1', 2), exhaustion: 6 }] })
    expect(aDay(s).gold).toBe(s.gold)
    expect(camaraderieInfo(s).wagesPerDay).toBe(0)
  })
})

describe('camaraderie', () => {
  test('a day without food costs it once, however many go hungry', () => {
    const s = at({ goods: { food: 0, water: 8 } })
    expect(aDay(s).camaraderie).toBe(s.camaraderie - CAMARADERIE_HUNGER)
  })

  test('a death costs it, once per death', () => {
    const before = at()
    const after = {
      ...before,
      party: before.party.map((c, i) => (i < 2 ? { ...c, exhaustion: 6 } : c)),
    }
    expect(mournTheDead(before, after).camaraderie).toBe(before.camaraderie - 2 * CAMARADERIE_DEATH)
    // The already dead aren't mourned again.
    expect(mournTheDead(after, after).camaraderie).toBe(after.camaraderie)
  })

  test('a completed contract raises it', () => {
    const s = at()
    const patron = Object.keys(s.world.people).find((id) => s.world.people[id].settlement === HERE)!
    const contract: ContractState = {
      id: 'c-test',
      template: 'see-pilgrim',
      kind: 'escort',
      patron,
      from: HERE,
      to: HERE,
      good: null,
      amount: 0,
      poi: null,
      passengers: 0,
      accepted: 1,
      deadline: 10,
      pay: 30,
      urgent: false,
      reputation: { patron: 5, settlement: 3 },
      met: true,
    }
    const done = act(
      { ...s, contracts: [contract] },
      {
        type: 'completeContract',
        id: 'c-test',
        reward: 'gold',
      }
    )
    expect(done.contracts).toEqual([])
    expect(done.camaraderie).toBeGreaterThan(s.camaraderie)
  })

  test('a night in a private room raises it once per arrival', () => {
    const s = at()
    const once = act(s, { type: 'rest', lodging: 'private' })
    expect(once.camaraderie).toBe(s.camaraderie + 1)
    expect(act(once, { type: 'rest', lodging: 'private' }).camaraderie).toBe(once.camaraderie)
    expect(act(s, { type: 'rest', lodging: 'common' }).camaraderie).toBe(s.camaraderie)
  })

  test('the encounter effect changes it, within 0–8', () => {
    const effect = (amount: number) => [EffectSchema.parse({ effect: 'camaraderie', amount })]
    const s = at({ encounter: makeEncounter() })
    expect(applyEffects(s, effect(-20)).camaraderie).toBe(0)
    expect(applyEffects(s, effect(20)).camaraderie).toBe(CAMARADERIE_MAX)
    expect(applyEffects(s, effect(1)).camaraderie).toBe(s.camaraderie + 1)
  })

  test('crossing a tier is logged', () => {
    const s = at({ camaraderie: 4, goods: { food: 0, water: 8 } })
    const after = aDay(s)
    expect(camaraderieTier(after.camaraderie)).not.toBe(camaraderieTier(s.camaraderie))
    expect(after.log.some((l) => /strained/i.test(l.text))).toBe(true)
  })
})

describe('desertion', () => {
  const party = [brom, lyra, hired('h1'), hired('h2'), hired('h3'), hired('h4')]

  test('a fractured party loses some hired members on arrival, never a founder', () => {
    let left = 0
    const seeds = 50
    for (let seed = 1; seed <= seeds; seed++) {
      const s = at({ party, camaraderie: 1, wagesOwed: 8, rng: createRng(seed) })
      const after = desertOnArrival(s)
      expect(desertOnArrival(s)).toEqual(after)
      const ids = after.party.map((c) => c.id)
      expect(ids).toEqual(expect.arrayContaining([brom.id, lyra.id]))
      // Each deserter's share of the owed wages is written off.
      expect(after.wagesOwed).toBeCloseTo((8 * (ids.length - 2)) / 4)
      left += party.length - after.party.length
    }
    const share = left / (seeds * 4)
    expect(share).toBeGreaterThan(DESERT_CHANCE / 2)
    expect(share).toBeLessThan(DESERT_CHANCE * 2)
    // Only a fractured party loses anyone.
    expect(desertOnArrival(at({ party, camaraderie: 2 })).party).toHaveLength(party.length)
  })

  test('happens when the party arrives in a settlement', () => {
    const arrivals = [1, 2, 3, 4, 5, 6].map((seed) => {
      const s = at({ party, camaraderie: 0, rng: createRng(seed) })
      let next = act(s, { type: 'travel', routeId: ROAD, pace: 'steady', forage: false })
      next = { ...next, travel: { ...next.travel!, encounterDays: [] } }
      for (let i = 0; i < 10 && next.travel; i++) next = act(next, { type: 'continueJourney' })
      expect(next.location).toBe('greenvale-2')
      expect(next.party.map((c) => c.id)).toEqual(expect.arrayContaining([brom.id, lyra.id]))
      return party.length - next.party.length
    })
    expect(arrivals.some((gone) => gone > 0)).toBe(true)
  })
})

describe('camaraderieInfo', () => {
  test('names what pulls it down and the risk of desertion', () => {
    const calm = camaraderieInfo(at())
    expect(calm).toMatchObject({ tier: 'steady', wagesPerDay: 1, desertRisk: 0 })
    expect(calm.causes).toEqual([])
    const bad = camaraderieInfo(at({ camaraderie: 1, wagesOwed: 4 }))
    expect(bad.tier).toBe('fractured')
    expect(bad.desertRisk).toBe(DESERT_CHANCE)
    expect(bad.causes.length).toBeGreaterThanOrEqual(2)
  })
})
