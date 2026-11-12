import { describe, expect, test } from 'vitest'
import type { Effect, Option, OutcomeBranch, Situation, Stage } from '../schema/encounter'
import { allSituations } from '../engine/encounters/compile'
import { fillText, slotNames } from '../engine/encounters/slots'
import { villainIssues } from '../engine/world/validate'
import { loadBundledContent } from './bundled'

/** The Crisis content (Plan 5b): villains, their sites, names and situations. */
const content = loadBundledContent()
const villains = Object.values(content.villains)
const UNFILLED = /\{[A-Za-z][a-z0-9-]*\}/

/** Every crisis site type of a villain: the reveal, then the three acts. */
const siteTypes = (v: (typeof villains)[number]) => [v.reveal, ...v.acts.map((a) => a.site)]

describe('villains', () => {
  test('there are at least three, each with its own sites', () => {
    expect(villains.length).toBeGreaterThanOrEqual(3)
    const all = villains.flatMap(siteTypes)
    expect(new Set(all).size).toBe(all.length)
  })

  test('their threats, name tables and site types exist; the sites are weight-0 quests with situations', () => {
    expect(villainIssues(content)).toEqual([])
    for (const v of villains) {
      expect(v.threats.length, v.id).toBeGreaterThan(0)
      for (const id of siteTypes(v)) {
        const type = content.poiTypes[id]
        expect(type, id).toBeDefined()
        expect(type.weight, id).toBe(0)
        expect(type.category, id).toBe('quest')
        expect(type.hostile, id).toBe(false)
        expect(type.situations.length, id).toBeGreaterThan(0)
        for (const s of type.situations) expect(content.situations[s]?.site, s).toBe(true)
      }
    }
  })

  test('texts use only the villain slots, and {seat} only in a seat act', () => {
    const allowed = (seat: boolean) => ['villain', 'land', 'site', ...(seat ? ['seat'] : [])]
    for (const v of villains) {
      for (const text of [v.summary, v.omen, v.plan, v.victory])
        for (const name of slotNames(text))
          expect(allowed(false), `${v.id}: ${text}`).toContain(name)
      for (const act of v.acts)
        for (const text of [act.clue, act.thwarted, act.failed])
          for (const name of slotNames(text))
            expect(allowed(act.seat), `${v.id}/${act.id}: ${text}`).toContain(name)
    }
  })

  test('each villain can be named at least 6 ways', () => {
    for (const v of villains) {
      const rows = content.partsTables[v.names!].rows
      expect(new Set(rows.map((r) => r.text)).size, v.id).toBeGreaterThanOrEqual(6)
      for (const r of rows) expect(r.text).not.toMatch(UNFILLED)
    }
  })

  test('crisis site names come out whole with {land} filled, at least 6 ways', () => {
    for (const id of villains.flatMap(siteTypes)) {
      const rows = content.partsTables[content.poiTypes[id].names].rows
      const names = rows.map((r) => fillText(r.text, { land: 'Tradal' }))
      for (const name of names) expect(name, id).not.toMatch(UNFILLED)
      expect(new Set(names).size, id).toBeGreaterThanOrEqual(6)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Walking a situation's stage graph
// ---------------------------------------------------------------------------------------------

/** Every outcome branch of an option (a missing critical tier falls back to fail or success). */
const branchesOf = (option: Option): OutcomeBranch[] =>
  (option.kind === 'fixed' ? [option.outcome] : Object.values(option.outcomes)).flatMap((o) =>
    o ? [o, ...(o.twist ? [o.twist] : [])] : []
  )
const has = (branch: OutcomeBranch, effect: Effect['effect']) =>
  branch.effects.some((e) => e.effect === effect)
const ends = (branch: OutcomeBranch) => !branch.goto && !branch.stay

/** The stages reachable from the start, in walking order. */
function reachable(s: Situation): [string, Stage][] {
  const seen = new Set<string>()
  const queue = [s.start]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id) || !Object.hasOwn(s.stages, id)) continue
    seen.add(id)
    for (const option of s.stages[id].options)
      for (const b of branchesOf(option)) if (b.goto) queue.push(b.goto)
  }
  return [...seen].map((id) => [id, s.stages[id]])
}

const situationsOf = (typeIds: string[]) =>
  typeIds.flatMap((id) => content.poiTypes[id].situations.map((s) => content.situations[s]))
const reveals = situationsOf(villains.map((v) => v.reveal))
const actsOf = (v: (typeof villains)[number]) => situationsOf(v.acts.map((a) => a.site))
const acts = villains.flatMap(actsOf)
const omens = allSituations(content).filter((s) => s.villains.length > 0)
const ids = (list: Situation[]) => list.map((s) => [s.id, s] as const)

describe('reveal situations', () => {
  test.each(ids(reveals))('%s learns the plan on every ending but leaving', (_, s) => {
    let learned = 0
    for (const [stageId, stage] of reachable(s))
      for (const option of stage.options)
        for (const b of branchesOf(option).filter(ends)) {
          if (option.id === 'leave') continue
          expect(has(b, 'learnPlan'), `${stageId}/${option.id}: ${b.text}`).toBe(true)
          learned++
        }
    expect(learned).toBeGreaterThan(0)
  })
})

describe('act situations', () => {
  test.each(ids(acts))('%s can reach thwartAct from its start', (_, s) => {
    const branches = reachable(s).flatMap(([, st]) => st.options.flatMap(branchesOf))
    expect(branches.some((b) => has(b, 'thwartAct'))).toBe(true)
  })

  test.each(ids(acts))(
    '%s ends in a high-stakes finale: success pays, a partial costs, a failure throws you out',
    (_, s) => {
      expect(Object.keys(s.stages).length).toBeGreaterThanOrEqual(3)
      expect(Object.keys(s.stages).length).toBeLessThanOrEqual(4)
      const finales = reachable(s)
        .flatMap(([, st]) => st.options)
        .filter((o) => o.kind === 'check' && has(o.outcomes.success, 'thwartAct'))
      expect(finales.length).toBeGreaterThan(0)
      for (const o of finales) {
        if (o.kind !== 'check') continue
        expect(o.highStakes, o.id).toBe(true)
        const { fail, partial, success } = o.outcomes
        expect(success.effects.some((e) => e.effect === 'gold' && e.amount > 0)).toBe(true)
        expect(has(partial, 'thwartAct'), o.id).toBe(true)
        const cost = partial.effects.some(
          (e) =>
            (e.effect === 'hp' && e.amount < 0) ||
            (e.effect === 'exhaustion' && e.amount > 0) ||
            (e.effect === 'camaraderie' && e.amount < 0)
        )
        expect(cost, `${o.id} partial costs something`).toBe(true)
        for (const b of [fail, o.outcomes.critFail ?? fail]) {
          expect(has(b, 'thwartAct'), o.id).toBe(false)
          if (!ends(b)) continue
          expect(b.effects.some((e) => e.effect === 'hp' && e.amount < 0)).toBe(true)
        }
      }
    }
  )

  test.each(villains.map((v) => [v.id, v] as const))(
    '%s: act III has more stages than act I, and its critical success loots a finer accessory',
    (_, v) => {
      const [first, , last] = v.acts.map((a) => situationsOf([a.site])[0])
      const stages = (s: Situation) => Object.keys(s.stages).length
      expect(stages(last)).toBeGreaterThan(stages(first))
      const tier = (s: Situation) =>
        Math.max(
          ...Object.values(s.stages).flatMap((st) =>
            st.options
              .flatMap(branchesOf)
              .flatMap((b) => b.effects.flatMap((e) => (e.effect === 'accessory' ? [e.tier] : [])))
          )
        )
      expect(tier(last)).toBeGreaterThan(tier(first))
    }
  )
})

describe('omens', () => {
  test('every villain has a hostile and a neutral omen on the road', () => {
    for (const v of villains) {
      const own = omens.filter((s) => s.villains.includes(v.id))
      expect(new Set(own.map((s) => s.disposition)), v.id).toEqual(new Set(['hostile', 'neutral']))
      for (const s of own) {
        expect(s.site, s.id).toBe(false)
        expect(s.followUpOnly, s.id).toBe(false)
      }
    }
  })

  test.each(ids(omens))('%s gives a clue on a success', (_, s) => {
    const branches = Object.values(s.stages).flatMap((st) => st.options.flatMap(branchesOf))
    expect(branches.some((b) => has(b, 'crisisClue'))).toBe(true)
  })
})

test('crisis effects stay where they work', () => {
  const revealIds = new Set(reveals.map((s) => s.id))
  const actIds = new Set(acts.map((s) => s.id))
  for (const s of allSituations(content)) {
    const branches = Object.values(s.stages).flatMap((st) => st.options.flatMap(branchesOf))
    const uses = (effect: Effect['effect']) => branches.some((b) => has(b, effect))
    if (uses('learnPlan')) expect(revealIds, s.id).toContain(s.id)
    if (uses('thwartAct')) expect(actIds, s.id).toContain(s.id)
    if (uses('crisisClue')) expect(s.site || s.villains.length > 0, s.id).toBe(true)
  }
})
