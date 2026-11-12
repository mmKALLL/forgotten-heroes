# Forgotten Heroes — Rebuild Design

Date: 2026-11-12 · Branch: `rebuild` · Supersedes the Svelte prototype (tag `v0.1.0-svelte-final`)

Source material: [design-doc.txt](../design-doc.txt), [solo-dm-notes.txt](../solo-dm-notes.txt).

## 1. Goals

A gritty, magical D&D 5e–flavoured travel-and-trade sim (Spice & Wolf / Frieren mood, Battle Brothers / Mount & Blade structure). Out-of-dungeon adventurer life: profit, travel, curious encounters, a living world. Click-and-choose play, text-forward, data-heavy screens are welcome.

Pillars:

- **Input randomness.** Odds, DCs and outcomes are shown before the player commits.
- **Few, meaningful decisions.** No grind of trivial encounters.
- **Surprise without runtime AI.** Content is authored ahead of time (by hand, imported, procedurally combined, or written by Claude Code), but the player can't predict what comes next.
- **Streamlined resources, deep strategy.** Few resource types, each with a distinct reason to matter.
- **Hand-tweakable.** All content is plain JSON, separated by provenance.
- **Reasonable balance, not perfect balance.** The goal is many viable playstyles, strategies and asymmetries for replay value, not game-theoretic optimality. Balancing tools flag only outliers that are clearly broken.

Target session: about 30 minutes, inside a persistent campaign (section 6).

## 2. Architecture

- **Stack:** Vite, React and strict TypeScript, using pnpm. Tests use Vitest.
- **Engine** (`src/engine/`) is pure TypeScript with no UI dependency, shaped as `step(state, action) → state`.
  - `GameState` is plain serialisable data and includes the RNG seed and cursor, so runs are reproducible and saving is a JSON dump to localStorage.
  - The engine exposes `availableActions(state)`, which returns each action with its precomputed odds and outcome previews.
- **UI** (`src/ui/`) renders `GameState` and `availableActions`, and dispatches actions. React holds the single state via `useReducer`; there is no state library.
- **No functions in data.** Conditions, checks, effects and rule hooks are small typed objects, such as `{ "check": "persuasion", "dc": 14 }`, `{ "effect": "gold", "amount": -5 }` and `{ "on": "natural1", "do": [...] }`, interpreted by the engine. This keeps odds computable, state serialisable, and content editable by hand or by Claude.

### Repository layout

```
src/engine/              pure TS: state, rng, checks, travel, market, encounters, world sim, hooks
src/ui/                  React components
src/schema/              zod schemas → TS types + generated JSON Schema (for editor autocompletion)
data/original/           human-authored: settlement types, services, names, items ported from the prototype
data/imported/           SRD 5.1/5.2-derived content (CC-BY-4.0) — committed
data/imported-private/   entries from copyrighted books/PDFs (d100 tables etc.) — GITIGNORED
data/procedural/         parts tables (JSON) + combinator code (TS) that assemble content at runtime
data/claude/             content authored by Claude Code
data/locales/<locale>/   content translations (e.g. ja/), overlaid on entries at render time
assets/                  GITIGNORED; copied from ~/dnd5e, preserving its directory structure
assets.manifest.txt      committed: dnd5e-relative paths of every copied file/subdirectory
scripts/sync-assets.ts   re-copies everything in the manifest (DND5E_DIR env var, default ~/dnd5e)
```

- **Data format:** content files are JSON, validated against zod schemas when loaded and in tests. Each data folder gets a generated `$schema` file, so VS Code autocompletes and flags errors while you hand-edit.
- **Provenance:** every content entry has `"source": "original" | "imported" | "imported-private" | "procedural" | "claude"`, shown as a badge in the UI.
- **Icons:** from game-icons.net, via `~/dnd5e/rpg-cards`. They are CC BY 3.0 and committed with credits.
- **Images** (town maps, battle maps, the Altaeus world map) are gitignored assets, copied individually or by subdirectory and listed in the manifest.

The old Svelte code is removed on this branch. The useful types and data are ported to `data/original/` and `src/schema/`.

## 3. Characters and party

- **Party size:** soft range of 2–6. The starting size is a setting; 2 is suggested. Camaraderie and upkeep get steeply harder past about 7, so a party of 8+ is possible only with heavy late-game investment.
- **Characters:** full 5e ability scores, skill proficiencies, HP, hit dice, exhaustion, and conditions.
- Skills are defined in `data/original/skills.json`. Intimidation defaults to STR. Encounter checks may pair a skill with a different ability, e.g. Intimidation (CHA) for a veiled threat (Plan 2).
- **Who acts:** every check auto-selects the best-suited member by their current effective modifier. The UI shows who acts and the odds, and the player may override the choice.
- **Edge and Exposed** replace 5e Help, which does not exist here.
  - Succeeding on a risky option grants Edge: advantage on the next check in the same encounter.
  - Some failures inflict Exposed: disadvantage on the next check.
  - Advantage must be earned through earlier risk.
  - **Odds bounds:** a normal roll always stays within 5–95%, because a natural 1 is a critical failure and a natural 20 a critical success. Edge and Exposed use standard 2d20 keep-highest or keep-lowest. A critical failure with Edge therefore needs both dice to show 1 (0.25%), and odds can reach 0.25–99.75%. This is intentional: the extreme odds are the reward, or the penalty, for a position reached through earlier risk or cost.
- **Inspiration:** a natural 20 on a non-combat check grants Inspiration, which can be spent for a reroll and similar uses.
- **Carrying capacity:** each member's contribution scales with STR, from about 0.8× at STR 8 to about 1.8× at STR 18 (2.25× at most). Pack animals and carts add more. Magical alternatives (floating disk, unseen porters, teleport circles) come later.
- **Endurance:** forced-march days before exhaustion scale with CON.
- **Strain (working name):** this discourages leaning on one specialist and rewards spreading work across the party.
  - **What counts:** every roll of a skill in encounters counts, including each round of a multi-round skill challenge. Once a character reaches the threshold for a skill (inclusive: about 3 rolls a day or 10 a week, to tune), that roll and each later one add a Strain stack. Practice rolls don't count. The thresholds are 3 uses in a day or 10 within seven days. Daily foraging and stowing away count too.
  - **Effect:** each stack is −1 to that skill and lowers the character's mood.
  - **Recovery:** each strained skill loses one stack per day (Plan 3), slower in poor lodging and faster in good lodging (Plan 4). A stack gained during a day survives that day's fade, so it always lasts until the next day's (foraging, stowing away and encounters alike).
  - **Visibility:** Strain shows in the actor preview, so the automatic actor choice rotates on its own.
  - **Timing:** encounters record skill uses from Plan 2. Strain itself comes with daily travel (Plan 3), and the lodging effects with towns (Plan 4).
- **Mood:** each character has their own mood on a 0–100 scale, with 50 as neutral.
  - It is driven by needs and temperament, in a simplified RimWorld style that starts small and grows later.
  - Mood sets **morale**, a few named tiers (e.g. Confident / Steady / Wavering / Breaking).
  - Morale affects travel speed, attack bonus and similar, roughly as in Battle Brothers but simplified.
- **Camaraderie:** a single party-wide value on a short scale (fewer than 10 steps) with named tiers. Relationships between individual members may come later.

## 4. Goods and economy

There are 15 goods in 5 categories. They are tracked as quantities, never as individual items.

| Category | Goods | Strategic role |
|---|---|---|
| Essentials | Food, Water, Fuel | Consumed daily. Water dominates in deserts, fuel in tundra and winter. Food spoils. |
| Consumables | Healing, Alchemicals, Arcana | Spent to unlock or boost encounter options |
| Equipment | Arms, Armour, Gear | Demand spikes with war and raids. Gear unlocks terrain options. |
| Materials | Timber, Stone, Metal | Heavy and cheap, but huge demand where regions are rebuilding |
| Precious | Gems, Relics, Luxuries | Light and valuable; they attract thieves. Relics are mostly found in dungeons and ruins. Luxuries covers spice, silk, wine and art. |

- **Local prices** come from supply and demand. Each settlement's supply and demand is driven by its type, its biome, its region's state, and recent events. Prices drift daily, and bulk selling depresses them.
- **Price book:** the player only knows prices they have observed or heard through rumours, and each entry shows its age. Trading on stale information is part of the game.
- **Visible wealth:** the value of precious goods carried raises the odds of thieves and tolls. Party size deters them.
- **Character gear:** one weapon, armour and accessory slot per character, each with quality tiers. Separate from trade goods.
- **Accessories:** mid- and high-tier accessories carry procedurally rolled **rule hooks** that change how the game plays (section 8).

## 5. Towns: the ledger screen

There are many establishment types (ported from the prototype's services), so towns can specialise. Whether a service exists depends on the settlement's size tier, which sets the base threshold, plus a wealth bonus. A very prosperous hamlet, say one full of wizards, can therefore have a university, a necromancer or a magic-item shop. The thresholds and the size of the wealth bonus need tuning. Everything is on one screen with no modal open and close:

1. **Market panel:** the 15 goods grouped by category, with columns for buy, sell, local supply and demand, the best shop, and the price-book comparison (*"31 gp in Avarus, 12 days ago"*).
2. **Services panel:** one row per establishment, grouped by function (Trade, Rest & Recovery, Hire & Contracts, Temple & Arcane, Underworld). Each row shows quality, specialty, your reputation there, and inline action buttons.
3. **People panel:** notable NPCs and your reputation with each.

The town map image is a banner and backdrop.

## 6. World and campaign structure

- **Altaeus** is the fixed geography, taken from the world map. 16 named lands and 53 settlement markers form a graph: nodes are settlements and points of interest at the marker coordinates, and edges are routes with a distance (km, from the 100 km scale bar), a terrain type, and a danger level.
- **Political layer:** this is the randomised part.
  - **Two scales:**
    - **Lands:** the 16 named map areas. They carry geography, biome and the roaming local threat or usurper (orcs, undead, a cult...) with its own strength.
    - **Domains:** the political unit, one per settlement with its surroundings (about 53).
  - **Kingdoms:** there are 8–12, each holding a handful of domains, with seats at the 14 capitals.
  - **Threat level is worked out per domain:** the land's threat strength minus that domain's garrison. A kingdom's defence is split across its domains, so growth thins its garrisons. Border domains of a sprawling kingdom become the weak spots where threats rise.
  - **Status:** built in Plan 3b (see "World data (Plan 3b)" below). Plan 3 had kingdoms over the 16 lands.
- **Points of interest:** procedurally generated places. Each one belongs to exactly one domain, so whoever rules that domain owns it.
  - **Placement:** anywhere within the domain's territory, which can be far from the settlement in travel terms. Territory is the land closest to each settlement, by route and travel distance. Candidate land spots are sampled off the map image once and stored in `data/claude/`.
  - **Threat:** a hostile point of interest (a lair, a camp or an active dungeon) adds to its domain's threat strength, and clearing it lowers it. So a domain's threat level, and its owner's grip, depends on what lurks in its lands.
  - **Types** come from a weighted table in `data/procedural/`:
    - **Dungeons and ruins:** a multi-stage encounter chain until the real dungeon system exists.
    - **Lone experts:** they train skills, identify things or sell knowledge, sometimes for a price or a favour.
    - **Lairs and camps:** the domain's threat made concrete. Clearing one lowers that domain's threat; a new one can appear later.
    - **Shrines, landmarks and wonders.**
    - **Quest sites.**
  - **Discovery:** points of interest start hidden. They are found through rumours (Plan 4 taverns), encounter clues, or by spending days exploring a domain (Survival or Perception). Once discovered, they appear on the map.
  - **Visiting:** a point of interest is a map node joined to its domain's settlement (and to nearby routes where sensible) by a path with real distance and terrain. Getting there can take anything from half a day to many days, with the normal pace, supply and encounter rules.
  - **Status:** built in Plan 3b, before Plan 4. Rumours from taverns arrive with Plan 4.
- **New world:** re-rolls the political layer on top of the fixed geography: borders, ruling ancestries, threats, and settlement names and types.
- **Town names** come first from the town-map filenames in `~/dnd5e/town maps/` (including `__altaeus/`). Their `Name - description - alignment` pattern also hints at the settlement type, biome, wealth and alignment, and the map image becomes that town's banner. The generators from the prototype's `towns.ts` (English, French and Spanish style compounds) fill any remaining settlements.
  - **Which file a town goes in:** names that come from published settings or the real world (Waterdeep, Neverwinter, Phandalin, Barovia, Rivendell, Gondolin, Moria, Absalom, Emon, Athens and so on) go in `data/imported-private/towns.json`, which is gitignored. Original or generic names go in the committed `data/original/towns.json`. Without the private file, generated names take their place.
- **Starting location:** when creating a party, the player chooses between a small town in the calmest mainland domain and a random settlement.
- **Layout:** the Altaeus map fills the centre column. Encounters replace it while active, the party is on the left and the journal on the right.
- **Region names** are read from the map, e.g. Nörrikk, Kard Krait, Olsari, Deadcliff Mesa, Tradal, and Ard Jurgenvren for the southern island.

### World data (Plan 3)

- **Geography** (`data/claude/`): 16 regions (name, biome, label position), 53 settlements (map-pixel position, region, island, capital marker, coastal) and 67 routes (km, terrain, danger 0–3). It was read off the map with `scripts/map/` (100 km = 484 px); land routes follow the dashed roads, and islands are reached by sea routes. The map image itself is never committed.
- **Town names** (`data/original/towns.json`) are generated from the town-map filenames by `scripts/port/port-town-maps.ts`; towns labelled on the Altaeus map are pinned to their marker. Place names for the rest come from the prototype's generators (`data/original/place-names.json`).
- **Political layer** (`state.world`; Plan 3, superseded by domains in Plan 3b below), rolled per world seed: 4–6 kingdoms grow outward from seed regions (preferring capital markers) until every region is owned; each region rolls a threat (`data/claude/threats.json`, weighted towards its biome) whose strength is set against the kingdom's garrison (its defence split across its regions) to give a threat level of 0–3 (Held, Stirring, Rising, Rampant). Target: 10–15% of regions Rampant across generated worlds, so a world has 1–2 real hot-spots; it is about 12% (a content test keeps it within 8–18%; see `docs/notes/threat-levels.md`). Each marker gets a settlement type, population, size tier, wealth and services (the prototype's d20 + wealth thresholds); named towns go where their hints fit.
- **Start:** "Small town, calm region" picks a settlement that is not a city or capital in the calmest mainland domain (since Plan 3b); "Random settlement" picks any mainland settlement (`startingSettlement`, `START_MODES`). Both are seeded by the world (salted, so the pick doesn't follow from the draws that rolled the world), so a world always starts in the same place for the same choice.

### World data (Plan 3b)

- **Land spots** (`data/claude/land-spots.json`, kind `landSpots`): a grid of 404 land points about 21 km (100 px) apart. They are sampled off the map image by `scripts/map/sample_land_spots.py`, which needs anaconda Python with Pillow, numpy and scipy. Each spot has a position and an island, and some have their own terrain. Otherwise a spot takes its land's biome.
- **Territory** (`src/engine/world/territory.ts`) is computed from content and memoised, never stored. Spots link within about 1.6 grid steps on the same island. Each spot belongs to the settlement nearest to it in off-road km (the straight line × 1.2). Two domains are adjacent when their spots touch or a route joins them.
- **State v4:** `world` is `{ seed, kingdoms, lands, domains, pois, settlements }`. A v3 save is re-rolled from its seed, so names may change. The party, gold and position are kept.
- **Kingdoms:** 8–12, seated at distinct capital markers. The smallest kingdom that can still grow claims a bordering domain, and a domain in a land it already holds is twice as likely. Each kingdom rolls a defence of 9–22 (`DEFENCE`). The defence is split over its domains with weight `1 / (1 + 0.5 × hops from the seat)` (`SEAT_FALLOFF`), so border domains are thin.
- **Threat level per domain** is the land's threat strength, plus the threat of its uncleared hostile POIs (undiscovered ones count too), minus the domain's garrison, clamped to 0–3. It is derived, never stored, so clearing a lair takes effect at once.
  - **Measured over 1,200 worlds:** Held 51%, Stirring 21%, Rising 15%, **Rampant 12.3%** (6–7 of 53 domains per world). It would be 7% without POIs.
  - **Seats versus borders:** a seat's median level is 0 and a border domain's median is 1.
  - `src/content/world.test.ts` holds the Rampant share to 10–15%. Details and knobs are in `docs/notes/threat-levels.md`.
- **Points of interest** (`src/engine/world/pois.ts`): 46–55 per world on seeds 1–5, of which about a quarter are hostile (7–15).
  - **Placement:** each domain draws `spots / 8` sites (`POI_SPOTS_EACH`), rounded at random, and at most 2. Each site goes on a free spot at least 8 km from its settlement and from other sites.
  - **Type:** drawn by weight from the 29 types in `data/procedural/poi-types.json` (kind `poiTypes`). A type weighs ×3 where its biomes match the spot's terrain, or its threats name the land's threat. A lair keyed to threats is only drawn where one of those threats holds the land (`lairFits`).
  - **Names** come from the parts tables in `data/procedural/poi-names.json`, with twelve or more names per type and no repeats while a table lasts.
- **The 29 types:**

  | Category | Count | What they are |
  |---|---|---|
  | Lairs | 10 | One or more for every threat. Each adds +1–2 threat, and a drake roost or giant steading +2. |
  | Dungeons | 3 | A haunted barrow and a kobold mine (hostile, +1 each) and an old ruin. They play as 3–5 stage chains to a vault. |
  | Lone experts | 5 | They train a skill for a price (`trainSkill`), sell what they know or heal. The herbwife's spring has water. |
  | Shrines | 3 | The saint's well has water. |
  | Landmarks | 3 | |
  | Wonders | 3 | |
  | Quest sites | 2 | Neutral placeholders with a clue and a hook for later quests. |

  Each type plays its `site` situations (`data/claude/poi-situations.json`): `site: true` situations are never drawn on the road.
- **Discovery:** POIs start hidden. There are two ways to find them:
  - **Clues:** the `discoverPoi` effect reveals the nearest undiscovered sites to the encounter's domain, or across its land, optionally of one category. Seven of Claude's road situations, and several site situations, leave a clue.
  - **Exploring a domain:** this takes 2 days (`EXPLORE_DAYS`). The better of Survival or Perception rolls against the domain terrain's forage DC + 2. A partial success finds one site after 3 days, a success finds one, and a critical success finds two. A failure finds nothing. A critical failure springs a hostile road situation that fits the place.
  - **An exhausted domain:** a successful search that finds nothing says "This area seems picked clean". A failed search says nothing, so whether anything is left stays hidden.
- **Visiting** (`src/engine/world/graph.ts`): a discovered POI is a map node.
  - **Paths:** a POI has a path to its own settlement, plus one to every other settlement on its island whose off-road km is within 1.25× of the first (`PATH_DETOUR`), so a site can be a waypoint between towns. A path's terrain is the spot's, and its danger is the type's `pathDanger`.
  - **Journeys:** travel, previews and the map read the graph, so paths use the normal pace, supply and encounter rules. A route's threat is the higher level of its two ends.
  - **At the site:** Visit (Enter for dungeons and lairs) plays one of the type's site situations. `clearPoi` clears the site, which removes its threat and disables visiting.
  - **Water and rest:** arriving refills the water only where the type has a spring or a well (`water: true`). Resting at a POI is camp-only, and there is nothing to buy or sell.
- **Not built yet:** identifying items (it needs accessories), new lairs appearing over time, joining POIs to the middle of existing routes, rumours as a discovery source (Plan 4), and the `wander` smoke policy exploring or visiting sites. The POI icons (game-icons names in `poiTypes`) are not synced into `assets/` yet, so the map draws an inline glyph per category.

### Persistent world with successive parties

- **Party wipes are permanent** (ironman), but the world continues.
- **Years pass between parties.** The next party starts 5–20 simulated years later.
- **The fallen party's legacy** shows up in the new run as rumours, graves, their gear in shops or in enemy hands, the businesses they owned, and their grudges. These are the *forgotten heroes*.
- **Fresh per-party modifiers:** each new party draws or picks modifiers, Slice & Dice style.

### Counterbalances, so the world doesn't drift too far from its setup

- **Decaying hero pressure.** Player actions push regional values (prosperity, threat strength, a kingdom's grip) as pressure that wears off over about a season. Only structural acts, such as founding, conquering or destroying, change things permanently.
- **Regional baselines.** Each region's terrain, culture and resources act as an attractor that prosperity and population drift back toward.
- **Grip.** Holding territory costs upkeep. Grip weakens with size, time, and the ruler's absence, and low grip spawns usurpers. This applies to a realm the player unites, too.
- **Time skips between parties** let all of the above act, so most of a party's impact fades while their legend remains.

## 7. Travel and encounters

- **Travel steps by day:** consume essentials (or make a check / gain exhaustion), possibly have an encounter, make camp and keep watch. Days without an encounter collapse into a single summary line.
- **Travel pace** is chosen per journey:
  - **Cautious:** ⅔ speed and the most supplies per km. Pleasant and neutral encounters happen at the usual rate, but the party automatically avoids some of the hostile ones. Ambushes that still happen meet it on normal footing, or with Edge if it has covered its tracks and isn't foraging. Situations therefore carry a disposition tag: `hostile`, `neutral` or `pleasant`. Covering tracks makes pursuers lose the trail.
  - **Steady:** normal speed.
  - **Brisk:** 1.25× speed and the fewest supplies per km. More of its encounters are hostile, ambushes meet the party Exposed, and it outruns slow pursuers.
  - **Forced march:** 1.5× speed, with a CON check each day against exhaustion. It also uses more supplies per km, so it's only worth it when saving time matters for another reason, such as a quest deadline, a pursuer or a market window. Quests and goals with time pressure should exist to make it meaningful.
  - **Hired horses** (Plan 4, from Animals and Mounts): 2× speed for gold, and mounts change carrying capacity.
  - **Magical travel** (later): near-instant and very expensive.
- **Pursuit:** follow-ups can be flagged as pursuit (thieves' friends, informant ambushes, wardens). When one comes due, the party's pace since it was queued decides whether it catches up:
  - Cautious with covered tracks loses it.
  - Brisk or faster usually outruns it.
  - Steady lets it catch up.
  - In numbers (tunable, `src/engine/travel/pursuit.ts`): any cautious day with covered tracks since it was queued loses it; otherwise the average speed (days resting in town or camp count as 0) of 1.2 or more outruns it, and it comes back after 2 more encounters, at most twice before it gives up. With no days to judge (queued the same day), covering tracks right now loses it, and anything else lets it catch up.
  - At sea the ship sets the pace: always steady, no covered tracks.
- **Timing:** Plan 3 builds Cautious, Steady, Brisk, Forced march and pursuit.
- **Pace is a commitment:** it is chosen at departure only and cannot be changed mid-journey.
- **Long journeys and water:**
  - **Foraging:** each travel day the best-suited member may roll Survival to find water or food. The DC depends on terrain: easy by forests and rivers, hard in desert and mountains. Foraging rolls count toward Strain, so rotating foragers matters. Foraging draws attention: on a journey that forages, more encounters are hostile, and covering tracks gives ambushes no Edge.
  - **More capacity:** extra waterskins can be bought in town. Barrels and pack animals come with Plan 4's goods.
  - **Warnings:** the road preview warns clearly when a route at the chosen pace exceeds the party's water or food.
- **Resting in town** costs lodging gold and includes meals. Carried supplies are untouched. Camping eats carried food.
- **Stranded without fare (desperate measures):**
  - **Stowaway:** a Stealth check. If caught, the party is fined, put to work (days lost and exhaustion) or ends up in a brawl.
  - **Sell supplies for coin.**
  - Proper ways to earn money arrive with Plan 4.
- **Encounter budget:** a short hop gets 0–2 encounters, a long journey 2–4, at most one a day. How many is the same on every road; route danger, regional threat, foraging, pace (and later visible wealth) change what kind: how many of them are hostile.
- **Quality rule:** every regular encounter must offer at least 2 options that trade off different resources (gold, goods, HP, time, reputation). Options can favour particular party builds; that asymmetry is welcome. The simulation test only flags options that are best for almost every party in almost every situation.
- **Wonders:** a separate kind of encounter. Rare, one click, flavour only, never a burden.

### Travel (Plan 3)

- The player picks a neighbouring settlement; journeys are one route long.
- **Speed** in km per day: plains 30, forest and hills 24, desert 21, marsh and jungle 18, mountains 15, sea 75 (with a passage of 2 gp per member per day). Land speed scales with pace: cautious ⅔, brisk 1.25×, forced march 1.5×; covering tracks adds a quarter more days. Pace numbers live in `src/engine/travel/pace.ts`, the rest in `routes.ts`, `supplies.ts` and `tuning.ts`.
- **Each day** the best-suited member forages first (Survival; DC plains and forest 10, jungle 11, hills 12, marsh 13, mountains 15, desert 18; −2 on a forced march). Then every member eats 1 food and drinks 1 water (2 in the desert; half as much again on a forced march). Whoever goes without makes a CON check (DC 10 without food, 15 without water) or gains a level of exhaustion; the march stops after such a day.
- **Water** capacity is 4 days per member, plus 2 per extra waterskin (2 gp each). Rations cost a flat 1 gp until the Plan 4 market. Supplies sell back at half price. Arriving anywhere refills the water.
- **How many encounters** is rolled once at departure: up to 2 days 0–2, 3–4 days 1–3, 5 or more 2–4, each slot beyond the minimum filling with a fixed 30% (`ENCOUNTER_SLOT_CHANCE`), whatever the road or pace. They fall on distinct days (at most one a day, so never more than the journey's days), stored in the journey. A pursuit that comes due takes that day's encounter rather than adding one. On average: about 0.5 on a short hop, 1.5 on a middling journey, 2.6 on a long one (it was 0.8, 1.9 and 3.2 before the fixed rate).
- **What kind** is decided on the day: each encounter is hostile with the hostile share, 10% + 10% per route danger + 10% per threat level of the domains at either end + 10% when foraging + 10% when brisk or forced, within 10–85% (`routes.ts`, `pace.ts`, `tuning.ts`); otherwise it is neutral or pleasant by the situations' weights. If nothing of that kind fits the place, any fitting situation is met. Cautious parties skip 40% of hostile encounters (those days pass quietly). Covering tracks gives ambushes Edge only on a journey that doesn't forage. Situations may name `biomes` and `regions`; untagged ones happen anywhere on land, and at sea only `sea` situations are drawn (`data/claude/` has four, one of them the stowaway brawl). A road where no situation can be drawn rolls, and previews, no encounters. At sea a due follow-up waits for land unless its situation fits the sea.
- **Rest:** a day in a settlement restores all HP and the water, at an inn (1 gp per member, meals included, carried food untouched) or on carried food when the party can't or won't pay; a day in camp eats carried food and restores a quarter of max HP. Either removes a level of exhaustion from everyone who ate and drank.
- **Stowaway:** on a sea route the party can't pay for, the best sneak rolls Stealth DC 13. Success slips aboard; a partial gets the party put to work (2 days lost, and a level of exhaustion for the one caught); a failure costs all its coin (or work, if it has none); a critical failure starts a brawl.
- **Road preview:** for every pace, the days, food and water needed against what is carried (with expected foraging), the forager, odds and what each tier finds, the encounter range ("2–4 encounters") and hostile share ("about 45% of them hostile") with what raises it (danger, threat, foraging, pace), hostile avoidance, ambush footing, and warnings (water or food running out, relying on foraging, forced-march exhaustion). Forced-march exhaustion compounds (each level is −2 to the next day's CON check), and a march with a 10% or greater chance of exhausting someone to death gets a severe warning. The stowaway preview shows what each tier leads to. The forage toggle says what foraging costs: the hostile share with and without it, and the lost Edge when covering tracks.
- **Inspiration:** a natural 20 when foraging or stowing away grants Inspiration, as on any non-combat check.

### Encounter composition (all JSON)

1. **Situations:** the core premise. They come from every provenance.
2. **Archetypes:** reusable option sets, for example:
   - *Hostile group:* fight, sneak, negotiate, bribe, flee.
   - *Someone in need:* trusting help (bigger reward, worse when betrayed), cautious help (smaller reward, protected), ignore, exploit, plus an optional Insight check. What a betrayal would do (the twist outcomes) is always shown, but how likely it is stays hidden until the party passes the Insight check. A failed Insight check keeps the chance hidden and also gives −2 to the party's next check in that encounter (they misread the situation).

   Archetypes make one-line imported d100 entries playable without writing options by hand.
3. **Parts tables:** actor (ancestry, occupation, attitude), motive, complication, stakes. These are filled in according to world state: regional threat, goods carried, low supplies, time of day.
4. **Follow-ups:** an outcome may queue a later encounter, which is the main source of surprise.
5. **Escalation (tug of war):** encounters should rarely end on a single roll. Partial successes, failures and twists move the encounter into a further stage instead of resolving it outright, and earlier choices set your footing (Edge, Normal or Exposed) for that stage.
   - *Someone in need:* the twist is drawn from a weighted twist table in `data/procedural/`, which can be extended. A situation may instead define its own bespoke twist. Each twist kind escalates into its own stage:
     - **Ambush:** a fight stage, described below.
     - **Theft:** they slip off with goods or gold, then a chase (Survival or Athletics).
     - **Lure:** they lead the party into a lair, hazard or toll gang, then a hazard stage.
     - **Contagion or curse:** the helper is afflicted, then treatment or cleansing (Medicine or Religion), or a later follow-up if ignored.
     - **Fugitive:** hunters or guards arrive, now or as a follow-up. The party can talk, hand them over or run, with reputation consequences.
     - **False claim:** they accuse the party, then a social stage with a crowd or the guards.
     - **Informant:** they sell the party's route and cargo, so a deadlier ambush follow-up waits on the road. Cautious help means they saw less.
     - **Predator bait:** their blood or wound draws beasts (SRD creatures), then a fight-or-flee stage.
     - **Fey bargain (changeling):** they take something intangible, such as Inspiration, a skill's edge or a memory, then a bargaining stage (Arcana or Persuasion) to win it back.
     - **Recruiter:** a cultist works on one party member. A Wisdom or Insight contest follows; on a failure that member has a penalty to their next checks until talked down (a mood hit once mood exists).
     - The target is about 10 kinds, weighted by region and threat where it makes sense. On the road, a kind whose `biomes`, `regions` or `threats` tags fit the route terrain, the region or the threat holding it is twice as likely (tunable).
     - The help choice sets the party's footing and exposure in every kind: trusting is worse, cautious is milder.
   - *When the twist is an ambush:* it escalates into an ambush stage (fight, flee, negotiate or bribe).
     - Trusting help: you start Exposed and take an opening hit.
     - Cautious help: you start on Normal footing with no opening hit.
     - A passed Insight read beforehand upgrades cautious help to Edge.
   - Apply the same thinking across other encounters wherever it fits.

### Resolution

- **Outcome tiers:** each option shows the acting member, skill, DC and the odds of every tier before the player commits.
  - **What's revealed:** the fail, partial and success outcomes are shown. Critical failure and critical success outcomes are deliberately not listed at all, because they are usually more extreme and the surprise is part of the fun. Their odds still show on the bar (as 1 and 20).
  - **Card layout:** cards stay compact, and clicking a card chooses it. Hovering or focusing an option shows its outcomes in one shared, fixed-size Outcomes panel below the cards.
- **Combat** is resolved as a graded check in slice 1. The linear-distance combat system comes in a later phase.

### Encounter format (Plan 2)

- **Situations** are small stage graphs. Each option is either a graded check (`{ skill, ability?, dc }`, with an outcome per tier) or a fixed choice (requirements and effects, no roll). An outcome may `goto` a stage or `stay`; otherwise the encounter ends. Missing critical tiers fall back to fail and success.
- **Effects** are declarative: gold, HP (actor, all or random), exhaustion, inspiration, days, position, next-check modifier (with an optional reason such as "misread", shown on the option cards), follow-up, reveal twist, and log. Goods arrive in Plan 4.
- **Position:** a check rolls with advantage from Edge or disadvantage from Exposed, then the position resets unless the outcome sets it again.
- **Twists** are rolled secretly at the start. Outcomes may carry a twist branch. The player always sees what the twist would be; Insight reveals its odds.
- **Twist table and escalation:** a situation's twist may set `"table": true` (optionally limited by `"kinds"`). When the encounter starts, a kind is drawn from the twist table (`data/procedural/twists.json`, kind `twists`) by weight, and its stages join the situation snapshot as `twist-<stage>`. A bespoke twist instead names its own `stage` and `opening`. In a twist branch, `goto: "@twist"` goes to the escalation stage, and the `openingHit` effect applies the kind's (or bespoke twist's) opening hit. Any effect may carry a condition, e.g. `"if": { "cond": "twistRevealed" }`. Someone-in-need footing: trusting help goes in Exposed with the opening hit; cautious help on Normal, or Edge if Insight revealed the odds. Previews keep the twist generic ("an opening hit", "it escalates") until the kind is known: a critical Insight read (`revealTwist` with `kind`) or the twist itself reveals it.
- **Archetypes** are option sets with a relative DC (`"dc+2"`) and a reward multiplier for gold. **Templates** are archetypes dressed with parts-table slots. **Slots** are filled at the start; `{actor}` names whoever rolled.
- **Follow-ups:** `after: N` means N other encounters happen first. Every encounter that starts (a random draw, a due follow-up, or "Play" in the Deck) moves the other queued follow-ups one closer. A due follow-up comes first in a random draw, whatever the source filter; one whose situation no longer exists is dropped. A new encounter can't start while one is in progress.
- **Saves** store a compiled snapshot of the active situation, so editing content never breaks a save.
- **High-stakes rolls** (slow, glowing dice) are flagged by content, or are close calls (25–75%) where an outcome costs HP.
- **Skill uses** from encounter checks are recorded for Strain (Plan 3).
- Every bundled situation is tested for playability (reachable stages, valid gotos, slots, archetypes, follow-ups) and the quality rules (at least 2 options per regular stage, at least one of them neither `once` nor gated by requirements so no stage is a dead end; wonders cost nothing).

## 8. Reputation, accessories and modifiers

- **Reputation tiers:** individuals (shopkeepers, notables), settlements, kingdoms, and threat factions.
- **What reputation does:** affects prices, service access, rumour quality, and special encounter options, and unlocks quest types.
- **Spending reputation:** call in a favour for a guaranteed success or a large bonus. Using one faction's favour in front of its rival costs reputation with the rival.
- **Reputation as a reward:** quest patrons can be asked to "put in a good word" instead of paying.
  - The good word raises the party's standing with the patron's people or faction, even far away. Example: a respected orc's word makes a hostile orc kingdom tolerate the party.
  - **The party's welcome is separate from how dangerous a faction is to everyone else.** Hostile encounters with that faction become rarer or turn into parley for the party, while the kingdom still threatens its neighbours. Threat levels, prices and wars are unaffected.
  - This makes reputation a currency the player can earn instead of gold.
- **Rule hooks:** one declarative mechanism, such as `{ "on": "sellGoods", "category": "precious", "modify": {...} }`. It powers both accessory effects and per-party modifiers, which are composable, random, and allowed to bend the rules.

## 9. UI

- **Layout:**
  - Left: party portraits with HP, conditions and key modifiers, and below them the Altaeus map with its routes, zoomed in and centred on the party and following it (a toggle shows the whole map).
  - Centre: the settlement (services, rest and supplies, roads out with the pace chooser and forecasts), the site, or the journey under way. While an encounter is open it takes the whole column: narrative, compact option cards with odds bars, and the shared Outcomes panel for the hovered or focused option. Each stage focuses its first option; the arrow keys move between the cards and Space or Enter chooses. A backdrop image (a battle map by biome, or the town map) may come later; the town map shows as the settlement's banner.
  - Right: the journal, and below it the developer tools (practice check, Encounter Deck), collapsed by default and remembered per viewer.
  - Bottom: the goods bar by category, a capacity meter, and a visible-wealth indicator.
  - **Narrow screens (≤ 900px):** the three columns stack into one: party, then the centre (settlement, site, journey or encounter), then the map, then the journal, so the actions come early.
- **The map** (Plan 3b):
  - **Roads** are coloured by danger (Safe, Watchful, Dangerous, Deadly) with a legend under the map. Sea crossings are dashed, and paths to discovered sites are drawn like roads.
  - **Settlements** are outlined in their kingdom's colour. Discovered points of interest show as a glyph per category (an icon once the game-icons are synced), dimmed once cleared.
  - **Kingdom overlay:** a "Kingdoms" toggle tints every land spot in its domain's kingdom colour and crowns the seats. The choice is remembered per viewer.
  - Settlements and sites are buttons. The arrow keys move between them.
  - **The party** is a large ring with a slowly pulsing halo (still under reduced motion), in fixed colours no other marker uses. On a journey it moves along the road by the share of km travelled, and the view follows it; the journey panel keeps a line like "Day 3 of about 5 · 64 of 112 km" instead of a progress bar.
- **The settlement panel** shows the land, domain and kingdom (with its ruling ancestry), and the domain's threat level, adding "+n from lairs" for the hostile sites the party has found. The roads out include paths to discovered sites, with a "site" badge, and a selected path describes the site at its end. **Explore the domain** previews the searcher, skill, DC, % chance, days and the non-critical tiers. The critical tiers, and whether anything is left to find, stay a surprise.
- **The site panel** (at a point of interest) shows the category and type, the owning domain and kingdom, what the site feeds ("Feeds the orc warband: +2 threat here"), whether it is cleared, and a spring or well if it has one.
  - **Actions:** Visit, or Enter for dungeons and lairs, which is disabled once the site is cleared. Make camp is the only rest, there is no trade, and the panel also offers Explore and the paths out with their previews.
- **Style:** the prototype only had the Vite default stylesheet, so the visual style is a fresh pass. Parchment and ink tones suit the Altaeus map.
- **Dice animation:** flat d20 outlines whose faces flicker, then settle in quick succession, in at most 1.5 s. Every roll draws the DC as a short line beside the dice, with the total marked once they settle. On high-stakes rolls the last die slows and glows while it rolls; once settled, only a natural 20 (gold) or natural 1 (red) stays highlighted. A click skips it, and reduced-motion is respected.
- **Encounter Deck** (dev panel): every encounter, filterable by source and playable on demand, for comparing which provenance feels most exciting.
- **Demand visualisation** on the world map is to be designed later.
- **Localization:** English is the main language; Japanese is an optional setting, switchable at any time from the top bar ("EN / 日本語", remembered per viewer). It is rough on purpose: UI widths are not adjusted, and anything untranslated falls back to English.
  - UI strings live in `src/ui/i18n/` dictionaries: `en.ts` defines the keys, other languages are partial.
  - Content is translated by overlay files of kind `translations` in `data/locales/<locale>/` (e.g. `data/locales/ja/skills.json`). Each entry names an entry id of the `target` kind and maps dotted paths (`stages.start.options.read.label`; array items by id or index) to text. Each file keeps a `source` for who wrote the translation. Loading checks every id and path; the UI overlays the strings at render time, so the engine and saves stay language-agnostic.
  - Engine-made text (roll lines, effect chips such as "−2 gp", unmet requirements, the journal) and slot values stay English for now. The encounter view swaps log lines by matching them against the English text they came from. TODO: the engine should emit structured messages (a key plus values) that the UI renders in either language.

## 10. Testing

- Every data file validates against its schema.
- Check odds match exact probabilities, including advantage and disadvantage.
- A seeded replay produces identical state.
- Simulation smoke test: about 1,000 automated journeys with a random-choice policy. It must not crash, and it reports death rate, profit distribution, and options that are best almost universally. These reports guide balancing; they are not pass/fail gates.

## 11. Scope

**Slice 1 (first playable):**
- The Altaeus graph with one generated political layer.
- Towns with the ledger screen.
- Party creation (2 members), travel, essentials consumption.
- The market and price book.
- Encounters from all provenances (situations, archetypes, parts, follow-ups), Edge and Exposed, and Inspiration.
- Basic reputation (individual and settlement).
- Dice animation, the Encounter Deck, save and load, and run end on a party wipe.

**Later:**
- World simulation ticks and the counterbalances.
- Successive parties and legacy.
- Accessories with hooks, and per-party modifiers.
- Kingdom- and faction-level reputation with favours.
- Dungeons (alarm level, rooms) and linear combat.
- Owned businesses and mercenary companies.
- Demand visualisation.

## 12. Open questions

- Exact goods weights, prices and spoilage rates (to be tuned through the simulation test).
- What reputation affects beyond the initial set.
- What triggers a world re-randomise (manual only, or offered after N parties).
