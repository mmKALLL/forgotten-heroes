import { describe, expect, test } from 'vitest'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { CRISIS_ACT_HURRY, CRISIS_ACT_OPEN } from '../constants'
import { actCalendar } from './calendar'
import { crisisDeadlines, crisisInfo, crisisNews, crisisStatus } from './status'

const content = fixtureContent()

/** The fixture world's Crisis (startDay 1: acts open on days 30, 130, 230, due 100, 200, 300). */
function withCrisis(crisis: Partial<CrisisState> = {}, state: Partial<GameState> = {}): GameState {
  const base = makeState(state)
  return { ...base, crisis: { ...base.crisis!, ...crisis } }
}

const reveal = (state: GameState, ...ids: string[]): GameState => {
  const pois = { ...state.world.pois }
  for (const id of ids) pois[id] = { ...pois[id], discovered: true }
  return { ...state, world: { ...state.world, pois } }
}

describe('the calendar', () => {
  test('acts open, are expected, hurry and fall due 100 days apart, from the start day', () => {
    const crisis = withCrisis().crisis!
    expect(actCalendar(crisis, 0)).toMatchObject({ opens: CRISIS_ACT_OPEN, due: 100, failsOn: 101 })
    const later = actCalendar({ startDay: 41 }, 1)
    expect(later.opens).toBe(40 + 100 + CRISIS_ACT_OPEN)
    expect(later.opens < later.expected && later.expected < later.hurry).toBe(true)
    expect(later.due).toBe(240)
  })
})

describe('crisisStatus', () => {
  const crisis = withCrisis().crisis!
  const at = (c: CrisisState, day: number) => crisisStatus(c, day)

  test('the phase follows the day and the progress', () => {
    expect(at(crisis, 29)).toMatchObject({ phase: 'waiting', act: 0, target: null })
    expect(at(crisis, 30)).toMatchObject({ phase: 'investigation', target: crisis.acts[0].lead })
    const led = { ...crisis, leads: [40, null, null] }
    expect(at(led, 41)).toMatchObject({ phase: 'prevention', target: crisis.acts[0].key })
    // Thwarting act I on day 50 is allowed; act II then waits for its own open day.
    const early = { ...led, thwarted: [50, null, null] }
    expect(at(early, 51)).toMatchObject({ phase: 'waiting', act: 1 })
    expect(at(early, 51).phases).toEqual(['thwarted', 'dormant', 'dormant'])
    expect(at(early, 130)).toMatchObject({ phase: 'investigation', act: 1, due: 200 })
  })

  test('missing the due day loses the Crisis, even if the plan was never learned', () => {
    const led = { ...crisis, leads: [40, null, null] }
    expect(at(led, 100)).toMatchObject({ phase: 'prevention', daysLeft: 0 })
    expect(at(led, 101)).toMatchObject({ phase: 'lost', act: 0, endedDay: 101 })
    expect(at(led, 101).phases).toEqual(['failed', 'dormant', 'dormant'])
    expect(at(crisis, 101).phase).toBe('lost')
  })

  test('three thwarted acts win', () => {
    expect(at({ ...crisis, thwarted: [50, 150, 250] }, 260)).toMatchObject({
      phase: 'won',
      act: null,
      endedDay: 250,
    })
  })
})

describe('crisisNews', () => {
  test('a step across act I’s open and hurry days logs both, in order, and only once', () => {
    const before = withCrisis({}, { day: 20 })
    const after = { ...before, day: CRISIS_ACT_HURRY + 1 }
    const told = crisisNews(before, after, content)
    const lines = told.log.slice(after.log.length).map((l) => l.text)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^Word of trouble is abroad/)
    expect(lines[1]).toMatch(/little time/)
    const later = crisisNews(told, { ...told, day: told.day + 1 }, content)
    expect(later.log).toHaveLength(told.log.length)
  })

  test('once the plan is known the notes name the act, and the due day is told', () => {
    const before = withCrisis({ leads: [35, null, null] }, { day: 79 })
    const lines = crisisNews(before, { ...before, day: 100 }, content)
      .log.slice(before.log.length)
      .map((l) => l.text)
    expect(lines).toEqual([
      'Act I, The Test Act 1, is due in 20d: hurry.',
      'Act I, The Test Act 1, is due today: this is the last day to stop it.',
    ])
  })

  test('news on days before a thwart in the same step is still told', () => {
    const before = withCrisis({ leads: [35, null, null] }, { day: 79 })
    const after = {
      ...before,
      day: 101,
      crisis: { ...before.crisis!, thwarted: [100, null, null] },
    }
    const lines = crisisNews(before, after, content)
      .log.slice(after.log.length)
      .map((l) => l.text)
    expect(lines).toHaveLength(2)
  })

  test('a real step that reaches the due day logs it', () => {
    const state = withCrisis({ leads: [35, null, null] }, { day: 99 })
    const rested = step(state, { type: 'rest', lodging: false }, content)
    expect(rested.day).toBe(100)
    expect(rested.log.filter((l) => l.text.includes('is due today'))).toHaveLength(1)
  })

  test('failing logs the act’s text, or a far-off line when the plan was never learned', () => {
    const known = withCrisis({ leads: [35, null, null] }, { day: 100 })
    const lost = crisisNews(known, { ...known, day: 101 }, content).log.slice(-2)
    expect(lost.map((l) => l.text)).toEqual([
      'Act 1 is done, and Morvaine is stronger for it.',
      'The Crisis is lost.',
    ])
    const never = withCrisis({}, { day: 100 })
    const far = crisisNews(never, { ...never, day: 105 }, content).log.slice(-2)
    expect(far[0].text).toBe('Far away, something you never learned of is finished.')
  })

  test('act II opens on its own day, after an early thwart', () => {
    const before = withCrisis({ leads: [35, null, null], thwarted: [50, null, null] }, { day: 120 })
    const lines = crisisNews(before, { ...before, day: 131 }, content)
      .log.slice(before.log.length)
      .map((l) => l.text)
    expect(lines).toEqual(['Act II, The Test Act 2, has begun: Morvaine is at work again.'])
  })
})

describe('crisisInfo', () => {
  test('before the plan only a known lead shows; after it, the open act and its place', () => {
    const unknown = withCrisis({}, { day: 40 })
    expect(crisisInfo(unknown, content)).toMatchObject({
      phase: 'investigation',
      name: null,
      acts: [],
    })
    expect(crisisInfo(unknown, content)!.reveal).toBeNull()
    const lead = unknown.crisis!.acts[0].lead
    expect(crisisInfo(reveal(unknown, lead), content)!.reveal!.poi).toBe(lead)

    const learned = reveal(
      withCrisis({ leads: [35, null, null] }, { day: 90 }),
      unknown.crisis!.acts[0].key
    )
    const info = crisisInfo(learned, content)!
    expect(info).toMatchObject({ name: 'Morvaine, the Test Prophet', current: 0, ended: null })
    expect(info.summary).toBe('Morvaine would wake the drowned.')
    expect(info.acts.map((a) => a.phase)).toEqual(['prevention', 'dormant', 'dormant'])
    expect(info.acts[0]).toMatchObject({ n: 1, due: 100, daysLeft: 10 })
    expect(info.acts[0].poi).toBe(unknown.crisis!.acts[0].key)
    expect(info.acts[1].where).toBeNull()
  })

  test('the open act is pressing from its hurry day', () => {
    const pressing = (day: number) =>
      crisisInfo(withCrisis({ leads: [35, null, null] }, { day }), content)!.acts.map(
        (a) => a.pressing
      )
    expect(pressing(CRISIS_ACT_HURRY - 1)).toEqual([false, false, false])
    expect(pressing(CRISIS_ACT_HURRY)).toEqual([true, false, false])
  })

  test('a won Crisis shows its end once, until Keep playing', () => {
    const won = withCrisis({ leads: [35, 140, 240], thwarted: [50, 150, 250] }, { day: 260 })
    const info = crisisInfo(won, content)!
    expect(info.ended).toEqual({ outcome: 'won', day: 250, text: 'Morvaine is no more.' })
    expect(info.showEnd).toBe(true)
    const kept = step(won, { type: 'acknowledgeEnd' }, content)
    expect(kept.crisis!.endSeen).toBe(true)
    expect(crisisInfo(kept, content)!.showEnd).toBe(false)
    // Nothing to acknowledge while the Crisis is under way.
    const going = withCrisis({ leads: [35, null, null] }, { day: 40 })
    expect(step(going, { type: 'acknowledgeEnd' }, content)).toEqual(going)
  })
})

describe('crisisDeadlines', () => {
  test('a road to where the open act is played shows its arrival against the due day', () => {
    const state = withCrisis({ leads: [35, null, null] }, { day: 90 })
    const key = state.crisis!.acts[0].key
    expect(crisisDeadlines(state, content, 95, key)).toMatchObject({
      act: 1,
      due: 100,
      inTime: true,
      tooLate: false,
    })
    expect(crisisDeadlines(state, content, 101, key)).toMatchObject({
      inTime: false,
      tooLate: true,
    })
    // The lead, once won, is not where the act is played any more.
    expect(crisisDeadlines(state, content, 95, state.crisis!.acts[0].lead)).toBeNull()
  })
})
