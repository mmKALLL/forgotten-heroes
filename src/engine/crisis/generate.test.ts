import { describe, expect, test } from 'vitest'
import { fixtureContent } from '../test-fixtures'
import { generateWorld, startingSettlement, worldSeed } from '../world/generate'
import { straightKm } from '../world/geo'
import { poiReach } from '../travel/reach'
import { CRISIS_LEAD_DAYS, POI_MIN_KM } from '../constants'
import { actCalendar } from './calendar'
import { generateCrisis } from './generate'

const content = fixtureContent()

function roll(seed: number, startDay = 1) {
  const world = generateWorld(worldSeed(seed), content)
  const start = startingSettlement(world, content)
  return { world, start, rolled: generateCrisis(world, content, { startDay, start }) }
}

describe('generateCrisis', () => {
  test('is deterministic for a world', () => {
    expect(roll(7).rolled).toEqual(roll(7).rolled)
    expect(roll(7).rolled!.crisis.villain).toBe('test-villain')
    expect(roll(7).rolled!.crisis.name).toBe('Morvaine, the Test Prophet')
  })

  test('adds six hidden sites of the villain’s types on free spots; other POIs are untouched', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { world, rolled } = roll(seed)
      const { crisis, world: after } = rolled!
      const added = Object.keys(after.pois).filter((id) => !Object.hasOwn(world.pois, id))
      const sites = crisis.acts.flatMap((a) => [a.lead, a.key])
      expect(added.sort()).toEqual([...sites].sort())
      for (const [id, poi] of Object.entries(world.pois)) expect(after.pois[id]).toEqual(poi)
      expect(sites.map((id) => after.pois[id].type)).toEqual([
        'test-reveal-site',
        'test-act-1-site',
        'test-lead-site',
        'test-act-2-site',
        'test-lead-site',
        'test-act-3-site',
      ])
      const spots = Object.values(after.pois).map((p) => p.spot)
      expect(new Set(spots).size).toBe(spots.length)
      for (const id of sites) {
        const poi = after.pois[id]
        expect(poi).toMatchObject({ category: 'quest', threat: 0, discovered: false })
        const at = content.landSpots[poi.spot].at
        expect(straightKm(at, content.settlements[poi.domain].at)).toBeGreaterThanOrEqual(
          POI_MIN_KM
        )
        expect(content.settlements[poi.domain].island).toBe('mainland')
      }
      // The name table's {land} is filled.
      expect(after.pois[crisis.acts[0].lead].name).not.toContain('{')
    }
  })

  test('the later leads lie a few days from the key site before, and the calendar is fixed', () => {
    let near = 0
    for (const seed of [1, 2, 3, 4, 5]) {
      const { world, crisis } = roll(seed).rolled!
      for (const i of [1, 2]) {
        const from = world.pois[crisis.acts[i - 1].key].domain
        const days = poiReach({ world }, content, from, crisis.acts[i].lead)?.days ?? Infinity
        if (days >= CRISIS_LEAD_DAYS[0] && days <= CRISIS_LEAD_DAYS[1]) near++
      }
    }
    expect(near).toBeGreaterThanOrEqual(8)
    // Nothing is jittered: the due days follow from the start day alone.
    const a = roll(3, 40).rolled!.crisis
    const b = roll(4, 40).rolled!.crisis
    expect(a.startDay).toBe(40)
    expect([0, 1, 2].map((i) => actCalendar(a, i))).toEqual([0, 1, 2].map((i) => actCalendar(b, i)))
  })

  test('a seat act lands in a kingdom seat’s domain other than the start', () => {
    let checked = 0
    for (let seed = 1; seed <= 30; seed++) {
      const { start, rolled } = roll(seed)
      const world = rolled!.world
      const seats = world.kingdoms
        .map((k) => k.seat)
        .filter((s) => s !== start && content.settlements[s].island === 'mainland')
      if (seats.length === 0) continue
      checked++
      // Act III of the fixture villain is the seat act.
      expect(seats).toContain(world.pois[rolled!.crisis.acts[2].key].domain)
    }
    expect(checked).toBeGreaterThan(0)
  })

  test('is null without villains, or without a start', () => {
    const world = generateWorld(worldSeed(1), content)
    const none = { ...content, villains: {} }
    expect(generateCrisis(world, none, { startDay: 1, start: 'greenvale-1' })).toBeNull()
    expect(generateCrisis(world, content, { startDay: 1, start: null })).toBeNull()
  })
})
