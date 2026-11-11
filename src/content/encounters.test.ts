import { describe, expect, test } from 'vitest'
import type { FixedOption } from '../schema/encounter'
import type { GameState } from '../schema/state'
import { allSituations } from '../engine/encounters/compile'
import { encounterOptions } from '../engine/encounters/preview'
import { encounterOver } from '../engine/encounters/run'
import { lintSituation, validateSituation } from '../engine/encounters/validate'
import { newGame, step } from '../engine/state'
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

  test('trusting help pays more than cautious help, and loses more to a twist', () => {
    const gold = (id: string, twist: boolean) => {
      const option = content.archetypes['someone-in-need'].options.find(
        (o) => o.id === id
      ) as FixedOption
      const branch = twist ? option.outcome.twist! : option.outcome
      return branch.effects.reduce((sum, e) => sum + (e.effect === 'gold' ? e.amount : 0), 0)
    }
    expect(gold('help-trusting', false)).toBeGreaterThan(gold('help-cautious', false))
    expect(gold('help-trusting', true)).toBeLessThan(gold('help-cautious', true))
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

const idsFrom = (source: string) =>
  Object.values(content.situations)
    .filter((s) => s.source === source)
    .map((s) => s.id)
    .sort()

test('Claude wrote eight situations, two of them wonders, plus the follow-up for the lizardfolk port', () => {
  expect(idsFrom('claude')).toEqual([
    'ambush-at-the-narrows',
    'flooded-ferry',
    'grudge-on-the-road',
    'hedge-witch',
    'lantern-moths',
    'lizardfolk-herb',
    'mapmakers-apprentice',
    'pilgrims-at-dusk',
    'singing-stones',
  ])
  const wonders = Object.values(content.situations).filter((s) => s.source === 'claude' && s.wonder)
  expect(wonders.map((s) => s.id).sort()).toEqual(['lantern-moths', 'singing-stones'])
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
