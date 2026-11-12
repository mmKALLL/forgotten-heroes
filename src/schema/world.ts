import { z } from 'zod'
import {
  AlignmentSchema,
  BiomeSchema,
  CreatureTypeSchema,
  IdSchema,
  PoiCategorySchema,
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

export const LandSpotSchema = z.object({
  id: IdSchema.describe('"spot-<n>"'),
  at: MapPointSchema.describe('A point on land, in map pixels'),
  island: IdSchema.describe('The land mass it is on, as for settlements'),
  terrain: BiomeSchema.exclude(['sea'])
    .optional()
    .describe("The terrain here; omit to take the land's biome"),
})
export type LandSpot = z.infer<typeof LandSpotSchema>

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

const poiThreat = z.number().int().min(1).max(3)

/** A kind of point of interest, in the weighted table the POIs of each world are drawn from. */
export const PoiTypeSchema = z
  .object({
    id: IdSchema,
    category: PoiCategorySchema,
    name: z.string().describe('What the type is called, e.g. "War camp"'),
    weight: z.number().min(0).default(1).describe('Relative chance of being drawn'),
    biomes: z
      .array(BiomeSchema)
      .default([])
      .describe('Favoured terrain: drawn more often (POI_FAVOURED×) on matching land'),
    threats: z
      .array(IdSchema)
      .default([])
      .describe('Favoured threats: drawn more often (POI_FAVOURED×) where they hold the land'),
    hostile: z
      .boolean()
      .default(false)
      .describe("A lair or active dungeon: feeds its domain's threat until cleared"),
    threat: z
      .object({ min: poiThreat, max: poiThreat })
      .refine((t) => t.min <= t.max, 'min must not exceed max')
      .optional()
      .describe("What a hostile site adds to its domain's threat; required when hostile"),
    pathDanger: z
      .number()
      .int()
      .min(0)
      .max(3)
      .default(1)
      .describe('Danger of the path there, as for routes: 0 safe to 3 notorious'),
    water: z.boolean().default(false).describe('A spring or well: arriving refills the waterskins'),
    names: IdSchema.describe('The parts table its names are drawn from'),
    situations: z.array(IdSchema).min(1).describe('The site situations played on a visit'),
    icon: z.string().optional().describe('A game-icons.net icon id for the map'),
  })
  .refine((t) => t.hostile === (t.threat !== undefined), {
    message: 'a hostile type needs a threat, and only a hostile type may have one',
    path: ['threat'],
  })
export type PoiType = z.infer<typeof PoiTypeSchema>

// ---------------------------------------------------------------------------------------------
// The political layer: rolled for each world and kept in GameState.world.
// ---------------------------------------------------------------------------------------------

export const KingdomSchema = z.object({
  id: IdSchema,
  name: z.string(),
  ancestry: IdSchema.describe('The ruling ancestry'),
  seat: IdSchema.describe('The settlement that is its seat, a capital marker when it can be'),
  domains: z.array(IdSchema).min(1).describe('The domains (settlement ids) it holds'),
  defence: z
    .number()
    .int()
    .min(0)
    .describe('Split across its domains as garrisons, thinning with distance from the seat'),
})
export type Kingdom = z.infer<typeof KingdomSchema>

/** A land (a map area): the threat roaming it. */
export const LandStateSchema = z.object({
  threat: IdSchema,
  threatStrength: z.number().int().min(1).max(6),
})
export type LandState = z.infer<typeof LandStateSchema>

/** A domain (one per settlement): who holds it and how strongly. */
export const DomainStateSchema = z.object({
  kingdom: IdSchema,
  land: IdSchema.describe("The settlement's land (its region)"),
  garrison: z.number().min(0).describe("This domain's share of its kingdom's defence"),
})
export type DomainState = z.infer<typeof DomainStateSchema>

/** The v3 kingdom over regions. Replaced by KingdomSchema in GameState v4. */
export const RegionKingdomSchema = z.object({
  id: IdSchema,
  name: z.string(),
  ancestry: IdSchema.describe('The ruling ancestry'),
  capital: IdSchema.describe('The settlement that is its seat'),
  regions: z.array(IdSchema).min(1),
  defence: z.number().int().min(0).describe('Split evenly across its regions as garrisons'),
})
export type RegionKingdom = z.infer<typeof RegionKingdomSchema>

export const RegionStateSchema = z.object({
  kingdom: IdSchema,
  threat: IdSchema,
  threatStrength: z.number().int().min(1).max(6),
  threatLevel: z.number().int().min(0).max(3).describe('How far the threat outweighs the garrison'),
})
export type RegionState = z.infer<typeof RegionStateSchema>

export const SettlementStateSchema = z.object({
  name: z.string(),
  town: IdSchema.nullable().describe('The towns entry it is named after, for the banner'),
  type: IdSchema.describe('A settlementTypes id'),
  population: z.number().int().min(0),
  sizeTier: z.number().int().min(0).max(5),
  wealth: z.number().int(),
  ancestry: IdSchema,
  services: z.array(IdSchema),
})
export type SettlementState = z.infer<typeof SettlementStateSchema>

export const WorldStateSchema = z.object({
  seed: z.number().int().min(0).max(0xffffffff),
  kingdoms: z.array(RegionKingdomSchema),
  regions: z.record(IdSchema, RegionStateSchema),
  settlements: z.record(IdSchema, SettlementStateSchema),
})
export type WorldState = z.infer<typeof WorldStateSchema>
