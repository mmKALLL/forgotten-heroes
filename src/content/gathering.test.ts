import { expect, test } from 'vitest'
import { newGame } from '../engine/state'
import { gatherOptions } from '../engine/world/gather'
import { BIOMES } from '../schema/types'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()

test('every land biome has something to gather', () => {
  const rules = Object.values(content.gatherRules)
  for (const biome of BIOMES.filter((b) => b !== 'sea')) {
    expect(
      rules.some((r) => (r.biomes as readonly string[]).includes(biome)),
      biome
    ).toBe(true)
  }
})

test('a partial success always brings something home on fresh land, and better tiers no less', () => {
  for (const rule of Object.values(content.gatherRules)) {
    const y = rule.yield
    expect(y.partial, rule.id).toBeGreaterThanOrEqual(1)
    expect(y.success, rule.id).toBeGreaterThanOrEqual(y.partial)
    expect(y.critSuccess, rule.id).toBeGreaterThanOrEqual(y.success)
  }
  // As offered: the party's workers scale the yield, and nothing is picked over yet.
  const state = newGame(1, content)
  for (const id of Object.keys(state.world.settlements)) {
    for (const o of gatherOptions({ ...state, location: id }, content)) {
      const partial = o.outcomes.find((x) => x.tier === 'partial')!
      if (o.room > 0) expect(partial.units, `${id} ${o.rule}`).toBeGreaterThanOrEqual(1)
    }
  }
})

test('every gathered good is worth something, and every settlement offers gathering', () => {
  for (const rule of Object.values(content.gatherRules)) {
    expect(content.goods[rule.good].price, rule.id).toBeGreaterThan(0)
  }
  const state = newGame(1, content)
  for (const id of Object.keys(state.world.settlements)) {
    const here = { ...state, location: id }
    expect(gatherOptions(here, content).length, id).toBeGreaterThan(0)
  }
})
