import { describe, expect, test } from 'vitest'
import { EffectSchema, OptionSchema, SituationSchema } from '../../schema/encounter'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { applyEffects, describeEffect } from '../encounters/effects'
import { encounterOptions } from '../encounters/preview'
import { crDc } from '../rules/challenge'
import { step } from '../state'
import { fixtureContent, makeEncounter, makeState } from '../test-fixtures'
import { exploreOption, siteActions } from '../world/explore'
import { poisToDiscover } from '../world/pois'
import { CRISIS_DC_BASE, CRISIS_SITE_CLUES, XP_DISCOVER, XP_THWART } from '../constants'
import { crisisHidden } from './sites'
import { actPhases, crisisInfo } from './status'

const content = fixtureContent()
const villain = content.villains['test-villain']

/** The fixture world's Crisis (acts open on days 30, 130, 230 and are due 100, 200, 300). */
function withCrisis(crisis: Partial<CrisisState> = {}, state: Partial<GameState> = {}): GameState {
  const base = makeState(state)
  return { ...base, crisis: { ...base.crisis!, ...crisis } }
}

const discover = (state: GameState, ...ids: string[]): GameState => {
  const pois = { ...state.world.pois }
  for (const id of ids) pois[id] = { ...pois[id], discovered: true }
  return { ...state, world: { ...state.world, pois } }
}

/** Effects applied in a situation played at `poi`. */
function at(state: GameState, poi: string | null, ...effects: unknown[]): GameState {
  const open = { ...state, encounter: makeEncounter({ poi }) }
  return applyEffects(
    open,
    effects.map((e) => EffectSchema.parse(e)),
    { content }
  )
}

/** The party standing at a site, ready to visit it. */
const standingAt = (state: GameState, poi: string): GameState => ({
  ...discover(state, poi),
  location: poi,
  travel: null,
  visited: false,
})

const visit = (state: GameState, poi: string) =>
  step(standingAt({ ...state, encounter: null }, poi), { type: 'visitPoi' }, content)

describe('winning a lead', () => {
  test('act I’s lead learns the plan, once, and reveals the key site', () => {
    const state = withCrisis({}, { day: 40 })
    const { lead, key } = state.crisis!.acts[0]
    expect(at(state, key, { effect: 'learnPlan' }).crisis!.leads[0]).toBeNull()
    const learned = at(state, lead, { effect: 'learnPlan' })
    expect(learned.crisis).toMatchObject({ leads: [40, null, null] })
    expect(learned.crisis!.clues[0]).toBe(CRISIS_SITE_CLUES)
    expect(learned.world.pois[key].discovered).toBe(true)
    expect(learned.log.map((l) => l.text)).toContain(
      'Morvaine means to raise the drowned dead of the marsh.'
    )
    expect(actPhases(learned.crisis!, 40)[0]).toBe('prevention')
    const again = at({ ...learned, day: 45 }, lead, { effect: 'learnPlan' })
    expect(again.crisis!.leads[0]).toBe(40)
    expect(again.log).toHaveLength(learned.log.length)
  })

  test('a lead site is dormant (and quiet) before its act opens', () => {
    const early = withCrisis({}, { day: 20 })
    const lead = early.crisis!.acts[0].lead
    expect(at(early, lead, { effect: 'learnPlan' }).crisis!.leads[0]).toBeNull()
    const refused = standingAt(early, lead)
    expect(siteActions(refused, content).find((a) => a.type === 'visitPoi')).toMatchObject({
      available: false,
      code: 'quiet',
    })
  })

  test('revealKeySite opens a later act’s prevention at its lead', () => {
    const state = withCrisis({ leads: [35, null, null], thwarted: [50, null, null] }, { day: 140 })
    const { lead, key } = state.crisis!.acts[1]
    const won = at(state, lead, { effect: 'revealKeySite' })
    expect(won.crisis!.leads).toEqual([35, 140, null])
    expect(won.world.pois[key].discovered).toBe(true)
    // The plan is told once only, at act I.
    expect(won.log.map((l) => l.text)).not.toContain(villain.plan.replace('{villain}', 'Morvaine'))
  })
})

describe('clues', () => {
  test('in act I before the plan, a clue reveals the lead site; before it opens, nothing', () => {
    const state = withCrisis({}, { day: 40 })
    const told = at(state, null, { effect: 'crisisClue' })
    expect(told.world.pois[state.crisis!.acts[0].lead].discovered).toBe(true)
    expect(told.crisis!.clues).toEqual([0, 0, 0])
    const early = withCrisis({}, { day: 10 })
    expect(at(early, null, { effect: 'crisisClue' }).world).toEqual(early.world)
  })

  test('two clues reveal a later act’s lead, and the third gives the Edge at its key site', () => {
    const state = withCrisis(
      { leads: [35, null, null], thwarted: [50, null, null], clues: [3, 1, 0] },
      { day: 140 }
    )
    const { lead, key } = state.crisis!.acts[1]
    const two = at(state, null, { effect: 'crisisClue' })
    expect(two.crisis!.clues[1]).toBe(CRISIS_SITE_CLUES)
    expect(two.world.pois[lead].discovered).toBe(true)
    expect(two.party[0].xp).toBe(state.party[0].xp + XP_DISCOVER)
    const three = at(two, null, { effect: 'crisisClue', amount: 2 })
    expect(three.crisis!.clues[1]).toBe(3)
    expect(three.log.at(-1)!.text).toMatch(/^You know Morvaine's weakness in Act II/)

    const led = { ...three, crisis: { ...three.crisis!, leads: [35, 141, null] } }
    expect(visit({ ...led, day: 141 }, key).encounter).toMatchObject({ poi: key, position: 'edge' })
    // At the lead, and at the key site before the weakness, no Edge.
    expect(visit(three, lead).encounter!.position).toBe('normal')
    const plain = { ...two, crisis: { ...two.crisis!, leads: [35, 141, null] } }
    expect(visit({ ...plain, day: 141 }, key).encounter!.position).toBe('normal')
  })

  test('chips name the current act', () => {
    const state = withCrisis({ leads: [35, 140, null], thwarted: [40, null, null] }, { day: 150 })
    const clue = EffectSchema.parse({ effect: 'crisisClue' })
    const thwart = EffectSchema.parse({ effect: 'thwartAct' })
    const reveal = EffectSchema.parse({ effect: 'revealKeySite' })
    expect(describeEffect(clue, 'Lyra', undefined, 2)).toBe('+1 clue: Act II')
    expect(describeEffect(thwart, 'Lyra', undefined, 1)).toBe('Thwart Act I')
    expect(describeEffect(reveal, 'Lyra', undefined, 3)).toBe("Find Act III's key site")
    const open = visit(state, state.crisis!.acts[1].key)
    const finale = { ...open, encounter: { ...open.encounter!, stage: 'finale' } }
    const stop = encounterOptions(finale).find((o) => o.id === 'stop')!
    const success = stop.outcomes.find((o) => o.tier === 'success')
    expect(success && !success.hidden && success.effects).toContain('Thwart Act II')
  })
})

describe('the act sites', () => {
  test('a Crisis visit takes its DCs from the CR, not the danger ramp (preview == roll)', () => {
    /** Act I's key site opened on `day`, and its approach's DC as shown. */
    const dcAt = (day: number) => {
      const state = withCrisis({ leads: [35, null, null] }, { day })
      const open = visit(state, state.crisis!.acts[0].key)
      const shown = encounterOptions(open).find((o) => o.id === 'sneak')!.check!.dc
      return { shown, open }
    }
    const key = villain.acts[0].keyCr
    const early = dcAt(40)
    // The fixture's approach is written DC 12.
    expect(early.shown).toBe(crDc(key) + 12 - CRISIS_DC_BASE)
    // Day 95 has more ramp danger than day 40; the CR doesn't care.
    expect(dcAt(95).shown).toBe(early.shown)
    expect(early.open.encounter!.danger).toBe(0)
    const rolled = step(early.open, { type: 'chooseOption', optionId: 'sneak' }, content)
    expect(rolled.lastRoll!.dc).toBe(early.shown)
    expect(early.open.encounter!.log.map((l) => l.text).join('\n')).toMatch(
      new RegExp(`CR ${key}, meant for level ${key + 1}`)
    )
  })

  test('a lead site is found only by exploring its domain with a clue in hand', () => {
    const state = withCrisis(
      { leads: [35, null, null], thwarted: [50, null, null], clues: [3, 1, 0] },
      { day: 140 }
    )
    const site = state.crisis!.acts[1].lead
    const domain = state.world.pois[site].domain
    // A road clue in its own domain, over the whole land.
    const clue = { ...state, encounter: makeEncounter({ domain }) }
    const searched = applyEffects(
      clue,
      [EffectSchema.parse({ effect: 'discoverPoi', count: 3, scope: 'land' })],
      { content }
    )
    expect(searched.world.pois[site].discovered).toBe(false)
    // Rumours, paid knowledge and other searches never see it; exploring its domain can.
    const search = { count: 9, scope: 'land' } as const
    expect(poisToDiscover(state.world, content, domain, search, crisisHidden(state))).not.toContain(
      site
    )
    expect(
      poisToDiscover(state.world, content, domain, search, crisisHidden(state, domain))
    ).toContain(site)
    const noClue = { ...state, crisis: { ...state.crisis!, clues: [3, 0, 0] } }
    expect(crisisHidden(noClue, domain).has(site)).toBe(true)
  })

  test('a lead coming within reach clears "fully explored" across its land, never only its domain', () => {
    const state = withCrisis(
      { leads: [35, null, null], thwarted: [50, null, null], clues: [3, 0, 0] },
      { day: 140 }
    )
    const site = state.crisis!.acts[1].lead
    const domain = state.world.pois[site].domain
    const land = state.world.domains[domain].land
    const domains = Object.keys(state.world.domains)
    const elsewhere = domains.filter((d) => state.world.domains[d].land !== land)
    const marked = { ...state, explored: domains, location: domain, travel: null }
    // Without a clue the lead stays hidden; with one, Explore doesn't return in its domain alone
    // (that would point to it): the mark lapses only with what the party learns.
    expect(exploreOption(marked, content)?.explored).toBe(true)
    const clued = { ...marked, crisis: { ...marked.crisis!, clues: [3, 1, 0] } }
    expect(exploreOption(clued, content)?.explored).toBe(true)
    // The clue line itself is what the party learns: the whole land's marks lapse.
    const situation = SituationSchema.parse({
      id: 'test-clue',
      title: 'Clue',
      stages: {
        start: {
          text: 'A whisper.',
          options: [
            {
              id: 'hear',
              kind: 'fixed',
              label: 'Listen',
              outcome: { text: 'You listen.', effects: [{ effect: 'crisisClue', amount: 1 }] },
            },
          ],
        },
      },
    })
    const heard = step(
      { ...marked, encounter: makeEncounter({ situation }) },
      { type: 'chooseOption', optionId: 'hear' },
      content
    )
    expect(heard.crisis!.clues[1]).toBe(1)
    expect(heard.explored.sort()).toEqual([...elsewhere].sort())
  })

  test('thwarting act I on day 50 is allowed, gives act II its land, and quiets the site', () => {
    const state = withCrisis({ leads: [35, null, null], clues: [3, 0, 0] }, { day: 50 })
    const site = state.crisis!.acts[0].key
    const thwarted = at(state, site, { effect: 'thwartAct' })
    expect(thwarted.crisis).toMatchObject({ thwarted: [50, null, null], clues: [3, 1, 0] })
    expect(thwarted.party[0].xp).toBe(state.party[0].xp + XP_THWART)
    expect(thwarted.log.map((l) => l.text)).toContain('Act 1 is broken.')
    // Not at the key site, or in the investigation: nothing.
    expect(at(state, null, { effect: 'thwartAct' }).crisis).toEqual(state.crisis)
    const investigating = withCrisis({}, { day: 50 })
    expect(at(investigating, site, { effect: 'thwartAct' }).crisis).toEqual(investigating.crisis)

    const back = standingAt({ ...thwarted, encounter: null }, site)
    const action = siteActions(back, content).find((a) => a.type === 'visitPoi')
    expect(action).toMatchObject({ available: false, code: 'quiet' })
    expect(step(back, { type: 'visitPoi' }, content).encounter).toBeNull()
    // Act II's lead is dormant until its open day.
    const lead = thwarted.crisis!.acts[1].lead
    expect(visit({ ...thwarted, day: 129 }, lead).encounter).toBeNull()
    expect(visit({ ...thwarted, day: 130 }, lead).encounter?.poi).toBe(lead)
  })

  test('a choice whose days run past the due day ends the visit, and its preview says so', () => {
    /** Act I's key site, opened on `day`, with an approach that waits a day and goes to the finale. */
    const openOn = (day: number): GameState => {
      const state = withCrisis({ leads: [35, null, null] }, { day, gold: 10 })
      const open = visit(state, state.crisis!.acts[0].key)
      const situation = structuredClone(open.encounter!.situation)
      situation.stages.start.options.push(
        OptionSchema.parse({
          id: 'wait',
          kind: 'fixed',
          label: 'Wait for dark',
          outcome: {
            text: 'You wait.',
            effects: [{ effect: 'days', amount: 1 }],
            goto: 'finale',
          },
        })
      )
      return { ...open, encounter: { ...open.encounter!, situation } }
    }
    const shown = (state: GameState) => {
      const outcome = encounterOptions(state).find((o) => o.id === 'wait')!.outcomes[0]
      if (outcome.hidden) throw new Error('a fixed outcome is never hidden')
      return outcome
    }
    const wait = (state: GameState) =>
      step(state, { type: 'chooseOption', optionId: 'wait' }, content)

    // In time: the visit goes on to the finale.
    const inTime = openOn(99)
    expect(shown(inTime)).toMatchObject({ next: 'stage' })
    expect(shown(inTime).effects.join()).not.toMatch(/too late/)
    expect(wait(inTime).encounter!.stage).toBe('finale')

    // On the due day, a day's wait is too many: the act fails, and the visit ends there.
    const last = openOn(100)
    const preview = shown(last)
    expect(preview).toMatchObject({ next: 'end' })
    expect(preview.effects).toEqual(['1 day passes', 'too late: Act I fails'])
    const after = wait(last)
    expect(after.encounter!.stage).toBeNull()
    expect(after.log.map((l) => l.text)).toEqual(
      expect.arrayContaining([
        'Too late: Act I, The Test Act 1, has failed. There is nothing left to stop here.',
      ])
    )
    expect(crisisInfo(after, content)!.phase).toBe('lost')
  })

  test('thwarting act III wins', () => {
    const state = withCrisis(
      { leads: [35, 140, 240], thwarted: [50, 150, null], clues: [1, 1, 1] },
      { day: 260 }
    )
    const won = at(state, state.crisis!.acts[2].key, { effect: 'thwartAct' })
    expect(won.party[0].xp).toBe(state.party[0].xp + 3 * XP_THWART)
    expect(won.log.at(-1)!.text).toBe('Morvaine is no more.')
    expect(crisisInfo(won, content)!.ended).toMatchObject({ outcome: 'won', day: 260 })
  })
})
