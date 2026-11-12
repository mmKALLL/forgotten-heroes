import { describe, expect, test } from 'vitest'
import { RunRecordSchema } from '../../schema/crisis'
import { SituationSchema } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { step } from '../state'
import { brom, fixtureContent, lyra, makeEncounter, makeState } from '../test-fixtures'
import { FALLEN_LINE, partyWiped, runEnding, runRecord, runSummary } from './ending'

const content = fixtureContent()

const dead = (c: typeof brom) => ({ ...c, exhaustion: 6 })

/** A party facing a choice that kills everyone. */
function doomed(): GameState {
  const situation = SituationSchema.parse({
    id: 'test-doom',
    title: 'Doom',
    stages: {
      start: {
        text: 'The ceiling gives way.',
        options: [
          {
            id: 'stay',
            kind: 'fixed',
            label: 'Stay',
            outcome: {
              text: 'It falls.',
              effects: [{ effect: 'exhaustion', amount: 6, target: 'all' }],
            },
          },
        ],
      },
    },
  })
  return makeState({ encounter: makeEncounter({ situation }) })
}

describe('a party wipe', () => {
  test('a downed party is not wiped; a dead one is, and can’t travel', () => {
    const downed = makeState({
      party: [
        { ...brom, hp: 0 },
        { ...lyra, hp: 0 },
      ],
    })
    expect(partyWiped(downed)).toBe(false)
    const wiped = makeState({ party: [dead(brom), dead(lyra)] })
    expect(partyWiped(wiped)).toBe(true)
    expect(runEnding(wiped)).toBe('fallen')
    const route = 'greenvale-1-greenvale-2'
    const at = { ...wiped, location: 'greenvale-1' }
    expect(step(at, { type: 'travel', routeId: route }, content)).toEqual(at)
  })

  test('the step that wipes the party logs it once', () => {
    const fallen = step(doomed(), { type: 'chooseOption', optionId: 'stay' }, content)
    expect(partyWiped(fallen)).toBe(true)
    expect(fallen.log.filter((l) => l.text === FALLEN_LINE)).toHaveLength(1)
    expect(fallen.log.at(-1)!.tone).toBe('crit')
    expect(step(fallen, { type: 'closeEncounter' }, content)).toEqual(fallen)
  })
})

describe('run summaries', () => {
  test('a won Crisis lists three thwarted days', () => {
    const base = makeState({ day: 260 })
    const state = {
      ...base,
      crisis: { ...base.crisis!, learned: 10, thwarted: [50, 150, 250] },
    }
    const summary = runSummary(state, content)
    expect(summary.ending).toBe('won')
    expect(summary.villain).toBe('Morvaine, the Test Prophet')
    expect(summary.acts).toEqual([
      { name: 'The Test Act 1', thwartedDay: 50, failedDay: null },
      { name: 'The Test Act 2', thwartedDay: 150, failedDay: null },
      { name: 'The Test Act 3', thwartedDay: 250, failedDay: null },
    ])
    expect(summary.party.map((m) => m.fallen)).toEqual([false, false])
    expect(summary.lastLines.length).toBeLessThanOrEqual(5)
  })

  test('a lost Crisis names the failed act; runEnding is null while it goes on', () => {
    const base = makeState()
    const due = base.crisis!.acts[0].due
    expect(runEnding(base)).toBeNull()
    const lost = runSummary({ ...base, day: due + 40 }, content)
    expect(lost.ending).toBe('lost')
    expect(lost.acts[0].failedDay).not.toBeNull()
    expect(lost.acts[1].failedDay).toBeNull()
  })

  test('runRecord is the same for the same state, keyed by the seed, and valid', () => {
    const state = makeState({ party: [dead(brom), lyra] })
    const record = runRecord(state, content, '2026-11-13T00:00:00.000Z')
    expect(runRecord(structuredClone(state), content, '2026-11-13T00:00:00.000Z')).toEqual(record)
    expect(RunRecordSchema.parse(record)).toEqual(record)
    expect(record).toMatchObject({ id: String(state.seed), ending: null, acts: [null, null, null] })
    expect(record.party.map((m) => m.fallen)).toEqual([true, false])
  })
})
