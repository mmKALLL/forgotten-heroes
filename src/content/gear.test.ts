import { describe, expect, test } from 'vitest'
import { accessoryIssues, hookKindsUsed, rollAccessory } from '../engine/gear/accessories'
import { createRng, withRng } from '../engine/rng'
import { HOOK_KINDS } from '../schema/types'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()

describe('accessory tables', () => {
  test('every base can be rolled at both tiers, and every affix names real bases', () => {
    expect(accessoryIssues(content)).toEqual([])
  })

  test('every hook kind appears in the table', () => {
    expect(hookKindsUsed(content)).toEqual([...HOOK_KINDS])
  })

  test('a tier-2 accessory is always worth more than a tier-1 one', () => {
    const values = (tier: 1 | 2) =>
      Array.from(
        { length: 200 },
        (_, seed) => withRng(createRng(seed), (d) => rollAccessory(d, content, tier, 'x'))[0]!.value
      )
    expect(Math.min(...values(2))).toBeGreaterThan(Math.max(...values(1)))
  })

  test('someone sells accessories, and loot drops some', () => {
    const sellers = Object.values(content.serviceRoles).filter((r) => r.accessories)
    expect(sellers.map((r) => r.accessories!.maxTier)).toContain(2)
    const loot = Object.values(content.situations).filter((s) =>
      JSON.stringify(s.stages).includes('"effect":"accessory"')
    )
    expect(loot.length).toBeGreaterThan(0)
  })
})
