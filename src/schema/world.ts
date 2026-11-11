import { z } from 'zod'
import {
  AlignmentSchema,
  BiomeSchema,
  CreatureTypeSchema,
  IdSchema,
  SizeTierSchema,
} from './common'

// ---------------------------------------------------------------------------------------------
// Geography: read off the Altaeus map once, the same in every world.
// ---------------------------------------------------------------------------------------------

/** The Altaeus map image is 4096×3072 px; coordinates are in its pixels. */
export const MAP_WIDTH = 4096
export const MAP_HEIGHT = 3072
/** The map's scale bar: 100 km is 484 px. */
export const PX_PER_KM = 4.84

export const MapPointSchema = z.object({
  x: z.number().min(0).max(MAP_WIDTH),
  y: z.number().min(0).max(MAP_HEIGHT),
})
export type MapPoint = z.infer<typeof MapPointSchema>

export const RegionSchema = z.object({
  id: IdSchema,
  name: z.string().describe('As labelled on the world map'),
  biome: BiomeSchema.describe('The dominant terrain'),
  label: MapPointSchema.describe('Where the map prints the name, in map pixels'),
  notes: z.string().optional(),
})
export type Region = z.infer<typeof RegionSchema>

export const SettlementSchema = z.object({
  id: IdSchema.describe('<region>-<n>; names come from the political layer'),
  at: MapPointSchema.describe('The marker centre, in map pixels'),
  region: IdSchema,
  island: IdSchema.describe('The land mass it stands on, e.g. "mainland"; land routes stay on one'),
  capital: z.boolean().default(false).describe('A framed (capital city) marker on the map'),
  coastal: z.boolean().default(false).describe('By the sea: ports and sea routes need it'),
  notes: z.string().optional(),
})
export type Settlement = z.infer<typeof SettlementSchema>

export const RouteSchema = z.object({
  id: IdSchema.describe('"<from>-<to>", the two settlement ids in alphabetical order'),
  from: IdSchema,
  to: IdSchema,
  km: z
    .number()
    .int()
    .min(1)
    .describe('Straight-line km (4.84 px per km) × 1.2 on land, × 1.1 at sea'),
  terrain: BiomeSchema.describe('What the route mostly crosses; "sea" for a crossing by ship'),
  danger: z
    .number()
    .int()
    .min(0)
    .max(3)
    .describe('0 patrolled road, 1 ordinary road, 2 wild track, 3 notorious'),
  notes: z.string().optional(),
})
export type Route = z.infer<typeof RouteSchema>

// ---------------------------------------------------------------------------------------------
// Names and factions the political layer draws from.
// ---------------------------------------------------------------------------------------------

export const TownSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string().describe('From the town-map filename, e.g. "poor seaside capital"'),
  alignment: AlignmentSchema.optional(),
  size: SizeTierSchema.optional().describe('The size its description suggests'),
  capital: z.boolean().default(false).describe('Described as a capital: prefers a kingdom seat'),
  biomes: z.array(BiomeSchema).default([]).describe('Terrain its description suggests'),
  coastal: z.boolean().default(false).describe('Seaside, port or island: only placed by the sea'),
  wealth: z.number().int().min(-3).max(3).default(0).describe('Rich +2, poor −2, ...'),
  ancestry: IdSchema.optional(),
  banner: z.string().optional().describe('Image path under assets/, shown as the town banner'),
  site: IdSchema.optional().describe('Always placed at this settlement (labelled on the map)'),
  altaeus: z.boolean().default(false).describe('Drawn for Altaeus (town maps/__altaeus/)'),
})
export type Town = z.infer<typeof TownSchema>

export const PlaceNameTableSchema = z.object({
  id: IdSchema,
  style: z.string().describe('e.g. "english", "french"'),
  weight: z.number().min(0).default(1),
  first: z.array(z.string()).min(1).describe('A name is a first part plus a second part'),
  second: z.array(z.string()).min(1),
})
export type PlaceNameTable = z.infer<typeof PlaceNameTableSchema>

const strength = z.number().int().min(1).max(6)

export const ThreatSchema = z.object({
  id: IdSchema,
  name: z.string().describe('e.g. "Orc warband"'),
  description: z.string(),
  creatureTypes: z.array(CreatureTypeSchema).default([]).describe('For encounter slots, later'),
  biomes: z.array(BiomeSchema).default([]).describe('Favoured terrain; empty means anywhere'),
  strength: z.object({ min: strength, max: strength }),
})
export type Threat = z.infer<typeof ThreatSchema>
