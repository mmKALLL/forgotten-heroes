import { describe, expect, test } from 'vitest'
import { loadBundledContent } from './bundled'

/** Dark rooms (Plan 7 Track D, combat design §7b) in the authored dungeons. */
const content = loadBundledContent()
const dungeons = Object.values(content.dungeons)
const darkRooms = (d: (typeof dungeons)[number]) => d.rooms.filter((r) => r.dark).length

describe('dark rooms', () => {
  test('fuel matters in about 60% of dungeons, and about 20% are mostly dark', () => {
    const some = dungeons.filter((d) => darkRooms(d) > 0).length / dungeons.length
    const mostly =
      dungeons.filter((d) => darkRooms(d) * 2 >= d.rooms.length).length / dungeons.length
    expect(some).toBeGreaterThanOrEqual(0.45)
    expect(some).toBeLessThanOrEqual(0.75)
    expect(mostly).toBeGreaterThanOrEqual(0.1)
    expect(mostly).toBeLessThanOrEqual(0.3)
    // Mostly dark is the rarer kind of dark dungeon.
    expect(mostly).toBeLessThan(some)
  })

  test('the ancestries the designer named see in the dark, and humans do not', () => {
    for (const id of ['elf', 'dwarf', 'orc']) expect(content.ancestries[id].darkvision).toBe(true)
    expect(content.ancestries.human.darkvision).toBe(false)
  })
})
