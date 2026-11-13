import { describe, expect, test } from 'vitest'
import { createRng, withRng } from '../rng'
import { makeCharacter } from '../test-fixtures'
import { applyDefeat, defeatOdds, rollDefeat } from './defeat'

const party = { party: [] }
const fresh = makeCharacter({ abilities: { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 } })
const scarred = { ...fresh, oldWounds: ['str' as const, 'dex' as const] }

/** How often each outcome comes up over many downings. */
function tally(member: typeof fresh, overkill: number, runs = 6000) {
  const counts = { none: 0, injury: 0, death: 0 }
  const odds = defeatOdds(party, member, overkill)
  for (let seed = 0; seed < runs; seed++)
    counts[withRng(createRng(seed), (d) => rollDefeat(d, odds))[0].kind]++
  return { injury: counts.injury / runs, death: counts.death / runs }
}

describe('going down', () => {
  test('the injury chance grows with the damage past 0', () => {
    expect(defeatOdds(party, fresh, 10).injury).toBeGreaterThan(defeatOdds(party, fresh, 0).injury)
    expect(defeatOdds(party, fresh, 0).death).toBe(0)
    expect(defeatOdds(party, fresh, 1000).injury).toBe(1)
  })

  test('injuries come about as often as the odds say, and never kill a lightly scarred member', () => {
    const odds = defeatOdds(party, fresh, 5)
    const seen = tally(fresh, 5)
    expect(Math.abs(seen.injury - odds.injury)).toBeLessThan(0.03)
    expect(seen.death).toBe(0)
  })

  test('a member with two injuries already risks death instead (about half the time it would scar)', () => {
    const odds = defeatOdds(party, scarred, 5)
    expect(odds.death).toBeGreaterThan(0)
    expect(odds.death).toBeLessThan(odds.injury)
    const seen = tally(scarred, 5)
    expect(Math.abs(seen.death - odds.death)).toBeLessThan(0.03)
    expect(seen.injury).toBe(0)
  })

  test('an injury lowers an ability and joins the old wounds; death takes the gear', () => {
    const hurt = applyDefeat(fresh, { kind: 'injury', ability: 'str' })
    expect(hurt.abilities.str).toBeLessThan(fresh.abilities.str)
    expect(hurt.oldWounds).toEqual(['str'])
    const dead = applyDefeat(
      { ...scarred, gear: { weapon: 'longsword', armour: 'chain-mail' } },
      { kind: 'death' }
    )
    expect(dead.exhaustion).toBe(6)
    expect(dead.gear).toEqual({ weapon: null, armour: null })
    expect(applyDefeat(fresh, { kind: 'none' })).toBe(fresh)
  })
})
