import { describe, expect, test } from 'vitest'
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
