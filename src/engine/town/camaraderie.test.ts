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
  CAMARADERIE_LEAVE_DAYS,
  CAMARADERIE_PARTING,
} from '../constants'
import { DISBANDED_LINE, runEnding } from '../crisis/ending'
import { roundOption } from './services'
import {
  LOW_BELOW,
  camaraderieInfo,
  camaraderieTier,
  keepLowSpell,
  mournTheDead,
} from './camaraderie'

const content = fixtureContent()
const HERE = 'greenvale-1'
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
      level: 1,
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
    const s = at({ camaraderie: 55, goods: { food: 0, water: 8 } })
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
    expect(roundOption(at({ gold: 0 })).reason).toMatch(/gold/)
  })
})

describe('the low spell (Plan 6 wave 2b)', () => {
  const party = [brom, lyra, hired('h1'), hired('h2')]
  const low = (overrides: Partial<GameState> = {}) =>
    at({ party, camaraderie: LOW_BELOW - 10, day: 10, ...overrides })

  test('starts below Fractured, and ends above it', () => {
    const started = keepLowSpell(low())
    expect(started.lowSpell).toEqual({ since: 10, losses: 0 })
    expect(keepLowSpell({ ...started, day: 15 }).lowSpell).toEqual(started.lowSpell)
    expect(keepLowSpell({ ...started, camaraderie: LOW_BELOW }).lowSpell).toBeNull()
  })

  test('each full week a hired member leaves (seeded), and the rest gain the parting', () => {
    const spell = { since: 10, losses: 0 }
    const before = low({ lowSpell: spell, day: 10 + CAMARADERIE_LEAVE_DAYS - 1 })
    expect(keepLowSpell(before).party).toHaveLength(party.length)
    const week = { ...before, day: 10 + CAMARADERIE_LEAVE_DAYS }
    const after = keepLowSpell(week)
    expect(keepLowSpell(week)).toEqual(after)
    expect(after.party).toHaveLength(party.length - 1)
    expect(after.party.map((c) => c.id)).toEqual(expect.arrayContaining([brom.id, lyra.id]))
    expect(after.camaraderie).toBe(week.camaraderie + CAMARADERIE_PARTING)
    expect(after.lowSpell).toEqual({ since: 10, losses: 1 })
    expect(after.log.at(-1)!.text).toMatch(/leaves the party/)
    // Two weeks at once: two leave.
    expect(keepLowSpell({ ...week, day: 10 + 2 * CAMARADERIE_LEAVE_DAYS }).party).toHaveLength(2)
  })

  test('with no one hired a founder leaves, but never the last living member', () => {
    const s = low({ party: [brom, lyra], lowSpell: { since: 1, losses: 0 }, day: 30 })
    const after = keepLowSpell(s)
    expect(after.party).toHaveLength(1)
    expect(after.lowSpell!.losses).toBeGreaterThanOrEqual(2)
  })

  test('a loss that falls due mid-encounter waits for its end', () => {
    const s = low({ lowSpell: { since: 1, losses: 0 }, encounter: makeEncounter() })
    expect(keepLowSpell(s).party).toHaveLength(party.length)
  })

  test('a step on a long enough spell loses a member (state.ts)', () => {
    const s = low({ lowSpell: { since: 1, losses: 0 }, day: CAMARADERIE_LEAVE_DAYS })
    const after = act(s, { type: 'rest', lodging: 'common' })
    expect(after.party.length).toBeLessThan(s.party.length)
  })

  test('dismissing a living member lifts the rest; laying the dead to rest does not', () => {
    const dead = { ...hired('h2'), exhaustion: 6 }
    const s = at({ party: [brom, lyra, hired('h1'), dead], camaraderie: 40 })
    expect(act(s, { type: 'dismissMember', characterId: 'h1' }).camaraderie).toBe(
      40 + CAMARADERIE_PARTING
    )
    expect(act(s, { type: 'dismissMember', characterId: 'h2' }).camaraderie).toBe(40)
  })
})

describe('disbanded (Plan 6 wave 2b)', () => {
  test('camaraderie 0 ends the run: logged once, and nothing more happens', () => {
    const quarrel = SituationSchema.parse({
      id: 'test-quarrel',
      title: 'Quarrel',
      stages: {
        start: {
          text: 'Words are said.',
          options: [
            {
              id: 'part',
              label: 'Say worse',
              kind: 'fixed',
              outcome: {
                text: 'It ends badly.',
                effects: [{ effect: 'camaraderie', amount: -99 }],
              },
            },
          ],
        },
      },
    })
    const s = at({ encounter: makeEncounter({ situation: quarrel }) })
    const broken = act(s, { type: 'chooseOption', optionId: 'part' })
    expect(broken.camaraderie).toBe(0)
    expect(runEnding(broken)).toBe('disbanded')
    expect(broken.log.at(-1)).toMatchObject({ text: DISBANDED_LINE, tone: 'crit' })
    expect(act(broken, { type: 'rest', lodging: 'common' })).toBe(broken)
  })
})

describe('camaraderieInfo', () => {
  test('names what pulls it down, and the low spell for the tooltip', () => {
    const calm = camaraderieInfo(at())
    expect(calm).toMatchObject({ tier: 'steady', nextLoss: null, weeksBelow: 0, disbandAt: 0 })
    expect(calm.causes).toEqual([])
    const bad = camaraderieInfo(at({ camaraderie: 1, goods: { food: 0, water: 8 } }))
    expect(bad.tier).toBe('fractured')
    expect(bad.causes.length).toBeGreaterThanOrEqual(1)
    // The preview's next loss day is the day the step loses a member.
    const spell = at({ camaraderie: 10, day: 12, lowSpell: { since: 3, losses: 0 } })
    const info = camaraderieInfo(spell)
    expect(info.weeksBelow).toBe(1)
    expect(keepLowSpell({ ...spell, day: info.nextLoss! - 1 }).party).toHaveLength(3)
    expect(keepLowSpell({ ...spell, day: info.nextLoss! }).party).toHaveLength(2)
    expect(info.critCost).toBeGreaterThan(info.failCost)
  })
})
