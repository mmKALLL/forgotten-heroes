import { describe, expect, test } from 'vitest'
import { SituationSchema } from '../../schema/encounter'
import type { GameState, TravelState } from '../../schema/state'
import type { Pace } from '../../schema/types'
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
import {
  buyWaterskin,
  dailyNeed,
  journeySupplies,
  maxWaterskins,
  partyWaterCapacity,
  passDay,
  rest,
  restOption,
  runsShort,
  sellWaterskin,
  waterCapacity,
} from './supplies'
import { buyGoods, sellGoods } from '../economy/trade'
import { load } from '../economy/capacity'
import { step } from '../state'
import {
  CAMP_HEAL,
  FORCED_MARCH_DC,
  LODGING_PRICE,
  OVERLOAD_RATIO,
  WATERSKIN_PRICE,
  WATERSKIN_SELL_PRICE,
  WATERSKIN_WATER,
  WATER_DAYS,
} from '../constants'

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
  paceLog: [],
  forage: true,
  hired: null,
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

  test('a stack gained today survives the night and fades the next day', () => {
    const today = base().day
    const strained = base({
      party: [{ ...brom, strain: { athletics: 1, stealth: 1 } }, lyra],
      skillUses: [0, 1, 2].map(() => ({
        day: today,
        characterId: 'brom',
        skill: 'athletics' as const,
      })),
    })
    const night = passDay(strained, 'plains')
    expect(night.party[0].strain).toEqual({ athletics: 1 })
    expect(passDay(night, 'plains').party[0].strain).toEqual({})
    // The same at an inn.
    const inn = rest(strained, content, true)
    expect(inn.party[0].strain).toEqual({ athletics: 1 })
    expect(rest(inn, content, true).party[0].strain).toEqual({})
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
  test('stealthy, steady and brisk days use the same daily ration, with no extra checks', () => {
    for (const pace of ['stealthy', 'steady', 'brisk'] as const) {
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

  test('supplies per km: stealthy worst, then forced, steady, and brisk best', () => {
    const route = { km: 300, terrain: 'plains' as const }
    const by = (pace: Pace) => journeySupplies(route, 2, pace)
    expect(by('steady')).toEqual({ days: 10, food: 20, water: 20 })
    expect(by('brisk')).toEqual({ days: 8, food: 16, water: 16 })
    expect(by('forced')).toEqual({ days: 7, food: 21, water: 21 })
    expect(by('stealthy')).toEqual({ days: 20, food: 40, water: 40 })
    expect(journeySupplies({ km: 100, terrain: 'desert' }, 1, 'steady')).toEqual({
      days: 5,
      food: 5,
      water: 10,
    })
  })
})

describe('rest', () => {
  test('a day at an inn heals fully, eases exhaustion, refills the water and feeds the party', () => {
    // ashmoor-1 has an inn (greenvale-2 has none).
    const tired = base({
      location: 'ashmoor-1',
      gold: 5,
      goods: { food: 10, water: 2 },
      party: [{ ...brom, hp: 3, exhaustion: 2, strain: { survival: 1 } }, lyra],
    })
    const after = rest(tired, content)
    expect(after.day).toBe(2)
    expect(after.gold).toBe(5 - 2 * LODGING_PRICE)
    expect(after.party[0]).toMatchObject({ hp: 20, exhaustion: 1, strain: {} })
    expect(after.goods).toEqual({ food: 10, water: 8 })
    expect(after.log.at(-1)!.text).toBe(
      `The party rests a day at an inn in ${settlementName(after, 'ashmoor-1')}: 2 gp, meals included.`
    )
    expect(restOption(tired, content)).toMatchObject({
      inTown: true,
      lodgingCost: 2,
      lodging: true,
      room: 'common',
    })
  })

  test('a party that can’t pay for lodging, or won’t, rests in town on its own food', () => {
    const broke = base({ location: 'ashmoor-1', gold: 1, party: [{ ...brom, hp: 3 }, lyra] })
    expect(restOption(broke, content)).toMatchObject({
      inTown: true,
      lodgingCost: 2,
      lodging: false,
    })
    const after = rest(broke, content)
    expect(after.gold).toBe(1)
    expect(after.party[0].hp).toBe(20)
    expect(after.goods).toEqual({ food: 8, water: 8 })
    expect(after.log.at(-1)!.text).toBe(
      `The party rests a day in ${settlementName(after, 'ashmoor-1')}, eating its own food.`
    )
    // Without an inn the party always eats its own food.
    expect(rest(base({ gold: 20 }), content)).toMatchObject({ gold: 20, goods: { food: 8 } })
    expect(rest(base({ gold: 20 }), content, false)).toMatchObject({
      gold: 20,
      goods: { food: 8 },
    })
  })

  test('a day in camp heals CAMP_HEAL of max HP and stays on the road', () => {
    const camp = base({ location: null, travel: onTheRoad, party: [{ ...brom, hp: 0 }, lyra] })
    expect(restOption(camp, content)).toMatchObject({
      inTown: false,
      lodgingCost: 0,
      lodging: false,
    })
    const after = rest(camp, content)
    expect(after.gold).toBe(camp.gold)
    expect(after.party[0].hp).toBe(Math.floor(brom.maxHp * CAMP_HEAL))
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

describe('buying food (at the market)', () => {
  test('rations cost what the market asks, and the party gets them', () => {
    const after = buyGoods(base({ gold: 20, goods: { food: 0, water: 0 } }), content, 'food', 5)
    expect(after.gold).toBeLessThan(20)
    expect(after.goods.food).toBe(5)
  })

  test('buys what the gold allows, and nothing on the road', () => {
    const few = buyGoods(base({ gold: 3 }), content, 'food', 50)
    expect(few.goods.food).toBeGreaterThan(10)
    expect(few.goods.food).toBeLessThan(60)
    expect(few.gold).toBeGreaterThanOrEqual(0)
    expect(buyGoods(base({ gold: 0 }), content, 'food', 5).goods.food).toBe(10)
    const road = base({ location: null, travel: onTheRoad })
    expect(buyGoods(road, content, 'food', 5).log.at(-1)!.text).toBe(
      'Goods can only be bought in a settlement.'
    )
  })
})

describe('waterskins', () => {
  test('each member carries WATER_DAYS of water; each extra waterskin adds WATERSKIN_WATER', () => {
    expect(WATER_DAYS).toBe(4)
    expect(waterCapacity(2)).toBe(8)
    expect(waterCapacity(2, 3)).toBe(8 + 3 * WATERSKIN_WATER)
    expect(partyWaterCapacity(base({ waterskins: 1 }))).toBe(10)
  })

  test('are bought in a settlement, as many as the gold allows, and filled', () => {
    const gold = 2 * WATERSKIN_PRICE + 1
    const after = buyWaterskin(base({ gold, goods: { food: 10, water: 3 } }), content, 4)
    expect(after).toMatchObject({ gold: 1, waterskins: 2 })
    expect(after.goods).toEqual({ food: 10, water: 8 + 2 * WATERSKIN_WATER })
    expect(after.log.at(-1)!.text).toBe(
      `Bought 2 waterskins for ${2 * WATERSKIN_PRICE} gp and filled them.`
    )
    expect(buyWaterskin(base({ gold: WATERSKIN_PRICE - 1 }), content).log.at(-1)!.text).toBe(
      `Waterskins cost ${WATERSKIN_PRICE} gp each.`
    )
    expect(
      buyWaterskin(base({ location: null, travel: onTheRoad }), content).log.at(-1)!.text
    ).toBe('Waterskins can only be bought in a settlement.')
  })

  test('maxWaterskins stops where their water would overload the party; buying past it is refused', () => {
    // Nearly overloaded with food: room for the water of two more skins, and no more.
    const s = base({ gold: 500 })
    const room = (x: GameState) => {
      const l = load(x, content)
      return l.capacity * OVERLOAD_RATIO - l.weight
    }
    const kgPerSkin = WATERSKIN_WATER * 2
    const food = Math.floor(room(s)) - 2 * kgPerSkin - 1 + 10
    const heavy = base({ gold: 500, goods: { food, water: 8 } })
    expect(maxWaterskins(heavy, content, 5)).toEqual({ units: 2, limit: 'weight' })
    expect(maxWaterskins(heavy, content, 1)).toEqual({ units: 1, limit: null })
    expect(maxWaterskins(base({ gold: WATERSKIN_PRICE + 1 }), content, 5)).toEqual({
      units: 1,
      limit: 'gold',
    })
    const bought = buyWaterskin(heavy, content, 5)
    expect(bought.waterskins).toBe(2)
    // Already encumbered: the new skins aren't filled by themselves.
    expect(bought.goods.water).toBe(8)
    expect(buyWaterskin(bought, content, 5).log.at(-1)!.text).toMatch(/^Too heavy/)
  })

  test('water refills by itself wherever it is free, up to what keeps the party light', () => {
    // Arriving with a little water and many spare skins: filled until one more would encumber.
    const arriving = base({
      location: null,
      travel: { ...onTheRoad, kmDone: 60, daysDone: 2, forage: false },
      waterskins: 30,
      goods: { food: 10, water: 2 },
    })
    const arrived = step(arriving, { type: 'continueJourney' }, content)
    expect(arrived.location).toBe('greenvale-2')
    const water = arrived.goods.water!
    expect(water).toBeGreaterThan(waterCapacity(2))
    expect(water).toBeLessThan(partyWaterCapacity(arrived))
    expect(load(arrived, content).level).toBe('light')
    const more = { ...arrived, goods: { ...arrived.goods, water: water + 1 } }
    expect(load(more, content).level).not.toBe('light')
    // Setting out tops the skins up too.
    const home = base({ location: 'greenvale-1', goods: { food: 10, water: 1 } })
    const out = step(home, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
    expect(out.goods.water).toBe(waterCapacity(2))
  })

  test('the extra water lasts the road and is refilled on arrival', () => {
    const roomy = base({ waterskins: 2, goods: { food: 10, water: 12 } })
    expect(passDay(roomy, 'plains').goods.water).toBe(10)
    expect(rest(base({ waterskins: 2, goods: { water: 0 } }), content).goods.water).toBe(12)
  })
})

describe('selling food and waterskins', () => {
  test('food sells at the market, waterskins for WATERSKIN_SELL_PRICE', () => {
    const state = base({ gold: 0, waterskins: 2, goods: { food: 10, water: 12 } })
    const fed = sellGoods(state, content, 'food', 4)
    expect(fed.goods.food).toBe(6)
    expect(fed.gold).toBeGreaterThanOrEqual(0)
    const after = sellWaterskin(state, 1)
    expect(after).toMatchObject({
      gold: WATERSKIN_SELL_PRICE,
      waterskins: 1,
      goods: { food: 10, water: 10 },
    })
    expect(after.log.at(-1)!.text).toBe(`Sold 1 waterskin for ${WATERSKIN_SELL_PRICE} gp.`)
  })

  test('sells no more than the party has, and only in a settlement', () => {
    expect(sellGoods(base({ gold: 0 }), content, 'food', 99).goods.food).toBe(0)
    expect(sellWaterskin(base({ gold: 0, waterskins: 1 }), 5)).toMatchObject({ waterskins: 0 })
    expect(sellWaterskin(base()).log.at(-1)!.text).toBe('There is no waterskin to sell.')
    expect(
      sellGoods(base({ location: null, travel: onTheRoad }), content, 'food', 1).log.at(-1)!.text
    ).toBe('Goods can only be sold in a settlement.')
  })
})
