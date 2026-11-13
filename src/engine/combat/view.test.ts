import { expect, test } from 'vitest'
import { FightSchema } from '../../schema/encounter'
import { createRng } from '../rng'
import { step } from '../state'
import { combatFixtureContent, makeState, testFight } from '../test-fixtures'
import { unitOf, withFight } from './test-fixtures'
import { combatView, targetsOf } from './view'

const content = combatFixtureContent()

test('the view stacks each tile top to bottom and lists the downed apart', () => {
  const state = withFight([
    unitOf({ id: 'brom', side: 'party', tile: 1 }),
    unitOf({ id: 'lyra', side: 'party', tile: 0, status: 'down', hp: 0 }),
    unitOf({ id: 'e1', side: 'enemy', tile: 2, hits: 2, hp: 4 }),
    unitOf({ id: 'e2', side: 'enemy', tile: 2 }),
  ])
  const view = combatView(state)!
  expect(view.tiles).toHaveLength(7)
  expect(view.tiles[2].units.map((u) => u.id)).toEqual(['e1', 'e2'])
  expect(view.tiles[2].side).toBe('enemy')
  expect(view.out.map((u) => u.id)).toEqual(['lyra'])
  const e1 = view.tiles[2].units[0]
  expect(e1.bloodied).toBe(true)
  expect(e1.pips).toEqual({ hits: 2, stagger: 3, stun: 4 })
  // Brom can strike either foe on the next tile, or step back.
  const targets = targetsOf(view.options.brom)
  expect(targets.filter((t) => t.kind === 'attack').map((t) => t.tile)).toEqual([2, 2])
  expect(targets.some((t) => t.kind === 'move' && t.tile === 0)).toBe(true)
})

test('startCombat opens a given fight with no encounter (the test fight)', () => {
  const fight = FightSchema.parse(testFight)
  const state = step(makeState({ rng: createRng(3) }), { type: 'startCombat', fight }, content)
  expect(state.combat?.units.filter((u) => u.side === 'enemy')).toHaveLength(3)
  // Every enemy telegraphs, unless the party has the jump on them.
  const intents = combatView(state)!.intents.length
  expect(intents).toBe(state.combat!.surprise === 'party' ? 0 : 3)
})
