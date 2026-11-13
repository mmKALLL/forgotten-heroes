import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { step, type Action } from '../state'
import { brom, fixtureContent, lyra, makeCharacter, makeState } from '../test-fixtures'
import { levelFor } from '../rules/progression'
import { ABILITIES } from '../rules/abilities'
import { PARTY_CAP, RECRUIT_SIGNON, STARTING_FOOD_DAYS, XP_BY_LEVEL } from '../constants'
import { serviceRows } from './services'
import { gearPrice, recruitOffers, signOnFee, type RecruitOffer } from './recruits'

const content = fixtureContent()
const HERE = 'greenvale-1'

/** At a settlement with an inn (which hires out in the fixture) everywhere, with gold and food. */
function at(overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location: HERE, day: 1, gold: 200, goods: { food: 10, water: 8 } })
  const settlements = { ...s.world.settlements }
  for (const id of Object.keys(settlements)) {
    const services = [...new Set([...settlements[id].services, 'inn-tavern'])]
    settlements[id] = { ...settlements[id], services }
  }
  return { ...s, world: { ...s.world, settlements }, ...overrides }
}
const act = (s: GameState, a: Action) => step(s, a, content)
const offers = (s: GameState) => recruitOffers(s, content, HERE)
/** Every offer over many weeks, for statistics. */
const overWeeks = (s: GameState, weeks = 30): RecruitOffer[] =>
  Array.from({ length: weeks }, (_, w) => offers({ ...s, day: w * 7 + 1 })).flat()
const members = (n: number) =>
  Array.from({ length: n }, (_, i) => makeCharacter({ id: `m${i}`, name: `M${i}` }))

describe('recruit offers', () => {
  test('are fixed within a week and change with the next', () => {
    const s = at()
    const week0 = offers(s)
    expect(week0.length).toBeGreaterThan(0)
    expect(offers({ ...s, day: 7 })).toEqual(week0)
    const names = (o: RecruitOffer[]) => o.map((r) => r.character.name + r.character.classId)
    const later = [8, 15, 22, 29].map((day) => names(offers({ ...s, day })))
    expect(later.some((n) => JSON.stringify(n) !== JSON.stringify(names(week0)))).toBe(true)
  })

  test("are never above the founders' highest level + 1, and their XP matches their level", () => {
    const novices = overWeeks(at())
    expect(Math.max(...novices.map((o) => o.level))).toBe(2)
    const veterans = overWeeks(at({ party: [brom, { ...lyra, level: 5, xp: XP_BY_LEVEL[4] }] }))
    expect(Math.max(...veterans.map((o) => o.level))).toBeGreaterThan(2)
    for (const o of [...novices, ...veterans]) {
      expect(o.character.level).toBe(o.level)
      expect(levelFor(o.character.xp)).toBe(o.level)
      expect(o.character.hired).toBe(true)
    }
  })

  test('an offer keeps its level and fee for the week after another offer is hired', () => {
    // Regression: hiring a level-2 recruit used to raise the other offers' cap the same week.
    let checked = 0
    for (let w = 0; w < 40 && checked < 3; w++) {
      const s = at({ day: w * 7 + 1, gold: 2000 })
      const before = offers(s)
      const pick = before.find((o) => o.level === 2)
      if (!pick || before.length < 2) continue
      const after = offers(act(s, { type: 'hireRecruit', offerId: pick.id }))
      for (const o of after) {
        const was = before.find((b) => b.id === o.id)!
        expect([o.level, o.fee, o.character.name]).toEqual([was.level, was.fee, was.character.name])
      }
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  test('a higher level costs more to sign on', () => {
    const all = overWeeks(at({ party: [{ ...brom, level: 5, xp: XP_BY_LEVEL[4] }, lyra] }))
    const one = all.find((o) => o.level === 1)!
    const three = all.find((o) => o.level === 3)!
    expect(three.fee).toBeGreaterThan(one.fee)
  })

  test('the inn lists its recruit action, refused when the purse is empty', () => {
    const row = (s: GameState) =>
      serviceRows(s, content)
        .find((r) => r.service === 'inn-tavern')!
        .actions.find((a) => a.action === 'recruit')!
    expect(row(at()).available).toBe(true)
    const broke = at({ gold: 0 })
    expect(row(broke).available).toBe(false)
    expect(offers(broke).every((o) => !o.available && o.reason)).toBe(true)
  })
})

describe('sign-on fees and rolled recruits (Plan 6)', () => {
  test("the fee lies within its level's range; better stats never cost less; a wound lowers it", () => {
    for (let level = 1; level <= RECRUIT_SIGNON.length; level++) {
      const [low, high] = RECRUIT_SIGNON[level - 1]
      let last = 0
      for (let total = 18; total <= 108; total++) {
        const fee = signOnFee({ level, total, wounded: false })
        expect(fee).toBeGreaterThanOrEqual(Math.max(low, last))
        expect(fee).toBeLessThanOrEqual(high)
        expect(signOnFee({ level, total, wounded: true })).toBeLessThanOrEqual(fee)
        last = fee
      }
      const typical = { level, total: 63 }
      expect(signOnFee({ ...typical, wounded: true })).toBeLessThan(
        signOnFee({ ...typical, wounded: false })
      )
    }
  })

  test('offers roll 3d6, some carry an old wound, and some bring gear priced into the fee', () => {
    const all = overWeeks(at(), 60)
    const novices = all.filter((o) => o.level === 1)
    for (const o of novices) {
      for (const a of ABILITIES) expect(o.character.abilities[a]).toBeLessThanOrEqual(18)
      expect(o.character.abilities.str).toBeGreaterThanOrEqual(3)
      const [low, high] = RECRUIT_SIGNON[0]
      expect(o.fee - o.gearPrice).toBeGreaterThanOrEqual(low)
      expect(o.fee - o.gearPrice).toBeLessThanOrEqual(high)
    }
    const wounded = all.filter((o) => o.character.oldWound !== null)
    expect(wounded.length / all.length).toBeGreaterThan(0.05)
    expect(wounded.length / all.length).toBeLessThan(0.4)
    expect(wounded.every((o) => o.wound !== null && /−2 [A-Z]{3}\)$/.test(o.wound))).toBe(true)
    const geared = all.filter((o) => o.gear !== null)
    expect(geared.length).toBeGreaterThan(0)
    for (const o of geared) {
      expect(o.character.accessory).toEqual(o.gear)
      expect(o.gearPrice).toBe(gearPrice(o.gear!))
    }
    expect(all.filter((o) => o.gear === null).every((o) => o.gearPrice === 0)).toBe(true)
    // The best rolls usually go to the class's key abilities: a fighter's STR beats its CHA.
    const fighters = all.filter((o) => o.character.classId === 'fighter' && o.level === 1)
    const strong = fighters.filter((o) => o.character.abilities.str > o.character.abilities.cha)
    expect(strong.length / fighters.length).toBeGreaterThan(0.7)
  })
})

describe('hiring and dismissing', () => {
  test('hiring pays the fee and adds the member, hired, with their food; the offer is gone', () => {
    const s = at()
    const offer = offers(s)[0]
    const next = act(s, { type: 'hireRecruit', offerId: offer.id })
    expect(next.gold).toBe(s.gold - offer.fee)
    expect(next.party).toHaveLength(3)
    expect(next.party[2]).toEqual(offer.character)
    expect(next.party[2].hired).toBe(true)
    expect(next.goods.food).toBe(10 + STARTING_FOOD_DAYS)
    expect(offers(next).map((o) => o.id)).not.toContain(offer.id)
    expect(next.log.at(-1)!.text).toContain(offer.character.name)
  })

  test(`the party holds at most ${PARTY_CAP} living members; the dead don't count`, () => {
    const full = at({ party: members(PARTY_CAP) })
    const offer = offers(full)[0]
    expect(offer.available).toBe(false)
    expect(act(full, { type: 'hireRecruit', offerId: offer.id }).party).toHaveLength(PARTY_CAP)
    const mourning = members(PARTY_CAP)
    mourning[0] = { ...mourning[0], exhaustion: 6 }
    const withDead = at({ party: mourning })
    const hired = act(withDead, { type: 'hireRecruit', offerId: offers(withDead)[0].id })
    expect(hired.party).toHaveLength(PARTY_CAP + 1)
  })

  test('founders cannot be dismissed; a hired member can, for nothing', () => {
    const s = at()
    expect(act(s, { type: 'dismissMember', characterId: brom.id }).party).toHaveLength(2)
    const hired = act(s, { type: 'hireRecruit', offerId: offers(s)[0].id })
    const recruit = hired.party[2]
    const left = act(hired, { type: 'dismissMember', characterId: recruit.id })
    expect(left.party.map((c) => c.id)).toEqual([brom.id, lyra.id])
    expect(left.gold).toBe(hired.gold)
  })
})
