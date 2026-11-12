import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { PEOPLE_BY_SIZE } from '../constants'
import { fixtureContent } from '../test-fixtures'
import { generateWorld } from '../world/generate'
import { generatePeople } from './people'

const content = fixtureContent()
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)
const worlds = SEEDS.map((seed) => generateWorld(seed, content))

describe('generatePeople', () => {
  test('is deterministic, and generateWorld adds it last', () => {
    for (const world of worlds.slice(0, 5)) {
      const { people, ...before } = world
      expect(generatePeople(world.seed, content, before)).toEqual(people)
      expect(generatePeople(world.seed, content, before)).toEqual(people)
    }
  })

  test('the world before people is unchanged from v5 (seeds 1–3)', () => {
    // Hashes of the fixture world as generated before Plan 4 T2 added people.
    const hashes = [1, 2, 3].map((seed) => {
      const { people: _people, ...before } = generateWorld(seed, content)
      return createHash('sha256').update(JSON.stringify(before)).digest('hex').slice(0, 16)
    })
    expect(hashes).toEqual(['066fd30890038cbe', 'd81e105ce07a25d2', '684c61c99ba8a106'])
  })

  test('ids name the settlement and the role; no settlement has two people in one role', () => {
    for (const world of worlds) {
      const seen = new Set<string>()
      for (const [id, person] of Object.entries(world.people)) {
        expect(id).toBe(`p-${person.settlement}-${person.role}`)
        const key = `${person.settlement}/${person.role}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })

  test('a role appears only where its service is present and the settlement is big enough', () => {
    let stablemasters = 0
    for (const world of worlds) {
      for (const person of Object.values(world.people)) {
        const settlement = world.settlements[person.settlement]
        const role = content.personRoles[person.role]
        if (role.service) expect(settlement.services).toContain(role.service)
        expect(settlement.sizeTier).toBeGreaterThanOrEqual(role.minSize)
        if (person.role === 'stablemaster') stablemasters++
      }
    }
    expect(stablemasters).toBeGreaterThan(0)
  })

  test('each settlement gets PEOPLE_BY_SIZE people, or every role that fits if fewer', () => {
    for (const world of worlds) {
      for (const [id, settlement] of Object.entries(world.settlements)) {
        const fitting = Object.values(content.personRoles).filter(
          (r) =>
            settlement.sizeTier >= r.minSize &&
            (!r.service || settlement.services.includes(r.service))
        )
        const count = Object.values(world.people).filter((p) => p.settlement === id).length
        expect(count).toBe(Math.min(PEOPLE_BY_SIZE[settlement.sizeTier], fitting.length))
      }
    }
  })

  test('people are mostly of their settlement’s ancestry, and named from the name tables', () => {
    let local = 0
    let total = 0
    for (const world of worlds) {
      for (const person of Object.values(world.people)) {
        total++
        if (person.ancestry === world.settlements[person.settlement].ancestry) local++
        expect(Object.hasOwn(content.ancestries, person.ancestry)).toBe(true)
        expect(['Ada Stone', 'Bram Stone']).toContain(person.name)
      }
    }
    expect(total).toBeGreaterThan(100)
    expect(local / total).toBeGreaterThan(0.65)
    expect(local / total).toBeLessThan(0.85)
  })

  test('a settlement without fitting roles has no one', () => {
    const world = worlds[0]
    const { people: _people, ...before } = world
    const noRoles = { ...content, personRoles: {} }
    expect(generatePeople(world.seed, noRoles, before)).toEqual({})
  })
})
