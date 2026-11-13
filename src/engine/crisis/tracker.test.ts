import { describe, expect, test } from 'vitest'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { fixtureContent, makeState } from '../test-fixtures'
import { CRISIS_ACT_OPEN } from '../constants'
import { crisisTracker } from './tracker'

const content = fixtureContent()

function withCrisis(crisis: Partial<CrisisState> = {}, state: Partial<GameState> = {}): GameState {
  const base = makeState(state)
  return { ...base, crisis: { ...base.crisis!, ...crisis } }
}

const discover = (state: GameState, id: string): GameState => ({
  ...state,
  world: {
    ...state.world,
    pois: { ...state.world.pois, [id]: { ...state.world.pois[id], discovered: true } },
  },
})

describe('crisisTracker', () => {
  test('is shown from act I’s open day, and names nothing before the plan', () => {
    expect(crisisTracker(withCrisis({}, { day: CRISIS_ACT_OPEN - 1 }), content)!.visible).toBe(
      false
    )
    const open = crisisTracker(withCrisis({}, { day: CRISIS_ACT_OPEN }), content)!
    expect(open).toMatchObject({ visible: true, current: 0, outcome: null })
    expect(open.acts.map((a) => a.phase)).toEqual(['investigation', 'dormant', 'dormant'])
    expect(open.acts[0]).toMatchObject({ name: null, next: 'Ask in the towns', daysLeft: 70 })
    expect(open.acts[1].next).toBe('Stirs from day 130')
  })

  test('the next step follows what the party knows', () => {
    const state = withCrisis({}, { day: 40 })
    const { lead, key } = state.crisis!.acts[0]
    const leadName = state.world.pois[lead].name
    expect(crisisTracker(discover(state, lead), content)!.acts[0].next).toBe(
      `Follow the lead at ${leadName}`
    )
    const led = discover(withCrisis({ leads: [35, null, null] }, { day: 40 }), key)
    const act = crisisTracker(led, content)!.acts[0]
    expect(act).toMatchObject({ name: 'The Test Act 1', phase: 'prevention' })
    expect(act.next).toBe(`Strike at ${led.world.pois[key].name}`)
  })

  test('the challenge is told against the party’s level, and the surge with its act', () => {
    // The fixture's party is level 1; act I's key site is CR 6.
    const led = withCrisis({ leads: [35, null, null] }, { day: 40 })
    const act = crisisTracker(led, content)!.acts[0]
    expect(act).toMatchObject({ keyCr: 6, keyLevel: 7, gap: 'beyond' })
    const surging = withCrisis({ leads: [35, 140, null], thwarted: [50, null, null] }, { day: 195 })
    const acts = crisisTracker(surging, content)!.acts
    expect(acts[1].surge).toBeGreaterThan(0)
    expect(acts[1].surges).toBe(true)
    expect(acts[0]).toMatchObject({ phase: 'thwarted', next: null, daysLeft: null, surge: 0 })
  })

  test('the waiting penalty is told on the act whose lead goes unfollowed', () => {
    const quiet = crisisTracker(withCrisis({}, { day: 40 }), content)!.acts[0]
    expect(quiet.wait).toBe(0)
    const waiting = crisisTracker(withCrisis({}, { day: quiet.waitFrom + 4 }), content)!.acts[0]
    expect(waiting.wait).toBeGreaterThan(0)
    const led = withCrisis({ leads: [quiet.waitFrom, null, null] }, { day: quiet.waitFrom + 4 })
    expect(crisisTracker(led, content)!.acts[0].wait).toBe(0)
  })

  test('names who holds each key site once the plan is known: a lieutenant, else the villain', () => {
    const before = crisisTracker(withCrisis({}, { day: 40 }), content)!
    expect(before.acts.map((a) => a.foe)).toEqual([null, null, null])
    const known = crisisTracker(withCrisis({ leads: [35, null, null] }, { day: 40 }), content)!
    expect(known.acts.map((a) => a.foe)).toEqual(['Captain Test, the Hand', 'Morvaine', 'Morvaine'])
  })

  test('presses from the hurry day, and has no next step once the Crisis is lost', () => {
    const calm = crisisTracker(withCrisis({ leads: [35, null, null] }, { day: 79 }), content)!
    expect(calm.acts[0].pressing).toBe(false)
    const hurry = crisisTracker(withCrisis({ leads: [35, null, null] }, { day: 80 }), content)!
    expect(hurry.acts[0].pressing).toBe(true)
    const lost = crisisTracker(withCrisis({ leads: [35, null, null] }, { day: 101 }), content)!
    expect(lost.outcome).toBe('lost')
    expect(lost.acts.map((a) => a.next)).toEqual([null, null, null])
  })
})
