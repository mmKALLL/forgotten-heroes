import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { SituationSchema } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { drawEncounter } from '../encounters/run'
import { createRng } from '../rng'
import { step } from '../state'
import { brom, fixtureContent, lyra, makeCharacter, makeState } from '../test-fixtures'
import { placeOnRoute } from '../travel/journey'
import { routeOptions } from '../travel/preview'
import { hostileShare } from '../travel/routes'
import { visibleWealth } from './wealth'
import { HOSTILE_SHARE_RANGE } from '../constants'

const content = fixtureContent()

describe('visibleWealth', () => {
  test('no precious goods and a light purse add nothing', () => {
    expect(visibleWealth(makeState({ gold: 20, goods: { food: 10 } }), content).steps).toBe(0)
  })

  test('the same gems carried by four members add fewer steps than by two', () => {
    const goods = { gems: 6 }
    const two = makeState({ gold: 0, goods, party: [brom, lyra] })
    const four = makeState({
      gold: 0,
      goods,
      party: [brom, lyra, makeCharacter({ id: 'c' }), makeCharacter({ id: 'd' })],
    })
    expect(visibleWealth(two, content).steps).toBeGreaterThan(0)
    expect(visibleWealth(four, content).steps).toBeLessThan(visibleWealth(two, content).steps)
  })

  test('a heavy purse counts partly', () => {
    const light = visibleWealth(makeState({ gold: 100, goods: {} }), content)
    const heavy = visibleWealth(makeState({ gold: 1000, goods: {} }), content)
    expect(light.value).toBe(0)
    expect(heavy.value).toBeGreaterThan(0)
    expect(heavy.value).toBeLessThan(1000)
  })
})

describe('on the road', () => {
  test('the share respects HOSTILE_SHARE_RANGE', () => {
    const [lo, hi] = HOSTILE_SHARE_RANGE
    expect(hostileShare(0, 0, 'steady', false, 4).share).toBeGreaterThan(hostileShare(0, 0).share)
    expect(hostileShare(3, 3, 'forced', true, 4).share).toBe(hi)
    expect(hostileShare(0, 0, 'cautious', false, 0).drawn).toBeGreaterThanOrEqual(lo)
  })

  test('the preview’s hostile share is the journey’s', () => {
    const rich = makeState({
      location: 'greenvale-1',
      gold: 0,
      goods: { food: 10, water: 8, gems: 4 },
    })
    const road = routeOptions(rich, content).find((o) => o.routeId === 'greenvale-1-greenvale-2')!
    const steady = road.paces.find((p) => p.pace === 'steady')!
    expect(steady.hostile.wealth).toBeGreaterThan(0)
    const out = step(rich, { type: 'travel', routeId: road.routeId }, content)
    expect(placeOnRoute(out, content, out.travel!)!.hostileShare).toBe(steady.hostile.share)
  })

  test('over 1,000 seeded draws, thieves come more often to the wealthy', () => {
    const c: Content = structuredClone(content)
    const situation = (id: string, tags: string[]) =>
      ({
        ...SituationSchema.parse({
          id,
          title: id,
          disposition: 'hostile',
          tags,
          stages: {
            start: {
              text: 'Trouble.',
              options: [{ id: 'go', kind: 'fixed', label: 'Go', outcome: { text: 'Gone.' } }],
            },
          },
        }),
        source: 'claude',
        file: 'test',
      }) as Content['situations'][string]
    c.situations.cutpurses = situation('cutpurses', ['thieves'])
    c.situations.wolves = situation('wolves', [])
    const place = { biome: 'plains' as const, land: 'greenvale', domain: 'greenvale-1' }
    const base = makeState()
    const thieves = (steps: number) => {
      let n = 0
      for (let seed = 0; seed < 1000; seed++) {
        const s: GameState = { ...base, rng: createRng(seed) }
        const drawn = drawEncounter(s, c, undefined, {
          ...place,
          hostileShare: 1,
          wealthSteps: steps,
        })
        if (drawn.encounter?.situation.id === 'cutpurses') n++
      }
      return n
    }
    expect(thieves(4)).toBeGreaterThan(thieves(0) + 100)
  })
})
