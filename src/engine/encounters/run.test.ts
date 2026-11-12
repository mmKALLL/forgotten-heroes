import { describe, expect, test } from 'vitest'
import { GameStateSchema, type GameState } from '../../schema/state'
import { createRng } from '../rng'
import { applyEffects } from './effects'
import { step } from '../state'
import { brawlCandidates } from '../travel/stowaway'
import { STOWAWAY_BRAWL_TAG } from '../travel/tuning'
import { fixtureContent, makeState } from '../test-fixtures'
import type { Content } from '../../content/build'
import { SituationSchema } from '../../schema/encounter'
import {
  TWIST_PLACE_WEIGHT,
  WIDE_BERTH,
  currentOptions,
  drawEncounter,
  encounterOver,
  fitsPlace,
  inProgress,
  startEncounter,
  twistKindWeight,
} from './run'

const content = fixtureContent()
const start = (situationId: string, state: GameState = makeState()) =>
  step(state, { type: 'startEncounter', situationId }, content)
const choose = (state: GameState, optionId: string, actorId?: string) =>
  step(state, { type: 'chooseOption', optionId, actorId }, content)
/** The same state with a different RNG seed, to sample many rolls. */
const reseed = (state: GameState, seed: number): GameState => ({ ...state, rng: createRng(seed) })
const withTwist = (state: GameState, twist: boolean): GameState => ({
  ...state,
  encounter: { ...state.encounter!, twist },
})

describe('startEncounter', () => {
  test('compiles the situation, fills slots and opens on the start stage', () => {
    const state = start('roadside')
    const encounter = state.encounter!
    expect(encounter.stage).toBe('start')
    expect(encounter.source).toBe('original')
    expect(encounter.position).toBe('normal')
    expect(encounter.nextCheckReason).toBeNull()
    expect(encounter.slots.who).toMatch(/^a wary (tinker|pilgrim)$/)
    expect(encounter.log).toEqual([
      {
        text: `${encounter.slots.who.replace('a', 'A')} begs for help. A child waits at home.`,
        tone: 'info',
      },
    ])
    expect(currentOptions(encounter).map((o) => o.id)).toEqual([
      'trust',
      'careful',
      'read',
      'rob',
      'donate',
      'leave',
    ])
    expect(state.log.at(-1)?.text).toMatch(/^Roadside\. A wary/)
    expect(GameStateSchema.parse(state)).toEqual(state)
  })

  test('is deterministic, and the hidden twist follows its chance', () => {
    expect(start('roadside')).toEqual(start('roadside'))
    const twists = Array.from(
      { length: 200 },
      (_, seed) => start('roadside', reseed(makeState(), seed)).encounter!.twist
    )
    const share = twists.filter(Boolean).length / twists.length
    expect(share).toBeGreaterThan(0.35)
    expect(share).toBeLessThan(0.65)
    expect(start('cliff').encounter!.twist).toBe(false) // no twist defined
  })

  test('a start stage that does not exist (even an Object.prototype key) logs and starts nothing', () => {
    for (const start of ['nowhere', 'constructor']) {
      const bad = SituationSchema.parse({
        id: 'bad',
        title: 'Bad',
        start,
        stages: { begin: { text: '' } },
      })
      const broken: Content = {
        ...content,
        situations: { ...content.situations, bad: { ...bad, source: 'original', file: 'x' } },
      }
      const state = step(makeState(), { type: 'startEncounter', situationId: 'bad' }, broken)
      expect(state.encounter).toBeNull()
      expect(state.log.at(-1)).toMatchObject({ text: `Bad has no stage "${start}".`, tone: 'bad' })
    }
  })

  test('another encounter cannot start while one is in progress', () => {
    const roadside = start(
      'roadside',
      makeState({ followUps: [{ situationId: 'grudge', wait: 0 }] })
    )
    for (const action of [
      { type: 'startEncounter', situationId: 'cliff' },
      { type: 'drawEncounter' },
    ] as const) {
      const after = step(roadside, action, content)
      expect({ ...after, log: roadside.log }).toEqual(roadside)
      expect(after.log.at(-1)).toMatchObject({
        text: 'Finish the current encounter first.',
        tone: 'bad',
      })
    }
    const over = { ...roadside, encounter: { ...roadside.encounter!, stage: null } }
    expect(start('cliff', over).encounter?.situation.id).toBe('cliff')
  })

  test('no one fit to travel: starting or drawing logs and starts nothing', () => {
    const downed = makeState({
      party: makeState().party.map((c) => ({ ...c, hp: 0 })),
      followUps: [{ situationId: 'grudge', wait: 0 }],
    })
    for (const action of [
      { type: 'startEncounter', situationId: 'cliff' },
      { type: 'drawEncounter' },
    ] as const) {
      const after = step(downed, action, content)
      expect({ ...after, log: downed.log }).toEqual(downed) // the due follow-up stays queued
      expect(after.log.at(-1)).toMatchObject({ text: 'No one is fit to travel on.', tone: 'bad' })
    }
  })

  test('slots fill the title and the twist', () => {
    const roadside = content.situations.roadside
    const titled: Content = {
      ...content,
      situations: {
        ...content.situations,
        roadside: {
          ...roadside,
          title: 'Meeting {who}',
          twist: { chance: 0.5, what: '{Who} is bait', table: false, opening: [] },
        },
      },
    }
    const state = step(makeState(), { type: 'startEncounter', situationId: 'roadside' }, titled)
    const who = state.encounter!.slots.who
    expect(state.log.at(-1)?.text).toMatch(new RegExp(`^Meeting ${who}\\. `))
    expect(state.encounter!.situation.title).toBe(`Meeting ${who}`)
    expect(state.encounter!.situation.twist?.what).toBe(`${who.replace('a', 'A')} is bait`)
  })

  test('an unknown situation logs and starts nothing', () => {
    const state = start('nope')
    expect(state.encounter).toBeNull()
    expect(state.log.at(-1)).toMatchObject({ text: 'Unknown encounter "nope".', tone: 'bad' })
  })
})

describe('fixed options', () => {
  test('apply the outcome and end the encounter', () => {
    const after = choose(withTwist(start('roadside'), false), 'trust')
    expect(after.gold).toBe(20 + 20) // reward 2 doubles the archetype's 10 gp
    expect(after.encounter?.stage).toBeNull()
    expect(after.encounter?.log.at(-1)?.text).toMatch(/thanks you\. \(\+20 gp\)$/)
  })

  test('the twist branch replaces the outcome when the twist is true', () => {
    const before = withTwist(start('roadside'), true)
    const after = choose(before, 'trust')
    expect(after.gold).toBe(0) // 20 − 20
    const hp = (s: GameState) => s.party.reduce((sum, c) => sum + c.hp, 0)
    expect(hp(after)).toBe(hp(before) - 3)
    expect(after.encounter?.log.at(-1)?.text).toBe('A trap! (−20 gp, someone −3 HP)')
  })

  test('unmet requirements block the option and change nothing but the journal', () => {
    const poor = start('roadside', makeState({ gold: 5 }))
    const after = choose(poor, 'donate')
    expect(after.encounter).toEqual(poor.encounter)
    expect(after.gold).toBe(5)
    expect(after.log.at(-1)).toMatchObject({ text: 'Give them money: needs 20 gp.', tone: 'bad' })
  })
})

describe('check options', () => {
  test("roll with the best actor for the skill, or the player's choice", () => {
    expect(choose(start('roadside'), 'read').lastRoll).toMatchObject({
      stat: 'insight',
      actorId: 'lyra',
      dc: 12,
    })
    expect(choose(start('roadside'), 'read', 'brom').lastRoll?.actorId).toBe('brom')
  })

  test('an unknown stage (even an Object.prototype key) has no options, and choosing does nothing', () => {
    const roadside = start('roadside')
    for (const stage of ['nowhere', 'toString']) {
      const lost = { ...roadside, encounter: { ...roadside.encounter!, stage } }
      expect(currentOptions(lost.encounter)).toEqual([])
      expect(choose(lost, 'trust')).toEqual(lost)
    }
  })

  test('once options stay on the stage, then disappear; choosing them again is a no-op', () => {
    const after = choose(start('roadside'), 'read')
    expect(after.encounter?.stage).toBe('start')
    expect(after.encounter?.used).toEqual(['start/read'])
    expect(currentOptions(after.encounter!).map((o) => o.id)).not.toContain('read')
    expect(choose(after, 'read')).toEqual(after)
  })

  test('Edge rolls with advantage, Exposed with disadvantage, and the roll spends the position', () => {
    const cliff = start('cliff')
    const edge = choose(
      { ...cliff, encounter: { ...cliff.encounter!, position: 'edge' } },
      'around'
    )
    expect(edge.encounter?.position).toBe('edge') // fixed options don't spend it
    for (const [position, mode] of [
      ['edge', 'advantage'],
      ['exposed', 'disadvantage'],
    ] as const) {
      const after = choose({ ...cliff, encounter: { ...cliff.encounter!, position } }, 'climb')
      expect(after.lastRoll?.mode).toBe(mode)
      expect(after.lastRoll?.dice).toHaveLength(2)
    }
  })

  test('a nextCheckModifier applies to the next roll only, then resets', () => {
    const cliff = start('cliff')
    const normal = choose(cliff, 'climb', 'brom').lastRoll!.modifier
    const penalised = applyEffects(cliff, [
      { effect: 'nextCheckModifier', amount: -2, reason: 'misread' },
    ])
    const first = choose(penalised, 'climb', 'brom')
    expect(first.lastRoll?.modifier).toBe(normal - 2)
    expect(first.encounter).toMatchObject({ nextCheckModifier: 0, nextCheckReason: null })
    const again = {
      ...first,
      encounter: { ...first.encounter!, stage: 'start', position: 'normal' as const },
    }
    expect(choose(again, 'climb', 'brom').lastRoll?.modifier).toBe(normal)
  })

  test('a failed read sets −2 for the check after it, not the read itself', () => {
    const normal = choose(start('roadside'), 'rob', 'lyra').lastRoll!.modifier
    for (let seed = 0; seed < 100; seed++) {
      const misread = choose(reseed(start('roadside'), seed), 'read', 'lyra')
      if (misread.lastRoll?.tier !== 'fail' && misread.lastRoll?.tier !== 'critFail') continue
      expect(misread.encounter?.nextCheckModifier).toBe(-2)
      expect(misread.encounter?.log.at(-1)?.text).toBe('You cannot tell. (−2 to the next check)')
      expect(choose(misread, 'rob', 'lyra').lastRoll?.modifier).toBe(normal - 2)
      return
    }
    throw new Error('no failed read in 100 seeds')
  })

  test('outcomes set the next position and stage', () => {
    for (let seed = 0; seed < 60; seed++) {
      const after = choose(reseed(start('cliff'), seed), 'climb')
      const tier = after.lastRoll!.tier
      const expected = {
        critFail: ['exposed', 'start'],
        fail: ['exposed', 'start'],
        partial: ['normal', 'ledge'],
        success: ['edge', 'ledge'],
        critSuccess: ['edge', 'ledge'],
      }[tier]
      expect([after.encounter?.position, after.encounter?.stage]).toEqual(expected)
      if (after.encounter?.stage === 'ledge')
        expect(after.encounter.log.at(-1)?.text).toBe('A gap yawns on the ledge.')
    }
  })

  test('{actor} in outcome text is the member who rolled', () => {
    for (let seed = 0; seed < 40; seed++) {
      const after = choose(reseed(start('cliff'), seed), 'climb', 'lyra')
      if (after.lastRoll?.tier === 'fail') {
        expect(after.encounter?.log.at(-1)?.text).toBe('Lyra slips. (Lyra −3 HP, Exposed)')
        return
      }
    }
    throw new Error('no failed climb in 40 seeds')
  })

  test('a natural 20 grants Inspiration, except on combat checks', () => {
    const crit = (situationId: string, optionId: string) => {
      for (let seed = 0; seed < 400; seed++) {
        const before = reseed(start(situationId), seed)
        const after = choose(before, optionId)
        if (after.lastRoll?.tier === 'critSuccess') return after.inspiration - before.inspiration
      }
      throw new Error('no critical success in 400 seeds')
    }
    expect(crit('cliff', 'climb')).toBe(1)
    expect(crit('grudge', 'fight')).toBe(0)
  })

  test('each check records a skill use; practice rolls and old uses do not stay', () => {
    const old = { day: 1, characterId: 'brom', skill: 'stealth' as const }
    const state = start('cliff', makeState({ day: 9, skillUses: [old, { ...old, day: 3 }] }))
    const after = choose(state, 'climb')
    expect(after.skillUses).toEqual([
      { ...old, day: 3 },
      { day: 9, characterId: 'brom', skill: 'athletics' },
    ])
    const practised = step(
      makeState(),
      { type: 'practiceCheck', stat: 'athletics', dc: 10, mode: 'normal' },
      content
    )
    expect(practised.skillUses).toEqual([])
  })

  test('the encounter ends when no one is left standing', () => {
    const frail = makeState({ party: makeState().party.map((c) => ({ ...c, hp: 1 })) })
    for (let seed = 0; seed < 100; seed++) {
      const after = choose(reseed(start('grudge', frail), seed), 'fight')
      if (after.lastRoll?.tier === 'fail' || after.lastRoll?.tier === 'critFail') {
        expect(after.encounter?.stage).toBeNull()
        expect(after.log.at(-1)).toMatchObject({ text: 'No one is left standing.', tone: 'bad' })
        return
      }
    }
    throw new Error('no failed fight in 100 seeds')
  })

  test('choosing never mutates the input state', () => {
    const before = start('cliff')
    const snapshot = structuredClone(before)
    choose(before, 'climb')
    expect(before).toEqual(snapshot)
  })
})

describe('encounterOver', () => {
  const down = (state: GameState): GameState => ({
    ...state,
    party: state.party.map((c) => ({ ...c, hp: 0 })),
  })

  test('is true with no encounter or an ended one, false while options can be chosen', () => {
    expect(encounterOver(makeState())).toBe(true)
    const cliff = start('cliff')
    expect(encounterOver(cliff)).toBe(false)
    expect(inProgress(cliff)).toBe(true)
    expect(encounterOver({ ...cliff, encounter: { ...cliff.encounter!, stage: null } })).toBe(true)
  })

  test('a downed party with only checks (or unaffordable options) left is over, and can move on', () => {
    // Grudge: a check, and a fixed option that needs 5 gp.
    const stuck = down(start('grudge', makeState({ gold: 0 })))
    expect(encounterOver(stuck)).toBe(true)
    expect(inProgress(stuck)).toBe(false)
    // Fixed options need no one to act: going around the cliff is still possible.
    expect(encounterOver(down(start('cliff')))).toBe(false)
    // Closing works, and a new encounter is refused only because no one can travel.
    expect(step(stuck, { type: 'closeEncounter' }, content).encounter).toBeNull()
    const again = step(stuck, { type: 'startEncounter', situationId: 'cliff' }, content)
    expect(again.log.at(-1)?.text).toBe('No one is fit to travel on.')
  })
})

describe('drawing encounters and follow-ups', () => {
  const draw = (state: GameState, sources?: ('original' | 'procedural')[]) =>
    step(state, { type: 'drawEncounter', sources }, content)

  test('random draws respect the source filter and never pick follow-up-only situations', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = reseed(makeState(), seed)
      expect(draw(state).encounter?.situation.id).not.toBe('grudge')
      expect(draw(state, ['procedural']).encounter?.situation.id).toBe('plea')
    }
  })

  test('an empty filter logs and starts nothing', () => {
    const after = step(makeState(), { type: 'drawEncounter', sources: [] }, content)
    expect(after.encounter).toBeNull()
    expect(after.log.at(-1)?.tone).toBe('bad')
  })

  test('a follow-up fires after its wait, whatever the filter', () => {
    const queued = makeState({ followUps: [{ situationId: 'grudge', wait: 1 }] })
    const first = draw(queued, ['procedural'])
    expect(first.encounter?.situation.id).toBe('plea')
    expect(first.followUps).toEqual([{ situationId: 'grudge', wait: 0 }])
    const second = draw(step(first, { type: 'closeEncounter' }, content), ['procedural'])
    expect(second.encounter?.situation.id).toBe('grudge')
    expect(second.followUps).toEqual([])
  })

  test('every encounter that starts moves the other queued follow-ups one closer', () => {
    const queued = makeState({ followUps: [{ situationId: 'grudge', wait: 2 }] })
    expect(start('cliff', queued).followUps).toEqual([{ situationId: 'grudge', wait: 1 }])
    const due = makeState({
      followUps: [
        { situationId: 'grudge', wait: 0 },
        { situationId: 'cliff', wait: 2 },
      ],
    })
    const after = draw(due)
    expect(after.encounter?.situation.id).toBe('grudge')
    expect(after.followUps).toEqual([{ situationId: 'cliff', wait: 1 }])
  })

  test('a due follow-up to a situation that no longer exists is dropped, and the draw is random', () => {
    const stale = makeState({
      followUps: [
        { situationId: 'gone', wait: 0 },
        { situationId: 'grudge', wait: 1 },
      ],
    })
    const after = draw(stale, ['procedural'])
    expect(after.encounter?.situation.id).toBe('plea')
    expect(after.followUps).toEqual([{ situationId: 'grudge', wait: 0 }])
  })

  test('follow-ups queued during an encounter are not moved by its own start', () => {
    for (let seed = 0; seed < 200; seed++) {
      const after = choose(reseed(start('roadside'), seed), 'rob', 'lyra')
      if (after.lastRoll?.tier !== 'success') continue
      expect(after.followUps).toEqual([{ situationId: 'grudge', wait: 1, queuedDay: after.day }])
      return
    }
    throw new Error('no successful robbery in 200 seeds')
  })

  test('closeEncounter clears the encounter', () => {
    expect(step(start('cliff'), { type: 'closeEncounter' }, content).encounter).toBeNull()
  })
})

describe('strain', () => {
  test('the third check with a skill in a day strains whoever rolled it', () => {
    const uses = [
      { day: 1, characterId: 'brom', skill: 'athletics' as const },
      { day: 1, characterId: 'brom', skill: 'athletics' as const },
    ]
    const after = choose(start('cliff', makeState({ skillUses: uses })), 'climb', 'brom')
    expect(after.party.find((c) => c.id === 'brom')!.strain).toEqual({ athletics: 1 })
    expect(after.log.map((e) => e.text)).toContain('Brom is strained: Athletics −1 until it fades.')
  })

  test('the first two checks of the day do not', () => {
    const after = choose(start('cliff'), 'climb', 'brom')
    expect(after.party.find((c) => c.id === 'brom')!.strain).toEqual({})
  })
})

describe('drawing for a place on the road', () => {
  const tagged = structuredClone(content)
  tagged.situations.cliff.biomes = ['hills', 'mountains']
  tagged.situations.roadside.regions = ['ashmoor']
  const drawnIn = (biome: 'plains' | 'hills' | 'marsh', region: string) => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 100; seed++) {
      const state = drawEncounter(reseed(makeState(), seed), tagged, undefined, { biome, region })
      if (state.encounter) seen.add(state.encounter.situation.id)
    }
    return seen
  }

  test('untagged situations happen anywhere on land; tagged ones only where they fit', () => {
    expect(drawnIn('plains', 'greenvale')).toEqual(new Set(['plea', 'starfall']))
    expect(drawnIn('hills', 'greenvale')).toContain('cliff')
    expect(drawnIn('marsh', 'ashmoor')).toContain('roadside')
  })

  test('at sea only sea situations are drawn, and with none nothing happens', () => {
    const state = makeState()
    expect(drawEncounter(state, tagged, undefined, { biome: 'sea', region: 'farisle' })).toBe(state)
    expect(fitsPlace({ biomes: ['sea'] }, { biome: 'sea', region: 'farisle' })).toBe(true)
    expect(fitsPlace({}, { biome: 'sea', region: 'farisle' })).toBe(false)
  })

  test('a due follow-up comes first on land; at sea it waits for land unless it fits the sea', () => {
    const due = makeState({ followUps: [{ situationId: 'grudge', wait: 0 }] })
    const sea = { biome: 'sea', region: 'farisle' } as const
    const land = { biome: 'marsh', region: 'ashmoor' } as const
    expect(drawEncounter(due, tagged, undefined, land).encounter?.situation.id).toBe('grudge')
    // Nothing fits the sea: nothing happens, and the follow-up is still due.
    const waited = drawEncounter(due, tagged, undefined, sea)
    expect(waited.encounter).toBeNull()
    expect(waited.followUps).toEqual(due.followUps)
    // A sea situation is drawn instead, and the follow-up stays due for land.
    const salty = structuredClone(tagged)
    salty.situations.cliff.biomes = ['sea']
    const drawn = drawEncounter(due, salty, undefined, sea)
    expect(drawn.encounter?.situation.id).toBe('cliff')
    expect(drawn.followUps).toEqual(due.followUps)
    // A follow-up that fits the sea happens there.
    salty.situations.grudge.biomes = ['sea']
    expect(drawEncounter(due, salty, undefined, sea).encounter?.situation.id).toBe('grudge')
  })
})

describe('site situations', () => {
  const SITES = ['orc-war-camp-raid', 'herbalist-visit', 'singing-stones']

  test('the fixtures have one per POI type', () => {
    for (const id of SITES) expect(content.situations[id].site).toBe(true)
  })

  test('drawEncounter never picks a site, even when it is the only one that fits', () => {
    const atSea = structuredClone(content)
    atSea.situations['orc-war-camp-raid'].biomes = ['sea']
    const state = makeState()
    expect(drawEncounter(state, atSea, undefined, { biome: 'sea', region: 'farisle' })).toBe(state)

    // The deck's unplaced draw skips them too.
    const onlySites = structuredClone(content)
    for (const s of Object.values(onlySites.situations)) if (!s.site) s.weight = 0
    for (const t of Object.values(onlySites.situationTemplates)) t.weight = 0
    expect(drawEncounter(state, onlySites).encounter).toBeNull()

    for (let seed = 0; seed < 200; seed++) {
      const drawn = drawEncounter(reseed(makeState(), seed), content, undefined, {
        biome: 'hills',
        region: 'greenvale',
      })
      expect(SITES).not.toContain(drawn.encounter?.situation.id)
    }
  })

  test('a stowaway brawl is never a site', () => {
    const aboard = structuredClone(content)
    aboard.situations['orc-war-camp-raid'].biomes = ['sea']
    aboard.situations['orc-war-camp-raid'].tags = [STOWAWAY_BRAWL_TAG]
    expect(brawlCandidates(aboard, { biome: 'sea', region: 'farisle' })).toEqual([])
  })

  test('a site can still be started directly', () => {
    expect(start('herbalist-visit').encounter?.situation.id).toBe('herbalist-visit')
  })
})

describe('a cautious party on the road', () => {
  // A heavy, hostile cliff, so most draws are hostile.
  const hostile = structuredClone(content)
  hostile.situations.cliff.disposition = 'hostile'
  hostile.situations.cliff.weight = 10
  const hills = { biome: 'hills', region: 'greenvale' } as const
  const draws = (pace: 'cautious' | 'steady') =>
    Array.from({ length: 400 }, (_, seed) =>
      drawEncounter(reseed(makeState(), seed), hostile, undefined, {
        ...hills,
        pace,
        coverTracks: false,
      })
    )

  test('gives some hostile encounters a wide berth, and no others', () => {
    const cautious = draws('cautious')
    const avoided = cautious.filter((s) => s.encounter === null)
    const cliffs = cautious.filter((s) => s.encounter?.situation.id === 'cliff')
    const share = avoided.length / (avoided.length + cliffs.length)
    expect(share).toBeGreaterThan(0.3)
    expect(share).toBeLessThan(0.5)
    for (const state of avoided) {
      expect(state.log.at(-1)!.text).toBe(WIDE_BERTH)
      expect(state.followUps).toEqual([])
    }
    // Pleasant and neutral encounters keep their usual rate.
    const others = (states: GameState[]) =>
      states.filter((s) => s.encounter && s.encounter.situation.id !== 'cliff').length
    expect(others(cautious)).toBe(others(draws('steady')))
  })

  test('at any other pace every hostile draw happens', () => {
    expect(draws('steady').every((s) => s.encounter !== null)).toBe(true)
  })

  test('a due follow-up is never avoided this way', () => {
    const due = makeState({ followUps: [{ situationId: 'grudge', wait: 0 }] })
    for (let seed = 0; seed < 20; seed++) {
      const state = drawEncounter(reseed(due, seed), hostile, undefined, {
        ...hills,
        pace: 'cautious',
        coverTracks: false,
      })
      expect(state.encounter?.situation.id).toBe('grudge')
    }
  })
})

describe('twist kinds that fit the place', () => {
  const regions = makeState().world.regions
  const threat = regions.ashmoor.threat
  const byRegion = structuredClone(content)
  byRegion.twists.theft.regions = ['greenvale']
  const byThreat = structuredClone(content)
  byThreat.twists.ambush.threats = [threat]

  test('kinds tagged with the region or its threat weigh more', () => {
    const { theft } = byRegion.twists
    const { ambush } = byThreat.twists
    const greenvale = { biome: 'plains', region: 'greenvale' } as const
    expect(twistKindWeight(theft, greenvale, null)).toBe(theft.weight * TWIST_PLACE_WEIGHT)
    expect(twistKindWeight(theft, { ...greenvale, region: 'ashmoor' }, null)).toBe(theft.weight)
    expect(twistKindWeight(ambush, greenvale, threat)).toBe(ambush.weight * TWIST_PLACE_WEIGHT)
    expect(twistKindWeight(ambush, undefined, null)).toBe(ambush.weight)
    // Terrain counts too, but tags never stack.
    const both = { ...ambush, biomes: ['plains' as const] }
    expect(twistKindWeight(both, greenvale, threat)).toBe(ambush.weight * TWIST_PLACE_WEIGHT)
    expect(twistKindWeight(both, { ...greenvale, biome: 'hills' }, null)).toBe(ambush.weight)
  })

  const thefts = (c: Content, region: string) => {
    let count = 0
    for (let seed = 0; seed < 300; seed++) {
      const state = startEncounter(reseed(makeState(), seed), c, 'stranger', {
        biome: 'plains',
        region,
      })
      if (state.encounter?.twistKind?.id === 'theft') count++
    }
    return count
  }

  test('so they are drawn more often there', () => {
    // Theft weighs 1 against ambush's 3; in Greenvale it weighs 2.
    expect(thefts(byRegion, 'greenvale')).toBeGreaterThan(thefts(byRegion, 'ashmoor') + 30)
    // Where Ashmoor's threat holds the roads, ambush weighs 6, so theft is rarer.
    const elsewhere = Object.keys(regions).find((r) => regions[r].threat !== threat)
    if (elsewhere)
      expect(thefts(byThreat, 'ashmoor')).toBeLessThan(thefts(byThreat, elsewhere) - 15)
    expect(thefts(byThreat, 'ashmoor')).toBeLessThan(thefts(content, 'ashmoor') - 15)
  })
})
