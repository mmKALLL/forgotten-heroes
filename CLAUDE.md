# Forgotten Heroes

A gritty, magical D&D 5e–flavoured travel-and-trade game: out-of-dungeon adventurer life, a living world, few but meaningful decisions with visible odds. Single player, browser, React + TypeScript.

- Design: [docs/plans/2026-11-12-rebuild-design.md](docs/plans/2026-11-12-rebuild-design.md). This is the source of truth. Update it when a decision changes.
- Implementation plans: `docs/plans/*-plan-*.md`, executed task by task.
- Original vision: `docs/design-doc.txt`, `docs/solo-dm-notes.txt`. These are the user's; never edit them.

## Status

- Rebuild in progress on branch `rebuild`. It is merged to `main` once it has taken shape.
- The Svelte prototype is preserved at tag `v0.1.0-svelte-final`. Read old code with `git show v0.1.0-svelte-final:<path>`.

## Commands (pnpm)

- `pnpm dev`: run the game
- `pnpm test`: all tests (engine, content validation, UI)
- `pnpm typecheck`, `pnpm build`
- `pnpm format`: format the codebase with Prettier (`pnpm format:check` only checks). `docs/` and generated files are ignored (see `.prettierignore`)
- `pnpm schemas`: regenerate `data/_schema/` after changing `src/schema/` (a test fails if stale)
- `pnpm sync-assets`: copy the assets listed in `assets.manifest.txt` from `~/dnd5e`

## Architecture rules

- **The engine is pure.** `src/engine/` must not import React or the DOM, and must not call `Math.random()` or `Date.now()`.
  - Randomness comes from the RNG stored in `GameState` (use `withRng`).
  - Shape: `step(state, action) → state`, with no mutation of inputs.
- **`GameState` is plain serialisable JSON.** It is validated with zod on load.
- **No functions in data.** Conditions, checks, effects and rule hooks are small typed objects that the engine interprets. This keeps odds computable and content editable.
- **The UI only renders state** and dispatches actions. Game rules belong in the engine, never in components.
- **Schemas live in `src/schema/`** as zod schemas. Constants are named `FooSchema`, inferred types `Foo`.

## Content rules

- **JSON only, never YAML** (the user prefers JSON).
- **Folder layout.** All content lives under `data/<source>/` and each file is an envelope: `{ "$schema", "kind", "source", "notes"?, "entries": [...] }`.
  - `source` must match the folder.
  - Ids are kebab-case and unique across all sources.
- **Sources:**
  - `original/`: the user's own design. Don't change its substance unless asked. Note any additions in the file's `notes`.
  - `imported/`: open-licensed only (SRD 5.1/5.2, CC-BY). Committed.
  - `imported-private/`: material from copyrighted books and PDFs, for personal play. Gitignored. Quoting the source verbatim is fine here, including descriptive prose and read-aloud text, and is preferred when it is good. Never commit copyrighted text anywhere else.
  - `procedural/`: parts tables that runtime combinators assemble.
  - `claude/`: everything Claude writes goes here, never into `original/`.
- **Skills** live in `data/original/skills.json` (default abilities are editable there; new skill ids must also be added to `src/schema/types.ts`).
- **Encounters** live in `situations.json` files in any source, plus `archetypes`, `situationTemplates`, `partsTables` and `creatures`. Site situations (`site: true`, played only at a point of interest) live in `poi-situations.json`.
- **World geography** is `regions`, `settlements` and `routes` (`data/claude/`), plus `landSpots` (`data/claude/land-spots.json`, the land points territory and POIs are placed on) and `poiTypes` (`data/procedural/poi-types.json`, the weighted table of points of interest). `pnpm test` checks every situation for playability and the quality rules. The Encounter Deck (developer tools, under the journal) plays any situation and shows a ⚠ count for broken ones.
- **World** data lives in `data/claude/` (`regions` (the lands), `settlements`, `routes`, `threats`, and `landSpots` in `land-spots.json`), `data/original/towns.json` (generated: run `pnpm tsx scripts/port/port-town-maps.ts`, don't hand-edit) and `data/original/place-names.json`. `pnpm test` checks the route graph, the land spots and the POI types (`worldIssues`).
  - `scripts/map/*.py` read the map image to propose markers and routes, and `scripts/map/sample_land_spots.py` samples the land-spot grid. Run them with `~/anaconda3/bin/python3` (Pillow, numpy, scipy). Their output is hand-checked.
  - Domain territory is computed from the land spots, never stored.
- **Points of interest** (design §6, "World data (Plan 3b)"):
  - `data/procedural/poi-types.json` (kind `poiTypes`) is the weighted type table: category, biomes, threats, hostility and threat, path danger, water, a names table and the type's situations. Site names are parts tables in `data/procedural/poi-names.json`.
  - A POI's situations are ordinary situations with `"site": true`, in `data/claude/poi-situations.json`. They are played only at a site and never drawn on the road.
  - The `discoverPoi`, `clearPoi` and `trainSkill` effects tie situations to the world.
  - `src/content/world.test.ts` keeps generated worlds in bounds: about 40–60 POIs, and 10–15% of domains Rampant (see `docs/notes/threat-levels.md`).
- **Localization** (design §9): English is the default; Japanese is optional and rough. UI strings are in `src/ui/i18n/` (`en.ts` defines the keys; `ja.ts` is partial and falls back to English). Content translations are `translations` files in `data/locales/<locale>/` that overlay text fields of entries by id and dotted path; loading validates ids and paths. Engine-made text (roll lines, effect chips, the journal) is still English; it should become structured messages later.
- **No AI generation at play time.** Content is written ahead of time and committed as editable data.
- `pnpm build` bundles `data/imported-private/` and the local images in `assets/` when present — never publish a build made with private content or local assets.

## Design principles to respect

- **Input randomness.** Show the acting character, the DC, the % chance and every outcome tier before the player commits.
- **Few hard choices beat many trivial ones.** Every regular encounter needs at least 2 options that trade off different resources. "Wonders" are rare, take one click, and are flavour only.
- **Advantage must be earned** (Edge/Exposed from earlier risk). There is no free 5e Help action.
- **Reasonable balance, not perfect balance.** Asymmetric, build-dependent options are welcome. Only flag clear outliers.
- **Streamlined resources:** 15 goods in 5 categories, tracked as quantities, never individual items.

## Assets

- `~/dnd5e` is about 170 GB. Copy single files or small subdirectories only, never whole trees.
- Every copied path is listed in `assets.manifest.txt`, relative to `~/dnd5e`. The whole `assets/` folder is gitignored.
- Paths whose names must stay out of git (the private town banners) go in the gitignored `assets.manifest.private.txt`, which `pnpm sync-assets` also reads when it exists.
- Town-map filenames follow `Name - description - alignment`. Parse them for town names and hints.
- Icons come from game-icons.net (CC BY 3.0, via `~/dnd5e/rpg-cards`).
- **Credits.** Add a row to `CREDITS.md` (gitignored, local) for every third-party asset or text copied into `assets/` or `data/`: author, licence, and whether it is committed. Authors are recorded on a good-guess basis: use filenames, watermarks and the manifest's source paths as clues, and mark uncertain entries "(guess)". Anything committed that requires attribution (e.g. CC BY icons) must also be credited in the public `README.md`.

## Working conventions

- **Testing:** test-driven with Vitest. Engine tests use `src/engine/test-fixtures.ts`, not the bundled data, so they don't break when the user hand-edits content. A separate test validates every data file.
- **Style:** Prettier config in `.prettierrc.cjs` (no semicolons, single quotes, width 100).
- **Git:** commit after each task. **Never push.** The user pushes branches and tags themselves.
