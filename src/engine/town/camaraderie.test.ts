import { describe, expect, test } from 'vitest'
import { EffectSchema, SituationSchema } from '../../schema/encounter'
import type { Character, ContractState, GameState } from '../../schema/state'
import { CAMARADERIE_MAX } from '../../schema/types'
import { applyEffects } from '../encounters/effects'
import { encounterOptions } from '../encounters/preview'
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
import {
  CAMARADERIE_BOND,
  CAMARADERIE_DEATH,
  CAMARADERIE_HUNGER,
  DESERT_CHANCE,
} from '../constants'
import { roundOption } from './services'
import { camaraderieInfo, camaraderieTier, desertOnArrival, mournTheDead } from './camaraderie'

const content = fixtureContent()
const HERE = 'greenvale-1'
const ROAD = 'greenvale-1-greenvale-2'
const act = (s: GameState, a: Action) => step(s, a, content)

const hired = (id: string): Character => makeCharacter({ id, name: `Hireling ${id}`, hired: true })

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
/** A day passes in town on the party's own food (spoilage and upkeep follow). */
const aDay = (s: GameState) => passDay(s, null, 'steady', content)

describe('no wages (Plan 6)', () => {
  test('a day costs hired members nothing, and dismissal is free', () => {
    const s = at({ party: [brom, lyra, hired('h1'), hired('h2')] })
    expect(aDay(s).gold).toBe(s.gold)
    expect(aDay(s).camaraderie).toBe(s.camaraderie)
    const left = act(s, { type: 'dismissMember', characterId: 'h1' })
    expect(left.gold).toBe(s.gold)
    expect(left.party.map((c) => c.id)).toEqual([brom.id, lyra.id, 'h2'])
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
    expect(once.camaraderie).toBe(s.camaraderie + CAMARADERIE_BOND)
    expect(act(once, { type: 'rest', lodging: 'private' }).camaraderie).toBe(once.camaraderie)
    expect(act(s, { type: 'rest', lodging: 'common' }).camaraderie).toBe(s.camaraderie)
  })

  test(`the encounter effect changes it, within 0–${CAMARADERIE_MAX}`, () => {
    const effect = (amount: number) => [EffectSchema.parse({ effect: 'camaraderie', amount })]
    const s = at({ encounter: makeEncounter() })
    expect(applyEffects(s, effect(-99)).camaraderie).toBe(0)
    expect(applyEffects(s, effect(99)).camaraderie).toBe(CAMARADERIE_MAX)
    expect(applyEffects(s, effect(1)).camaraderie).toBe(s.camaraderie + 1)
  })

  test('crossing a tier is logged', () => {
    const s = at({ camaraderie: 20, goods: { food: 0, water: 8 } })
    const after = aDay(s)
    expect(camaraderieTier(after.camaraderie)).not.toBe(camaraderieTier(s.camaraderie))
    expect(after.log.some((l) => /strained/i.test(l.text))).toBe(true)
  })
})

describe('setbacks scale with the party, gains are flat (Plan 6)', () => {
  /** A hostile road encounter: a hard climb (DC 25) and a fixed retreat. */
  const encounter = makeEncounter({
    situation: SituationSchema.parse({
      id: 'test-ambush',
      title: 'Ambush',
      disposition: 'hostile',
      stages: {
        start: {
          text: 'Arrows from the rocks.',
          options: [
            {
              id: 'climb',
              label: 'Climb to them',
              kind: 'check',
              check: { skill: 'athletics', dc: 25 },
              outcomes: {
                fail: { text: 'You slip.' },
                partial: { text: 'Halfway.' },
                success: { text: 'You reach them.' },
              },
            },
            {
              id: 'run',
              label: 'Run',
              kind: 'fixed',
              tags: ['retreat'],
              outcome: { text: 'You run.' },
            },
          ],
        },
      },
    }),
  })
  const party = (n: number) => [brom, lyra, hired('h1'), hired('h2'), hired('h3')].slice(0, n)
  const inAmbush = (n: number, seed = 1) => at({ party: party(n), encounter, rng: createRng(seed) })
  /** The first seed whose climb rolls this tier, and what it did to camaraderie. */
  function climb(n: number, tier: 'fail' | 'critFail') {
    for (let seed = 1; seed < 500; seed++) {
      const s = inAmbush(n, seed)
      const after = act(s, { type: 'chooseOption', optionId: 'climb' })
      if (after.lastRoll?.tier === tier) return { s, loss: s.camaraderie - after.camaraderie }
    }
    throw new Error(`no seed rolls ${tier}`)
  }

  test('a failed check costs more in a bigger party, a critical failure more still', () => {
    const pair = climb(2, 'fail').loss
    const five = climb(5, 'fail').loss
    expect(pair).toBeGreaterThan(0)
    expect(five).toBeGreaterThan(pair)
    expect(climb(5, 'critFail').loss).toBeGreaterThan(five)
    // Alone, no one is there to blame.
    expect(climb(1, 'fail').loss).toBe(0)
  })

  test('the preview shows the cost the failure takes, and fleeing costs more in a bigger party', () => {
    const { s, loss } = climb(4, 'fail')
    const fail = encounterOptions(s)[0].outcomes.find((o) => o.tier === 'fail')!
    expect(!fail.hidden && fail.effects).toContain(`−${loss} camaraderie`)
    const fled = (n: number) => {
      const before = inAmbush(n)
      const after = act(before, { type: 'chooseOption', optionId: 'run' })
      const shown = encounterOptions(before)[1].outcomes[0]
      expect(!shown.hidden && shown.effects).toContain(
        `−${before.camaraderie - after.camaraderie} camaraderie`
      )
      return before.camaraderie - after.camaraderie
    }
    expect(fled(5)).toBeGreaterThan(fled(2))
    expect(fled(2)).toBeGreaterThan(0)
  })

  test("gains don't depend on the party's size", () => {
    const gain = (n: number, a: Action) => {
      const s = at({ party: party(n), camaraderie: 10, gold: 500 })
      return act(s, a).camaraderie - s.camaraderie
    }
    const room: Action = { type: 'rest', lodging: 'private' }
    const round: Action = { type: 'useService', service: 'inn-tavern', action: 'round' }
    expect(gain(2, room)).toBeGreaterThan(0)
    expect(gain(5, room)).toBe(gain(2, room))
    expect(gain(2, round)).toBeGreaterThan(0)
    expect(gain(5, round)).toBe(gain(2, round))
  })

  test('standing a round: the preview is what it does, once per arrival, refused when broke', () => {
    const s = at({ camaraderie: 12 })
    const preview = roundOption(s)
    const after = act(s, { type: 'useService', service: 'inn-tavern', action: 'round' })
    expect(preview.available).toBe(true)
    expect(after.gold).toBe(s.gold - preview.cost)
    expect(after.camaraderie).toBe(s.camaraderie + preview.camaraderie)
    // A bigger party pays more for it.
    expect(roundOption(at({ party: party(5) })).cost).toBeGreaterThan(preview.cost)
    expect(roundOption(after).available).toBe(false)
    const again = act(after, { type: 'useService', service: 'inn-tavern', action: 'round' })
    expect([again.gold, again.camaraderie]).toEqual([after.gold, after.camaraderie])
    expect(roundOption(at({ gold: 0 })).reason).toMatch(/costs/)
  })
})

describe('desertion', () => {
  const party = [brom, lyra, hired('h1'), hired('h2'), hired('h3'), hired('h4')]

  test('a fractured party loses some hired members on arrival, never a founder', () => {
    let left = 0
    const seeds = 50
    for (let seed = 1; seed <= seeds; seed++) {
      const s = at({ party, camaraderie: 1, rng: createRng(seed) })
      const after = desertOnArrival(s)
      expect(desertOnArrival(s)).toEqual(after)
      const ids = after.party.map((c) => c.id)
      expect(ids).toEqual(expect.arrayContaining([brom.id, lyra.id]))
      left += party.length - after.party.length
    }
    const share = left / (seeds * 4)
    expect(share).toBeGreaterThan(DESERT_CHANCE / 2)
    expect(share).toBeLessThan(DESERT_CHANCE * 2)
    // Only a fractured party loses anyone.
    expect(desertOnArrival(at({ party, camaraderie: 10 })).party).toHaveLength(party.length)
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
    expect(calm).toMatchObject({ tier: 'steady', desertRisk: 0 })
    expect(calm.causes).toEqual([])
    const bad = camaraderieInfo(at({ camaraderie: 1, goods: { food: 0, water: 8 } }))
    expect(bad.tier).toBe('fractured')
    expect(bad.desertRisk).toBe(DESERT_CHANCE)
    expect(bad.causes.length).toBeGreaterThanOrEqual(2)
  })
})
