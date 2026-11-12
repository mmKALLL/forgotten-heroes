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
import { NOTHING_TO_LEARN, PICKED_CLEAN, exploreOption } from './explore'
import { edgeById, pathId } from './graph'
import { domainThreatLevel } from './pois'
import { territory } from './territory'
import {
  BOON_COOLDOWN_DAYS,
  EXPLORE_DAYS,
  EXPLORE_DC_BONUS,
  FORAGE_DC,
  POWER_DC,
  POWER_STEP_DAYS,
  REINHABIT_DAYS,
  XP_DISCOVER,
} from '../constants'

const content = fixtureContent()
const spots = territory(content).spots

/** Taken again on day 1, the first day: a lair cleared REINHABIT_DAYS before is inhabited. */
const TAKEN_ON_DAY_1 = 1 - REINHABIT_DAYS

/** A POI on the i-th spot of a domain's territory (sorted by id): a lair, inhabited from day 1. */
const poi = (domain: string, i: number, overrides: Partial<PoiState> = {}): PoiState => ({
  type: 'orc-war-camp',
  category: 'lair',
  spot: spots[domain][i],
  domain,
  name: `Camp ${domain} ${i}`,
  threat: 2,
  discovered: false,
  clearedDay: TAKEN_ON_DAY_1,
  boonDay: null,
  ...overrides,
})

/** A state in a world with exactly these POIs (and so no Crisis, whose sites are POIs). */
const withPois = (
  pois: Record<string, PoiState>,
  overrides: Partial<GameState> = {}
): GameState => {
  const state = makeState({ crisis: null, ...overrides })
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
    expect(after.log.at(-2)!.text).toBe('You learn of Camp greenvale-1 ' + near + ' (war camp).')
    expect(after.log.at(-1)!.text).toBe(`+${XP_DISCOVER} XP: Camp greenvale-1 ${near} found`)
    expect(after.party.map((c) => c.xp)).toEqual([XP_DISCOVER, XP_DISCOVER])
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

  test('undiscovered: met while a search like it would still find something', () => {
    const req = (r: object) => [RequirementSchema.parse({ req: 'undiscovered', ...r })]
    // Only lairs here (the war camps), in Greenvale 1 and 2.
    expect(unmetRequirements(at(), req({}))).toEqual([])
    expect(unmetRequirements(at(), req({ category: 'expert' }))).toEqual([
      'no expert left to learn of around here',
    ])
    const known = structuredClone(at())
    for (const id of ['poi-1', 'poi-2']) known.world.pois[id].discovered = true
    expect(unmetRequirements(known, req({}))).toEqual(['nothing left to learn of around here'])
    // Greenvale 2 is in the same land.
    expect(unmetRequirements(known, req({ scope: 'land', category: 'lair' }))).toEqual([])
    known.world.pois['poi-3'].discovered = true
    expect(unmetRequirements(known, req({ scope: 'land' }))).toEqual([
      'nothing left to learn of in this land',
    ])
    // Outside an encounter it looks around the party's place.
    const town = { ...known, encounter: null, location: 'ashmoor-1' }
    expect(unmetRequirements(town, req({}))).toEqual([])
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
  test('clears the POI being visited for a while, lowering its domain’s threat', () => {
    const state = withPois(
      { 'poi-1': poi('ashmoor-1', 0, { discovered: true }) },
      { encounter: makeEncounter({ poi: 'poi-1', domain: 'ashmoor-1' }) }
    )
    state.world.lands.ashmoor.threatStrength = 3
    state.world.domains['ashmoor-1'].garrison = 2
    expect(domainThreatLevel(state.world, 'ashmoor-1', state.day)).toBe(3)
    const after = applyEffects(state, fx({ effect: 'clearPoi' }), { content })
    expect(after.world.pois['poi-1'].clearedDay).toBe(state.day)
    expect(domainThreatLevel(after.world, 'ashmoor-1', state.day)).toBe(1)
    // Something moves in again REINHABIT_DAYS later.
    expect(domainThreatLevel(after.world, 'ashmoor-1', state.day + REINHABIT_DAYS)).toBe(3)
    expect(describeEffect(fx({ effect: 'clearPoi' })[0], 'Lyra')).toBe('clears the site')
  })

  test('pays XP, more for a site that has grown stronger', () => {
    const day = 1 + 2 * POWER_STEP_DAYS
    const at = (clearedDay: number) =>
      withPois(
        { 'poi-1': poi('ashmoor-1', 0, { discovered: true, clearedDay }) },
        { day, encounter: makeEncounter({ poi: 'poi-1', domain: 'ashmoor-1' }) }
      )
    const xpFor = (s: GameState) =>
      applyEffects(s, fx({ effect: 'clearPoi' }), { content }).party[0].xp - s.party[0].xp
    const fresh = xpFor(at(day - REINHABIT_DAYS))
    expect(fresh).toBeGreaterThan(0)
    expect(xpFor(at(TAKEN_ON_DAY_1))).toBeGreaterThan(fresh)
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
    'poi-3': poi('greenvale-2', 0, { discovered: true, clearedDay: 1 }),
  }
  const visit = (location: string | null, extra: Partial<GameState> = {}) =>
    step(withPois(pois, { location, ...extra }), { type: 'visitPoi' }, content)

  test('starts one of the type’s situations, at that POI and in its domain', () => {
    const state = visit('poi-1')
    expect(state.encounter?.situation.id).toBe('orc-war-camp-raid')
    expect(state.encounter?.poi).toBe('poi-1')
    expect(state.encounter?.domain).toBe('greenvale-1')
  })

  test('is refused away from a POI, at an undiscovered or empty one, and in an encounter', () => {
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

  test('once per arrival: a second visit is refused until the party has been away', () => {
    const first = visit('poi-1')
    expect(first.visited).toBe(true)
    const closed = step(first, { type: 'closeEncounter' }, content)
    const again = step(closed, { type: 'visitPoi' }, content)
    expect(again.encounter).toBeNull()
    expect(again.log.at(-1)).toMatchObject({ tone: 'bad' })
    expect(again.log.at(-1)!.text).toMatch(/already visited/)
    expect(availableActions(closed, content)).toContainEqual(
      expect.objectContaining({ type: 'visitPoi', available: false, code: 'visited' })
    )
    // Walk to Greenvale 1 and back: each arrival allows one visit.
    const route = edgeById(closed, content, pathId('poi-1', 'greenvale-1'))!
    const road = (from: string, to: string) =>
      ({
        ...closed,
        location: null,
        travel: {
          route: route.id,
          from,
          to,
          km: route.km,
          kmPerDay: 30,
          kmDone: route.km,
          daysDone: 1,
          days: 1,
          encounterDays: [],
          pace: 'steady',
          paceLog: [],
          forage: false,
          hired: null,
        },
      }) as GameState
    const back = step(road('greenvale-1', 'poi-1'), { type: 'continueJourney' }, content)
    expect(back.location).toBe('poi-1')
    expect(back.visited).toBe(false)
    expect(step(back, { type: 'visitPoi' }, content).encounter?.poi).toBe('poi-1')
  })
})

describe('dungeons and lairs over time', () => {
  test('one grown strong raises every check’s DC, and says so', () => {
    const day = 1 + 2 * POWER_STEP_DAYS
    const state = withPois(
      { 'poi-1': poi('greenvale-1', 0, { discovered: true }) },
      { location: 'poi-1', day }
    )
    const plain = withPois(
      { 'poi-1': poi('greenvale-1', 0, { discovered: true, clearedDay: day - REINHABIT_DAYS }) },
      { location: 'poi-1', day }
    )
    const dcOf = (s: GameState) => {
      const option = s.encounter!.situation.stages.start.options.find((o) => o.kind === 'check')!
      return option.kind === 'check' ? Number(option.check.dc) : 0
    }
    const strong = step(state, { type: 'visitPoi' }, content)
    const fresh = step(plain, { type: 'visitPoi' }, content)
    expect(dcOf(strong)).toBe(dcOf(fresh) + 2 * POWER_DC)
    expect(strong.encounter!.log.at(-1)!.text).toBe(
      `It has grown stronger since it was taken: every check here is DC +${2 * POWER_DC}.`
    )
  })

  test('word of a known site cleared by the realm, or taken again, reaches the party', () => {
    // Cleared by the party on day 1: something moves in on day 1 + REINHABIT_DAYS.
    const state = withPois(
      {
        'poi-1': poi('greenvale-1', 0, { discovered: true, clearedDay: 1 }),
        'poi-2': poi('greenvale-1', 1, { clearedDay: 1 }),
      },
      { location: 'greenvale-1', day: REINHABIT_DAYS }
    )
    const rested = step(state, { type: 'rest' }, content)
    const news = rested.log.filter((e) => e.text.startsWith('Word reaches you'))
    expect(news.map((e) => e.text)).toEqual([
      'Word reaches you: something has moved into Camp greenvale-1 0 again.',
    ])
    // Nothing more the next day.
    const again = step(rested, { type: 'rest' }, content)
    expect(again.log.filter((e) => e.text.startsWith('Word reaches you'))).toHaveLength(1)
  })
})

describe('siteReady: a site’s boon on a cooldown', () => {
  const shrine = makeEncounter({
    poi: 'poi-1',
    domain: 'greenvale-1',
    situation: {
      ...makeEncounter().situation,
      site: true,
      stages: {
        start: {
          text: 'A shrine.',
          options: [
            {
              id: 'pray',
              kind: 'fixed',
              label: 'Pray',
              requires: [RequirementSchema.parse({ req: 'siteReady' })],
              outcome: {
                text: 'You feel blessed.',
                effects: fx({ effect: 'inspiration', amount: 1 }),
              },
            },
            {
              id: 'leave',
              kind: 'fixed',
              label: 'Leave',
              requires: [],
              outcome: { text: 'Bye.', effects: [] },
            },
          ],
        },
      },
    } as never,
  })
  const at = (boonDay: number | null, day = 40) =>
    withPois(
      { 'poi-1': poi('greenvale-1', 0, { discovered: true, boonDay }) },
      { location: 'poi-1', encounter: shrine, day }
    )
  const ready = [RequirementSchema.parse({ req: 'siteReady' })]

  test('is met until the boon is taken; taking it starts the cooldown', () => {
    const state = at(null)
    expect(unmetRequirements(state, ready)).toEqual([])
    const after = step(state, { type: 'chooseOption', optionId: 'pray' }, content)
    expect(after.inspiration).toBe(state.inspiration + 1)
    expect(after.world.pois['poi-1'].boonDay).toBe(40)
  })

  test(`is unmet for ${BOON_COOLDOWN_DAYS} days, with the days left as the reason`, () => {
    expect(unmetRequirements(at(30), ready)).toEqual([
      'the blessing here is spent; it returns in 20 days',
    ])
    expect(unmetRequirements(at(11), ready)).toEqual([
      'the blessing here is spent; it returns in 1 day',
    ])
    expect(unmetRequirements(at(10), ready)).toEqual([])
    const [pray] = encounterOptions(at(30))
    expect(pray.available).toBe(false)
    const refused = step(at(30), { type: 'chooseOption', optionId: 'pray' }, content)
    expect(refused.inspiration).toBe(0)
  })

  test('away from a site there is no boon to spend', () => {
    const deck = { ...at(null), encounter: { ...shrine, poi: null } }
    expect(unmetRequirements(deck, ready)).toEqual([])
    const after = step(deck, { type: 'chooseOption', optionId: 'pray' }, content)
    expect(after.world.pois['poi-1'].boonDay).toBeNull()
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
    expect(option.findChance).toBeCloseTo(
      option.chances.partial + option.chances.success + option.chances.critSuccess
    )
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
