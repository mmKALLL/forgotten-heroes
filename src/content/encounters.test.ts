import { describe, expect, test } from 'vitest'
import type { FixedOption } from '../schema/encounter'
import type { GameState } from '../schema/state'
import { allSituations } from '../engine/encounters/compile'
import { encounterOptions } from '../engine/encounters/preview'
import { encounterOver, fitsPlace } from '../engine/encounters/run'
import { rollTable } from '../engine/encounters/slots'
import { createRng, withRng } from '../engine/rng'
import { poiTypeIssues } from '../engine/world/validate'
import { lintSituation, validateSituation, validateTwistKind } from '../engine/encounters/validate'
import { newGame, step } from '../engine/state'
import { brawlCandidates } from '../engine/travel/stowaway'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()
const situations = allSituations(content).map((s) => [s.id, s] as const)
const UNFILLED = /\{[A-Za-z][a-z0-9-]*\}/

describe('every bundled situation', () => {
  test.each(situations)(
    '%s is playable: stages reachable, gotos, slots, archetypes, follow-ups',
    (_, s) => {
      expect(validateSituation(s, content)).toEqual([])
    }
  )

  test.each(situations)('%s follows the quality rules', (_, s) => {
    expect(lintSituation(s, content)).toEqual([])
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

/** Road situations from one source (site situations are played at points of interest). */
const idsFrom = (source: string) =>
  Object.values(content.situations)
    .filter((s) => s.source === source && !s.site)
    .map((s) => s.id)
    .sort()

test('Claude wrote eight situations, two of them wonders, four at sea, plus follow-ups for the lizardfolk port and the twist table', () => {
  expect(idsFrom('claude')).toEqual([
    'ambush-at-the-narrows',
    'creeping-fever',
    'flooded-ferry',
    'grudge-on-the-road',
    'hedge-witch',
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
    'wardens-on-your-trail',
  ])
  const wonders = Object.values(content.situations).filter(
    (s) => s.source === 'claude' && s.wonder && !s.site
  )
  expect(wonders.map((s) => s.id).sort()).toEqual(['lantern-moths', 'singing-stones'])
})

test('the sea has its own situations, and a hostile one for a stowaway brawl', () => {
  const sea = { biome: 'sea', region: Object.keys(content.regions)[0] } as const
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

test('every situation and twist kind says how it treats the party', () => {
  const untagged = [...allSituations(content), ...Object.values(content.twists)]
    .filter((s) => !s.disposition)
    .map((s) => s.id)
  expect(untagged).toEqual([])
  const hostile = allSituations(content).filter((s) => s.disposition === 'hostile')
  expect(hostile.length).toBeGreaterThanOrEqual(3)
})

describe('points of interest', () => {
  const types = Object.values(content.poiTypes)
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

  test('only a spring or a well refills the waterskins', () => {
    for (const t of types.filter((t) => t.water))
      expect(`${t.id} ${t.name}`).toMatch(/spring|well/i)
  })

  test('every site situation is played by some POI type', () => {
    const played = new Set(types.flatMap((t) => t.situations))
    const unused = Object.values(content.situations)
      .filter((s) => s.site && !played.has(s.id))
      .map((s) => s.id)
    expect(unused).toEqual([])
  })

  test.each(types.map((t) => [t.id, t.names] as const))(
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
