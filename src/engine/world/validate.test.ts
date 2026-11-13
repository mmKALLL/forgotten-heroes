import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { fixtureContent } from '../test-fixtures'
import { components, otherEnd, routesFrom, straightKm } from './geo'
import { PX_PER_KM } from '../../schema/world'
import { poiTypeIssues, villainIssues, worldIssues } from './validate'
import { SPOT_LINK_KM, SPOT_SPACING_PX } from '../constants'

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

describe('worldIssues: land spots', () => {
  test('spot ids are kebab-case and match their key', () => {
    const broken = edit((c) => {
      c.landSpots['spot-0002'].id = 'spot-0001'
      c.landSpots.Spot_X = { ...c.landSpots['spot-0003'], id: 'Spot_X' }
      delete c.landSpots['spot-0003']
    })
    expect(worldIssues(broken)).toEqual(
      expect.arrayContaining([
        'spot spot-0001: listed as spot-0002',
        'spot Spot_X: ids must be kebab-case',
      ])
    )
  })

  test("a spot's island needs a settlement", () => {
    const broken = edit((c) => {
      c.landSpots['spot-0013'].island = 'atlantis'
    })
    expect(worldIssues(broken)).toContain('spot spot-0013: no settlement on its island "atlantis"')
  })

  test('every settlement needs a spot within SPOT_LINK_KM on its own island (a warning)', () => {
    expect(SPOT_LINK_KM).toBeCloseTo((1.6 * SPOT_SPACING_PX) / PX_PER_KM)
    const bare = edit((c) => {
      for (const id of ['spot-0013', 'spot-0014', 'spot-0015', 'spot-0016']) delete c.landSpots[id]
    })
    expect(worldIssues(bare)).toEqual([
      `warning: settlement farisle-1 has no land spot within ${Math.round(SPOT_LINK_KM)} km`,
    ])
    // A spot across the sea doesn't count.
    const moved = edit((c) => {
      for (const id of ['spot-0013', 'spot-0014', 'spot-0015', 'spot-0016']) {
        c.landSpots[id].island = 'mainland'
      }
    })
    expect(worldIssues(moved)).toContain(
      `warning: settlement farisle-1 has no land spot within ${Math.round(SPOT_LINK_KM)} km`
    )
  })

  test('no two spots are closer than half the grid spacing', () => {
    const crowded = edit((c) => {
      c.landSpots['spot-0002'].at = { x: 970, y: 970 }
    })
    expect(worldIssues(crowded)).toContain(
      'spots spot-0001 and spot-0002 are 28 px apart (under 50)'
    )
  })
})

describe('poiTypeIssues', () => {
  test('the test POI types are valid, and worldIssues includes their issues', () => {
    expect(poiTypeIssues(content)).toEqual([])
    const broken = edit((c) => {
      c.poiTypes['herbalist-hut'].names = 'nowhere'
    })
    expect(worldIssues(broken)).toContain('poi type herbalist-hut: unknown parts table "nowhere"')
  })

  test('situations exist and are site situations', () => {
    const broken = edit((c) => {
      c.poiTypes['herbalist-hut'].situations = ['herbalist-visit', 'atlantis', 'road-only']
      c.situations['road-only'] = {
        ...c.situations['herbalist-visit'],
        id: 'road-only',
        site: false,
      }
    })
    expect(poiTypeIssues(broken)).toEqual([
      'poi type herbalist-hut: unknown situation "atlantis"',
      'poi type herbalist-hut: "road-only" is not a site situation',
    ])
  })

  test('a wonder plays only wonder situations', () => {
    const broken = edit((c) => {
      c.poiTypes['singing-stones'].situations = ['singing-stones', 'herbalist-visit']
    })
    expect(poiTypeIssues(broken)).toEqual([
      'poi type singing-stones: a wonder plays only wonders, and "herbalist-visit" is not one',
    ])
  })

  test('names and threats must exist', () => {
    const broken = edit((c) => {
      c.poiTypes['orc-war-camp'].names = 'poi-name-nowhere'
      c.poiTypes['orc-war-camp'].threats = ['orc-warband', 'kraken']
    })
    expect(poiTypeIssues(broken)).toEqual([
      'poi type orc-war-camp: unknown parts table "poi-name-nowhere"',
      'poi type orc-war-camp: unknown threat "kraken"',
    ])
  })

  test('only a lair or a dungeon can be hostile', () => {
    const broken = edit((c) => {
      c.poiTypes['herbalist-hut'] = {
        ...c.poiTypes['herbalist-hut'],
        hostile: true,
        threat: { min: 1, max: 1 },
      }
    })
    expect(poiTypeIssues(broken)).toEqual([
      'poi type herbalist-hut: only a lair or a dungeon can be hostile (it is an expert)',
    ])
    const dungeon = edit((c) => {
      c.poiTypes['orc-war-camp'].category = 'dungeon'
    })
    expect(poiTypeIssues(dungeon)).toEqual([])
  })
})

describe('villainIssues', () => {
  test('the test villain is valid', () => {
    expect(villainIssues(content)).toEqual([])
  })

  test('threats, names and site types must exist', () => {
    const broken = edit((c) => {
      const v = c.villains['test-villain']
      v.threats = ['kraken']
      v.names = 'no-names'
      v.acts[0].lead = 'no-site'
    })
    expect(villainIssues(broken)).toEqual([
      'villain test-villain: unknown threat "kraken"',
      'villain test-villain: unknown parts table "no-names"',
      'villain test-villain: unknown poi type "no-site"',
    ])
  })

  test('crisis site types are weight-0 quests, so they are never drawn as ordinary sites', () => {
    const broken = edit((c) => {
      c.poiTypes['test-act-2-site'].weight = 1
      c.poiTypes['test-act-3-site'].category = 'lair'
    })
    expect(villainIssues(broken)).toEqual([
      'villain test-villain: poi type "test-act-2-site" needs weight 0',
      'villain test-villain: poi type "test-act-3-site" needs category quest',
    ])
  })
})
