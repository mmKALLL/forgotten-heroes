import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { EffectSchema, RequirementSchema, type Effect } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import type { PoiState } from '../../schema/world'
import { applyEffects, describeEffect } from '../encounters/effects'
import { encounterOptions } from '../encounters/preview'
import { unmetRequirements } from '../encounters/run'
import { previewCheck } from '../preview'
import { createRng } from '../rng'
import { rollCheck, TIERS, type Tier } from '../rules/checks'
import { availableActions, step } from '../state'
import { brom, fixtureContent, lyra, makeEncounter, makeState } from '../test-fixtures'
import { FORAGE_DC } from '../travel/tuning'
import {
  EXPLORE_DAYS,
  EXPLORE_DC_BONUS,
  NOTHING_TO_LEARN,
  PICKED_CLEAN,
  exploreOption,
} from './explore'
import { domainThreatLevel } from './pois'
import { territory } from './territory'

const content = fixtureContent()
const spots = territory(content).spots

/** A POI on the i-th spot of a domain's territory (sorted by id). */
const poi = (domain: string, i: number, overrides: Partial<PoiState> = {}): PoiState => ({
  type: 'orc-war-camp',
  spot: spots[domain][i],
  domain,
  name: `Camp ${domain} ${i}`,
  threat: 2,
  discovered: false,
  cleared: false,
  ...overrides,
})

/** A state in a world with exactly these POIs. */
const withPois = (
  pois: Record<string, PoiState>,
  overrides: Partial<GameState> = {}
): GameState => {
  const state = makeState(overrides)
  return { ...state, world: { ...state.world, pois } }
}

const fx = (...effects: unknown[]): Effect[] => effects.map((e) => EffectSchema.parse(e))
const discovered = (state: GameState) =>
  Object.entries(state.world.pois)
    .filter(([, p]) => p.discovered)
    .map(([id]) => id)
    .sort()

describe('discoverPoi', () => {
  // In greenvale-1: poi-1 (farther) and poi-2 (nearer); poi-3 in greenvale-2 (same land);
  // poi-4 in ashmoor-1 (another land); poi-5 a herbalist in greenvale-1.
  const km = territory(content).km
  const g1 = [...spots['greenvale-1']].sort((a, b) => km[a] - km[b])
  const near = spots['greenvale-1'].indexOf(g1[0])
  const far = spots['greenvale-1'].indexOf(g1.at(-1)!)
  const pois = {
    'poi-1': poi('greenvale-1', far),
    'poi-2': poi('greenvale-1', near),
    'poi-3': poi('greenvale-2', 0),
    'poi-4': poi('ashmoor-1', 0),
  }
  const at = (extra: Record<string, PoiState> = {}) =>
    withPois({ ...pois, ...extra }, { encounter: makeEncounter({ domain: 'greenvale-1' }) })
  const apply = (state: GameState, effect: unknown) => applyEffects(state, fx(effect), { content })

  test('reveals the nearest undiscovered POI of the encounter’s domain', () => {
    const after = apply(at(), { effect: 'discoverPoi' })
    expect(discovered(after)).toEqual(['poi-2'])
    expect(after.log.at(-1)!.text).toBe('You learn of Camp greenvale-1 ' + near + ' (war camp).')
    expect(after.encounter!.log.at(-1)!.text).toBe(after.log.at(-1)!.text)
    expect(discovered(apply(after, { effect: 'discoverPoi' }))).toEqual(['poi-1', 'poi-2'])
  })

  test('stays in the domain unless the scope is the land', () => {
    const domain = apply(at(), { effect: 'discoverPoi', count: 3 })
    expect(discovered(domain)).toEqual(['poi-1', 'poi-2'])
    const land = apply(at(), { effect: 'discoverPoi', count: 3, scope: 'land' })
    expect(discovered(land)).toEqual(['poi-1', 'poi-2', 'poi-3'])
  })

  test('with a category, reveals only that category', () => {
    const hut = poi('greenvale-1', far, { type: 'herbalist-hut', threat: 0, name: 'Old Wen’s hut' })
    const after = apply(at({ 'poi-5': hut }), { effect: 'discoverPoi', category: 'expert' })
    expect(discovered(after)).toEqual(['poi-5'])
  })

  test('when nothing is left, nothing changes but a line in the journal', () => {
    const none = withPois({}, { encounter: makeEncounter({ domain: 'greenvale-1' }) })
    const after = apply(none, { effect: 'discoverPoi', count: 2 })
    expect(after.world).toEqual(none.world)
    expect(after.log.at(-1)!.text).toBe(NOTHING_TO_LEARN)
  })

  test('reads as a clue in previews', () => {
    expect(describeEffect(fx({ effect: 'discoverPoi' })[0], 'Lyra')).toBe('reveals a site nearby')
    expect(describeEffect(fx({ effect: 'discoverPoi', count: 2, scope: 'land' })[0], 'Lyra')).toBe(
      'reveals 2 sites in the land'
    )
    expect(describeEffect(fx({ effect: 'discoverPoi', category: 'dungeon' })[0], 'Lyra')).toBe(
      'reveals a dungeon nearby'
    )
  })
})

describe('clearPoi', () => {
  test('clears the POI being visited, lowering its domain’s threat', () => {
    const state = withPois(
      { 'poi-1': poi('ashmoor-1', 0, { discovered: true }) },
      { encounter: makeEncounter({ poi: 'poi-1', domain: 'ashmoor-1' }) }
    )
    state.world.lands.ashmoor.threatStrength = 3
    state.world.domains['ashmoor-1'].garrison = 2
    expect(domainThreatLevel(state.world, 'ashmoor-1')).toBe(3)
    const after = applyEffects(state, fx({ effect: 'clearPoi' }), { content })
    expect(after.world.pois['poi-1'].cleared).toBe(true)
    expect(domainThreatLevel(after.world, 'ashmoor-1')).toBe(1)
    expect(describeEffect(fx({ effect: 'clearPoi' })[0], 'Lyra')).toBe('clears the site')
  })

  test('does nothing outside a POI', () => {
    const state = withPois({ 'poi-1': poi('ashmoor-1', 0) }, { encounter: makeEncounter() })
    expect(applyEffects(state, fx({ effect: 'clearPoi' }), { content })).toEqual(state)
  })
})

describe('trainSkill and the untrained requirement', () => {
  const state = makeState()
  const train = (s: GameState, skill: string) =>
    applyEffects(s, fx({ effect: 'trainSkill', skill }), { content })
  const skills = (s: GameState) => s.party.map((c) => c.skillProficiencies)

  test('trains the best-suited member who lacks the skill', () => {
    // Lyra (DEX 14) is the better untrained sneak; only Brom lacks Insight.
    expect(skills(train(state, 'stealth'))[1]).toContain('stealth')
    expect(skills(train(state, 'insight'))[0]).toContain('insight')
    expect(skills(train(state, 'athletics'))[1]).toContain('athletics')
    expect(train(state, 'stealth').log.at(-1)!.text).toBe('Lyra is now trained in Stealth.')
  })

  test('ties go to party order', () => {
    const twins = makeState({
      party: [
        { ...brom, id: 'a' },
        { ...brom, id: 'b' },
      ],
    })
    const after = train(twins, 'history')
    expect(after.party[0].skillProficiencies).toContain('history')
    expect(after.party[1].skillProficiencies).not.toContain('history')
  })

  test('when everyone knows it already, nothing changes', () => {
    const both = train(state, 'insight')
    const again = train(both, 'insight')
    expect(again.party).toEqual(both.party)
  })

  test('untrained gates an option once everyone is proficient', () => {
    const req = [RequirementSchema.parse({ req: 'untrained', skill: 'insight' })]
    expect(unmetRequirements(state, req)).toEqual([])
    const both = train(state, 'insight')
    expect(unmetRequirements(both, req)).toEqual(['everyone already knows Insight'])
    // In an encounter, the option shows as unavailable with that reason.
    const lesson = makeEncounter({
      situation: {
        ...makeEncounter().situation,
        stages: {
          start: {
            text: 'A teacher.',
            options: [
              {
                id: 'learn',
                kind: 'fixed',
                label: 'Learn',
                once: false,
                requires: req,
                outcome: {
                  text: 'You learn.',
                  effects: fx({ effect: 'trainSkill', skill: 'insight' }),
                },
              },
            ],
          },
        },
      } as never,
    })
    const [option] = encounterOptions({ ...both, encounter: lesson })
    expect(option.available).toBe(false)
    expect(option.unmet).toEqual(['everyone already knows Insight'])
    expect(describeEffect(fx({ effect: 'trainSkill', skill: 'insight' })[0], 'Lyra')).toBe(
      'someone learns Insight'
    )
  })
})

describe('visitPoi', () => {
  const pois = {
    'poi-1': poi('greenvale-1', 0, { discovered: true }),
    'poi-2': poi('greenvale-1', 1),
    'poi-3': poi('greenvale-2', 0, { discovered: true, cleared: true }),
  }
  const visit = (location: string | null, extra: Partial<GameState> = {}) =>
    step(withPois(pois, { location, ...extra }), { type: 'visitPoi' }, content)

  test('starts one of the type’s situations, at that POI and in its domain', () => {
    const state = visit('poi-1')
    expect(state.encounter?.situation.id).toBe('orc-war-camp-raid')
    expect(state.encounter?.poi).toBe('poi-1')
    expect(state.encounter?.domain).toBe('greenvale-1')
  })

  test('is refused away from a POI, at an undiscovered or cleared one, and in an encounter', () => {
    for (const where of ['greenvale-1', 'poi-2', 'poi-3', null]) {
      const state = visit(where)
      expect(state.encounter).toBeNull()
      expect(state.log.at(-1)!.tone).toBe('bad')
    }
    const busy = step(
      step(
        withPois(pois, { location: 'poi-1' }),
        { type: 'startEncounter', situationId: 'cliff' },
        content
      ),
      { type: 'visitPoi' },
      content
    )
    expect(busy.encounter?.situation.id).toBe('cliff')
  })
})

describe('explore', () => {
  const pois = {
    'poi-1': poi('greenvale-1', 0),
    'poi-2': poi('greenvale-1', 1),
    'poi-3': poi('greenvale-1', 2),
  }
  const here = (overrides: Partial<GameState> = {}) =>
    withPois(pois, { location: 'greenvale-1', ...overrides })

  test('the best of Survival and Perception rolls, against the terrain’s forage DC + 2', () => {
    const state = here()
    const option = exploreOption(state, content)!
    const dc = FORAGE_DC.plains + EXPLORE_DC_BONUS
    // Brom (WIS 12) beats Lyra; Survival comes first on a tie.
    expect(option).toMatchObject({ actorId: 'brom', skill: 'survival', dc, days: EXPLORE_DAYS })
    expect(option.chances).toEqual(previewCheck(state, 'survival', dc, 'normal')!.odds)
    expect(option.outcomes).toHaveLength(TIERS.length)
    // What each tier finds and how long it takes, for previews in any language.
    expect(option.finds).toEqual({
      critFail: { found: 0, days: EXPLORE_DAYS },
      fail: { found: 0, days: EXPLORE_DAYS },
      partial: { found: 1, days: EXPLORE_DAYS + 1 },
      success: { found: 1, days: EXPLORE_DAYS },
      critSuccess: { found: 2, days: EXPLORE_DAYS },
    })
    // A trained eye wins.
    const keen = {
      ...lyra,
      skillProficiencies: [...lyra.skillProficiencies, 'perception' as const],
    }
    expect(exploreOption(here({ party: [brom, keen] }), content)).toMatchObject({
      actorId: 'lyra',
      skill: 'perception',
    })
  })

  test('at a POI it searches that POI’s domain; on the road or in an encounter it is unavailable', () => {
    const atPoi = withPois(
      { ...pois, 'poi-9': poi('ashmoor-1', 0, { discovered: true }) },
      {
        location: 'poi-9',
      }
    )
    expect(exploreOption(atPoi, content)!.dc).toBe(FORAGE_DC.marsh + EXPLORE_DC_BONUS)
    expect(exploreOption(here({ location: null }), content)).toBeNull()
    const busy = step(here(), { type: 'startEncounter', situationId: 'cliff' }, content)
    expect(exploreOption(busy, content)).toBeNull()
    expect(step(here({ location: null }), { type: 'explore' }, content).log.at(-1)!.tone).toBe(
      'bad'
    )
  })

  test('availableActions lists explore with its preview', () => {
    const state = here()
    expect(availableActions(state, content)).toContainEqual({
      type: 'explore',
      option: exploreOption(state, content),
    })
    expect(availableActions(here({ location: null }), content)).toEqual([])
  })

  /** A state whose explore roll lands on this tier. */
  function rolling(tier: Tier, c: Content = content): GameState {
    const option = exploreOption(here(), c)!
    for (let seed = 0; seed < 2000; seed++) {
      const state = here({ rng: createRng(seed) })
      const [roll] = rollCheck(state.rng, option.modifier, option.dc)
      if (roll.tier === tier) return state
    }
    throw new Error(`no seed rolls ${tier}`)
  }

  test.each([
    ['fail', EXPLORE_DAYS, 0],
    ['partial', EXPLORE_DAYS + 1, 1],
    ['success', EXPLORE_DAYS, 1],
    ['critSuccess', EXPLORE_DAYS, 2],
  ] as const)('a %s takes %i days and finds %i', (tier, days, found) => {
    const state = rolling(tier)
    const after = step(state, { type: 'explore' }, content)
    expect(after.day).toBe(state.day + days)
    expect(discovered(after)).toHaveLength(found)
    expect(after.encounter).toBeNull()
    expect(after.location).toBe('greenvale-1')
    expect(after.skillUses.at(-1)).toMatchObject({ characterId: 'brom', skill: 'survival' })
    expect(after.lastRoll?.tier).toBe(tier)
    expect(after.inspiration).toBe(state.inspiration + (tier === 'critSuccess' ? 1 : 0))
  })

  test('a critical failure finds nothing and runs into something hostile', () => {
    const hostile = structuredClone(content)
    hostile.situations.cliff.disposition = 'hostile'
    const state = rolling('critFail', hostile)
    const after = step(state, { type: 'explore' }, hostile)
    expect(discovered(after)).toEqual([])
    expect(after.encounter?.situation.id).toBe('cliff')
    expect(after.encounter?.situation.disposition).toBe('hostile')
    expect(after.encounter?.domain).toBe('greenvale-1')
  })

  test('the party eats its own food: no inn, even in town', () => {
    const state = rolling('fail')
    const after = step(state, { type: 'explore' }, content)
    expect(after.gold).toBe(state.gold)
    expect(after.log.some((e) => e.text.includes('inn'))).toBe(false)
  })

  test('in a picked-clean domain only a successful search says so', () => {
    const empty = (tier: Tier) => {
      const state = rolling(tier)
      return step({ ...state, world: { ...state.world, pois: {} } }, { type: 'explore' }, content)
    }
    const texts = (s: GameState) => s.log.map((e) => e.text)
    expect(texts(empty('success'))).toContain(PICKED_CLEAN)
    expect(texts(empty('critSuccess'))).toContain(PICKED_CLEAN)
    expect(texts(empty('partial'))).toContain(PICKED_CLEAN)
    expect(texts(empty('fail'))).not.toContain(PICKED_CLEAN)
    // Up front, the option is offered as usual.
    expect(exploreOption(withPois({}, { location: 'greenvale-1' }), content)).not.toBeNull()
  })
})
