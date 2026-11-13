import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { load } from '../economy/capacity'
import { routeOptions } from './preview'
import { warningText } from './warnings'
import { ENCUMBERED_SPEED, KM_PER_DAY } from '../constants'

const content = fixtureContent()
// Brom (STR 16) carries 32 kg and Lyra (STR 8) 16 kg: 48 kg. Food weighs 1 kg, water 2 kg,
// metal 20 kg and stone 50 kg; 10 food and 8 water are 26 kg.
const at = (location: string, goods: GameState['goods']): GameState =>
  makeState({ location, travel: null, goods: { food: 10, water: 8, ...goods } })
const light = at('greenvale-1', {})
const encumbered = at('greenvale-1', { metal: 2 })
const overloaded = at('greenvale-1', { stone: 1 })
const plainsRoad = (state: GameState) =>
  routeOptions(state, content).find((o) => o.routeId === 'greenvale-1-greenvale-2')!

describe('encumbrance on the road', () => {
  test('the fixture loads are what they say', () => {
    expect(load(light, content).level).toBe('light')
    expect(load(encumbered, content)).toMatchObject({ weight: 66, level: 'encumbered' })
    expect(load(overloaded, content)).toMatchObject({ weight: 76, level: 'overloaded' })
  })

  test('encumbered slows the march, in the preview and on the road', () => {
    expect(plainsRoad(light).days).toBe(3)
    const road = plainsRoad(encumbered)
    expect(road.days).toBe(Math.ceil(75 / (KM_PER_DAY.plains * ENCUMBERED_SPEED)))
    const steady = road.paces.find((p) => p.pace === 'steady')!
    expect(steady.days).toBe(4)
    const out = step(encumbered, { type: 'travel', routeId: road.routeId }, content)
    expect(out.travel).toMatchObject({ days: 4, kmPerDay: KM_PER_DAY.plains * ENCUMBERED_SPEED })
    expect(out.log.at(-1)!.text).toContain('Heavily laden')
  })

  test('the preview warns and offers no forced march when encumbered', () => {
    expect(plainsRoad(light).paces.map((p) => p.pace)).toContain('forced')
    const road = plainsRoad(encumbered)
    expect(road.paces.map((p) => p.pace)).not.toContain('forced')
    const warning = road.paces[0].warnings[0]
    expect(warning).toEqual({ code: 'encumbered', params: { weight: 66, capacity: 48 } })
    expect(warningText(warning)).toBe(
      'Encumbered: 66 of 48 kg. The party walks slower and can’t force a march.'
    )
    const forced = step(
      encumbered,
      { type: 'travel', routeId: 'greenvale-1-greenvale-2', pace: 'forced' },
      content
    )
    expect(forced.travel).toBeNull()
    expect(forced.log.at(-1)!.text).toBe('Too heavily laden for a forced march.')
  })

  test('overloaded refuses to set out on land, but not on a ship', () => {
    const road = plainsRoad(overloaded)
    expect(road.available).toBe(false)
    expect(road.reason).toEqual({ code: 'overloaded', params: { kg: 4 } })
    const refused = step(overloaded, { type: 'travel', routeId: road.routeId }, content)
    expect(refused.travel).toBeNull()
    expect(refused.log.at(-1)!.text).toBe('Too heavy to set out: drop or sell 4 kg.')
    const port = { ...overloaded, location: 'ashmoor-1', gold: 100 }
    const sea = routeOptions(port, content).find((o) => o.terrain === 'sea')!
    expect(sea.available).toBe(true)
    const sailing = step(port, { type: 'travel', routeId: sea.routeId }, content)
    expect(sailing.travel?.kmPerDay).toBe(KM_PER_DAY.sea)
  })
})
