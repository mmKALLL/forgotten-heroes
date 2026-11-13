import { describe, expect, test } from 'vitest'
import { generateParty } from '../party'
import { createRng } from '../rng'
import { fixtureContent, makeCharacter } from '../test-fixtures'
import { memberStats, rankOf, rollAlignment, startingGear } from './gear'

const content = fixtureContent()

describe('gear (Plan 7 Track T)', () => {
  test('founders start with their class gear, no uses or spells', () => {
    const [party] = generateParty(createRng(3), content, 2)
    for (const c of party) {
      expect(c.gear).toEqual(startingGear(c.classId))
      expect(c.gear.weapon).not.toBeNull()
      expect(c.uses).toEqual({})
      expect(c.spells).toEqual({})
    }
  })

  test('only clerics have an alignment, and it is rolled with all three possible', () => {
    expect(rollAlignment({ id: 'c-1', classId: 'fighter' })).toBeUndefined()
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) => rollAlignment({ id: `c-${i}`, classId: 'cleric' }))
    )
    expect([...seen].sort()).toEqual(['evil', 'good', 'neutral'])
  })

  test('armour caps DEX (chain) or ignores it (plate); unarmoured is cloth', () => {
    const nimble = { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 }
    const ac = (armour: string | null) =>
      memberStats(makeCharacter({ abilities: nimble, gear: { weapon: null, armour } }), content).ac
    expect(ac(null)).toBe(ac('cloth-garb'))
    expect(ac('leather-armour')).toBeGreaterThan(ac('cloth-garb'))
    expect(ac('chain-mail')).toBeLessThan(ac('leather-armour') + 2) // capped at +2 DEX
    expect(ac('plate-armour')).toBe(16)
  })

  test('a fine weapon hits more often; daggers crit on 19; bows and staffs stand at the back', () => {
    const swordsman = (weapon: string) =>
      makeCharacter({ gear: { weapon, armour: null }, abilities: { ...makeCharacter().abilities } })
    expect(memberStats(swordsman('fine-longsword'), content).toHit).toBeGreaterThan(
      memberStats(swordsman('longsword'), content).toHit
    )
    expect(memberStats(swordsman('dagger'), content).critMin).toBe(19)
    expect(memberStats(swordsman('longsword'), content).critMin).toBe(20)
    expect(rankOf(swordsman('shortbow'), content)).toBe('back')
    expect(rankOf(swordsman('longsword'), content)).toBe('front')
    expect(rankOf({ ...swordsman('shortbow'), rank: 'front' }, content)).toBe('front')
  })
})
