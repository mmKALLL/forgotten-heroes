import { describe, expect, test } from 'vitest'
import { GameStateSchema, type GameState } from '../../schema/state'
import { FightSchema } from '../../schema/encounter'
import { deserialize, serialize } from '../save'
import { step, type Action } from '../state'
import { createRng } from '../rng'
import { startEncounter } from '../encounters/run'
import { brom, combatFixtureContent, lyra, makeState, testFight } from '../test-fixtures'
import { CAMARADERIE_RETREAT, STACK_CAP, SIZE_POINTS } from '../constants'
import { startCombat } from './fight'
import { actionOrder } from './intents'
import { stepOf } from './line'
import { combatPreview } from './preview'
import { surprisePreview } from './start'
import { unitOf, withFight } from './test-fixtures'

const content = combatFixtureContent()
const fight = FightSchema.parse(testFight)

/** Brom (longsword, chain) up front and Lyra (shortbow) behind, fresh. */
const party = [
  { ...brom, gear: { weapon: 'longsword', armour: 'chain-mail' } },
  { ...lyra, gear: { weapon: 'shortbow', armour: 'leather-armour' } },
]

const opened = (seed: number, f = fight, overrides: Partial<GameState> = {}) =>
  startCombat(makeState({ party, rng: createRng(seed), ...overrides }), content, f)

describe('starting a fight', () => {
  test('the party stands at its end (back rank behind), the enemies at the far end, archers behind', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const combat = opened(seed).combat!
      const at = (id: string) => combat.units.find((u) => u.id === id)!.tile
      expect(at('lyra')).toBe(0)
      expect(at('brom')).toBe(1)
      expect(at('e3')).toBe(6) // the bowman
      expect(Math.min(at('e1'), at('e2'))).toBeGreaterThan(at('brom'))
      expect(combat.groupSize).toBe(3)
    }
  })

  test('no tile ever holds more than the stack cap of one side', () => {
    const swarm = FightSchema.parse({
      enemies: [
        { creature: 'rat', count: 9 },
        { creature: 'troll', count: 2 },
      ],
    })
    const combat = opened(1, swarm).combat!
    for (let tile = 0; tile < combat.line; tile++) {
      const points = combat.units
        .filter((u) => u.side === 'enemy' && u.tile === tile)
        .reduce((n, u) => n + SIZE_POINTS[u.size], 0)
      expect(points).toBeLessThanOrEqual(STACK_CAP)
    }
  })

  test('an ambush adds enemies, sometimes behind the party, sometimes apart from the group', () => {
    const ambush = FightSchema.parse({ ...testFight, ambush: true })
    const places = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const combat = opened(seed, ambush).combat!
      const extra = combat.units.filter((u) => u.name.includes('ambush'))
      expect(extra.length).toBeGreaterThanOrEqual(1)
      expect(extra.length).toBeLessThanOrEqual(3)
      places.add(extra[0].tile === 0 ? 'behind' : 'apart')
      if (extra[0].tile === 0) expect(combat.units.find((u) => u.id === 'lyra')!.tile).toBe(1)
    }
    expect([...places].sort()).toEqual(['apart', 'behind'])
  })

  test("the surprise odds sum to 1, and the scout's kit improves them", () => {
    const foes = [{ wis: 1 }]
    const odds = (kit: number) =>
      surprisePreview({ party, upgrades: { 'scouts-kit': kit } }, content, foes, true).odds
    const none = odds(0)
    expect(Object.values(none).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(odds(3).enemy).toBeLessThan(none.enemy)
    // Plate armour gives disadvantage when sneaking up.
    const plated = [
      { ...party[0], gear: { weapon: 'longsword', armour: 'plate-armour' } },
      party[1],
    ]
    expect(surprisePreview({ party: plated, upgrades: {} }, content, foes, false).mode).toBe(
      'disadvantage'
    )
  })

  test('every enemy telegraphs an intent unless the party has the jump on them', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const combat = opened(seed).combat!
      const enemies = combat.units.filter((u) => u.side === 'enemy' && u.status === 'in')
      if (combat.surprise === 'party') expect(enemies.every((u) => u.intent === null)).toBe(true)
      else expect(enemies.every((u) => u.intent !== null)).toBe(true)
    }
  })
})

describe('turns', () => {
  test('the enemies act left to right, top to bottom', () => {
    const combat = withFight([
      unitOf({ id: 'brom', side: 'party', tile: 0 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 4 }),
      unitOf({ id: 'e2', side: 'enemy', tile: 2 }),
      unitOf({ id: 'e3', side: 'enemy', tile: 4 }),
      unitOf({ id: 'e4', side: 'enemy', tile: 3 }),
    ]).combat!
    expect(actionOrder(combat).map((u) => u.id)).toEqual(['e2', 'e4', 'e1', 'e3'])
  })

  test('a member moves once and acts once; standing still allows the full action only', () => {
    const state = withFight([
      unitOf({ id: 'brom', side: 'party', tile: 1 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 3, hp: 99, maxHp: 99 }),
    ])
    const moved = step(state, { type: 'combatMove', unit: 'brom', to: 2 }, content)
    expect(moved.combat!.units[0].tile).toBe(2)
    expect(step(moved, { type: 'combatMove', unit: 'brom', to: 1 }, content)).toEqual(moved)
    expect(step(moved, { type: 'combatAct', unit: 'brom', tile: 3, full: true }, content)).toEqual(
      moved
    )
    const struck = step(moved, { type: 'combatAct', unit: 'brom', tile: 3 }, content)
    expect(struck.combat!.units[0].acted).toBe(true)
    expect(step(struck, { type: 'combatAct', unit: 'brom', tile: 3 }, content)).toEqual(struck)
  })

  test('a stunned enemy loses its turn; hit counts clear with the new round', () => {
    const state = withFight([
      unitOf({ id: 'brom', side: 'party', tile: 1 }),
      unitOf({
        id: 'e1',
        side: 'enemy',
        tile: 2,
        hits: 4,
        intent: { kind: 'attack', from: 2, tile: 1, twice: false },
      }),
    ])
    expect(combatPreview(state)!.intents[0].stunned).toBe(true)
    const after = step(state, { type: 'combatEndTurn' }, content)
    expect(after.combat!.log.some((e) => e.text.includes('stunned'))).toBe(true)
    expect(after.combat!.log.some((e) => e.attack)).toBe(false)
    expect(after.combat!.units[1].hits).toBe(0)
    expect(after.combat!.round).toBe(2)
  })

  test("a mace hit counts two up the ladder; a caster's blows are halved when staggered, lost when stunned", () => {
    const mace = unitOf({ id: 'brom', side: 'party', tile: 1, family: 'maces', toHit: 30 })
    const intent = { kind: 'attack' as const, from: 2, tile: 1, twice: false }
    const target = unitOf({ id: 'e1', side: 'enemy', tile: 2, hp: 99, maxHp: 99, intent })
    const hit = step(
      withFight([mace, target]),
      { type: 'combatAct', unit: 'brom', tile: 2 },
      content
    )
    expect(hit.combat!.units[1].hits).toBe(2)
    expect(stepOf(hit.combat!.units[1])).toBe('stifled')
    // A caster at 2 hits is staggered: its intent shows half damage.
    const caster = { ...target, role: 'caster' as const }
    const staggered = step(
      withFight([mace, caster]),
      { type: 'combatAct', unit: 'brom', tile: 2 },
      content
    )
    const shown = combatPreview(staggered)!.intents[0]
    expect(shown.step).toBe('staggered')
    expect(shown.attacks[0].half).toBe(true)
    // One more hit (a blade's full action lands two) stuns it.
    const blade = { ...mace, family: 'blades' as const }
    const full = step(
      withFight([blade, { ...caster, hits: 1 }]),
      { type: 'combatAct', unit: 'brom', tile: 2, full: true },
      content
    )
    expect(full.combat!.units[1].hits).toBe(3)
    expect(combatPreview(full)!.intents[0].stunned).toBe(true)
  })

  test('the actions are refused by the rest of the game while a fight is open', () => {
    const state = withFight([
      unitOf({ id: 'brom', side: 'party', tile: 1 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 3 }),
    ])
    expect(step(state, { type: 'explore' }, content)).toBe(state)
    expect(step(state, { type: 'closeCombat' }, content)).toBe(state)
  })
})

describe('the end of a fight', () => {
  test('victory applies the win branch to the encounter; closing clears the fight', () => {
    let state = startEncounter(makeState({ party, rng: createRng(4) }), content, 'test-fight')
    state = step(state, { type: 'startCombat' }, content)
    expect(state.combat).not.toBeNull()
    // Make every enemy one hit from death and every member unmissable.
    state = {
      ...state,
      combat: {
        ...state.combat!,
        units: state.combat!.units.map((u) =>
          u.side === 'enemy' ? { ...u, hp: 1, ac: 1 } : { ...u, toHit: 30, reach: [1, 6] }
        ),
      },
    }
    const gold = state.gold
    for (const e of state.combat!.units.filter((u) => u.side === 'enemy')) {
      for (const m of ['brom', 'lyra']) {
        const u = state.combat!.units.find((x) => x.id === e.id)!
        if (state.combat!.result !== null || u.status !== 'in') break
        state = step(state, { type: 'combatAct', unit: m, tile: u.tile }, content)
      }
      if (state.combat!.result === null) state = step(state, { type: 'combatEndTurn' }, content)
    }
    expect(['victory', 'rout']).toContain(state.combat!.result)
    expect(state.gold).toBe(gold + 5)
    expect(state.encounter!.stage).toBeNull()
    expect(step(state, { type: 'closeCombat' }, content).combat).toBeNull()
  })

  test('a retreat: members leave by the party end; it costs camaraderie as any flight', () => {
    let state = withFight(
      [
        unitOf({ id: 'brom', side: 'party', tile: 0 }),
        unitOf({ id: 'lyra', side: 'party', tile: 0 }),
        unitOf({ id: 'e1', side: 'enemy', tile: 5 }),
      ],
      { fight: FightSchema.parse(testFight) }
    )
    const before = state.camaraderie
    state = step(state, { type: 'combatRetreat', unit: 'brom' }, content)
    expect(state.combat!.result).toBeNull()
    state = step(state, { type: 'combatRetreat', unit: 'lyra' }, content)
    expect(state.combat!.result).toBe('retreat')
    expect(state.camaraderie).toBe(before - CAMARADERIE_RETREAT * (state.party.length - 1))
  })

  test('morale is tested at its threshold; when it breaks the fight is a rout', () => {
    // A group of 3 tests when 1 is left. Kill two with an unmissable member.
    let routs = 0
    let tested = 0
    for (let seed = 1; seed <= 40; seed++) {
      let state = withFight(
        [
          unitOf({
            id: 'brom',
            side: 'party',
            tile: 1,
            toHit: 30,
            damage: { count: 1, die: 4, bonus: 20 },
          }),
          unitOf({
            id: 'lyra',
            side: 'party',
            tile: 1,
            toHit: 30,
            damage: { count: 1, die: 4, bonus: 20 },
          }),
          unitOf({ id: 'e1', side: 'enemy', tile: 2, wis: -5 }),
          unitOf({ id: 'e2', side: 'enemy', tile: 2, wis: -5 }),
          unitOf({ id: 'e3', side: 'enemy', tile: 3, wis: -5 }),
        ],
        {},
        seed
      )
      state = step(state, { type: 'combatAct', unit: 'brom', tile: 2 }, content)
      expect(state.combat!.morale).toBe('untested')
      state = step(state, { type: 'combatAct', unit: 'lyra', tile: 2 }, content)
      const standing = state.combat!.units.filter((u) => u.side === 'enemy' && u.status === 'in')
      const fallen = state.combat!.units.filter((u) => u.status === 'dead').length
      // A natural 1 always misses: count only the seeds where both blows killed.
      if (fallen < 2) continue
      tested++
      expect(state.combat!.morale).not.toBe('untested')
      if (state.combat!.result === 'rout') {
        routs++
        expect(standing).toEqual([])
      }
    }
    // WIS −5 against DC 10+: nearly every test breaks.
    expect(routs).toBeGreaterThan(tested * 0.8)
  })
})

describe('determinism and saves', () => {
  const script: Action[] = [
    { type: 'startCombat' },
    { type: 'combatMove', unit: 'brom', to: 2 },
    { type: 'combatEndTurn' },
    { type: 'combatEndTurn' },
    { type: 'combatEndTurn' },
  ]

  test('the same seed and actions replay to the same fight, and it survives a save mid-fight', () => {
    const play = () => {
      let state = startEncounter(makeState({ party, rng: createRng(9) }), content, 'test-fight')
      for (const action of script) {
        state = step(state, action, content)
        expect(GameStateSchema.safeParse(state).success).toBe(true)
        expect(deserialize(serialize(state), content)).toEqual(state)
      }
      return state
    }
    expect(play()).toEqual(play())
  })
})
