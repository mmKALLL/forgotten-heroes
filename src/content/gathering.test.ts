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
