import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { createRng } from '../rng'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { suppliesLast, supplyOutlook } from './outlook'

const content = fixtureContent()
const lastLine = (s: GameState) => s.log.at(-1)!.text

/** On the three-day plains road, with no encounters, carrying `water` and foraging. */
function onTheRoad(water: number, seed: number): GameState {
  const home = makeState({
    location: 'greenvale-1',
    rng: createRng(seed),
    goods: { food: 10, water },
  })
  const out = step(home, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
  // Setting out tops the water up: put it back to what the test asks for.
  return { ...out, goods: { food: 10, water }, travel: { ...out.travel!, encounterDays: [] } }
}

describe('supplyOutlook', () => {
  test('says whether the food and water carried last the rest of the road', () => {
    expect(supplyOutlook(onTheRoad(8, 1), content)).toEqual({ food: true, water: true })
    const dry = { ...onTheRoad(8, 1), goods: { food: 0, water: 0 } }
    expect(supplyOutlook(dry, content)).toEqual({ food: false, water: false })
    expect(supplyOutlook(makeState({ location: 'greenvale-1' }), content)).toEqual({
      food: true,
      water: true,
    })
  })
})

describe('Continue stops on a supply warning', () => {
  test('once, on the day the supplies stop lasting to the end of the road', () => {
    let warned = 0
    for (let seed = 1; seed <= 40; seed++) {
      const out = onTheRoad(3, seed)
      if (!suppliesLast(supplyOutlook(out, content))) continue
      const next = step(out, { type: 'continueJourney' }, content)
      if (!/won’t last to/.test(lastLine(next))) continue
      warned += 1
      expect(next.travel).not.toBeNull()
      expect(suppliesLast(supplyOutlook(next, content))).toBe(false)
      expect(lastLine(next)).toMatch(/^At this rate the water won’t last to .+\.$/)
      // The next Continue walks on: the supplies already didn't last as it began.
      const after = step(next, { type: 'continueJourney' }, content)
      expect(lastLine(after)).not.toMatch(/won’t last to/)
    }
    expect(warned).toBeGreaterThan(0)
  })

  test('not when the supplies never lasted: the walk goes on until someone runs short', () => {
    const out = { ...onTheRoad(8, 1), goods: { food: 3, water: 8 } }
    expect(supplyOutlook(out, content).food).toBe(false)
    const next = step(out, { type: 'continueJourney' }, content)
    expect(next.log.some((e) => /won’t last to/.test(e.text))).toBe(false)
  })
})
