import { describe, expect, test } from 'vitest'
import type { PoiState } from '../../schema/world'
import {
  BOON_COOLDOWN_DAYS,
  INHABITED_DAYS,
  INHABITED_JITTER,
  MAX_POWER,
  POWER_STEP_DAYS,
  REINHABIT_DAYS,
  boonReadyIn,
  siteEvents,
  siteStatus,
  siteThreat,
} from './sites'

const lair = (overrides: Partial<PoiState> = {}): PoiState => ({
  type: 'orc-war-camp',
  category: 'lair',
  spot: 'spot-0001',
  domain: 'greenvale-1',
  name: 'Redtusk camp',
  threat: 2,
  discovered: true,
  clearedDay: null,
  boonDay: null,
  ...overrides,
})

describe('a site’s boon', () => {
  test(`returns ${BOON_COOLDOWN_DAYS} days after it was taken`, () => {
    expect(boonReadyIn({ boonDay: null }, 5)).toBe(0)
    expect(boonReadyIn({ boonDay: 5 }, 5)).toBe(BOON_COOLDOWN_DAYS)
    expect(boonReadyIn({ boonDay: 5 }, 34)).toBe(1)
    expect(boonReadyIn({ boonDay: 5 }, 35)).toBe(0)
  })
})

describe('the life cycle of dungeons and lairs', () => {
  test('sites that are not dungeons, lairs or hostile have no cycle', () => {
    const shrine = lair({ category: 'shrine', threat: 0 })
    expect(siteStatus(1, 'poi-1', shrine, 10)).toBeNull()
    expect(siteThreat(1, 'poi-1', shrine, 10)).toBe(0)
    // A neutral dungeon still empties and fills up again.
    expect(siteStatus(1, 'poi-1', lair({ category: 'dungeon', threat: 0 }), 10)).not.toBeNull()
  })

  test(`cleared by the party, it lies empty ${REINHABIT_DAYS} days, then grows stronger`, () => {
    const cleared = lair({ clearedDay: 50 })
    expect(siteStatus(1, 'poi-1', cleared, 50)).toMatchObject({
      phase: 'empty',
      since: 50,
      until: 50 + REINHABIT_DAYS,
      clearedBy: 'party',
    })
    expect(siteThreat(1, 'poi-1', cleared, 79)).toBe(0)
    const back = 50 + REINHABIT_DAYS
    expect(siteStatus(1, 'poi-1', cleared, back)).toMatchObject({
      phase: 'inhabited',
      since: back,
      power: 0,
      reinhabited: true,
    })
    expect(siteThreat(1, 'poi-1', cleared, back)).toBe(2)
    expect(siteStatus(1, 'poi-1', cleared, back + POWER_STEP_DAYS)!.power).toBe(1)
    expect(siteThreat(1, 'poi-1', cleared, back + POWER_STEP_DAYS)).toBe(2)
    const strong = siteStatus(1, 'poi-1', cleared, back + 2 * POWER_STEP_DAYS)!
    expect(strong.power).toBe(MAX_POWER)
    expect(siteThreat(1, 'poi-1', cleared, back + 2 * POWER_STEP_DAYS)).toBe(3)
    // A threat of 3 stays at 3.
    expect(siteThreat(1, 'poi-1', lair({ clearedDay: 50, threat: 3 }), back + 90)).toBe(3)
  })

  test('after its inhabited spell the realm clears it, and the cycle begins again', () => {
    const cleared = lair({ clearedDay: 50 })
    const held = siteStatus(1, 'poi-1', cleared, 50 + REINHABIT_DAYS)!
    const length = held.until - held.since
    expect(length).toBeGreaterThanOrEqual(INHABITED_DAYS - INHABITED_JITTER)
    expect(length).toBeLessThanOrEqual(INHABITED_DAYS + INHABITED_JITTER)
    expect(siteStatus(1, 'poi-1', cleared, held.until)).toMatchObject({
      phase: 'empty',
      since: held.until,
      clearedBy: 'realm',
      power: 0,
    })
    expect(siteEvents(1, 'poi-1', cleared, 50, held.until)).toEqual([
      { day: 50 + REINHABIT_DAYS, kind: 'inhabited' },
      { day: held.until, kind: 'cleared' },
    ])
    expect(siteEvents(1, 'poi-1', cleared, held.until, held.until + 1)).toEqual([])
  })

  test('the spells vary by site and by cycle, and are the same every time', () => {
    const lengths = new Set<number>()
    for (const id of ['poi-1', 'poi-2', 'poi-3', 'poi-4', 'poi-5']) {
      const held = siteStatus(7, id, lair({ clearedDay: 1 }), 1 + REINHABIT_DAYS)!
      lengths.add(held.until - held.since)
      expect(siteStatus(7, id, lair({ clearedDay: 1 }), 1 + REINHABIT_DAYS)).toEqual(held)
    }
    expect(lengths.size).toBeGreaterThan(1)
  })

  test('about four in five are inhabited at any time, at mixed powers, from day 1 on', () => {
    let held = 0
    let total = 0
    const powers = new Set<number>()
    for (let seed = 0; seed < 20; seed++) {
      for (let i = 1; i <= 50; i++) {
        for (const day of [1, 37, 200, 911]) {
          const status = siteStatus(seed, `poi-${i}`, lair(), day)!
          total++
          if (status.phase === 'inhabited') {
            held++
            if (day === 1) powers.add(status.power)
          }
        }
      }
    }
    const share = held / total
    expect(share).toBeGreaterThan(0.76)
    expect(share).toBeLessThan(0.84)
    expect([...powers].sort()).toEqual([0, 1, 2])
  })

  test('a site the party clears restarts its cycle from that day', () => {
    const before = siteStatus(3, 'poi-9', lair(), 400)!
    const after = siteStatus(3, 'poi-9', lair({ clearedDay: 400 }), 400)!
    expect(after).toMatchObject({ phase: 'empty', since: 400, clearedBy: 'party' })
    expect(before.since).not.toBe(400)
  })
})
