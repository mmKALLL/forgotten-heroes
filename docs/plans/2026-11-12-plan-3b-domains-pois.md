# Plan 3b: Domains and Points of Interest

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the region-level political layer with the two scales of design §6. **Lands** are the 16 map areas, and each carries geography, a biome and the roaming threat. **Domains** are one per settlement (53), and each owns the land nearest to it in travel terms. There are 8–12 kingdoms, seated at the 14 capitals, and each grows over domains. The threat level is worked out per domain. On top of that come procedurally placed **points of interest** (POIs): dungeons, experts, lairs, shrines, landmarks, wonders and quest sites. They start hidden, are discovered through clues or exploration, and are visited along real paths with the normal journey rules. Hostile POIs feed their domain's threat, and clearing them lowers it.

**Architecture:**
- **Content (fixed geography):** a new `landSpots` kind (`data/claude/land-spots.json`), which is a grid of land points sampled off the map image by a script. A new `poiTypes` kind (`data/procedural/poi-types.json`) holds the weighted type table. POI names come from parts tables in `data/procedural/poi-names.json`. POI situations live in `data/claude/poi-situations.json`.
- **Engine, all pure:**
  - `src/engine/world/territory.ts`: which domain each spot belongs to, its km from the settlement, and which domains are adjacent. It is computed from content and memoised per `Content` object, not stored in data, so territory never goes stale when settlements are edited.
  - `politics.ts` (reworked): land threats, kingdoms over domains, and garrisons.
  - `pois.ts`: generates the POIs.
  - `graph.ts`: map nodes (settlements and discovered POIs) and edges (routes and POI paths). Travel, previews and the map read the graph instead of `content.routes` directly.
- **State:** `GameState` v4. `world` becomes `{ seed, kingdoms, lands, domains, pois, settlements }`. `location` and `travel.from/to` may be POI ids, and `travel.route` may be a path id. Threat levels are derived (`domainThreatLevel`) and never stored, so clearing a lair just works.
- **Naming:** in engine and UI code, "region" becomes **land** wherever it means the map area (`Place.land`, `WorldState.lands`, `PlaceInfo.landName`). The content kind `regions`, its file, its ids and the situation tag `regions` keep their names, so data and old saves stay stable. Schema descriptions say "land".

**Tech stack:** unchanged. pnpm, Vite, React 19, strict TypeScript, zod 4 and Vitest (jsdom and Testing Library for UI). The map script needs Python 3 with Pillow, numpy and scipy, and is not part of `pnpm test`.

**Context:** design §6 ("Political layer", "Points of interest"), §7 (travel), `docs/notes/threat-levels.md`, and Plan 3 (`2026-11-12-plan-3-world-travel.md`).

**Conventions:**
- TDD. Write the listed tests first, then make them pass. Engine tests use `src/engine/test-fixtures.ts`, and only `src/content/*.test.ts` reads bundled data.
- Run `pnpm format` before every commit, and `pnpm schemas` after changing `src/schema/`.
- Commit after each task with `git add <paths>`. Never use `git add -A`, and never push. If `index.lock` exists, wait and retry.
- Other agents may be editing the UI. Re-read a component before changing it, and apply your change to the current markup.
- Private data: never commit anything from `data/imported-private/`, private town names or the map image. Overlays and scratch output go to the scratchpad and never into the repo.

---

## Tracks and merge points

```
T1 (shared, on `rebuild`) ──┬── Track A: A1 → A2 → A3 → A4 ═M1═ → A5 ═M2═ → A6 ═M3═
                            ├── Track B: B1 → B2 ─────────(needs M2)→ B3
                            └── Track C: (needs M1) C1 → C2 → (needs M3) C3
                                                         all merged → I1 → I2
```

- **T1** runs first on `rebuild`. Each track then runs in its own worktree, branched from T1.
- **M1** (after A4): `WorldState` v4 is live. Track C rebases onto it and starts.
- **M2** (after A5): the POI effects and actions exist. Track B rebases onto it for B3.
- **M3** (after A6): travel to POIs works. Track C rebases onto it for C3.
- **Merging:** each track merges back to `rebuild` with `git merge --no-ff` once its last task is green. B1 and B2 can merge before A finishes, because they only add data and validators.
- **I1 and I2** run on `rebuild` after everything has merged.

---

## T1. Shared schemas: land spots, POI types, site situations

**Files:**
- Modify: `src/schema/world.ts`, `src/schema/constants.ts`, `src/schema/content.ts`, `src/schema/encounter.ts`, `src/content/build.ts` (`emptyContent`), `src/engine/encounters/run.ts`, `src/engine/travel/routes.ts`, `src/engine/encounters/validate.ts`, `src/engine/test-fixtures.ts`
- Create: `data/_schema/landSpots.schema.json` and `data/_schema/poiTypes.schema.json` (via `pnpm schemas`)

**Interfaces:**
- `POI_CATEGORIES = ['dungeon', 'expert', 'lair', 'shrine', 'landmark', 'wonder', 'quest'] as const` and `PoiCategorySchema`.
- `LandSpotSchema`:
  ```json
  { "id": "spot-0412", "at": { "x": 1830, "y": 905 }, "island": "mainland", "terrain": "hills" }
  ```
  `terrain` is an optional `BiomeSchema` (never `sea`). When it is missing, the spot takes its domain's land biome.
- `PoiTypeSchema`:
  ```json
  {
    "id": "orc-war-camp", "category": "lair", "name": "War camp", "weight": 2,
    "biomes": ["hills"], "threats": ["orc-warband"], "hostile": true,
    "threat": { "min": 1, "max": 2 }, "pathDanger": 2, "water": false,
    "names": "poi-name-camp", "situations": ["orc-war-camp-raid"], "icon": "campfire"
  }
  ```
  - `weight` defaults to 1. `biomes` and `threats` default to `[]`: a matching biome or land threat multiplies the weight by `POI_FAVOURED`.
  - `hostile` defaults to false. `threat` is required when `hostile`, and forbidden otherwise (a refine rule).
  - `pathDanger` is 0–3 and defaults to 1. `water` means arriving refills the waterskins.
  - `names` is a parts-table id, `situations` must have at least one entry, and `icon` is an optional game-icons id.
- `SituationSchema` gains `site: z.boolean().default(false)`: "Only played at a point of interest; never drawn on the road."

**Behaviour:**
- `drawEncounter`, `canMeetEncounters` and the stowaway draw skip `site` situations.
- The quality lint applies unchanged. Site situations still need a disposition.

**Fixtures:**
- Add 12–20 spots around the test world's settlements, on both of its islands.
- Add 3 POI types: one hostile lair with a `threats` tag, one expert and one wonder.
- Add one site situation per type. The fixtures may use the new effects only from A5 on.

**Tests:**
- Schema: a hostile type without `threat` fails, and a non-hostile type with `threat` fails. A `sea` terrain spot fails. Defaults are filled in.
- `drawEncounter` never picks a `site` situation, even when it is the only one that fits.
- `canMeetEncounters` is false on a route where only `site` situations would fit.
- `pnpm schemas` leaves no diff, and the stale-schema test passes.

**Commit:** `add land spot, POI type and site situation schemas`

---

## Track A: engine, world model and migration

### A1. Domain territory

**Files:** create `src/engine/world/territory.ts` and `territory.test.ts`.

**Interfaces:**
- `type Territory = { domainOf: Record<string, string>; km: Record<string, number>; adjacent: Record<string, string[]> }`. `domainOf` and `km` are keyed by spot id, and `km` is off-road km to the domain's settlement. `adjacent` is keyed by settlement id and sorted.
- `territory(content: Content): Territory`, memoised in a `WeakMap<Content, Territory>`.
- `SPOT_LINK_KM`: the distance within which two spots, or a spot and a settlement, are linked (about 1.6 × grid spacing).

**Behaviour:**
- Multi-source Dijkstra from every settlement over the spot graph. Links stay on one island and never cross the sea.
- Edge cost is in **days**: `straightKm × 1.2 / KM_PER_DAY[terrain]`. The terrain is the spot's own, or else the source settlement's land biome. This makes mountain domains smaller in km than plains domains.
- Ties go to the lower settlement id.
- `adjacent`: two domains are adjacent when linked spots belong to different domains, or when any route joins their settlements, sea routes included. Islands therefore stay connected to the mainland politically.
- A settlement with no spot within `SPOT_LINK_KM` still has a domain, with an empty territory.

**Tests (fixture world):**
- Every spot gets a domain on its own island.
- A spot exactly between two settlements on plains goes to the lower id.
- With one settlement in mountains and one on plains, the spot at the km midpoint goes to the plains settlement.
- `km` is at least the straight-line km.
- Domains joined by a sea route are adjacent. Islands without spots still get their settlements as domains.
- Calling it twice on the same content returns the same object.

**Commit:** `compute domain territory from land spots`

### A2. Politics over domains

**Files:** modify `src/engine/world/politics.ts` and `politics.test.ts`, and `src/schema/world.ts` (the new state schemas only, not yet wired into `WorldStateSchema`).

**Interfaces:**
- `LandStateSchema { threat, threatStrength }`.
- `DomainStateSchema { kingdom, land, garrison: number ≥ 0 }`. `land` is the settlement's `region`.
- `KingdomSchema`: `regions` becomes `domains: string[]`, and `capital` becomes `seat`.
- Constants: `KINGDOMS = { min: 8, max: 12 }`, `DEFENCE`, `SEAT_FALLOFF`, `SAME_LAND_WEIGHT`.
- `generatePolitics(d, content, territory, usedNames, kingdomCount?) → { kingdoms, lands, domains }`.
- `threatLevelFor(strength, garrison)` is kept.

**Behaviour:**
- **Lands:** each land rolls a threat weighted by biome, then a strength, as today.
- **Seeds:** `count = min(int(8, 12), capitals)`. Kingdoms are seeded at distinct capital markers drawn without replacement, and the seed is the seat.
- **Growth:** the smallest kingdom that can grow claims a frontier domain from `territory.adjacent`. A frontier domain in a land the kingdom already holds weighs `SAME_LAND_WEIGHT` (2), so borders loosely follow lands. If no kingdom can reach a domain, it founds a kingdom with its own settlement as the seat.
- **Garrison:** a domain at `h` hops from its seat (BFS over the kingdom's own domains) weighs `1 / (1 + SEAT_FALLOFF × h)`. The kingdom's `defence` is split in proportion to the weights. Border domains of a sprawling kingdom are therefore the thinnest.
- Initial values: `SEAT_FALLOFF = 0.5`. `DEFENCE` is provisionally scaled to about 2.5× today's range, i.e. 10–25. I1 tunes both.

**Tests:**
- Every domain is owned exactly once, and every kingdom's seat is a capital marker it owns.
- The kingdom count is within 8–12 and never more than the number of capitals.
- With `kingdomCount = 1`, all domains belong to one kingdom.
- Garrisons sum to the kingdom's defence within 1e-9.
- The seat domain has the largest garrison, and garrisons fall with hops.
- The same seed gives the same result.
- A domain no kingdom can reach (fixture with a cut-off island) founds its own kingdom.

**Commit:** `kingdoms grow over domains, garrisons thin with distance from the seat`

### A3. POI generation

**Files:** create `src/engine/world/pois.ts` and `pois.test.ts`, and add `PoiStateSchema` to `src/schema/world.ts`.

**Interfaces:**
- `PoiStateSchema`:
  ```json
  { "type": "orc-war-camp", "spot": "spot-0412", "domain": "norrikk-2", "name": "Gorrak's Camp",
    "threat": 2, "discovered": false, "cleared": false }
  ```
  `threat` is 0 for a type that isn't hostile.
- `POIS_PER_DOMAIN`: a function of territory size, e.g. `clamp(round(spots / POI_SPOTS_EACH), 1, 3)`.
- `POI_MIN_KM`: the closest a POI may be to its settlement and to other POIs, about 8 km.
- `POI_FAVOURED = 3`.
- `generatePois(d, content, territory, lands) → Record<string, PoiState>`, with ids `poi-<n>` in generation order.
- `domainThreatStrength(world, domainId)` is the land's strength plus the sum of the `threat` values of uncleared hostile POIs in that domain.
- `domainThreatLevel(world, domainId)` is `threatLevelFor(domainThreatStrength, garrison)`.

**Behaviour:**
- Domains are walked in id order. Each domain draws its number of POIs from distinct spots in its territory that respect `POI_MIN_KM`. If none is left, it places fewer.
- Types are drawn by weight: `POI_FAVOURED` applies when the type's biome matches the spot's terrain or its `threats` names the land's threat.
- Names come from `names` with the existing slot filler. `{threat}` and `{land}` are available as slot values.
- Everything starts undiscovered and uncleared.

**Tests:**
- Seeded determinism.
- Every POI's spot belongs to its domain.
- No two POIs in a domain are closer than `POI_MIN_KM`.
- A domain whose territory is a single spot gets at most one POI.
- A lair tagged with the land's threat appears noticeably more often than an untagged one over 200 seeds (ratio > 2).
- `domainThreatLevel` drops after a hostile POI is marked cleared, and is unchanged by non-hostile POIs.

**Commit:** `generate points of interest per domain`

### A4. WorldState v4, GameState v4 and the migration  ⇒ merge point M1

**Files:**
- Modify: `src/schema/world.ts`, `src/schema/state.ts`, `src/engine/save.ts`, `src/engine/world/generate.ts`, `settlements.ts` and `geo.ts`, `src/engine/travel/routes.ts`, `preview.ts`, `journey.ts` and `stowaway.ts`, `src/engine/encounters/run.ts`
- Modify the UI files only as far as they need to compile: `src/ui/world/WorldMap.tsx` and `PlacePanel.tsx`
- Update the tests that touch them.

**Interfaces:**
- `WorldStateSchema = { seed, kingdoms, lands, domains, pois, settlements }`.
- `GameStateSchema.version` becomes `z.literal(4)`, and `CURRENT_SAVE_VERSION = 4`.
- `v3ToV4(raw, content)`: `world = generateWorld(worldSeed(raw.seed), content)`.
  - It keeps `location` when that settlement still exists, and otherwise uses `startingSettlement`.
  - It keeps `travel` when its route still exists, and otherwise sets `travel` to null at the start.
  - Everything else is kept as it is.
- `generateWorld` runs territory, then politics, then POIs, then settlements, all in one RNG stream. Seats become type `capital`, and other capital markers become `city`.
- `Place` becomes `{ biome, land, domain, pace?, coverTracks? }`. `fitsPlace` matches the situation's `regions` tag against `place.land`.
- `routeThreat` takes the higher `domainThreatLevel` of the two ends.
- `startingSettlement` looks for the calmest domain.
- `RAMPANT_WEALTH` is applied per domain.
- `PlaceInfo` gains `landName`, `domainId`, `kingdomName`, `seat` and `threatLevel`, all per domain.

**Tests:**
- A v3 save fixture migrates and parses. Its `world` equals `generateWorld(worldSeed(seed))`, its location is preserved, and its gold, party and log are untouched.
- A v1 save chains through to v4.
- Migrating the same save twice gives identical output.
- A brand-new game and a migrated save with the same seed have the same world.
- `routeThreat` uses the domain levels. Make the two ends differ by giving one domain a cleared lair.
- The existing travel, preview and encounter tests pass after the rename.

**Constraint:** this is the only task that changes the state shape, so the engine compiles at every commit.

**Commit:** `GameState v4: lands, domains and points of interest in the world`

### A5. POI effects and actions: visit, explore, discover  ⇒ merge point M2

**Files:**
- Modify: `src/schema/encounter.ts` (effects and a requirement), `src/schema/state.ts` (`EncounterState.poi` and `EncounterState.domain`), `src/engine/encounters/effects.ts`, `preview.ts` (effect chips) and `run.ts`, `src/engine/state.ts` (actions)
- Create: `src/engine/world/explore.ts` and its tests.

**Interfaces:**
- **Effects:**
  - `{ effect: 'discoverPoi', count?: 1–3 (default 1), scope?: 'domain' | 'land' (default 'domain'), category?: PoiCategory }` reveals the nearest undiscovered POIs to the encounter's domain settlement, by territory km with ties broken by id. If there are none, it logs a line instead.
  - `{ effect: 'clearPoi' }` marks `encounter.poi` cleared. Outside a POI it does nothing.
  - `{ effect: 'trainSkill', skill }` gives the proficiency to the member who lacks it and has the best modifier, ties going to party order.
- **Requirement:** `{ req: 'untrained', skill }` passes when some member lacks the skill. `unmetRequirements` gives "everyone already knows {skill}".
- **Actions:**
  - `{ type: 'visitPoi' }` works only when `location` is a discovered POI that isn't cleared. It starts one of the type's situations, picked by the seeded RNG, with `poi` and `domain` set.
  - `{ type: 'explore' }` works in a settlement or at a POI.
- `exploreOption(state, content) → { actorId, skill, dc, days, chances: tierOdds, outcomes: string[] } | null`. It is null when nothing in the domain is left to find, and then the UI shows "Nothing more to find here".

**Explore rules:**
- The best of Survival and Perception rolls.
- DC = the forage DC of the domain's terrain + `EXPLORE_DC_BONUS` (2).
- It takes `EXPLORE_DAYS` (2) camp days through `passDay`, including foraging. There are no inn meals, even in town.
- Tiers:
  - Critical fail: nothing is found, and a hostile road encounter is drawn for the domain's place.
  - Fail: nothing is found.
  - Partial: one POI is found, but it takes one more day.
  - Success: one POI is found.
  - Critical success: two POIs are found.
- The roll records a skill use, so it counts towards Strain. A natural 20 grants Inspiration, as on other non-combat checks.

**Tests:**
- `discoverPoi` with `scope: 'land'` reveals POIs in other domains of the land. With `category` it only reveals that category. When nothing is left, `discovered` is unchanged and the journal gets a line.
- `clearPoi` lowers `domainThreatLevel` when the POI was hostile.
- `trainSkill` picks the right member. The `untrained` requirement gates the option once everyone is proficient.
- `visitPoi` is refused when not at a POI, when the POI is undiscovered or cleared, and during an encounter.
- `exploreOption` odds match `previewCheck`. Each tier moves the days and the discoveries as listed. A critical failure starts a hostile encounter.
- `availableActions` lists explore with its preview.

**Commit:** `discover, visit and clear points of interest; explore a domain`

### A6. The travel graph: paths to POIs  ⇒ merge point M3

**Files:**
- Create: `src/engine/world/graph.ts` and its tests.
- Modify: `src/engine/travel/journey.ts`, `preview.ts`, `routes.ts`, `pursuit.ts` (if it reads route ends), `stowaway.ts`, `wander.ts`, `src/engine/world/geo.ts`.

**Interfaces:**
- `type MapNode = { id; kind: 'settlement' | 'poi'; at: MapPoint; domain; land; island }`.
- `nodeOf(state, content, id): MapNode | null`.
- `poiPaths(state, content, poiId): Route[]`. Each path is `{ id: 'path-<poi>-<settlement>', from: poi, to: settlement, km: max(1, round(territory km)), terrain: spot terrain, danger: type.pathDanger }`.
  - A POI always has a path to its own settlement.
  - It also gets one to any other settlement on its island whose off-road km is within `PATH_DETOUR` (1.25×) of the own path. Such a POI acts as a waypoint between two towns.
- `edgesFrom(state, content, nodeId): Route[]` returns content routes and the paths to and from discovered POIs, sorted by id. `edgeById(state, content, id)` looks one up.

**Behaviour:**
- `depart` and `routeOptions` work from either node kind. `placeOnRoute` takes the land and domain of the nearer end. Encounters on a path use the path's danger and its domain's threat level.
- **Arrival at a POI:**
  - Water is refilled only if the type has `water`.
  - Rest is camp-only: no inn, no buying or selling food, waterskins or supplies. The refusal messages say "Not here".
- Pursuit, pace and foraging are unchanged.
- An undiscovered POI has no edges.
- Old saves are unaffected, because travel along content routes is identical.

**Tests:**
- Paths appear only once a POI is discovered.
- A detour path is added when the second settlement is within 1.25× and not beyond it.
- A journey to a POI arrives with `location = poiId`, and its encounter place has the POI's domain.
- Rest at a POI is camp-only, and buying there is refused.
- Water refills at a POI only when `water: true`.
- Leaving a POI lists all of its paths.
- The Plan 3 journey and preview tests still pass.

**Commit:** `paths to points of interest: travel the graph of settlements and sites`

---

## Track B: content and data

### B1. Land spots off the map (after T1)

**Files:**
- Create: `scripts/map/sample_land_spots.py` and `data/claude/land-spots.json`.
- Modify: `src/engine/world/validate.ts` and its tests, `src/content/world.test.ts`, and the `data/claude/` file `notes`.

**Script:**
- Usage: `python3 -I scripts/map/sample_land_spots.py "assets/world maps/altaeus map.jpg" data/claude/settlements.json <out-dir>`.
- It reuses `detect_markers.py`'s land mask: warm pixels, holes filled, opened. It samples a grid at `SPACING = 100` px (about 21 km) and keeps the points on land that are at least 15 px from the sea.
- Each land component is mapped to the `island` of the settlements inside it. A component without a settlement (a tiny islet) is dropped.
- It writes `<out-dir>/land-spots.json` (the envelope with `source: "claude"`) and `<out-dir>/spots-overlay.jpg` for a hand check.
- The expected size is roughly 600–900 spots. Hand-mark impassable peaks and lakes by removing those spots. `terrain` overrides are optional. Copy the reviewed JSON into `data/claude/`.

**Validator** (`worldIssues`):
- Spot ids are unique and kebab-case.
- A spot's island has at least one settlement.
- Every settlement has a spot within `SPOT_LINK_KM`. If not, it is listed as a warning-level issue that the test allows only for an explicit allow-list of 1-marker islands.
- No two spots are closer than half the spacing.

**Content test:** with the bundled data, every mainland domain owns at least 3 spots, and no domain owns more than 15% of all spots, so no domain is absurdly large.

**Commit:** `land spots read off the Altaeus map`

### B2. POI names and the flavour types (after T1)

**Files:**
- Create: `data/procedural/poi-types.json`, `data/procedural/poi-names.json` (kind `partsTables`) and `data/claude/poi-situations.json`.
- Modify: `src/engine/world/validate.ts` (or a new `poiTypeIssues`) and its tests, `src/content/encounters.test.ts`.

**Content:**
- Add the **shrine, landmark and wonder** categories now, because they need none of the A5 effects. Write 2–3 types each, for example a wayside shrine, standing stones, a drowned bell tower and a glowing falls.
- Each type gets one or two `site` situations:
  - Shrines: a fixed "pray and leave an offering" option (gold for Inspiration) and a Religion check (heal or remove exhaustion).
  - Landmarks: a vantage point (Perception for Edge on the next check) and lore (History for a log line and a little gold).
  - Wonders are `wonder: true`, take one click, and are never hostile.
- Dispositions: shrines and landmarks are `pleasant` or `neutral`.
- POI names: 4–6 tables (`poi-name-ruin`, `poi-name-camp`, `poi-name-shrine`, `poi-name-hermit`, ...) of the form `"{first} {second}"`. Use rows like "the Hollow Barrow", "Grey Hermit's Hut" and "Old Saint's Well".
- Use original names only. Nothing from published settings.

**Validator:**
- Every type's `situations` exist and are `site` situations.
- A `wonder` category type plays only `wonder` situations.
- `names` is an existing parts table.
- `threats` names existing threats.
- A hostile type is of category `lair` or `dungeon`.

**Tests:** the validator catches each of those (fixture content), and the bundled content passes it.

**Commit:** `POI type table, names and flavour sites`

### B3. Dungeons, experts, lairs and quest sites (after M2)

**Files:** modify `data/procedural/poi-types.json`, `data/claude/poi-situations.json` and `data/claude/situations.json` (clue outcomes).

**Content:**
- **Lairs:** one or two types per threat in `threats.json`, tagged `threats: [...]`, hostile, threat 1–2.
  - Each situation has a hostile assault stage (fight, sneak in or bait them out) that escalates into a second stage, as design §7 asks.
  - Success ends with `clearPoi` and some gold. A failure drives the party off, costing HP and days, and the lair stays.
- **Dungeons and ruins:** 2–3 types as 3–4-stage chains, roughly entrance, then a hazard or guardian, then the vault. Earlier choices set the footing, and outcomes `goto` the next stage.
  - Mark the boss stage `highStakes`.
  - The vault success gives gold plus `clearPoi`. Active dungeons are hostile with threat 1, and plain ruins are not hostile.
- **Lone experts:** 3–4 types, such as an old scout (Survival or Perception), a hedge-wizard (Arcana), a herbwife (Medicine or Nature) and a retired spy (Stealth or Insight). Each offers the following, and is `neutral`:
  - "pay to train": a fixed option, `requires` gold and `untrained`, with the effects `gold −N` and `trainSkill`. It is `once`.
  - "buy what they know": gold for `discoverPoi` with `scope: 'land'` and `count: 2`.
  - A check to talk them into it for free, with a twist risk where it fits.
  - A cheap "just talk" option, so there is always an option that is neither gated nor `once`.
- **Quest sites:** 2 placeholder types, such as an abandoned waystation or a sealed tomb door. They give a clue (`discoverPoi`) and a log hook for Plan 4 quests, and are `neutral`.
- **Clues on the road:** add a `discoverPoi` effect to the success outcome of 5–8 existing road situations in `data/claude/situations.json` where it fits naturally, for example a dying scout or a map in a dead courier's satchel. Note it in that file's `notes`.

**Tests:**
- Every POI category has at least one type with a playable situation. The content test checks this.
- Every new situation passes the playability check and the quality lint (so the Encounter Deck shows no ⚠ for them): at least 2 options per regular stage, and wonders cost nothing.

**Commit:** `dungeons, experts, lairs and quest sites to visit`

---

## Track C: UI (after M1)

### C1. Lands, domains and kingdoms in the place panels

**Files:** modify `src/ui/world/PlacePanel.tsx` and its tests, `src/ui/i18n/en.ts` and `ja.ts`.

**Behaviour:**
- `place.realm` becomes "{land} · domain of {settlement} · {kingdom} ({ancestry} rule)". The seat is marked.
- The threat line is per domain: "Threat: {threat} ({level})", plus "+{n} from lairs" when hostile POIs add to it, but only those the party has discovered. Undiscovered lairs are folded silently into the level.
- The "elsewhere" summary and the route info use the same strings.

**i18n:** `place.realm`, `place.domainThreat`, `place.lairThreat` and `place.seat`, in English plus a rough Japanese.

**Tests:**
- The panel shows the land, domain and kingdom names.
- The lair note appears only when a discovered hostile POI is in the domain.
- Japanese falls back for missing keys.

**Commit:** `place panel shows land, domain and kingdom`

### C2. POI markers and the kingdom overlay

**Files:** modify `src/ui/world/WorldMap.tsx` and its tests, `src/ui/theme.css`, `src/ui/i18n/en.ts` and `ja.ts`. If icons are synced: `assets.manifest.txt`, `CREDITS.md` and `README.md`.

**Behaviour:**
- **Discovered POIs** are drawn at their spot as a category glyph: inline SVG shapes per category, so nothing depends on assets. When the type's `icon` is a synced game-icons file in `assets/`, it is used instead.
  - Cleared POIs are drawn dimmed.
  - Each POI is a `role="button"` in the same roving-tabindex group as the settlements, with arrow keys and Enter, and `aria-label` "{name} ({category})".
  - Selecting one calls `onSelect(poiId)`.
- **Kingdom overlay toggle** (`map.kingdoms`, `aria-pressed`): every land spot is drawn as a translucent square, about `SPACING` wide, in its domain's kingdom colour. `KINGDOM_COLOURS` is extended to 12 distinguishable colours. Seats get a crown pip.
  - The overlay is off by default. Its state is a per-viewer convenience, so plain `useState` is fine.

**Tests:**
- Undiscovered POIs are not rendered.
- Discovered ones are focusable buttons with labels.
- The overlay toggle adds or removes the spot layer, and its colours follow the kingdoms.
- 12 kingdoms get 12 distinct colours.

**Commit:** `map shows discovered sites and a kingdom overlay`

### C3. POI panel: visit and explore (after M3)

**Files:** create `src/ui/world/PoiPanel.tsx` and its tests. Modify `src/ui/App.tsx`, `src/ui/world/PlacePanel.tsx` (explore button and paths in "Roads from here"), `src/ui/world/WorldMap.tsx` (paths), and `src/ui/i18n/en.ts` and `ja.ts`.

**Behaviour:**
- **The POI panel** is shown when the party is at a POI, or one is selected. It shows:
  - the name, the category and the type name;
  - the owner as "domain of {settlement}, {kingdom}";
  - the threat impact: "Feeds the {threat}: +{n} threat here" for a hostile POI, or "Cleared" once cleared;
  - the paths with the usual pace previews (reusing the road preview block);
  - a camp-only rest.
- **Actions:** "Enter" or "Visit" dispatches `visitPoi`, and is disabled with a reason when cleared. "Explore the domain" shows the actor, skill, DC, % chance, days and every non-critical tier before the player commits, as `exploreOption` returns them.
- **PlacePanel** lists the paths to discovered POIs under "Roads from here" with a "site" badge, and offers the same Explore button.
- **WorldMap** draws the paths to discovered POIs (`edgesFrom`) like routes, coloured by danger and highlighted when they are the chosen road.

**Tests:**
- Visit dispatches `visitPoi` and is disabled for a cleared site.
- The explore preview shows the DC and the % chance.
- Paths are listed with their previews, and drawn on the map.
- The panel is keyboard-operable.

**Commit:** `visit and explore points of interest from the panels`

---

## Integration (after all tracks merge)

### I1. Re-tune Rampant over domains

**Files:** modify `src/content/world.test.ts`, `src/engine/world/politics.ts` (`DEFENCE`, `SEAT_FALLOFF`), `data/claude/threats.json` (strengths, only if needed), `data/procedural/poi-types.json` (lair `threat` and weights, only if needed) and `docs/notes/threat-levels.md`.

**Work:**
- Change the content test to measure the share of **domains** at level 3 over 200 seeds, with POIs included. Bounds are 8–18%, and the target is 10–15%. Add a second assertion that at least 80% of worlds have 1–4 Rampant domains.
- Tune in this order:
  1. `DEFENCE`.
  2. `SEAT_FALLOFF`. Keep the border effect visible: the median seat-domain level is lower than the median border-domain level.
  3. Lair threat or frequency.
  4. Threat strengths, only as a last resort.
- Rewrite `threat-levels.md` for domains: how the level is worked out, the new distribution table, and the knobs.

**Commit:** `re-tune threat levels per domain (Rampant 10–15%)`

### I2. Docs, smoke test and full verification

**Files:** `docs/plans/2026-11-12-rebuild-design.md` (§6 status, plus a "World data (Plan 3b)" block), `src/engine/travel/wander.ts` (optional), and the smoke test.

**Work:**
- `wander` may explore once per settlement stay, and visits a discovered POI with a fixed probability given by its `pick`. The smoke seeds 1–8 still run without throwing, and there are no deaths on seeds 1–3.
- Run `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
- Run `pnpm test` once with `data/imported-private/` moved aside, then restore it exactly.
- Update the design doc: Lands/Domains now built, the POI rules as they are actually implemented (numbers and constants), and the open items below.

**Commit:** `document domains and points of interest (Plan 3b)`

---

## Design decisions to confirm with the user

1. **Old saves are re-rolled.** A v3 save's world is regenerated from its seed. Kingdoms and threats change, and so do **settlement names**, because the name draws move. The party, gold and position are kept, and the journal keeps the old names. The alternative is to keep the v3 names and re-roll only the politics, which takes more code.
2. **Border domains are weaker.** A kingdom's defence is weighted towards its seat and falls off with hops, rather than being split evenly. This is what makes "sprawling kingdoms crack at the edges" visible.
3. **Kingdoms loosely follow lands.** Growth prefers domains in lands the kingdom already holds (×2).
4. **POI density** is 1–3 per domain by territory size, about 80–110 per world. About a quarter are hostile lairs and active dungeons, adding +1–2 threat to their domain each.
5. **Water and rest at POIs:** arriving at a POI does not refill water unless its type has a spring or well, and resting there is camp-only. This tightens the design's "arriving anywhere refills the water".
6. **Paths, not road junctions:** a POI joins its own settlement, plus any settlement within 1.25× that distance, which makes it a waypoint between two towns. Joining POIs to the middle of existing routes is deferred.
7. **Explore costs 2 days** for one discovery (two on a critical success). The panel says "nothing more to find" when a domain is exhausted, which saves wasted days but reveals that the domain has no more sites.
8. **Undiscovered lairs** still raise the shown threat level, silently. The "+n from lairs" note only appears once the lair is found.
9. **Identify is not built.** It needs accessories or items, which don't exist yet. Lone experts train skills and sell knowledge only.

## Out of scope

- **Rumours as a discovery source:** Plan 4 taverns call `discoverPoi`, so the hook exists.
- **The good word** (design §8: party standing separate from faction threat), and all faction or kingdom reputation. It doesn't fit until reputation exists.
- **New lairs appearing over time,** threat growth, grip and other world-simulation ticks.
- **The real dungeon system:** alarm level, rooms and linear combat. POI dungeons are stage chains for now.
- **Item identification** and accessories.
- Multi-leg route planning, hired horses and magical travel.
- **Localising the engine-made text:** the journal and effect chips stay in English.
- Joining POIs to the midpoints of existing routes, and domain borders drawn as lines.
