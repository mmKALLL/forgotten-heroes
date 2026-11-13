import { describe, expect, test } from 'vitest'
import type { CombatUnit } from '../../schema/combat'
import { createRng, withRng } from '../rng'
import { combatFixtureContent } from '../test-fixtures'
import { planIntent } from './intents'
import { unitOf, withFight } from './test-fixtures'

const content = combatFixtureContent()
const brom = unitOf({ id: 'brom', side: 'party', tile: 1 })

/** The intent `enemy` plans with Brom at tile 1 (and any others). */
function plan(enemy: CombatUnit, others: CombatUnit[] = []) {
  const combat = withFight([brom, enemy, ...others]).combat!
  return withRng(createRng(1), (d) => planIntent(d, combat, enemy, content))[0]
}

describe('intents', () => {
  test('a melee enemy strikes from where it stands, or steps in first', () => {
    expect(plan(unitOf({ id: 'e1', side: 'enemy', tile: 2 }))).toMatchObject({
      kind: 'attack',
      from: 2,
      tile: 1,
    })
    expect(plan(unitOf({ id: 'e1', side: 'enemy', tile: 3 }))).toMatchObject({
      kind: 'attack',
      from: 2,
      tile: 1,
    })
  })

  test('a brute charges two tiles; with nothing in reach an enemy moves toward its range', () => {
    expect(plan(unitOf({ id: 'e1', side: 'enemy', tile: 4 }))).toMatchObject({
      kind: 'charge',
      from: 2,
      tile: 1,
    })
    const skirmisher = unitOf({ id: 'e1', side: 'enemy', tile: 5, role: 'skirmisher' })
    expect(plan(skirmisher)).toMatchObject({ kind: 'move', tile: 4 })
    expect(plan({ ...skirmisher, tile: 2 })).toMatchObject({ kind: 'hitAndRun', tile: 1 })
  })

  test('an archer keeps to its favoured range; a crowded tile draws a volley', () => {
    const archer = unitOf({ id: 'e1', side: 'enemy', tile: 3, role: 'archer', reach: [3, 5] })
    // Too close (2 away): it steps back to shoot from 3.
    expect(plan(archer)).toMatchObject({ kind: 'attack', from: 4, tile: 1 })
    const lyra = unitOf({ id: 'lyra', side: 'party', tile: 1 })
    expect(plan({ ...archer, tile: 5 }, [lyra])).toMatchObject({ kind: 'volley', from: 5, tile: 1 })
  })

  test('a leader rallies every other round with allies about; a bloodied boss acts twice', () => {
    const leader = unitOf({ id: 'e1', side: 'enemy', tile: 2, role: 'leader', reach: [1, 3] })
    const allies = [
      unitOf({ id: 'e2', side: 'enemy', tile: 3 }),
      unitOf({ id: 'e3', side: 'enemy', tile: 3 }),
    ]
    expect(plan(leader, allies).kind).toBe('rally')
    const rallied = {
      ...leader,
      intent: { kind: 'rally' as const, from: 2, tile: 2, twice: false },
    }
    expect(plan(rallied, allies).kind).toBe('attack')
    expect(plan(leader).kind).toBe('attack')
    const boss = unitOf({ id: 'e1', side: 'enemy', tile: 2, boss: true, hp: 5, maxHp: 20 })
    expect(plan(boss).twice).toBe(true)
    expect(plan({ ...boss, hp: 20 }).twice).toBe(false)
  })
})
