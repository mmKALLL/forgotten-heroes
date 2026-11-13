import { describe, expect, test } from 'vitest'
import type { FixedOption, Option, OutcomeBranch, Situation } from '../schema/encounter'
import { GOOD_CATEGORY, GOODS, POI_CATEGORIES, WEALTH_TAGS, type Biome } from '../schema/types'
import type { GameState } from '../schema/state'
import { allSituations } from '../engine/encounters/compile'
import { challengeSize, playsRound } from '../engine/encounters/challenge'
import { applyEffects } from '../engine/encounters/effects'
import { encounterOptions } from '../engine/encounters/preview'
import { encounterOver, fitsPlace } from '../engine/encounters/run'
import { rollTable } from '../engine/encounters/slots'
import { createRng, withRng } from '../engine/rng'
import { dungeonIssues, poiTypeIssues } from '../engine/world/validate'
import {
  NEEDS_DESCRIPTION,
  lintSituation,
  validateSituation,
  validateTwistKind,
} from '../engine/encounters/validate'
import { newGame, step } from '../engine/state'
import { brawlCandidates } from '../engine/travel/stowaway'
import { troubleCandidates } from '../engine/town/rumours'
import { loadBundledContent } from './bundled'
import type { Sourced } from './build'

const content = loadBundledContent()
const situations = allSituations(content).map((s) => [s.id, s] as const)
const UNFILLED = /\{[A-Za-z][a-z0-9-]*\}/

/**
 * The quality rules, except that the user's own situations (data/original/) may lack check
 * descriptions: those are the designer's to write (the Encounter Deck still flags them).
 */
const lint = (s: Situation) =>
  lintSituation(s, content).filter(
    (issue) => (s as Sourced<Situation>).source !== 'original' || !issue.endsWith(NEEDS_DESCRIPTION)
  )

describe('every bundled situation', () => {
  test.each(situations)(
    '%s is playable: stages reachable, gotos, slots, archetypes, follow-ups',
    (_, s) => {
      expect(validateSituation(s, content)).toEqual([])
    }
  )

  test.each(situations)('%s follows the quality rules', (_, s) => {
    expect(lint(s)).toEqual([])
  })

  test.each(situations)('%s plays to the end with every slot filled', (id) => {
    for (let seed = 0; seed < 6; seed++) {
      let state: GameState = step(
        newGame(seed, content),
        { type: 'startEncounter', situationId: id },
        content
      )
      for (let turn = 0; state.encounter?.stage != null && turn < 20; turn++) {
        const available = encounterOptions(state).filter((o) => o.available)
        if (available.length === 0) break
        const option = available[(seed + turn) % available.length]
        state = step(state, { type: 'chooseOption', optionId: option.id }, content)
      }
      for (const entry of state.encounter!.log) expect(entry.text).not.toMatch(UNFILLED)
    }
  })
})

describe('archetypes', () => {
  test('hostile-group and someone-in-need offer the options the design names', () => {
    const ids = (id: string) => content.archetypes[id].options.map((o) => o.id)
    expect(ids('hostile-group')).toEqual(['fight', 'sneak', 'parley', 'bribe', 'flee'])
    expect(ids('someone-in-need')).toEqual([
      'help-trusting',
      'help-cautious',
      'read-them',
      'ignore',
      'exploit',
    ])
  })

  test('trusting help pays more than cautious help, and walks into the twist worse', () => {
    const outcome = (id: string) =>
      (content.archetypes['someone-in-need'].options.find((o) => o.id === id) as FixedOption)
        .outcome
    const gold = (id: string) =>
      outcome(id).effects.reduce((sum, e) => sum + (e.effect === 'gold' ? e.amount : 0), 0)
    expect(gold('help-trusting')).toBeGreaterThan(gold('help-cautious'))
    // Both escalate into the twist; trusting goes in Exposed and takes the opening hit.
    expect(outcome('help-trusting').twist).toMatchObject({
      goto: '@twist',
      effects: [{ effect: 'position', position: 'exposed' }, { effect: 'openingHit' }],
    })
    expect(outcome('help-cautious').twist).toMatchObject({
      goto: '@twist',
      effects: [
        { effect: 'position', position: 'normal' },
        { effect: 'position', position: 'edge', if: { cond: 'twistRevealed' } },
      ],
    })
  })
})

describe('the twist table', () => {
  test('has the ten kinds the design names', () => {
    expect(Object.keys(content.twists).sort()).toEqual([
      'ambush',
      'contagion',
      'false-claim',
      'fey-bargain',
      'fugitive',
      'informant',
      'lure',
      'predator-bait',
      'recruiter',
      'theft',
    ])
    expect(Object.values(content.twists).every((k) => k.source === 'procedural')).toBe(true)
  })

  test.each(Object.keys(content.twists))('%s is a valid escalation', (id) => {
    expect(validateTwistKind(content.twists[id], content)).toEqual([])
  })
})

test('SRD creatures are imported, and parts tables feed three templates', () => {
  const creatures = Object.values(content.creatures)
  expect(creatures.length).toBeGreaterThanOrEqual(15)
  expect(creatures.every((c) => c.source === 'imported')).toBe(true)
  expect(Object.keys(content.partsTables)).toEqual(
    expect.arrayContaining([
      'who',
      'who-attitude',
      'who-ancestry',
      'who-occupation',
      'motive',
      'stakes',
      'complication',
    ])
  )
  expect(Object.keys(content.situationTemplates).sort()).toEqual([
    'night-visitor',
    'roadside-plea',
    'toll-gang',
  ])
})

/**
 * Road situations from one source (site situations are played at points of interest). Crisis
 * omens are checked in src/content/crisis.test.ts.
 */
const idsFrom = (source: string) =>
  Object.values(content.situations)
    .filter((s) => s.source === source && !s.site && s.villains.length === 0)
    .map((s) => s.id)
    .sort()

/** The second batch of road situations (road-situations-2.json), aimed at the thinnest terrains. */
const ROAD_BATCH_2 = [
  'becalmed',
  'buried-column',
  'couriers-purse',
  'darts-from-the-green',
  'dry-cistern',
  'false-lights',
  'fire-in-the-grass',
  'logging-camp',
  'nets-in-the-reeds',
  'peat-cutters-find',
  'pool-under-the-falls',
  'riders-in-the-grass',
  'rope-bridge',
  'salt-caravan',
  'sandstorm',
  'short-of-hands',
  'snare-line',
  'sunstruck-prospector',
  'widowmaker',
]

test('Claude wrote road and sea situations, two of them wonders, plus follow-ups for the lizardfolk port and the twist table', () => {
  expect(idsFrom('claude')).toEqual(
    [
      'ambush-at-the-narrows',
      'barn-on-fire',
      'creeping-fever',
      'cutpurse-at-the-fair',
      'flooded-ferry',
      'grudge-on-the-road',
      'hedge-witch',
      'horse-thieves',
      'lantern-moths',
      'lizardfolk-herb',
      'mapmakers-apprentice',
      'passenger-overboard',
      'pilgrims-at-dusk',
      'singing-stones',
      'smugglers-below-decks',
      'sold-out-ambush',
      'something-under-the-hull',
      'squall-off-the-bow',
      'tavern-brawl',
      'toll-bridge',
      'tribute-at-the-pass',
      'wardens-on-your-trail',
      ...ROAD_BATCH_2,
    ].sort()
  )
  const wonders = Object.values(content.situations).filter(
    (s) => s.source === 'claude' && s.wonder && !s.site
  )
  expect(wonders.map((s) => s.id).sort()).toEqual(['lantern-moths', 'singing-stones'])
})

test('a rumour’s critical failure has a tavern brawl, never drawn on the road', () => {
  const fights = troubleCandidates(content)
  expect(fights.map((s) => s.id)).toEqual(['tavern-brawl'])
  expect(fights.every((s) => s.weight === 0)).toBe(true)
})

test('the sea has its own situations, and a hostile one for a stowaway brawl', () => {
  const land = Object.keys(content.regions)[0]
  const domain = Object.values(content.settlements).find((s) => s.region === land)!.id
  const sea = { biome: 'sea', land, domain } as const
  const atSea = allSituations(content).filter(
    (s) => !s.followUpOnly && s.weight > 0 && fitsPlace(s, sea)
  )
  expect(atSea.length).toBeGreaterThanOrEqual(3)
  expect(new Set(atSea.map((s) => s.disposition))).toEqual(new Set(['neutral', 'hostile']))
  expect(brawlCandidates(content, sea).map((s) => s.id)).toEqual(['smugglers-below-decks'])
})

test('the six prototype events are ported to original/', () => {
  expect(idsFrom('original')).toEqual([
    'abandoned-dwarven-mine',
    'fishermen-at-the-pond',
    'lizardfolk-ritual',
    'pit-in-the-cave',
    'unburnt-grove',
    'wolves-and-goats',
  ])
})

test('a party downed mid-encounter on the wolf path can still close it', () => {
  const started = step(
    newGame(1, content),
    { type: 'startEncounter', situationId: 'wolves-and-goats' },
    content
  )
  expect(encounterOver(started)).toBe(false)
  const downed = { ...started, party: started.party.map((c) => ({ ...c, hp: 0 })) }
  expect(encounterOptions(downed).some((o) => o.available)).toBe(false)
  expect(encounterOver(downed)).toBe(true)
})

test('some situations are tied to terrain, and the rest happen anywhere on land', () => {
  expect(content.situations['lantern-moths'].biomes).toEqual(['marsh'])
  const anywhere = allSituations(content).filter((s) => !s.biomes && !s.regions && !s.followUpOnly)
  expect(anywhere.length).toBeGreaterThan(5)
})

test('every land terrain a road crosses has at least three road situations of its own', () => {
  const terrains = new Set(
    Object.values(content.routes)
      .map((r) => r.terrain)
      .filter((t) => t !== 'sea')
  )
  const own = (terrain: Biome) =>
    allSituations(content).filter(
      (s) => !s.followUpOnly && !s.site && s.weight > 0 && (s.biomes ?? []).includes(terrain)
    )
  for (const terrain of terrains)
    expect([terrain, own(terrain).length >= 3]).toEqual([terrain, true])
})

test('every situation and twist kind says how it treats the party', () => {
  const untagged = [...allSituations(content), ...Object.values(content.twists)]
    .filter((s) => !s.disposition)
    .map((s) => s.id)
  expect(untagged).toEqual([])
  const hostile = allSituations(content).filter((s) => s.disposition === 'hostile')
  expect(hostile.length).toBeGreaterThanOrEqual(3)
})

/** Every outcome branch of an option, twist branches included. */
const outcomesOf = (option: Option): OutcomeBranch[] =>
  (option.kind === 'fixed' ? [option.outcome] : Object.values(option.outcomes)).flatMap((o) =>
    o ? [o, ...(o.twist ? [o.twist] : [])] : []
  )

describe('points of interest', () => {
  const types = Object.values(content.poiTypes)
  // Crisis sites (weight 0) are placed by the Crisis, never drawn: src/content/crisis.test.ts.
  const drawn = types.filter((t) => t.weight > 0)
  const ofCategory = (category: string) => types.filter((t) => t.category === category)

  test('the POI type table passes the validator', () => {
    expect(types.length).toBeGreaterThan(0)
    expect(poiTypeIssues(content)).toEqual([])
  })

  test('two or three shrines, landmarks and wonders, never hostile', () => {
    for (const category of ['shrine', 'landmark', 'wonder']) {
      expect(ofCategory(category).length).toBeGreaterThanOrEqual(2)
      expect(ofCategory(category).length).toBeLessThanOrEqual(3)
      for (const t of ofCategory(category)) expect(t.hostile).toBe(false)
    }
  })

  test('shrines and landmarks are pleasant or neutral; wonders play wonders', () => {
    for (const t of [...ofCategory('shrine'), ...ofCategory('landmark')]) {
      for (const id of t.situations) {
        expect(['pleasant', 'neutral']).toContain(content.situations[id].disposition)
      }
    }
    for (const t of ofCategory('wonder')) {
      for (const id of t.situations) expect(content.situations[id].wonder).toBe(true)
    }
  })

  test('about 40% of the sites drawn have water (designer call: most are close to a town)', () => {
    const total = drawn.reduce((n, t) => n + t.weight, 0)
    const wet = drawn.filter((t) => t.water).reduce((n, t) => n + t.weight, 0)
    expect(wet / total).toBeGreaterThan(0.25)
    expect(wet / total).toBeLessThan(0.6)
  })

  test('every site situation is played by some POI type, or in a dungeon room', () => {
    const rooms = Object.values(content.dungeons).flatMap((d) => d.rooms)
    const played = new Set([...types, ...rooms].flatMap((t) => t.situations))
    const unused = Object.values(content.situations)
      .filter((s) => s.site && !played.has(s.id))
      .map((s) => s.id)
    expect(unused).toEqual([])
  })

  test('the dungeons pass the validator', () => {
    expect(Object.keys(content.dungeons).length).toBeGreaterThan(0)
    expect(dungeonIssues(content)).toEqual([])
  })

  // Plan 6 S: a dungeon's boss room is a skill challenge sized by the dungeon's CR; the engine
  // pays the hoard on its win and drives the party out on its loss (encounters/room.ts).
  test.each(Object.values(content.dungeons).map((d) => [d.id, d] as const))(
    '%s ends in a boss room that is a skill challenge sized by its CR',
    (_, dungeon) => {
      const last = dungeon.rooms[dungeon.rooms.length - 1]
      for (const id of last.situations) {
        const s = content.situations[id]
        const stage = s.stages[s.start]
        expect(stage.challenge, id).toBeDefined()
        const { successes, failures, win, lose } = stage.challenge!
        expect({ successes, failures }, id).toEqual(challengeSize(dungeon.cr))
        const rounds = stage.options.filter(playsRound)
        expect(rounds.length, id).toBeGreaterThanOrEqual(3)
        expect(rounds.length, id).toBeLessThanOrEqual(4)
        for (const b of [win, lose]) expect(!b.goto && !b.stay, id).toBe(true)
      }
    }
  )

  test('every threat has a hostile lair keyed to it', () => {
    for (const threat of Object.keys(content.threats)) {
      const lairs = ofCategory('lair').filter((t) => t.threats.includes(threat))
      expect(lairs.length, threat).toBeGreaterThanOrEqual(1)
      for (const t of lairs) expect(t.hostile && t.threat).toBeTruthy()
    }
  })

  test('lairs are hostile tugs of war that can be cleared, and can drive the party off', () => {
    for (const t of ofCategory('lair')) {
      for (const id of t.situations) {
        const s = content.situations[id]
        expect(s.disposition, id).toBe('hostile')
        const stages = Object.values(s.stages)
        expect(stages.length, id).toBeGreaterThanOrEqual(2)
        const branches = stages.flatMap((stage) => stage.options.flatMap(outcomesOf))
        // escalation: some outcome moves on to a later stage
        expect(
          branches.some((b) => b.goto && b.goto !== s.start),
          id
        ).toBe(true)
        // success clears it; a failure costs HP and days and leaves it standing
        expect(
          branches.some((b) => b.effects.some((e) => e.effect === 'clearPoi')),
          id
        ).toBe(true)
        const drivenOff = branches.filter(
          (b) =>
            !b.goto &&
            !b.stay &&
            b.effects.some((e) => e.effect === 'days') &&
            b.effects.some((e) => e.effect === 'hp' && e.amount < 0) &&
            !b.effects.some((e) => e.effect === 'clearPoi')
        )
        expect(drivenOff.length, id).toBeGreaterThan(0)
      }
    }
  })

  test('dungeons are 3–5 stage chains to a vault: footing, a high-stakes boss, gold, cleared', () => {
    const dungeons = ofCategory('dungeon')
    expect(dungeons.length).toBeGreaterThanOrEqual(2)
    expect(dungeons.some((t) => t.hostile)).toBe(true)
    expect(dungeons.some((t) => !t.hostile)).toBe(true)
    for (const t of dungeons) {
      if (t.hostile) expect(t.threat).toEqual({ min: 1, max: 1 })
      for (const id of t.situations) {
        const s = content.situations[id]
        expect(s.disposition, id).toBe(t.hostile ? 'hostile' : 'neutral')
        const stages = Object.values(s.stages)
        expect(stages.length, id).toBeGreaterThanOrEqual(3)
        expect(stages.length, id).toBeLessThanOrEqual(5)
        const options = stages.flatMap((stage) => stage.options)
        const branches = options.flatMap(outcomesOf)
        const has = (effect: string) =>
          branches.some((b) => b.effects.some((e) => e.effect === effect))
        expect(has('position'), id).toBe(true)
        expect(has('clearPoi'), id).toBe(true)
        expect(options.some((o) => o.kind === 'check' && o.highStakes)).toBe(true)
        for (const b of branches.filter((b) => b.effects.some((e) => e.effect === 'clearPoi')))
          expect(
            b.effects.some((e) => e.effect === 'gold' && e.amount > 0),
            id
          ).toBe(true)
      }
    }
  })

  test('lone experts train a skill for a price, sell what they know, and always let you talk', () => {
    const experts = ofCategory('expert')
    expect(experts.length).toBeGreaterThanOrEqual(4)
    expect(experts.length).toBeLessThanOrEqual(6)
    for (const t of experts) {
      expect(t.hostile).toBe(false)
      for (const id of t.situations) {
        const s = content.situations[id]
        expect(s.disposition, id).toBe('neutral')
        const options = s.stages[s.start].options
        const effects = (o: Option) => outcomesOf(o).flatMap((b) => b.effects)
        // pay to train: fixed, once, gated by gold and by someone lacking the skill
        const train = options.find(
          (o) => o.kind === 'fixed' && effects(o).some((e) => e.effect === 'trainSkill') && o.once
        )
        expect(train, id).toBeDefined()
        const skill = effects(train!).find((e) => e.effect === 'trainSkill')!
        expect(train!.requires, id).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ req: 'gold' }),
            { req: 'untrained', skill: skill.effect === 'trainSkill' && skill.skill },
          ])
        )
        expect(effects(train!).some((e) => e.effect === 'gold' && e.amount < 0)).toBe(true)
        // knowledge or healing, and a way that is neither gated nor once
        const helps = options.some((o) =>
          effects(o).some((e) => e.effect === 'discoverPoi' || (e.effect === 'hp' && e.amount > 0))
        )
        expect(helps, id).toBe(true)
        expect(options.some((o) => !o.once && o.requires.length === 0)).toBe(true)
        // a check that can earn it for free
        expect(
          options.some((o) => o.kind === 'check'),
          id
        ).toBe(true)
      }
    }
    const taught = new Set(
      experts.flatMap((t) =>
        t.situations.flatMap((id) =>
          Object.values(content.situations[id].stages).flatMap((st) =>
            st.options
              .flatMap(outcomesOf)
              .flatMap((b) =>
                b.effects.flatMap((e) => (e.effect === 'trainSkill' ? [e.skill] : []))
              )
          )
        )
      )
    )
    expect(taught.size).toBeGreaterThanOrEqual(4)
  })

  test('five to eight of Claude’s road situations leave a clue to a site', () => {
    const clues = Object.values(content.situations).filter(
      (s) =>
        s.source === 'claude' &&
        !s.site &&
        Object.values(s.stages).some((st) =>
          st.options
            .flatMap(outcomesOf)
            .some((b) => b.effects.some((e) => e.effect === 'discoverPoi'))
        )
    )
    expect(clues.length).toBeGreaterThanOrEqual(5)
    expect(clues.length).toBeLessThanOrEqual(8)
    for (const s of clues) expect(s.biomes ?? []).not.toContain('sea')
  })

  test.each(drawn.map((t) => [t.id, t.names] as const))(
    '%s can be named at least 12 ways (%s), so a world rarely repeats one',
    (_, table) => {
      const [names] = withRng(createRng(11), (d) =>
        Array.from({ length: 600 }, () => rollTable(d, content, table))
      )
      expect(new Set(names).size).toBeGreaterThanOrEqual(12)
    }
  )

  test('every POI category has a type with a playable situation', () => {
    for (const category of POI_CATEGORIES) {
      const playable = ofCategory(category).filter((t) =>
        t.situations.some(
          (id) =>
            validateSituation(content.situations[id], content).length === 0 &&
            lint(content.situations[id]).length === 0
        )
      )
      expect(playable.length, category).toBeGreaterThanOrEqual(1)
    }
  })

  test('shrines and landmarks give their boons on a cooldown (siteReady)', () => {
    // A boon: Inspiration, healing, exhaustion removed or gold found. Paying for it doesn't count.
    const boon = (b: OutcomeBranch) =>
      b.effects.some(
        (e) =>
          (e.effect === 'inspiration' && e.amount > 0) ||
          (e.effect === 'hp' && e.amount > 0) ||
          e.effect === 'healFraction' ||
          (e.effect === 'exhaustion' && e.amount < 0) ||
          (e.effect === 'gold' && e.amount > 0)
      )
    for (const t of [...ofCategory('shrine'), ...ofCategory('landmark')]) {
      for (const id of t.situations) {
        for (const [stageId, stage] of Object.entries(content.situations[id].stages)) {
          for (const option of stage.options) {
            if (!outcomesOf(option).some(boon)) continue
            expect(
              option.requires.some((r) => r.req === 'siteReady'),
              `${id} ${stageId}/${option.id}`
            ).toBe(true)
          }
        }
      }
    }
  })

  test('experts are services: paid ones always open, free rest on a cooldown (siteReady)', () => {
    const pays = (o: Option) =>
      outcomesOf(o).some((b) => b.effects.some((e) => e.effect === 'gold' && e.amount < 0))
    const rests = (o: Option) =>
      outcomesOf(o).some((b) =>
        b.effects.some(
          (e) =>
            (e.effect === 'hp' && e.amount > 0) ||
            e.effect === 'healFraction' ||
            (e.effect === 'exhaustion' && e.amount < 0)
        )
      )
    let freeRests = 0
    for (const t of ofCategory('expert')) {
      for (const id of t.situations) {
        for (const [stageId, stage] of Object.entries(content.situations[id].stages)) {
          for (const option of stage.options) {
            const where = `${id} ${stageId}/${option.id}`
            const cooldown = option.requires.some((r) => r.req === 'siteReady')
            // Paid training, care and knowledge are never on a cooldown.
            if (pays(option)) expect(cooldown, where).toBe(false)
            else if (rests(option)) expect(cooldown, where).toBe(true)
            // A free fixed rest is the big one: a quarter of everyone's HP and a level of exhaustion.
            if (!pays(option) && option.kind === 'fixed' && rests(option)) {
              freeRests++
              expect(option.outcome.effects, where).toEqual(
                expect.arrayContaining([
                  { effect: 'healFraction', fraction: 0.25, target: 'all' },
                  { effect: 'exhaustion', amount: -1, target: 'all' },
                ])
              )
            }
          }
        }
      }
    }
    expect(freeRests).toBeGreaterThanOrEqual(2)
  })

  test('no site sells a clue that might reveal nothing (undiscovered)', () => {
    for (const t of types) {
      for (const id of t.situations) {
        for (const [stageId, stage] of Object.entries(content.situations[id].stages)) {
          for (const option of stage.options) {
            const branches = outcomesOf(option)
            const pays = branches.some((b) =>
              b.effects.some((e) => e.effect === 'gold' && e.amount < 0)
            )
            const clue = branches.some((b) => b.effects.some((e) => e.effect === 'discoverPoi'))
            if (!pays || !clue) continue
            expect(
              option.requires.some((r) => r.req === 'undiscovered'),
              `${id} ${stageId}/${option.id}`
            ).toBe(true)
          }
        }
      }
    }
  })

  test('quest sites are neutral placeholders with a clue and a hook for later quests', () => {
    const quests = ofCategory('quest').filter((t) => t.weight > 0)
    expect(quests.length).toBeGreaterThanOrEqual(2)
    for (const t of quests) {
      expect(t.hostile).toBe(false)
      for (const id of t.situations) {
        const s = content.situations[id]
        expect(s.disposition).toBe('neutral')
        const effects = Object.values(s.stages)
          .flatMap((st) => st.options.flatMap(outcomesOf))
          .flatMap((b) => b.effects)
        expect(
          effects.some((e) => e.effect === 'discoverPoi'),
          id
        ).toBe(true)
        expect(
          effects.some((e) => e.effect === 'log' && /quest/i.test(e.text)),
          id
        ).toBe(true)
      }
    }
  })

  test.each(drawn.map((t) => [t.id, t.names] as const))(
    '%s names come out whole from %s',
    (_, table) => {
      const [names] = withRng(createRng(7), (d) =>
        Array.from({ length: 30 }, () => rollTable(d, content, table))
      )
      for (const name of names) expect(name).not.toMatch(UNFILLED)
      expect(new Set(names).size).toBeGreaterThan(3)
    }
  )
})

test('the follow-ups that hunt the party down are pursuits', () => {
  const pursuits = Object.values(content.situations).filter((s) => s.pursuit)
  expect(pursuits.map((s) => s.id)).toEqual(
    expect.arrayContaining(['grudge-on-the-road', 'sold-out-ambush', 'wardens-on-your-trail'])
  )
  expect(pursuits.every((s) => s.followUpOnly && s.disposition === 'hostile')).toBe(true)
})

describe('goods in encounters (Plan 4)', () => {
  const all = allSituations(content)
  const options = all.flatMap((s) =>
    Object.values(s.stages).flatMap((stage) => stage.options.map((o) => ({ s, o })))
  )
  const branchesOf = (o: Option): OutcomeBranch[] =>
    (o.kind === 'fixed' ? [o.outcome] : Object.values(o.outcomes)).flatMap((b) =>
      b ? [b, ...(b.twist ? [b.twist] : [])] : []
    )
  const isPrecious = (good: string | undefined) =>
    GOODS.some((g) => g === good && GOOD_CATEGORY[g] === 'precious')

  test('each consumable is spent by at least 3 options, and an option that needs one spends it', () => {
    const spenders = new Map<string, number>()
    for (const { s, o } of options) {
      for (const req of o.requires) {
        if (req.req !== 'goods') continue
        spenders.set(req.good, (spenders.get(req.good) ?? 0) + 1)
        for (const branch of branchesOf(o)) {
          const spent = branch.effects.some(
            (e) => e.effect === 'goods' && e.good === req.good && (e.amount ?? 0) < 0
          )
          expect(spent, `${s.id}/${o.id} spends ${req.good}`).toBe(true)
        }
      }
    }
    for (const good of GOODS.filter((g) => GOOD_CATEGORY[g] === 'consumables')) {
      expect(spenders.get(good) ?? 0, good).toBeGreaterThanOrEqual(3)
    }
  })

  test('thieves and tolls are on the road, and some thieves take animals and precious goods', () => {
    const tags: readonly string[] = WEALTH_TAGS
    const wealthy = all.filter((s) => s.tags.some((t) => tags.includes(t)))
    expect(wealthy.length).toBeGreaterThanOrEqual(5)
    expect(wealthy.every((s) => !s.site && s.disposition !== 'pleasant')).toBe(true)
    const effects = options.flatMap(({ o }) => branchesOf(o).flatMap((b) => b.effects))
    expect(effects.some((e) => e.effect === 'animals' && e.animal === undefined)).toBe(true)
    expect(
      effects.some((e) => e.effect === 'goods' && e.category === 'precious' && e.fraction)
    ).toBe(true)
  })

  test('every dungeon vault and lair chief can pay out precious goods', () => {
    const hoards = all.filter(
      // A delve's hoard is paid by the engine, not by its rooms.
      (s) => s.site && !s.room && (s.tags.includes('dungeon') || s.tags.includes('lair'))
    )
    expect(hoards.length).toBeGreaterThan(0)
    for (const s of hoards) {
      const last = s.stages.vault ?? s.stages.chief
      const pays = last.options.some((o) =>
        branchesOf(o).some((b) =>
          b.effects.some((e) => e.effect === 'goods' && isPrecious(e.good) && (e.amount ?? 0) > 0)
        )
      )
      expect(pays, s.id).toBe(true)
    }
  })

  test('goods and animals effects move a stocked party the way they say', () => {
    const stocked: GameState = {
      ...newGame(1, content),
      goods: Object.fromEntries(GOODS.map((g) => [g, 8])),
      animals: { 'riding-horse': 2, mule: 1 },
    }
    const total = (s: GameState) => Object.values(s.goods).reduce((a, n) => a + n, 0)
    const herd = (s: GameState) => Object.values(s.animals).reduce((a, n) => a + n, 0)
    const effects = options.flatMap(({ o }) => branchesOf(o).flatMap((b) => b.effects))
    for (const e of effects) {
      if (e.effect !== 'goods' && e.effect !== 'animals') continue
      const after = applyEffects(stocked, [e], { content })
      const [before, now] =
        e.effect === 'goods' ? [total(stocked), total(after)] : [herd(stocked), herd(after)]
      const gains = (e.effect === 'animals' || e.fraction === undefined) && (e.amount ?? 0) > 0
      expect(Math.sign(now - before), JSON.stringify(e)).toBe(gains ? 1 : -1)
    }
  })

  test('some road outcomes change standing with the locals, both ways', () => {
    const amounts = options
      .filter(({ s }) => !s.site)
      .flatMap(({ o }) => branchesOf(o).flatMap((b) => b.effects))
      .flatMap((e) => (e.effect === 'reputation' ? [e.amount] : []))
    expect(amounts.some((n) => n > 0)).toBe(true)
    expect(amounts.some((n) => n < 0)).toBe(true)
  })
})
