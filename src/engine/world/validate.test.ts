import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { fixtureContent } from '../test-fixtures'
import { components, otherEnd, routesFrom, straightKm } from './geo'
import { worldIssues } from './validate'

const content = fixtureContent()
const edit = (change: (c: Content) => void): Content => {
  const copy = structuredClone(content)
  change(copy)
  return copy
}

describe('geography helpers', () => {
  test('straight-line km use the scale bar: 100 km is 484 px', () => {
    expect(straightKm({ x: 0, y: 0 }, { x: 484, y: 0 })).toBeCloseTo(100)
  })

  test('the routes from a settlement, and where each leads', () => {
    expect(routesFrom(content, 'ashmoor-1').map((r) => r.id)).toEqual([
      'ashmoor-1-farisle-1',
      'ashmoor-1-greenvale-1',
      'ashmoor-1-greenvale-2',
    ])
    expect(otherEnd(content.routes['ashmoor-1-farisle-1'], 'farisle-1')).toBe('ashmoor-1')
  })

  test('connected components, optionally over some routes only', () => {
    expect(components(content)).toEqual([['ashmoor-1', 'farisle-1', 'greenvale-1', 'greenvale-2']])
    expect(components(content, (r) => r.terrain !== 'sea')).toEqual([
      ['ashmoor-1', 'greenvale-1', 'greenvale-2'],
      ['farisle-1'],
    ])
  })
})

describe('worldIssues', () => {
  test('the test world is valid', () => {
    expect(worldIssues(content)).toEqual([])
  })

  test('unknown regions and route ends', () => {
    const broken = edit((c) => {
      c.settlements['greenvale-2'].region = 'nowhere'
      c.routes['greenvale-1-greenvale-2'].to = 'atlantis'
    })
    expect(worldIssues(broken)).toEqual(
      expect.arrayContaining([
        'settlement greenvale-2: unknown region "nowhere"',
        'route greenvale-1-greenvale-2: unknown settlement "atlantis"',
      ])
    )
  })

  test('distances must fit the map scale', () => {
    const short = edit((c) => {
      c.routes['greenvale-1-greenvale-2'].km = 40
    })
    expect(worldIssues(short)).toContain(
      'route greenvale-1-greenvale-2: 40 km is shorter than the straight line (62 km)'
    )
    const long = edit((c) => {
      c.routes['greenvale-1-greenvale-2'].km = 400
    })
    expect(worldIssues(long)).toContain(
      'route greenvale-1-greenvale-2: 400 km is more than twice the straight line (62 km)'
    )
  })

  test('land routes stay on one island; sea routes join coastal settlements', () => {
    const bridge = edit((c) => {
      c.routes['ashmoor-1-farisle-1'].terrain = 'forest'
    })
    expect(worldIssues(bridge)).toContain(
      'route ashmoor-1-farisle-1: a land route cannot join mainland and farisle; use terrain "sea"'
    )
    const inland = edit((c) => {
      c.settlements['farisle-1'].coastal = false
    })
    expect(worldIssues(inland)).toContain(
      'route ashmoor-1-farisle-1: sea routes need a coastal settlement at both ends'
    )
  })

  test('every settlement is reachable, and each island is connected by land', () => {
    const cut = edit((c) => {
      delete c.routes['ashmoor-1-farisle-1']
    })
    expect(worldIssues(cut)).toContain(
      'the routes split the world into 2 parts: ashmoor-1, greenvale-1, greenvale-2 | farisle-1'
    )
    const split = edit((c) => {
      delete c.routes['greenvale-1-greenvale-2']
      delete c.routes['ashmoor-1-greenvale-2']
    })
    expect(worldIssues(split)).toContain(
      'island mainland: land routes leave 2 parts: ashmoor-1, greenvale-1 | greenvale-2'
    )
  })

  test('regions need settlements; routes and town pins are unique and known', () => {
    const empty = edit((c) => {
      c.regions.void = { ...c.regions.greenvale, id: 'void', name: 'Void' }
    })
    expect(worldIssues(empty)).toContain('region void has no settlements')
    const twice = edit((c) => {
      c.routes.again = {
        ...c.routes['greenvale-1-greenvale-2'],
        id: 'again',
        from: 'greenvale-2',
        to: 'greenvale-1',
      }
    })
    expect(worldIssues(twice)).toContain('route greenvale-1-greenvale-2: duplicates route again')
    const pinned = edit((c) => {
      c.towns.harbourne.site = 'atlantis'
    })
    expect(worldIssues(pinned)).toContain('town harbourne: unknown site "atlantis"')
  })
})
