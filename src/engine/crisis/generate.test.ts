import { describe, expect, test } from 'vitest'
import { fixtureContent } from '../test-fixtures'
import { generateWorld, startingSettlement, worldSeed } from '../world/generate'
import { straightKm } from '../world/geo'
import { CRISIS_ACT_DAYS, CRISIS_DUE_JITTER, POI_MIN_KM } from '../constants'
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

  test('adds four hidden sites of the villain’s types on free spots; other POIs are untouched', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { world, rolled } = roll(seed)
      const { crisis, world: after } = rolled!
      const added = Object.keys(after.pois).filter((id) => !Object.hasOwn(world.pois, id))
      const sites = [crisis.reveal, ...crisis.acts.map((a) => a.poi)]
      expect(added.sort()).toEqual([...sites].sort())
      for (const [id, poi] of Object.entries(world.pois)) expect(after.pois[id]).toEqual(poi)
      expect(sites.map((id) => after.pois[id].type)).toEqual([
        'test-reveal-site',
        'test-act-1-site',
        'test-act-2-site',
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
      expect(after.pois[crisis.reveal].name).not.toContain('{')
    }
  })

  test('due days rise about CRISIS_ACT_DAYS apart from the start day', () => {
    const { crisis } = roll(3, 40).rolled!
    expect(crisis.startDay).toBe(40)
    crisis.acts.forEach((act, i) => {
      expect(Math.abs(act.due - (40 + (i + 1) * CRISIS_ACT_DAYS))).toBeLessThanOrEqual(
        CRISIS_DUE_JITTER
      )
    })
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
      expect(seats).toContain(world.pois[rolled!.crisis.acts[2].poi].domain)
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
