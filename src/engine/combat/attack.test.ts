import { describe, expect, test } from 'vitest'
import type { CombatUnit } from '../../schema/combat'
import { attackSpec, damageRange, rollAttack } from './attack'
import { withRng, createRng } from '../rng'
import { attacks, unitOf, withFight } from './test-fixtures'
import { combatPreview } from './preview'
import { step } from '../state'
import { combatFixtureContent } from '../test-fixtures'
import { STACK_CAP } from '../constants'
import { canEnter, isStaggered, isStunned } from './line'

const content = combatFixtureContent()

const part = (spec: { parts: { label: string; value: number }[] }, label: string) =>
  spec.parts.find((p) => p.label === label)?.value ?? 0

describe('to hit', () => {
  test('assisting: the bigger stack gets +2 a point of difference, the smaller −2', () => {
    const units = [
      unitOf({ id: 'brom', side: 'party', tile: 2 }),
      unitOf({ id: 'lyra', side: 'party', tile: 2 }),
      unitOf({ id: 'x', side: 'party', tile: 2 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 3 }),
      unitOf({ id: 'e2', side: 'enemy', tile: 3 }),
    ]
    const combat = withFight(units).combat!
    const [brom, , , e1] = combat.units
    expect(part(attackSpec(combat, brom, e1), 'assist')).toBe(2)
    expect(part(attackSpec(combat, e1, brom), 'assist')).toBe(-2)
    // A large creature counts 2: one ogre against one member is +2 for the ogre.
    const big = withFight([
      unitOf({ id: 'brom', side: 'party', tile: 2 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 3, size: 'large' }),
    ]).combat!
    expect(part(attackSpec(big, big.units[1], big.units[0]), 'assist')).toBe(2)
  })

  test('a polearm takes −4 at the next tile, not at two; a bow −4 while engaged', () => {
    const polearm = unitOf({
      id: 'brom',
      side: 'party',
      tile: 1,
      family: 'polearms',
      reach: [1, 2],
    })
    const near = withFight([polearm, unitOf({ id: 'e1', side: 'enemy', tile: 2 })]).combat!
    const far = withFight([polearm, unitOf({ id: 'e1', side: 'enemy', tile: 3 })]).combat!
    expect(part(attackSpec(near, near.units[0], near.units[1]), 'too close')).toBe(-4)
    expect(part(attackSpec(far, far.units[0], far.units[1]), 'too close')).toBe(0)
    const bow = unitOf({ id: 'lyra', side: 'party', tile: 1, family: 'bows', reach: [3, 5] })
    const engaged = withFight([
      bow,
      unitOf({ id: 'e1', side: 'enemy', tile: 2 }),
      unitOf({ id: 'e2', side: 'enemy', tile: 4 }),
    ]).combat!
    expect(part(attackSpec(engaged, engaged.units[0], engaged.units[2]), 'engaged')).toBe(-4)
  })

  test('a dagger crits on 19–20; Edge and Exposed move the odds', () => {
    const dagger = unitOf({ id: 'brom', side: 'party', tile: 1, critMin: 19, family: 'daggers' })
    const e1 = unitOf({ id: 'e1', side: 'enemy', tile: 2, ac: 30 })
    const combat = withFight([dagger, e1]).combat!
    const spec = attackSpec(combat, dagger, e1)
    expect(spec.crit).toBeCloseTo(0.1)
    expect(spec.hit).toBeCloseTo(0.1) // AC 30: only the crits hit
    const odds = (footing: 'edge' | 'normal' | 'exposed') => {
      const c = withFight([dagger, { ...e1, ac: 14 }], { footing }).combat!
      return attackSpec(c, c.units[0], c.units[1]).hit
    }
    expect(odds('edge')).toBeGreaterThan(odds('normal'))
    expect(odds('exposed')).toBeLessThan(odds('normal'))
  })

  test('a staggered or bloodied enemy hits less often, and a staggered one for half', () => {
    const brom = unitOf({ id: 'brom', side: 'party', tile: 1 })
    const e1 = unitOf({ id: 'e1', side: 'enemy', tile: 2, damage: { count: 2, die: 6, bonus: 4 } })
    const spec = (u: typeof e1) => {
      const c = withFight([brom, u]).combat!
      return attackSpec(c, c.units[1], c.units[0])
    }
    const fresh = spec(e1)
    const staggered = spec({ ...e1, staggered: true })
    expect(staggered.hit).toBeLessThan(fresh.hit)
    expect(staggered.damage[1]).toBeLessThan(fresh.damage[1])
    expect(spec({ ...e1, hp: 4 }).hit).toBeLessThan(fresh.hit)
    // A bloodied boss doesn't lose its aim (it grows desperate instead).
    expect(spec({ ...e1, hp: 4, boss: true }).hit).toBe(fresh.hit)
  })

  test('a roll lands within the range its spec shows', () => {
    const brom = unitOf({ id: 'brom', side: 'party', tile: 1 })
    const e1 = unitOf({ id: 'e1', side: 'enemy', tile: 2 })
    const combat = withFight([brom, e1]).combat!
    const spec = attackSpec(combat, brom, e1)
    for (let seed = 0; seed < 300; seed++) {
      const [roll] = withRng(createRng(seed), (d) => rollAttack(d, spec))
      if (!roll.hit) continue
      const [min, max] = roll.crit ? spec.critDamage : spec.damage
      expect(roll.damage).toBeGreaterThanOrEqual(min)
      expect(roll.damage).toBeLessThanOrEqual(max)
    }
    expect(damageRange({ count: 1, die: 6, bonus: 2 }, true, false)).toEqual([4, 14])
  })
})

describe('the line', () => {
  test(`a tile holds at most ${STACK_CAP} size points of one side, and never the other side`, () => {
    const combat = withFight([
      unitOf({ id: 'brom', side: 'party', tile: 1 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 3, size: 'huge' }),
      unitOf({ id: 'e2', side: 'enemy', tile: 4 }),
    ]).combat!
    const [brom, , e2] = combat.units
    expect(canEnter(combat, e2, 3)).toBe(true) // 3 + 1 = 4
    expect(canEnter(combat, { ...e2, size: 'large' }, 3)).toBe(false) // 3 + 2 > 4
    expect(canEnter(combat, brom, 3)).toBe(false)
    expect(canEnter(combat, brom, 2)).toBe(true)
  })

  test('stagger and stun come at 3/4 hits for most, 1/2 for casters and archers, 5/6 for bosses', () => {
    const at = (hits: number, o: Partial<CombatUnit>) => {
      const u = unitOf({ id: 'e1', side: 'enemy', tile: 3, hits, ...o })
      return [isStaggered(u), isStunned(u)]
    }
    expect(at(2, {})).toEqual([false, false])
    expect(at(3, {})).toEqual([true, false])
    expect(at(4, {})).toEqual([true, true])
    expect(at(1, { role: 'archer' })).toEqual([true, false])
    expect(at(2, { role: 'caster' })).toEqual([true, true])
    expect(at(4, { boss: true })).toEqual([false, false])
    expect(at(5, { boss: true })).toEqual([true, false])
    expect(at(6, { boss: true })).toEqual([true, true])
  })
})

describe('preview == actual', () => {
  const runs = 150
  const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.12)

  test('a single attack and both attacks of a full action roll at the odds shown', () => {
    const units = [
      unitOf({ id: 'brom', side: 'party', tile: 1 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 2, hp: 200, maxHp: 200 }),
    ]
    let hits = 0
    for (let seed = 1; seed <= runs; seed++) {
      const state = withFight(units, {}, seed)
      const shown = combatPreview(state)!.members[0].attacks[0]
      const one = attacks(step(state, { type: 'combatAct', unit: 'brom', tile: 2 }, content))
      expect(one).toHaveLength(1)
      expect(one[0].chance).toBe(shown.attack[0].hit)
      expect(one[0].modifier).toBe(shown.attack[0].modifier)
      if (one[0].hit) {
        hits++
        expect(one[0].range).toEqual(
          one[0].crit ? shown.attack[0].critDamage : shown.attack[0].damage
        )
      }
      const two = attacks(
        step(state, { type: 'combatAct', unit: 'brom', tile: 2, full: true }, content)
      )
      expect(two.map((a) => a.chance)).toEqual(shown.full!.map((s) => s.hit))
      expect(two.map((a) => a.modifier)).toEqual(shown.full!.map((s) => s.modifier))
    }
    close(hits / runs, combatPreview(withFight(units))!.members[0].attacks[0].attack[0].hit)
  })

  test('free swings on a move and on leaving the line roll at the odds shown', () => {
    const units = [
      unitOf({ id: 'brom', side: 'party', tile: 0, hp: 100, maxHp: 100 }),
      unitOf({ id: 'lyra', side: 'party', tile: 1, hp: 100, maxHp: 100 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 2 }),
      unitOf({ id: 'e2', side: 'enemy', tile: 2 }),
    ]
    for (let seed = 1; seed <= 40; seed++) {
      const state = withFight(units, {}, seed)
      const preview = combatPreview(state)!
      const lyraMove = preview.members
        .find((m) => m.unit === 'lyra')!
        .moves.find((m) => m.to === 0)!
      expect(lyraMove.swings).toHaveLength(2)
      const moved = attacks(step(state, { type: 'combatMove', unit: 'lyra', to: 0 }, content))
      expect(moved.map((a) => [a.attacker, a.chance])).toEqual(
        lyraMove.swings.map((s) => [s.attacker, s.hit])
      )
      // Brom at the end of the line isn't engaged: he leaves without a swing.
      const bromRetreat = preview.members.find((m) => m.unit === 'brom')!.retreat!
      expect(bromRetreat.swings).toEqual([])
      expect(attacks(step(state, { type: 'combatRetreat', unit: 'brom' }, content))).toEqual([])
    }
  })

  test("an enemy's intent lands at the odds shown, and a volley hits everyone on the tile", () => {
    const units = [
      unitOf({ id: 'brom', side: 'party', tile: 1, hp: 100, maxHp: 100 }),
      unitOf({ id: 'lyra', side: 'party', tile: 1, hp: 100, maxHp: 100 }),
      unitOf({
        id: 'e1',
        side: 'enemy',
        tile: 2,
        intent: { kind: 'attack', from: 2, tile: 1, twice: false },
      }),
      unitOf({
        id: 'e2',
        side: 'enemy',
        tile: 5,
        role: 'archer',
        reach: [3, 5],
        intent: { kind: 'volley', from: 5, tile: 1, twice: false },
      }),
    ]
    for (let seed = 1; seed <= 40; seed++) {
      const state = withFight(units, {}, seed)
      const shown = combatPreview(state)!.intents
      expect(shown.map((i) => i.unit)).toEqual(['e1', 'e2'])
      expect(shown[1].attacks.map((s) => s.target)).toEqual(['brom', 'lyra'])
      const after = attacks(step(state, { type: 'combatEndTurn' }, content))
      expect(after.map((a) => [a.attacker, a.target, a.chance])).toEqual(
        shown.flatMap((i) => i.attacks.map((s) => [s.attacker, s.target, s.hit]))
      )
    }
  })

  test('a broken intent shows as broken and falls back to repositioning', () => {
    const units = [
      unitOf({ id: 'brom', side: 'party', tile: 2, hp: 100, maxHp: 100 }),
      unitOf({
        id: 'e1',
        side: 'enemy',
        tile: 3,
        intent: { kind: 'attack', from: 3, tile: 2, twice: false },
      }),
    ]
    // Brom steps back out of the way (taking a free swing): the blow at tile 2 finds no one.
    const state = step(
      withFight(units, {}, 3),
      { type: 'combatMove', unit: 'brom', to: 1 },
      content
    )
    expect(state.combat!.units[0].tile).toBe(1)
    expect(combatPreview(state)!.intents[0].broken).toBe(true)
    const after = step(state, { type: 'combatEndTurn' }, content)
    expect(after.combat!.log.some((e) => e.text.includes('finds no one'))).toBe(true)
    expect(after.combat!.units.find((u) => u.id === 'e1')!.tile).toBe(2)
  })
})
