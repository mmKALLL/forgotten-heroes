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
  - **What counts:** every roll of a skill in encounters counts, including each round of a multi-round skill challenge. Once a character reaches the threshold for a skill (inclusive: about 3 rolls a day or 10 a week, to tune), that roll and each later one add a Strain stack. Practice rolls don't count.
  - **Effect:** each stack is −1 to that skill and lowers the character's mood.
  - **Recovery:** one stack fades per day, slower in poor lodging and faster in good lodging (ties into inn quality and lifestyle).
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

- **Altaeus** is the fixed geography, taken from the world map. About 14 named regions and about 45 settlement markers form a graph: nodes are settlements and points of interest at the marker coordinates, and edges are routes with a distance (km, from the 100 km scale bar), a terrain type, and a danger level.
- **Political layer:** this is the randomised part.
  - Each region has a local threat or usurper (orcs, undead, a cult...) with its own strength.
  - Kingdoms own one or more regions.
  - A kingdom's defence is split across its regions, so growth thins its garrisons and lets threats rise.
- **New world:** re-rolls the political layer on top of the fixed geography: borders, ruling ancestries, threats, and settlement names and types.
- **Town names** come first from the town-map filenames in `~/dnd5e/town maps/` (including `__altaeus/`). Their `Name - description - alignment` pattern also hints at the settlement type, biome, wealth and alignment, and the map image becomes that town's banner. The generators from the prototype's `towns.ts` (English, French and Spanish style compounds) fill any remaining settlements.
  - **Which file a town goes in:** names that come from published settings or the real world (Waterdeep, Neverwinter, Phandalin, Barovia, Rivendell, Gondolin, Moria, Absalom, Emon, Athens and so on) go in `data/imported-private/towns.json`, which is gitignored. Original or generic names go in the committed `data/original/towns.json`. Without the private file, generated names take their place.
- **Starting location:** when creating a party, the player chooses between a small town in the calmest mainland region and a random settlement.
- **Layout:** the Altaeus map fills the centre column. Encounters replace it while active, the party is on the left and the journal on the right.
- **Region names** are read from the map, e.g. Nörrikk, Kard Krait, Olsari, Deadcliff Mesa, Tradal, and Ard Jurgenvren for the southern island.

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
  - **Cautious:** ⅔ speed and the most supplies per km. Pleasant and neutral encounters happen at the usual rate, but the party automatically avoids some of the hostile ones. Ambushes that still happen meet it on normal footing, or with Edge if it has covered its tracks. Situations therefore carry a disposition tag: `hostile`, `neutral` or `pleasant`. Covering tracks makes pursuers lose the trail.
  - **Steady:** normal speed.
  - **Brisk:** 1.25× speed and the fewest supplies per km. More encounters, ambushes meet the party Exposed, and it outruns slow pursuers.
  - **Forced march:** 1.5× speed, with a CON check each day against exhaustion. It also uses more supplies per km, so it's only worth it when saving time matters for another reason, such as a quest deadline, a pursuer or a market window. Quests and goals with time pressure should exist to make it meaningful.
  - **Hired horses** (Plan 4, from Animals and Mounts): 2× speed for gold, and mounts change carrying capacity.
  - **Magical travel** (later): near-instant and very expensive.
- **Pursuit:** follow-ups can be flagged as pursuit (thieves' friends, informant ambushes, wardens). When one comes due, the party's pace since it was queued decides whether it catches up:
  - Cautious with covered tracks loses it.
  - Brisk or faster usually outruns it.
  - Steady lets it catch up.
- **Timing:** Plan 3 builds Cautious, Steady, Brisk, Forced march and pursuit.
- **Encounter budget:** a short hop gets 0–2 encounters, a long journey 2–4. The chance scales with route danger, regional threat and visible wealth.
- **Quality rule:** every regular encounter must offer at least 2 options that trade off different resources (gold, goods, HP, time, reputation). Options can favour particular party builds; that asymmetry is welcome. The simulation test only flags options that are best for almost every party in almost every situation.
- **Wonders:** a separate kind of encounter. Rare, one click, flavour only, never a burden.

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
- **Rule hooks:** one declarative mechanism, such as `{ "on": "sellGoods", "category": "precious", "modify": {...} }`. It powers both accessory effects and per-party modifiers, which are composable, random, and allowed to bend the rules.

## 9. UI

- **Layout:**
  - Left: party portraits with HP, conditions and key modifiers.
  - Centre: a backdrop image (a battle map chosen by biome tag, or the town map), the narrative, and compact option cards with odds bars, plus a shared Outcomes panel for the hovered or focused option.
  - Right: the Altaeus map with the route and log.
  - Bottom: the goods bar by category, a capacity meter, and a visible-wealth indicator.
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
