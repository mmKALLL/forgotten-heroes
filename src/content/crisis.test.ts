import { describe, expect, test } from 'vitest'
import type { Effect, Option, OutcomeBranch, Situation, Stage } from '../schema/encounter'
import { allSituations } from '../engine/encounters/compile'
import { challengeSize, playsRound } from '../engine/encounters/challenge'
import { fillText, slotNames } from '../engine/encounters/slots'
import { villainIssues } from '../engine/world/validate'
import { loadBundledContent } from './bundled'

/** The Crisis content (Plan 5b): villains, their sites, names and situations. */
const content = loadBundledContent()
const villains = Object.values(content.villains)
const UNFILLED = /\{[A-Za-z][a-z0-9-]*\}/

/** Every crisis site type of a villain: the acts' leads (which may repeat), then their key sites. */
const siteTypes = (v: (typeof villains)[number]) => [
  ...new Set([...v.acts.map((a) => a.lead), ...v.acts.map((a) => a.site)]),
]

describe('villains', () => {
  test('there are at least three, each with its own sites', () => {
    expect(villains.length).toBeGreaterThanOrEqual(3)
    const all = villains.flatMap(siteTypes)
    expect(new Set(all).size).toBe(all.length)
  })

  test('each act is harder than the one before, and its key site harder than its lead', () => {
    for (const v of villains) {
      v.acts.forEach((act, i) => {
        expect(act.keyCr, `${v.id}/${act.id}`).toBeGreaterThan(act.leadCr)
        if (i > 0) expect(act.keyCr, `${v.id}/${act.id}`).toBeGreaterThan(v.acts[i - 1].keyCr)
      })
    }
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

  test('act finales (key sites) have no water (designer call 2026-11-14)', () => {
    for (const v of villains)
      for (const act of v.acts)
        expect(content.poiTypes[act.site].water ?? false, act.site).toBe(false)
  })

  test('texts use only the villain slots, and {seat} only in a seat act', () => {
    const allowed = (seat: boolean) => ['villain', 'land', 'site', ...(seat ? ['seat'] : [])]
    for (const v of villains) {
      for (const text of [v.summary, v.omen, v.plan, v.victory])
        for (const name of slotNames(text))
          expect(allowed(false), `${v.id}: ${text}`).toContain(name)
      for (const act of v.acts)
        for (const text of [act.clue, act.thwarted, act.failed, act.open ?? '', act.hurry ?? ''])
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
  (option.kind === 'fight'
    ? []
    : option.kind === 'fixed'
      ? [option.outcome]
      : Object.values(option.outcomes)
  ).flatMap((o) => (o ? [o, ...(o.twist ? [o.twist] : [])] : []))
/** Every branch of a stage: its options', and its challenge's win and lose. */
const stageBranches = (stage: Stage): OutcomeBranch[] => [
  ...stage.options.flatMap(branchesOf),
  ...(stage.challenge ? [stage.challenge.win, stage.challenge.lose] : []),
]
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
    for (const b of stageBranches(s.stages[id])) if (b.goto) queue.push(b.goto)
  }
  return [...seen].map((id) => [id, s.stages[id]])
}

const situationsOf = (typeIds: string[]) =>
  typeIds.flatMap((id) => content.poiTypes[id].situations.map((s) => content.situations[s]))
const leads = situationsOf([...new Set(villains.flatMap((v) => v.acts.map((a) => a.lead)))])
const actsOf = (v: (typeof villains)[number]) => situationsOf(v.acts.map((a) => a.site))
const acts = villains.flatMap(actsOf)
/** Each act's key situations with the CR they are played at. */
const keyActs = villains.flatMap((v) =>
  v.acts.flatMap((a) => situationsOf([a.site]).map((s) => [s.id, s, a.keyCr] as const))
)
const omens = allSituations(content).filter((s) => s.villains.length > 0)
const ids = (list: Situation[]) => list.map((s) => [s.id, s] as const)

describe('lead situations', () => {
  test.each(ids(leads))(
    '%s wins the lead on every ending but leaving, fleeing or being thrown out hurt',
    (_, s) => {
      let won = 0
      for (const [stageId, stage] of reachable(s))
        for (const option of stage.options) {
          if (option.id === 'leave' || option.tags?.includes('retreat')) continue
          const lost =
            option.kind === 'check' ? [option.outcomes.fail, option.outcomes.critFail] : []
          for (const b of branchesOf(option).filter(ends)) {
            const wins = has(b, 'learnPlan') || has(b, 'revealKeySite')
            if (!wins && lost.includes(b)) {
              // A retryable lead: a failed fight throws the party out, hurt.
              expect(b.effects.some((e) => e.effect === 'hp' && e.amount < 0)).toBe(true)
              continue
            }
            expect(wins, `${stageId}/${option.id}: ${b.text}`).toBe(true)
            won++
          }
        }
      expect(won).toBeGreaterThan(0)
    }
  )

  test('acts II and III have their own lead types, and a lead can be lost and tried again', () => {
    for (const v of villains) {
      expect(new Set(v.acts.map((a) => a.lead)).size, v.id).toBe(3)
      for (const act of v.acts.slice(1)) {
        const [s] = situationsOf([act.lead])
        const thrownOut = Object.values(s.stages)
          .flatMap((st) => st.options)
          .some(
            (o) =>
              o.kind === 'check' && ends(o.outcomes.fail) && !has(o.outcomes.fail, 'revealKeySite')
          )
        expect(thrownOut, s.id).toBe(true)
      }
    }
  })
})

describe('bosses', () => {
  test('each style is used, and a finale villain names its lieutenants at acts I and II only', () => {
    expect(new Set(villains.map((v) => v.boss))).toEqual(new Set(['recurring', 'finale']))
    for (const v of villains) {
      const named = v.acts.map((a) => a.boss !== undefined)
      expect(named, v.id).toEqual(v.boss === 'finale' ? [true, true, false] : [false, false, false])
    }
  })

  test('some acts surge, but not all', () => {
    const surges = villains.flatMap((v) => v.acts.map((a) => a.surge))
    expect(surges.some(Boolean)).toBe(true)
    expect(surges.every(Boolean)).toBe(false)
  })
})

describe('act situations', () => {
  test.each(ids(acts))('%s can reach thwartAct from its start', (_, s) => {
    const branches = reachable(s).flatMap(([, st]) => stageBranches(st))
    expect(branches.some((b) => has(b, 'thwartAct'))).toBe(true)
  })

  test.each(keyActs)(
    '%s ends in a skill challenge sized by its CR: winning thwarts and pays, losing throws you out hurt',
    (_, s, cr) => {
      expect(Object.keys(s.stages).length).toBeGreaterThanOrEqual(3)
      expect(Object.keys(s.stages).length).toBeLessThanOrEqual(4)
      const finales = reachable(s).filter(([, st]) => st.challenge)
      expect(finales.length).toBe(1)
      const [[id, stage]] = finales
      const { successes, failures, win, lose } = stage.challenge!
      expect({ successes, failures }, id).toEqual(challengeSize(cr))
      // Three or four ways to play each round; only the challenge's end thwarts.
      const rounds = stage.options.filter(playsRound)
      expect(rounds.length).toBeGreaterThanOrEqual(3)
      expect(rounds.length).toBeLessThanOrEqual(4)
      for (const o of stage.options)
        for (const b of branchesOf(o)) expect(has(b, 'thwartAct'), o.id).toBe(false)
      expect(has(win, 'thwartAct')).toBe(true)
      expect(win.effects.some((e) => e.effect === 'gold' && e.amount > 0)).toBe(true)
      expect(has(lose, 'thwartAct')).toBe(false)
      expect(ends(lose)).toBe(true)
      expect(lose.effects.some((e) => e.effect === 'hp' && e.amount < 0)).toBe(true)
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
            stageBranches(st).flatMap((b) =>
              b.effects.flatMap((e) => (e.effect === 'accessory' ? [e.tier] : []))
            )
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
  const leadIds = new Set(leads.map((s) => s.id))
  const actIds = new Set(acts.map((s) => s.id))
  for (const s of allSituations(content)) {
    const branches = Object.values(s.stages).flatMap(stageBranches)
    const uses = (effect: Effect['effect']) => branches.some((b) => has(b, effect))
    if (uses('learnPlan')) expect(leadIds, s.id).toContain(s.id)
    if (uses('revealKeySite')) expect(leadIds, s.id).toContain(s.id)
    if (uses('thwartAct')) expect(actIds, s.id).toContain(s.id)
    if (uses('crisisClue')) expect(s.site || s.villains.length > 0, s.id).toBe(true)
  }
})
