import { describe, expect, test } from 'vitest'
import { EffectSchema, OptionSchema } from '../../schema/encounter'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { applyEffects, describeEffect } from '../encounters/effects'
import { encounterOptions } from '../encounters/preview'
import { step } from '../state'
import { fixtureContent, makeEncounter, makeState } from '../test-fixtures'
import { siteActions } from '../world/explore'
import { poisToDiscover } from '../world/pois'
import { dangerLevel } from '../world/danger'
import { CRISIS_SITE_CLUES, XP_DISCOVER, XP_THWART } from '../constants'
import { crisisHidden } from './sites'
import { actFailsOn, crisisInfo } from './status'

const content = fixtureContent()

/** The fixture world's Crisis with acts due on days `dues`. */
function withCrisis(
  crisis: Partial<CrisisState> = {},
  state: Partial<GameState> = {},
  dues = [100, 200, 300]
): GameState {
  const base = makeState(state)
  const acts = base.crisis!.acts.map((a, i) => ({ ...a, due: dues[i] }))
  return { ...base, crisis: { ...base.crisis!, acts, ...crisis } }
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

describe('learning the plan', () => {
  test('works once, at the reveal site, and makes act I’s land known', () => {
    const state = withCrisis({}, { day: 20 })
    const reveal = state.crisis!.reveal
    expect(at(state, state.crisis!.acts[0].poi, { effect: 'learnPlan' }).crisis!.learned).toBeNull()
    const learned = at(state, reveal, { effect: 'learnPlan' })
    expect(learned.crisis).toMatchObject({ learned: 20, clues: [1, 0, 0] })
    expect(learned.log.map((l) => l.text)).toContain(
      'Morvaine means to raise the drowned dead of the marsh.'
    )
    expect(learned.log.at(-1)!.text).toMatch(/^Morvaine's servants have been seen in \w+\.$/)
    const again = at({ ...learned, day: 30 }, reveal, { effect: 'learnPlan' })
    expect(again.crisis!.learned).toBe(20)
    expect(again.log).toHaveLength(learned.log.length)
  })
})

describe('clues', () => {
  test('before the plan, a clue reveals the reveal site', () => {
    const state = withCrisis()
    const told = at(state, null, { effect: 'crisisClue' })
    expect(told.world.pois[state.crisis!.reveal].discovered).toBe(true)
    expect(told.crisis!.clues).toEqual([0, 0, 0])
  })

  test('two clues reveal the act’s site, and the third gives the Edge there', () => {
    const state = withCrisis({ learned: 10, clues: [1, 0, 0] }, { day: 50 })
    const site = state.crisis!.acts[0].poi
    const two = at(state, null, { effect: 'crisisClue' })
    expect(two.crisis!.clues[0]).toBe(CRISIS_SITE_CLUES)
    expect(two.world.pois[site].discovered).toBe(true)
    expect(two.party[0].xp).toBe(state.party[0].xp + XP_DISCOVER)
    const three = at(two, null, { effect: 'crisisClue', amount: 2 })
    expect(three.crisis!.clues[0]).toBe(3)
    expect(three.log.at(-1)!.text).toMatch(/^You know Morvaine's weakness at /)

    const visited = step(
      standingAt({ ...three, encounter: null }, site),
      { type: 'visitPoi' },
      content
    )
    expect(visited.encounter).toMatchObject({ poi: site, position: 'edge' })
    // Before the weakness, no Edge.
    const plain = step(standingAt({ ...two, encounter: null }, site), { type: 'visitPoi' }, content)
    expect(plain.encounter!.position).toBe('normal')
  })

  test('chips name the current act', () => {
    const state = withCrisis({ learned: 10, thwarted: [40, null, null] }, { day: 50 })
    const clue = EffectSchema.parse({ effect: 'crisisClue' })
    const thwart = EffectSchema.parse({ effect: 'thwartAct' })
    expect(describeEffect(clue, 'Lyra', undefined, 2)).toBe('+1 clue: Act II')
    expect(describeEffect(thwart, 'Lyra', undefined, 1)).toBe('Thwart Act I')
    const site = state.crisis!.acts[1].poi
    const open = step(standingAt(state, site), { type: 'visitPoi' }, content)
    const finale = { ...open, encounter: { ...open.encounter!, stage: 'finale' } }
    const stop = encounterOptions(finale).find((o) => o.id === 'stop')!
    const success = stop.outcomes.find((o) => o.tier === 'success')
    expect(success && !success.hidden && success.effects).toContain('Thwart Act II')
  })
})

describe('the act sites', () => {
  test('at 15 days late every check is 2 higher than on time, danger included (preview == roll)', () => {
    // Due on day 110: days 110 and 125 have the same danger.
    const dues = [110, 210, 310]
    const dcAt = (day: number) => {
      const state = withCrisis({ learned: 10, clues: [2, 0, 0] }, { day }, dues)
      const open = step(standingAt(state, state.crisis!.acts[0].poi), { type: 'visitPoi' }, content)
      const shown = encounterOptions(open).find((o) => o.id === 'sneak')!.check!.dc
      const rolled = step(open, { type: 'chooseOption', optionId: 'sneak' }, content)
      expect(rolled.lastRoll!.dc).toBe(shown)
      return { shown, open }
    }
    expect(dangerLevel(110)).toBe(dangerLevel(125))
    const onTime = dcAt(110)
    const late = dcAt(125)
    expect(onTime.shown).toBe(12 + Math.round(12 * dangerLevel(110)))
    expect(late.shown).toBe(onTime.shown + 2)
    expect(late.open.encounter!.log.map((l) => l.text)).toContain(
      'You are 15d late: every check here is DC +2.'
    )
  })

  test('an act site is found only by exploring its domain with a clue in hand', () => {
    const state = withCrisis({ learned: 10, clues: [1, 0, 0] }, { day: 50 })
    const site = state.crisis!.acts[0].poi
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
    const noClue = withCrisis({ learned: 10, clues: [0, 0, 0] }, { day: 50 })
    expect(crisisHidden(noClue, domain).has(site)).toBe(true)
  })

  test('thwarting act I gives act II its land; a thwarted site refuses a visit', () => {
    const state = withCrisis({ learned: 10, clues: [3, 0, 0] }, { day: 60 })
    const site = state.crisis!.acts[0].poi
    const thwarted = at(state, site, { effect: 'thwartAct' })
    expect(thwarted.crisis).toMatchObject({ thwarted: [60, null, null], clues: [3, 1, 0] })
    expect(thwarted.party[0].xp).toBe(state.party[0].xp + XP_THWART)
    expect(thwarted.log.map((l) => l.text)).toContain('Act 1 is broken.')
    expect(crisisInfo(thwarted, content)!.acts[1].where).toMatch(/^(Greenvale|Ashmoor)$/)
    // Not at the site: nothing.
    expect(at(state, null, { effect: 'thwartAct' }).crisis).toEqual(state.crisis)

    const back = standingAt({ ...thwarted, encounter: null }, site)
    const visit = siteActions(back, content).find((a) => a.type === 'visitPoi')
    expect(visit).toMatchObject({ available: false, code: 'quiet' })
    expect(step(back, { type: 'visitPoi' }, content).encounter).toBeNull()
  })

  test('a choice whose days run past the act’s last day ends the visit, and its preview says so', () => {
    /** Act I's site, opened on `day`, with an approach that waits a day and goes to the finale. */
    const openOn = (day: number): GameState => {
      const state = withCrisis({ learned: 10, clues: [2, 0, 0] }, { day, gold: 10 })
      const open = step(standingAt(state, state.crisis!.acts[0].poi), { type: 'visitPoi' }, content)
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
    const failsOn = actFailsOn(100)
    const shown = (state: GameState) => {
      const outcome = encounterOptions(state).find((o) => o.id === 'wait')!.outcomes[0]
      if (outcome.hidden) throw new Error('a fixed outcome is never hidden')
      return outcome
    }
    const wait = (state: GameState) =>
      step(state, { type: 'chooseOption', optionId: 'wait' }, content)

    // In time: the visit goes on to the finale.
    const inTime = openOn(failsOn - 2)
    expect(shown(inTime)).toMatchObject({ next: 'stage' })
    expect(shown(inTime).effects.join()).not.toMatch(/too late/)
    expect(wait(inTime).encounter!.stage).toBe('finale')

    // A day too many: the act fails on the way in, and the visit ends there.
    const last = openOn(failsOn - 1)
    const preview = shown(last)
    expect(preview).toMatchObject({ next: 'end' })
    expect(preview.effects).toEqual(['1 day passes', 'too late: Act I fails'])
    const after = wait(last)
    expect(after.encounter!.stage).toBeNull()
    expect(after.gold).toBe(last.gold)
    expect(after.log.map((l) => l.text)).toEqual(
      expect.arrayContaining([
        'You wait. (1 day passes, too late: Act I fails)',
        'Too late: Act I, The Test Act 1, has failed. There is nothing left to stop here.',
      ])
    )
    expect(crisisInfo(after, content)!.phase).toBe('lost')
  })

  test('thwarting act III wins', () => {
    const state = withCrisis(
      { learned: 10, thwarted: [50, 150, null], clues: [1, 1, 1] },
      { day: 260 }
    )
    const won = at(state, state.crisis!.acts[2].poi, { effect: 'thwartAct' })
    expect(won.party[0].xp).toBe(state.party[0].xp + 3 * XP_THWART)
    expect(won.log.at(-1)!.text).toBe('Morvaine is no more.')
    expect(crisisInfo(won, content)!.ended).toMatchObject({ outcome: 'won', day: 260 })
  })
})
