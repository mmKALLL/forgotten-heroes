import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { EffectSchema } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { applyEffects } from '../encounters/effects'
import { step, type Action } from '../state'
import { brom, fixtureContent, lyra, makeState } from '../test-fixtures'
import { carryCapacity } from '../economy/capacity'
import { routeOptions } from '../travel/preview'
import { restOption } from '../travel/supplies'
import { animalOffers, payUpkeep } from './animals'
import { lodgingOptions, newsTargets, serviceRows } from './services'
import { KM_PER_DAY, MOUNT_ROUGH_SPEED } from '../constants'

/** The fixture with a temple that heals and blesses, and a courier, in every settlement. */
const content: Content = (() => {
  const c = structuredClone(fixtureContent())
  const role = (id: string, fn: 'temple' | 'hire', actions: string[]) => ({
    id,
    function: fn,
    trades: [],
    buysOnly: [],
    actions,
    source: 'claude' as const,
    file: 'test',
  })
  c.serviceRoles.temple = role('temple', 'temple', ['heal', 'bless']) as never
  c.serviceRoles.couriers = role('couriers', 'hire', ['news']) as never
  return c
})()
const extra = ['temple', 'couriers']
function at(location: string, overrides: Partial<GameState> = {}): GameState {
  const s = makeState({ location, gold: 100, goods: { food: 10, water: 8 } })
  const settlements = { ...s.world.settlements }
  for (const id of Object.keys(settlements)) {
    settlements[id] = { ...settlements[id], services: [...settlements[id].services, ...extra] }
  }
  return { ...s, world: { ...s.world, settlements }, ...overrides }
}
const act = (s: GameState, a: Action) => step(s, a, content)
const lastLine = (s: GameState) => s.log.at(-1)!.text

describe('lodging', () => {
  test('a private room fades two Strain stacks, a common room one', () => {
    const strained = at('greenvale-1', {
      party: [{ ...brom, strain: { survival: 3 } }, lyra],
    })
    expect(lodgingOptions(strained, content).map((r) => r.room)).toEqual(['common', 'private'])
    const common = act(strained, { type: 'rest', lodging: 'common' })
    const private_ = act(strained, { type: 'rest', lodging: 'private' })
    expect(common.party[0].strain).toEqual({ survival: 2 })
    expect(private_.party[0].strain).toEqual({ survival: 1 })
    expect(private_.gold).toBeLessThan(common.gold)
    expect(strained.gold - private_.gold).toBe(restOption(strained, content, 'private').lodgingCost)
  })

  test('the animals’ keep is added to the cost of a night', () => {
    const plain = at('greenvale-1')
    const withMule = at('greenvale-1', { animals: { mule: 1 } })
    const option = restOption(withMule, content)
    expect(option.stabling).toBeGreaterThan(0)
    expect(plain.gold - act(plain, { type: 'rest' }).gold).toBe(option.lodgingCost)
    expect(withMule.gold - act(withMule, { type: 'rest' }).gold).toBe(
      option.lodgingCost + option.stabling
    )
  })
})

describe('healers, temples and couriers', () => {
  const hurt = (s: GameState) => ({
    ...s,
    party: [{ ...brom, hp: 4, exhaustion: 2 }, lyra],
  })

  test('the healer costs gold, passes no day, and is refused without the gold', () => {
    const s = hurt(at('greenvale-1'))
    const healer = serviceRows(s, content)
      .find((r) => r.service === 'temple')!
      .actions.find((a) => a.action === 'heal')!
    const healed = act(s, { type: 'useService', service: 'temple', action: 'heal' })
    expect(healed.day).toBe(s.day)
    expect(healed.gold).toBe(s.gold - healer.cost!)
    expect(healed.party[0]).toMatchObject({ hp: brom.maxHp, exhaustion: 1 })
    const broke = act({ ...s, gold: 0 }, { type: 'useService', service: 'temple', action: 'heal' })
    expect(broke.party[0].hp).toBe(4)
  })

  test('a blessing works once per arrival', () => {
    const s = at('greenvale-1')
    const blessed = act(s, { type: 'useService', service: 'temple', action: 'bless' })
    expect(blessed.inspiration).toBe(s.inspiration + 1)
    const again = act(blessed, { type: 'useService', service: 'temple', action: 'bless' })
    expect(again.inspiration).toBe(blessed.inspiration)
    expect(again.gold).toBe(blessed.gold)
    // A new arrival clears it.
    expect(
      act({ ...blessed, doneHere: [] }, { type: 'useService', service: 'temple', action: 'bless' })
        .inspiration
    ).toBe(blessed.inspiration + 1)
  })

  test('news writes a heard entry, dated by the courier’s road', () => {
    const s = at('greenvale-1', { day: 20, priceBook: {} })
    const target = newsTargets(s, content)[0]
    expect(target.age).toBeGreaterThan(0)
    const after = act(s, {
      type: 'useService',
      service: 'couriers',
      action: 'news',
      settlement: target.id,
    })
    expect(after.priceBook[target.id]).toMatchObject({ heard: true, day: 20 - target.age })
    expect(after.gold).toBeLessThan(s.gold)
    // Far Isle is across the sea: no courier news from there.
    expect(newsTargets(s, content).map((t) => t.id)).not.toContain('farisle-1')
    // Prices known as fresh as the news would be: no longer a target.
    expect(newsTargets(after, content).map((t) => t.id)).not.toContain(target.id)
  })

  test('services nothing supports yet are listed as coming later', () => {
    const rows = serviceRows(at('greenvale-1'), content)
    expect(rows.find((r) => r.service === 'port')).toMatchObject({ later: true })
    expect(rows.find((r) => r.service === 'temple')).toMatchObject({ later: false })
  })
})

describe('animals', () => {
  test('a bought mule adds its capacity; selling returns some gold', () => {
    const s = at('greenvale-1')
    const bought = act(s, { type: 'buyAnimal', animal: 'mule' })
    expect(bought.animals).toEqual({ mule: 1 })
    expect(carryCapacity(bought, content)).toBeGreaterThan(carryCapacity(s, content))
    const sold = act(bought, { type: 'sellAnimal', animal: 'mule' })
    expect(sold.animals).toEqual({})
    expect(sold.gold).toBeGreaterThan(bought.gold)
    expect(sold.gold).toBeLessThan(s.gold)
  })

  test('thieves lead away stealable animals, most valuable first', () => {
    const s = at('greenvale-1', { animals: { mule: 1, 'riding-horse': 1, cart: 1 } })
    const effect = EffectSchema.parse({ effect: 'animals', amount: -1 })
    expect(applyEffects(s, [effect], { content }).animals).toEqual({ mule: 1, cart: 1 })
  })

  test('a cart blocks paths to sites', () => {
    const s = at('greenvale-1', { animals: { mule: 1, cart: 1 } })
    const poi = Object.keys(s.world.pois).find((id) => s.world.pois[id].domain === 'greenvale-1')
    const known = poi
      ? {
          ...s,
          world: {
            ...s.world,
            pois: { ...s.world.pois, [poi]: { ...s.world.pois[poi], discovered: true } },
          },
        }
      : s
    const paths = routeOptions(known, content).filter((o) => o.to === poi)
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path.reason).toEqual({ code: 'animals', params: { name: 'Cart', roadsOnly: true } })
      const refused = act(known, { type: 'travel', routeId: path.routeId })
      expect(refused.travel).toBeNull()
      expect(lastLine(refused)).toBe('No road for the cart.')
    }
    expect(routeOptions(known, content).find((o) => o.to === 'greenvale-2')!.available).toBe(true)
  })
})

describe('animal offers', () => {
  test('list what is for sale where there is an animals service, with resale and keep', () => {
    const offers = animalOffers(at('greenvale-1', { gold: 15, animals: { mule: 1 } }), content)
    expect(offers.map((o) => o.id)).toEqual(['mule', 'cart', 'riding-horse'])
    expect(offers[0]).toMatchObject({ owned: 1, capacity: 100, upkeep: 1, buyReason: null })
    expect(offers[0].resale).toBeLessThan(offers[0].price)
    expect(offers[2]).toMatchObject({ rides: 2, buyReason: 'not enough gold' })
    expect(animalOffers(at('greenvale-2'), content)).toEqual([])
  })
})

describe('hired horses', () => {
  const ride = (s: GameState, routeId: string) => {
    const option = routeOptions(s, content).find((o) => o.routeId === routeId)!
    const steady = option.paces.find((p) => p.pace === 'steady')!
    const mounted = option.mounted!.paces.find((p) => p.pace === 'steady')!
    const out = act(s, { type: 'travel', routeId, hire: true })
    return { steady, mounted, out }
  }

  test('ride twice as fast on the plains, and cost what the preview says', () => {
    const s = at('greenvale-1')
    const { steady, mounted, out } = ride(s, 'greenvale-1-greenvale-2')
    expect(mounted.days).toBeLessThan(steady.days)
    expect(out.travel).toMatchObject({
      days: mounted.days,
      kmPerDay: KM_PER_DAY.plains * 2,
      hired: { animal: 'riding-horse', count: 2 },
    })
    expect(out.gold).toBe(s.gold - mounted.cost)
    expect(carryCapacity(out, content)).toBeGreaterThan(carryCapacity(s, content))
  })

  test('only 1.25× in rough land (marsh)', () => {
    const { mounted, out } = ride(at('ashmoor-1'), 'ashmoor-1-greenvale-2')
    expect(out.travel!.kmPerDay).toBe(KM_PER_DAY.marsh * MOUNT_ROUGH_SPEED)
    expect(out.travel!.days).toBe(mounted.days)
  })

  test('the slowest traveller sets the pace: a mule or cart keeps riders to walking speed', () => {
    for (const animals of [{ mule: 1 }, { mule: 1, cart: 1 }] as Record<string, number>[]) {
      const s = at('greenvale-1', { animals })
      const { steady, mounted, out } = ride(s, 'greenvale-1-greenvale-2')
      expect(mounted.days).toBe(steady.days)
      expect(out.travel).toMatchObject({ days: mounted.days, kmPerDay: KM_PER_DAY.plains })
    }
    // Owned horses for everyone ride at their speed; a spare one is led and slows no one.
    const herd = at('greenvale-1', { animals: { 'riding-horse': 3 } })
    const road = routeOptions(herd, content).find((o) => o.routeId === 'greenvale-1-greenvale-2')!
    const out = act(herd, { type: 'travel', routeId: road.routeId })
    expect(out.travel!.kmPerDay).toBe(KM_PER_DAY.plains * 2)
    expect(out.travel!.days).toBe(road.days)
    // One horse short: whoever walks sets the pace.
    const short = at('greenvale-1', { animals: { 'riding-horse': 1 } })
    expect(act(short, { type: 'travel', routeId: road.routeId }).travel!.kmPerDay).toBe(
      KM_PER_DAY.plains
    )
  })

  test('are returned on arrival', () => {
    let s = ride(at('greenvale-1'), 'greenvale-1-greenvale-2').out
    for (let i = 0; i < 20 && s.travel; i++) {
      s = s.encounter ? act(s, { type: 'closeEncounter' }) : act(s, { type: 'continueJourney' })
    }
    expect(s.location).toBe('greenvale-2')
    expect(s.log.some((e) => e.text.includes('hired mounts are returned'))).toBe(true)
    expect(carryCapacity(s, content)).toBe(carryCapacity(at('greenvale-2'), content))
  })

  test('carry what the party can’t on foot, and say when the hire is too dear', () => {
    const empty = at('greenvale-1', { goods: {} })
    const kg = Math.floor(carryCapacity(empty, content) * 1.5) + 10
    const heavy = at('greenvale-1', { goods: { food: kg } })
    const road = routeOptions(heavy, content).find((o) => o.to === 'greenvale-2')!
    expect(road.reason?.code).toBe('overloaded')
    expect(road.mounted!.paces.every((p) => p.reason === null)).toBe(true)
    const poor = at('greenvale-1', { gold: 1 })
    const steady = routeOptions(poor, content)
      .find((o) => o.to === 'greenvale-2')!
      .mounted!.paces.find((p) => p.pace === 'steady')!
    expect(steady.reason).toEqual({ code: 'hire', params: { gold: steady.cost } })
  })

  test('are not for hire where there is no animals service, or at sea', () => {
    expect(routeOptions(at('greenvale-2'), content).every((o) => o.mounted === null)).toBe(true)
    const sea = routeOptions(at('ashmoor-1'), content).find((o) => o.terrain === 'sea')!
    expect(sea.mounted).toBeNull()
  })
})

describe('the animals’ upkeep', () => {
  const cheap = structuredClone(fixtureContent())
  cheap.animals.mule = { ...cheap.animals.mule, upkeepPerDay: 0.2 }
  const owner = (gold: number) => makeState({ location: 'greenvale-1', gold, animals: { mule: 1 } })

  test('carries fractions of a gp over quietly while the purse could pay', () => {
    const paid = payUpkeep(owner(50), cheap)
    expect(paid.gold).toBe(50)
    expect(paid.upkeepOwed).toBeCloseTo(0.2)
    expect(paid.log).toEqual(owner(50).log)
  })

  test('says so when the coin runs out', () => {
    const broke = payUpkeep(owner(0), fixtureContent())
    expect(broke.upkeepOwed).toBe(1)
    expect(broke.log.at(-1)!.text).toMatch(/no coin left for the animals/)
  })
})
