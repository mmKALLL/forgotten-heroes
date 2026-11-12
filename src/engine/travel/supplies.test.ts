import { describe, expect, test } from 'vitest'
import { SituationSchema } from '../../schema/encounter'
import type { GameState, TravelState } from '../../schema/state'
import { createRng } from '../rng'
import {
  brom,
  fixtureContent,
  lyra,
  makeCharacter,
  makeEncounter,
  makeState,
} from '../test-fixtures'
import { settlementName } from '../world/geo'
import { FORCED_MARCH_DC } from './pace'
import { buyFood, dailyNeed, journeySupplies, passDay, rest, runsShort } from './supplies'

const content = fixtureContent()
const base = (overrides: Partial<GameState> = {}): GameState =>
  makeState({ location: 'greenvale-2', goods: { food: 10, water: 8 }, ...overrides })
const onTheRoad: TravelState = {
  route: 'greenvale-1-greenvale-2',
  from: 'greenvale-1',
  to: 'greenvale-2',
  km: 75,
  kmPerDay: 30,
  kmDone: 30,
  daysDone: 1,
  days: 3,
  encounterDays: [],
  pace: 'steady',
  coverTracks: false,
  paceLog: [],
}
const withCon = (id: string, con: number) =>
  makeCharacter({ id, name: id, abilities: { str: 10, dex: 10, con, int: 10, wis: 10, cha: 10 } })

describe('passDay', () => {
  test('each member eats 1 food and drinks 1 water', () => {
    const before = base()
    const after = passDay(before, 'plains')
    expect(after.day).toBe(2)
    expect(after.goods).toEqual({ food: 8, water: 6 })
    expect(after.log).toEqual(before.log)
  })

  test('the desert takes twice the water', () => {
    expect(passDay(base(), 'desert').goods).toEqual({ food: 8, water: 4 })
  })

  test('one stack of each strained skill fades', () => {
    const strained = base({ party: [{ ...brom, strain: { athletics: 2, stealth: 1 } }, lyra] })
    expect(passDay(strained, 'plains').party[0].strain).toEqual({ athletics: 1 })
  })

  test('the party eats in order; whoever goes without rolls CON', () => {
    const after = passDay(base({ goods: { food: 1, water: 8 } }), 'plains')
    expect(after.goods).toEqual({ food: 0, water: 6 })
    expect(after.party[0].exhaustion).toBe(0)
    expect(after.log.at(-1)!.text).toMatch(
      /^Lyra goes without food: CON \d+ [+−]\d+ = -?\d+ vs DC 10, (holds up|gains a level of exhaustion)\.$/
    )
  })

  test('thirst is much harder to endure than hunger', () => {
    let thirsty = 0
    let hungry = 0
    for (let seed = 0; seed < 100; seed++) {
      const weak = base({
        party: [withCon('weak', 3)],
        goods: { food: 5, water: 0 },
        rng: createRng(seed),
      })
      if (passDay(weak, 'plains').party[0].exhaustion > 0) thirsty++
      const tough = base({
        party: [withCon('tough', 30)],
        goods: { food: 0, water: 5 },
        rng: createRng(seed),
      })
      if (passDay(tough, 'plains').party[0].exhaustion > 0) hungry++
    }
    expect(thirsty).toBeGreaterThan(80)
    expect(hungry).toBeLessThan(15)
  })

  test('runsShort sees a shortage coming', () => {
    expect(runsShort(base(), 'plains')).toBe(false)
    expect(runsShort(base({ goods: { food: 1, water: 8 } }), 'plains')).toBe(true)
    expect(runsShort(base({ goods: { food: 8, water: 3 } }), 'desert')).toBe(true)
  })
})

describe('pace and supplies', () => {
  test('cautious, steady and brisk days use the same daily ration, with no extra checks', () => {
    for (const pace of ['cautious', 'steady', 'brisk'] as const) {
      const before = base()
      const after = passDay(before, 'plains', pace)
      expect(after.goods).toEqual({ food: 8, water: 6 })
      expect(after.log).toEqual(before.log)
      expect(after.rng).toEqual(before.rng)
    }
  })

  test('a forced march eats and drinks half as much again', () => {
    expect(dailyNeed(2, 'plains', 'steady')).toEqual({ food: 2, water: 2 })
    expect(dailyNeed(2, 'plains', 'forced')).toEqual({ food: 3, water: 3 })
    expect(dailyNeed(2, 'desert', 'forced')).toEqual({ food: 3, water: 6 })
    expect(passDay(base(), 'plains', 'forced').goods).toEqual({ food: 7, water: 5 })
  })

  test('a forced march short of its extra rations eats what is left, and no one goes without', () => {
    const after = passDay(base({ goods: { food: 2, water: 2 } }), 'plains', 'forced')
    expect(after.goods).toEqual({ food: 0, water: 0 })
    expect(after.log.some((e) => e.text.includes('goes without'))).toBe(false)
  })

  test('each forced-march day, every member rolls CON against exhaustion', () => {
    const after = passDay(base(), 'plains', 'forced')
    const lines = after.log.slice(-2).map((e) => e.text)
    expect(lines[0]).toMatch(
      new RegExp(
        `^Brom pushes on: CON \\d+ [+−]\\d+ = -?\\d+ vs DC ${FORCED_MARCH_DC}, (holds up|gains a level of exhaustion)\\.$`
      )
    )
    expect(lines[1]).toMatch(/^Lyra pushes on: /)
  })

  test('the forced march wears down the weak far more than the tough', () => {
    let weak = 0
    let tough = 0
    for (let seed = 0; seed < 100; seed++) {
      const roll = (con: number) =>
        passDay(base({ party: [withCon('x', con)], rng: createRng(seed) }), 'plains', 'forced')
          .party[0].exhaustion
      if (roll(3) > 0) weak++
      if (roll(30) > 0) tough++
    }
    expect(weak).toBeGreaterThan(55)
    expect(tough).toBeLessThan(15)
  })

  test('supplies per km: cautious worst, then forced, steady, and brisk best', () => {
    const route = { km: 300, terrain: 'plains' as const }
    const by = (pace: 'cautious' | 'steady' | 'brisk' | 'forced', cover = false) =>
      journeySupplies(route, 2, pace, cover)
    expect(by('steady')).toEqual({ days: 10, food: 20, water: 20 })
    expect(by('cautious')).toEqual({ days: 15, food: 30, water: 30 })
    expect(by('brisk')).toEqual({ days: 8, food: 16, water: 16 })
    expect(by('forced')).toEqual({ days: 7, food: 21, water: 21 })
    expect(by('cautious', true)).toEqual({ days: 19, food: 38, water: 38 })
    expect(journeySupplies({ km: 100, terrain: 'desert' }, 1, 'steady', false)).toEqual({
      days: 5,
      food: 5,
      water: 10,
    })
  })
})

describe('rest', () => {
  test('a day in a settlement heals fully, eases exhaustion and refills the water', () => {
    const tired = base({
      goods: { food: 10, water: 2 },
      party: [{ ...brom, hp: 3, exhaustion: 2 }, lyra],
    })
    const after = rest(tired, content)
    expect(after.day).toBe(2)
    expect(after.party[0]).toMatchObject({ hp: 20, exhaustion: 1 })
    expect(after.goods).toEqual({ food: 8, water: 8 })
    expect(after.log.at(-1)!.text).toBe(
      `The party rests a day in ${settlementName(after, 'greenvale-2')}.`
    )
  })

  test('a day in camp heals a quarter of max HP and stays on the road', () => {
    const camp = base({ location: null, travel: onTheRoad, party: [{ ...brom, hp: 0 }, lyra] })
    const after = rest(camp, content)
    expect(after.party[0].hp).toBe(5)
    expect(after.travel).toEqual(onTheRoad)
    expect(after.goods).toEqual({ food: 8, water: 6 })
    expect(after.log.at(-1)!.text).toBe('The party makes camp and rests a day.')
  })

  test('a day in camp is not a forced march, whatever the journey’s pace', () => {
    const camp = base({ location: null, travel: { ...onTheRoad, pace: 'forced' } })
    const after = rest(camp, content)
    expect(after.goods).toEqual({ food: 8, water: 6 })
    expect(after.log.some((e) => e.text.includes('pushes on'))).toBe(false)
  })

  test('no rest in the middle of an encounter', () => {
    const situation = SituationSchema.parse(content.situations.cliff)
    const busy = base({ encounter: makeEncounter({ situation }) })
    expect(rest(busy, content).log.at(-1)!.text).toBe('Finish the current encounter first.')
  })
})

describe('buyFood', () => {
  test('rations cost 1 gp each, and the waterskins are refilled', () => {
    const after = buyFood(base({ gold: 20, goods: { food: 0, water: 0 } }), 5)
    expect(after.gold).toBe(15)
    expect(after.goods).toEqual({ food: 5, water: 8 })
  })

  test('buys what the gold allows, and nothing on the road', () => {
    expect(buyFood(base({ gold: 3 }), 5)).toMatchObject({ gold: 0, goods: { food: 13 } })
    expect(buyFood(base({ gold: 0 }), 5).log.at(-1)!.text).toBe('Rations cost 1 gp each.')
    const road = base({ location: null, travel: onTheRoad })
    expect(buyFood(road, 5).log.at(-1)!.text).toBe('Food can only be bought in a settlement.')
  })
})
