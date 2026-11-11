# Plan 3: World and Travel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Put the party on the Altaeus map. The fixed geography (regions, settlement markers and routes) is read off the world map into JSON. A seeded political layer gives every world its kingdoms, regional threats, and settlement names, types and services. The party travels day by day along routes: it eats and drinks, risks exhaustion when supplies run short, meets a budgeted number of encounters drawn for the terrain and region, and arrives at a settlement. Strain makes leaning on one specialist cost something. A world map view and a simple settlement screen show it all.

**Architecture:**
- **Schemas** (`src/schema/world.ts`): six new content kinds, `regions`, `settlements`, `routes`, `towns`, `placeNames` and `threats`, plus the generated world state (`WorldState`: kingdoms, region states, settlement states).
- **Data:**
  - `data/claude/`: the geography read off the map (`regions.json`, `settlements.json`, `routes.json`), the threat factions (`threats.json`) and realm-name forms (`world-parts.json`).
  - `data/original/`: town names and hints parsed from the user's town-map filenames (`towns.json`), and the prototype's place-name parts (`place-names.json`).
  - The map image itself is never committed. The scripts that read it live in `scripts/map/` for provenance.
- **Engine**, all pure:
  - `src/engine/world/`: `geo.ts` (distances, routes, components), `validate.ts` (world data checks), `names.ts` (place and realm names), `politics.ts` (kingdoms and threats), `settlements.ts` (types, sizes, services and names), `generate.ts` (`generateWorld`, `startingSettlement`).
  - `src/engine/travel/`: `routes.ts` (speed, days, encounter budget, fares), `supplies.ts` (daily consumption, shortages, rest, buying food), `journey.ts` (depart, continue, arrive), `preview.ts` (what the UI shows before the player commits).
  - `src/engine/rules/strain.ts` and `src/engine/calendar.ts`.
- **State:** `GameState` v3 adds `world`, `location`, `travel` and `goods` (food and water only; Plan 4 widens `GOODS`), and `strain` on each character. The v2 → v3 migration generates the political layer from the save's seed, so `migrate` and `deserialize` now take the content.
- **UI:** `WorldMap` (an SVG over the map image, or plain parchment when the image is missing), `PlacePanel` (the settlement placeholder with roads out), `JourneyPanel` (progress and Continue). Strain shows on party cards and in the actor picker. The Encounter Deck stays as a dev panel.

**Tech stack:** unchanged: pnpm, Vite, React 19, TypeScript (strict), zod 4, Vitest (jsdom and Testing Library for UI). The map scripts need Python 3 with Pillow, numpy and scipy; they are not part of `pnpm test`.

**Context docs:**
- [Rebuild design](2026-11-12-rebuild-design.md): §3 (Strain), §4 (goods), §6 (world), §7 (travel and encounters), §9 (UI), §11 (scope).
- [Plan 2](2026-11-12-plan-2-encounters.md), whose encounter engine this plan drives from the road.
- The prototype's generators: `git show v0.1.0-svelte-final:src/lib/generators/towns.ts` and `git show v0.1.0-svelte-final:src/lib/utils/settlement-utils.ts`.

**Conventions:**
- Prettier style from `.prettierrc.cjs`: no semicolons, single quotes, width 100. Run `pnpm format` before each commit.
- Schema constants end in `Schema`; inferred types use the plain name. No functions inside data.
- Engine tests use `src/engine/test-fixtures.ts` (Task 2 adds a tiny world to it). Only `src/content/*.test.ts` reads the bundled data.
- Commit after every task with `git add <paths>`, never `git add -A`. Never push.
- Other agents work on the UI at the same time. Before a UI task, re-read the component you are about to change; when its markup has moved on, apply the same change to the current markup rather than pasting over it.

**Out of scope (YAGNI):** the goods economy, market and price book, town ledger, lodging quality and reputation (Plan 4); mood, morale and camaraderie; world simulation ticks; successive parties and run end (Plan 5); combat; multi-leg route planning (the player picks one neighbouring settlement at a time).

---

## World data at a glance

Geography (`data/claude/`), read off the map once and fixed for every world:

```json
{ "id": "deddar-marsh", "name": "Deddar Marsh", "biome": "marsh", "label": { "x": 1120, "y": 960 } }
{ "id": "deddar-marsh-1", "at": { "x": 777, "y": 1087 }, "region": "deddar-marsh", "island": "mainland", "coastal": true }
{ "id": "deddar-marsh-1-deddar-marsh-2", "from": "deddar-marsh-1", "to": "deddar-marsh-2", "km": 96, "terrain": "marsh", "danger": 2 }
```

Town names (`data/original/towns.json`), parsed from filenames such as `Amiton - seaside swamp town - CN.jpg`:

```json
{ "id": "amiton", "name": "Amiton", "description": "seaside swamp town", "alignment": "CN", "size": "town",
  "biomes": ["marsh"], "coastal": true, "wealth": 0, "banner": "town maps/__altaeus/Amiton - seaside swamp town - CN.jpg",
  "site": "deddar-marsh-1", "altaeus": true }
```

The political layer (`state.world`), rolled from a seed for each new world:

```json
{
  "seed": 1592818531,
  "kingdoms": [{ "id": "kingdom-1", "name": "Principality of Ravenford", "ancestry": "human", "capital": "providence-3", "regions": ["providence", "tradal"], "defence": 7 }],
  "regions": { "tradal": { "kingdom": "kingdom-1", "threat": "goblin-raiders", "threatStrength": 4, "threatLevel": 1 } },
  "settlements": { "deddar-marsh-1": { "name": "Amiton", "town": "amiton", "type": "town", "population": 2210, "sizeTier": 3, "wealth": 1, "ancestry": "human", "services": ["inn-tavern", "port"] } }
}
```

The rules the engine applies:
- **Distances.** The map's scale bar is 100 km = 484 px, so `PX_PER_KM = 4.84`. A land route's `km` is the straight line × 1.2, rounded (roads wind); a sea route's is × 1.1. The validator accepts anything from the straight line to twice it.
- **Islands.** Land routes stay on one land mass. Islands are reached by `"terrain": "sea"` routes between coastal settlements.
- **Speed.** km per day by terrain: plains 30, forest and hills 24, desert 21, marsh and jungle 18, mountains 15, sea 75. A journey takes `ceil(km / speed)` days, at least 1.
- **Encounters.** A journey of up to 2 days gets 0–2 encounters, 3–4 days 1–3, 5 or more 2–4. Each slot above the minimum fills with chance 20% + 15% per route danger + 10% per regional threat level (5–90%). The days are drawn at departure. At sea, only situations tagged `"biomes": ["sea"]` are drawn; on land, untagged situations happen anywhere.
- **Supplies.** Each member eats 1 food and drinks 1 water a day (2 water in the desert). A member who goes without makes a CON check (DC 10 without food, 15 without water) or gains a level of exhaustion.
- **Strain.** The third check with a skill in a day, or the tenth in seven days, adds a stack: −1 to that skill. Each strained skill loses one stack per day.

---

### Task 1: World vocabulary and schemas

Biomes, size tiers, alignments and goods become shared constants. Six new content kinds get zod schemas, JSON Schemas and empty tables.

**Files:**
- Create: `src/schema/world.ts`
- Modify: `src/schema/constants.ts`, `src/schema/common.ts`, `src/schema/content.ts`, `src/content/build.ts`
- Generate: `data/_schema/{regions,settlements,routes,towns,placeNames,threats}.schema.json`
- Test: `src/schema/world.test.ts`

**Step 1: Write the failing test**

Create `src/schema/world.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { contentFileSchema } from './content'
import { RegionSchema, RouteSchema, SettlementSchema, ThreatSchema, TownSchema } from './world'

describe('world schemas', () => {
  test('a settlement is a marker inside the 4096×3072 map', () => {
    const marker = { id: 'avarus-1', at: { x: 1650, y: 1109 }, region: 'avarus', island: 'mainland' }
    expect(SettlementSchema.parse(marker)).toEqual({ ...marker, capital: false, coastal: false })
    expect(SettlementSchema.safeParse({ ...marker, at: { x: 5000, y: 10 } }).success).toBe(false)
    expect(SettlementSchema.safeParse({ ...marker, at: { x: -1, y: 10 } }).success).toBe(false)
  })

  test('regions have a biome and a label position', () => {
    const region = { id: 'avarus', name: 'Avarus', biome: 'forest', label: { x: 1620, y: 1560 } }
    expect(RegionSchema.parse(region)).toEqual(region)
    expect(RegionSchema.safeParse({ ...region, biome: 'lava' }).success).toBe(false)
  })

  test('routes have whole km, a terrain and a danger of 0 to 3', () => {
    const route = { id: 'a-b', from: 'a', to: 'b', km: 62, terrain: 'forest', danger: 2 }
    expect(RouteSchema.parse(route)).toEqual(route)
    expect(RouteSchema.safeParse({ ...route, danger: 4 }).success).toBe(false)
    expect(RouteSchema.safeParse({ ...route, km: 0 }).success).toBe(false)
    expect(RouteSchema.safeParse({ ...route, terrain: 'sea' }).success).toBe(true)
  })

  test('towns default to no hints', () => {
    expect(TownSchema.parse({ id: 'corso', name: 'Corso', description: 'poor seaside capital' })).toEqual(
      {
        id: 'corso',
        name: 'Corso',
        description: 'poor seaside capital',
        capital: false,
        biomes: [],
        coastal: false,
        wealth: 0,
        altaeus: false,
      }
    )
    expect(TownSchema.safeParse({ id: 'x', name: 'X', description: '', alignment: 'ZZ' }).success).toBe(
      false
    )
  })

  test('threats have a strength range of 1 to 6', () => {
    const threat = {
      id: 'orc-warband',
      name: 'Orc warband',
      description: 'Raiders from the hills.',
      strength: { min: 2, max: 5 },
    }
    expect(ThreatSchema.parse(threat)).toEqual({ ...threat, creatureTypes: [], biomes: [] })
    expect(ThreatSchema.safeParse({ ...threat, strength: { min: 0, max: 7 } }).success).toBe(false)
  })

  test('the new kinds have content file schemas', () => {
    const kinds = ['regions', 'settlements', 'routes', 'towns', 'placeNames', 'threats'] as const
    for (const kind of kinds) {
      expect(contentFileSchema(kind).safeParse({ kind, source: 'claude', entries: [] }).success).toBe(
        true
      )
    }
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/schema/world.test.ts`. Expected: FAIL, `./world` does not exist.

**Step 3: Implement**

Append to `src/schema/constants.ts`:

```ts

/** Terrain: a region's dominant biome, and a route's terrain ("sea" for a crossing by ship). */
export const BIOMES = [
  'plains',
  'forest',
  'hills',
  'mountains',
  'marsh',
  'desert',
  'jungle',
  'sea',
] as const
export type Biome = (typeof BIOMES)[number]

/**
 * Settlement size tiers, smallest first, as in the prototype. A settlement's tier indexes
 * ServiceDef.presenceThresholdBySize, so there are exactly six.
 */
export const SIZE_TIERS = ['outpost', 'hamlet', 'village', 'town', 'city', 'metropolis'] as const
export type SizeTier = (typeof SIZE_TIERS)[number]

export const ALIGNMENTS = ['LG', 'NG', 'CG', 'LN', 'TN', 'CN', 'LE', 'NE', 'CE'] as const
export type Alignment = (typeof ALIGNMENTS)[number]

/**
 * The goods tracked so far: the essentials consumed every day. Plan 4 adds the other 13 goods
 * (design §4) to this list. Saves keep loading, because a good that is missing counts as 0.
 */
export const GOODS = ['food', 'water'] as const
export type Good = (typeof GOODS)[number]
```

In `src/schema/common.ts`, extend the constants import and add the schemas after `CreatureTypeSchema`:

```ts
import {
  ABILITIES,
  ALIGNMENTS,
  BIOMES,
  CREATURE_TYPES,
  GOODS,
  LOG_TONES,
  POSITIONS,
  SIZE_TIERS,
  SKILLS,
} from './constants'
```

```ts
export const BiomeSchema = z.enum(BIOMES)
export const SizeTierSchema = z.enum(SIZE_TIERS)
export const AlignmentSchema = z.enum(ALIGNMENTS)
export const GoodSchema = z.enum(GOODS)
```

Create `src/schema/world.ts`:

```ts
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
```

In `src/schema/content.ts`, import the world schemas and register the kinds in `CONTENT_KINDS`, after `creatures` (if a `translations` kind follows it, keep that last). If `content.ts` has a `TRANSLATABLE_KINDS` list ("every kind but translations"), add the six kinds there too, so region and threat names can be translated:

```ts
import {
  PlaceNameTableSchema,
  RegionSchema,
  RouteSchema,
  SettlementSchema,
  ThreatSchema,
  TownSchema,
} from './world'
```

```ts
  creatures: CreatureSchema,
  regions: RegionSchema,
  settlements: SettlementSchema,
  routes: RouteSchema,
  towns: TownSchema,
  placeNames: PlaceNameTableSchema,
  threats: ThreatSchema,
```

In `src/content/build.ts`, add the same keys to `emptyContent()`:

```ts
  regions: {},
  settlements: {},
  routes: {},
  towns: {},
  placeNames: {},
  threats: {},
```

(If `src/content/build.test.ts` lists the kinds of `emptyContent()`, update that list too.)

**Step 4: Generate the JSON Schemas and run the tests**

Run: `pnpm schemas`. Expected: six new files in `data/_schema/` (one schema per kind).
Run: `pnpm test && pnpm typecheck`. Expected: PASS.

**Step 5: Commit**

```bash
pnpm format
git add src/schema src/content/build.ts src/content/build.test.ts data/_schema
git commit -m "add world schemas: regions, settlements, routes, towns, place names, threats"
```

---

### Task 2: A test world and the world validator

Engine tests need a small world that never changes when the real data is edited. The validator checks what zod can't: references, distances against the map scale, islands and connectivity.

**Files:**
- Create: `src/engine/world/geo.ts`, `src/engine/world/validate.ts`
- Modify: `src/engine/test-fixtures.ts`
- Test: `src/engine/world/validate.test.ts`

**Step 1: Add the test world to the fixtures**

In `src/engine/test-fixtures.ts`, add this before `export function fixtureContent()`:

```ts
const settlementType = (
  id: string,
  minPopulation: number,
  maxPopulation: number,
  maxServices: number,
  ratio: number
) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  category: id === 'fort' ? 'military' : 'lifeplace',
  minPopulation,
  maxPopulation,
  maxServices,
  ratio,
  hostileChance: 0.1,
  predominantAncestry: 'human',
})

const service = (id: string, name: string, presenceThresholdBySize: number[]) => ({
  id,
  name,
  presenceThresholdBySize,
  itemSaleTags: [],
  typicalRarity: 0,
  maxRarity: 0,
})

/**
 * A tiny world: Greenvale (plains) and Ashmoor (marsh) on the mainland, and Far Isle across the
 * sea. Greenvale 1 and Far Isle 1 have capital markers. Distances fit the 4.84 px/km scale.
 */
export const testWorld: Record<string, unknown> = {
  'data/original/settlement-types.json': {
    kind: 'settlementTypes',
    source: 'original',
    entries: [
      settlementType('hamlet', 50, 150, 4, 2.5),
      settlementType('village', 300, 1200, 6, 2),
      settlementType('town', 1000, 6000, 8, 1),
      settlementType('city', 4000, 15000, 10, 0.5),
      settlementType('capital', 12000, 50000, 12, 0.1),
      settlementType('fort', 200, 400, 4, 0.75),
    ],
  },
  'data/original/services.json': {
    kind: 'services',
    source: 'original',
    entries: [
      service('inn-tavern', 'Inn/Tavern', [10, 8, 6, 4, 2, 1]),
      service('port', 'Port', [19, 18, 16, 14, 12, 10]),
      service('magic-items', 'Magic items', [25, 22, 19, 16, 15, 14]),
    ],
  },
  'data/claude/regions.json': {
    kind: 'regions',
    source: 'claude',
    entries: [
      { id: 'greenvale', name: 'Greenvale', biome: 'plains', label: { x: 1150, y: 950 } },
      { id: 'ashmoor', name: 'Ashmoor', biome: 'marsh', label: { x: 1300, y: 1350 } },
      { id: 'farisle', name: 'Far Isle', biome: 'forest', label: { x: 2000, y: 1250 } },
    ],
  },
  'data/claude/settlements.json': {
    kind: 'settlements',
    source: 'claude',
    entries: [
      {
        id: 'greenvale-1',
        at: { x: 1000, y: 1000 },
        region: 'greenvale',
        island: 'mainland',
        capital: true,
        coastal: true,
      },
      { id: 'greenvale-2', at: { x: 1300, y: 1000 }, region: 'greenvale', island: 'mainland' },
      {
        id: 'ashmoor-1',
        at: { x: 1300, y: 1300 },
        region: 'ashmoor',
        island: 'mainland',
        coastal: true,
      },
      {
        id: 'farisle-1',
        at: { x: 2000, y: 1300 },
        region: 'farisle',
        island: 'farisle',
        capital: true,
        coastal: true,
      },
    ],
  },
  'data/claude/routes.json': {
    kind: 'routes',
    source: 'claude',
    entries: [
      {
        id: 'greenvale-1-greenvale-2',
        from: 'greenvale-1',
        to: 'greenvale-2',
        km: 75,
        terrain: 'plains',
        danger: 0,
      },
      {
        id: 'ashmoor-1-greenvale-2',
        from: 'greenvale-2',
        to: 'ashmoor-1',
        km: 75,
        terrain: 'marsh',
        danger: 2,
      },
      {
        id: 'ashmoor-1-greenvale-1',
        from: 'greenvale-1',
        to: 'ashmoor-1',
        km: 105,
        terrain: 'forest',
        danger: 1,
      },
      {
        id: 'ashmoor-1-farisle-1',
        from: 'ashmoor-1',
        to: 'farisle-1',
        km: 160,
        terrain: 'sea',
        danger: 1,
      },
    ],
  },
  'data/original/towns.json': {
    kind: 'towns',
    source: 'original',
    entries: [
      {
        id: 'harbourne',
        name: 'Harbourne',
        description: 'rich seaside town',
        alignment: 'LN',
        size: 'town',
        biomes: ['plains'],
        coastal: true,
        wealth: 2,
        banner: 'town maps/Harbourne - rich seaside town - LN.jpg',
      },
      {
        id: 'mirefold',
        name: 'Mirefold',
        description: 'poor marsh village',
        size: 'village',
        biomes: ['marsh'],
        wealth: -2,
      },
    ],
  },
  'data/original/place-names.json': {
    kind: 'placeNames',
    source: 'original',
    entries: [
      {
        id: 'test-compound',
        style: 'english',
        first: ['raven', 'stone', 'ash'],
        second: ['ford', 'hold', 'stone'],
      },
    ],
  },
  'data/claude/threats.json': {
    kind: 'threats',
    source: 'claude',
    entries: [
      {
        id: 'orc-warband',
        name: 'Orc warband',
        description: 'Raiders.',
        biomes: ['hills', 'mountains'],
        strength: { min: 2, max: 4 },
      },
      {
        id: 'bog-cult',
        name: 'Bog cult',
        description: 'Drowners.',
        biomes: ['marsh'],
        strength: { min: 1, max: 3 },
      },
      { id: 'bandits', name: 'Bandits', description: 'Thieves.', strength: { min: 1, max: 2 } },
    ],
  },
  'data/claude/world-parts.json': {
    kind: 'partsTables',
    source: 'claude',
    entries: [
      {
        id: 'realm-name',
        description: 'Realm names',
        rows: [{ text: 'Kingdom of {place}' }, { text: '{Place} Marches' }],
      },
    ],
  },
}
```

Then spread it into the files `fixtureContent()` builds: change `const { content, errors } = buildContent({` to keep every existing file and add `...testWorld,` as the last entry of that object.

**Step 2: Write the failing tests**

Create `src/engine/world/validate.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { fixtureContent } from '../test-fixtures'
import { components, otherEnd, routesFrom, straightKm } from './geo'
import { worldIssues } from './validate'

const content = fixtureContent()
const edit = (change: (c: Content) => void): Content => {
  const copy = structuredClone(content)
  change(copy)
  return copy
}

describe('geography helpers', () => {
  test('straight-line km use the scale bar: 100 km is 484 px', () => {
    expect(straightKm({ x: 0, y: 0 }, { x: 484, y: 0 })).toBeCloseTo(100)
  })

  test('the routes from a settlement, and where each leads', () => {
    expect(routesFrom(content, 'ashmoor-1').map((r) => r.id)).toEqual([
      'ashmoor-1-farisle-1',
      'ashmoor-1-greenvale-1',
      'ashmoor-1-greenvale-2',
    ])
    expect(otherEnd(content.routes['ashmoor-1-farisle-1'], 'farisle-1')).toBe('ashmoor-1')
  })

  test('connected components, optionally over some routes only', () => {
    expect(components(content)).toEqual([['ashmoor-1', 'farisle-1', 'greenvale-1', 'greenvale-2']])
    expect(components(content, (r) => r.terrain !== 'sea')).toEqual([
      ['ashmoor-1', 'greenvale-1', 'greenvale-2'],
      ['farisle-1'],
    ])
  })
})

describe('worldIssues', () => {
  test('the test world is valid', () => {
    expect(worldIssues(content)).toEqual([])
  })

  test('unknown regions and route ends', () => {
    const broken = edit((c) => {
      c.settlements['greenvale-2'].region = 'nowhere'
      c.routes['greenvale-1-greenvale-2'].to = 'atlantis'
    })
    expect(worldIssues(broken)).toEqual(
      expect.arrayContaining([
        'settlement greenvale-2: unknown region "nowhere"',
        'route greenvale-1-greenvale-2: unknown settlement "atlantis"',
      ])
    )
  })

  test('distances must fit the map scale', () => {
    const short = edit((c) => {
      c.routes['greenvale-1-greenvale-2'].km = 40
    })
    expect(worldIssues(short)).toContain(
      'route greenvale-1-greenvale-2: 40 km is shorter than the straight line (62 km)'
    )
    const long = edit((c) => {
      c.routes['greenvale-1-greenvale-2'].km = 400
    })
    expect(worldIssues(long)).toContain(
      'route greenvale-1-greenvale-2: 400 km is more than twice the straight line (62 km)'
    )
  })

  test('land routes stay on one island; sea routes join coastal settlements', () => {
    const bridge = edit((c) => {
      c.routes['ashmoor-1-farisle-1'].terrain = 'forest'
    })
    expect(worldIssues(bridge)).toContain(
      'route ashmoor-1-farisle-1: a land route cannot join mainland and farisle; use terrain "sea"'
    )
    const inland = edit((c) => {
      c.settlements['farisle-1'].coastal = false
    })
    expect(worldIssues(inland)).toContain(
      'route ashmoor-1-farisle-1: sea routes need a coastal settlement at both ends'
    )
  })

  test('every settlement is reachable, and each island is connected by land', () => {
    const cut = edit((c) => {
      delete c.routes['ashmoor-1-farisle-1']
    })
    expect(worldIssues(cut)).toContain(
      'the routes split the world into 2 parts: ashmoor-1, greenvale-1, greenvale-2 | farisle-1'
    )
    const split = edit((c) => {
      delete c.routes['greenvale-1-greenvale-2']
      delete c.routes['ashmoor-1-greenvale-2']
    })
    expect(worldIssues(split)).toContain(
      'island mainland: land routes leave 2 parts: ashmoor-1, greenvale-1 | greenvale-2'
    )
  })

  test('regions need settlements; routes and town pins are unique and known', () => {
    const empty = edit((c) => {
      c.regions.void = { ...c.regions.greenvale, id: 'void', name: 'Void' }
    })
    expect(worldIssues(empty)).toContain('region void has no settlements')
    const twice = edit((c) => {
      c.routes.again = {
        ...c.routes['greenvale-1-greenvale-2'],
        id: 'again',
        from: 'greenvale-2',
        to: 'greenvale-1',
      }
    })
    expect(worldIssues(twice)).toContain('route greenvale-1-greenvale-2: duplicates route again')
    const pinned = edit((c) => {
      c.towns.harbourne.site = 'atlantis'
    })
    expect(worldIssues(pinned)).toContain('town harbourne: unknown site "atlantis"')
  })
})
```

**Step 3: Run them to verify they fail**

Run: `pnpm vitest run src/engine/world`. Expected: FAIL, `./geo` and `./validate` do not exist.

**Step 4: Implement**

Create `src/engine/world/geo.ts`:

```ts
import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import { PX_PER_KM, type MapPoint, type Route } from '../../schema/world'

export const straightKm = (a: MapPoint, b: MapPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y) / PX_PER_KM

/** The routes that start or end at a settlement, sorted by id. */
export const routesFrom = (content: Content, settlementId: string): Route[] =>
  sortedEntries(content.routes).filter((r) => r.from === settlementId || r.to === settlementId)

export const otherEnd = (route: Route, settlementId: string): string =>
  route.from === settlementId ? route.to : route.from

/**
 * Groups of settlements joined by the routes `use` accepts, each sorted by id, in order of their
 * first member. `among` limits the settlements considered (e.g. one island).
 */
export function components(
  content: Content,
  use: (route: Route) => boolean = () => true,
  among?: ReadonlySet<string>
): string[][] {
  const ids = sortedEntries(content.settlements)
    .map((s) => s.id)
    .filter((id) => !among || among.has(id))
  const links = new Map(ids.map((id) => [id, [] as string[]]))
  for (const route of sortedEntries(content.routes)) {
    if (!use(route) || !links.has(route.from) || !links.has(route.to)) continue
    links.get(route.from)!.push(route.to)
    links.get(route.to)!.push(route.from)
  }
  const seen = new Set<string>()
  const groups: string[][] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    const group: string[] = []
    const queue = [id]
    seen.add(id)
    while (queue.length > 0) {
      const next = queue.shift()!
      group.push(next)
      for (const linked of links.get(next)!) {
        if (seen.has(linked)) continue
        seen.add(linked)
        queue.push(linked)
      }
    }
    groups.push(group.sort(byCodeUnit))
  }
  return groups
}
```

Create `src/engine/world/validate.ts`:

```ts
import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import { components, straightKm } from './geo'

/** A route may wind, but not to more than twice the straight line. */
export const MAX_WINDING = 2

const groupsText = (groups: string[][]): string => groups.map((g) => g.join(', ')).join(' | ')

/**
 * Problems with the world data that the schemas can't see: unknown references, distances that
 * don't fit the map scale, land routes between islands, and settlements that can't be reached.
 */
export function worldIssues(content: Content): string[] {
  const issues: string[] = []
  const { regions, settlements, routes, towns } = content

  for (const s of sortedEntries(settlements)) {
    if (!Object.hasOwn(regions, s.region)) {
      issues.push(`settlement ${s.id}: unknown region "${s.region}"`)
    }
  }
  for (const r of sortedEntries(regions)) {
    if (!Object.values(settlements).some((s) => s.region === r.id)) {
      issues.push(`region ${r.id} has no settlements`)
    }
  }

  const pairs = new Map<string, string>()
  for (const route of sortedEntries(routes)) {
    const unknown = [route.from, route.to].filter((id) => !Object.hasOwn(settlements, id))
    for (const id of unknown) issues.push(`route ${route.id}: unknown settlement "${id}"`)
    if (unknown.length > 0) continue
    if (route.from === route.to) {
      issues.push(`route ${route.id}: starts and ends at ${route.from}`)
      continue
    }
    const pair = [route.from, route.to].sort(byCodeUnit).join(' ')
    if (pairs.has(pair)) issues.push(`route ${route.id}: duplicates route ${pairs.get(pair)}`)
    else pairs.set(pair, route.id)

    const a = settlements[route.from]
    const b = settlements[route.to]
    const straight = straightKm(a.at, b.at)
    const shown = Math.round(straight)
    if (route.km < Math.floor(straight)) {
      issues.push(
        `route ${route.id}: ${route.km} km is shorter than the straight line (${shown} km)`
      )
    }
    if (route.km > Math.max(5, MAX_WINDING * straight)) {
      issues.push(
        `route ${route.id}: ${route.km} km is more than twice the straight line (${shown} km)`
      )
    }
    if (route.terrain === 'sea') {
      if (!a.coastal || !b.coastal) {
        issues.push(`route ${route.id}: sea routes need a coastal settlement at both ends`)
      }
    } else if (a.island !== b.island) {
      issues.push(
        `route ${route.id}: a land route cannot join ${a.island} and ${b.island}; use terrain "sea"`
      )
    }
  }

  const all = components(content)
  if (all.length > 1) {
    issues.push(`the routes split the world into ${all.length} parts: ${groupsText(all)}`)
  }
  const islands = [...new Set(Object.values(settlements).map((s) => s.island))].sort(byCodeUnit)
  for (const island of islands) {
    const members = new Set(
      Object.values(settlements)
        .filter((s) => s.island === island)
        .map((s) => s.id)
    )
    const parts = components(content, (r) => r.terrain !== 'sea', members)
    if (parts.length > 1) {
      issues.push(`island ${island}: land routes leave ${parts.length} parts: ${groupsText(parts)}`)
    }
  }

  const pins = new Map<string, string>()
  for (const town of sortedEntries(towns)) {
    if (!town.site) continue
    if (!Object.hasOwn(settlements, town.site)) {
      issues.push(`town ${town.id}: unknown site "${town.site}"`)
    } else if (pins.has(town.site)) {
      issues.push(`town ${town.id}: ${town.site} is already pinned to ${pins.get(town.site)}`)
    } else {
      pins.set(town.site, town.id)
    }
  }
  return issues
}
```

**Step 5: Run the tests**

Run: `pnpm test && pnpm typecheck`. Expected: PASS. (The bundled data has no world files yet, so nothing else changes.)

**Step 6: Commit**

```bash
pnpm format
git add src/engine/world src/engine/test-fixtures.ts
git commit -m "add a test world and the world data validator"
```

---

### Task 3: Settlement markers and regions from the map

The geography is read off `assets/world maps/altaeus map.jpg` (4096×3072, gitignored). A script finds the markers; you hand-check them and write two data files. The image is never committed: only the coordinates derived from it.

**Files:**
- Create: `scripts/map/detect_markers.py`, `data/claude/regions.json`, `data/claude/settlements.json`

**Step 1: Add the marker detector**

Create `scripts/map/detect_markers.py`:

```python
"""Finds the settlement markers on the Altaeus world map, for a hand check.

Usage: python3 -I scripts/map/detect_markers.py "assets/world maps/altaeus map.jpg" <out-dir>
Needs Python 3 with Pillow, numpy and scipy (not part of pnpm test). Writes <out-dir>/markers.json
and <out-dir>/markers-overlay.jpg (half size; blue = capital, red = city or village, numbered,
"c" = coastal). Put <out-dir> in a scratch folder, never in the repo.

Markers are flat, dark grey-brown rounded squares about 20 px wide. Capital markers add a light
ring and a dark octagonal frame around the square. Land is warm (red well above blue), the sea grey.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
L = (r + g + b) / 3

# Land masses at quarter size. Rivers and lakes are filled in, so each land mass is one component.
small = np.asarray(im.resize((W // 4, H // 4), Image.BILINEAR)).astype(int)
warm = small[..., 0] - small[..., 2] > 22
land = ndi.binary_opening(
    ndi.binary_fill_holes(ndi.binary_closing(warm, np.ones((5, 5)))), np.ones((3, 3)))
islands, _ = ndi.label(land)
sea = ~ndi.binary_closing(warm, np.ones((3, 3)))

# Marker fill: dark, greyish brown and flat.
fill = (r > 70) & (r < 125) & (g > 60) & (g < 110) & (b > 40) & (b < 100) & (r - b < 45)
fill = ndi.binary_opening(ndi.binary_closing(fill, np.ones((3, 3))), np.ones((11, 11)))
labels, _ = ndi.label(fill)


def framed(profile):
    """A light ring just outside the fill, then a dark frame: a capital marker."""
    k = next((j for j, v in enumerate(profile) if v > 190), None)
    return k is not None and k < 6 and any(v < 140 for v in profile[k:k + 8])


markers = []
for i, sl in enumerate(ndi.find_objects(labels)):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    h, w = y1 - y0, x1 - x0
    area = (labels[sl] == i + 1).sum()
    if not (12 <= h <= 34 and 12 <= w <= 34 and 0.6 < w / h < 1.6 and area > 0.7 * w * h):
        continue
    if x0 > W - 720 and y0 > H - 360:
        continue  # the legend's sample markers
    inner = L[y0 + 3:y1 - 3, x0 + 3:x1 - 3]
    ring = np.concatenate([L[y0 - 6:y0 - 2, x0:x1].ravel(), L[y1 + 2:y1 + 6, x0:x1].ravel(),
                           L[y0:y1, x0 - 6:x0 - 2].ravel(), L[y0:y1, x1 + 2:x1 + 6].ravel()])
    if inner.std() > 18 or np.percentile(ring, 75) - inner.mean() < 40:
        continue  # textured ink (mountains, trees, lettering), not a flat marker
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    sx, sy = cx // 4, cy // 4
    if land[max(0, sy - 8):sy + 8, max(0, sx - 8):sx + 8].mean() < 0.3:
        continue  # on open sea: the compass rose and sea lettering
    half = max(w, h) // 2
    profiles = [L[cy, cx + half:cx + half + 16], L[cy, cx - half - 16:cx - half][::-1],
                L[cy + half:cy + half + 16, cx], L[cy - half - 16:cy - half, cx][::-1]]
    near = islands[max(0, sy - 6):sy + 7, max(0, sx - 6):sx + 7]
    island = int(np.bincount(near[near > 0]).argmax()) if (near > 0).any() else 0
    coastal = bool(sea[max(0, sy - 12):sy + 13, max(0, sx - 12):sx + 13].any())  # sea within ~50 px
    markers.append({'x': int(cx), 'y': int(cy), 'capital': sum(map(framed, profiles)) >= 3,
                    'island': island, 'coastal': coastal})

markers.sort(key=lambda m: (m['island'], m['y'], m['x']))
with open(f'{out}/markers.json', 'w') as f:
    json.dump(markers, f, indent=1)
print(len(markers), 'markers,', sum(m['capital'] for m in markers), 'capitals,',
      len({m['island'] for m in markers}), 'land masses')

draw = ImageDraw.Draw(im)
for n, m in enumerate(markers):
    colour = (0, 60, 255) if m['capital'] else (220, 0, 0)
    draw.ellipse((m['x'] - 34, m['y'] - 34, m['x'] + 34, m['y'] + 34), outline=colour, width=7)
    draw.text((m['x'] + 38, m['y'] - 20), f"{n}{'c' if m['coastal'] else ''}", fill=colour)
im.resize((W // 2, H // 2)).save(f'{out}/markers-overlay.jpg', quality=85)
```

**Step 2: Run it**

```bash
SCRATCH=<your session scratchpad>/map && mkdir -p "$SCRATCH"
python3 -I scripts/map/detect_markers.py "assets/world maps/altaeus map.jpg" "$SCRATCH"
```

Expected: `52 markers, 12 capitals, 6 land masses`. (If `assets/` is empty, run `pnpm sync-assets` first.)

**Step 3: Hand-check against the map**

Open `$SCRATCH/markers-overlay.jpg` and compare it with the map. For each doubtful spot, crop the original at full size, e.g.:

```bash
python3 -I -c "from PIL import Image; Image.open('assets/world maps/altaeus map.jpg').crop((3260,1017,3460,1217)).save('$SCRATCH/crop.png')"
```

Known corrections from the plan's own trial run (confirm them):
- **Missed:** the capital in the Olsari crater, at about (3360, 1117). Add it: capital, coastal (the crater lake opens to the sea), on the Olsari land mass.
- **Misclassified:** the framed marker in Putrid Vale at about (1188, 1669) is a capital (its frame sits on dark ground, so the frame test misses it).
- Expect **53 markers and 14 capitals** after the corrections. Check the `coastal` guesses too: "coastal" means the settlement could have a harbour on the open sea. A marker on a lake or river shore is not coastal.

**Step 4: Name the land masses and regions**

Land masses (the script's numeric `island` ids vary; use these names): `mainland` (43 markers), `caerdydd` (1, the north-west island), `providence-islet` (1, the islet north-east of Providence), `olsari` (2), `kard-krait` (3) and `jurgenvren` (3, the southern island).

Regions are the names printed on the map. Read each label's centre off the map, then confirm the spelling with a full-size crop. The plan's trial reading (positions approximate):

| id | name | biome | label (x, y) |
|---|---|---|---|
| `caerdydd` | Caerdydd | forest | 540, 340 |
| `norrikk` | Nörrikk | mountains | 1580, 370 |
| `reapers-pass` | Reapers Pass | hills | 2000, 600 |
| `providence` | Providence | plains | 2340, 320 |
| `tradal` | Tradal | forest | 2400, 880 |
| `falholt` | Falholt | mountains | 1800, 860 |
| `deadcliff-mesa` | Deadcliff Mesa | desert | 2240, 1240 |
| `deddar-marsh` | Deddar Marsh | marsh | 1120, 960 |
| `westreach` | Westreach | plains | 660, 1520 |
| `avarus` | Avarus | forest | 1620, 1560 |
| `putrid-vale` | Putrid Vale | marsh | 1200, 1920 |
| `barren-expanse` | The Barren Expanse | desert | 860, 2160 |
| `hyron` | Hyron | jungle | 1680, 2120 |
| `kard-krait` | Kard Krait | forest | 2760, 1380 |
| `olsari` | Olsari | jungle | 3280, 1380 |
| `jurgenvren` | Jurgenvren | mountains | 2700, 2700 |

The southern island's label runs over two lines ("ARD" above "JURGENVREN"); check whether it reads "Jurgenvren" or a longer name, and use what the map says. The `biome` is the region's dominant terrain as drawn (palms = jungle, dunes and mesas = desert, dense reed and pool symbols = marsh).

Assign each marker to the region whose label area it sits in. Markers near a border need a crop: follow the map's own region extents (mountain ridges, rivers and coasts), not the nearest label. The `providence-islet` marker belongs to `providence`.

**Step 5: Write the data files**

Number each region's settlements west to east (`<region>-1`, `<region>-2`, ...). Write `data/claude/regions.json`:

```json
{
  "$schema": "../_schema/regions.schema.json",
  "kind": "regions",
  "source": "claude",
  "notes": "Region names and label positions read off the Altaeus world map (assets/world maps/altaeus map.jpg, @scenerydnd, not committed). Biomes are Claude's reading of the drawn terrain.",
  "entries": [{ "id": "caerdydd", "name": "Caerdydd", "biome": "forest", "label": { "x": 540, "y": 340 } }]
}
```

and `data/claude/settlements.json` with every marker:

```json
{
  "$schema": "../_schema/settlements.schema.json",
  "kind": "settlements",
  "source": "claude",
  "notes": "Marker positions from scripts/map/detect_markers.py, hand-checked against the map. Capital markers are framed squares. Islands: mainland, caerdydd, providence-islet, olsari, kard-krait, jurgenvren.",
  "entries": [{ "id": "caerdydd-1", "at": { "x": 943, "y": 371 }, "region": "caerdydd", "island": "caerdydd", "coastal": true }]
}
```

Leave out `capital` and `coastal` when they are false.

**Step 6: Verify**

Draw the result to check it once more: markers coloured by region, with ids. A quick script in the scratchpad is enough (read `settlements.json`, draw each `at` with its id on the map, save half size). Every marker should carry the right region.

Run: `pnpm test src/content/bundled.test.ts`. Expected: PASS (every data file is valid).

**Step 7: Commit**

```bash
git add scripts/map/detect_markers.py data/claude/regions.json data/claude/settlements.json
git commit -m "add the Altaeus regions and settlement markers"
```

---

### Task 4: Routes from the map

The map draws roads as dashed lines between markers. A script proposes candidate links; you keep the ones the map supports and add sea crossings.

**Files:**
- Create: `scripts/map/route_candidates.py`, `data/claude/routes.json`, `src/content/world.test.ts`

**Step 1: Add the candidate script**

Create `scripts/map/route_candidates.py`:

```python
"""Proposes routes between settlements, for a hand review against the map's dashed roads.

Usage: python3 -I scripts/map/route_candidates.py "assets/world maps/altaeus map.jpg" \
         data/claude/settlements.json <out-dir> [data/claude/routes.json]
Writes <out-dir>/candidates.json and <out-dir>/candidates-overlay.jpg: each settlement's 4 nearest
neighbours, numbered (green = the straight line stays on land, blue = it crosses water). With a
routes file it draws those routes instead (<out-dir>/routes-overlay.jpg), to check the result.
Needs Python 3 with Pillow and numpy.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw

PX_PER_KM = 4.84
NEAREST = 4

src, settlements_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
routes_path = sys.argv[4] if len(sys.argv) > 4 else None
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
warm = a[..., 0] - a[..., 2] > 22  # land; the sea is grey
with open(settlements_path) as f:
    sites = json.load(f)['entries']
at = {s['id']: (s['at']['x'], s['at']['y']) for s in sites}


def land_fraction(p, q, steps=200):
    xs = np.linspace(p[0], q[0], steps).astype(int)
    ys = np.linspace(p[1], q[1], steps).astype(int)
    return float(warm[ys, xs].mean())


draw = ImageDraw.Draw(im)
if routes_path:
    with open(routes_path) as f:
        routes = json.load(f)['entries']
    for route in routes:
        p, q = at[route['from']], at[route['to']]
        colour = (0, 80, 255) if route['terrain'] == 'sea' else (0, 150, 0)
        draw.line((*p, *q), fill=colour, width=6)
        draw.text(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), f"{route['km']} d{route['danger']}",
                  fill=(200, 0, 0))
    im.resize((im.width // 2, im.height // 2)).save(f'{out}/routes-overlay.jpg', quality=85)
    sys.exit(0)

pairs = set()
for s in sites:
    others = sorted((t for t in sites if t['id'] != s['id']),
                    key=lambda t: math.dist(at[s['id']], at[t['id']]))
    for t in others[:NEAREST]:
        pairs.add(tuple(sorted((s['id'], t['id']))))

candidates = []
for n, (u, v) in enumerate(sorted(pairs)):
    straight = math.dist(at[u], at[v]) / PX_PER_KM
    candidates.append({'n': n, 'from': u, 'to': v, 'straightKm': round(straight, 1),
                       'land': round(land_fraction(at[u], at[v]), 2)})
    colour = (0, 150, 0) if candidates[-1]['land'] > 0.9 else (0, 80, 255)
    draw.line((*at[u], *at[v]), fill=colour, width=5)
    draw.text(((at[u][0] + at[v][0]) / 2, (at[u][1] + at[v][1]) / 2), str(n), fill=(200, 0, 0))
with open(f'{out}/candidates.json', 'w') as f:
    json.dump(candidates, f, indent=1)
im.resize((im.width // 2, im.height // 2)).save(f'{out}/candidates-overlay.jpg', quality=85)
print(len(candidates), 'candidates')
```

**Step 2: Run it and review**

```bash
python3 -I scripts/map/route_candidates.py "assets/world maps/altaeus map.jpg" data/claude/settlements.json "$SCRATCH"
```

Expected: about 130 candidates. Review them in `candidates-overlay.jpg` next to full-size crops of the map:
- **Keep** a land candidate when a dashed road runs between the two markers, or when the terrain plainly allows a track (a valley, a coast) and no dashed road offers a sensible alternative. Drop candidates that cut across a mountain range the roads go around, or a bay.
- **Add** a road the map draws that isn't a candidate (two markers that aren't each other's 4 nearest).
- **Sea crossings:** link every island to the mainland with at least one crossing between coastal settlements, choosing the shortest plausible crossing (Caerdydd to the Nörrikk west coast, the Providence islet to Providence, Olsari to Kard Krait or Tradal, Kard Krait to Deadcliff Mesa or Avarus, Jurgenvren to Hyron or Kard Krait). Add a ferry across Silver Gulf or Crystal Bay only if it saves a long detour.
- Aim for about 90 routes, with every settlement on at least one and most on two or three.

For each route:
- `id`: the two settlement ids in alphabetical order, joined by `-` (e.g. `avarus-1-hyron-2`).
- `km`: `round(straightKm × 1.2)` on land, `round(straightKm × 1.1)` at sea.
- `terrain`: what the route mostly crosses (one of `plains`, `forest`, `hills`, `mountains`, `marsh`, `desert`, `jungle`, or `sea`).
- `danger`: 0 for a dashed road between settled places, 1 for an ordinary road, 2 for a wild track (forest, marsh, a mountain pass) or a long open crossing, 3 for the notorious ones (crossing the Barren Expanse, Putrid Vale, the high Reapers Pass). Danger is the road itself; the political threat is rolled separately.

Write `data/claude/routes.json`:

```json
{
  "$schema": "../_schema/routes.schema.json",
  "kind": "routes",
  "source": "claude",
  "notes": "Routes follow the dashed roads on the Altaeus map where it draws them (proposed by scripts/map/route_candidates.py, hand-picked). km = straight line (4.84 px per km) × 1.2 on land, × 1.1 at sea. Terrain and danger are Claude's reading of the map.",
  "entries": []
}
```

**Step 3: Write the failing data test**

Create `src/content/world.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { routesFrom } from '../engine/world/geo'
import { worldIssues } from '../engine/world/validate'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()

describe('the Altaeus geography', () => {
  test('is a valid, connected route graph', () => {
    expect(worldIssues(content)).toEqual([])
  })

  test('has the map’s regions and markers', () => {
    expect(Object.keys(content.regions)).toHaveLength(16)
    expect(Object.keys(content.settlements).length).toBeGreaterThanOrEqual(50)
    expect(Object.values(content.settlements).filter((s) => s.capital).length).toBeGreaterThanOrEqual(
      12
    )
  })

  test('every settlement has a road or a crossing out', () => {
    const stranded = Object.keys(content.settlements).filter(
      (id) => routesFrom(content, id).length === 0
    )
    expect(stranded).toEqual([])
  })
})
```

If the map review in Task 3 found a different number of regions, use that number here.

**Step 4: Run it**

Run: `pnpm vitest run src/content/world.test.ts`. Fix the data until it passes. Then draw the result:

```bash
python3 -I scripts/map/route_candidates.py "assets/world maps/altaeus map.jpg" data/claude/settlements.json "$SCRATCH" data/claude/routes.json
```

and check `routes-overlay.jpg` against the map: roads where the map has roads, no route through a mountain wall, every island linked.

**Step 5: Commit**

```bash
pnpm format
git add scripts/map/route_candidates.py data/claude/routes.json src/content/world.test.ts
git commit -m "add the Altaeus routes"
```

---
### Task 5: Town names from the town-map filenames

Town maps are named `Name - description - alignment`. A pure parser turns each filename into a `towns` entry with hints; a port script writes `data/original/towns.json` from the filenames in `~/dnd5e/town maps/` (it reads names only, never the images). Towns used as banners are added to the asset manifest one by one.

**Files:**
- Create: `scripts/port/town-maps.ts`, `scripts/port/port-town-maps.ts`, `data/original/towns.json`
- Modify: `assets.manifest.txt`, `src/content/world.test.ts`, `CREDITS.md` (local, gitignored)
- Test: `scripts/port/town-maps.test.ts`

**Step 1: Write the failing tests**

Create `scripts/port/town-maps.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { collectTowns, parseTownMapFilename, townEntry } from './town-maps'

const parse = (file: string) => parseTownMapFilename(file)!

describe('parseTownMapFilename', () => {
  test('reads the name, description and alignment', () => {
    expect(parse('Corso - poor seaside capital - CN.jpg')).toEqual({
      name: 'Corso',
      description: 'poor seaside capital',
      alignment: 'CN',
      file: 'Corso - poor seaside capital - CN.jpg',
    })
    expect(parse('Karou-Kapolstad - abandoned mountain city - TN -> CE.jpg').alignment).toBe('CE')
    expect(parse('Nimduin - high elf cliff town.jpeg')).toMatchObject({
      name: 'Nimduin',
      description: 'high elf cliff town',
      alignment: undefined,
    })
    expect(parse('Stonewood - hillsy village - NG').name).toBe('Stonewood')
  })

  test('ignores files that are not named in the pattern', () => {
    expect(parseTownMapFilename('Corso unlabeled.jpeg')).toBeNull()
    expect(parseTownMapFilename('Phandalin player ver hires.jpeg')).toBeNull()
    expect(parseTownMapFilename('_altaeus with town names.xcf')).toBeNull()
  })
})

describe('townEntry', () => {
  test('turns the description into hints', () => {
    expect(townEntry(parse('Corso - poor seaside capital - CN.jpg'), 'town maps/__altaeus', true)).toEqual(
      {
        id: 'corso',
        name: 'Corso',
        description: 'poor seaside capital',
        alignment: 'CN',
        size: 'metropolis',
        capital: true,
        biomes: [],
        coastal: true,
        wealth: -2,
        banner: 'town maps/__altaeus/Corso - poor seaside capital - CN.jpg',
        altaeus: true,
      }
    )
    expect(townEntry(parse('Mos Onjar - rich desert town - LE.jpeg'), 'town maps', false)).toMatchObject(
      { id: 'mos-onjar', size: 'town', biomes: ['desert'], wealth: 2, coastal: false, altaeus: false }
    )
    expect(townEntry(parse('Riverlands - half-elf capitol - CG.jpeg'), 'town maps', false)).toMatchObject(
      { ancestry: 'half-elf', capital: true, size: 'metropolis' }
    )
    expect(
      townEntry(parse('Gleamshore - seclusive wood elf hamlet - CG.jpeg'), 'town maps', false)
    ).toMatchObject({ ancestry: 'elf', biomes: ['forest'], size: 'hamlet' })
    expect(
      townEntry(parse('Kuo Lath - tropical island hamlet - CE.png'), 'town maps', false)
    ).toMatchObject({ biomes: ['jungle'], coastal: true })
  })

  test('skips places that are not living settlements', () => {
    const skipped = [
      'City of Glass - underwater city - TN.jpeg',
      'Menzoberranzan - underdark capital - NE.webp',
      'Hazlan - desert wilderness - CE.webp',
      'Vor Rukoth - abandoned desert hamlet - CE.jpg',
      'Ruins of Gardmore Abbey - hillsy thorp - LE.webp',
      'Magrael - natural forest sight.jpeg',
      "Nystul's Infinite Dungeon - island - TN.jpeg",
    ]
    for (const file of skipped) expect(townEntry(parse(file), 'town maps', false)).toBeNull()
  })
})

describe('collectTowns', () => {
  test('keeps one town per name, preferring the Altaeus folder, sorted by id', () => {
    const towns = collectTowns([
      {
        folder: 'town maps/__altaeus',
        altaeus: true,
        files: ['Phandalin - hilly forest village - CN.jpg', 'Corso - poor seaside capital - CN.jpg'],
      },
      {
        folder: 'town maps',
        altaeus: false,
        files: [
          'Phandalin - hilly forest village - CN.jpg',
          'Riverwatch - temperate river city - CN.jpg',
          'Riverwatch - temperate river city - LG.jpeg',
        ],
      },
    ])
    expect(towns.map((t) => [t.id, t.banner])).toEqual([
      ['corso', 'town maps/__altaeus/Corso - poor seaside capital - CN.jpg'],
      ['phandalin', 'town maps/__altaeus/Phandalin - hilly forest village - CN.jpg'],
      ['riverwatch', 'town maps/Riverwatch - temperate river city - CN.jpg'],
    ])
  })
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run scripts/port/town-maps.test.ts`. Expected: FAIL, `./town-maps` does not exist.

**Step 3: Implement the parser**

Create `scripts/port/town-maps.ts`:

```ts
// Pure helpers for scripts/port/port-town-maps.ts: town-map filenames → towns entries.
import type { Alignment, Biome, SizeTier } from '../../src/schema/constants'
import type { Town } from '../../src/schema/world'

export type TownMapFile = { name: string; description: string; alignment?: Alignment; file: string }

const IMAGE = /\.(jpe?g|png|webp)$/i
const OTHER_EXTENSION = /\.[a-z0-9]{2,4}$/i
const ALIGNMENT = /\b(LG|NG|CG|LN|TN|N|CN|LE|NE|CE)\b/g

/** "Corso - poor seaside capital - CN.jpg" → its parts. Null when the file isn't in the pattern. */
export function parseTownMapFilename(file: string): TownMapFile | null {
  const base = file.replace(IMAGE, '')
  if (OTHER_EXTENSION.test(base)) return null
  const parts = base.split(' - ').map((p) => p.trim())
  if (parts.length < 2 || !parts[0] || !parts[1]) return null
  const last = parts.length >= 3 ? parts[parts.length - 1] : ''
  const codes = [...last.matchAll(ALIGNMENT)].map((m) => (m[1] === 'N' ? 'TN' : m[1]) as Alignment)
  const description = (parts.length >= 3 ? parts.slice(1, -1) : parts.slice(1)).join(' - ')
  return { name: parts[0], description, alignment: codes.at(-1), file }
}

/** The first match wins, so larger sizes come first ("forest village stronghold" is a village). */
const SIZES: [RegExp, SizeTier][] = [
  [/\b(capital|capitol)\b/, 'metropolis'],
  [/\bcity\b/, 'city'],
  [/\btown\b/, 'town'],
  [/\bvillage\b/, 'village'],
  [/\b(hamlet|thorp|castle|stronghold)\b/, 'hamlet'],
  [/\bencampment\b/, 'outpost'],
]
const BIOME_WORDS: [RegExp, Biome][] = [
  [/\b(forest|foresty|wood|woods|treetop)\b/, 'forest'],
  [/\b(desert|arid)\b/, 'desert'],
  [/\b(swamp|marsh)\b/, 'marsh'],
  [/\bmountain\b/, 'mountains'],
  [/\b(cliff|cliffside|cliffy|hilly|hillsy|hills)\b/, 'hills'],
  [/\b(temperate|plains|river|riverside|valley)\b/, 'plains'],
  [/\b(tropical|jungle)\b/, 'jungle'],
]
const COASTAL = /\b(seaside|coastal|port|harbor|harbour|island|beach)\b/
const WEALTH: [RegExp, number][] = [
  [/\b(rich|prosperous)\b/, 2],
  [/\bpoor\b/, -2],
  [/\b(struggling|declining)\b/, -1],
]
/** half-elf comes before elf: "half-elf" contains the word "elf". */
const ANCESTRIES: [RegExp, string][] = [
  [/\bhalf-elf\b/, 'half-elf'],
  [/\b(elf|elven|drow)\b/, 'elf'],
  [/\bdwarf\b/, 'dwarf'],
  [/\b(hobgoblin|goblin)\b/, 'goblin'],
  [/\borc\b/, 'orc'],
]
/** Not a living settlement: under the sea or the ground, abandoned, ruined or wild. */
const SKIP = /\b(underwater|underdark|abandoned|ruins|wilderness|dungeon)\b/

export const kebab = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** A towns entry, or null for files that don't describe a living settlement. */
export function townEntry(parsed: TownMapFile, folder: string, altaeus: boolean): Town | null {
  const description = parsed.description.toLowerCase()
  const all = `${parsed.name} ${parsed.description}`.toLowerCase()
  if (SKIP.test(all)) return null
  const size = SIZES.find(([re]) => re.test(description))?.[1]
  if (!size) return null
  const wealth = WEALTH.filter(([re]) => re.test(description)).reduce((sum, [, w]) => sum + w, 0)
  const town: Town = {
    id: kebab(parsed.name),
    name: parsed.name,
    description: parsed.description,
    alignment: parsed.alignment,
    size,
    capital: /\b(capital|capitol)\b/.test(description),
    biomes: BIOME_WORDS.filter(([re]) => re.test(description)).map(([, biome]) => biome),
    coastal: COASTAL.test(all),
    wealth: Math.max(-3, Math.min(3, wealth)),
    ancestry: ANCESTRIES.find(([re]) => re.test(description))?.[1],
    banner: `${folder}/${parsed.file}`,
    altaeus,
  }
  // Leave out the optional fields that are unset, so the JSON stays tidy.
  return Object.fromEntries(Object.entries(town).filter(([, v]) => v !== undefined)) as Town
}

/** One town per id: the first folder wins, then the first file in sorted order. Sorted by id. */
export function collectTowns(
  folders: { folder: string; altaeus: boolean; files: string[] }[]
): Town[] {
  const towns = new Map<string, Town>()
  for (const { folder, altaeus, files } of folders) {
    for (const file of [...files].sort()) {
      const parsed = parseTownMapFilename(file)
      const town = parsed && townEntry(parsed, folder, altaeus)
      if (town && !towns.has(town.id)) towns.set(town.id, town)
    }
  }
  return [...towns.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
```

Run: `pnpm vitest run scripts/port/town-maps.test.ts`. Expected: PASS.

**Step 4: Add the port script**

The Altaeus map with town names (`town maps/__altaeus/_altaeus with town names.xcf`) labels one town so far: its only text layer, AMITON, sits at map pixels (705, 989), 123×90, right by the Deddar Marsh marker at about (777, 1087). Pinned towns always go to their marker. Look up that marker's id in `data/claude/settlements.json` and use it below.

Create `scripts/port/port-town-maps.ts`:

```ts
// Builds data/original/towns.json from the town-map filenames in the dnd5e folder (DND5E_DIR,
// default ~/dnd5e). Only filenames are read, never images. Run: pnpm tsx scripts/port/port-town-maps.ts
// It prints the banner paths missing from assets.manifest.txt; add them, then run pnpm sync-assets.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { collectTowns } from './town-maps'

/** Towns the user has labelled on the Altaeus map keep their marker. */
const PINNED: Record<string, string> = {
  amiton: 'deddar-marsh-1', // AMITON text layer at (705, 989) in _altaeus with town names.xcf
}

const root = join(process.env.DND5E_DIR ?? join(homedir(), 'dnd5e'), 'town maps')
const files = (dir: string) =>
  readdirSync(join(root, dir), { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)

const towns = collectTowns([
  { folder: 'town maps/__altaeus', altaeus: true, files: files('__altaeus') },
  { folder: 'town maps', altaeus: false, files: files('.') },
]).map((town) => (Object.hasOwn(PINNED, town.id) ? { ...town, site: PINNED[town.id] } : town))

const file = {
  $schema: '../_schema/towns.schema.json',
  kind: 'towns',
  source: 'original',
  notes:
    "Generated by scripts/port/port-town-maps.ts from the user's town-map filenames (Name - description - alignment) in ~/dnd5e/town maps/ and its __altaeus/ folder. Hints come from the description words; edit the script's word lists rather than this file.",
  entries: towns,
}
writeFileSync('data/original/towns.json', JSON.stringify(file, null, 2) + '\n')

const manifest = new Set(readFileSync('assets.manifest.txt', 'utf8').split('\n').map((l) => l.trim()))
const missing = towns
  .map((t) => t.banner)
  .filter((b): b is string => !!b && !b.startsWith('town maps/__altaeus/') && !manifest.has(b))
console.log(`wrote ${towns.length} towns`)
if (missing.length > 0) console.log(`banners missing from assets.manifest.txt:\n${missing.join('\n')}`)
```

(`town maps/__altaeus` is already in the manifest as a folder.)

**Step 5: Run it, then update the manifest and credits**

Run: `pnpm tsx scripts/port/port-town-maps.ts`. Expected: about 75 towns, and a list of banner paths.

Append the printed paths to `assets.manifest.txt` under a comment, one per line:

```
# Town banners (one file each; data/original/towns.json names them)
town maps/Absalom - temperate struggling capital - CN.jpeg
```

Run: `pnpm sync-assets`. Expected: no missing entries.

Add a row to the local `CREDITS.md` (gitignored):

```markdown
| Town maps (single files) | `assets/town maps/*` (banners) | Various artists (unrecorded; check filenames and watermarks) | Personal use | No | Town banners. Their filenames also supply the town names and hints in `data/original/towns.json` (committed: names and one-line descriptions only) |
```

**Step 6: Check the data and commit**

Append to `src/content/world.test.ts`:

```ts
describe('town names', () => {
  test('come from the town-map filenames, with Amiton pinned to its marker', () => {
    expect(Object.keys(content.towns).length).toBeGreaterThan(50)
    expect(content.towns.amiton).toMatchObject({ coastal: true, biomes: ['marsh'], altaeus: true })
    expect(content.settlements[content.towns.amiton.site!].region).toBe('deddar-marsh')
  })
})
```

Run: `pnpm test`. Expected: PASS (the validator also checks the pin).

```bash
pnpm format
git add scripts/port/town-maps.ts scripts/port/town-maps.test.ts scripts/port/port-town-maps.ts data/original/towns.json assets.manifest.txt src/content/world.test.ts
git commit -m "add town names and hints from the town-map filenames"
```

---

### Task 6: Place-name generator

Settlements without a town map, and kingdoms, get names from the prototype's generators (English compounds, French and Spanish style). The parts become data; a pure generator combines them.

**Files:**
- Create: `scripts/port/port-place-names.ts`, `data/original/place-names.json`, `src/engine/world/names.ts`
- Modify: `src/content/world.test.ts`
- Test: `src/engine/world/names.test.ts`

**Step 1: Port the parts**

Create `scripts/port/port-place-names.ts`:

```ts
// One-off port of the prototype's place-name parts into data/original/place-names.json.
// Kept for provenance. Run: pnpm tsx scripts/port/port-place-names.ts
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const source = execFileSync('git', ['show', 'v0.1.0-svelte-final:src/lib/generators/towns.ts'], {
  encoding: 'utf8',
})
const lists = new Map(
  [...source.matchAll(/var (nm\d+) = (\[[^\]]*\]);/g)].map((m) => [
    m[1],
    JSON.parse(m[2]) as string[],
  ])
)
const get = (key: string): string[] => {
  const list = lists.get(key)
  if (!list || list.length === 0) throw new Error(`${key} not found in the tagged source`)
  return list
}
const unique = (items: string[]) => [...new Set(items)]

// The prototype paired French prefixes 6–27 only with suffixes from index 21 on (nameGen(1)).
// Two tables keep that rule as data. Their weights split the French share by prefix count.
const nm25 = get('nm25')
const nm26 = get('nm26')
const entries = [
  { id: 'english-compound', style: 'english', weight: 2, first: unique(get('nm1')), second: unique(get('nm2')) },
  { id: 'french-soft', style: 'french', weight: 0.3, first: unique(nm25.slice(6, 28)), second: unique(nm26.slice(21)) },
  { id: 'french', style: 'french', weight: 0.7, first: unique([...nm25.slice(0, 6), ...nm25.slice(28)]), second: unique(nm26) },
  { id: 'spanish', style: 'spanish', weight: 1, first: unique(get('nm7')), second: unique(get('nm8')) },
]

const file = {
  $schema: '../_schema/placeNames.schema.json',
  kind: 'placeNames',
  source: 'original',
  notes:
    'Ported from src/lib/generators/towns.ts at tag v0.1.0-svelte-final by scripts/port/port-place-names.ts. A name is a first part plus a second part. The prototype paired French prefixes 6–27 only with suffixes 21 onwards; french-soft keeps that pairing. Weights are new.',
  entries,
}
writeFileSync('data/original/place-names.json', JSON.stringify(file, null, 2) + '\n')
console.log(entries.map((e) => `${e.id}: ${e.first.length} × ${e.second.length}`).join('\n'))
```

Run: `pnpm tsx scripts/port/port-place-names.ts`. Expected: four tables, e.g. `english-compound: 178 × 120`.

**Step 2: Write the failing tests**

Create `src/engine/world/names.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { generatePlaceName, realmName } from './names'

const content = fixtureContent()
const nameFor = (seed: number, used: ReadonlySet<string> = new Set(), c: Content = content) =>
  withRng(createRng(seed), (d) => generatePlaceName(d, c, used))[0]

/** Every name the fixture table can make: 3 × 3, less "Stonestone". */
const ALL = ['Raven', 'Stone', 'Ash'].flatMap((a) =>
  ['ford', 'hold', 'stone'].map((b) => a + b).filter((n) => n !== 'Stonestone')
)

describe('generatePlaceName', () => {
  test('makes capitalised compounds, the same for the same seed', () => {
    expect(nameFor(3)).toBe(nameFor(3))
    for (let seed = 0; seed < 50; seed++) expect(ALL).toContain(nameFor(seed))
  })

  test('avoids names already in use while any are left', () => {
    const left = ALL[4]
    const used = new Set(ALL.filter((n) => n !== left))
    for (let seed = 0; seed < 10; seed++) expect(nameFor(seed, used)).toBe(left)
  })

  test('fails loudly without place-name tables', () => {
    expect(() => nameFor(1, new Set(), { ...content, placeNames: {} })).toThrow(/placeNames/)
  })
})

describe('realmName', () => {
  test('fills {place} and {Place} from the realm-name table', () => {
    const names = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        withRng(createRng(seed), (d) => realmName(d, content, 'Ashford'))[0]
      )
    )
    expect([...names].sort()).toEqual(['Ashford Marches', 'Kingdom of Ashford'])
  })
})
```

**Step 3: Run them to verify they fail**

Run: `pnpm vitest run src/engine/world/names.test.ts`. Expected: FAIL, `./names` does not exist.

**Step 4: Implement**

Create `src/engine/world/names.ts`:

```ts
import { sortedEntries, type Content } from '../../content/build'
import { fillText } from '../encounters/slots'
import type { Draw } from '../rng'

/** Random tries before generatePlaceName walks every combination for an unused one. */
export const NAME_TRIES = 20
/** The parts table with realm-name forms such as "Kingdom of {place}". */
export const REALM_TABLE = 'realm-name'

const capitalise = (text: string) => text[0].toUpperCase() + text.slice(1)
const combine = (first: string, second: string) => capitalise(first + second)

/**
 * A place name: a first part plus a second part from a weighted placeNames table, never the
 * same word twice ("Stonestone"). Avoids `used` names while it can.
 */
export function generatePlaceName(
  d: Draw,
  content: Content,
  used: ReadonlySet<string> = new Set()
): string {
  const tables = sortedEntries(content.placeNames)
  if (tables.length === 0) throw new Error('content has no placeNames tables')
  let name = ''
  for (let i = 0; i < NAME_TRIES; i++) {
    const table = d.weighted(tables, (t) => t.weight)
    const first = d.pick(table.first)
    const seconds = table.second.filter((s) => s.toLowerCase() !== first.toLowerCase())
    name = combine(first, d.pick(seconds.length > 0 ? seconds : table.second))
    if (!used.has(name)) return name
  }
  for (const table of tables) {
    for (const first of table.first) {
      for (const second of table.second) {
        const candidate = combine(first, second)
        if (first.toLowerCase() !== second.toLowerCase() && !used.has(candidate)) return candidate
      }
    }
  }
  return name
}

/** A realm's name from the realm-name table, e.g. "Principality of Ravenford". */
export function realmName(d: Draw, content: Content, place: string): string {
  if (!Object.hasOwn(content.partsTables, REALM_TABLE)) return `Kingdom of ${place}`
  const row = d.weighted(content.partsTables[REALM_TABLE].rows, (r) => r.weight)
  return fillText(row.text, { place })
}
```

**Step 5: Run the tests**

Run: `pnpm vitest run src/engine/world/names.test.ts`. Expected: PASS.

Append to `src/content/world.test.ts`:

```ts
describe('place names', () => {
  test('the four ported tables are present', () => {
    expect(Object.keys(content.placeNames).sort()).toEqual([
      'english-compound',
      'french',
      'french-soft',
      'spanish',
    ])
  })
})
```

Run: `pnpm test`. Expected: PASS.

**Step 6: Commit**

```bash
pnpm format
git add scripts/port/port-place-names.ts data/original/place-names.json src/engine/world/names.ts src/engine/world/names.test.ts src/content/world.test.ts
git commit -m "port the prototype's place-name generators as data"
```

---

### Task 7: Threats and realm names

Each region gets a local threat or usurper. The factions and the realm-name forms are Claude-written data.

**Files:**
- Create: `data/claude/threats.json`, `data/claude/world-parts.json`
- Modify: `src/content/world.test.ts`

**Step 1: Write the failing test**

Append to `src/content/world.test.ts` (add `import { BIOMES } from '../schema/constants'` and `import { slotNames } from '../engine/encounters/slots'` at the top):

```ts
describe('threats and realm names', () => {
  test('at least eight threats, and every biome but the sea has a favoured one', () => {
    const threats = Object.values(content.threats)
    expect(threats.length).toBeGreaterThanOrEqual(8)
    for (const biome of BIOMES.filter((b) => b !== 'sea')) {
      expect(threats.some((t) => t.biomes.includes(biome))).toBe(true)
    }
    for (const t of threats) expect(t.strength.min).toBeLessThanOrEqual(t.strength.max)
  })

  test('realm names only use the {place} slot', () => {
    const rows = content.partsTables['realm-name'].rows
    expect(rows.length).toBeGreaterThanOrEqual(5)
    for (const row of rows) expect(slotNames(row.text)).toEqual(['place'])
  })
})
```

Run: `pnpm vitest run src/content/world.test.ts`. Expected: FAIL (no threats, no realm-name table).

**Step 2: Write the data**

Create `data/claude/threats.json`:

```json
{
  "$schema": "../_schema/threats.schema.json",
  "kind": "threats",
  "source": "claude",
  "notes": "Regional threats and usurpers for the political layer (design §6). Strength 1–6 is set against the owning kingdom's garrison to give a threat level of 0–3.",
  "entries": [
    { "id": "orc-warband", "name": "Orc warband", "description": "Clans united under one war-chief, raiding the valleys below their holds.", "creatureTypes": ["humanoid"], "biomes": ["hills", "mountains"], "strength": { "min": 2, "max": 5 } },
    { "id": "goblin-raiders", "name": "Goblin raiders", "description": "Many small bands that strike at night and vanish into the trees.", "creatureTypes": ["humanoid"], "biomes": ["forest", "hills"], "strength": { "min": 1, "max": 4 } },
    { "id": "restless-dead", "name": "Restless dead", "description": "Old graves and battlefields that no longer stay quiet.", "creatureTypes": ["undead"], "biomes": ["marsh", "desert"], "strength": { "min": 2, "max": 5 } },
    { "id": "dark-cult", "name": "Dark cult", "description": "A secret faith in the towns, with friends in the council and something in the cellar.", "creatureTypes": ["humanoid", "fiend"], "biomes": [], "strength": { "min": 1, "max": 4 } },
    { "id": "bandit-lord", "name": "Bandit lord", "description": "An outlaw who taxes the roads and calls it protection.", "creatureTypes": ["humanoid"], "biomes": ["plains", "forest"], "strength": { "min": 1, "max": 4 } },
    { "id": "pretender", "name": "Pretender to the throne", "description": "A rival claimant with a banner, a grievance and a growing host.", "creatureTypes": ["humanoid"], "biomes": [], "strength": { "min": 2, "max": 5 } },
    { "id": "hag-coven", "name": "Hag coven", "description": "Three old women whose bargains always cost more than they say.", "creatureTypes": ["fey"], "biomes": ["marsh", "forest"], "strength": { "min": 2, "max": 4 } },
    { "id": "drake-brood", "name": "Drake brood", "description": "Young drakes that have claimed the high places and the herds below them.", "creatureTypes": ["dragon"], "biomes": ["mountains", "desert"], "strength": { "min": 3, "max": 6 } },
    { "id": "giant-clan", "name": "Giant clan", "description": "A family of giants who treat the lowlands as a larder.", "creatureTypes": ["giant"], "biomes": ["mountains", "hills"], "strength": { "min": 3, "max": 6 } },
    { "id": "serpent-cult", "name": "Serpent cult", "description": "Masked worshippers who trade in venom, secrets and people.", "creatureTypes": ["humanoid", "monstrosity"], "biomes": ["jungle", "marsh"], "strength": { "min": 2, "max": 5 } }
  ]
}
```

Create `data/claude/world-parts.json`:

```json
{
  "$schema": "../_schema/partsTables.schema.json",
  "kind": "partsTables",
  "source": "claude",
  "notes": "Realm-name forms for the political layer. {place} is a generated place name.",
  "entries": [
    {
      "id": "realm-name",
      "description": "The name of a kingdom or realm, from a place name",
      "rows": [
        { "text": "Kingdom of {place}", "weight": 4 },
        { "text": "Principality of {place}", "weight": 2 },
        { "text": "Duchy of {place}", "weight": 2 },
        { "text": "{Place} Marches" },
        { "text": "{Place} Dominion" },
        { "text": "Free Cities of {place}", "weight": 0.5 },
        { "text": "Theocracy of {place}", "weight": 0.5 }
      ]
    }
  ]
}
```

**Step 3: Run the tests and commit**

Run: `pnpm test`. Expected: PASS. (The encounter validator only checks parts tables that situations use, so `realm-name` doesn't trip it.)

```bash
pnpm format
git add data/claude/threats.json data/claude/world-parts.json src/content/world.test.ts
git commit -m "add regional threats and realm-name forms"
```

---

### Task 8: The political layer: kingdoms and threats

A pure, seeded generator divides the regions among 4–6 kingdoms that grow outward from their seeds, then rolls each region's threat against the kingdom's garrison.

**Files:**
- Create: `src/engine/world/politics.ts`
- Modify: `src/schema/world.ts`
- Test: `src/engine/world/politics.test.ts`

**Step 1: Write the failing tests**

Create `src/engine/world/politics.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { KingdomSchema, RegionStateSchema } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { generatePolitics, threatLevelFor } from './politics'

const content = fixtureContent()
const politics = (seed: number, kingdoms?: number) =>
  withRng(createRng(seed), (d) => generatePolitics(d, content, new Set(), kingdoms))[0]

describe('generatePolitics', () => {
  test('is deterministic and schema-valid', () => {
    const a = politics(7)
    expect(politics(7)).toEqual(a)
    for (const k of a.kingdoms) expect(KingdomSchema.parse(k)).toEqual(k)
    for (const r of Object.values(a.regions)) expect(RegionStateSchema.parse(r)).toEqual(r)
  })

  test('every region belongs to exactly one kingdom, and every kingdom has a region', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { kingdoms, regions } = politics(seed)
      const owned = kingdoms.flatMap((k) => k.regions).sort()
      expect(owned).toEqual(['ashmoor', 'farisle', 'greenvale'])
      for (const k of kingdoms) {
        expect(k.regions.length).toBeGreaterThan(0)
        for (const id of k.regions) expect(regions[id].kingdom).toBe(k.id)
      }
    }
  })

  test('kingdoms grow across land and sea to fill the map', () => {
    const one = politics(3, 1)
    expect(one.kingdoms).toHaveLength(1)
    expect(one.kingdoms[0].regions.sort()).toEqual(['ashmoor', 'farisle', 'greenvale'])
    expect(politics(3, 2).kingdoms).toHaveLength(2)
  })

  test('a kingdom’s capital is a capital marker in its land when it has one', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const k of politics(seed).kingdoms) {
        const site = content.settlements[k.capital]
        expect(k.regions).toContain(site.region)
        const markers = Object.values(content.settlements).filter(
          (s) => s.capital && k.regions.includes(s.region)
        )
        if (markers.length > 0) expect(site.capital).toBe(true)
      }
    }
  })

  test('rulers are playable ancestries, and kingdom names are distinct', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { kingdoms } = politics(seed)
      for (const k of kingdoms) expect(['human', 'dwarf']).toContain(k.ancestry)
      expect(new Set(kingdoms.map((k) => k.name)).size).toBe(kingdoms.length)
    }
  })

  test('threats favour their biomes: the marsh mostly gets the bog cult', () => {
    let cults = 0
    for (let seed = 0; seed < 200; seed++) if (politics(seed).regions.ashmoor.threat === 'bog-cult') cults++
    expect(cults).toBeGreaterThan(100)
  })
})

test('the threat level is the threat’s strength above the garrison, from 0 to 3', () => {
  expect(threatLevelFor(5, 1)).toBe(3)
  expect(threatLevelFor(2, 3)).toBe(0)
  expect(threatLevelFor(3, 1.5)).toBe(2)
  expect(threatLevelFor(6, 1)).toBe(3)
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/world/politics.test.ts`. Expected: FAIL, the schemas and `./politics` do not exist.

**Step 3: Add the world state schemas**

Append to `src/schema/world.ts`:

```ts

// ---------------------------------------------------------------------------------------------
// The political layer: rolled for each world and kept in GameState.world.
// ---------------------------------------------------------------------------------------------

export const KingdomSchema = z.object({
  id: IdSchema,
  name: z.string(),
  ancestry: IdSchema.describe('The ruling ancestry'),
  capital: IdSchema.describe('The settlement that is its seat'),
  regions: z.array(IdSchema).min(1),
  defence: z.number().int().min(0).describe('Split evenly across its regions as garrisons'),
})
export type Kingdom = z.infer<typeof KingdomSchema>

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
  kingdoms: z.array(KingdomSchema),
  regions: z.record(IdSchema, RegionStateSchema),
  settlements: z.record(IdSchema, SettlementStateSchema),
})
export type WorldState = z.infer<typeof WorldStateSchema>
```

**Step 4: Implement**

Create `src/engine/world/politics.ts`:

```ts
import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { Kingdom, RegionState } from '../../schema/world'
import type { Draw } from '../rng'
import { generatePlaceName, realmName } from './names'

export const KINGDOMS = { min: 4, max: 6 }
/** A kingdom's total defence, split evenly across its regions. */
export const DEFENCE = { min: 4, max: 10 }
/** Seeds prefer regions with a capital marker, by this factor. */
export const CAPITAL_SEED_WEIGHT = 3
/** Ruling ancestries are picked by weight; any playable ancestry not listed weighs 1. */
export const RULER_WEIGHTS: Readonly<Record<string, number>> = { human: 3 }
/** A threat's weight in a region of a biome it favours, and in one it doesn't. */
export const FAVOURED = 3
export const UNFAVOURED = 0.5

export type Politics = { kingdoms: Kingdom[]; regions: Record<string, RegionState> }

/** How far a threat outweighs the garrison, from 0 (held) to 3 (rampant). */
export const threatLevelFor = (strength: number, garrison: number): number =>
  Math.min(3, Math.max(0, Math.round(strength - garrison)))

/** Regions joined by at least one route (by land or by sea), each list sorted. */
function neighbours(content: Content): Map<string, string[]> {
  const links = new Map<string, Set<string>>()
  const regionOf = (id: string) =>
    Object.hasOwn(content.settlements, id) ? content.settlements[id].region : undefined
  for (const route of sortedEntries(content.routes)) {
    const a = regionOf(route.from)
    const b = regionOf(route.to)
    if (!a || !b || a === b) continue
    if (!links.has(a)) links.set(a, new Set())
    if (!links.has(b)) links.set(b, new Set())
    links.get(a)!.add(b)
    links.get(b)!.add(a)
  }
  return new Map([...links].map(([id, set]) => [id, [...set].sort(byCodeUnit)]))
}

/**
 * Divides the regions among kingdoms: seeds first (preferring capital markers), then the
 * smallest kingdom that can grow claims a neighbouring region, until every region is owned.
 * A region no kingdom can reach founds its own. `kingdomCount` overrides the roll (for tests).
 */
export function generatePolitics(
  d: Draw,
  content: Content,
  usedNames: Set<string>,
  kingdomCount?: number
): Politics {
  const regionIds = sortedEntries(content.regions).map((r) => r.id)
  if (regionIds.length === 0) return { kingdoms: [], regions: {} }
  const sites = sortedEntries(content.settlements)
  const capitalRegions = new Set(sites.filter((s) => s.capital).map((s) => s.region))
  const count = Math.min(regionIds.length, kingdomCount ?? d.int(KINGDOMS.min, KINGDOMS.max))

  // count ≤ the number of regions, so there is always a free region to seed.
  const owner = new Map<string, number>()
  for (let k = 0; k < count; k++) {
    const free = regionIds.filter((id) => !owner.has(id))
    owner.set(
      d.weighted(free, (id) => (capitalRegions.has(id) ? CAPITAL_SEED_WEIGHT : 1)),
      k
    )
  }
  const links = neighbours(content)
  let kingdoms = count
  while (owner.size < regionIds.length) {
    const frontier = (k: number) =>
      [...owner]
        .filter(([, owned]) => owned === k)
        .flatMap(([id]) => links.get(id) ?? [])
        .filter((id, i, all) => !owner.has(id) && all.indexOf(id) === i)
        .sort(byCodeUnit)
    const sizes = Array.from({ length: kingdoms }, (_, k) => [...owner.values()].filter((o) => o === k).length)
    const growable = sizes.map((_, k) => k).filter((k) => frontier(k).length > 0)
    if (growable.length === 0) {
      owner.set(regionIds.find((id) => !owner.has(id))!, kingdoms++)
      continue
    }
    const smallest = Math.min(...growable.map((k) => sizes[k]))
    const k = d.pick(growable.filter((g) => sizes[g] === smallest))
    owner.set(d.pick(frontier(k)), k)
  }

  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const result: Kingdom[] = []
  for (let k = 0; k < kingdoms; k++) {
    const regions = regionIds.filter((id) => owner.get(id) === k)
    const land = sites.filter((s) => regions.includes(s.region))
    const markers = land.filter((s) => s.capital)
    const place = generatePlaceName(d, content, usedNames)
    usedNames.add(place)
    result.push({
      id: `kingdom-${k + 1}`,
      name: realmName(d, content, place),
      ancestry:
        playable.length > 0
          ? d.weighted(playable, (a) => RULER_WEIGHTS[a.id] ?? 1).id
          : 'human',
      capital: d.pick(markers.length > 0 ? markers : land).id,
      regions,
      defence: d.int(DEFENCE.min, DEFENCE.max),
    })
  }

  const threats = sortedEntries(content.threats)
  if (threats.length === 0) throw new Error('content has no threats')
  const regions: Record<string, RegionState> = {}
  for (const region of sortedEntries(content.regions)) {
    const kingdom = result[owner.get(region.id)!]
    const threat = d.weighted(threats, (t) =>
      t.biomes.length === 0 ? 1 : t.biomes.includes(region.biome) ? FAVOURED : UNFAVOURED
    )
    const strength = d.int(threat.strength.min, threat.strength.max)
    regions[region.id] = {
      kingdom: kingdom.id,
      threat: threat.id,
      threatStrength: strength,
      threatLevel: threatLevelFor(strength, kingdom.defence / kingdom.regions.length),
    }
  }
  return { kingdoms: result, regions }
}
```

Every region has a settlement (the validator checks), so `land` is never empty.

**Step 5: Run the tests**

Run: `pnpm vitest run src/engine/world`. Expected: PASS.

**Step 6: Commit**

```bash
pnpm format
git add src/schema/world.ts src/engine/world/politics.ts src/engine/world/politics.test.ts
git commit -m "generate kingdoms and regional threats"
```

---

### Task 9: Settlements, and the whole world

Each marker gets a settlement type, population, size tier, wealth, services and a name. Named towns go where their hints fit. `generateWorld` ties it all together, and `startingSettlement` picks where a party begins.

**Files:**
- Create: `src/engine/world/settlements.ts`, `src/engine/world/generate.ts`
- Modify: `src/content/world.test.ts`
- Test: `src/engine/world/settlements.test.ts`

**Step 1: Write the failing tests**

Create `src/engine/world/settlements.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { WorldStateSchema } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { generateWorld, startingSettlement, worldSeed } from './generate'
import { rollServices, sizeTierOf } from './settlements'

const content = fixtureContent()
const edit = (change: (c: Content) => void): Content => {
  const copy = structuredClone(content)
  change(copy)
  return copy
}

test('size tiers follow the prototype’s population thresholds', () => {
  expect([76, 77, 400, 401, 1000, 1001, 4001, 10000, 10001].map(sizeTierOf)).toEqual([
    0, 1, 1, 2, 2, 3, 4, 4, 5,
  ])
})

describe('rollServices', () => {
  const roll = (seed: number, tier: number, wealth: number, coastal: boolean, max = 12) =>
    withRng(createRng(seed), (d) => rollServices(d, content, tier, wealth, coastal, max))[0]

  test('big, rich places have more; ports need the sea; the type caps the count', () => {
    let inns = 0
    for (let seed = 0; seed < 100; seed++) {
      const services = roll(seed, 5, 3, false)
      if (services.includes('inn-tavern')) inns++
      expect(services).not.toContain('port')
      expect(roll(seed, 5, 6, true, 1).length).toBeLessThanOrEqual(1)
    }
    expect(inns).toBeGreaterThan(80)
    const tinyMagic = Array.from({ length: 100 }, (_, s) => roll(s, 0, 0, true)).filter((x) =>
      x.includes('magic-items')
    )
    expect(tinyMagic).toEqual([])
  })
})

describe('generateWorld', () => {
  test('is deterministic, schema-valid, and differs between seeds', () => {
    const a = generateWorld(worldSeed(1), content)
    expect(generateWorld(worldSeed(1), content)).toEqual(a)
    expect(WorldStateSchema.parse(a)).toEqual(a)
    expect(generateWorld(worldSeed(2), content)).not.toEqual(a)
  })

  test('every marker becomes a settlement with a consistent type, size and services', () => {
    for (let seed = 0; seed < 30; seed++) {
      const world = generateWorld(seed, content)
      const seats = new Set(world.kingdoms.map((k) => k.capital))
      expect(Object.keys(world.settlements).sort()).toEqual(Object.keys(content.settlements).sort())
      for (const [id, s] of Object.entries(world.settlements)) {
        const site = content.settlements[id]
        const type = content.settlementTypes[s.type]
        if (seats.has(id)) expect(s.type).toBe('capital')
        else if (site.capital) expect(s.type).toBe('city')
        else expect(['hamlet', 'village', 'town', 'city', 'fort']).toContain(s.type)
        expect(s.population).toBeGreaterThanOrEqual(type.minPopulation)
        expect(s.population).toBeLessThanOrEqual(type.maxPopulation)
        expect(s.sizeTier).toBe(sizeTierOf(s.population))
        expect(s.services.length).toBeLessThanOrEqual(type.maxServices)
        if (!site.coastal) expect(s.services).not.toContain('port')
      }
      const names = Object.values(world.settlements).map((s) => s.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  test('named towns only go where they fit: a seaside town never lands inland', () => {
    for (let seed = 0; seed < 50; seed++) {
      const world = generateWorld(seed, content)
      expect(world.settlements['greenvale-2'].town).not.toBe('harbourne')
      const named = Object.values(world.settlements).find((s) => s.town === 'harbourne')
      if (named) expect(named.name).toBe('Harbourne')
    }
  })

  test('a pinned town always takes its marker', () => {
    const pinned = edit((c) => {
      c.towns.mirefold.site = 'greenvale-2'
    })
    for (let seed = 0; seed < 10; seed++) {
      expect(generateWorld(seed, pinned).settlements['greenvale-2']).toMatchObject({
        name: 'Mirefold',
        town: 'mirefold',
      })
    }
  })

  test('an empty geography makes an empty world', () => {
    const empty = edit((c) => {
      c.regions = {}
      c.settlements = {}
      c.routes = {}
    })
    expect(generateWorld(5, empty)).toEqual({ seed: 5, kingdoms: [], regions: {}, settlements: {} })
  })
})

describe('startingSettlement', () => {
  test('is a small mainland settlement in the calmest region, the same for a world', () => {
    for (let seed = 0; seed < 30; seed++) {
      const world = generateWorld(seed, content)
      const start = startingSettlement(world, content)!
      expect(startingSettlement(world, content)).toBe(start)
      expect(content.settlements[start].island).toBe('mainland')
      // A plain marker can roll "city"; when every small place is taken, any mainland one will do.
      const small = Object.keys(world.settlements).filter(
        (id) =>
          content.settlements[id].island === 'mainland' &&
          !['capital', 'city'].includes(world.settlements[id].type)
      )
      if (small.length > 0) expect(small).toContain(start)
    }
  })
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/world/settlements.test.ts`. Expected: FAIL, the modules do not exist.

**Step 3: Implement the settlements**

Create `src/engine/world/settlements.ts`:

```ts
import { sortedEntries, type Content } from '../../content/build'
import { SIZE_TIERS } from '../../schema/constants'
import type {
  Kingdom,
  RegionState,
  Settlement,
  SettlementState,
  Town,
} from '../../schema/world'
import type { Draw } from '../rng'
import { generatePlaceName } from './names'

/** Settlement types a plain map marker can be; kingdom seats are "capital", other framed markers "city". */
export const MARKER_TYPES = ['hamlet', 'village', 'town', 'city', 'fort'] as const
/** The prototype's population thresholds: above each, the next size tier. */
export const POPULATION_TIERS = [76, 400, 1000, 4000, 10000]
/** A service that passes its d20 roll still only appears this often (prototype). */
export const SERVICE_CHANCE = 0.9
/** Services that need the sea. */
export const COASTAL_SERVICES: readonly string[] = ['port']
/** A named town needs at least this score to be placed (see townScore). */
export const MIN_TOWN_MATCH = 2
/** Settlements are this much poorer where the threat is rampant (level 3). */
export const RAMPANT_WEALTH = -1
/** How often a settlement's ancestry is the ruling one, when its town doesn't name one. */
export const RULING_ANCESTRY_SHARE = 0.75

export const sizeTierOf = (population: number): number =>
  POPULATION_TIERS.filter((t) => population > t).length

/**
 * Which services a settlement has: each passes when 1d20 + wealth beats its threshold for the
 * size tier (then a 90% chance), as in the prototype. Coastal-only services need the sea. Beyond
 * the type's maxServices, random ones are dropped.
 */
export function rollServices(
  d: Draw,
  content: Content,
  tier: number,
  wealth: number,
  coastal: boolean,
  max: number
): string[] {
  const present = sortedEntries(content.services).filter(
    (s) =>
      (coastal || !COASTAL_SERVICES.includes(s.id)) &&
      d.int(1, 20) + wealth > s.presenceThresholdBySize[tier] &&
      d.float() < SERVICE_CHANCE
  )
  while (present.length > max) present.splice(d.int(0, present.length - 1), 1)
  return present.map((s) => s.id)
}

/**
 * How well a named town fits a marker: null when it can't go there (a coastal town inland, or a
 * town pinned elsewhere), otherwise matching hints add up. A pinned town scores 100 at its site.
 */
export function townScore(
  town: Town,
  site: Settlement,
  biome: string | undefined,
  typeId: string,
  tier: number
): number | null {
  if (town.site) return town.site === site.id ? 100 : null
  if (town.coastal && !site.coastal) return null
  let score = 0
  if (town.coastal) score += 2
  if (biome && town.biomes.some((b) => b === biome)) score += 2
  if (town.capital) score += typeId === 'capital' ? 3 : -2
  if (town.size) {
    const gap = Math.abs(SIZE_TIERS.indexOf(town.size) - tier)
    score += gap === 0 ? 2 : gap === 1 ? 1 : -1
  }
  if (town.altaeus) score += 1
  return score
}

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

/**
 * Types, sizes, wealth, services, ancestries and names for every marker. Kingdom seats are rolled
 * first, so towns described as capitals can claim them; then the rest in id order.
 */
export function generateSettlements(
  d: Draw,
  content: Content,
  kingdoms: readonly Kingdom[],
  regionStates: Readonly<Record<string, RegionState>>,
  usedNames: Set<string>
): Record<string, SettlementState> {
  const seats = new Set(kingdoms.map((k) => k.capital))
  const sites = sortedEntries(content.settlements)
  const ordered = [...sites.filter((s) => seats.has(s.id)), ...sites.filter((s) => !seats.has(s.id))]
  const markerTypes = MARKER_TYPES.flatMap((id) => own(content.settlementTypes, id) ?? [])
  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const towns = sortedEntries(content.towns)
  const usedTowns = new Set<string>()
  const result: Record<string, SettlementState> = {}

  for (const site of ordered) {
    const regionState = own(regionStates, site.region)
    const kingdom = kingdoms.find((k) => k.id === regionState?.kingdom)
    const typeId = seats.has(site.id)
      ? 'capital'
      : site.capital
        ? 'city'
        : d.weighted(markerTypes, (t) => t.ratio).id
    const type = own(content.settlementTypes, typeId)
    if (!type) throw new Error(`content has no settlement type "${typeId}"`)
    const population = d.int(type.minPopulation, type.maxPopulation)
    const sizeTier = sizeTierOf(population)

    const biome = own(content.regions, site.region)?.biome
    const fits = towns
      .filter((t) => !usedTowns.has(t.id))
      .map((t) => ({ town: t, score: townScore(t, site, biome, typeId, sizeTier) }))
      .filter(
        (f): f is typeof f & { score: number } => f.score !== null && f.score >= MIN_TOWN_MATCH
      )
    const pinned = fits.find((f) => f.town.site === site.id)
    const town = pinned?.town ?? (fits.length > 0 ? d.weighted(fits, (f) => f.score).town : null)
    if (town) usedTowns.add(town.id)
    const name = town?.name ?? generatePlaceName(d, content, usedNames)
    usedNames.add(name)

    const rampant = (regionState?.threatLevel ?? 0) >= 3 ? RAMPANT_WEALTH : 0
    const wealth = Math.max(-4, Math.min(6, d.int(-2, 2) + (town?.wealth ?? 0) + rampant))
    const ancestry =
      town?.ancestry ??
      (kingdom && (playable.length === 0 || d.float() < RULING_ANCESTRY_SHARE)
        ? kingdom.ancestry
        : playable.length > 0
          ? d.pick(playable).id
          : 'human')
    result[site.id] = {
      name,
      town: town?.id ?? null,
      type: type.id,
      population,
      sizeTier,
      wealth,
      ancestry,
      services: rollServices(d, content, sizeTier, wealth, site.coastal, type.maxServices),
    }
  }
  return result
}
```

Note that a town's name may already be in `usedNames` as a kingdom's place name; that is harmless (a kingdom can be named after a town).

**Step 4: Implement the world**

Create `src/engine/world/generate.ts`:

```ts
import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { WorldState } from '../../schema/world'
import { createRng, withRng } from '../rng'
import { generatePolitics } from './politics'
import { generateSettlements } from './settlements'

/** Mixed into the run seed, so the world and the run draw from separate streams. */
export const WORLD_SALT = 0x5eeda17a

export const worldSeed = (seed: number): number => (seed ^ WORLD_SALT) >>> 0

/** The political layer for a world seed: kingdoms, regional threats and settlements. Pure. */
export function generateWorld(seed: number, content: Content): WorldState {
  return withRng(createRng(seed), (d) => {
    const usedNames = new Set<string>()
    const { kingdoms, regions } = generatePolitics(d, content, usedNames)
    const settlements = generateSettlements(d, content, kingdoms, regions, usedNames)
    return { seed, kingdoms, regions, settlements }
  })[0]
}

/** Types a party doesn't start in: it begins small. */
const GRAND = ['capital', 'city']

/**
 * Where a new party begins: a small settlement on the largest land mass, in the region with the
 * lowest threat level. Picked with the world's seed, so a world always starts in the same place.
 */
export function startingSettlement(world: WorldState, content: Content): string | null {
  const sites = sortedEntries(content.settlements).filter((s) =>
    Object.hasOwn(world.settlements, s.id)
  )
  if (sites.length === 0) return null
  const sizes = new Map<string, number>()
  for (const s of sites) sizes.set(s.island, (sizes.get(s.island) ?? 0) + 1)
  const [mainland] = [...sizes].sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))[0]
  const onMainland = sites.filter((s) => s.island === mainland)
  const small = onMainland.filter((s) => !GRAND.includes(world.settlements[s.id].type))
  const pool = small.length > 0 ? small : onMainland
  const level = (region: string) =>
    Object.hasOwn(world.regions, region) ? world.regions[region].threatLevel : 3
  const calmest = Math.min(...pool.map((s) => level(s.region)))
  const calm = pool.filter((s) => level(s.region) === calmest)
  return withRng(createRng(world.seed), (d) => d.pick(calm).id)[0]
}
```

**Step 5: Run the tests**

Run: `pnpm vitest run src/engine/world`. Expected: PASS.

**Step 6: Smoke-test the real data**

Append to `src/content/world.test.ts` (import `generateWorld`, `startingSettlement` and `worldSeed` from `../engine/world/generate`, and `WorldStateSchema` from `../schema/world`):

```ts
describe('generated worlds on Altaeus', () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i is valid and fully named', (seed) => {
    const world = generateWorld(worldSeed(seed), content)
    expect(WorldStateSchema.parse(world)).toEqual(world)
    expect(world.kingdoms.length).toBeGreaterThanOrEqual(4)
    expect(Object.keys(world.regions).sort()).toEqual(Object.keys(content.regions).sort())
    const names = Object.values(world.settlements).map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
    expect(startingSettlement(world, content)).not.toBeNull()
  })

  test('most settlements are named after town maps', () => {
    const world = generateWorld(worldSeed(1), content)
    const named = Object.values(world.settlements).filter((s) => s.town !== null)
    expect(named.length).toBeGreaterThan(Object.keys(world.settlements).length / 2)
  })
})
```

Run: `pnpm test`. Expected: PASS. If "most settlements are named after town maps" fails, look at which hints block placement (print the scores for one world) before lowering `MIN_TOWN_MATCH`.

**Step 7: Commit**

```bash
pnpm format
git add src/engine/world src/content/world.test.ts
git commit -m "generate settlements, names and services; generateWorld and the starting place"
```

---
### Task 10: GameState v3 with a real migration

The state gains the world, the party's location, the journey and the essentials. Characters gain strain stacks. A v2 save is migrated by rolling the world from its seed, so `migrate` and `deserialize` now take the content.

**Files:**
- Create: `src/engine/travel/supplies.ts` (the starting supplies only; Task 13 adds the daily rules)
- Modify: `src/schema/state.ts`, `src/engine/save.ts`, `src/engine/state.ts`, `src/engine/party.ts`, `src/engine/world/geo.ts`, `src/engine/test-fixtures.ts`, `src/ui/useGame.ts`
- Test: `src/engine/save.test.ts`, `src/engine/state.test.ts`, `src/engine/replay.test.ts`, `src/ui/App.test.tsx`

**Step 1: Write the failing tests**

In `src/engine/state.test.ts`, add to the imports:

```ts
import { generateParty } from './party'
import { createRng } from './rng'
import { generateWorld, startingSettlement, worldSeed } from './world/generate'
```

and add inside `describe('newGame')`:

```ts
  test('starts at a settlement of a freshly rolled world, with supplies and no strain', () => {
    const state = newGame(99, content)
    expect(state.world).toEqual(generateWorld(worldSeed(99), content))
    expect(state.location).toBe(startingSettlement(state.world, content))
    expect(state.travel).toBeNull()
    expect(state.goods).toEqual({ food: 10, water: 8 })
    expect(state.party.map((c) => c.strain)).toEqual([{}, {}])
    expect(state.log[0].text).toMatch(/ set out together from \w+\.$/)
  })

  test('rolling the world leaves the run’s random stream alone', () => {
    const [, rng] = generateParty(createRng(99), content, 2)
    expect(newGame(99, content).rng).toEqual(rng)
  })
```

In `src/engine/save.test.ts`:
- Pass the content everywhere: every `deserialize(text)` becomes `deserialize(text, content)` and every `migrate(raw)` becomes `migrate(raw, content)`.
- Import `generateWorld`, `startingSettlement` and `worldSeed` from `./world/generate`.
- Replace everything from `/** A save as Plan 1 wrote it. */` to the end of the file with:

```ts
/** A save as Plan 1 wrote it. Characters had no strain yet. */
const { strain: _strain, ...ada } = makeCharacter({ id: 'c-ada', name: 'Ada Stone' })
const V1_SAVE = {
  version: 1,
  seed: 5,
  rng: { state: 12345 },
  day: 3,
  party: [ada],
  gold: 42,
  inspiration: 1,
  log: [{ day: 1, text: 'Ada Stone set out.', tone: 'info' }],
  lastRoll: null,
}
/** A save as Plan 2 wrote it. */
const V2_SAVE = { ...V1_SAVE, version: 2, encounter: null, followUps: [], skillUses: [] }

/** Both become: a world rolled from the save's seed, the party at its starting place with fresh supplies. */
function migrated() {
  const world = generateWorld(worldSeed(5), content)
  return {
    ...V2_SAVE,
    version: 3,
    party: [{ ...ada, strain: {} }],
    world,
    location: startingSettlement(world, content),
    travel: null,
    goods: { food: 5, water: 4 },
  }
}

test('a version 2 save loads as version 3 with a world, a starting place and supplies', () => {
  expect(CURRENT_SAVE_VERSION).toBe(3)
  expect(deserialize(JSON.stringify(V2_SAVE), content)).toEqual(migrated())
})

test('a version 1 save loads as version 3 too', () => {
  expect(deserialize(JSON.stringify(V1_SAVE), content)).toEqual(migrated())
})

test('migrating old saves does not mutate the parsed object', () => {
  for (const save of [V1_SAVE, V2_SAVE]) {
    const raw = structuredClone(save)
    migrate(raw, content)
    expect(raw).toEqual(save)
  }
})
```

In `src/engine/replay.test.ts`, pass `content` to both `deserialize` calls. In `src/ui/App.test.tsx`, import `loadBundledContent` from `../content/bundled` and pass `loadBundledContent()` as the second argument of `deserialize`.

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine`. Expected: FAIL (no `world` on the state, `CURRENT_SAVE_VERSION` is 2).

**Step 3: Extend the state schema**

In `src/schema/state.ts`, import `GoodSchema` from `./common` and `WorldStateSchema` from `./world`. Add `strain` at the end of `CharacterSchema`:

```ts
  exhaustion: z.number().int().min(0).max(6),
  /** Strain stacks by skill (design §3): each is −1 to that skill. One stack per skill fades each day. */
  strain: z.partialRecord(SkillSchema, z.number().int().min(1)).default({}),
})
```

Add before `GameStateSchema`:

```ts
/**
 * Goods carried, by good. Only the essentials exist so far (GOODS); Plan 4 adds the rest of the
 * 15, and a good that is missing counts as 0, so saves keep loading.
 */
export const GoodsSchema = z.partialRecord(GoodSchema, z.number().int().min(0))
export type Goods = z.infer<typeof GoodsSchema>

/** A journey along one route, from settlement to settlement. */
export const TravelStateSchema = z.object({
  route: IdSchema,
  from: IdSchema,
  to: IdSchema,
  km: z.number().int().min(1),
  kmPerDay: z.number().min(1),
  kmDone: z.number().min(0),
  daysDone: z.number().int().min(0),
  /** The expected length in days, shown before departure. */
  days: z.number().int().min(1),
  /** Journey days (1-based) with an encounter, ascending; drawn at departure. Spent as they happen. */
  encounterDays: z.array(z.number().int().min(1)),
})
export type TravelState = z.infer<typeof TravelStateSchema>
```

and change `GameStateSchema`'s version to `z.literal(3)` and add, after `skillUses`:

```ts
  /** The political layer of this world, rolled from its seed (see generateWorld). */
  world: WorldStateSchema,
  /** The settlement the party is in; null while on the road. */
  location: IdSchema.nullable(),
  travel: TravelStateSchema.nullable(),
  goods: GoodsSchema,
```

**Step 4: Starting supplies and names**

Create `src/engine/travel/supplies.ts`:

```ts
import type { Good } from '../../schema/constants'
import type { Goods } from '../../schema/state'

/** A new party carries this many days of food per member. */
export const STARTING_FOOD_DAYS = 5
/** Waterskins hold this many days of water per member. */
export const WATER_DAYS = 4

export const goodsOf = (goods: Goods, good: Good): number => goods[good] ?? 0
export const waterCapacity = (members: number): number => WATER_DAYS * members
export const startingGoods = (members: number): Goods => ({
  food: STARTING_FOOD_DAYS * members,
  water: waterCapacity(members),
})
```

Add to `src/engine/world/geo.ts` (with `import type { GameState } from '../../schema/state'`):

```ts
/** A settlement's name in this world, or its id when the political layer doesn't know it. */
export const settlementName = (state: Pick<GameState, 'world'>, id: string): string =>
  Object.hasOwn(state.world.settlements, id) ? state.world.settlements[id].name : id
```

In `src/engine/party.ts`, add `strain: {},` after `exhaustion: 0,` in `generateCharacter`. In `src/engine/test-fixtures.ts`, add `strain: {},` after `exhaustion: 0,` in `makeCharacter`.

**Step 5: The migration**

In `src/engine/save.ts`:

```ts
import type { Content } from '../content/build'
import { GameStateSchema, type GameState } from '../schema/state'
import { startingGoods } from './travel/supplies'
import { generateWorld, startingSettlement, worldSeed } from './world/generate'
```

```ts
export const CURRENT_SAVE_VERSION = 3
```

Add after `v1ToV2`:

```ts
/**
 * v2 → v3 (Plan 3): a world rolled from the save's seed, the party at that world's starting
 * place with fresh supplies, no journey, and no strain yet.
 */
export function v2ToV3(raw: Record<string, unknown>, content: Content): Record<string, unknown> {
  const world = generateWorld(worldSeed(typeof raw.seed === 'number' ? raw.seed : 0), content)
  const party = Array.isArray(raw.party)
    ? raw.party.map((c: Record<string, unknown>) => ({ ...c, strain: {} }))
    : raw.party
  return {
    ...raw,
    version: 3,
    party,
    world,
    location: startingSettlement(world, content),
    travel: null,
    goods: startingGoods(Array.isArray(raw.party) ? raw.party.length : 0),
  }
}
```

and thread the content through `migrate` and `deserialize`:

```ts
export function migrate(raw: unknown, content: Content): unknown {
  const version =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as { version?: unknown }).version
      : undefined
  switch (version) {
    case 1:
      return migrate(v1ToV2(raw as Record<string, unknown>), content)
    case 2:
      return migrate(v2ToV3(raw as Record<string, unknown>, content), content)
    case CURRENT_SAVE_VERSION:
      return raw
    default:
      throw new Error(`unsupported save version: ${String(version)}`)
  }
}

/** Old saves need the content: migrating to v3 rolls the world. */
export function deserialize(text: string, content: Content): GameState | null {
  try {
    const parsed = GameStateSchema.safeParse(migrate(JSON.parse(text), content))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
```

In `src/ui/useGame.ts`, `loadSaved` needs the content: give it a `content: Content` parameter, call `deserialize(text, content)`, and call `loadSaved(content)` in the `useReducer` initialiser.

**Step 6: newGame**

In `src/engine/state.ts`, import `startingGoods` from `./travel/supplies`, `settlementName` from `./world/geo`, and `generateWorld`, `startingSettlement` and `worldSeed` from `./world/generate`. Replace `newGame`:

```ts
export function newGame(
  seed: number,
  content: Content,
  partySize = STARTING_PARTY_SIZE
): GameState {
  const [party, rng] = generateParty(createRng(seed), content, partySize)
  // The world draws from its own stream, so it doesn't change the party or later rolls.
  const world = generateWorld(worldSeed(seed), content)
  const location = startingSettlement(world, content)
  const names = party.map((c) => c.name).join(' and ')
  const from = location ? ` from ${settlementName({ world }, location)}` : ''
  return {
    version: CURRENT_SAVE_VERSION,
    seed,
    rng,
    day: 1,
    party,
    gold: STARTING_GOLD,
    inspiration: 0,
    log: [{ day: 1, text: `${names} set out together${from}.`, tone: 'info' }],
    lastRoll: null,
    encounter: null,
    followUps: [],
    skillUses: [],
    world,
    location,
    travel: null,
    goods: startingGoods(party.length),
  }
}
```

**Step 7: Run the tests**

Run: `pnpm test && pnpm typecheck`. Expected: PASS. Fix any other test that builds a `Character` or `GameState` literal by hand (TypeScript points at them): characters need `strain: {}`.

**Step 8: Commit**

```bash
pnpm format
git add src/schema/state.ts src/engine src/ui/useGame.ts src/ui/App.test.tsx
git commit -m "GameState v3: world, location, journey and essentials, with a v2 migration"
```

---

### Task 11: Strain

Every encounter check is already recorded in `skillUses`. The third use of a skill in a day, or the tenth in a week, adds a stack: −1 to that skill, inside `statModifier`, so previews and the automatic actor rotate on their own.

**Files:**
- Create: `src/engine/rules/strain.ts`
- Modify: `src/engine/rules/character.ts`, `src/engine/encounters/run.ts`, `src/engine/encounters/preview.ts`
- Test: `src/engine/rules/strain.test.ts`, `src/engine/encounters/run.test.ts`, `src/engine/encounters/preview.test.ts`

**Step 1: Write the failing tests**

Create `src/engine/rules/strain.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Skill } from '../../schema/constants'
import type { SkillUse } from '../../schema/state'
import { SKILL_USE_DAYS } from '../encounters/run'
import { brom, lyra } from '../test-fixtures'
import { rankActors, statModifier } from './character'
import { STRAIN_WEEK_DAYS, addStrain, fadeStrain, strainFrom, strainOf } from './strain'

const use = (day: number, skill: Skill = 'athletics', characterId = 'brom'): SkillUse => ({
  day,
  characterId,
  skill,
})

describe('strainFrom', () => {
  test('the third use of a skill in a day strains, and so does each later one', () => {
    expect(strainFrom([use(4), use(4)], 'brom', 'athletics', 4)).toBe(false)
    expect(strainFrom([use(4), use(4), use(4)], 'brom', 'athletics', 4)).toBe(true)
    expect(strainFrom([use(4), use(4), use(4), use(4)], 'brom', 'athletics', 4)).toBe(true)
  })

  test('other skills, other characters and other days count separately', () => {
    const uses = [use(4), use(4, 'stealth'), use(4, 'athletics', 'lyra'), use(3)]
    expect(strainFrom(uses, 'brom', 'athletics', 4)).toBe(false)
  })

  test('the tenth use within seven days strains', () => {
    // Days 1–3 twice, days 4–7 once: 10 uses, never 3 in a day.
    const week = [1, 2, 3, 4, 5, 6, 7].flatMap((day) => (day <= 3 ? [use(day), use(day)] : [use(day)]))
    expect(strainFrom(week, 'brom', 'athletics', 7)).toBe(true)
    expect(strainFrom(week.slice(1), 'brom', 'athletics', 7)).toBe(false)
    expect(strainFrom(week, 'brom', 'athletics', 8)).toBe(false) // day 1 has left the week
  })

  test('skill uses are kept at least as long as the week Strain looks back', () => {
    expect(SKILL_USE_DAYS).toBeGreaterThanOrEqual(STRAIN_WEEK_DAYS)
  })
})

describe('strain stacks', () => {
  test('each stack is −1 to that skill only', () => {
    const strained = addStrain(addStrain(brom, 'athletics'), 'athletics')
    expect(strained.strain).toEqual({ athletics: 2 })
    expect(strainOf(strained, 'athletics')).toBe(2)
    expect(statModifier(strained, 'athletics')).toBe(statModifier(brom, 'athletics') - 2)
    expect(statModifier(strained, 'str')).toBe(statModifier(brom, 'str'))
    expect(statModifier(strained, 'intimidation')).toBe(statModifier(brom, 'intimidation'))
  })

  test('one stack per strained skill fades each day', () => {
    const tired = { ...brom, strain: { athletics: 2, stealth: 1 } }
    expect(fadeStrain(tired).strain).toEqual({ athletics: 1 })
    expect(fadeStrain(fadeStrain(tired)).strain).toEqual({})
  })

  test('enough strain hands the check to someone else', () => {
    // Athletics: Brom +5 (STR +3, proficient), Lyra −1.
    expect(rankActors([brom, lyra], 'athletics')[0].characterId).toBe('brom')
    const spent = { ...brom, strain: { athletics: 7 } }
    expect(rankActors([spent, lyra], 'athletics')[0].characterId).toBe('lyra')
  })
})
```

Append to `src/engine/encounters/run.test.ts`:

```ts
describe('strain', () => {
  test('the third check with a skill in a day strains whoever rolled it', () => {
    const uses = [
      { day: 1, characterId: 'brom', skill: 'athletics' as const },
      { day: 1, characterId: 'brom', skill: 'athletics' as const },
    ]
    const after = choose(start('cliff', makeState({ skillUses: uses })), 'climb', 'brom')
    expect(after.party.find((c) => c.id === 'brom')!.strain).toEqual({ athletics: 1 })
    expect(after.log.map((e) => e.text)).toContain('Brom is strained: Athletics −1 until it fades.')
  })

  test('the first two checks of the day do not', () => {
    const after = choose(start('cliff'), 'climb', 'brom')
    expect(after.party.find((c) => c.id === 'brom')!.strain).toEqual({})
  })
})
```

Append to `src/engine/encounters/preview.test.ts` (import `brom` and `lyra` from `../test-fixtures` if they aren't imported yet):

```ts
test('the actor list shows each member’s strain for the skill', () => {
  const party = [{ ...brom, strain: { athletics: 2 } }, lyra]
  const state = step(makeState({ party }), { type: 'startEncounter', situationId: 'cliff' }, content)
  const climb = encounterOptions(state).find((o) => o.id === 'climb')!
  expect(climb.check!.actors).toEqual([
    { id: 'brom', name: 'Brom', modifier: 3, strain: 2 },
    { id: 'lyra', name: 'Lyra', modifier: -1, strain: 0 },
  ])
})
```

(Use the helpers `preview.test.ts` already has for starting an encounter if they differ.)

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine`. Expected: FAIL, `./strain` does not exist.

**Step 3: Implement**

Create `src/engine/rules/strain.ts`:

```ts
import { SKILLS, type Skill } from '../../schema/constants'
import type { Character, SkillUse } from '../../schema/state'

/**
 * Design §3: thresholds are inclusive, so the third use of a skill in a day, or the tenth within
 * seven days, adds a stack, and so does every later use.
 */
export const STRAIN_PER_DAY = 3
export const STRAIN_PER_WEEK = 10
export const STRAIN_WEEK_DAYS = 7

/** True when this character's latest use of `skill` (already in `uses`) adds a Strain stack. */
export function strainFrom(
  uses: readonly SkillUse[],
  characterId: string,
  skill: Skill,
  day: number
): boolean {
  const mine = uses.filter((u) => u.characterId === characterId && u.skill === skill)
  const today = mine.filter((u) => u.day === day).length
  const week = mine.filter((u) => u.day > day - STRAIN_WEEK_DAYS && u.day <= day).length
  return today >= STRAIN_PER_DAY || week >= STRAIN_PER_WEEK
}

export const strainOf = (character: Pick<Character, 'strain'>, skill: Skill): number =>
  character.strain?.[skill] ?? 0

export const addStrain = (character: Character, skill: Skill): Character => ({
  ...character,
  strain: { ...character.strain, [skill]: strainOf(character, skill) + 1 },
})

/** A day passes: every strained skill loses one stack. */
export function fadeStrain(character: Character): Character {
  const strain: Character['strain'] = {}
  for (const skill of SKILLS) {
    const left = strainOf(character, skill) - 1
    if (left > 0) strain[skill] = left
  }
  return { ...character, strain }
}
```

In `src/engine/rules/character.ts`, import `strainOf` from `./strain` and subtract strain in `statModifier`:

```ts
/**
 * `ability` overrides the skill's default ability, e.g. Intimidation (CHA) for a veiled threat.
 * Proficiency still comes from the skill. Exhaustion lowers every check; Strain lowers its skill.
 */
export function statModifier(
  character: Character,
  stat: CheckStat,
  ability: Ability = abilityOf(stat)
): number {
  const score = abilityModifier(character.abilities[ability])
  const proficient = isSkill(stat) && character.skillProficiencies.includes(stat)
  const proficiency = proficient ? proficiencyBonus(character.level) : 0
  const strain = isSkill(stat) ? strainOf(character, stat) : 0
  return score + proficiency - EXHAUSTION_PENALTY * character.exhaustion - strain
}
```

In `src/engine/encounters/run.ts`, import `addStrain`, `strainFrom` and `strainOf` from `../rules/strain`, and `statLabel` from `../rules/abilities` (next to `checkLabel`). In `chooseOption`, after `const skillUses = [...]`, add:

```ts
  const strained = strainFrom(skillUses, actor.characterId, skill, state.day)
  const party = strained
    ? state.party.map((c) => (c.id === actor.characterId ? addStrain(c, skill) : c))
    : state.party
```

pass `party` in the state given to `appendLog` (next to `skillUses`), turn `const rolled` into `let rolled`, and add after it:

```ts
  if (strained) {
    const stacks = strainOf(party.find((c) => c.id === actor.characterId)!, skill)
    rolled = appendLog(rolled, `${name} is strained: ${statLabel(skill)} −${stacks} until it fades.`, 'bad')
  }
```

The new stack applies from the next check on; the roll that caused it used the old modifier.

In `src/engine/encounters/preview.ts`, import `strainOf` from `../rules/strain`. Add `strain` to the actor type in `OptionCheckPreview`:

```ts
  /** Everyone able to act, best first, for the actor picker. `strain` is their stacks for this skill. */
  actors: { id: string; name: string; modifier: number; strain: number }[]
```

and fill it where `actors` is built:

```ts
    const actors = rankActors(state.party, skill, ability).map((r) => ({
      id: r.characterId,
      name: nameOf(r.characterId),
      modifier: r.modifier,
      strain: strainOf(state.party.find((c) => c.id === r.characterId)!, skill),
    }))
```

**Step 4: Run the tests**

Run: `pnpm test && pnpm typecheck`. Expected: PASS. Update any test that compares `actors` entries with `toEqual` to include `strain: 0`.

**Step 5: Commit**

```bash
pnpm format
git add src/engine
git commit -m "Strain: repeated skill use adds stacks that lower the skill and fade daily"
```

---

### Task 12: Route maths

How long a route takes, what it costs, and how many encounters it may hold.

**Files:**
- Create: `src/engine/travel/routes.ts`
- Test: `src/engine/travel/routes.test.ts`

**Step 1: Write the failing tests**

Create `src/engine/travel/routes.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createRng, withRng } from '../rng'
import { fixtureContent, makeState } from '../test-fixtures'
import {
  encounterChance,
  encounterRange,
  fareFor,
  journeyDays,
  kmPerDay,
  rollEncounterDays,
  routeTerrain,
  routeThreat,
} from './routes'

const content = fixtureContent()

test('speed depends on the terrain', () => {
  expect(kmPerDay('plains')).toBe(30)
  expect(kmPerDay('marsh')).toBe(18)
  expect(kmPerDay('mountains')).toBe(15)
  expect(kmPerDay('sea')).toBe(75)
})

test('journeys take whole days, at least one', () => {
  expect(journeyDays({ km: 75, terrain: 'plains' })).toBe(3)
  expect(journeyDays({ km: 75, terrain: 'marsh' })).toBe(5)
  expect(journeyDays({ km: 10, terrain: 'plains' })).toBe(1)
  expect(journeyDays({ km: 160, terrain: 'sea' })).toBe(3)
})

test('short hops get 0–2 encounters, middling journeys 1–3, long ones 2–4', () => {
  expect([1, 2, 3, 4, 5, 9].map(encounterRange)).toEqual([
    [0, 2],
    [0, 2],
    [1, 3],
    [1, 3],
    [2, 4],
    [2, 4],
  ])
})

test('the encounter chance grows with danger and threat, within 5–90%', () => {
  expect(encounterChance(0, 0)).toBeCloseTo(0.2)
  expect(encounterChance(2, 1)).toBeCloseTo(0.6)
  expect(encounterChance(3, 3)).toBeCloseTo(0.9)
})

describe('rollEncounterDays', () => {
  const roll = (seed: number, days: number, range: [number, number], chance: number) =>
    withRng(createRng(seed), (d) => rollEncounterDays(d, days, range, chance))[0]

  test('stays inside the budget, on journey days, in order', () => {
    const counts = new Set<number>()
    for (let seed = 0; seed < 500; seed++) {
      const days = roll(seed, 3, [1, 3], 0.5)
      counts.add(days.length)
      expect(days.length).toBeGreaterThanOrEqual(1)
      expect(days.length).toBeLessThanOrEqual(3)
      for (const day of days) expect(day).toBeGreaterThanOrEqual(1)
      for (const day of days) expect(day).toBeLessThanOrEqual(3)
      expect([...days].sort((a, b) => a - b)).toEqual(days)
    }
    expect([...counts].sort()).toEqual([1, 2, 3])
  })

  test('chance 0 gives the minimum, chance 1 the maximum', () => {
    expect(roll(1, 6, [2, 4], 0)).toHaveLength(2)
    expect(roll(1, 6, [2, 4], 1)).toHaveLength(4)
  })
})

test('a route’s threat is the higher threat level of its two regions', () => {
  const state = makeState()
  const world = structuredClone(state.world)
  world.regions.greenvale.threatLevel = 1
  world.regions.ashmoor.threatLevel = 3
  const route = content.routes['ashmoor-1-greenvale-2']
  expect(routeThreat({ ...state, world }, content, route)).toBe(3)
})

test('only sea crossings cost a fare: 2 gp per member per day', () => {
  expect(fareFor(content.routes['ashmoor-1-farisle-1'], 2)).toBe(12)
  expect(fareFor(content.routes['greenvale-1-greenvale-2'], 2)).toBe(0)
})

test('a journey’s terrain comes from its route', () => {
  const travel = {
    route: 'ashmoor-1-greenvale-2',
    from: 'greenvale-2',
    to: 'ashmoor-1',
    km: 75,
    kmPerDay: 18,
    kmDone: 0,
    daysDone: 0,
    days: 5,
    encounterDays: [],
  }
  expect(routeTerrain(content, travel)).toBe('marsh')
  expect(routeTerrain(content, { ...travel, route: 'gone' })).toBeNull()
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/travel`. Expected: FAIL, `./routes` does not exist.

**Step 3: Implement**

Create `src/engine/travel/routes.ts`:

```ts
import type { Content } from '../../content/build'
import type { Biome } from '../../schema/constants'
import type { GameState, TravelState } from '../../schema/state'
import type { Route } from '../../schema/world'
import type { Draw } from '../rng'

/** km per day on foot (or under sail) by terrain. Morale will modify these later. */
export const KM_PER_DAY: Readonly<Record<Biome, number>> = {
  plains: 30,
  forest: 24,
  hills: 24,
  mountains: 15,
  marsh: 18,
  desert: 21,
  jungle: 18,
  sea: 75,
}
/** Passage on a ship, per member per day. */
export const SEA_FARE = 2
/** Journeys of up to this many days are short hops; this many or more are long. */
export const SHORT_HOP_DAYS = 2
export const LONG_JOURNEY_DAYS = 5

export const kmPerDay = (terrain: Biome): number => KM_PER_DAY[terrain]

export const journeyDays = (route: Pick<Route, 'km' | 'terrain'>): number =>
  Math.max(1, Math.ceil(route.km / kmPerDay(route.terrain)))

/** The encounter budget (design §7): a short hop gets 0–2, a long journey 2–4. */
export function encounterRange(days: number): [number, number] {
  if (days <= SHORT_HOP_DAYS) return [0, 2]
  if (days >= LONG_JOURNEY_DAYS) return [2, 4]
  return [1, 3]
}

/** The chance that each encounter slot above the minimum fills. */
export const encounterChance = (danger: number, threatLevel: number): number =>
  Math.min(0.9, Math.max(0.05, 0.2 + 0.15 * danger + 0.1 * threatLevel))

/** The journey days with an encounter, ascending; a day may hold more than one. */
export function rollEncounterDays(
  d: Draw,
  days: number,
  [min, max]: [number, number],
  chance: number
): number[] {
  let count = min
  for (let slot = min; slot < max; slot++) if (d.float() < chance) count++
  return Array.from({ length: count }, () => d.int(1, days)).sort((a, b) => a - b)
}

/** The higher threat level of the regions at either end of a route. */
export function routeThreat(
  state: Pick<GameState, 'world'>,
  content: Content,
  route: Pick<Route, 'from' | 'to'>
): number {
  const level = (id: string) => {
    if (!Object.hasOwn(content.settlements, id)) return 0
    const region = content.settlements[id].region
    return Object.hasOwn(state.world.regions, region) ? state.world.regions[region].threatLevel : 0
  }
  return Math.max(level(route.from), level(route.to))
}

export const fareFor = (route: Pick<Route, 'km' | 'terrain'>, members: number): number =>
  route.terrain === 'sea' ? SEA_FARE * members * journeyDays(route) : 0

/** The terrain underfoot on a journey; null if its route has gone from the data. */
export const routeTerrain = (content: Content, travel: TravelState): Biome | null =>
  Object.hasOwn(content.routes, travel.route) ? content.routes[travel.route].terrain : null
```

**Step 4: Run the tests**

Run: `pnpm vitest run src/engine/travel`. Expected: PASS.

**Step 5: Commit**

```bash
pnpm format
git add src/engine/travel
git commit -m "route maths: speed by terrain, journey days, encounter budget and fares"
```

---

### Task 13: Days, supplies and rest

Each day eats and drinks; whoever goes without makes a CON check or gains exhaustion; strain fades. Resting heals. Until the Plan 4 market, rations have a flat price and water refills free in any settlement. A small calendar names the days.

**Files:**
- Create: `src/engine/calendar.ts`
- Modify: `src/engine/travel/supplies.ts`
- Test: `src/engine/travel/supplies.test.ts`, `src/engine/calendar.test.ts`

**Step 1: Write the failing tests**

Create `src/engine/calendar.test.ts`:

```ts
import { expect, test } from 'vitest'
import { formatDate, seasonOf } from './calendar'

test('a year is four seasons of 90 days', () => {
  expect(formatDate(1)).toBe('Day 1 · Spring 1, year 1')
  expect(formatDate(91)).toBe('Day 91 · Summer 1, year 1')
  expect(formatDate(360)).toBe('Day 360 · Winter 90, year 1')
  expect(formatDate(361)).toBe('Day 361 · Spring 1, year 2')
  expect(seasonOf(200)).toBe('Autumn')
})
```

Create `src/engine/travel/supplies.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { GameState, TravelState } from '../../schema/state'
import { createRng } from '../rng'
import { brom, fixtureContent, lyra, makeCharacter, makeEncounter, makeState } from '../test-fixtures'
import { settlementName } from '../world/geo'
import { buyFood, passDay, rest, runsShort } from './supplies'

const content = fixtureContent()
const base = (overrides: Partial<GameState> = {}): GameState =>
  makeState({ location: 'greenvale-2', goods: { food: 10, water: 8 }, ...overrides })
const onTheRoad: TravelState = {
  route: 'greenvale-1-greenvale-2',
  from: 'greenvale-1',
  to: 'greenvale-2',
  km: 75,
  kmPerDay: 30,
  kmDone: 30,
  daysDone: 1,
  days: 3,
  encounterDays: [],
}
const withCon = (id: string, con: number) =>
  makeCharacter({ id, name: id, abilities: { str: 10, dex: 10, con, int: 10, wis: 10, cha: 10 } })

describe('passDay', () => {
  test('each member eats 1 food and drinks 1 water', () => {
    const before = base()
    const after = passDay(before, 'plains')
    expect(after.day).toBe(2)
    expect(after.goods).toEqual({ food: 8, water: 6 })
    expect(after.log).toEqual(before.log)
  })

  test('the desert takes twice the water', () => {
    expect(passDay(base(), 'desert').goods).toEqual({ food: 8, water: 4 })
  })

  test('one stack of each strained skill fades', () => {
    const strained = base({ party: [{ ...brom, strain: { athletics: 2, stealth: 1 } }, lyra] })
    expect(passDay(strained, 'plains').party[0].strain).toEqual({ athletics: 1 })
  })

  test('the party eats in order; whoever goes without rolls CON', () => {
    const after = passDay(base({ goods: { food: 1, water: 8 } }), 'plains')
    expect(after.goods).toEqual({ food: 0, water: 6 })
    expect(after.party[0].exhaustion).toBe(0)
    expect(after.log.at(-1)!.text).toMatch(
      /^Lyra goes without food: CON \d+ [+−]\d+ = -?\d+ vs DC 10, (holds up|gains a level of exhaustion)\.$/
    )
  })

  test('thirst is much harder to endure than hunger', () => {
    let thirsty = 0
    let hungry = 0
    for (let seed = 0; seed < 100; seed++) {
      const weak = base({ party: [withCon('weak', 3)], goods: { food: 5, water: 0 }, rng: createRng(seed) })
      if (passDay(weak, 'plains').party[0].exhaustion > 0) thirsty++
      const tough = base({ party: [withCon('tough', 30)], goods: { food: 0, water: 5 }, rng: createRng(seed) })
      if (passDay(tough, 'plains').party[0].exhaustion > 0) hungry++
    }
    expect(thirsty).toBeGreaterThan(80)
    expect(hungry).toBeLessThan(15)
  })

  test('runsShort sees a shortage coming', () => {
    expect(runsShort(base(), 'plains')).toBe(false)
    expect(runsShort(base({ goods: { food: 1, water: 8 } }), 'plains')).toBe(true)
    expect(runsShort(base({ goods: { food: 8, water: 3 } }), 'desert')).toBe(true)
  })
})

describe('rest', () => {
  test('a day in a settlement heals fully, eases exhaustion and refills the water', () => {
    const tired = base({ goods: { food: 10, water: 2 }, party: [{ ...brom, hp: 3, exhaustion: 2 }, lyra] })
    const after = rest(tired, content)
    expect(after.day).toBe(2)
    expect(after.party[0]).toMatchObject({ hp: 20, exhaustion: 1 })
    expect(after.goods).toEqual({ food: 8, water: 8 })
    expect(after.log.at(-1)!.text).toBe(`The party rests a day in ${settlementName(after, 'greenvale-2')}.`)
  })

  test('a day in camp heals a quarter of max HP and stays on the road', () => {
    const camp = base({ location: null, travel: onTheRoad, party: [{ ...brom, hp: 0 }, lyra] })
    const after = rest(camp, content)
    expect(after.party[0].hp).toBe(5)
    expect(after.travel).toEqual(onTheRoad)
    expect(after.goods).toEqual({ food: 8, water: 6 })
    expect(after.log.at(-1)!.text).toBe('The party makes camp and rests a day.')
  })

  test('no rest in the middle of an encounter', () => {
    const busy = base({ encounter: makeEncounter({ situation: content.situations.cliff }) })
    expect(rest(busy, content).log.at(-1)!.text).toBe('Finish the current encounter first.')
  })
})

describe('buyFood', () => {
  test('rations cost 1 gp each, and the waterskins are refilled', () => {
    const after = buyFood(base({ gold: 20, goods: { food: 0, water: 0 } }), 5)
    expect(after.gold).toBe(15)
    expect(after.goods).toEqual({ food: 5, water: 8 })
  })

  test('buys what the gold allows, and nothing on the road', () => {
    expect(buyFood(base({ gold: 3 }), 5)).toMatchObject({ gold: 0, goods: { food: 13 } })
    expect(buyFood(base({ gold: 0 }), 5).log.at(-1)!.text).toBe('Rations cost 1 gp each.')
    const road = base({ location: null, travel: onTheRoad })
    expect(buyFood(road, 5).log.at(-1)!.text).toBe('Food can only be bought in a settlement.')
  })
})
```

`makeEncounter({ situation: content.situations.cliff })` is a quick way to put an open encounter on the state; if the type complains about `source`/`file` fields on the content entry, parse it with `SituationSchema` first.

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/travel src/engine/calendar.test.ts`. Expected: FAIL.

**Step 3: Implement**

Create `src/engine/calendar.ts`:

```ts
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const
export type Season = (typeof SEASONS)[number]
export const DAYS_PER_SEASON = 90

export const seasonOf = (day: number): Season =>
  SEASONS[Math.floor((day - 1) / DAYS_PER_SEASON) % SEASONS.length]

/** "Day 91 · Summer 1, year 1". Day 1 is the first day of spring in year 1. */
export function formatDate(day: number): string {
  const index = day - 1
  const year = Math.floor(index / (DAYS_PER_SEASON * SEASONS.length)) + 1
  return `Day ${day} · ${seasonOf(day)} ${(index % DAYS_PER_SEASON) + 1}, year ${year}`
}
```

Replace `src/engine/travel/supplies.ts` with:

```ts
import type { Content } from '../../content/build'
import type { Biome, Good } from '../../schema/constants'
import type { GameState, Goods } from '../../schema/state'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { inProgress } from '../encounters/run'
import { formatModifier } from '../format'
import { appendLog } from '../log'
import { statModifier } from '../rules/character'
import { rollCheck } from '../rules/checks'
import { fadeStrain } from '../rules/strain'
import { settlementName } from '../world/geo'
import { routeTerrain } from './routes'

/** A new party carries this many days of food per member. */
export const STARTING_FOOD_DAYS = 5
/** Waterskins hold this many days of water per member. */
export const WATER_DAYS = 4
/** A stop-gap price per ration until the Plan 4 market. */
export const FOOD_PRICE = 1
/** CON check DCs for a day without food, and a day without water. */
export const HUNGER_DC = 10
export const THIRST_DC = 15
/** A day in camp restores this share of max HP; a day in a settlement restores all of it. */
export const CAMP_HEAL = 0.25

export const goodsOf = (goods: Goods, good: Good): number => goods[good] ?? 0
export const waterCapacity = (members: number): number => WATER_DAYS * members
export const startingGoods = (members: number): Goods => ({
  food: STARTING_FOOD_DAYS * members,
  water: waterCapacity(members),
})
/** Water per member per day: the desert takes twice as much. */
export const waterNeed = (terrain: Biome | null): number => (terrain === 'desert' ? 2 : 1)
export const refillWater = (goods: Goods, members: number): Goods => ({
  ...goods,
  water: Math.max(goodsOf(goods, 'water'), waterCapacity(members)),
})

/** True when today's food or water won't stretch to everyone. */
export const runsShort = (state: GameState, terrain: Biome | null): boolean =>
  goodsOf(state.goods, 'food') < state.party.length ||
  goodsOf(state.goods, 'water') < waterNeed(terrain) * state.party.length

/**
 * One day passes. Members eat and drink in party order. Whoever goes without makes a CON check
 * (DC 10 without food, 15 without water) or gains a level of exhaustion. Strain fades.
 * Returns the ids of those who went without, for rest.
 */
function consumeDay(state: GameState, terrain: Biome | null): { state: GameState; unfed: string[] } {
  let food = goodsOf(state.goods, 'food')
  let water = goodsOf(state.goods, 'water')
  const need = waterNeed(terrain)
  let rng = state.rng
  const unfed: string[] = []
  const lines: string[] = []
  const party = state.party.map((c) => {
    const fed = food >= 1
    if (fed) food -= 1
    const watered = water >= need
    if (watered) water -= need
    const rested = fadeStrain(c)
    if (fed && watered) return rested
    unfed.push(c.id)
    const dc = watered ? HUNGER_DC : THIRST_DC
    const [roll, next] = rollCheck(rng, statModifier(c, 'con'), dc)
    rng = next
    const holds = roll.tier === 'success' || roll.tier === 'critSuccess'
    const lack = !fed && !watered ? 'food and water' : fed ? 'water' : 'food'
    lines.push(
      `${c.name} goes without ${lack}: CON ${roll.kept} ${formatModifier(roll.modifier)} = ` +
        `${roll.total} vs DC ${dc}, ${holds ? 'holds up' : 'gains a level of exhaustion'}.`
    )
    return holds
      ? rested
      : { ...rested, exhaustion: Math.min(MAX_EXHAUSTION, rested.exhaustion + 1) }
  })
  let next: GameState = {
    ...state,
    rng,
    party,
    day: state.day + 1,
    goods: { ...state.goods, food, water },
  }
  for (const line of lines) next = appendLog(next, line, 'bad')
  return { state: next, unfed }
}

export const passDay = (state: GameState, terrain: Biome | null): GameState =>
  consumeDay(state, terrain).state

/**
 * A day of rest. In a settlement: all HP back and the waterskins refilled. In camp: a quarter of
 * max HP. Either way, everyone who ate and drank loses a level of exhaustion. (Plan 4 replaces
 * the settlement rule with lodging quality.)
 */
export function rest(state: GameState, content: Content): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  const inTown = state.travel === null && state.location !== null
  const terrain = state.travel ? routeTerrain(content, state.travel) : null
  const { state: after, unfed } = consumeDay(state, terrain)
  const party = after.party.map((c) => {
    if (c.exhaustion >= MAX_EXHAUSTION) return c
    const hp = inTown ? c.maxHp : Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * CAMP_HEAL))
    const exhaustion = unfed.includes(c.id) ? c.exhaustion : Math.max(0, c.exhaustion - 1)
    return { ...c, hp, exhaustion }
  })
  const goods = inTown ? refillWater(after.goods, party.length) : after.goods
  const text = inTown
    ? `The party rests a day in ${settlementName(state, state.location!)}.`
    : 'The party makes camp and rests a day.'
  return appendLog({ ...after, party, goods }, text, 'good')
}

/** Buys up to `amount` rations at FOOD_PRICE (as many as the gold allows) and refills water. */
export function buyFood(state: GameState, amount: number): GameState {
  if (state.travel || state.location === null) {
    return appendLog(state, 'Food can only be bought in a settlement.', 'bad')
  }
  const wanted = Math.max(0, Math.floor(amount))
  const bought = Math.min(wanted, Math.floor(state.gold / FOOD_PRICE))
  if (bought === 0) return appendLog(state, `Rations cost ${FOOD_PRICE} gp each.`, 'bad')
  const goods = refillWater(
    { ...state.goods, food: goodsOf(state.goods, 'food') + bought },
    state.party.length
  )
  return appendLog(
    { ...state, gold: state.gold - bought * FOOD_PRICE, goods },
    `Bought ${bought} ration${bought === 1 ? '' : 's'} for ${bought * FOOD_PRICE} gp and refilled the waterskins.`,
    'info'
  )
}
```

`supplies.ts` imports `inProgress` from `../encounters/run`; `run.ts` must not import anything from `travel/`, or the modules form a cycle.

**Step 4: Run the tests**

Run: `pnpm test && pnpm typecheck`. Expected: PASS.

**Step 5: Commit**

```bash
pnpm format
git add src/engine/calendar.ts src/engine/calendar.test.ts src/engine/travel
git commit -m "days on the road: rations, water, shortages, rest and a calendar"
```

---

### Task 14: Encounters that fit the place

Situations and templates may name the biomes and regions where they happen. Untagged content stays valid everywhere on land; at sea, only situations tagged `sea` are drawn.

**Files:**
- Modify: `src/schema/encounter.ts`, `src/engine/encounters/run.ts`, `src/engine/encounters/validate.ts`, `data/claude/situations.json`
- Regenerate: `data/_schema/situations.schema.json`, `data/_schema/situationTemplates.schema.json`
- Test: `src/engine/encounters/run.test.ts`, `src/engine/encounters/validate.test.ts`, `src/content/encounters.test.ts`

**Step 1: Write the failing tests**

Append to `src/engine/encounters/run.test.ts` (import `drawEncounter` and `fitsPlace` from `./run`):

```ts
describe('drawing for a place on the road', () => {
  const tagged = structuredClone(content)
  tagged.situations.cliff.biomes = ['hills', 'mountains']
  tagged.situations.roadside.regions = ['ashmoor']
  const drawnIn = (biome: 'plains' | 'hills' | 'marsh', region: string) => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 100; seed++) {
      const state = drawEncounter(reseed(makeState(), seed), tagged, undefined, { biome, region })
      if (state.encounter) seen.add(state.encounter.situation.id)
    }
    return seen
  }

  test('untagged situations happen anywhere on land; tagged ones only where they fit', () => {
    expect(drawnIn('plains', 'greenvale')).toEqual(new Set(['plea', 'starfall']))
    expect(drawnIn('hills', 'greenvale')).toContain('cliff')
    expect(drawnIn('marsh', 'ashmoor')).toContain('roadside')
  })

  test('at sea only sea situations are drawn, and with none nothing happens', () => {
    const state = makeState()
    expect(drawEncounter(state, tagged, undefined, { biome: 'sea', region: 'farisle' })).toBe(state)
    expect(fitsPlace({ biomes: ['sea'] }, { biome: 'sea', region: 'farisle' })).toBe(true)
    expect(fitsPlace({}, { biome: 'sea', region: 'farisle' })).toBe(false)
  })

  test('a due follow-up comes first wherever the party is', () => {
    const due = makeState({ followUps: [{ situationId: 'grudge', wait: 0 }] })
    const state = drawEncounter(due, tagged, undefined, { biome: 'sea', region: 'farisle' })
    expect(state.encounter?.situation.id).toBe('grudge')
  })
})
```

(If `reseed` isn't defined at the top of `run.test.ts`, it is: `const reseed = (state, seed) => ({ ...state, rng: createRng(seed) })`.)

Append to `src/engine/encounters/validate.test.ts`:

```ts
test('region tags must name known regions', () => {
  const situation = SituationSchema.parse({
    id: 'somewhere',
    title: 'Somewhere',
    regions: ['ashmoor', 'atlantis'],
    stages: { start: { text: 'Here.', options: [] } },
  })
  expect(validateSituation(situation, fixtureContent())).toContain('unknown region "atlantis"')
})
```

(Use the imports `validate.test.ts` already has; add `SituationSchema` and `fixtureContent` if missing.)

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/encounters`. Expected: FAIL (`fitsPlace` is not exported; `biomes` is not a situation field).

**Step 3: Implement**

In `src/schema/encounter.ts`, import `BiomeSchema` from `./common` and add to `situationFields`, after `tags`:

```ts
  biomes: z
    .array(BiomeSchema)
    .optional()
    .describe('Only drawn on the road in these terrains; omit for anywhere on land. "sea" for ships.'),
  regions: z
    .array(IdSchema)
    .optional()
    .describe('Only drawn on the road in these regions; omit for anywhere'),
```

and change the `tags` description to `'Themes, e.g. "road"; biomes and regions filter where it happens'`.

In `src/engine/encounters/run.ts`, import `type Biome` from `../../schema/constants` and `type Situation` from `../../schema/encounter`, and add after `inProgress`:

```ts
/** Where the party is when an encounter is drawn on the road. */
export type Place = { biome: Biome; region: string }

/** Untagged situations happen anywhere on land; at sea only those tagged "sea" do. */
export function fitsPlace(
  situation: Pick<Situation, 'biomes' | 'regions'>,
  place: Place
): boolean {
  const biomes = situation.biomes ?? []
  const regions = situation.regions ?? []
  const biomeFits = biomes.length === 0 ? place.biome !== 'sea' : biomes.includes(place.biome)
  return biomeFits && (regions.length === 0 || regions.includes(place.region))
}
```

Give `drawEncounter` a `place` parameter and filter the candidates by it. With a place and no candidate, nothing happens and nothing is logged (the road is just quiet):

```ts
export function drawEncounter(
  state: GameState,
  content: Content,
  sources?: readonly Source[],
  place?: Place
): GameState {
```

```ts
  const candidates = situations.filter(
    (s) =>
      !s.followUpOnly &&
      s.weight > 0 &&
      (!sources || sources.includes(s.source)) &&
      (!place || fitsPlace(s, place))
  )
  if (candidates.length === 0) {
    return place ? state : appendLog(state, 'No encounters match that filter.', 'bad')
  }
```

Update the doc comment above `drawEncounter` to mention the place filter. (Check that `allSituations` keeps `biomes` and `regions` when it turns templates into situations; it spreads the template's fields, so it should.)

In `src/engine/encounters/validate.ts`, at the end of `validateSituation` before the final `return`:

```ts
  for (const region of compiled.regions ?? []) {
    if (!Object.hasOwn(content.regions, region)) issues.push(`unknown region "${region}"`)
  }
```

**Step 4: Tag the Claude-written situations that belong somewhere**

In `data/claude/situations.json`, add `"biomes"` to three situations (next to their `tags`):
- `lantern-moths`: `["marsh"]`
- `lizardfolk-herb`: `["marsh", "jungle"]`
- `singing-stones`: `["hills", "mountains"]`

Leave the `original/` situations untagged: they stay valid everywhere, as they were written. Add to the file's `notes`: `biomes (Plan 3) limit where three situations are drawn on the road.`

Run: `pnpm schemas`. Append to `src/content/encounters.test.ts`:

```ts
test('some situations are tied to terrain, and the rest happen anywhere on land', () => {
  expect(content.situations['lantern-moths'].biomes).toEqual(['marsh'])
  const anywhere = allSituations(content).filter((s) => !s.biomes && !s.regions && !s.followUpOnly)
  expect(anywhere.length).toBeGreaterThan(5)
})
```

**Step 5: Run the tests**

Run: `pnpm test && pnpm typecheck`. Expected: PASS.

**Step 6: Commit**

```bash
pnpm format
git add src/schema/encounter.ts src/engine/encounters data/claude/situations.json data/_schema src/content/encounters.test.ts
git commit -m "draw road encounters that fit the terrain and region"
```

---
### Task 15: Journeys

The daily loop. `travel` sets out along a route from the current settlement and draws the journey's encounter days. `continueJourney` walks day by day until something happens: an encounter, a shortage, a party that can't go on, or arrival. Uneventful days collapse into one journal line. `rest` and `buyFood` become actions.

**Files:**
- Create: `src/engine/travel/journey.ts`
- Modify: `src/engine/state.ts`
- Test: `src/engine/travel/journey.test.ts`

**Step 1: Write the failing tests**

Create `src/engine/travel/journey.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { inProgress } from '../encounters/run'
import { createRng } from '../rng'
import { step, type Action } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { settlementName } from '../world/geo'

const content = fixtureContent()
const at = (location: string, overrides: Partial<GameState> = {}): GameState =>
  makeState({ location, travel: null, goods: { food: 10, water: 8 }, ...overrides })
const act = (state: GameState, action: Action, c: Content = content) => step(state, action, c)
const travel = (state: GameState, routeId: string, c: Content = content) =>
  act(state, { type: 'travel', routeId }, c)
const go = (state: GameState, c: Content = content) => act(state, { type: 'continueJourney' }, c)
/** The same journey with its encounter days replaced. */
const encountersOn = (state: GameState, encounterDays: number[]): GameState => ({
  ...state,
  travel: { ...state.travel!, encounterDays },
})
const lastLine = (state: GameState) => state.log.at(-1)!.text

describe('travel', () => {
  test('sets out along a road from here, with its encounter days drawn', () => {
    const before = at('greenvale-1')
    const after = travel(before, 'greenvale-1-greenvale-2')
    expect(after.location).toBeNull()
    expect(after.day).toBe(before.day)
    expect(after.travel).toMatchObject({
      route: 'greenvale-1-greenvale-2',
      from: 'greenvale-1',
      to: 'greenvale-2',
      km: 75,
      kmPerDay: 30,
      kmDone: 0,
      daysDone: 0,
      days: 3,
    })
    expect(after.travel!.encounterDays.length).toBeGreaterThanOrEqual(1)
    expect(after.travel!.encounterDays.length).toBeLessThanOrEqual(3)
    expect(lastLine(after)).toBe(
      `The party sets out for ${settlementName(after, 'greenvale-2')}: 75 km, about 3 days.`
    )
  })

  test('a route can be taken in either direction', () => {
    expect(travel(at('greenvale-2'), 'greenvale-1-greenvale-2').travel?.to).toBe('greenvale-1')
  })

  test('refuses roads from elsewhere, a second departure, and an open encounter', () => {
    const here = at('greenvale-1')
    expect(travel(here, 'ashmoor-1-farisle-1')).toMatchObject({ travel: null, location: 'greenvale-1' })
    const gone = travel(here, 'greenvale-1-greenvale-2')
    expect(lastLine(travel(gone, 'greenvale-1-greenvale-2'))).toBe('The party is already on the road.')
    const busy = act(here, { type: 'startEncounter', situationId: 'cliff' })
    expect(lastLine(travel(busy, 'greenvale-1-greenvale-2'))).toBe('Finish the current encounter first.')
  })

  test('a sea crossing charges its fare up front', () => {
    const after = travel(at('ashmoor-1', { gold: 20 }), 'ashmoor-1-farisle-1')
    expect(after.gold).toBe(8)
    expect(lastLine(after)).toMatch(/, 12 gp passage\.$/)
    expect(lastLine(travel(at('ashmoor-1', { gold: 5 }), 'ashmoor-1-farisle-1'))).toBe(
      'Passage costs 12 gp.'
    )
  })
})

describe('continueJourney', () => {
  test('quiet days collapse into one line, then the party arrives', () => {
    const out = encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2'), [])
    const arrived = go(out)
    const name = settlementName(arrived, 'greenvale-2')
    expect(arrived).toMatchObject({ travel: null, location: 'greenvale-2', day: out.day + 3 })
    expect(arrived.goods).toEqual({ food: 4, water: 8 })
    expect(arrived.log.slice(-2).map((e) => e.text)).toEqual([
      `3 quiet days on the road to ${name} (75 of 75 km).`,
      `Arrived at ${name} after 3 days on the road. The waterskins are refilled.`,
    ])
  })

  test('an encounter stops the march on its day; the road resumes once it is closed', () => {
    const out = encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2'), [2])
    const met = go(out)
    expect(inProgress(met)).toBe(true)
    expect(met.travel).toMatchObject({ daysDone: 2, kmDone: 60, encounterDays: [] })
    expect(met.log.some((e) => e.text.startsWith('A quiet day on the road to'))).toBe(true)
    expect(lastLine(go(met))).toBe('Finish the current encounter first.')
    expect(go(act(met, { type: 'closeEncounter' })).location).toBe('greenvale-2')
  })

  test('running short stops the march after that day, so the player sees it', () => {
    const out = encountersOn(
      travel(at('greenvale-1', { goods: { food: 1, water: 8 } }), 'greenvale-1-greenvale-2'),
      []
    )
    const hungry = go(out)
    expect(hungry.travel).toMatchObject({ daysDone: 1 })
    expect(lastLine(hungry)).toMatch(/goes without food/)
  })

  test('a party that can’t go on makes camp, then carries on', () => {
    const out = encountersOn(travel(at('greenvale-1'), 'greenvale-1-greenvale-2'), [])
    const down = { ...out, party: out.party.map((c) => ({ ...c, hp: 0 })) }
    expect(lastLine(go(down))).toBe('No one is fit to travel on. Make camp to recover.')
    const camped = act(down, { type: 'rest' })
    expect(camped.party.every((c) => c.hp > 0)).toBe(true)
    expect(go(camped).location).toBe('greenvale-2')
  })

  test('road encounters fit the route’s terrain', () => {
    const tagged = structuredClone(content)
    tagged.situations.cliff.biomes = ['hills']
    for (let seed = 0; seed < 40; seed++) {
      const out = travel(at('greenvale-2', { rng: createRng(seed) }), 'ashmoor-1-greenvale-2', tagged)
      const met = go(encountersOn(out, [1]), tagged)
      expect(met.encounter?.situation.id).not.toBe('cliff')
    }
  })

  test('buying food is an action too', () => {
    expect(act(at('greenvale-1', { gold: 10 }), { type: 'buyFood', amount: 2 }).gold).toBe(8)
  })
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/travel/journey.test.ts`. Expected: FAIL, `travel` is not an action.

**Step 3: Implement**

Create `src/engine/travel/journey.ts`:

```ts
import type { Content } from '../../content/build'
import type { GameState, TravelState } from '../../schema/state'
import { drawEncounter, inProgress, type Place } from '../encounters/run'
import { appendLog } from '../log'
import { withRng } from '../rng'
import { canAct } from '../rules/character'
import { otherEnd, settlementName } from '../world/geo'
import {
  encounterChance,
  encounterRange,
  fareFor,
  journeyDays,
  kmPerDay,
  rollEncounterDays,
  routeTerrain,
  routeThreat,
} from './routes'
import { buyFood, passDay, refillWater, rest, runsShort } from './supplies'

export type TravelAction =
  | { type: 'travel'; routeId: string }
  | { type: 'continueJourney' }
  | { type: 'rest' }
  | { type: 'buyFood'; amount: number }

const BUSY = 'Finish the current encounter first.'
const UNFIT = 'No one is fit to travel on.'
/** A safety cap on the days one Continue may walk; real journeys are far shorter. */
export const MAX_DAYS_PER_CONTINUE = 60

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`)

/** Sets out from the current settlement along one of its routes. */
export function depart(state: GameState, content: Content, routeId: string): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const here = state.location
  if (state.travel || here === null) return appendLog(state, 'The party is already on the road.', 'bad')
  const route = Object.hasOwn(content.routes, routeId) ? content.routes[routeId] : undefined
  if (!route || (route.from !== here && route.to !== here)) {
    return appendLog(state, `No road "${routeId}" leads from ${settlementName(state, here)}.`, 'bad')
  }
  if (!state.party.some(canAct)) return appendLog(state, UNFIT, 'bad')
  const fare = fareFor(route, state.party.length)
  if (state.gold < fare) return appendLog(state, `Passage costs ${fare} gp.`, 'bad')

  const to = otherEnd(route, here)
  const length = journeyDays(route)
  const chance = encounterChance(route.danger, routeThreat(state, content, route))
  const [encounterDays, rng] = withRng(state.rng, (d) =>
    rollEncounterDays(d, length, encounterRange(length), chance)
  )
  const travel: TravelState = {
    route: route.id,
    from: here,
    to,
    km: route.km,
    kmPerDay: kmPerDay(route.terrain),
    kmDone: 0,
    daysDone: 0,
    days: length,
    encounterDays,
  }
  const passage = fare > 0 ? `, ${fare} gp passage` : ''
  return appendLog(
    { ...state, rng, gold: state.gold - fare, location: null, travel },
    `The party sets out for ${settlementName(state, to)}: ${route.km} km, about ${days(length)}${passage}.`,
    'info'
  )
}

/** The terrain and region an encounter on this journey happens in: the nearer end's region. */
export function placeOnRoute(content: Content, travel: TravelState): Place | null {
  const route = Object.hasOwn(content.routes, travel.route) ? content.routes[travel.route] : null
  const end = travel.kmDone < travel.km / 2 ? travel.from : travel.to
  const site = Object.hasOwn(content.settlements, end) ? content.settlements[end] : null
  return route && site ? { biome: route.terrain, region: site.region } : null
}

function arrive(state: GameState): GameState {
  const travel = state.travel!
  const arrived: GameState = {
    ...state,
    travel: null,
    location: travel.to,
    goods: refillWater(state.goods, state.party.length),
  }
  return appendLog(
    arrived,
    `Arrived at ${settlementName(state, travel.to)} after ${days(travel.daysDone)} on the road. The waterskins are refilled.`,
    'good'
  )
}

/**
 * Walks on, day by day, until something happens: an encounter (on its drawn day), a day someone
 * went short of food or water, a party that can't go on, or arrival. Quiet days become one line.
 */
export function continueJourney(state: GameState, content: Content): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  if (!state.travel) return appendLog(state, 'The party is not on the road.', 'bad')
  // The route was removed from the data since this save: skip to the destination.
  if (!Object.hasOwn(content.routes, state.travel.route)) return arrive(state)

  let next = state
  let quiet = 0
  const flush = (s: GameState): GameState => {
    if (quiet === 0) return s
    const t = s.travel!
    const text =
      `${quiet === 1 ? 'A quiet day' : `${quiet} quiet days`} on the road to ` +
      `${settlementName(s, t.to)} (${Math.round(t.kmDone)} of ${t.km} km).`
    quiet = 0
    return appendLog(s, text, 'info')
  }

  for (let guard = 0; guard <= MAX_DAYS_PER_CONTINUE; guard++) {
    const travel = next.travel!
    if (travel.encounterDays.length > 0 && travel.encounterDays[0] <= travel.daysDone) {
      const queued = { ...flush(next), travel: { ...travel, encounterDays: travel.encounterDays.slice(1) } }
      const drawn = drawEncounter(queued, content, undefined, placeOnRoute(content, travel) ?? undefined)
      if (inProgress(drawn)) return drawn
      next = queued // nothing fits here: the road stays quiet
      continue
    }
    if (travel.kmDone >= travel.km) return arrive(flush(next))
    if (!next.party.some(canAct)) return appendLog(flush(next), `${UNFIT} Make camp to recover.`, 'bad')

    const terrain = routeTerrain(content, travel)
    const short = runsShort(next, terrain)
    if (short) next = flush(next)
    const day = travel.daysDone + 1
    next = {
      ...passDay(next, terrain),
      travel: {
        ...travel,
        daysDone: day,
        kmDone: Math.min(travel.km, travel.kmDone + travel.kmPerDay),
      },
    }
    const eventful = travel.encounterDays[0] === day
    if (short && !eventful) return next
    if (!short && !eventful) quiet += 1
  }
  return flush(next)
}

export function stepTravel(state: GameState, action: TravelAction, content: Content): GameState {
  switch (action.type) {
    case 'travel':
      return depart(state, content, action.routeId)
    case 'continueJourney':
      return continueJourney(state, content)
    case 'rest':
      return rest(state, content)
    case 'buyFood':
      return buyFood(state, action.amount)
  }
}
```

In `src/engine/state.ts`, import `stepTravel` and `type TravelAction` from `./travel/journey`, widen `Action`, and route the travel actions:

```ts
export type Action =
  | { type: 'practiceCheck'; stat: CheckStat; dc: number; mode: RollMode; actorId?: string }
  | EncounterAction
  | TravelAction
```

```ts
    case 'travel':
    case 'continueJourney':
    case 'rest':
    case 'buyFood':
      return stepTravel(state, action, content)
    default:
      return stepEncounter(state, action, content)
```

**Step 4: Run the tests**

Run: `pnpm test && pnpm typecheck`. Expected: PASS.

**Step 5: Commit**

```bash
pnpm format
git add src/engine/travel/journey.ts src/engine/travel/journey.test.ts src/engine/state.ts
git commit -m "journeys: set out, walk day by day, meet encounters, arrive"
```

---

### Task 16: Travel previews

What the UI shows before the player commits (design: input randomness): each road's distance, days, danger, threat, encounter range and fare; the settlement's details; the journey's progress; the supplies in days.

**Files:**
- Create: `src/engine/travel/preview.ts`
- Test: `src/engine/travel/preview.test.ts`

**Step 1: Write the failing tests**

Create `src/engine/travel/preview.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { newGame, step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { journeyInfo, placeInfo, routeOptions, suppliesInfo } from './preview'

const content = fixtureContent()

describe('placeInfo', () => {
  test('describes a settlement in this world', () => {
    const state = makeState()
    const s = state.world.settlements['ashmoor-1']
    const kingdom = state.world.kingdoms.find((k) => k.regions.includes('ashmoor'))!
    const info = placeInfo(state, content, 'ashmoor-1')!
    expect(info).toMatchObject({
      id: 'ashmoor-1',
      name: s.name,
      typeName: content.settlementTypes[s.type].name,
      population: s.population,
      regionName: 'Ashmoor',
      biome: 'marsh',
      kingdomName: kingdom.name,
      seat: kingdom.capital === 'ashmoor-1',
      coastal: true,
    })
    expect(info.services.map((x) => x.id)).toEqual(s.services)
    expect(placeInfo(state, content, 'atlantis')).toBeNull()
  })

  test('a settlement named after a town map has its banner', () => {
    const state = newGame(0, content)
    const id = Object.keys(state.world.settlements).find(
      (k) => state.world.settlements[k].town === 'harbourne'
    )!
    expect(placeInfo(state, content, id)!.banner).toBe(
      'town maps/Harbourne - rich seaside town - LN.jpg'
    )
  })
})

describe('routeOptions', () => {
  test('lists the roads from here with distance, days, danger, encounters and fares', () => {
    const options = routeOptions(makeState({ location: 'ashmoor-1', gold: 5 }), content)
    expect(options.map((o) => o.routeId)).toEqual([
      'ashmoor-1-farisle-1',
      'ashmoor-1-greenvale-1',
      'ashmoor-1-greenvale-2',
    ])
    expect(options[0]).toMatchObject({
      to: 'farisle-1',
      km: 160,
      days: 3,
      terrain: 'sea',
      fare: 12,
      encounters: [1, 3],
      available: false,
      reason: 'Passage costs 12 gp.',
    })
    expect(options[2]).toMatchObject({
      to: 'greenvale-2',
      days: 5,
      terrain: 'marsh',
      danger: 2,
      encounters: [2, 4],
      fare: 0,
      available: true,
      reason: null,
    })
  })

  test('there are none while on the road', () => {
    const out = step(makeState({ location: 'greenvale-1' }), { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
    expect(routeOptions(out, content)).toEqual([])
  })
})

describe('journeyInfo and suppliesInfo', () => {
  test('show the journey’s progress and how long the supplies last', () => {
    const state = makeState({ location: 'greenvale-1', goods: { food: 7, water: 8 } })
    expect(journeyInfo(state, content)).toBeNull()
    const out = step(state, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
    expect(journeyInfo(out, content)).toMatchObject({
      from: 'greenvale-1',
      to: 'greenvale-2',
      km: 75,
      kmDone: 0,
      daysDone: 0,
      days: 3,
      terrain: 'plains',
      danger: 0,
      canMove: true,
    })
    expect(suppliesInfo(state)).toEqual({ food: 7, water: 8, waterCapacity: 8, foodDays: 3, waterDays: 4 })
    expect(suppliesInfo(state, 'desert').waterDays).toBe(2)
  })
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/travel/preview.test.ts`. Expected: FAIL, `./preview` does not exist.

**Step 3: Implement**

Create `src/engine/travel/preview.ts`:

```ts
import type { Content } from '../../content/build'
import type { Biome } from '../../schema/constants'
import type { GameState } from '../../schema/state'
import { inProgress } from '../encounters/run'
import { canAct } from '../rules/character'
import { otherEnd, routesFrom, settlementName } from '../world/geo'
import {
  encounterChance,
  encounterRange,
  fareFor,
  journeyDays,
  routeTerrain,
  routeThreat,
} from './routes'
import { goodsOf, waterCapacity, waterNeed } from './supplies'

export const DANGER_LABELS = ['Safe', 'Watchful', 'Dangerous', 'Deadly'] as const
export const THREAT_LABELS = ['Held', 'Stirring', 'Rising', 'Rampant'] as const
export const SIZE_LABELS = ['Outpost', 'Hamlet', 'Village', 'Town', 'City', 'Metropolis'] as const

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

export type PlaceInfo = {
  id: string
  name: string
  typeName: string
  sizeLabel: string
  population: number
  regionName: string
  biome: Biome | null
  kingdomName: string
  /** The ruling ancestry's name. */
  rulerAncestry: string
  /** The settlement's own predominant ancestry. */
  ancestryName: string
  /** True for the kingdom's seat. */
  seat: boolean
  threatName: string
  threatLevel: number
  services: { id: string; name: string }[]
  /** The town map, as a path under assets/, or null. */
  banner: string | null
  coastal: boolean
}

export function placeInfo(state: GameState, content: Content, id: string): PlaceInfo | null {
  const site = own(content.settlements, id)
  const info = own(state.world.settlements, id)
  if (!site || !info) return null
  const region = own(content.regions, site.region)
  const regionState = own(state.world.regions, site.region)
  const kingdom = state.world.kingdoms.find((k) => k.id === regionState?.kingdom)
  const ancestry = (aid: string | undefined) => own(content.ancestries, aid)?.name ?? aid ?? '?'
  return {
    id,
    name: info.name,
    typeName: own(content.settlementTypes, info.type)?.name ?? info.type,
    sizeLabel: SIZE_LABELS[info.sizeTier],
    population: info.population,
    regionName: region?.name ?? site.region,
    biome: region?.biome ?? null,
    kingdomName: kingdom?.name ?? 'No kingdom',
    rulerAncestry: ancestry(kingdom?.ancestry),
    ancestryName: ancestry(info.ancestry),
    seat: kingdom?.capital === id,
    threatName: own(content.threats, regionState?.threat)?.name ?? 'None',
    threatLevel: regionState?.threatLevel ?? 0,
    services: info.services.map((s) => ({ id: s, name: own(content.services, s)?.name ?? s })),
    banner: own(content.towns, info.town)?.banner ?? null,
    coastal: site.coastal,
  }
}

export type RouteOption = {
  routeId: string
  to: string
  toName: string
  km: number
  days: number
  terrain: Biome
  danger: number
  threatLevel: number
  /** The encounter budget, fewest to most. */
  encounters: [number, number]
  /** The chance each slot above the fewest fills. */
  chance: number
  fare: number
  available: boolean
  /** Why it can't be taken now, or null. */
  reason: string | null
}

/** The roads out of the current settlement, by route id. None while on the road. */
export function routeOptions(state: GameState, content: Content): RouteOption[] {
  const here = state.location
  if (here === null || state.travel) return []
  const busy = inProgress(state)
  const fit = state.party.some(canAct)
  return routesFrom(content, here).map((route) => {
    const to = otherEnd(route, here)
    const days = journeyDays(route)
    const threatLevel = routeThreat(state, content, route)
    const fare = fareFor(route, state.party.length)
    const reason = busy
      ? 'Finish the current encounter first.'
      : !fit
        ? 'No one is fit to travel.'
        : state.gold < fare
          ? `Passage costs ${fare} gp.`
          : null
    return {
      routeId: route.id,
      to,
      toName: settlementName(state, to),
      km: route.km,
      days,
      terrain: route.terrain,
      danger: route.danger,
      threatLevel,
      encounters: encounterRange(days),
      chance: encounterChance(route.danger, threatLevel),
      fare,
      available: reason === null,
      reason,
    }
  })
}

export type JourneyInfo = {
  from: string
  fromName: string
  to: string
  toName: string
  km: number
  kmDone: number
  daysDone: number
  days: number
  terrain: Biome | null
  danger: number
  /** False during an encounter or when no one can walk on (then only camp helps). */
  canMove: boolean
}

export function journeyInfo(state: GameState, content: Content): JourneyInfo | null {
  const t = state.travel
  if (!t) return null
  return {
    from: t.from,
    fromName: settlementName(state, t.from),
    to: t.to,
    toName: settlementName(state, t.to),
    km: t.km,
    kmDone: Math.round(t.kmDone),
    daysDone: t.daysDone,
    days: t.days,
    terrain: routeTerrain(content, t),
    danger: own(content.routes, t.route)?.danger ?? 0,
    canMove: !inProgress(state) && state.party.some(canAct),
  }
}

export type SuppliesInfo = {
  food: number
  water: number
  waterCapacity: number
  /** Whole days the food and water last for the whole party. */
  foodDays: number
  waterDays: number
}

export function suppliesInfo(state: GameState, terrain: Biome | null = null): SuppliesInfo {
  const members = Math.max(1, state.party.length)
  const food = goodsOf(state.goods, 'food')
  const water = goodsOf(state.goods, 'water')
  return {
    food,
    water,
    waterCapacity: waterCapacity(state.party.length),
    foodDays: Math.floor(food / members),
    waterDays: Math.floor(water / (members * waterNeed(terrain))),
  }
}
```

**Step 4: Run the tests**

Run: `pnpm vitest run src/engine/travel`. Expected: PASS.

**Step 5: Commit**

```bash
pnpm format
git add src/engine/travel/preview.ts src/engine/travel/preview.test.ts
git commit -m "travel previews: roads, places, journey progress and supplies"
```

---

### Task 17: Seeded journeys and the Altaeus smoke test

A fixed travel policy plays whole journeys, encounters included. The same seed must replay identically, a save mid-journey must not change what follows, and journeys on the real map must never break the state.

**Files:**
- Create: `src/engine/travel/wander.ts`
- Modify: `src/engine/replay.test.ts`, `src/content/world.test.ts`

**Step 1: Write the policy**

Create `src/engine/travel/wander.ts`:

```ts
import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { encounterOptions } from '../encounters/preview'
import { step } from '../state'
import { routeOptions } from './preview'

/**
 * A fixed policy for tests and the simulation smoke test (design §10). Each leg takes the
 * available road at `pick(leg, count)`, then continues, choosing the first available option in
 * every encounter, making camp when stuck, until it arrives; then it buys six rations.
 */
export function wander(
  start: GameState,
  content: Content,
  legs: number,
  pick: (leg: number, count: number) => number = (leg, count) => leg % count
): GameState {
  let state = start
  for (let leg = 0; leg < legs; leg++) {
    if (!state.travel) {
      const roads = routeOptions(state, content).filter((o) => o.available)
      if (roads.length === 0) {
        state = step(state, { type: 'rest' }, content)
        continue
      }
      const road = roads[pick(leg, roads.length)]
      state = step(state, { type: 'travel', routeId: road.routeId }, content)
    }
    for (let guard = 0; state.travel && guard < 100; guard++) {
      if (state.encounter) {
        const option = encounterOptions(state).find((o) => o.available)
        state = option
          ? step(state, { type: 'chooseOption', optionId: option.id }, content)
          : step(state, { type: 'closeEncounter' }, content)
        continue
      }
      const before = state.day
      state = step(state, { type: 'continueJourney' }, content)
      if (state.travel && !state.encounter && state.day === before) {
        state = step(state, { type: 'rest' }, content)
      }
    }
    if (state.encounter) state = step(state, { type: 'closeEncounter' }, content)
    if (state.location) state = step(state, { type: 'buyFood', amount: 6 }, content)
  }
  return state
}
```

`wander` imports `step` from `../state`, and `state.ts` imports `travel/journey.ts`, not `wander.ts`, so there is no cycle.

**Step 2: Write the tests**

Append to `src/engine/replay.test.ts` (import `wander` from `./travel/wander` and `routeOptions` from `./travel/preview`):

```ts
test('a seeded journey replays identically, and another seed differs', () => {
  const run = wander(newGame(2024, content), content, 6)
  expect(run.day).toBeGreaterThan(5)
  expect(wander(newGame(2024, content), content, 6)).toEqual(run)
  expect(wander(newGame(2025, content), content, 6)).not.toEqual(run)
})

test('saving and loading in the middle of a journey does not change what happens next', () => {
  const start = newGame(9, content)
  const out = step(start, { type: 'travel', routeId: routeOptions(start, content)[0].routeId }, content)
  const resumed = deserialize(serialize(out), content)
  expect(resumed).toEqual(out)
  expect(wander(resumed!, content, 3)).toEqual(wander(out, content, 3))
})
```

Append to `src/content/world.test.ts` (import `newGame` from `../engine/state`, `wander` from `../engine/travel/wander`, and `GameStateSchema` from `../schema/state`):

```ts
describe('journeys on Altaeus', () => {
  test.each([1, 2, 3])('seed %i: twelve legs keep the state valid', (seed) => {
    const state = wander(newGame(seed, content), content, 12, (leg, count) => (leg * 7 + seed) % count)
    expect(GameStateSchema.parse(state)).toEqual(state)
    expect(state.day).toBeGreaterThan(12)
    expect(state.log.map((e) => e.text)).not.toContain('No encounters match that filter.')
  })
})
```

**Step 3: Run them**

Run: `pnpm test`. Expected: PASS. If the Altaeus test fails, read the journal of the failing seed (log the last 30 lines) before changing anything: a stuck party usually means a rule gap, not a test problem.

**Step 4: Commit**

```bash
pnpm format
git add src/engine/travel/wander.ts src/engine/replay.test.ts src/content/world.test.ts
git commit -m "seeded journey replays and an Altaeus travel smoke test"
```

---
### Task 18: The world map view

An SVG map in map-pixel coordinates: the Altaeus image as the background when it is in `assets/`, plain parchment with region names when it isn't. Routes show their danger; markers show their kingdom; the party's place, or its position on the road, is marked. Settlements are buttons.

UI strings go through the i18n layer (`src/ui/i18n/`): add each new key to `en.ts` and render it with `t()`. Japanese is optional; missing keys fall back to English. Names and labels that come from engine previews (settlement names, `DANGER_LABELS`, terrain) stay English for now, like the journal. If the i18n layer isn't there when you execute this, use the English strings directly.

**Files:**
- Create: `src/ui/assets.ts`, `src/ui/world/WorldMap.tsx`
- Modify: `src/ui/i18n/en.ts`, `src/ui/theme.css`
- Test: `src/ui/assets.test.ts`, `src/ui/world/WorldMap.test.tsx`

**Step 1: Write the failing tests**

Create `src/ui/assets.test.ts`:

```ts
import { existsSync } from 'node:fs'
import { expect, test } from 'vitest'
import { WORLD_MAP_IMAGE, assetUrl } from './assets'

test('images under assets/ resolve to URLs when present, and to null when not', () => {
  expect(assetUrl('world maps/nowhere.jpg')).toBeNull()
  const present = existsSync(new URL(`../../assets/${WORLD_MAP_IMAGE}`, import.meta.url))
  expect(typeof assetUrl(WORLD_MAP_IMAGE)).toBe(present ? 'string' : 'object')
})
```

Create `src/ui/world/WorldMap.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { step } from '../../engine/state'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import { WorldMap, viewBoxFor } from './WorldMap'

const content = fixtureContent()
afterEach(cleanup)

const map = () => within(screen.getByRole('group', { name: 'Map of Altaeus' }))

test('every settlement is a button; the party’s place is marked; a click selects', async () => {
  const state = makeState({ location: 'greenvale-1' })
  const onSelect = vi.fn()
  render(<WorldMap content={content} state={state} selected={null} onSelect={onSelect} imageUrl={null} />)
  expect(map().getAllByRole('button')).toHaveLength(4)
  const here = settlementName(state, 'greenvale-1')
  expect(map().getByRole('button', { name: `${here} (you are here)` })).toBeTruthy()
  await userEvent.click(map().getByRole('button', { name: settlementName(state, 'greenvale-2') }))
  expect(onSelect).toHaveBeenCalledWith('greenvale-2')
})

test('without the map image: parchment, region names and a note', () => {
  const { container } = render(
    <WorldMap content={content} state={makeState()} selected={null} onSelect={() => {}} imageUrl={null} />
  )
  expect(container.querySelector('image')).toBeNull()
  expect(screen.getByText('Ashmoor')).toBeTruthy()
  expect(screen.getByText(/not in assets/)).toBeTruthy()
})

test('with the map image: the image, and the names left to the map', () => {
  const { container } = render(
    <WorldMap content={content} state={makeState()} selected={null} onSelect={() => {}} imageUrl="/altaeus.jpg" />
  )
  expect(container.querySelector('image')?.getAttribute('href')).toBe('/altaeus.jpg')
  expect(screen.queryByText('Ashmoor')).toBeNull()
})

test('the road to the selected neighbour, and the journey under way, are highlighted', () => {
  const state = makeState({ location: 'greenvale-1' })
  const props = { content, onSelect: () => {}, imageUrl: null }
  const { container, rerender } = render(<WorldMap {...props} state={state} selected="greenvale-2" />)
  expect(container.querySelectorAll('line.active')).toHaveLength(1)
  const out = step(state, { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
  rerender(<WorldMap {...props} state={out} selected={null} />)
  expect(container.querySelectorAll('line.active')).toHaveLength(1)
  expect(container.querySelector('circle.party-marker')).toBeTruthy()
})

test('zooming centres on the party without leaving the map', () => {
  expect(viewBoxFor({ x: 100, y: 100 }, true)).toBe('0 0 1600 1200')
  expect(viewBoxFor({ x: 2000, y: 1500 }, true)).toBe('1200 900 1600 1200')
  expect(viewBoxFor({ x: 4000, y: 3000 }, true)).toBe('2496 1872 1600 1200')
  expect(viewBoxFor(null, true)).toBe('0 0 4096 3072')
  expect(viewBoxFor({ x: 2000, y: 1500 }, false)).toBe('0 0 4096 3072')
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/ui/assets.test.ts src/ui/world`. Expected: FAIL, the modules do not exist.

**Step 3: Implement**

Create `src/ui/assets.ts`:

```ts
// Images from assets/ (gitignored, copied from ~/dnd5e by pnpm sync-assets). A missing file is
// simply not found, and the UI falls back: parchment instead of the map, no town banner.
const images: Record<string, string> = {
  ...import.meta.glob<string>('../../assets/world maps/*.{jpg,jpeg,png,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  ...import.meta.glob<string>('../../assets/town maps/**/*.{jpg,jpeg,png,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
}
const PREFIX = '../../assets/'

export const WORLD_MAP_IMAGE = 'world maps/altaeus map.jpg'

/** The URL of an image by its path under assets/ (e.g. "world maps/altaeus map.jpg"), or null. */
export function assetUrl(path: string): string | null {
  const key = PREFIX + path
  return Object.hasOwn(images, key) ? images[key] : null
}
```

Add to `src/ui/i18n/en.ts`:

```ts
  'map.heading': 'Altaeus',
  'map.label': 'Map of Altaeus',
  'map.zoomIn': 'Zoom to party',
  'map.zoomOut': 'Whole map',
  'map.here': '{name} (you are here)',
  'map.noImage': 'The map image is not in assets/ (run pnpm sync-assets); showing the routes only.',
```

Create `src/ui/world/WorldMap.tsx`:

```tsx
import { useState, type KeyboardEvent } from 'react'
import { sortedEntries, type Content } from '../../content/build'
import { routeOptions } from '../../engine/travel/preview'
import { settlementName } from '../../engine/world/geo'
import type { GameState } from '../../schema/state'
import { MAP_HEIGHT, MAP_WIDTH, type MapPoint } from '../../schema/world'
import { useI18n } from '../i18n/I18n'

/** Marker outlines by kingdom, in kingdom order. They read on the parchment map in both themes. */
export const KINGDOM_COLOURS = [
  '#9c2f24',
  '#2f5c8a',
  '#3f6b35',
  '#7b3f1d',
  '#6a3f8a',
  '#b58500',
  '#2f7a7a',
  '#8a2f5c',
]
/** The zoomed view: this many map pixels around the party. */
export const ZOOM = { width: 1600, height: 1200 }
/** Half a marker's width, in map pixels (the map's own markers are about 20 px). */
const MARKER = 26

type Props = {
  content: Content
  state: GameState
  /** The settlement whose details (and road) are shown. */
  selected: string | null
  onSelect: (settlementId: string) => void
  /** The Altaeus map image (a local asset), or null to draw on plain parchment. */
  imageUrl: string | null
}

const lerp = (a: MapPoint, b: MapPoint, t: number): MapPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** The whole map, or a window around `centre` that stays inside the map. */
export function viewBoxFor(centre: MapPoint | null, zoomed: boolean): string {
  if (!zoomed || !centre) return `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`
  const x = Math.min(Math.max(0, centre.x - ZOOM.width / 2), MAP_WIDTH - ZOOM.width)
  const y = Math.min(Math.max(0, centre.y - ZOOM.height / 2), MAP_HEIGHT - ZOOM.height)
  return `${Math.round(x)} ${Math.round(y)} ${ZOOM.width} ${ZOOM.height}`
}

/**
 * Altaeus: routes (dashed, coloured by danger), settlements outlined in their kingdom's colour,
 * and the party, in a settlement or partway along a road. Settlements are buttons that select.
 */
export function WorldMap({ content, state, selected, onSelect, imageUrl }: Props) {
  const { t } = useI18n()
  const [zoomed, setZoomed] = useState(false)
  const at = (id: string): MapPoint | null =>
    Object.hasOwn(content.settlements, id) ? content.settlements[id].at : null
  const travel = state.travel
  const from = travel ? at(travel.from) : null
  const to = travel ? at(travel.to) : null
  const party = travel
    ? from && to
      ? lerp(from, to, travel.kmDone / travel.km)
      : null
    : state.location
      ? at(state.location)
      : null
  const roads = routeOptions(state, content)
  const reachable = new Set(roads.map((r) => r.to))
  const shownRoute = travel?.route ?? roads.find((r) => r.to === selected)?.routeId ?? null
  const colours = new Map(
    state.world.kingdoms.map((k, i) => [k.id, KINGDOM_COLOURS[i % KINGDOM_COLOURS.length]])
  )
  const colourOf = (region: string) =>
    Object.hasOwn(state.world.regions, region)
      ? colours.get(state.world.regions[region].kingdom)
      : undefined
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onSelect(id)
  }

  return (
    <section className="panel map-panel" aria-label={t('map.heading')}>
      <div className="map-head">
        <h2>{t('map.heading')}</h2>
        <button type="button" aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>
          {zoomed ? t('map.zoomOut') : t('map.zoomIn')}
        </button>
      </div>
      <svg
        className="world-map"
        viewBox={viewBoxFor(party, zoomed)}
        role="group"
        aria-label={t('map.label')}
      >
        {imageUrl ? (
          <image href={imageUrl} x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} />
        ) : (
          <rect className="map-parchment" x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} />
        )}
        {!imageUrl &&
          sortedEntries(content.regions).map((r) => (
            <text key={r.id} className="region-label" x={r.label.x} y={r.label.y} textAnchor="middle">
              {r.name}
            </text>
          ))}
        {sortedEntries(content.routes).map((r) => {
          const a = at(r.from)
          const b = at(r.to)
          if (!a || !b) return null
          const classes = ['route', `danger-${r.danger}`, r.terrain === 'sea' && 'sea', r.id === shownRoute && 'active']
          return (
            <line
              key={r.id}
              className={classes.filter(Boolean).join(' ')}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          )
        })}
        {sortedEntries(content.settlements).map((s) => {
          const here = s.id === state.location
          const name = settlementName(state, s.id)
          const classes = [
            'site',
            here && 'here',
            s.id === selected && 'selected',
            reachable.has(s.id) && 'reachable',
          ]
          return (
            <g
              key={s.id}
              className={classes.filter(Boolean).join(' ')}
              role="button"
              tabIndex={0}
              aria-label={here ? t('map.here', { name }) : name}
              aria-pressed={s.id === selected}
              onClick={() => onSelect(s.id)}
              onKeyDown={onKey(s.id)}
            >
              <rect
                x={s.at.x - MARKER}
                y={s.at.y - MARKER}
                width={MARKER * 2}
                height={MARKER * 2}
                rx={s.capital ? 4 : 10}
                style={{ stroke: colourOf(s.region) }}
              />
              {(zoomed || !imageUrl) && (
                <text className="site-label" x={s.at.x} y={s.at.y - MARKER - 14} textAnchor="middle">
                  {name}
                </text>
              )}
            </g>
          )
        })}
        {party && (
          <circle className="party-marker" cx={party.x} cy={party.y} r={MARKER + 18} aria-hidden="true" />
        )}
      </svg>
      {!imageUrl && <p className="muted small">{t('map.noImage')}</p>}
    </section>
  )
}
```

Append to `src/ui/theme.css` (colours come from the existing theme tokens, so both themes work):

```css
.centre {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.map-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.world-map {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 4px;
  background: var(--bg);
}
.map-parchment {
  fill: var(--panel);
  stroke: var(--line);
  stroke-width: 6;
}
.region-label {
  font-size: 84px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  fill: var(--muted);
  pointer-events: none;
}
.route {
  stroke: var(--ink);
  stroke-opacity: 0.55;
  stroke-width: 8;
  stroke-dasharray: 26 16;
}
.route.sea {
  stroke-dasharray: 6 22;
}
.route.danger-2 {
  stroke: var(--crit);
}
.route.danger-3 {
  stroke: var(--bad);
}
.route.active {
  stroke: var(--accent);
  stroke-opacity: 1;
  stroke-width: 16;
  stroke-dasharray: none;
}
.site {
  cursor: pointer;
}
.site:focus {
  outline: none;
}
.site rect {
  fill: var(--ink);
  fill-opacity: 0.6;
  stroke: var(--muted);
  stroke-width: 10;
}
.site.reachable rect {
  fill: var(--accent);
  fill-opacity: 0.85;
}
.site.here rect {
  fill: var(--good);
  fill-opacity: 1;
}
.site.selected rect,
.site:focus-visible rect {
  stroke: var(--crit) !important;
  stroke-width: 18;
}
.site-label {
  font-size: 40px;
  fill: var(--ink);
  stroke: var(--panel);
  stroke-width: 8px;
  paint-order: stroke;
  pointer-events: none;
}
.party-marker {
  fill: none;
  stroke: var(--good);
  stroke-width: 10;
  pointer-events: none;
}
```

**Step 4: Run the tests**

Run: `pnpm vitest run src/ui && pnpm typecheck`. Expected: PASS.

**Step 5: Commit**

```bash
pnpm format
git add src/ui/assets.ts src/ui/assets.test.ts src/ui/world src/ui/i18n/en.ts src/ui/theme.css
git commit -m "add the world map view, with or without the map image"
```

---

### Task 19: Settlement and journey panels, Strain on screen, and the App

The centre column becomes the place: the settlement (or the journey) above the world map, and the encounter in their stead while one is open. The practice check moves to the right column with the Encounter Deck, as a dev panel. Strain shows on party cards and in the actor picker; the top bar shows the supplies.

**Files:**
- Create: `src/ui/world/PlacePanel.tsx`, `src/ui/world/JourneyPanel.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/PartyPanel.tsx`, `src/ui/encounter/OptionCard.tsx`, `src/ui/i18n/en.ts`, `src/ui/theme.css`
- Test: `src/ui/world/PlacePanel.test.tsx`, `src/ui/world/JourneyPanel.test.tsx`, `src/ui/PartyPanel.test.tsx`, `src/ui/encounter/EncounterView.test.tsx`, `src/ui/App.test.tsx`

**Step 1: Write the failing tests**

Create `src/ui/world/PlacePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { placeInfo } from '../../engine/travel/preview'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { settlementName } from '../../engine/world/geo'
import { PlacePanel } from './PlacePanel'

const content = fixtureContent()
afterEach(cleanup)

test('shows the settlement and its roads; picking a road shows its odds; Travel sets out', async () => {
  const state = makeState({ location: 'ashmoor-1', gold: 50 })
  const onAction = vi.fn()
  const onSelect = vi.fn()
  const props = { content, state, onSelect, onAction }
  const { rerender } = render(<PlacePanel {...props} selected={null} />)
  const info = placeInfo(state, content, 'ashmoor-1')!
  expect(screen.getByRole('heading', { name: info.name })).toBeTruthy()
  for (const s of info.services) expect(screen.getByText(s.name)).toBeTruthy()
  const roads = within(screen.getByRole('list', { name: 'Roads from here' }))
  expect(roads.getAllByRole('button')).toHaveLength(3)
  const greenvale2 = settlementName(state, 'greenvale-2')
  await userEvent.click(roads.getByRole('button', { name: greenvale2 }))
  expect(onSelect).toHaveBeenCalledWith('greenvale-2')

  rerender(<PlacePanel {...props} selected="greenvale-2" />)
  expect(screen.getByText(/2–4 encounters likely/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'travel', routeId: 'ashmoor-1-greenvale-2' })
})

test('a crossing the party can’t afford says why', () => {
  const state = makeState({ location: 'ashmoor-1', gold: 5 })
  render(<PlacePanel content={content} state={state} selected="farisle-1" onSelect={() => {}} onAction={() => {}} />)
  expect(screen.getByText('Passage costs 12 gp.')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Travel' }) as HTMLButtonElement).disabled).toBe(true)
})

test('Rest and Buy rations dispatch', async () => {
  const onAction = vi.fn()
  render(<PlacePanel content={content} state={makeState({ location: 'ashmoor-1' })} selected={null} onSelect={() => {}} onAction={onAction} />)
  await userEvent.click(screen.getByRole('button', { name: 'Rest a day' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'rest' })
  await userEvent.click(screen.getByRole('button', { name: /^Buy 5 rations/ }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'buyFood', amount: 5 })
})
```

Create `src/ui/world/JourneyPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { step } from '../../engine/state'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import { JourneyPanel } from './JourneyPanel'

const content = fixtureContent()
afterEach(cleanup)

test('shows the journey’s progress and dispatches Continue and Make camp', async () => {
  const out = step(makeState({ location: 'greenvale-1' }), { type: 'travel', routeId: 'greenvale-1-greenvale-2' }, content)
  const onAction = vi.fn()
  render(<JourneyPanel content={content} state={out} onAction={onAction} />)
  const bar = screen.getByRole('progressbar', { name: 'Journey progress' })
  expect(bar.getAttribute('aria-valuetext')).toBe('0 of 75 km')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(onAction).toHaveBeenCalledWith({ type: 'continueJourney' })
  await userEvent.click(screen.getByRole('button', { name: 'Make camp (rest a day)' }))
  expect(onAction).toHaveBeenLastCalledWith({ type: 'rest' })
})
```

Add to `src/ui/PartyPanel.test.tsx`:

```tsx
test('strain shows on the card, per skill', () => {
  render(<PartyPanel party={[{ ...brom, strain: { athletics: 2 } }]} />)
  expect(screen.getByText('Athletics −2')).toBeTruthy()
})
```

Add to `src/ui/encounter/EncounterView.test.tsx` (import `brom` and `lyra` from the fixtures):

```tsx
test('the actor picker shows strain', () => {
  const party = [{ ...brom, strain: { athletics: 2 } }, lyra]
  render(<Harness initial={started('cliff', makeState({ party }))} />)
  const picker = screen.getByRole('combobox', { name: 'Actor for Climb' })
  expect(within(picker).getByRole('option', { name: 'Brom +3 · strain −2' })).toBeTruthy()
})
```

Add to `src/ui/App.test.tsx`:

```tsx
test('the party starts in a settlement on the map and can set out along a road', async () => {
  render(<App />)
  const map = within(screen.getByRole('group', { name: 'Map of Altaeus' }))
  expect(map.getAllByRole('button').length).toBeGreaterThanOrEqual(50)
  expect(map.getByRole('button', { name: /\(you are here\)$/ })).toBeTruthy()
  const place = within(screen.getByRole('region', { name: 'Settlement' }))
  const roads = within(place.getByRole('list', { name: 'Roads from here' }))
  await userEvent.click(roads.getAllByRole('button')[0])
  await userEvent.click(place.getByRole('button', { name: 'Travel' }))
  expect(screen.getByRole('region', { name: 'On the road' })).toBeTruthy()
  expect(screen.getByRole('list', { name: 'Log' }).textContent).toMatch(/sets out for/)
})
```

(The first road of a fresh game is affordable: fares are at most a few gp per day and a party starts with 50 gp. If a seed ever proves otherwise, pick the first road whose Travel button is enabled.)

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/ui`. Expected: FAIL.

**Step 3: Implement the panels**

Add to `src/ui/i18n/en.ts`:

```ts
  'top.food': 'Food {food} ({days} d)',
  'top.water': 'Water {water}/{capacity}',
  'top.suppliesHint': 'Rations and waterskins: each member eats 1 and drinks 1 a day (2 in the desert)',

  'place.heading': 'Settlement',
  'place.nowhere': 'The party is nowhere on the map.',
  'place.banner': 'Town map of {name}',
  'place.summary': '{type} · {size}, about {population} people',
  'place.seat': 'seat of the realm',
  'place.realm': '{region} · {kingdom} ({ancestry} rule)',
  'place.threat': 'Threat: {threat} ({level})',
  'place.services': 'Services',
  'place.noServices': 'No services to speak of.',
  'place.rest': 'Rest a day',
  'place.buyFood': 'Buy {n} rations ({gp} gp)',
  'place.roads': 'Roads from here',

  'route.heading': 'To {name}',
  'route.summary': '{km} km · {days} d · {terrain} · {danger}',
  'route.encounters': '{min}–{max} encounters likely ({chance} for each one beyond {min})',
  'route.supplies': 'Food for {food} days and water for {water}; the road takes about {days}',
  'route.fare': 'Passage: {gp} gp',
  'route.travel': 'Travel',
  'route.unreachable': '{name} is more than one road away.',

  'journey.heading': 'On the road',
  'journey.route': '{from} → {to}',
  'journey.progress': 'Journey progress',
  'journey.progressValue': '{done} of {km} km',
  'journey.days': 'Day {done} of about {days} · {terrain} · {danger}',
  'journey.supplies': 'Food for {food} days, water for {water}',
  'journey.continue': 'Continue',
  'journey.camp': 'Make camp (rest a day)',

  'party.strain': '{skill} −{n}',
  'party.strainHint': 'Strain: −1 to this skill per stack; one stack fades each day',
  'option.actorStrain': '{name} {modifier} · strain −{n}',
```

and change `party.legend` to `'● proficient · modifiers include proficiency, exhaustion and strain'`.

Create `src/ui/world/PlacePanel.tsx`:

```tsx
import type { Content } from '../../content/build'
import { formatPercent } from '../../engine/format'
import type { Action } from '../../engine/state'
import {
  DANGER_LABELS,
  THREAT_LABELS,
  placeInfo,
  routeOptions,
  suppliesInfo,
  type RouteOption,
} from '../../engine/travel/preview'
import { FOOD_PRICE } from '../../engine/travel/supplies'
import type { GameState } from '../../schema/state'
import { assetUrl } from '../assets'
import { useI18n } from '../i18n/I18n'

/** Rations bought per click. */
export const RATION_BUNDLE = 5

type Props = {
  content: Content
  state: GameState
  selected: string | null
  onSelect: (settlementId: string | null) => void
  onAction: (a: Action) => void
}

/**
 * The settlement the party is in (a placeholder until the Plan 4 ledger): type, realm, threat,
 * services and banner; rest and rations; and the roads out, with the odds of the chosen one.
 */
export function PlacePanel({ content, state, selected, onSelect, onAction }: Props) {
  const { t } = useI18n()
  const here = state.location ? placeInfo(state, content, state.location) : null
  if (!here) {
    return (
      <section className="panel place" aria-label={t('place.heading')}>
        <p>{t('place.nowhere')}</p>
      </section>
    )
  }
  const roads = routeOptions(state, content)
  const chosen = roads.find((r) => r.to === selected) ?? null
  const elsewhere =
    selected && !chosen && selected !== state.location ? placeInfo(state, content, selected) : null
  const banner = here.banner ? assetUrl(here.banner) : null
  return (
    <section className="panel place" aria-label={t('place.heading')}>
      {banner && <img className="banner" src={banner} alt={t('place.banner', { name: here.name })} />}
      <h2>{here.name}</h2>
      <p className="small">
        {t('place.summary', { type: here.typeName, size: here.sizeLabel, population: here.population })}
        {here.seat && ` · ${t('place.seat')}`}
      </p>
      <p className="muted small">
        {t('place.realm', { region: here.regionName, kingdom: here.kingdomName, ancestry: here.rulerAncestry })}
      </p>
      <p className="small">
        {t('place.threat', { threat: here.threatName, level: THREAT_LABELS[here.threatLevel] })}
      </p>
      <h3>{t('place.services')}</h3>
      {here.services.length > 0 ? (
        <ul className="services">
          {here.services.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('place.noServices')}</p>
      )}
      <div className="actions">
        <button onClick={() => onAction({ type: 'rest' })}>{t('place.rest')}</button>
        <button
          disabled={state.gold < FOOD_PRICE}
          onClick={() => onAction({ type: 'buyFood', amount: RATION_BUNDLE })}
        >
          {t('place.buyFood', { n: RATION_BUNDLE, gp: RATION_BUNDLE * FOOD_PRICE })}
        </button>
      </div>
      <h3>{t('place.roads')}</h3>
      <ul className="road-list" aria-label={t('place.roads')}>
        {roads.map((r) => (
          <li key={r.routeId}>
            <button aria-pressed={r.to === selected} onClick={() => onSelect(r.to)}>
              {r.toName}
            </button>{' '}
            <span className="muted small">
              {t('route.summary', { km: r.km, days: r.days, terrain: r.terrain, danger: DANGER_LABELS[r.danger] })}
            </span>
          </li>
        ))}
      </ul>
      {chosen && (
        <RouteInfo
          road={chosen}
          state={state}
          content={content}
          onTravel={() => {
            onAction({ type: 'travel', routeId: chosen.routeId })
            onSelect(null)
          }}
        />
      )}
      {elsewhere && <p className="muted small">{t('route.unreachable', { name: elsewhere.name })}</p>}
    </section>
  )
}

/** Everything about one road before the party commits to it (design: input randomness). */
function RouteInfo({
  road,
  state,
  content,
  onTravel,
}: {
  road: RouteOption
  state: GameState
  content: Content
  onTravel: () => void
}) {
  const { t } = useI18n()
  const there = placeInfo(state, content, road.to)
  const supplies = suppliesInfo(state, road.terrain)
  return (
    <div className="route-info" role="group" aria-label={t('route.heading', { name: road.toName })}>
      <h3>{t('route.heading', { name: road.toName })}</h3>
      {there && (
        <p className="small">
          {there.typeName} · {there.regionName} · {there.kingdomName} ·{' '}
          {t('place.threat', { threat: there.threatName, level: THREAT_LABELS[there.threatLevel] })}
        </p>
      )}
      <p className="small">
        {t('route.encounters', {
          min: road.encounters[0],
          max: road.encounters[1],
          chance: formatPercent(road.chance),
        })}
      </p>
      <p className="small">
        {t('route.supplies', { food: supplies.foodDays, water: supplies.waterDays, days: road.days })}
      </p>
      {road.fare > 0 && <p className="small">{t('route.fare', { gp: road.fare })}</p>}
      {road.reason && <p className="tone-bad small">{road.reason}</p>}
      <button className="primary" disabled={!road.available} onClick={onTravel}>
        {t('route.travel')}
      </button>
    </div>
  )
}
```

Create `src/ui/world/JourneyPanel.tsx`:

```tsx
import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { DANGER_LABELS, journeyInfo, suppliesInfo } from '../../engine/travel/preview'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'

/** The journey under way: where from and to, how far, the supplies, and Continue or camp. */
export function JourneyPanel({
  content,
  state,
  onAction,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const j = journeyInfo(state, content)
  if (!j) return null
  const supplies = suppliesInfo(state, j.terrain)
  return (
    <section className="panel journey" aria-label={t('journey.heading')}>
      <h2>{t('journey.heading')}</h2>
      <p>{t('journey.route', { from: j.fromName, to: j.toName })}</p>
      <div
        className="progress"
        role="progressbar"
        aria-label={t('journey.progress')}
        aria-valuemin={0}
        aria-valuemax={j.km}
        aria-valuenow={j.kmDone}
        aria-valuetext={t('journey.progressValue', { done: j.kmDone, km: j.km })}
      >
        <span style={{ width: `${(100 * j.kmDone) / j.km}%` }} />
      </div>
      <p className="muted small">
        {t('journey.days', {
          done: j.daysDone,
          days: j.days,
          terrain: j.terrain ?? '?',
          danger: DANGER_LABELS[j.danger],
        })}
      </p>
      <p className="small">
        {t('journey.supplies', { food: supplies.foodDays, water: supplies.waterDays })}
      </p>
      <div className="actions">
        <button
          className="primary"
          disabled={!j.canMove}
          onClick={() => onAction({ type: 'continueJourney' })}
        >
          {t('journey.continue')}
        </button>
        <button onClick={() => onAction({ type: 'rest' })}>{t('journey.camp')}</button>
      </div>
    </section>
  )
}
```

Append to `src/ui/theme.css`:

```css
.banner {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 0.75rem;
}
.services {
  columns: 2;
  margin: 0.25rem 0 0.75rem;
  padding-left: 1.1rem;
}
.road-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: grid;
  gap: 0.3rem;
}
.road-list button[aria-pressed='true'] {
  border-color: var(--accent);
  font-weight: bold;
}
.route-info {
  border-top: 1px solid var(--line);
  padding-top: 0.5rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0;
}
.progress {
  position: relative;
  height: 0.8rem;
  margin: 0.5rem 0;
  border-radius: 3px;
  overflow: hidden;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.progress > span {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);
}
.badge.strain {
  background: color-mix(in srgb, var(--crit) 18%, transparent);
}
```

**Step 4: Strain on the party cards and in the actor picker**

Re-read `src/ui/PartyPanel.tsx` first. On the compact card, the exhaustion badge sits in a `conditions` paragraph that only renders when `c.exhaustion > 0`. Make it render when there is exhaustion or strain, and add one badge per strained skill after the exhaustion badge, labelled with the same skill-name helper the panel uses elsewhere (`stat(skill)` from `useI18n()`, or `statLabel(skill)`):

```tsx
{Object.entries(c.strain).map(([skill, n]) => (
  <span key={skill} className="badge condition strain" title={t('party.strainHint')}>
    {t('party.strain', { skill: stat(skill as Skill), n: n ?? 0 })}
  </span>
))}
```

The sheet's skill modifiers already include strain (they come from `statModifier`).

In `src/ui/encounter/OptionCard.tsx`, the actor `<option>` label becomes:

```tsx
{a.strain > 0
  ? t('option.actorStrain', { name: a.name, modifier: formatModifier(a.modifier), n: a.strain })
  : `${a.name} ${formatModifier(a.modifier)}`}
```

(keeping whatever key or format the card uses for the plain label today).

**Step 5: Wire the App**

Re-read `src/ui/App.tsx`, then:
- Import `WorldMap`, `PlacePanel`, `JourneyPanel`, `assetUrl` and `WORLD_MAP_IMAGE`, `suppliesInfo` and `formatDate`.
- Add `const [selected, setSelected] = useState<string | null>(null)`, and clear it on New party.
- In the top bar, after the day, show the supplies from the revealed state, with the date as the day's tooltip:

```tsx
<span title={formatDate(shown.day)}>{t('top.day', { day: shown.day })}</span>
{(() => {
  const s = suppliesInfo(shown)
  return (
    <span title={t('top.suppliesHint')}>
      {t('top.food', { food: s.food, days: s.foodDays })} ·{' '}
      {t('top.water', { water: s.water, capacity: s.waterCapacity })}
    </span>
  )
})()}
```

- Replace the centre element (the `state.encounter ? <EncounterView …/> : <CheckPanel …/>` expression) with a column:

```tsx
<div className="centre">
  {state.encounter ? (
    <EncounterView state={state} onAction={dispatch} onRevealed={() => setRevealed(state)} />
  ) : (
    <>
      {shown.travel ? (
        <JourneyPanel content={content} state={shown} onAction={dispatch} />
      ) : (
        <PlacePanel
          content={content}
          state={shown}
          selected={selected}
          onSelect={setSelected}
          onAction={dispatch}
        />
      )}
      <WorldMap
        content={content}
        state={shown}
        selected={selected}
        onSelect={setSelected}
        imageUrl={assetUrl(WORLD_MAP_IMAGE)}
      />
    </>
  )}
</div>
```

(keep whatever extra props `EncounterView` receives today).

- Move `<CheckPanel state={state} onAction={dispatch} />` into the right column, between the Encounter Deck and the journal: it is a dev panel now, like the Deck.

The journal needs no change: travel lines go through the same log, and road encounters open in the same `EncounterView`. While dice roll, everything outside the encounter shows the last revealed state, as before.

**Step 6: Run the tests and look at it**

Run: `pnpm test && pnpm typecheck`. Expected: PASS.

Run `pnpm dev` and check:
- The map shows Altaeus with about 53 markers in kingdom colours and the routes; the party's settlement is green and its neighbours are highlighted.
- Picking a road (in the list or on the map) highlights it and shows distance, days, danger, threat, the encounter range, supplies and any fare.
- **Travel**, then **Continue**: quiet days collapse into one journal line; an encounter opens in the centre and the journey resumes after **Close**; arrival shows the new settlement.
- **Zoom to party** frames the party and names the settlements.
- Move `assets/world maps/altaeus map.jpg` aside and reload: the parchment map with region names still works. Move it back.
- Three Athletics checks in one day: the third adds a Strain badge, and the actor picker shows "strain −1".

**Step 7: Commit**

```bash
pnpm format
git add src/ui
git commit -m "settlement and journey panels, strain on screen, and the map in the centre column"
```

---

### Task 20: Documentation and final verification

**Files:**
- Modify: `docs/plans/2026-11-12-rebuild-design.md`, `CLAUDE.md`

**Step 1: Record the world and travel rules in the design.** In `docs/plans/2026-11-12-rebuild-design.md`:

At the end of §6, after the "Town names" bullet's list, add:

```markdown
### World data (Plan 3)

- **Geography** (`data/claude/`): 16 regions (name, biome, label position), about 53 settlements (map-pixel position, region, island, capital marker, coastal) and about 90 routes (km, terrain, danger 0–3). It was read off the map with `scripts/map/` (100 km = 484 px); land routes follow the dashed roads, and islands are reached by sea routes. The map image itself is never committed.
- **Town names** (`data/original/towns.json`) are generated from the town-map filenames by `scripts/port/port-town-maps.ts`; towns labelled on the Altaeus map are pinned to their marker. Place names for the rest come from the prototype's generators (`data/original/place-names.json`).
- **Political layer** (`state.world`), rolled per world seed: 4–6 kingdoms grow outward from seed regions (preferring capital markers) until every region is owned; each region rolls a threat (`data/claude/threats.json`, weighted towards its biome) whose strength is set against the kingdom's garrison (its defence split across its regions) to give a threat level of 0–3. Each marker gets a settlement type, population, size tier, wealth and services (the prototype's d20 + wealth thresholds); named towns go where their hints fit.
- The party starts in a small settlement in the calmest region of the mainland.
```

At the end of §7, add:

```markdown
### Travel (Plan 3)

- The player picks a neighbouring settlement; journeys are one route long.
- **Speed** in km per day: plains 30, forest and hills 24, desert 21, marsh and jungle 18, mountains 15, sea 75 (with a passage of 2 gp per member per day).
- **Each day** every member eats 1 food and drinks 1 water (2 in the desert). Whoever goes without makes a CON check (DC 10 without food, 15 without water) or gains a level of exhaustion; the march stops after such a day.
- **Encounters** are drawn at departure: up to 2 days 0–2, 3–4 days 1–3, 5 or more 2–4; each slot beyond the minimum fills with 20% + 15% per danger + 10% per threat level (5–90%). Situations may name `biomes` and `regions`; untagged ones happen anywhere on land, and at sea only `sea` situations are drawn.
- **Rest:** a day in a settlement restores all HP and the waterskins; a day in camp restores a quarter of max HP; either removes a level of exhaustion from everyone who ate and drank. Until the Plan 4 market, rations cost a flat 1 gp.
```

In §3, replace the Strain "Recovery" bullet's first sentence with: `**Recovery:** each strained skill loses one stack per day (Plan 3), slower in poor lodging and faster in good lodging (Plan 4).` and add to "What counts": `The thresholds are 3 uses in a day or 10 within seven days.`

In §9's layout list, change the centre and right bullets to:

```markdown
  - Centre: the settlement (or the journey) above the Altaeus map with its routes; while an encounter is open, the encounter: narrative, compact option cards with odds bars, and the shared Outcomes panel.
  - Right: dev panels (Encounter Deck, practice check) and the journal.
```

**Step 2: Point to the world tools in `CLAUDE.md`.** Under "Content rules", after the **Encounters** bullet, add:

```markdown
- **World** data lives in `data/claude/` (`regions`, `settlements`, `routes`, `threats`), `data/original/towns.json` (generated: run `pnpm tsx scripts/port/port-town-maps.ts`, don't hand-edit) and `data/original/place-names.json`. `pnpm test` checks the route graph (`worldIssues`). `scripts/map/*.py` read the map image to propose markers and routes (Python with Pillow, numpy, scipy); their output is hand-checked.
```

and extend the build warning under "Content rules" to: `` `pnpm build` bundles `data/imported-private/` and the local images in `assets/` when present — never publish a build made with private content or local assets. ``

**Step 3: Full verification**

Run: `pnpm test`. Expected: all tests pass.
Run: `pnpm typecheck`. Expected: no errors.
Run: `pnpm build`. Expected: build succeeds.
Run: `pnpm schemas && git status --short data/_schema`. Expected: no changes.
Run: `pnpm format:check`. Expected: clean.
Run: `git status --short`. Expected: only the two docs. Neither `assets/`, `CREDITS.md` nor `data/imported-private/` may appear.

**Step 4: Commit**

```bash
git add docs/plans/2026-11-12-rebuild-design.md CLAUDE.md
git commit -m "document the world data and travel rules"
```

---

## Design decisions to confirm with the user

These were not settled by the design doc; the plan picks one answer for each.

1. **Starting place:** a small settlement (not a capital or city) in the calmest region of the mainland, the same for a given world seed.
2. **Travel speed:** 30 km a day on plains; 24 in forest and hills, 21 in desert, 18 in marsh and jungle, 15 in mountains. A typical hop between neighbours is 2–5 days.
3. **Encounter density:** up to 2 days 0–2 encounters, 3–4 days 1–3, 5+ days 2–4. Each slot beyond the minimum fills with 20% + 15% per route danger + 10% per regional threat level, capped at 90%.
4. **Sea routes exist:** the four islands (and the Providence islet) are only reachable by ship at 75 km a day for 2 gp per member per day. At sea only situations tagged `sea` are drawn, and none are written yet, so crossings are calm for now.
5. **Strain fades per skill:** each strained skill loses one stack per day, rather than one stack per character per day.
6. **Stop-gap supplies and rest until Plan 4:** rations cost a flat 1 gp; water refills free in any settlement; waterskins hold 4 days per member. Going without is a CON check (DC 10 food, DC 15 water) against a level of exhaustion. A day's rest restores all HP in a settlement, a quarter of max HP in camp, and a level of exhaustion if fed.
7. **Town names include famous setting names** (Waterdeep, Neverwinter, Rivendell, Gondolin, Moria, Absalom…) because the town maps are named after them, and `data/original/towns.json` is committed. Say if you'd rather keep those out of the public repo (a skip list in `town-maps.ts`).
8. **The map sits in the centre column**, with the settlement or journey panel above it, instead of the right column as design §9 had it: about 53 markers need the room. The practice check moves to the right column as a dev panel.
