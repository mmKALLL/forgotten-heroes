import type { CombatState, CombatUnit } from '../../schema/combat'
import type { GameState } from '../../schema/state'
import { createRng } from '../rng'
import { brom, lyra, makeState } from '../test-fixtures'

// Hand-built fights for the combat tests: units with known numbers on a known line, so a test
// reads the rule it checks and nothing else. Brom and Lyra are the party (ids match).

export function unitOf(
  o: Partial<CombatUnit> & Pick<CombatUnit, 'id' | 'side' | 'tile'>
): CombatUnit {
  const enemy = o.side === 'enemy'
  return {
    name: o.id,
    size: 'medium',
    hp: 10,
    maxHp: 10,
    ac: 12,
    toHit: 4,
    damage: { count: 1, die: 6, bonus: 2 },
    reach: [1, 1],
    critMin: 20,
    family: enemy ? null : 'blades',
    role: enemy ? 'brute' : null,
    creature: enemy ? 'cutthroat' : null,
    boss: false,
    wis: 0,
    status: 'in',
    moved: false,
    acted: false,
    hits: 0,
    staggered: false,
    intent: null,
    level: 1,
    dc: 10,
    untrained: false,
    fullDamage: 0,
    effects: [],
    ...o,
  }
}

/** Brom and Lyra in a fight with these units (their party units should use ids brom and lyra). */
export function withFight(
  units: CombatUnit[],
  extra: Partial<CombatState> = {},
  seed = 1,
  overrides: Partial<GameState> = {}
): GameState {
  return makeState({
    party: [brom, lyra],
    rng: createRng(seed),
    combat: {
      line: 7,
      round: 1,
      units,
      footing: 'normal',
      surprise: 'none',
      firstMovers: [],
      groupSize: units.filter((u) => u.side === 'enemy').length,
      morale: 'untested',
      fight: null,
      result: null,
      log: [],
      ...extra,
    },
    ...overrides,
  })
}

/** The attack records written to the fight's log, oldest first. */
export const attacks = (state: GameState) =>
  (state.combat?.log ?? []).flatMap((e) => (e.attack ? [e.attack] : []))
