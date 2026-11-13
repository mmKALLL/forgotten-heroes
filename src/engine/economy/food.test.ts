import { describe, expect, test } from 'vitest'
import { buildContent } from '../../content/build'
import type { GameState } from '../../schema/state'
import { fixtureContent, makeState, testEconomy, testWorld } from '../test-fixtures'
import { step, type Action } from '../state'
import { consumeDay, passDay } from '../travel/days'
import { forecastJourney } from '../travel/warnings'
import { spoilingSoon, syncLots } from './food'
import { KM_PER_DAY, SPOIL_SHOW_DAYS } from '../constants'

// The fixture's food keeps forever; here it keeps SHELF days, as the real data's does.
const SHELF = 14
const goods = testEconomy['data/claude/goods.json'] as { entries: { id: string }[] }
const { content, errors } = buildContent({
  ...testWorld,
  'data/claude/goods.json': {
    ...goods,
    entries: goods.entries.map((e) => (e.id === 'food' ? { ...e, shelfDays: SHELF } : e)),
  },
})
const sum = (s: GameState) => s.foodLots.reduce((n, l) => n + l.amount, 0)

describe('food lots', () => {
  test('the test content builds', () => {
    expect(errors).toEqual([])
    expect(fixtureContent().goods.food.shelfDays).toBeUndefined()
  })

  test('new food is a batch dated today; food that goes comes off the oldest first', () => {
    const lots = [
      { day: 1, amount: 3 },
      { day: 4, amount: 2 },
    ]
    expect(syncLots(lots, 5, 6)).toBe(lots)
    expect(syncLots(lots, 9, 6)).toEqual([...lots, { day: 6, amount: 4 }])
    expect(syncLots(lots, 7, 4)).toEqual([lots[0], { day: 4, amount: 4 }])
    expect(syncLots(lots, 1, 6)).toEqual([{ day: 4, amount: 1 }])
    expect(syncLots(lots, 0, 6)).toEqual([])
  })

  test('the party eats the oldest food first, and food got today is a batch of today', () => {
    const state = makeState({
      day: 5,
      goods: { food: 13, water: 8 },
      foodLots: [
        { day: 1, amount: 3 },
        { day: 5, amount: 10 },
      ],
    })
    expect(passDay(state, 'plains', 'steady', content).foodLots).toEqual([
      { day: 1, amount: 1 },
      { day: 5, amount: 10 },
    ])
    // Gathered or foraged today, before the meal: still eaten after the old batch.
    const found = { ...state, goods: { ...state.goods, food: 16 } }
    expect(consumeDay(found, 'plains', 'steady', content).state.foodLots).toEqual([
      { day: 1, amount: 1 },
      { day: 5, amount: 13 },
    ])
  })

  test('a batch keeps its shelf life to the day, then what is left of it spoils at once', () => {
    let state = makeState({ goods: { food: 40, water: 8 } })
    const got = state.day
    // Two members eat 2 a day; the last day of the shelf life is day got + SHELF − 1.
    for (let i = 0; i < SHELF - 1; i++) state = passDay(state, 'plains', 'steady', content)
    expect(state.goods.food).toBe(40 - 2 * (SHELF - 1))
    expect(state.log.some((l) => l.text.includes('spoiled'))).toBe(false)
    state = passDay(state, 'plains', 'steady', content)
    expect(state.day).toBe(got + SHELF)
    expect(state.goods.food).toBe(0)
    expect(state.foodLots).toEqual([])
    expect(state.log.at(-1)!.text).toBe(`${40 - 2 * SHELF} rations of food spoiled.`)
  })

  test('the goods bar is told only of food spoiling within SPOIL_SHOW_DAYS days', () => {
    const at = (day: number) =>
      makeState({
        day,
        goods: { food: 9 },
        foodLots: [
          { day: 1, amount: 3 },
          { day: 3, amount: 4 },
          { day: 3 + SPOIL_SHOW_DAYS, amount: 2 },
        ],
      })
    // The first batch spoils on day 1 + SHELF.
    const first = 1 + SHELF - SPOIL_SHOW_DAYS
    expect(spoilingSoon(at(first - 1), content)).toEqual([])
    expect(spoilingSoon(at(first), content)).toEqual([{ amount: 3, inDays: SPOIL_SHOW_DAYS }])
    expect(spoilingSoon(at(first + 2), content)).toEqual([
      { amount: 3, inDays: SPOIL_SHOW_DAYS - 2 },
      { amount: 4, inDays: SPOIL_SHOW_DAYS },
    ])
    expect(spoilingSoon(at(first), fixtureContent())).toEqual([])
  })

  test('the journey forecast counts food that spoils before it is eaten, as the road does', () => {
    // Day 20: 5 rations from day 8 (spoil on day 8 + SHELF = 22) and 3 fresh; 2 eat 2 a day.
    const state = makeState({
      day: 20,
      goods: { food: 8, water: 8 },
      foodLots: [
        { day: 8, amount: 5 },
        { day: 20, amount: 3 },
      ],
    })
    const road = { km: 4 * KM_PER_DAY.plains, terrain: 'plains' as const }
    const forecast = forecastJourney(state, road, 'steady', false, { content })
    expect(forecast.days).toBe(4)
    // 8 rations would last 4 days; 1 spoils on the way, so day 4 is short.
    expect(forecast.food).toMatchObject({ spoiled: 1, runsOutOnDay: 4, shortfallDays: 1 })
    expect(forecastJourney(state, road, 'steady', false).food.runsOutOnDay).toBeNull()

    let walked = state
    const unfedOn: number[] = []
    for (let day = 1; day <= forecast.days; day++) {
      const out = consumeDay(walked, 'plains', 'steady', content)
      if (out.unfed.length > 0) unfedOn.push(day)
      walked = out.state
    }
    expect(unfedOn).toEqual([4])
    expect(walked.log.filter((l) => l.text === '1 ration of food spoiled.')).toHaveLength(1)
  })

  test('steps keep the lots in step with the food, deterministically; selling takes the oldest', () => {
    const play = () => {
      const actions: Action[] = [
        { type: 'buyGoods', good: 'food', amount: 4 },
        { type: 'rest', lodging: false },
        { type: 'rest', lodging: false },
        { type: 'buyGoods', good: 'food', amount: 3 },
        { type: 'sellGoods', good: 'food', amount: 4 },
      ]
      let state = makeState({ location: 'greenvale-1', gold: 50, goods: { food: 2, water: 8 } })
      const states = [state]
      for (const action of actions) {
        state = step(state, action, content)
        states.push(state)
      }
      return states
    }
    const states = play()
    expect(play()).toEqual(states)
    for (const s of states) expect(sum(s)).toBe(s.goods.food ?? 0)
    // Day 1: 2 + 4 bought; two days eat 4; day 3: 3 bought; selling 4 leaves 1 of the newest.
    const last = states.at(-1)!
    expect(last.goods.food).toBe(1)
    expect(last.foodLots).toEqual([{ day: last.day, amount: 1 }])
  })
})
