import { describe, expect, test } from 'vitest'
import { DungeonSchema } from './dungeon'
import { SituationSchema } from './encounter'

const room = (id: string, at: [number, number] = [0.5, 0.5]) => ({
  id,
  name: `The ${id}`,
  at,
  text: 'Water stands ankle-deep.',
  situations: [`${id}-situation`],
})

const dungeon = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-vault',
  name: 'The Test Vault',
  map: 'tiles and battle maps/dungeon maps/_dungeon/test.jpg',
  mapSize: [4096, 2304],
  cr: 4,
  biomes: ['hills'],
  summary: 'A drowned treasury.',
  entrance: [0.08, 0.52],
  rooms: [room('hall'), room('sluice'), room('vault')],
  hoard: { text: 'Coins in a rotted chest.', precious: 1 },
  ...overrides,
})

describe('dungeons', () => {
  test('parse with defaults', () => {
    const d = DungeonSchema.parse(dungeon())
    expect(d.hoard).toEqual({ text: 'Coins in a rotted chest.', precious: 1, accessory: 0 })
    expect(d.rooms[0].at).toEqual([0.5, 0.5])
  })

  test('rooms: 3 to 6 with distinct ids', () => {
    expect(DungeonSchema.safeParse(dungeon({ rooms: [room('a'), room('b')] })).success).toBe(false)
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => room(id))
    expect(DungeonSchema.safeParse(dungeon({ rooms: seven })).success).toBe(false)
    const twice = [room('a'), room('b'), room('a')]
    expect(DungeonSchema.safeParse(dungeon({ rooms: twice })).success).toBe(false)
  })

  test('coordinates are fractions of the image', () => {
    expect(DungeonSchema.safeParse(dungeon({ entrance: [1.2, 0.5] })).success).toBe(false)
    const outside = [room('a', [0.5, -0.1]), room('b'), room('c')]
    expect(DungeonSchema.safeParse(dungeon({ rooms: outside })).success).toBe(false)
  })

  test('a known biome and a CR of 0 to 30', () => {
    expect(DungeonSchema.safeParse(dungeon({ biomes: ['moon'] })).success).toBe(false)
    expect(DungeonSchema.safeParse(dungeon({ biomes: [] })).success).toBe(false)
    expect(DungeonSchema.safeParse(dungeon({ cr: 31 })).success).toBe(false)
    expect(DungeonSchema.safeParse(dungeon({ cr: -1 })).success).toBe(false)
  })

  test('a situation is not a dungeon room by default', () => {
    const s = SituationSchema.parse({ id: 'x', title: 'X', stages: { start: { text: 'X' } } })
    expect(s.room).toBe(false)
  })
})
