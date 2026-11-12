import { describe, expect, test } from 'vitest'
import { hopsFrom } from '../engine/crisis/generate'
import { newGame } from '../engine/state'
import { testCrisis } from '../engine/test-fixtures'
import { poiReach } from '../engine/travel/reach'
import { territory } from '../engine/world/territory'
import { CRISIS_ACT_SPREAD } from '../engine/constants'
import type { GameState } from '../schema/state'
import { buildContent, type Content } from './build'
import { bundledFiles, loadBundledContent } from './bundled'

/**
 * The Altaeus map with its villains. Until the bundled data has villains (Plan 5b Track K), the
 * engine fixture's villain stands in, so the statistic measures the geography either way.
 */
function crisisContent(): Content {
  const bundled = loadBundledContent()
  if (Object.keys(bundled.villains).length > 0) return bundled
  const { content, errors } = buildContent({ ...bundledFiles, ...testCrisis })
  if (errors.length > 0) throw new Error(JSON.stringify(errors))
  return content
}

const content = crisisContent()

describe('the Crisis on Altaeus (seeds 1–50)', () => {
  const worlds = Array.from({ length: 50 }, (_, i) => newGame(i + 1, content))
  const days = (state: GameState, poi: string) =>
    poiReach(state, content, state.location!, poi)?.days ?? Infinity
  const share = (ok: (state: GameState) => boolean) => worlds.filter(ok).length / worlds.length

  test('rolls on every seed, with acts II and III spread out', () => {
    const { adjacent } = territory(content)
    for (const state of worlds) {
      expect(state.crisis, `seed ${state.seed}`).not.toBeNull()
      const domains = state.crisis!.acts.map((a) => state.world.pois[a.poi].domain)
      const island = new Set(Object.keys(content.settlements))
      for (const i of [1, 2]) {
        const hops = hopsFrom(adjacent, domains[i - 1], island).get(domains[i])
        expect(hops, `seed ${state.seed}`).toBeGreaterThanOrEqual(CRISIS_ACT_SPREAD)
      }
    }
  })

  test('act I’s site is 4–12 steady days from the start in at least 90% of worlds', () => {
    const act1 = (s: GameState) => days(s, s.crisis!.acts[0].poi)
    expect(share((s) => act1(s) >= 4 && act1(s) <= 12)).toBeGreaterThanOrEqual(0.9)
  })

  test('the reveal site is at most 8 steady days from the start in at least 90% of worlds', () => {
    expect(share((s) => days(s, s.crisis!.reveal) <= 8)).toBeGreaterThanOrEqual(0.9)
  })
})
