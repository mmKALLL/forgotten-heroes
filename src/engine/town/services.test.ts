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
import { animalOffers } from './animals'
import { lodgingOptions, newsOptions, serviceRows } from './services'
import { KM_PER_DAY } from '../constants'

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

  test('a private room lifts more exhaustion than a common room, as its effect line says', () => {
    const tired = at('greenvale-1', { party: [{ ...brom, exhaustion: 3 }, lyra] })
    const rooms = lodgingOptions(tired, content)
    const common = act(tired, { type: 'rest', lodging: 'common' })
    const private_ = act(tired, { type: 'rest', lodging: 'private' })
    expect(private_.party[0].exhaustion).toBeLessThan(common.party[0].exhaustion)
    expect(rooms[0].effect).toContain(`−${3 - common.party[0].exhaustion} exhaustion`)
    expect(rooms[1].effect).toContain(`−${3 - private_.party[0].exhaustion} exhaustion`)
  })

  test('a private room heals more than a common room, neither all of it, as the effect lines say', () => {
    const hurt = at('greenvale-1', { party: [{ ...brom, hp: 1 }, lyra] })
    const healed = (room: 'common' | 'private') =>
      act(hurt, { type: 'rest', lodging: room }).party[0].hp - 1
    const rooms = lodgingOptions(hurt, content)
    expect(healed('private')).toBeGreaterThan(healed('common'))
    expect(1 + healed('private')).toBeLessThan(brom.maxHp)
    for (const room of rooms) {
      expect(healed(room.room)).toBe(Math.ceil(brom.maxHp * room.heal))
      expect(room.effect).toContain(`${Math.round(room.heal * 100)}% HP`)
    }
    // Only a private room brings the party closer.
    expect(act(hurt, { type: 'rest', lodging: 'common' }).camaraderie).toBe(hurt.camaraderie)
  })

  test('owned animals add nothing to the cost of a night (no upkeep)', () => {
    const withMule = at('greenvale-1', { animals: { mule: 1, 'riding-horse': 1 } })
    const option = restOption(withMule, content)
    expect(withMule.gold - act(withMule, { type: 'rest' }).gold).toBe(option.lodgingCost)
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

  test('news updates exactly the towns its option lists, dated by the courier’s road', () => {
    const s = at('greenvale-1', { day: 20, priceBook: {} })
    const [neighbours, all] = newsOptions(s, content)
    // One route away; Far Isle is no neighbour of Greenvale, but every town includes it.
    expect(neighbours.towns.map((t) => t.id).sort()).toEqual(['ashmoor-1', 'greenvale-2'])
    expect(all.towns.map((t) => t.id)).toContain('farisle-1')
    // Every town's news travels faster: never older than a neighbour's.
    for (const t of neighbours.towns) {
      expect(all.towns.find((a) => a.id === t.id)!.age).toBeLessThanOrEqual(t.age)
    }
    const news = (state: GameState, reach: 'neighbours' | 'all') =>
      act(state, { type: 'useService', service: 'couriers', action: 'news', reach })
    const after = news(s, 'neighbours')
    expect(after.gold).toBe(s.gold - neighbours.cost)
    expect(Object.keys(after.priceBook).sort()).toEqual(neighbours.towns.map((t) => t.id).sort())
    for (const t of neighbours.towns) {
      expect(after.priceBook[t.id]).toMatchObject({ heard: true, day: 20 - t.age })
    }
    // Nothing fresher from the neighbours now: refused, and nothing is paid.
    const again = newsOptions(after, content)[0]
    expect(again).toMatchObject({ available: false, towns: [] })
    expect(news(after, 'neighbours').gold).toBe(after.gold)
    // Every town: only those it makes fresher, as previewed.
    const wide = newsOptions(after, content)[1]
    const later = news(after, 'all')
    for (const t of wide.towns) expect(later.priceBook[t.id].day).toBe(t.day)
    // A sea route makes Far Isle Ashmoor's neighbour.
    const coast = newsOptions(at('ashmoor-1', { day: 20 }), content)[0]
    expect(coast.towns.map((t) => t.id)).toContain('farisle-1')
  })

  test('each service’s short effect says what using it does', () => {
    const s = hurt(at('greenvale-1'))
    const views = serviceRows(s, content).flatMap((r) => r.actions)
    const effect = (action: string) => views.find((a) => a.action === action)!.effect!
    const num = (text: string, what: string) =>
      Number(text.match(new RegExp(`([+−-]\\d+) ${what}`))![1].replace('−', '-'))
    const blessed = act(s, { type: 'useService', service: 'temple', action: 'bless' })
    expect(num(effect('bless'), 'Inspiration')).toBe(blessed.inspiration - s.inspiration)
    const healed = act(s, { type: 'useService', service: 'temple', action: 'heal' })
    expect(effect('heal')).toMatch(/^Full HP/)
    expect(num(effect('heal'), 'exhaustion')).toBe(
      healed.party[0].exhaustion - s.party[0].exhaustion
    )
    const stood = act(s, { type: 'useService', service: 'inn-tavern', action: 'round' })
    expect(num(effect('round'), 'camaraderie')).toBe(stood.camaraderie - s.camaraderie)
    // Each room's own effect: the Strain a night fades, and a private room's bond.
    const strained = { ...s, party: [{ ...brom, strain: { survival: 3 } }, lyra] }
    for (const room of lodgingOptions(strained, content)) {
      const night = act(strained, { type: 'rest', lodging: room.room })
      expect(num(room.effect, 'strain')).toBe(night.party[0].strain.survival! - 3)
      const bond = room.effect.match(/\+(\d+) camaraderie/)
      expect(bond ? Number(bond[1]) : 0).toBe(night.camaraderie - strained.camaraderie)
    }
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
  test('list what is for sale where there is an animals service, with resale', () => {
    const offers = animalOffers(at('greenvale-1', { gold: 15, animals: { mule: 1 } }), content)
    // The camel is for sale everywhere; the flying carpet only in the desert (soldIn).
    expect(offers.map((o) => o.id)).toEqual(['mule', 'cart', 'riding-horse', 'camel'])
    expect(offers[0]).toMatchObject({ owned: 1, capacity: 100, buyReason: null })
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

  test('mounts keep their speed in rough land (marsh) too', () => {
    const { mounted, out } = ride(at('ashmoor-1'), 'ashmoor-1-greenvale-2')
    expect(out.travel!.kmPerDay).toBe(KM_PER_DAY.marsh * 2)
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

describe('buying a mount', () => {
  test('costs exactly the offered price, and keeping it costs nothing a day after', () => {
    const rich = at('greenvale-1', { gold: 200 })
    const offer = animalOffers(rich, content).find((o) => o.id === 'riding-horse')!
    const bought = act(rich, { type: 'buyAnimal', animal: 'riding-horse' })
    expect(rich.gold - bought.gold).toBe(offer.price)
    expect(bought.animals['riding-horse']).toBe(1)
    // A day of rest on the party's own food: the horse costs nothing to keep.
    const rested = act(bought, { type: 'rest', lodging: false })
    expect(rested.gold).toBe(bought.gold)
  })
})
