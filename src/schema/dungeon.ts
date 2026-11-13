import { z } from 'zod'
import { BiomeSchema, IdSchema } from './common'

// ---------------------------------------------------------------------------------------------
// Authored dungeons (Plan 6, Track D): each is drawn on one dungeon map image and delved room by
// room in order, each room one situation drawn from its own (`room: true` site situations).
// ---------------------------------------------------------------------------------------------

const FractionSchema = z.number().min(0).max(1)
/** A point on the map image as [x, y] fractions of its width and height. */
export const MapPointSchema = z.tuple([FractionSchema, FractionSchema])

export const DungeonRoomSchema = z.object({
  id: IdSchema.describe('Unique within its dungeon'),
  name: z.string().describe('e.g. "The Flooded Hall"'),
  at: MapPointSchema.describe('Where the room is on the map, as [x, y] fractions of the image'),
  text: z.string().describe('What is here, from the map (in our own words)'),
  situations: z
    .array(IdSchema)
    .min(1)
    .max(3)
    .describe('The possible encounters (situations with room: true and site: true); one is drawn'),
  dark: z
    .boolean()
    .optional()
    .describe('Unlit (Plan 7 §7b): fuel lights it, or the party is Exposed in every check there'),
  milestone: z
    .literal(true)
    .optional()
    .describe(
      'A significant midway point (a gate, a midboss): getting through it pays a share of the ' +
        "dungeon's XP, once per clearing (Plan 6 B). Never the last room"
    ),
})
export type DungeonRoom = z.infer<typeof DungeonRoomSchema>

export const DungeonHoardSchema = z.object({
  text: z.string().describe('What the party finds at the end'),
  precious: z.number().int().min(0).default(0).describe('Precious goods in the hoard'),
  accessory: z.number().int().min(0).default(0).describe('Accessories in the hoard'),
})
export type DungeonHoard = z.infer<typeof DungeonHoardSchema>

export const DungeonSchema = z
  .object({
    id: IdSchema,
    name: z
      .string()
      .describe(
        'e.g. "the Sunken Vault": a leading "the" is lower case, as the name reads mid-sentence (it is capitalised where it stands alone)'
      ),
    notes: z.string().optional(),
    map: z
      .string()
      .min(1)
      .describe('The map image, relative to ~/dnd5e (listed in assets.manifest.txt)'),
    mapSize: z
      .tuple([z.number().int().positive(), z.number().int().positive()])
      .describe("The image's [width, height] in pixels"),
    cr: z.number().int().min(0).max(30).describe('The fixed challenge rating'),
    biomes: z.array(BiomeSchema).min(1).describe('Where it may be placed'),
    summary: z.string().describe('One line on the map card'),
    entrance: MapPointSchema.describe('Where the party enters, as [x, y] fractions of the image'),
    rooms: z
      .array(DungeonRoomSchema)
      .min(3)
      .max(10)
      .describe('In delve order (most have 5; longer where the map has more, from CR 10 up)'),
    hoard: DungeonHoardSchema.describe('Paid when the last room is cleared'),
  })
  .refine((d) => new Set(d.rooms.map((r) => r.id)).size === d.rooms.length, {
    message: 'room ids must be distinct',
    path: ['rooms'],
  })
export type Dungeon = z.infer<typeof DungeonSchema>
