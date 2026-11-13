import { describe, expect, test } from 'vitest'
import type { CombatUnit } from '../../schema/combat'
import type { Character, GameState } from '../../schema/state'
import { proficiencyBonus } from '../rules/abilities'
import { applyLevelUps, choiceOptions } from '../rules/progression'
import { step, stepPastLevelUps, type Action } from '../state'
import { brom, classFixtureContent, makeCharacter, makeState } from '../test-fixtures'
import { STYLE_DAMAGE, XP_BY_LEVEL } from '../constants'
import { abilitySlots, failChance } from './abilities'
import { memberStats } from './gear'
import { combatPreview } from './preview'
import { memberUnit } from './start'
import { maxUses, spellCasts, usesLeft } from './uses'
import { attacks, unitOf, withFight } from './test-fixtures'

// Plan 7 Track C: proficiencies, class abilities (preview == actual), uses and long rests, and
// the level-up picks.

const content = classFixtureContent()

const scores = { str: 14, dex: 14, con: 12, int: 10, wis: 14, cha: 14 }
const member = (id: string, classId: string, level: number, extra: Partial<Character> = {}) =>
  makeCharacter({ id, name: id, classId, level, abilities: scores, hp: 30, maxHp: 30, ...extra })
/** A member's unit (to-hit +4, d6+2) at a tile, with the member's level. */
const mu = (id: string, tile: number, o: Partial<CombatUnit> = {}) =>
  unitOf({ id, side: 'party', tile, hp: 30, maxHp: 30, ...o })
const foe = (id: string, tile: number, o: Partial<CombatUnit> = {}) =>
  unitOf({ id, side: 'enemy', tile, hp: 40, maxHp: 40, ...o })

const fightWith = (party: Character[], units: CombatUnit[], seed = 1) =>
  withFight(units, {}, seed, { party })
const slot = (s: GameState, id: string, ability: string) =>
  abilitySlots(s, content, id).find((x) => x.ability.id === ability)!
const act = (s: GameState, a: Action) => step(s, a, content)
const ability = (unit: string, id: string, at: { tile?: number; target?: string } = {}) =>
  ({ type: 'combatAbility', unit, ability: id, ...at }) as const
const unitIn = (s: GameState, id: string) => s.combat!.units.find((u) => u.id === id)!
const memberIn = (s: GameState, id: string) => s.party.find((c) => c.id === id)!
/** The member's single attack on a target, as the preview shows it. */
const previewAttack = (s: GameState, unit: string, target: string) =>
  combatPreview(s)!
    .members.find((m) => m.unit === unit)!
    .attacks.find((a) => a.target === target)!.attack[0]

describe('proficiencies', () => {
  test('a weapon outside the class adds no proficiency bonus; staffs suit every caster', () => {
    const sword = { weapon: 'longsword', armour: 'cloth-garb' }
    const fighter = memberStats(member('a', 'fighter', 5, { gear: sword }), content)
    const wizard = memberStats(member('b', 'wizard', 5, { gear: sword }), content)
    expect(fighter.toHit - wizard.toHit).toBe(proficiencyBonus(5))
    expect(wizard.weaponTrained).toBe(false)
    for (const classId of ['wizard', 'cleric', 'paladin', 'bard'])
      expect(
        memberStats(
          member('c', classId, 1, { gear: { weapon: 'quarterstaff', armour: null } }),
          content
        ).weaponTrained
      ).toBe(true)
    expect(
      memberStats(
        member('d', 'rogue', 1, { gear: { weapon: 'quarterstaff', armour: null } }),
        content
      ).weaponTrained
    ).toBe(false)
  })

  test('armour heavier than the class is trained in puts its attacks at disadvantage', () => {
    const plate = { weapon: 'longsword', armour: 'plate-armour' }
    expect(memberStats(member('a', 'fighter', 1, { gear: plate }), content).armourTrained).toBe(
      true
    )
    const wizard = member('b', 'wizard', 1, { gear: plate })
    expect(memberStats(wizard, content).armourTrained).toBe(false)
    expect(memberUnit(wizard, content).untrained).toBe(true)
  })

  test('an untrained attack shows disadvantage and rolls at the odds it shows (Edge cancels it)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = fightWith(
        [member('w', 'wizard', 1)],
        [mu('w', 2, { untrained: true }), foe('e1', 3)],
        seed
      )
      const spec = previewAttack(s, 'w', 'e1')
      expect(spec.mode).toBe('disadvantage')
      const after = act(s, { type: 'combatAct', unit: 'w', tile: 3 })
      expect(attacks(after)[0].chance).toBeCloseTo(spec.hit, 10)
    }
    const edge = withFight(
      [mu('w', 2, { untrained: true }), foe('e1', 3)],
      { footing: 'edge' },
      1,
      {
        party: [member('w', 'wizard', 1)],
      }
    )
    expect(previewAttack(edge, 'w', 'e1').mode).toBe('normal')
  })
})

describe('uses and long rests', () => {
  test('1 use from the level gained, +1 at levels 6, 10, 14 and 18', () => {
    const wind = content.classAbilities['second-wind']
    expect([1, 5, 6, 9, 10, 18, 20].map((level) => maxUses({ level, picks: [] }, wind))).toEqual([
      1, 1, 2, 2, 3, 5, 5,
    ])
    expect(maxUses({ level: 1, picks: [] }, content.classAbilities['action-surge'])).toBe(0)
  })

  test('using an ability spends it; a long rest brings every use back', () => {
    const f = member('f', 'fighter', 3, { hp: 10 })
    const s = fightWith([f], [mu('f', 1, { hp: 10, level: 3 }), foe('e1', 4)])
    const after = act(s, ability('f', 'second-wind'))
    expect(memberIn(after, 'f').spent).toEqual({ 'second-wind': 1 })
    expect(slot(after, 'f', 'second-wind')).toMatchObject({
      left: 0,
      available: false,
      reason: 'no uses left',
    })
    const camp = makeState({ party: [{ ...memberIn(after, 'f'), hp: 10 }], location: null })
    const rested = act(camp, { type: 'rest', lodging: false })
    expect(memberIn(rested, 'f').spent).toEqual({})
    expect(usesLeft(memberIn(rested, 'f'), content.classAbilities['second-wind'])).toBe(1)
  })

  test('spell uses: a level-2 paladin casts level 1 twice; a full caster gains levels sooner', () => {
    expect(spellCasts({ classId: 'paladin', level: 2 }, 1)).toBe(2)
    expect(spellCasts({ classId: 'paladin', level: 1 }, 1)).toBe(0)
    expect([1, 2, 3].map((l) => spellCasts({ classId: 'wizard', level: 5 }, l))).toEqual([3, 2, 1])
    expect(spellCasts({ classId: 'fighter', level: 20 }, 1)).toBe(0)
  })
})

describe('class abilities: preview == actual', () => {
  test('Second Wind heals within its range, from the fighter level', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = fightWith(
        [member('f', 'fighter', 3, { hp: 5 })],
        [mu('f', 1, { hp: 5, level: 3 }), foe('e1', 4)],
        seed
      )
      const [use] = slot(s, 'f', 'second-wind').uses
      expect(use.heal).toEqual([4, 13])
      const after = act(s, ability('f', 'second-wind'))
      const healed = memberIn(after, 'f').hp - 5
      expect(healed).toBeGreaterThanOrEqual(4)
      expect(healed).toBeLessThanOrEqual(13)
      expect(unitIn(after, 'f').hp).toBe(memberIn(after, 'f').hp)
    }
  })

  test('Action Surge waits for the first action, then gives another', () => {
    const s = fightWith([member('f', 'fighter', 2)], [mu('f', 2), foe('e1', 3)])
    expect(slot(s, 'f', 'action-surge')).toMatchObject({ available: false, reason: 'act first' })
    const swung = act(s, { type: 'combatAct', unit: 'f', tile: 3 })
    expect(unitIn(swung, 'f').acted).toBe(true)
    const surged = act(swung, ability('f', 'action-surge'))
    expect(unitIn(surged, 'f').acted).toBe(false)
    expect(attacks(act(surged, { type: 'combatAct', unit: 'f', tile: 3 }))).toHaveLength(2)
  })

  test('Cunning Action: two tiles away from an enemy, no free swing, and the rogue can still act', () => {
    const s = fightWith([member('r', 'rogue', 1)], [mu('r', 2), foe('e1', 3)])
    expect(slot(s, 'r', 'cunning-action').uses.map((u) => u.tile)).toEqual([0, 1])
    const after = act(s, ability('r', 'cunning-action', { tile: 0 }))
    expect(unitIn(after, 'r')).toMatchObject({ tile: 0, moved: true, acted: false })
    expect(attacks(after)).toHaveLength(0)
  })

  test('Lay on Hands heals exactly what it shows, from a pool of 5 HP a level', () => {
    const p = member('p', 'paladin', 2)
    const w = member('w', 'wizard', 2, { hp: 26 })
    const s = fightWith([p, w], [mu('p', 1, { level: 2 }), mu('w', 1, { hp: 26 }), foe('e1', 4)])
    const sl = slot(s, 'p', 'lay-on-hands')
    expect(sl).toMatchObject({ left: 10, max: 10 })
    expect(sl.uses).toEqual([expect.objectContaining({ target: 'w', heal: [4, 4] })])
    const after = act(s, ability('p', 'lay-on-hands', { target: 'w' }))
    expect(memberIn(after, 'w').hp).toBe(30)
    expect(slot(after, 'p', 'lay-on-hands').left).toBe(6)
    expect(unitIn(after, 'p').acted).toBe(true)
  })

  test('Smite attacks at the odds it shows, with 2d8 more, and spends a spell use only on a hit', () => {
    let hits = 0
    for (let seed = 1; seed <= 30; seed++) {
      const s = fightWith(
        [member('p', 'paladin', 2)],
        [mu('p', 2, { level: 2 }), foe('e1', 3)],
        seed
      )
      const [use] = slot(s, 'p', 'divine-smite').uses
      expect(use.spellLevel).toBe(1)
      expect(use.attack!.damage).toEqual([5, 24]) // d6+2 and 2d8
      const after = act(s, ability('p', 'divine-smite', { target: 'e1' }))
      const [record] = attacks(after)
      expect(record.chance).toBeCloseTo(use.attack!.hit, 10)
      expect(record.range).toEqual(record.crit ? use.attack!.critDamage : use.attack!.damage)
      expect(memberIn(after, 'p').spent['spell-1'] ?? 0).toBe(record.hit ? 1 : 0)
      if (record.hit) hits++
    }
    expect(hits).toBeGreaterThan(0)
  })

  test("Mark: the ranger's hits on the marked foe add 1d6, for the whole fight", () => {
    const s = fightWith([member('g', 'ranger', 1)], [mu('g', 2), foe('e1', 3), foe('e2', 3)])
    const marked = act(s, ability('g', 'hunters-mark', { target: 'e1' }))
    expect(unitIn(marked, 'g').acted).toBe(false)
    const spec = previewAttack(marked, 'g', 'e1')
    expect(spec.extraDice).toEqual([{ count: 1, die: 6, bonus: 0 }])
    expect(spec.damage).toEqual([4, 14])
    expect(previewAttack(marked, 'g', 'e2').extraDice).toEqual([])
    const after = act(marked, { type: 'combatAct', unit: 'g', tile: 3, target: 'e1' })
    const [record] = attacks(after)
    expect(record.chance).toBeCloseTo(spec.hit, 10)
    expect(unitIn(after, 'e1').effects[0].until).toBeGreaterThan(100)
  })

  test('Turn Undead: only the undead, each on its failed save; the turned flee', () => {
    const c = member('c', 'cleric', 2)
    const units = (dc: number) => [
      mu('c', 1, { dc }),
      foe('e1', 3, { creature: 'skeleton' }),
      foe('e2', 3),
    ]
    const sure = fightWith([c], units(30))
    const [use] = slot(sure, 'c', 'turn-undead').uses
    expect(use.affects).toEqual([{ unit: 'e1', chance: 1 }])
    const after = act(sure, ability('c', 'turn-undead', { tile: 3 }))
    expect(unitIn(after, 'e1').intent).toMatchObject({ kind: 'move', tile: 4 })
    expect(unitIn(after, 'e2').effects).toEqual([])
    const never = fightWith([c], units(1))
    expect(slot(never, 'c', 'turn-undead').uses[0].affects[0].chance).toBe(0)
    expect(unitIn(act(never, ability('c', 'turn-undead', { tile: 3 })), 'e1').effects).toEqual([])
    expect(failChance(15, 2)).toBeCloseTo(0.6)
  })

  test("Inspire adds a d6 to the ally's attacks this round, at the odds shown", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const party = [member('b', 'bard', 1), member('f', 'fighter', 1)]
      const s = fightWith(party, [mu('b', 1), mu('f', 2), foe('e1', 3, { ac: 18 })], seed)
      const before = previewAttack(s, 'f', 'e1').hit
      const inspired = act(s, ability('b', 'inspire', { target: 'f' }))
      const spec = previewAttack(inspired, 'f', 'e1')
      expect(spec.rollDice).toEqual([{ die: 6, sign: 1 }])
      expect(spec.hit).toBeGreaterThan(before)
      const after = act(inspired, { type: 'combatAct', unit: 'f', tile: 3 })
      expect(attacks(after)[0].chance).toBeCloseTo(spec.hit, 10)
      // It lasts this round only.
      const next = act(after, { type: 'combatEndTurn' })
      if (next.combat?.result === null) expect(unitIn(next, 'f').effects).toEqual([])
    }
  })

  test("Cutting Words takes a d6 off the foe's telegraphed attack, at the odds shown", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const intent = { kind: 'attack' as const, from: 3, tile: 2, twice: false }
      const s = fightWith([member('b', 'bard', 2)], [mu('b', 2), foe('e1', 3, { intent })], seed)
      const cut = act(s, ability('b', 'cutting-words', { target: 'e1' }))
      const [shown] = combatPreview(cut)!.intents[0].attacks
      expect(shown.rollDice).toEqual([{ die: 6, sign: -1 }])
      const after = act(cut, { type: 'combatEndTurn' })
      expect(attacks(after)[0].chance).toBeCloseTo(shown.hit, 10)
    }
  })

  test('Rallying Song: +2 to hit for every member this round', () => {
    const party = [member('b', 'bard', 4), member('f', 'fighter', 4)]
    const s = fightWith(party, [mu('b', 1), mu('f', 2), foe('e1', 3)])
    const sung = act(s, ability('b', 'rallying-song'))
    expect(previewAttack(sung, 'f', 'e1').parts).toContainEqual({
      label: 'rallying-song',
      value: 2,
    })
  })

  test('Discord: the foe falls back, or, with nowhere to go, strikes one of its own at −4', () => {
    const b = member('b', 'bard', 6)
    const back = act(
      fightWith([b], [mu('b', 2), foe('e1', 3)]),
      ability('b', 'discord', { tile: 3 })
    )
    expect(unitIn(back, 'e1').intent).toMatchObject({ kind: 'move', tile: 4 })
    // Pinned at the far end, beside the bard: it turns on the other enemy on its tile.
    const s = fightWith([b], [mu('b', 5), foe('e1', 6), foe('e2', 6)])
    const turned = act(s, ability('b', 'discord', { tile: 6 }))
    const intent = combatPreview(turned)!.intents.find((i) => i.unit === 'e1')!
    expect(intent.attacks).toHaveLength(1)
    expect(intent.attacks[0]).toMatchObject({ target: 'e2' })
    expect(intent.attacks[0].parts).toContainEqual({ label: 'discord', value: -4 })
    const after = act(turned, { type: 'combatEndTurn' })
    const record = attacks(after).find((a) => a.attacker === 'e1')!
    expect(record).toMatchObject({ target: 'e2' })
    expect(record.chance).toBeCloseTo(intent.attacks[0].hit, 10)
  })

  test("the bard's songs of healing: one member, or one roll for the whole party", () => {
    const party = [member('b', 'bard', 6, { hp: 20 }), member('f', 'fighter', 6, { hp: 10 })]
    const units = [mu('b', 1, { hp: 20, level: 6 }), mu('f', 2, { hp: 10 }), foe('e1', 4)]
    const s = fightWith(party, units)
    expect(slot(s, 'b', 'mending-song').uses.find((u) => u.target === 'f')!.heal).toEqual([7, 14])
    const [renewal] = slot(s, 'b', 'song-of-renewal').uses
    expect(renewal.heal).toEqual([4, 9])
    const after = act(s, ability('b', 'song-of-renewal'))
    const gained = [memberIn(after, 'b').hp - 20, memberIn(after, 'f').hp - 10]
    expect(gained[0]).toBe(gained[1])
    expect(gained[0]).toBeGreaterThanOrEqual(4)
    expect(gained[0]).toBeLessThanOrEqual(9)
  })

  test('a specialised song has a bigger effect and one more use', () => {
    const plain = fightWith([member('b', 'bard', 1)], [mu('b', 1), foe('e1', 4)])
    const keen = fightWith(
      [member('b', 'bard', 1, { picks: ['inspire'] })],
      [mu('b', 1), foe('e1', 4)]
    )
    expect(slot(plain, 'b', 'inspire')).toMatchObject({ max: 1 })
    expect(slot(keen, 'b', 'inspire')).toMatchObject({ max: 2 })
    expect(slot(keen, 'b', 'inspire').ability.effects).toEqual([
      { effect: 'rollDie', die: 8, sign: 1 },
    ])
  })

  test('slots are keyed 1–9 in the order gained; outside a fight they show but cannot be used', () => {
    const b = member('b', 'bard', 6)
    const keys = abilitySlots(makeState({ party: [b] }), content, 'b')
    expect(keys.map((k) => [k.key, k.ability.id])).toEqual([
      [1, 'inspire'],
      [2, 'mending-song'],
      [3, 'cutting-words'],
      [4, 'rallying-song'],
      [5, 'discord'],
      [6, 'song-of-renewal'],
    ])
    expect(keys.every((k) => !k.available && k.reason === 'only in a fight')).toBe(true)
  })
})

describe('level-up picks', () => {
  const fighterAt = (level: number) =>
    makeState({ party: [{ ...brom, xp: XP_BY_LEVEL[level - 1] }] })

  test("a fighter's level 4 asks for a style, and Continue waits for it", () => {
    const up = applyLevelUps(fighterAt(4))
    expect(up.levelUps[0].choices).toEqual([{ kind: 'style', level: 4, chosen: null }])
    expect(act(up, { type: 'acknowledgeLevelUps' })).toBe(up)
    expect(act(up, { type: 'rest', lodging: false })).toBe(up)
    expect(choiceOptions(up, content, brom.id, 0)).toEqual(['two-attack', 'single-blow'])
    const pick = (s: GameState, option: string) =>
      act(s, { type: 'chooseLevelUp', characterId: brom.id, index: 0, option })
    const single = pick(up, 'single-blow')
    expect(memberIn(single, brom.id).picks).toEqual(['single-blow'])
    // Changed before Continue: the pick is replaced.
    const two = pick(single, 'two-attack')
    expect(memberIn(two, brom.id).picks).toEqual(['two-attack'])
    expect(pick(two, 'nonsense')).toBe(two)
    const sword = { ...memberIn(two, brom.id), gear: { weapon: 'longsword', armour: null } }
    expect(memberStats(sword, content).fullDamage).toBe(STYLE_DAMAGE)
    expect(
      memberStats({ ...sword, gear: { weapon: 'mace', armour: null } }, content).fullDamage
    ).toBe(0)
    expect(act(two, { type: 'acknowledgeLevelUps' }).levelUps).toEqual([])
  })

  test('a style adds its damage to each attack of that full action', () => {
    const f = member('f', 'fighter', 4, { picks: ['two-attack'] })
    const s = fightWith([f], [mu('f', 2, { fullDamage: STYLE_DAMAGE }), foe('e1', 3)])
    const shown = combatPreview(s)!.members[0].attacks[0]
    expect(shown.full!.map((a) => a.dice.bonus)).toEqual([4, 4])
    expect(shown.attack[0].dice.bonus).toBe(2)
  })

  test('a bard specialises a song they know, not one already specialised', () => {
    const bard = {
      ...makeCharacter({ id: 'b', classId: 'bard', picks: ['inspire'] }),
      xp: XP_BY_LEVEL[3],
    }
    const up = applyLevelUps(makeState({ party: [bard] }))
    expect(up.levelUps[0].choices).toEqual([{ kind: 'specialise', level: 4, chosen: null }])
    expect(choiceOptions(up, content, 'b', 0)).toEqual(['mending-song'])
  })

  test('simulated players take the first option and go on', () => {
    // A fighter with the XP for level 4 levels up in the next step, and the simulation goes on.
    const practice = { type: 'practiceCheck', stat: 'athletics', dc: 2, mode: 'normal' } as const
    const after = stepPastLevelUps(fighterAt(4), practice, content)
    expect(after.party[0].level).toBe(4)
    expect(after.party[0].picks).toEqual(['two-attack'])
    expect(after.levelUps).toEqual([])
  })
})
