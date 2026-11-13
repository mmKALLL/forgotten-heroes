import { describe, expect, test } from 'vitest'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { drawEncounter } from '../encounters/run'
import { createRng } from '../rng'
import { rollCheck, type Tier } from '../rules/checks'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { rumourOption } from '../town/rumours'
import { compass } from '../world/geo'
import { CRISIS_ACT_OPEN, CRISIS_WEAKNESS_CLUES } from '../constants'
import { summonsOnArrival } from './clues'

const content = fixtureContent()

/**
 * The fixture Crisis (acts open on days 30, 130, 230 and are due 100, 200, 300) with the party in
 * `here`, which has a tavern.
 */
function at(here: string, crisis: Partial<CrisisState> = {}, day = 50): GameState {
  const base = makeState({ location: here, day, gold: 50, doneHere: [] })
  const settlements = { ...base.world.settlements }
  settlements[here] = {
    ...settlements[here],
    services: [...new Set([...settlements[here].services, 'inn-tavern'])],
  }
  return {
    ...base,
    world: { ...base.world, settlements },
    crisis: { ...base.crisis!, ...crisis },
  }
}

/** A state whose rumour roll lands on this tier. */
function rolling(tier: Tier, base: GameState): GameState {
  const option = rumourOption(base, content)!
  for (let seed = 0; seed < 5000; seed++) {
    const state = { ...base, rng: createRng(seed) }
    if (rollCheck(state.rng, option.modifier, option.dc)[0].tier === tier) return state
  }
  throw new Error(`no seed rolls ${tier}`)
}

const listen = (s: GameState) => step(s, { type: 'listenRumours' }, content)

/** The domain of act I's key site, and a mainland settlement in another land. */
function places(): { inLand: string; elsewhere: string } {
  const state = makeState()
  const domain = state.world.pois[state.crisis!.acts[0].key].domain
  const land = content.settlements[domain].region
  const elsewhere = Object.values(content.settlements).find(
    (s) => s.island === 'mainland' && s.region !== land
  )!.id
  return { inLand: domain, elsewhere }
}

describe('rumours', () => {
  /** Act I's lead won on day 35: its key site is where it is played. */
  const led = { leads: [35, null, null] }

  test('a success in the land of the act’s site adds a clue, and its preview said so', () => {
    const state = rolling('success', at(places().inLand, { ...led, clues: [2, 0, 0] }))
    const option = rumourOption(state, content)!
    expect(option.crisis).toBe('clue')
    const success = option.outcomes.find((o) => o.tier === 'success')!
    expect(success.text).toMatch(/and a clue to Morvaine's plot$/)
    expect(listen(state).crisis!.clues).toEqual([3, 0, 0])
  })

  test('in the act’s land with every clue already known, a success promises and adds nothing', () => {
    const full = [CRISIS_WEAKNESS_CLUES, 0, 0]
    const state = rolling('success', at(places().inLand, { ...led, clues: full }))
    const option = rumourOption(state, content)!
    expect(option.crisis).toBeNull()
    const success = option.outcomes.find((o) => o.tier === 'success')!
    expect(success.text).not.toMatch(/Morvaine/)
    const heard = listen(state)
    expect(heard.crisis!.clues).toEqual(full)
    expect(
      heard.log
        .slice(state.log.length)
        .map((l) => l.text)
        .join('\n')
    ).not.toMatch(/Act I|clue/)
  })

  test('a success elsewhere points the way and adds no clue', () => {
    const { inLand, elsewhere } = places()
    const state = rolling('success', at(elsewhere, { ...led, clues: [2, 0, 0] }))
    expect(rumourOption(state, content)!.crisis).toBe('direction')
    const heard = listen(state)
    expect(heard.crisis!.clues).toEqual([2, 0, 0])
    const region = content.regions[content.settlements[inLand].region]
    const way = compass(content.settlements[elsewhere].at, region.label)
    expect(heard.log.map((l) => l.text)).toContain(
      `Talk of Morvaine's doings comes from the ${way}, out of ${region.name}.`
    )
  })

  test('before the plan, a success’s site is act I’s lead; before act I opens, nothing', () => {
    const state = rolling('success', at(places().elsewhere))
    expect(rumourOption(state, content)!.crisis).toBe('reveal')
    const heard = listen(state)
    expect(heard.world.pois[state.crisis!.acts[0].lead].discovered).toBe(true)
    expect(heard.log.some((l) => l.text.startsWith('Over the ale, someone says: "Folk say'))).toBe(
      true
    )
    const early = rolling('success', at(places().elsewhere, {}, CRISIS_ACT_OPEN - 1))
    expect(rumourOption(early, content)!.crisis).toBeNull()
  })
})

describe('the summons', () => {
  const site = (s: GameState) => s.world.pois[s.crisis!.acts[0].lead]

  test('fires once from act I’s open day, not before, and not once the lead is known', () => {
    const here = places().elsewhere
    const early = at(here, {}, CRISIS_ACT_OPEN - 1)
    expect(summonsOnArrival(early, content)).toEqual(early)
    const due = at(here, {}, CRISIS_ACT_OPEN)
    const told = summonsOnArrival(due, content)
    expect(site(told).discovered).toBe(true)
    expect(told.log.some((l) => l.text.includes(' takes you aside: "Folk say'))).toBe(true)
    expect(summonsOnArrival(told, content)).toEqual(told)
    // Once the plan is known, there is no summons.
    const learned = at(here, { leads: [35, null, null] }, 40)
    expect(summonsOnArrival(learned, content)).toEqual(learned)
  })

  test('comes on a real arrival', () => {
    let state = at('greenvale-1', {}, 30)
    state = step(state, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
    for (let i = 0; i < 30 && state.travel; i++) {
      state = step(state, { type: state.encounter ? 'closeEncounter' : 'continueJourney' }, content)
    }
    expect(state.location).toBe('greenvale-2')
    expect(site(state).discovered).toBe(true)
  })
})

describe('omens', () => {
  const marsh = { biome: 'marsh' as const, land: 'ashmoor', domain: 'ashmoor-1' }
  /** How often the omen is drawn on an Ashmoor marsh road in 300 draws. */
  function omens(state: GameState): number {
    let count = 0
    for (let seed = 0; seed < 300; seed++) {
      const drawn = drawEncounter({ ...state, rng: createRng(seed) }, content, undefined, marsh)
      if (drawn.encounter?.situation.id === 'test-omen') count++
    }
    return count
  }

  test('is drawn while its villain’s Crisis is undecided, never for another or after it ends', () => {
    const undecided = at('ashmoor-1', { leads: [35, null, null] })
    expect(omens(undecided)).toBeGreaterThan(0)
    expect(omens({ ...undecided, crisis: { ...undecided.crisis!, villain: 'someone-else' } })).toBe(
      0
    )
    const won = at('ashmoor-1', { leads: [35, 36, 37], thwarted: [40, 41, 42] })
    expect(omens(won)).toBe(0)
    expect(omens({ ...undecided, day: 101 })).toBe(0)
    expect(omens({ ...undecided, crisis: null })).toBe(0)
  })
})
