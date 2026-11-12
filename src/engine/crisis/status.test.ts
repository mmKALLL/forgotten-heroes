import { describe, expect, test } from 'vitest'
import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { CRISIS_LEEWAY_DAYS, CRISIS_WARN_DAYS } from '../constants'
import { crisisDeadlines, crisisInfo, crisisNews, crisisStatus } from './status'

const content = fixtureContent()

/** The fixture world's Crisis with acts due on days 100, 200 and 300. */
function withCrisis(crisis: Partial<CrisisState> = {}, state: Partial<GameState> = {}): GameState {
  const base = makeState(state)
  const acts = base.crisis!.acts.map((a, i) => ({ ...a, due: 100 * (i + 1) }))
  return { ...base, crisis: { ...base.crisis!, acts, ...crisis } }
}

const reveal = (state: GameState, ...ids: string[]): GameState => {
  const pois = { ...state.world.pois }
  for (const id of ids) pois[id] = { ...pois[id], discovered: true }
  return { ...state, world: { ...state.world, pois } }
}

describe('crisisStatus', () => {
  const crisis = withCrisis({ learned: 10 }).crisis!

  test('an act is late from the day after it is due, and fails after the leeway', () => {
    const at = (day: number) => crisisStatus(crisis, day)
    expect(at(1)).toMatchObject({ phase: 'act', act: 0, due: 100, daysLeft: 99, late: 0 })
    expect(at(100)).toMatchObject({ phase: 'act', late: 0, lateDc: 0, daysLeft: 0 })
    expect(at(101)).toMatchObject({ phase: 'act', late: 1, lateDc: 1 })
    const last = at(100 + CRISIS_LEEWAY_DAYS)
    expect(last.phase).toBe('act')
    expect(last.lateDc).toBeGreaterThan(at(101).lateDc)
    const failed = at(100 + CRISIS_LEEWAY_DAYS + 1)
    expect(failed).toMatchObject({ phase: 'lost', act: 0, endedDay: 100 + CRISIS_LEEWAY_DAYS + 1 })
    expect(failed.failsOn).toBe(failed.endedDay)
  })

  test('thwarting act I late leaves act II due when it was', () => {
    const late = { ...crisis, thwarted: [120, null, null] }
    expect(crisisStatus(late, 125)).toMatchObject({ phase: 'act', act: 1, due: 200, late: 0 })
    expect(crisisStatus({ ...crisis, thwarted: [50, 150, 250] }, 260)).toMatchObject({
      phase: 'won',
      act: null,
      endedDay: 250,
    })
  })

  test('the Crisis is lost even if the plan was never learned', () => {
    const unknown = withCrisis().crisis!
    expect(crisisStatus(unknown, 50).phase).toBe('unknown')
    expect(crisisStatus(unknown, 100 + CRISIS_LEEWAY_DAYS + 1).phase).toBe('lost')
  })
})

describe('crisisNews', () => {
  test('a step across two news days logs both, in order, and only once', () => {
    const before = withCrisis({ learned: 10 }, { day: 80 })
    const after = { ...before, day: 101 }
    const told = crisisNews(before, after, content)
    const lines = told.log.slice(after.log.length).map((l) => l.text)
    expect(lines).toEqual([
      `Act I, The Test Act 1, is due in ${CRISIS_WARN_DAYS}d.`,
      'Act I, The Test Act 1, is due today: each 10d late from now makes it harder.',
    ])
    const later = crisisNews(told, { ...told, day: 102 }, content)
    expect(later.log).toHaveLength(told.log.length)
  })

  test('news on days before a thwart in the same step is still told', () => {
    // Days 80 to 101 pass, and act I is thwarted on day 101: its warning (day 86) and due day
    // (100) came while it still stood.
    const before = withCrisis({ learned: 10 }, { day: 80 })
    const after = {
      ...before,
      day: 101,
      crisis: { ...before.crisis!, thwarted: [101, null, null] },
    }
    const lines = crisisNews(before, after, content)
      .log.slice(after.log.length)
      .map((l) => l.text)
    expect(lines).toEqual([
      `Act I, The Test Act 1, is due in ${CRISIS_WARN_DAYS}d.`,
      'Act I, The Test Act 1, is due today: each 10d late from now makes it harder.',
    ])
  })

  test('a real step that reaches the due day logs it', () => {
    const state = withCrisis({ learned: 10 }, { day: 99 })
    const rested = step(state, { type: 'rest', lodging: false }, content)
    expect(rested.day).toBe(100)
    expect(rested.log.filter((l) => l.text.includes('is due today'))).toHaveLength(1)
  })

  test('failing logs the act’s text, or a far-off line when the plan was never learned', () => {
    const day = 100 + CRISIS_LEEWAY_DAYS
    const known = withCrisis({ learned: 10 }, { day })
    const lost = crisisNews(known, { ...known, day: day + 1 }, content).log.slice(-2)
    expect(lost.map((l) => l.text)).toEqual([
      'Act 1 is done, and Morvaine is stronger for it.',
      'The Crisis is lost.',
    ])
    const never = withCrisis({}, { day })
    const far = crisisNews(never, { ...never, day: day + 5 }, content).log.slice(-2)
    expect(far[0].text).toBe('Far away, something you never learned of is finished.')
    // Before the plan is known there are no warnings.
    const quiet = withCrisis({}, { day: 80 })
    expect(crisisNews(quiet, { ...quiet, day: 100 }, content).log).toHaveLength(quiet.log.length)
  })
})

describe('crisisInfo', () => {
  test('before the plan only a known reveal site shows; after it, the current act and its land', () => {
    const unknown = withCrisis()
    expect(crisisInfo(unknown, content)).toMatchObject({ phase: 'unknown', name: null, acts: [] })
    expect(crisisInfo(unknown, content)!.reveal).toBeNull()
    const heard = reveal(unknown, unknown.crisis!.reveal)
    expect(crisisInfo(heard, content)!.reveal!.poi).toBe(unknown.crisis!.reveal)

    const learned = withCrisis({ learned: 10, clues: [1, 0, 0] }, { day: 90 })
    const info = crisisInfo(learned, content)!
    expect(info).toMatchObject({ name: 'Morvaine, the Test Prophet', current: 0, ended: null })
    expect(info.summary).toBe('Morvaine would wake the drowned.')
    expect(info.acts.map((a) => a.current)).toEqual([true, false, false])
    expect(info.acts[0]).toMatchObject({ n: 1, due: 100, daysLeft: 10, clues: 1, poi: null })
    expect(info.acts[0].where).toMatch(/^(Greenvale|Ashmoor)$/)
    expect(info.acts[1].where).toBeNull()
  })

  test('the current act is pressing from the journal’s warning on, and while late', () => {
    const pressing = (day: number) =>
      crisisInfo(withCrisis({ learned: 10 }, { day }), content)!.acts.map((a) => a.pressing)
    expect(pressing(100 - CRISIS_WARN_DAYS - 1)).toEqual([false, false, false])
    expect(pressing(100 - CRISIS_WARN_DAYS)).toEqual([true, false, false])
    expect(pressing(105)).toEqual([true, false, false])
  })

  test('a won Crisis shows its end once, until Keep playing', () => {
    const won = withCrisis({ learned: 10, thwarted: [50, 150, 250] }, { day: 260 })
    const info = crisisInfo(won, content)!
    expect(info.ended).toEqual({ outcome: 'won', day: 250, text: 'Morvaine is no more.' })
    expect(info.showEnd).toBe(true)
    const kept = step(won, { type: 'acknowledgeEnd' }, content)
    expect(kept.crisis!.endSeen).toBe(true)
    expect(crisisInfo(kept, content)!.showEnd).toBe(false)
    // Nothing to acknowledge while the Crisis is under way.
    const going = withCrisis({ learned: 10 })
    expect(step(going, { type: 'acknowledgeEnd' }, content)).toEqual(going)
  })
})

describe('crisisDeadlines', () => {
  test('a road to the current act’s site shows its arrival against the due day', () => {
    const state = withCrisis({ learned: 10, clues: [2, 0, 0] }, { day: 90 })
    const site = state.crisis!.acts[0].poi
    expect(crisisDeadlines(state, content, 95, site)).toMatchObject({
      act: 1,
      due: 100,
      inTime: true,
      late: 0,
    })
    expect(crisisDeadlines(state, content, 112, site)).toMatchObject({ inTime: false, late: 12 })
    expect(crisisDeadlines(state, content, 95, state.crisis!.acts[1].poi)).toBeNull()
  })
})
