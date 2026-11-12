import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { step, type Action } from '../state'
import { brom, fixtureContent, lyra, makeCharacter, makeState } from '../test-fixtures'
import { levelFor } from '../rules/progression'
import { PARTY_CAP, STARTING_FOOD_DAYS, XP_BY_LEVEL } from '../constants'
import { serviceRows } from './services'
import { recruitOffers, type RecruitOffer } from './recruits'

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

  test("are never above the party's highest level + 1, and their XP matches their level", () => {
    const novices = overWeeks(at())
    expect(Math.max(...novices.map((o) => o.level))).toBe(2)
    const veterans = overWeeks(at({ party: [brom, { ...lyra, level: 5, xp: XP_BY_LEVEL[4] }] }))
    expect(Math.max(...veterans.map((o) => o.level))).toBeGreaterThan(2)
    for (const o of [...novices, ...veterans]) {
      expect(o.character.level).toBe(o.level)
      expect(levelFor(o.character.xp)).toBe(o.level)
      expect(o.character.wage).toBe(o.wage)
    }
  })

  test('a higher level costs more to hire and to keep', () => {
    const all = overWeeks(at({ party: [{ ...brom, level: 5, xp: XP_BY_LEVEL[4] }, lyra] }))
    const one = all.find((o) => o.level === 1)!
    const three = all.find((o) => o.level === 3)!
    expect(three.fee).toBeGreaterThan(one.fee)
    expect(three.wage).toBeGreaterThan(one.wage)
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

describe('hiring and dismissing', () => {
  test('hiring pays the fee and adds the member with their wage and food; the offer is gone', () => {
    const s = at()
    const offer = offers(s)[0]
    const next = act(s, { type: 'hireRecruit', offerId: offer.id })
    expect(next.gold).toBe(s.gold - offer.fee)
    expect(next.party).toHaveLength(3)
    expect(next.party[2]).toEqual(offer.character)
    expect(next.party[2].wage).toBeGreaterThan(0)
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

  test('founders cannot be dismissed; a hired member can, and owed wages stay owed', () => {
    const s = at({ wagesOwed: 3 })
    expect(act(s, { type: 'dismissMember', characterId: brom.id }).party).toHaveLength(2)
    const hired = act(s, { type: 'hireRecruit', offerId: offers(s)[0].id })
    const recruit = hired.party[2]
    const left = act(hired, { type: 'dismissMember', characterId: recruit.id })
    expect(left.party.map((c) => c.id)).toEqual([brom.id, lyra.id])
    expect(left.wagesOwed).toBe(3)
  })
})
