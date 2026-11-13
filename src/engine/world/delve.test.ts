import { describe, expect, test } from 'vitest'
import type { CheckOption } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { createRng } from '../rng'
import { crOffset, crWound, levelGap } from '../rules/levels'
import { crLevel } from '../rules/challenge'
import { step, type Action } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { delvePreview } from './delve'
import { DELVE_WOUND, DUNGEON_XP_SHARE, REINHABIT_DAYS } from '../constants'

const content = fixtureContent()
const act = (s: GameState, a: Action) => step(s, a, content)

/** The party at the fixture's dungeon (the Test Vault, CR 2, three rooms), found and inhabited. */
function atVault(overrides: Partial<GameState> = {}): { state: GameState; id: string } {
  const base = makeState()
  const id = Object.keys(base.world.pois).find((p) => base.world.pois[p].dungeon === 'test-vault')!
  const poi = {
    ...base.world.pois[id],
    discovered: true,
    clearedDay: base.day - REINHABIT_DAYS - 1,
  }
  const world = { ...base.world, pois: { ...base.world.pois, [id]: poi } }
  return { state: { ...base, world, location: id, ...overrides }, id }
}

/** Clears the open room by creeping past (a fixed option: never a failure). */
const creep = (s: GameState) => act(s, { type: 'chooseOption', optionId: 'sneak' })

/** The first rng state from which fighting the open room rolls the tier wanted. */
function fightingTo(s: GameState, tiers: readonly string[]): GameState {
  for (let seed = 1; seed < 500; seed++) {
    const tried = act({ ...s, rng: createRng(seed) }, { type: 'chooseOption', optionId: 'fight' })
    if (tiers.includes(tried.lastRoll?.tier ?? '')) return tried
  }
  throw new Error('no seed rolls that tier')
}

describe('delving', () => {
  test('entering starts the first room, its DCs at the CR and its wounds deeper', () => {
    const { state, id } = atVault()
    const entered = act(state, { type: 'visitPoi' })
    expect(entered.delve).toMatchObject({ poi: id, dungeon: 'test-vault', room: 0, inRoom: true })
    expect(entered.encounter!.situation.id).toBe('test-room-hall')
    const fight = entered.encounter!.situation.stages.start.options[0] as CheckOption
    expect(fight.check.dc).toBe(12 + crOffset(2))
    expect(fight.outcomes.fail.effects).toContainEqual({
      effect: 'hp',
      amount: -3 * DELVE_WOUND,
      target: 'actor',
    })
  })

  test("a room whose encounter can't start ends the delve, saying why", () => {
    const hall = content.situations['test-room-hall']
    const broken = {
      ...content,
      situations: { ...content.situations, 'test-room-hall': { ...hall, start: 'nowhere' } },
    }
    const { state } = atVault()
    const entered = step(state, { type: 'visitPoi' }, broken)
    expect(entered.delve).toBeNull()
    expect(entered.encounter).toBeNull()
    expect(entered.log.at(-1)!.text).toMatch(/can go no further/)
  })

  test('found only by exploring, its level is unknown until entered (Plan 6 wave 2b)', () => {
    const { state, id } = atVault()
    expect(delvePreview(state, content, id)!.suggestedLevel).toBeNull()
    const entered = act(state, { type: 'visitPoi' })
    expect(entered.world.pois[id].known).toBe(true)
    const preview = delvePreview(entered, content, id)!
    expect(preview.suggestedLevel).toBe(preview.level)
  })

  test('a failed room drives the party out, as its outcome says: no hoard, the site stays', () => {
    const { state, id } = atVault()
    const entered = act(state, { type: 'visitPoi' })
    const fight = entered.encounter!.situation.stages.start.options[0] as CheckOption
    // The preview's chip comes from the snapshot: the same effect the roll applies.
    expect(fight.outcomes.fail.effects).toContainEqual({ effect: 'driveOut' })
    expect(fight.outcomes.success.effects).not.toContainEqual({ effect: 'driveOut' })
    const failed = fightingTo(entered, ['fail', 'critFail'])
    expect(failed.delve).toBeNull()
    expect(failed.world.pois[id].clearedDay).toBe(state.world.pois[id].clearedDay)
    expect(failed.gold).toBe(state.gold)
    expect(failed.log.some((l) => /driven out of the Test Vault/.test(l.text))).toBe(true)
    // Not fleeing: no retreat's camaraderie cost beyond the failed check's own.
    const succeeded = fightingTo(entered, ['success', 'critSuccess'])
    expect(succeeded.delve).toMatchObject({ room: 1, inRoom: false })
  })

  test('pressing on enters the room the preview names; withdrawing keeps what was found', () => {
    const { state, id } = atVault()
    const between = creep(act(state, { type: 'visitPoi' }))
    const preview = delvePreview(between, content, id)!
    expect(preview).toMatchObject({ current: 1, done: 1, roomsLeft: 2, inRoom: false, cr: 2 })
    expect(preview.risk).toBeGreaterThanOrEqual(0)
    const on = act(between, { type: 'pressOn' })
    expect(on.delve).toMatchObject({ room: 1, inRoom: true })
    expect(content.dungeons['test-vault'].rooms[1].situations).toContain(on.encounter!.situation.id)
    const out = act(between, { type: 'withdraw' })
    expect(out.delve).toBeNull()
    expect({ ...out, log: [], delve: between.delve }).toEqual({ ...between, log: [] })
    expect(out.camaraderie).toBe(between.camaraderie)
    // Leaving for anywhere else withdraws first.
    const away = act(between, { type: 'explore' })
    expect(away.delve).toBeNull()
  })

  test('the last room pays the hoard in its previewed range and clears the site', () => {
    const { state, id } = atVault()
    let s = act(state, { type: 'visitPoi' })
    s = creep(act(creep(s), { type: 'pressOn' }))
    s = act(s, { type: 'pressOn' })
    const { hoard } = delvePreview(s, content, id)!
    const sneak = s.encounter!.situation.stages.start.options[1]
    expect(sneak.kind === 'fixed' && sneak.outcome.effects).toContainEqual(hoard)
    const done = creep(s)
    expect(done.delve).toBeNull()
    expect(done.world.pois[id].clearedDay).toBe(done.day)
    expect(done.gold - s.gold).toBeGreaterThanOrEqual(hoard.gold.min)
    expect(done.gold - s.gold).toBeLessThanOrEqual(hoard.gold.max)
    expect(hoard.gold.max).toBeGreaterThan(hoard.gold.min)
    const precious = (g: GameState) =>
      (g.goods.gems ?? 0) + (g.goods.relics ?? 0) + (g.goods.luxuries ?? 0)
    expect(precious(done) - precious(s)).toBe(hoard.precious)
    expect(done.party[0].xp - s.party[0].xp).toBe(hoard.xp)
    // Cleared, it lies empty: no second delve.
    expect(act({ ...done, visited: false }, { type: 'visitPoi' }).delve).toBeNull()
  })

  test('a delve is deterministic', () => {
    const run = () => {
      const { state } = atVault()
      let s = act(state, { type: 'visitPoi' })
      s = act(s, { type: 'chooseOption', optionId: 'fight' })
      if (s.delve) s = act(s, { type: 'pressOn' })
      return s
    }
    expect(run()).toEqual(run())
  })

  test('a milestone room pays its XP as previewed, once per clearing (Plan 6 B)', () => {
    const marked = structuredClone(content)
    marked.dungeons['test-vault'].rooms[1].milestone = true
    const go = (s: GameState, a: Action) => step(s, a, marked)
    const { state, id } = atVault()
    const sneak = (s: GameState) => go(s, { type: 'chooseOption', optionId: 'sneak' })
    const atMilestone = go(sneak(go(state, { type: 'visitPoi' })), { type: 'pressOn' })
    const opts = atMilestone.encounter!.situation.stages.start.options
    const passing = opts.find((o) => o.id === 'sneak')!
    const reward =
      passing.kind === 'fixed' && passing.outcome.effects.find((e) => e.effect === 'milestone')
    expect(reward).toBeTruthy()
    const xp = reward && reward.effect === 'milestone' ? reward.xp : 0
    const passed = sneak(atMilestone)
    expect(passed.party[0].xp - atMilestone.party[0].xp).toBe(xp)
    // Withdrawing and coming back: the milestone is not offered or paid again this clearing.
    const out = go(passed, { type: 'withdraw' })
    const again = go(sneak(go({ ...out, visited: false }, { type: 'visitPoi' })), {
      type: 'pressOn',
    })
    const flat = JSON.stringify(again.encounter!.situation)
    expect(flat).not.toContain('"milestone"')
    expect(sneak(again).party[0].xp).toBe(again.party[0].xp)
    // The milestone and the hoard share the dungeon's XP: about DUNGEON_XP_SHARE of a level.
    const hoard = delvePreview(state, marked, id)!.hoard.xp
    const gap = levelGap(crLevel(marked.dungeons['test-vault'].cr))
    expect(hoard + xp).toBeCloseTo(DUNGEON_XP_SHARE * gap, -1)
  })

  test('a deeper CR wounds deeper, and pays more XP (Plan 6 B)', () => {
    expect(crWound(9)).toBeGreaterThan(crWound(2))
    expect(crWound(0)).toBe(1)
    const { state, id } = atVault()
    const deep = {
      ...content,
      dungeons: { 'test-vault': { ...content.dungeons['test-vault'], cr: 9 } },
    }
    expect(delvePreview(state, deep, id)!.hoard.xp).toBeGreaterThan(
      delvePreview(state, content, id)!.hoard.xp
    )
  })

  test('a deeper CR hoards more', () => {
    const { state, id } = atVault()
    const low = delvePreview(state, content, id)!.hoard
    const deep = {
      ...content,
      dungeons: { 'test-vault': { ...content.dungeons['test-vault'], cr: 9 } },
    }
    const high = delvePreview(state, deep, id)!
    expect(high.hoard.gold.min).toBeGreaterThan(low.gold.max)
    expect(high.dcBonus).toBeGreaterThan(0)
    expect(high.level).toBeGreaterThan(high.partyLevel)
  })
})
