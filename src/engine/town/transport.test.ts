import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { step, type Action } from '../state'
import { fixtureContent, makeCharacter, makeState } from '../test-fixtures'
import { carryCapacity } from '../economy/capacity'
import { routeOptions } from '../travel/preview'
import { placeOnRoute } from '../travel/journey'
import { passDay } from '../travel/supplies'
import { animalOffers, camelWaterSaving } from './animals'
import { KM_PER_DAY, MOUNT_ROUGH_SPEED } from '../constants'

// Transport rules (designer calls 2026-11-13): vehicles are slow and draw attention, camels save
// water in the desert, and the flying carpet flies.

const content: Content = fixtureContent()
/** The fixture with the plains road between the Greenvale towns turned to desert. */
const desert: Content = (() => {
  const c = structuredClone(fixtureContent())
  c.routes['greenvale-1-greenvale-2'] = {
    ...c.routes['greenvale-1-greenvale-2'],
    terrain: 'desert',
  }
  return c
})()
const at = (location: string, overrides: Partial<GameState> = {}): GameState => ({
  ...makeState({ location, gold: 100, goods: { food: 10, water: 8 } }),
  ...overrides,
})
const act = (s: GameState, a: Action, c: Content = content) => step(s, a, c)
const road = (s: GameState, to: string, c: Content = content) =>
  routeOptions(s, c).find((o) => o.to === to)!

describe('carts and wagons', () => {
  test('rule out the brisk and forced paces: shown disabled, and refused', () => {
    const s = at('greenvale-1', { animals: { mule: 1, cart: 1 } })
    const paces = road(s, 'greenvale-2').paces
    const blocked = paces.filter((p) => p.blocked !== null).map((p) => p.pace)
    expect(blocked).toEqual(['brisk', 'forced'])
    expect(paces.find((p) => p.pace === 'brisk')!.blocked).toEqual({
      code: 'slow',
      params: { name: 'Cart' },
    })
    const refused = act(s, { type: 'travel', routeId: 'greenvale-1-greenvale-2', pace: 'brisk' })
    expect(refused.travel).toBeNull()
    expect(refused.log.at(-1)!.text).toBe("The cart can't be hurried.")
    expect(act(s, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }).travel).not.toBeNull()
    // Without the cart every pace is open.
    expect(
      road(at('greenvale-1', { animals: { mule: 1 } }), 'greenvale-2').paces.every(
        (p) => !p.blocked
      )
    ).toBe(true)
  })

  test('add to the hostile share, and the road meets what the preview said', () => {
    const plain = at('greenvale-1', { animals: { mule: 2 } })
    const one = at('greenvale-1', { animals: { mule: 2, cart: 1 } })
    const two = at('greenvale-1', { animals: { mule: 2, cart: 2 } })
    const steady = (s: GameState) => road(s, 'greenvale-2').paces.find((p) => p.pace === 'steady')!
    expect(steady(plain).hostile.cargo).toBe(0)
    expect(steady(one).hostile.cargo).toBeGreaterThan(0)
    expect(steady(two).hostile.cargo).toBeCloseTo(2 * steady(one).hostile.cargo)
    expect(steady(one).hostile.drawn).toBeGreaterThan(steady(plain).hostile.drawn)
    for (const s of [plain, one, two]) {
      const out = act(s, { type: 'travel', routeId: 'greenvale-1-greenvale-2', forage: false })
      const place = placeOnRoute(out, content, out.travel!)!
      expect(place.hostileShare).toBeCloseTo(
        routeOptions(s, content, false)
          .find((o) => o.to === 'greenvale-2')!
          .paces.find((p) => p.pace === 'steady')!.hostile.drawn
      )
    }
  })
})

describe('camels in the desert', () => {
  const party = [
    makeCharacter({ id: 'a', name: 'A' }),
    makeCharacter({ id: 'b', name: 'B' }),
    makeCharacter({ id: 'c', name: 'C' }),
    makeCharacter({ id: 'd', name: 'D' }),
  ]
  const camels = (n: number) =>
    at('greenvale-1', { party, animals: n > 0 ? { camel: n } : {}, goods: { food: 40, water: 40 } })

  test('each saves water in the desert, up to a cap, and none elsewhere', () => {
    const saving = (n: number) => camelWaterSaving(camels(n), desert, 'desert')
    expect(saving(0)).toBe(0)
    expect(saving(1)).toBeGreaterThan(0)
    expect(saving(2)).toBeGreaterThan(saving(1))
    expect(saving(8)).toBe(saving(4))
    expect(camelWaterSaving(camels(2), desert, 'plains')).toBe(0)
  })

  test('the road preview’s water is what the party drinks, and less with camels', () => {
    const needed = (s: GameState) =>
      road(s, 'greenvale-2', desert).paces.find((p) => p.pace === 'steady')!.water
    for (const n of [0, 2]) {
      const s = camels(n)
      const forecast = needed(s)
      const option = road(s, 'greenvale-2', desert).paces.find((p) => p.pace === 'steady')!
      const day = passDay(s, 'desert', 'steady', desert)
      expect(forecast.needed).toBe(option.days * ((s.goods.water ?? 0) - (day.goods.water ?? 0)))
    }
    expect(needed(camels(2)).needed).toBeLessThan(needed(camels(0)).needed)
  })

  test('with just the water the preview asks for, no one goes without; without camels, it warns', () => {
    const steady = (s: GameState) =>
      routeOptions(s, desert, false)
        .find((o) => o.to === 'greenvale-2')!
        .paces.find((p) => p.pace === 'steady')!
    const base = camels(2)
    const s = { ...base, goods: { ...base.goods, water: steady(base).water.needed } }
    const preview = steady(s)
    expect(preview.warnings.some((w) => w.code === 'waterRunsOut')).toBe(false)
    let day: GameState = s
    for (let i = 0; i < preview.days; i++) day = passDay(day, 'desert', 'steady', desert)
    expect(day.party.every((c) => c.exhaustion === 0)).toBe(true)
    // The same water without the camels runs out, and the preview says so.
    const walkers: GameState = { ...s, animals: {} }
    expect(steady(walkers).warnings.some((w) => w.code === 'waterRunsOut')).toBe(true)
  })
})

describe('the flying carpet', () => {
  test('flies at its speed over rough land, carrying a fixed load; with a mule it is rolled up', () => {
    const flying = at('greenvale-2', { animals: { 'flying-carpet': 1 } })
    const option = road(flying, 'ashmoor-1')
    expect(option.terrain).toBe('marsh')
    const out = act(flying, { type: 'travel', routeId: option.routeId })
    expect(out.travel!.kmPerDay).toBeGreaterThan(KM_PER_DAY.marsh * MOUNT_ROUGH_SPEED)
    expect(out.travel!.days).toBe(option.days)
    expect(option.days).toBeLessThan(road(at('greenvale-2'), 'ashmoor-1').days)
    // Whatever the members' strength.
    const weak = {
      ...flying,
      party: flying.party.map((c) => ({ ...c, abilities: { ...c.abilities, str: 6 } })),
    }
    expect(carryCapacity(weak, content)).toBe(carryCapacity(flying, content))
    const grounded = at('greenvale-2', { animals: { 'flying-carpet': 1, mule: 1 } })
    expect(act(grounded, { type: 'travel', routeId: option.routeId }).travel!.kmPerDay).toBe(
      KM_PER_DAY.marsh
    )
  })

  test('is sold only in the desert', () => {
    const s = at('greenvale-1', { gold: 5000 })
    expect(animalOffers(s, content).some((o) => o.id === 'flying-carpet')).toBe(false)
    expect(act(s, { type: 'buyAnimal', animal: 'flying-carpet' }).animals).toEqual({})
    const sands = structuredClone(content)
    sands.regions.greenvale = { ...sands.regions.greenvale, biome: 'desert' }
    expect(animalOffers(s, sands).some((o) => o.id === 'flying-carpet')).toBe(true)
    expect(act(s, { type: 'buyAnimal', animal: 'flying-carpet' }, sands).animals).toEqual({
      'flying-carpet': 1,
    })
  })
})
