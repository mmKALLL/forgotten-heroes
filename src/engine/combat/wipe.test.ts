import { describe, expect, test } from 'vitest'
import type { CombatUnit } from '../../schema/combat'
import type { GameState } from '../../schema/state'
import { FightSchema } from '../../schema/encounter'
import { step } from '../state'
import { createRng } from '../rng'
import { startEncounter } from '../encounters/run'
import {
  brom,
  combatFixtureContent,
  lyra,
  makeCharacter,
  makeState,
  testFight,
} from '../test-fixtures'
import {
  CAMARADERIE_DEATH,
  CAMARADERIE_DOWNED,
  CAMARADERIE_WIPE,
  DOWNED_EXHAUSTION,
  OLD_WOUND_PENALTY,
} from '../constants'
import { wipeOptions } from './defeat'
import { unitOf, withFight } from './test-fixtures'
import { combatView } from './view'

// Going down in a fight (+2 exhaustion besides the camaraderie and the injury roll) and the
// player's choice after a wipe (combat design §7; designer calls 2026-11-14).

const content = combatFixtureContent()
const kel = makeCharacter({ id: 'kel', name: 'Kel', hp: 12, maxHp: 12 })

const doomed = (id: string) => unitOf({ id, side: 'party', tile: 1, hp: 1, ac: 1 })
const killer = (id: string) =>
  unitOf({
    id,
    side: 'enemy',
    tile: 2,
    toHit: 30,
    intent: { kind: 'attack', from: 2, tile: 1, twice: false },
  })

/** The party (each member at 1 HP on tile 1) beaten in the enemies' turn: the wipe's choice waits. */
function wiped(overrides: Partial<GameState> = {}, seed = 1): GameState {
  const party = overrides.party ?? [brom, lyra]
  const units: CombatUnit[] = [
    ...party.map((c) => doomed(c.id)),
    ...party.map((_, i) => killer(`e${i + 1}`)),
  ]
  const state = withFight(units, {}, seed, { camaraderie: 80, ...overrides })
  const after = step(state, { type: 'combatEndTurn' }, content)
  expect(after.combat!.result).toBe('wipe')
  return after
}

describe('going down in a fight', () => {
  test('costs exhaustion and camaraderie, and the blows that could do it say so', () => {
    const state = withFight(
      [unitOf({ id: 'brom', side: 'party', tile: 1, hp: 3 }), killer('e1')],
      {},
      1,
      { camaraderie: 60 }
    )
    const drops = combatView(state)!.intents[0].attacks[0].drops
    expect(drops).toMatchObject({ exhaustion: DOWNED_EXHAUSTION, fatal: false })
    expect(drops!.camaraderie).toBe(-CAMARADERIE_DOWNED)
    expect(drops!.injury).toBeGreaterThan(0)
    // A fresh member, out of reach of a single blow, isn't warned.
    const sturdy = withFight([unitOf({ id: 'brom', side: 'party', tile: 1, hp: 99 }), killer('e1')])
    expect(combatView(sturdy)!.intents[0].attacks[0].drops).toBeNull()

    const after = step(state, { type: 'combatEndTurn' }, content)
    const b = after.party.find((c) => c.id === 'brom')!
    expect(b.exhaustion).toBe(brom.exhaustion + DOWNED_EXHAUSTION)
    expect(after.camaraderie).toBe(60 - CAMARADERIE_DOWNED)
  })

  test('a member the exhaustion would kill dies of it (gear lost), and the preview says so', () => {
    const worn = { ...brom, exhaustion: 4, gear: { weapon: 'longsword', armour: 'chain-mail' } }
    const state = withFight(
      [unitOf({ id: 'brom', side: 'party', tile: 1, hp: 3 }), killer('e1')],
      {},
      1,
      { party: [worn, lyra] }
    )
    expect(combatView(state)!.intents[0].attacks[0].drops).toMatchObject({ fatal: true, death: 1 })
    const after = step(state, { type: 'combatEndTurn' }, content)
    const b = after.party.find((c) => c.id === 'brom')!
    expect(b.exhaustion).toBe(6)
    expect(b.gear).toEqual({ weapon: null, armour: null })
    expect(after.combat!.units.find((u) => u.id === 'brom')!.status).toBe('dead')
  })
})

describe('a wipe', () => {
  test('waits for the choice: nothing else goes, Close is refused, and the view offers the three', () => {
    const state = wiped({ gold: 50 })
    expect(state.gold).toBe(50)
    expect(step(state, { type: 'explore' }, content)).toBe(state)
    expect(step(state, { type: 'closeCombat' }, content)).toBe(state)
    const view = combatView(state)!
    expect(view.wipe?.surrender).toBeTruthy()
    expect(view.wipe?.struggle.injuries).toHaveLength(2)
    expect(view.wipe?.sacrifice?.members).toEqual(['brom', 'lyra'])
  })

  test('surrender gives up the gold (the compartment keeps its share) and half of all but essentials', () => {
    const goods = { food: 6, arcana: 3, metal: 4, gems: 1 }
    const state = wiped({ gold: 50, goods, upgrades: { 'smugglers-compartment': 2 } })
    const shown = wipeOptions(state).surrender
    expect(shown.kept).toBe(20)
    expect(shown.goods).toEqual({ arcana: 1, metal: 2 })
    const after = step(state, { type: 'combatWipeChoice', choice: 'surrender' }, content)
    expect(after.combat).toBeNull()
    expect(after.gold).toBe(50 - shown.gold)
    expect(after.goods).toEqual({ food: 6, arcana: 2, metal: 2, gems: 1 })
    expect(after.camaraderie).toBe(state.camaraderie + shown.camaraderie)
    expect(shown.camaraderie).toBe(-CAMARADERIE_WIPE)
    expect(after.party.every((c) => c.hp === 1)).toBe(true)
    // Without the compartment, every coin goes.
    expect(wipeOptions({ ...state, upgrades: {} }).surrender.kept).toBe(0)
  })

  test('struggle deals exactly the injuries the preview names: two for a pair, three on three members', () => {
    for (const party of [
      [brom, lyra],
      [brom, lyra, kel],
    ]) {
      for (let seed = 1; seed <= 5; seed++) {
        const state = wiped({ party }, seed)
        const shown = wipeOptions(state).struggle
        expect(shown.injuries).toHaveLength(party.length <= 2 ? 2 : 3)
        expect(new Set(shown.injuries.map((i) => i.member)).size).toBe(shown.injuries.length)
        const after = step(state, { type: 'combatWipeChoice', choice: 'struggle' }, content)
        for (const { member, ability } of shown.injuries) {
          const before = state.party.find((c) => c.id === member)!
          const now = after.party.find((c) => c.id === member)!
          expect(now.oldWounds).toEqual([...before.oldWounds, ability])
          expect(now.abilities[ability]).toBe(
            Math.max(3, before.abilities[ability] - OLD_WOUND_PENALTY)
          )
          expect(now.exhaustion).toBeLessThan(6)
        }
        expect(after.camaraderie).toBe(state.camaraderie - CAMARADERIE_WIPE)
      }
    }
  })

  test('sacrifice: the chosen member stays behind and dies; a lone member is never offered it', () => {
    const armed = { ...lyra, gear: { weapon: 'shortbow', armour: 'leather-armour' } }
    const state = wiped({ party: [brom, armed] })
    const after = step(
      state,
      { type: 'combatWipeChoice', choice: 'sacrifice', member: 'lyra' },
      content
    )
    const l = after.party.find((c) => c.id === 'lyra')!
    expect(l.exhaustion).toBe(6)
    expect(l.gear).toEqual({ weapon: null, armour: null })
    expect(after.party.find((c) => c.id === 'brom')!.hp).toBe(1)
    expect(after.camaraderie).toBe(state.camaraderie - CAMARADERIE_WIPE - CAMARADERIE_DEATH)
    // Someone not in the party, or no one named, is refused.
    expect(step(state, { type: 'combatWipeChoice', choice: 'sacrifice' }, content)).toBe(state)
    const alone = wiped({ party: [brom] })
    expect(wipeOptions(alone).sacrifice).toBeNull()
    expect(
      step(alone, { type: 'combatWipeChoice', choice: 'sacrifice', member: 'brom' }, content)
    ).toBe(alone)
  })

  test("the choice applies the encounter's lose branch and closes the fight", () => {
    let state = startEncounter(makeState({ rng: createRng(4) }), content, 'test-fight')
    state = step(state, { type: 'startCombat' }, content)
    // Rig the line: the party at 1 HP, every enemy unmissable and next to them.
    const tile = state.combat!.units.find((u) => u.side === 'party')!.tile
    state = {
      ...state,
      combat: {
        ...state.combat!,
        surprise: 'none',
        round: 2,
        units: state.combat!.units.map((u) =>
          u.side === 'party'
            ? { ...u, hp: 1, ac: 1, tile }
            : {
                ...u,
                toHit: 30,
                tile: tile + 1,
                reach: [1, 6],
                intent: { kind: 'volley', from: tile + 1, tile, twice: false },
              }
        ),
      },
    }
    state = step(state, { type: 'combatEndTurn' }, content)
    expect(state.combat!.result).toBe('wipe')
    expect(state.encounter!.stage).not.toBeNull()
    const after = step(state, { type: 'combatWipeChoice', choice: 'struggle' }, content)
    expect(after.combat).toBeNull()
    expect(after.encounter!.stage).toBeNull()
    expect(FightSchema.parse(testFight).lose).toBeTruthy()
  })
})
