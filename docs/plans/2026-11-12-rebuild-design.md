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

- **Party size:** soft range of 2–6. The starting size is a setting; 2 is suggested. Camaraderie and upkeep get steeply harder past about 7, so a party of 8+ is possible only with heavy late-game investment. As built (Plan 5a), 6 living members is a hard cap (`PARTY_CAP`); "7+ at a steep camaraderie cost" comes later.
- **Characters:** full 5e ability scores, skill proficiencies, HP, hit dice, exhaustion, and conditions.
- Skills are defined in `data/original/skills.json`. Intimidation defaults to STR. Encounter checks may pair a skill with a different ability, e.g. Intimidation (CHA) for a veiled threat (Plan 2).
- **Who acts:** every check auto-selects the best-suited member by their current effective modifier. The UI shows who acts and the odds, and the player may override the choice.
- **Edge and Exposed** replace 5e Help, which does not exist here.
  - Succeeding on a risky option grants Edge: advantage on the next check in the same encounter.
  - Some failures inflict Exposed: disadvantage on the next check.
  - Advantage must be earned through earlier risk.
  - **Odds bounds:** a normal roll always stays within 5–95%, because a natural 1 is a critical failure and a natural 20 a critical success. Edge and Exposed use standard 2d20 keep-highest or keep-lowest. A critical failure with Edge therefore needs both dice to show 1 (0.25%), and odds can reach 0.25–99.75%. This is intentional: the extreme odds are the reward, or the penalty, for a position reached through earlier risk or cost.
- **Inspiration:** a natural 20 on a non-combat check grants Inspiration, which can be spent for a reroll and similar uses.
- **Carrying capacity** (Plan 4, in kilograms): a member carries 20 kg at STR 10, × (1 + 0.1 × (STR − 10)) within 0.5–2.25×, so 0.8× at STR 8 and 1.8× at STR 18. From exhaustion 3 a member carries half. Owned pack animals and carts, and hired mounts, add their own capacity (a cart only with the animal that pulls it). Food and water count: a day's food is 1 kg and a day's water 2 kg, so a member with the usual 5 days of food and 4 of water has about 7 kg left for cargo.
  - **Encumbered** (above capacity, up to 1.5×): ⅔ land speed and no forced march.
  - **The load is fixed at departure** (designer decision): the speed a journey sets out at holds for the whole road. Eating and drinking the load down, dropping goods or picking up loot on the way doesn't change it; the next departure weighs the party again.
  - **Overloaded** (above 1.5×): the party can't set out ("drop or sell N kg"), and the market refuses a purchase that would put it there. A ship carries the load, so sea passage ignores weight. Goods can be left behind anywhere ("Drop goods" in the goods bar), so loot never strands the party.
  - Magical alternatives (floating disk, unseen porters, teleport circles) come later.
- **Endurance:** forced-march days before exhaustion scale with CON.
- **Strain (working name):** this discourages leaning on one specialist and rewards spreading work across the party.
  - **What counts:** every roll of a skill in encounters counts, including each round of a multi-round skill challenge. Once a character reaches the threshold for a skill (inclusive: about 3 rolls a day or 10 a week, to tune), that roll and each later one add a Strain stack. Practice rolls don't count. The thresholds are 3 uses in a day or 10 within seven days. Daily foraging and stowing away count too.
  - **Effect:** each stack is −1 to that skill and lowers the character's mood.
  - **Recovery:** each strained skill loses one stack per day (Plan 3), or two after a night in a private room at a good inn (Plan 4). A stack gained during a day survives that day's fade, so it always lasts until the next day's (foraging, stowing away and encounters alike).
  - **Visibility:** Strain shows in the actor preview, so the automatic actor choice rotates on its own.
  - **Timing:** encounters record skill uses from Plan 2. Strain itself comes with daily travel (Plan 3), and the lodging effects with towns (Plan 4).
- **Mood:** each character has their own mood on a 0–100 scale, with 50 as neutral.
  - It is driven by needs and temperament, in a simplified RimWorld style that starts small and grows later.
  - Mood sets **morale**, a few named tiers (e.g. Confident / Steady / Wavering / Breaking).
  - Morale affects travel speed, attack bonus and similar, roughly as in Battle Brothers but simplified.
- **Camaraderie:** a single party-wide value with five named tiers (0–40 since Plan 6, so losses can scale with the party in whole steps). It is what a big party costs: setbacks hurt more the more members there are, and the gains are flat (designer, 2026-11-13). Relationships between individual members may come later.

### Recruiting, camaraderie and the start as built (Plans 5a and 6)

- **No wages** (Plan 6, designer 2026-11-13): consuming goods, camaraderie and mood are cost enough. A recruit pays a one-time **sign-on fee** and nothing after. A member is `hired` (signed on at a service) or a founder; only hired members can be dismissed (free) or desert. Saves from before v12 mark a member who drew a wage as hired and forgive any wages owed.
- **Recruits** (`town/recruits.ts`): the inn, the adventurers' guild and mercenaries hire out (`recruits` blocks in `data/claude/service-roles.json`). Nothing ticks: a service's offers are derived from (world seed, settlement, week, service), like a notice board, and refresh weekly. The inn has 0–1 level-1 recruits a week; the guild 1–3 of levels 1–3; mercenaries 1–2 fighters, rangers or paladins of levels 2–4.
  - **Rolled, not built** (Plan 6): a recruit rolls 3d6 for each ability. The two best rolls go to the class's key abilities (the two highest of its spread), except with `RECRUIT_OFF_CLASS` (15%), when all six fall anywhere; the rest are shuffled. HP follows from the rolled CON as for a founder. Founders keep their class spread with three random +1s, so a recruit is usually weaker than a founder.
  - **Old wounds:** one recruit in five (`OLD_WOUND_CHANCE`) has an old wound: one ability is 2 lower (`OLD_WOUND_PENALTY`, never below 3), stored as `oldWound` and shown in the offer and the member's sheet ("A badly set leg (−2 DEX)"). Founders have none.
  - **Levels:** the recruit is then levelled to a level drawn from its own seeded stream within the service's range and clamped to **the founders' highest level + 1** (wealth can buy a veteran, not skip the climb). Only founders set the cap, so an offer keeps its level and fee all week. Three in four share the settlement's ancestry (`RECRUIT_LOCAL_ANCESTRY`).
  - **Sign-on fee** (`signOnFee`): within the level's range in `RECRUIT_SIGNON` (20–60 gp at level 1, 40–100 at 2, 75–150 at 3, 140–200 at 4, 200–280 at 5, then about ×1.35 a level to level 20), placed by the six rolls' total against its mean of 63 (`RECRUIT_STAT_MEAN`; ±14.5, `RECRUIT_STAT_SPAN`, runs from the low end to the high). A wound multiplies that place by `OLD_WOUND_QUALITY` (0.3), so a wounded recruit sits near the low end. Better rolls never cost less. The service's `fee` multiplies it (1 everywhere today: the mercenaries' old cheap sign-on went with the wages).
  - **Starting gear:** some recruits bring a tier-1 accessory, worn, and priced in at ¾ of its shop price (`RECRUIT_GEAR_PRICE`): 15% at the inn (`RECRUIT_GEAR_CHANCE`), 25% at the guild and 35% with the mercenaries (the block's `gear`). It is drawn from its own keyed stream, so it never changes the recruit.
  - **Hiring** pays the fee; the recruit joins with 5 days of their own food (`STARTING_FOOD_DAYS`, as a founder brings), and is never offered again. The party holds at most **6 living members** (`PARTY_CAP`; the dead stay listed but don't count). Refused mid-encounter, away from the settlement, when full, or when the fee is more than the purse.
  - **Dismissing:** hired members only (alive or dead), for nothing; founders never. Their accessory stays in the party's gear.
- **Camaraderie** (`town/camaraderie.ts`) is 0–40, starting at 25 (`CAMARADERIE_START`), in tiers Fractured (0–9), Strained (10–19), Steady (20–29), Close (30–39) and Sworn (40). Saves from before v12 are multiplied by 5. Only these change it (each a constant):
  - **Losses that scale with the party** (`encounters/outcomes.ts` `setbackCamaraderie`; more people pin the blame on someone), each times the living members − 1, so a lone survivor loses nothing: a failed encounter check −1 (`CAMARADERIE_FAIL`: −1 for a pair, −5 for six), a critical failure −2 (`CAMARADERIE_CRIT_FAIL`), and choosing an option tagged `retreat` −2 (`CAMARADERIE_RETREAT`), on top of any failure. Wonders cost nothing. The cost is applied as a `camaraderie` effect, so it shows as a chip on every outcome it applies to before the roll ("−3 camaraderie"; the critical failure's stays hidden with the rest of that tier) and in the outcome line after.
  - **Flat losses:** −5 at the end of a day on which a living member went without food or water, once a day (`CAMARADERIE_HUNGER`); −10 for each member who dies (`CAMARADERIE_DEATH`), found after every step by comparing the dead before and after.
  - **Flat gains** (the same for any party, while their prices are per member, so a bigger party pays more for them): +5 for each contract completed (`CAMARADERIE_CONTRACT`); +5 for a night in a private room, once per arrival (`CAMARADERIE_BOND`); +3 for **Stand a round** at the inn (`CAMARADERIE_ROUND`, `ROUND_PRICE` 1 gp per living member, once per arrival; the inn's `round` action, previewed by `roundOption`).
  - the `camaraderie` encounter effect (content amounts are on the 0–40 scale: a quarrel or a shared hardship is about ±5).
  - Crossing into another tier is logged ("The party is strained: someone went without food or water."). Nothing else is stored: the journal carries the history.
- **`retreat` options** (Plan 6): an option's `tags` may include `retreat`, for fleeing or withdrawing from a fight already joined. Tagged in `data/claude/` and the twist table: the hostile-group archetype's Run, the dungeon and lair raids' mid-fight fall-backs and withdrawals, the delves' flights, the Crisis acts' mid-site exits, and a few road escapes. Declining at the door (a site's opening "Leave") is not fleeing and is untagged. `data/original/situations.json` is untouched: its pit-in-the-cave "Back away" (goblins stage) would be one.
- **Desertion:** camaraderie's only effect for now. While the party is Fractured, each living hired member deserts with 25% (`DESERT_CHANCE`, seeded) on every arrival in a settlement. Deserters take no gold or goods (a worn accessory stays in the party's gear). Founders never desert.
- **For the UI:** `camaraderieInfo(state)` gives the value, tier and label, the causes pulling it down now (food or water that won't last everyone a day, the risk of desertion), the desertion risk, and the rule itself for the tooltip (`desertChance`, `fracturedMax`, and this party's `failCost` and `fleeCost`), so the UI reads no constants.
- **A safe start** (Plan 6, the only safety net; designer 2026-11-13): a random start (`startingSettlement`) skips mainland settlements with no route below danger 3 (`START_UNSAFE_DANGER`), falling back to any mainland settlement when none has one. On today's map no settlement is entirely surrounded by danger-3 routes, so no world's start moved.

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
- **Visible wealth:** precious goods and a heavy purse raise the odds of thieves and tolls. Party size deters them.
- **Character gear:** one weapon, armour and accessory slot per character, each with quality tiers. Separate from trade goods.
  - **Accessories as built (Plan 5a, `gear/accessories.ts`):** one accessory slot per character; weapons and armour come later. Accessories are weightless, carried unworn in the party's `gear`, and saved as self-contained snapshots (name, tier, hooks, value), so editing the tables never breaks a save.
  - **Rolled from affix tables** (`data/procedural/accessories.json`, kind `accessoryParts`): a base by weight (ring, amulet, cloak, boots, charm, brooch, belt, gloves), then at tier 1 one affix (a prefix or a suffix: "Fox-eyed Ring", "Ring of the Long Road"), at tier 2 a tier-2 affix and an affix of the other part with another hook kind ("Tireless Ring of Warding"). An affix may be limited to some bases. Its value is the parts' sum: about 30–80 gp at tier 1, 120–250 gp at tier 2. Only tiers 1–2 ("low-end") exist; there is no identification step.
  - **Found and bought:** the `accessory` effect loots one (six lair and dungeon clearings; the drake's hoard gives tier 2). Magic Items offers 2–4 a week up to tier 2 and the finesmith 1–2 of tier 1, derived from (world seed, settlement, week, service) like the notice board; both buy the party's back at half value (`ACCESSORY_RESALE`).
  - **Wearing:** equipping swaps with what was worn; nothing changes mid-encounter. A `maxHp` hook raises **max HP only** on equip (the extra room fills by resting, so taking it off and on again never heals); on unequip max HP drops back and HP is capped at the new max, never below 1 for it, while a downed member (0 HP) stays at 0.

### Goods and markets as built (Plan 4)

All numbers below are in `src/engine/constants.ts` or the `data/claude/` files named (see `docs/notes/constants.md`). They were tuned against the economy simulation (`docs/notes/economy-report.md`).

- **Goods** (`data/claude/goods.json`: weight in kg, base price in gp, spoilage, market depth, and what each is for):

  | Good | kg | gp | | Good | kg | gp |
  |---|---|---|---|---|---|---|
  | Food (ration) | 1 | 0.5 | | Armour | 10 | 30 |
  | Water (a day's) | 2 | 0 | | Gear | 3 | 5 |
  | Fuel | 3 | 0.3 | | Timber | 20 | 2 |
  | Healing | 0.5 | 8 | | Stone | 25 | 2 |
  | Alchemicals | 0.5 | 20 | | Metal | 10 | 8 |
  | Arcana | 0.25 | 25 | | Gems | 0.05 | 50 |
  | Arms | 5 | 15 | | Relics | 1 | 60 |
  | | | | | Luxuries | 2 | 20 |

  - Food spoils 2% a day (deterministic: the fraction carries over, and losses are logged).
  - Water costs only weight. It is never traded, and refilling is free in every settlement. Waterskins are containers (2 gp each, 2 days of water), not one of the goods.
  - **Water refills automatically wherever it is free and doesn't encumber** (designer rule): there is never a manual "fill water" step. Provisioning only buys food and waterskins (and pours in the water a road needs, warning when that encumbers).
  - Consumables are spent by encounter options that need them (a gear line across the flooded ferry, healing kits, alchemist's fire, an arcana ward). Thieves and tolls take precious goods or gold, and dungeon vaults and lair clearings give relics and gems that must be carried home and sold where they are wanted.
  - Fuel has no use yet beyond trade; cold country will need it later.
- **Markets** (`economy/market.ts`). Nothing ticks: every price is derived from the world seed, the settlement, the good and the day, plus the party's own net trades there.
  - **Geographic supply** (designer decision, `economy/supply.ts`): goods have **producers**. `data/claude/producers.json` names, by land, coast, settlement type, size, wealth and the sites in the domain, which settlements make which goods, at an output level of 1–3 (summed over the rules that apply, at most 3). Common goods (food, fuel, timber, stone) have many producers; specialised goods (metal, gear, arms, armour, healing, alchemicals, arcana) come from fewer towns and cities; luxuries (silk, spice, art) only from the great harbours and the richer capitals (3–5 a world); relics barely anywhere (the antiquities dealers of the richest capitals, 2–4 a world): most come out of dungeons and ruins as loot.
    - A market's **supply** of a good is the best producer within reach by road or sea: its output less a level per 3 steady days (`SUPPLY_DAYS_PER_LEVEL`), never below −2 (`SUPPLY_MIN`, scarce: no producer near enough). Supply never changes once the world is rolled, so it is worked out once per world and content and kept (like territory).
  - **Demand** comes from local traits: `data/claude/market-rules.json` (19 rules on settlement type, land, coast, size, wealth, threat level and the inhabited sites nearby: a garrison wants arms and armour, raids want arms, armour and healing, a city wants building materials). Demand sums and clamps to −3..3.
  - **Price:** base × 1.25^(demand − supply) (`PRICE_STEP`), with demand − supply kept within ±3, so a price runs from about ½× to 2× its base between the extremes, before drift; typical differences are smaller.
  - **Shortage:** demand at least 3 levels over supply (`SHORTAGE_GAP`), i.e. wanted here and made nowhere near. A shortage is marked "!" in the market's supply/demand cell, towns with one post procurement contracts (§5), and rumours and couriers name a town's shortages and gluts (supply 3 levels over demand) along with its prices.
  - **Explained on hover:** the market table is unchanged (the supply/demand arrows are the main signal); hovering or focusing the arrows lists the few reasons behind the price: "Made in Ashmoor, 2d away: Herb-gatherers", "Wanted here: Garrison, Raids", a shortage, the party's own trades and the week's swing when they matter.
  - **Drift:** ±10% in slow waves, a new seeded value every 10 days, eased in between.
  - **Bulk pressure:** trading moves the price by a factor of e per `MARKET_DEPTH` units (6 in an outpost to 60 in a metropolis, × the good's depth), and the market recovers half of it every 10 days.
  - **Shops:** the services that trade a good (`data/claude/service-roles.json`; some only buy, e.g. relics), each with a derived quality of 1–5. Every settlement has market stalls for the essentials. The buy/sell spread is 24% in an outpost down to 10% in a metropolis, 3 points narrower per quality above 3, 2 points per standing tier above stranger, and never below 2%. Buying never costs less than selling at the same shop (a 1 gp good may buy and sell at 1 gp), so there is no arbitrage inside one town.
  - **Prices are whole gold, rounded up** (designer decision): every unit price shown or charged, buying and selling, is `ceil`ed to a whole gp and is at least 1 gp (water stays free). A bulk quote is the sum of its whole unit prices, each still moved by bulk pressure, so the preview is the charge. Food (0.5 gp base) and fuel (0.3) therefore cost 1 gp a unit. Heard prices, contract pay and animal resale are whole gold too; animal upkeep accrues in fractions and is charged a whole gp at a time.
  - Trading uses the best shop. A purchase buys as many as the gold and the weight allow, and a sale caps at what is carried. The journal reads "Sold 6 gems for 212 gp (35 → 31 gp each)".
- **The price book** (`economy/trade.ts`): arriving in a settlement, starting a game, and every trade record its whole market as seen today. Rumours and couriers add "heard" entries, which are dated back by the distance and slightly off. Entries older than 14 days show as stale.
- **Visible wealth** (`economy/wealth.ts`): precious goods at base price, plus half of any coin above 50 gp per member. Each 100 gp per member is a step (at most 4). Each step adds 5% to the hostile share on the road and makes situations tagged `thieves` or `toll` 50% likelier to be drawn. Thieves can also take an owned animal. Banks (later) will let a party avoid carrying coin.
- **Starting purse:** 10 gp (the designer's `STARTING_GOLD`) and 5 days of food per member.
- **Accessories:** mid- and high-tier accessories carry procedurally rolled **rule hooks** that change how the game plays (section 8).

## 5. Towns: the ledger screen

There are many establishment types (ported from the prototype's services), so towns can specialise. Whether a service exists depends on the settlement's size tier, which sets the base threshold, plus a wealth bonus. A very prosperous hamlet, say one full of wizards, can therefore have a university, a necromancer or a magic-item shop. The thresholds and the size of the wealth bonus need tuning. Everything is on one screen with no modal open and close:

1. **Market panel:** a table of the goods grouped by category, with the amount carried, buy, sell, local supply and demand as arrows, the best shop with its quality, and the price-book comparison (*"sells 31 gp in Avarus · 12 days ago"*, dimmed when stale, marked when heard). Buying and selling take an amount (1, 5, max) with a live quote, and a purchase that would overload the party is disabled with the reason, shown under the button (one the gold can't cover is only disabled, with no "gold for n" line: designer decision). Supply and demand sit in fixed slots either side of the "/", so it lines up down the column, with a dash for a level of 0; the Elsewhere price is marked ↑ or ↓ when it is higher or lower than the same price here (what that market pays against what this one pays, or asks against asks). The vertical category labels are small and letter-spaced. The party's gold and load (kg / capacity, Encumbered or Overloaded) head the market in large type. Water has no row (it is free and refills by itself, designer decision); waterskins are a row under Essentials with the water they hold. A contract's cargo is marked as cargo.
2. **Services panel:** compact tiles in four columns, grouped by function (Trade, Rest & Recovery, Hire & Contracts, Temple & Arcane, Underworld): name, quality, specialty, and one or two inline actions. Services the engine doesn't support yet say "coming later".
3. **People panel:** notable NPCs (title, name, role) and your reputation with each, always open under the services (it is compact). The settlement's own standing is in the header line.
4. **Talk and work** (after Explore and the roads out): listening for rumours in the style of Explore (who listens, skill, DC, chance, the round's cost, then its outcome lines), and the notice board, each offer with kind, title, urgent badge, pay, reputation and Take; destination, distance, the days left to its deadline ("6 days left") and the days at a steady pace; and its text, clamped to two lines with "more". Offers locked by standing say what they need. The service tiles that host them don't repeat them.
5. **Contracts** held are listed under the party, everywhere: days left (a countdown, not a day number), the text clamped to two lines, and at the destination the choice of the pay or a good word, each saying what it gives; abandoning takes a second click. The roads out badge a contract's destination and, for the chosen pace, show "Arrives day 18 · deadline day 17 ✗"; late paces are struck through.

The town map image is a banner and backdrop.

### The ledger as built (Plan 4)

- **One screen, no modals.** A one-line header (town · land · kingdom · threat · the party's standing here; a settlement is its own domain, so the domain isn't repeated), then two columns: the Market, the Services and the People on one side; Explore, the roads out with the pace chooser, and talk and work (rumours and the notice board) on the other. On narrow screens the zones stack in that order.
- **Services** (`town/services.ts`, roles in `data/claude/service-roles.json`):
  - **Lodging:** a common room at 1 gp per member a night (meals included; Strain fades a stack), or a private room at 3 gp at inns of quality 3 or better (Strain fades two). Without an inn, or without the coin, the party rests on its own food.
  - **Healer:** all HP back and a level of exhaustion off for each member who needs it, at 10 gp each, without spending a day.
  - **Temple:** a blessing (1 Inspiration) for 10 gp, once per arrival at each temple.
  - **Courier:** 5 gp buys one settlement's prices on the same island, heard, and a day older per 40 km between the towns.
  - **Animals** (`data/claude/animals.json`): donkey (5 gp, 45 kg), mule (8 gp, 90 kg), camel (50 gp, 150 kg, drinks little), draft horse (50 gp, 120 kg) and riding horse (75 gp), plus a cart (15 gp, 200 kg, needs a mule) and a wagon (35 gp, 400 kg, needs a draft horse). Owned animals cost a daily upkeep (0.1–0.5 gp, owed when the purse is empty), drink water on the road, pay their own sea fare, can be stolen, and sell back for half. Carts and wagons keep to roads, and horses and camels can't take the rougher paths to sites. Riding horses can also be **hired** (see §7). Pack animals and vehicles walk, so they hold riders to a walking pace (the slowest traveller, §7).
  - **Rumours** and the **notice board** live in the talk-and-work zone (below); the tiles that host them don't repeat them (a tile with nothing else to do shows its specialty).
  - A disabled service button says why under it (the engine's reason), not only in its tooltip. The courier's news picker lists only towns whose prices it would make fresher.
- **Rumours at the tavern** (`town/rumours.ts`): buy a round (1 gp per member) and the better of Insight and Persuasion rolls against DC 12, 1 easier per standing tier above stranger (the settlement's or the tavern keeper's, whichever is better). No day passes, once per arrival, and it counts toward Strain. A success brings two nearby towns' prices and a clue to an undiscovered site in this land, a critical success three, the clue, and a lead (a bonus offer on the board). A partial is idle gossip and old news (nothing about prices, sites or work), a failure nothing worth hearing. A critical failure is trouble (designer decision): seeded, either a pickpocket lifts 1d6 gp (as far as the purse goes) or a fight breaks out (a hostile situation tagged `tavern-trouble`, the tavern brawl; the pickpocket when there is none). Nothing heard is ever false: there are no false rumours. Heard prices are off by up to 10% and dated by the days from there.
- **Contracts** (`town/contracts.ts`, 28 templates in `data/claude/contracts.json`). Inns, churches and adventurers' guilds post a notice board, and some offers come only from a particular service (the guild, a temple, the university, a bookseller, a herbalist). Boards refresh weekly (1–4 offers by size). Nothing ticks: a board is derived from the world seed, the settlement and the week, and is fixed for the week (a bounty's site is chosen among those inhabited on the week's first day; one emptied since is shown but can't be taken).
  - **Kinds:** courier (light, precious goods handed over on acceptance), freight, procurement, escort (passengers eat and drink like members and add 10% to the hostile share), bounty (clear a lair, revealed on acceptance) and errand (visit a site). Three of the guild's offers need standing "known"; a locked offer says what it needs.
  - **Supply contracts split** (designer decision; the old "supply" run, whose patron paid 1.2× the goods' base price, is gone; old saves load it as a procurement):
    - **Freight:** the patron hands over heavy goods (timber, stone, grain, ironwork) that the board's town makes or has close by (supply 1+), for a destination where they are scarcer. The party needs the room (overload refuses it, as for a courier). Courier and freight goods are **cargo**, reserved for the contract: the market's ordinary sale (and its Max) leaves them out (the row's tooltip says how many are cargo), and failing or abandoning the contract costs their base value (as far as the gold goes, then standing) on top of the usual standing.
    - **Selling cargo** (designer decision): allowed, but never by accident. Only an explicit `sellCargo` (a confirmed "sell the cargo" button, whose preview says what it brings and costs) sells it, and it **fails the contract at once**: the patron is owed the cargo's base value (paid as far as the gold goes, the sale included) and the party loses 15 standing (`SOLD_CARGO_REP`, instead of 5), plus a point per 10 gp unpaid, with the patron and the board's town.
    - **Procurement:** posted only by a town with a **shortage** of one of the template's goods this week (§4), naming the nearest producer as the source. The party must find the goods (buy them elsewhere, or loot them) and bring them in: carrying them at the board doesn't count, they count on arriving there by the deadline. It pays the goods' base value plus the usual pay for the round trip to the source. No advance (designer).
  - **Pay:** 10 gp per steady day to the destination (for procurement, there and back to the source), × the template's pay, +10% per threat level there, ×1.5 when urgent, rounded up to whole gold.
  - **Deadlines:** the steady days × 1.25–1.6 plus a day's grace (encounters cost days). An urgent offer gets 0.75–0.9× the steady days, at least the forced-march days, so only a brisk pace or a forced march makes it.
  - At most 3 held. On completion the party takes the pay, or asks for **a good word** instead (§8). Failing or abandoning one costs 5 standing with the patron and their settlement.
  - **A void bounty:** when the site cycle empties a bounty's site (soldiers or an accident) before the party clears it and before the deadline, the bounty is **void**: dropped with a line in the journal, at no cost in standing.
  - The roads out badge a contract's destination and, for each pace, show "Arrives day 18 · deadline day 17 ✗".
- **Click-savers** (designer decisions):
  - **Provision for this road:** one button buys the food the chosen road and pace need without foraging ("Provision: 6 food · 3 gp"), within the gold and the weight, and pours in as much water as the road needs (never every spare skin). Provision is food only (designer decision): waterskins are bought by hand, and when the road needs more than the party's skins hold, the roads out say "The road needs 2 more waterskins" instead. When the road's water would leave the party encumbered, the roads out say so before the click and the journal after it. Travel and Provision use the pace shown for the road (a forced march remembered while encumbered becomes steady).
  - **Refilling by itself** (arriving in a settlement or at a well, resting in town or at a spring, setting out from a settlement or a well, and right after buying waterskins): every member's own skin is filled, and spare waterskins only as far as the party stays unencumbered. Setting out never makes the load heavier in kind (a party that poured water out to set out isn't loaded up again). Waterskins can't be bought when the water they hold would overload the party (`maxWaterskins`).
  - **Continue** walks on until something happens: an encounter, a supply warning, someone going short, or arrival.
  - **Travel from the map:** a reachable marker opens a popover with the days, encounters and hostile share, and a Travel button that uses the last pace, forage and hire choices.
  - **Auto-rest on arrival** (a setting, remembered per viewer): arriving hurt, exhausted or strained, the party rests a day, at an inn if it can pay.

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
    - **Lairs and camps:** the domain's threat made concrete. Clearing one lowers that domain's threat; something moves in again later (see "over time" below).
    - **Shrines, landmarks and wonders.**
    - **Quest sites.**
    - **Crisis sites** (Plan 5b): a reveal site and three act sites per world, placed only by the Crisis (§10b), never drawn.
  - **Discovery:** points of interest start hidden. They are found through rumours (Plan 4 taverns), encounter clues, or by spending days exploring a domain (Survival or Perception). Once discovered, they appear on the map.
  - **Visiting:** a point of interest is a map node joined to its domain's settlement (and to nearby routes where sensible) by a path with real distance and terrain. Getting there can take anything from half a day to many days, with the normal pace, supply and encounter rules.
  - **Over time** (designer decisions after the Plan 3b review; `src/engine/world/sites.ts`). Nothing ticks: every status is derived from the day, the world seed and what is stored on the POI.
    - **One visit per arrival:** a site can be visited (or entered) once each time the party arrives; leaving and coming back allows another (`GameState.visited`, cleared on arrival).
    - **Dungeons and lairs live in cycles.** Clearing one wins it once. After any clearing it lies empty `REINHABIT_DAYS` = 30 days. Then something moves in and holds it for `INHABITED_DAYS` = 120 ± `INHABITED_JITTER` = 20 days (seeded per site and per cycle), growing stronger: a level of power every `POWER_STEP_DAYS` = 40 days, up to `MAX_POWER` = 2. Each level adds `POWER_DC` = +1 to every check there, and from power 2 a hostile site adds 1 more threat (at most 3). At the end of its spell the realm or an accident clears it, its power resets, and the cycle repeats. About four in five are inhabited at any time; a new world's sites start at seeded points of their first cycle, so they start at mixed powers.
    - **Stored:** `clearedDay`, the day the party last cleared it (or null), and `category`, so the rules need no content. The threat level uses the derived status, so an empty lair feeds nothing.
    - **Shown:** the site panel says "Cleared N days ago", "Re-inhabited" or "Growing stronger: every check here is DC +N"; the map draws an empty site faded. When days pass, the journal carries word of the sites the party knows: one cleared by the realm's soldiers (or emptied by an accident), or one something has moved into again.
    - **Boons on a cooldown:** a boon (Inspiration, healing, exhaustion removed, gold found) at a shrine, well, landmark or other boon site is an option with `{ "req": "siteReady" }`. Choosing it spends the site's boon for `BOON_COOLDOWN_DAYS` = 30 days; until then the situation still plays, but the boon is greyed out with "the blessing here is spent; it returns in N days". A content test checks that every shrine and landmark boon has it.
    - **Experts are services** the party can come back to: paid training (once per character: `untrained`), paid healing and paid knowledge are always on offer, with no cooldown. Paid knowledge has `{ "req": "undiscovered", "scope", "category"? }`, so it is greyed out ("nothing left to learn of in this land") when there is nothing left to reveal; a content test checks that no site sells a clue without it. Their free rest (the herbwife's spring, the old huntress's fire) heals everyone a quarter of their max HP (`healFraction`, rounded up) and removes a level of exhaustion, on the site's boon cooldown (`siteReady`); a content test checks that every free heal at an expert site has it and no paid option does.
    - **Wonders are flavour only:** the lint allows no effects in a wonder but log lines.
    - **Time at a site is eaten through:** a `days` effect (a vigil, a night at the waystation) eats and drinks each day like any other day, so there is no healing without food. Camping at a site drinks as the spot's terrain asks (twice as much in the desert) and refills the waterskins at a spring or well.
  - **Status:** built in Plan 3b, before Plan 4. Rumours from taverns arrive with Plan 4.
- **New world:** re-rolls the political layer on top of the fixed geography: borders, ruling ancestries, threats, and settlement names and types.
- **Town names** come first from the town-map filenames in `~/dnd5e/town maps/` (including `__altaeus/`). Their `Name - description - alignment` pattern also hints at the settlement type, biome, wealth and alignment, and the map image becomes that town's banner. The generators from the prototype's `towns.ts` (English, French and Spanish style compounds) fill any remaining settlements.
  - **Which file a town goes in:** names that come from published settings or the real world (Waterdeep, Neverwinter, Phandalin, Barovia, Rivendell, Gondolin, Moria, Absalom, Emon, Athens and so on) go in `data/imported-private/towns.json`, which is gitignored. Original or generic names go in the committed `data/original/towns.json`. Without the private file, generated names take their place.
- **Starting location:** a new party always starts in a random mainland settlement (designer decision; "New party" only asks to confirm). The calm start remains an engine option for tests and tools.
- **Layout:** the Altaeus map fills the centre column. Encounters replace it while active, the party is on the left and the journal on the right.
- **Region names** are read from the map, e.g. Nörrikk, Kard Krait, Olsari, Deadcliff Mesa, Tradal, and Ard Jurgenvren for the southern island.

### World data (Plan 3)

- **Geography** (`data/claude/`): 16 regions (name, biome, label position), 53 settlements (map-pixel position, region, island, capital marker, coastal) and 67 routes (km, terrain, danger 0–3). It was read off the map with `scripts/map/` (100 km = 484 px); land routes follow the dashed roads, and islands are reached by sea routes. The map image itself is never committed.
- **Town names** (`data/original/towns.json`) are generated from the town-map filenames by `scripts/port/port-town-maps.ts`; towns labelled on the Altaeus map are pinned to their marker. Place names for the rest come from the prototype's generators (`data/original/place-names.json`).
- **Political layer** (`state.world`; Plan 3, superseded by domains in Plan 3b below), rolled per world seed: 4–6 kingdoms grow outward from seed regions (preferring capital markers) until every region is owned; each region rolls a threat (`data/claude/threats.json`, weighted towards its biome) whose strength is set against the kingdom's garrison (its defence split across its regions) to give a threat level of 0–3 (Held, Stirring, Rising, Rampant). Target: 10–15% of regions Rampant across generated worlds, so a world has 1–2 real hot-spots; it is about 12% (a content test keeps it within 8–18%; see `docs/notes/threat-levels.md`). Each marker gets a settlement type, population, size tier, wealth and services (the prototype's d20 + wealth thresholds); named towns go where their hints fit.
- **Start:** every new party starts with "random" (designer decision, Plan 4 UI pass); the "calm" mode, kept for tests, picks a settlement that is not a city or capital in the calmest mainland domain (since Plan 3b); "Random settlement" picks any mainland settlement (`startingSettlement`, `START_MODES`). Both are seeded by the world (salted, so the pick doesn't follow from the draws that rolled the world), so a world always starts in the same place for the same choice.

### World data (Plan 3b)

- **Land spots** (`data/claude/land-spots.json`, kind `landSpots`): a grid of 404 land points about 21 km (100 px) apart. They are sampled off the map image by `scripts/map/sample_land_spots.py`, which needs anaconda Python with Pillow, numpy and scipy. Each spot has a position and an island, and some have their own terrain. Otherwise a spot takes its land's biome.
- **Territory** (`src/engine/world/territory.ts`) is computed from content and memoised, never stored. Spots link within about 1.6 grid steps on the same island. Each spot belongs to the settlement nearest to it in off-road km (the straight line × 1.2). Two domains are adjacent when their spots touch or a route joins them.
- **State v4:** `world` is `{ seed, kingdoms, lands, domains, pois, settlements }`. A v3 save is re-rolled from its seed, so names may change. The party, gold and position are kept.
- **State v5** (the review fixes): each POI keeps its `category`, `clearedDay` replaces `cleared` (a v4 save's cleared sites count as cleared on its current day) and `boonDay` records its last boon; `GameState.visited` allows one visit per arrival.
- **Kingdoms:** 8–12, seated at distinct capital markers. The smallest kingdom that can still grow claims a bordering domain, and a domain in a land it already holds is twice as likely. Each kingdom rolls a defence of 9–22 (`DEFENCE`). The defence is split over its domains with weight `1 / (1 + 0.5 × hops from the seat)` (`SEAT_FALLOFF`), so border domains are thin.
- **Threat level per domain** is the land's threat strength, plus the threat of its inhabited hostile POIs on that day (undiscovered ones count too; an empty one adds nothing, a strong one 1 more), minus the domain's garrison, clamped to 0–3. It is derived, never stored, so clearing a lair takes effect at once.
  - **Measured over 1,200 worlds, with the sites' cycles:** Held 52%, Stirring 20–21%, Rising 15%, **Rampant 12.4–12.5%** on days 1, 60, 120, 365 and 1000 (6–7 of 53 domains per world). It would be 7% without POIs.
  - **Seats versus borders:** a seat's median level is 0 and a border domain's median is 1.
  - `src/content/world.test.ts` holds the Rampant share to 8–18% on days 1, 120 and 365 (the target stays 10–15%), with 2–12 Rampant domains in at least 80% of worlds. Details and knobs are in `docs/notes/threat-levels.md`.
  - **Later:** threats may weaken with distance across a realm instead of affecting all its domains equally.
- **Points of interest** (`src/engine/world/pois.ts`): 46–53 per world on seeds 1–5 (41–60 over 1,200 worlds, mean 49.5), of which about a quarter are hostile (7–15).
  - **Placement:** each domain draws `spots / 8` sites (`POI_SPOTS_EACH`), rounded at random, and at most 2. Each site goes on a free spot at least 8 km from its settlement (`POI_MIN_KM`) and 25 km from other sites (`POI_SPACING_KM`, more than one spot step, so sites never sit on neighbouring spots).
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
- **Crisis sites (Plan 5b):** 12 more types in `data/claude/crisis-sites.json` (a reveal site and three act sites for each of the three villains), with their names in `crisis-names.json` and their situations in `crisis-situations.json`. They have `weight: 0`, so they are never drawn; the Crisis adds them to `world.pois` when it is rolled (§10b). They are `quest` sites, never hostile, with a `pathDanger` of 1–2, and they don't cycle, feed threat or fill up again. **Every one has water** (an abandoned well, a spring or a cistern; an overnight design call in Plan 5b I2), because some lie 3–4 days off the road in the desert and a small party couldn't carry the water there and back.
- **Discovery:** POIs start hidden. There are two ways to find them:
  - **Clues:** the `discoverPoi` effect reveals the nearest undiscovered sites to the encounter's domain, or across its land, optionally of one category. Seven of Claude's road situations, and several site situations, leave a clue.
  - **Exploring a domain:** this takes 2 days (`EXPLORE_DAYS`). The better of Survival or Perception rolls against the domain terrain's forage DC + 2. A partial success finds one site after 3 days, a success finds one, and a critical success finds two. A failure finds nothing. A critical failure springs a hostile road situation that fits the place.
  - **An exhausted domain:** a successful search that finds nothing says "This area seems picked clean". A failed search says nothing, so whether anything is left stays hidden.
- **Visiting** (`src/engine/world/graph.ts`): a discovered POI is a map node.
  - **Paths:** a POI has a path to its own settlement, plus one to every other settlement on its island whose off-road km is within 1.25× of the first (`PATH_DETOUR`), so a site can be a waypoint between towns. A path's terrain is the spot's, and its danger is the type's `pathDanger`.
  - **Journeys:** travel, previews and the map read the graph, so paths use the normal pace, supply and encounter rules. A route's threat is the higher level of its two ends.
  - **At the site:** Visit (Enter for dungeons and lairs) plays one of the type's site situations, once per arrival. `clearPoi` clears a dungeon or lair, which empties it (no threat, no visiting) until something moves in again (see "Over time" in §6 above). A hostile site whose type names the land's threat "feeds" it; one that doesn't (the kobold mine) is "a danger of its own".
  - **Water and rest:** arriving refills the water only where the type has a spring or a well (`water: true`), and at every Crisis site. Resting at a POI is camp-only, drinks as the spot's terrain asks, refills at a spring or well, and there is nothing to buy or sell.
- **Not built yet:** identifying items (it needs accessories), new lairs appearing on new spots over time (existing ones do fill up again), joining POIs to the middle of existing routes, rumours as a discovery source (Plan 4), and the `wander` smoke policy exploring or visiting sites. The POI icons (game-icons names in `poiTypes`) are not synced into `assets/` yet, so the map draws an inline glyph per category.

### Persistent world with successive parties

- **Status (Plan 5b):** the party wipe ends the run for good, and the **Hall of the Fallen** records every run that ended (§9, §10b). Everything else in this section (years passing, the next party in the same world, its legacy and per-party modifiers) is still later.
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
- **Travel pace** is chosen per journey, among four (designer decision, Plan 4 fixes: Cautious is gone, pointless next to Stealthy): **Stealthy ½ · Steady · Brisk 1.25× · Forced 1.5×**. Situations carry a disposition tag (`hostile`, `neutral` or `pleasant`) for the paces that avoid or draw hostile ones.
  - **Stealthy:** ½ speed and the most supplies per km. The party covers its tracks, so pursuers lose the trail. Pleasant and neutral encounters happen at the usual rate, but it automatically avoids some of the hostile ones, and ambushes that still happen meet it with Edge unless it forages. (Designer decision, Plan 4: Stealthy replaced "cautious, covering tracks".)
  - **Steady:** normal speed.
  - **Brisk:** 1.25× speed and the fewest supplies per km. More of its encounters are hostile, ambushes meet the party Exposed, and it outruns slow pursuers.
  - **Forced march:** 1.5× speed, with a CON check each day against exhaustion. It also uses more supplies per km, so it's only worth it when saving time matters for another reason, such as a quest deadline, a pursuer or a market window. Quests and goals with time pressure should exist to make it meaningful.
  - **Horses** (Plan 4): when every member has a mount, land speed is ×2 (×1.25 in mountains, marsh and jungle), stacking with pace. **The party travels at its slowest traveller** (designer decision): riding speed applies only if every member rides and no pack animal or vehicle comes along; a mule, donkey, camel, draft horse, cart or wagon, or anyone on foot, sets a walking pace. Spare riding horses are led and slow no one. Road previews use the same rule. Riding horses can be **hired** at an Animals service for a journey to a settlement: one per member at 1 gp a day each, paid at departure for the expected days and returned on arrival. They can also be **bought** (75 gp, with daily upkeep, and they can be stolen); owned horses work anywhere a horse can go, but not on the rougher paths to sites. Mounts add their capacity (20 kg each).
  - **Magical travel** (later): near-instant and very expensive.
- **Pursuit:** follow-ups can be flagged as pursuit (thieves' friends, informant ambushes, wardens). When one comes due, the party's pace since it was queued decides whether it catches up:
  - Stealthy (covering tracks) loses it.
  - Brisk or faster usually outruns it.
  - Steady lets it catch up.
  - In numbers (tunable, `src/engine/travel/pursuit.ts`): any stealthy day since it was queued loses it; otherwise the average speed (days resting in town or camp count as 0) of 1.2 or more outruns it, and it comes back after 2 more encounters, at most twice before it gives up. With no days to judge (queued the same day), a stealthy pace right now loses it, and anything else lets it catch up.
  - At sea the ship sets the pace: always steady, no covered tracks.
- **Timing:** Plan 3 builds Cautious, Steady, Brisk, Forced march and pursuit; Plan 4 makes covering tracks the Stealthy pace, and its fixes remove Cautious (old saves load a cautious journey, and the days logged for pursuit, as stealthy).
- **Pace is a commitment:** it is chosen at departure only and cannot be changed mid-journey.
- **Hurrying always pays on a longer road** (designer rule): on land, where Steady takes 3 days or more, Brisk takes at least a day less than Steady and a forced march never longer than Brisk, after the speed, load and exhaustion maths (`HURRY_SAVES_FROM`, in the one journey-days function, so previews, deadlines and the journey agree).
- **Long journeys and water:**
  - **Foraging:** each travel day the best-suited member may roll Survival to find water or food. The DC depends on terrain: easy by forests and rivers, hard in desert and mountains. Foraging rolls count toward Strain, so rotating foragers matters. Foraging draws attention: on a journey that forages, more encounters are hostile, and a stealthy party loses its Edge against ambushes.
  - **More capacity:** extra waterskins can be bought in town, and pack animals and carts carry more (Plan 4, §5). Animals drink from the carried water too, in whole units a day (the herd's total rounded up: a camel's half unit still costs one).
  - **Water refills automatically wherever it is free and doesn't encumber** (see §4).
  - **Warnings:** the road preview warns clearly when a route at the chosen pace exceeds the party's water or food.
- **Resting in town** costs lodging gold and includes meals. Carried supplies are untouched. Camping eats carried food.
- **Stranded without fare (desperate measures):**
  - **Stowaway:** a Stealth check. If caught, the party is fined, put to work (days lost and exhaustion) or ends up in a brawl.
  - **Sell supplies for coin.**
  - Contracts from the notice boards (Plan 4, §5) are the proper way to earn money; trading pays once there is capital to trade with.
- **Encounter budget:** a short hop gets 0–2 encounters, a long journey 2–4, at most one a day. How many is the same on every road; route danger, regional threat, foraging, pace, visible wealth and escorted passengers change what kind: how many of them are hostile.
- **Quality rule:** every regular encounter must offer at least 2 options that trade off different resources (gold, goods, HP, time, reputation). Options can favour particular party builds; that asymmetry is welcome. The simulation test only flags options that are best for almost every party in almost every situation.
- **Wonders:** a separate kind of encounter. Rare, one click, flavour only (no rewards either: the lint allows only log lines), never a burden.

### Travel (Plan 3)

- The player picks a neighbouring settlement; journeys are one route long.
- **Speed** in km per day: plains 30, forest and hills 24, desert 21, marsh and jungle 18, mountains 15, sea 40 (the designer's choice; with a passage of 2 gp per member, per escorted passenger (they pay like members) and per animal, per day). Land speed scales with pace: stealthy ½, brisk 1.25×, forced march 1.5× (`PACE_SPEED`), then with mounts (×2, or ×1.25 in rough terrain, only when everyone rides and no pack animal or cart sets the pace), with the load (⅔ when encumbered) and with exhaustion (designer decision: 10% slower per level of the most exhausted member, never below 40%; `EXHAUSTION_SPEED_PENALTY`), all fixed at departure. All these numbers live in `src/engine/constants.ts` (see `docs/notes/constants.md`).
- **Each day** the best-suited member forages first (Survival; DC plains and forest 10, jungle 11, hills 12, marsh 13, mountains 15, desert 18; −2 on a forced march). Then every member eats 1 food and drinks 1 water (2 in the desert; half as much again on a forced march). Whoever goes without makes a CON check (DC 10 without food, 15 without water) or gains a level of exhaustion; the march stops after such a day.
- **Water** capacity is 4 days per member, plus 2 per extra waterskin (2 gp each, selling back for 1). Rations cost what the local market asks (base 0.5 gp). Arriving anywhere refills the water.
- **How many encounters** is rolled once at departure: up to 2 days 0–2, 3–4 days 1–3, 5 or more 2–4, each slot beyond the minimum filling with a fixed 30% (`ENCOUNTER_SLOT_CHANCE`), whatever the road or pace. They fall on distinct days (at most one a day, so never more than the journey's days), stored in the journey. A pursuit that comes due takes that day's encounter rather than adding one. On average: about 0.5 on a short hop, 1.5 on a middling journey, 2.6 on a long one (it was 0.8, 1.9 and 3.2 before the fixed rate).
- **What kind** is decided on the day: each encounter is hostile with the hostile share, 10% + 10% per route danger + 10% per threat level of the domains at either end + 10% when foraging + 10% when brisk or forced + 5% per step of visible wealth + 10% when escorting passengers, within 10–85% (`HOSTILE_*`, `PACE_HOSTILE_BONUS` and `FORAGE_HOSTILE_BONUS` in `src/engine/constants.ts`); otherwise it is neutral or pleasant by the situations' weights. If nothing of that kind fits the place, any fitting situation is met. Stealthy parties skip 50% of hostile encounters (`PACE_HOSTILE_AVOIDANCE`; those days pass quietly). Stealthy gives ambushes Edge only on a journey that doesn't forage. Situations may name `biomes` and `regions`; untagged ones happen anywhere on land, and at sea only `sea` situations are drawn (`data/claude/` has four, one of them the stowaway brawl). A road where no situation can be drawn rolls, and previews, no encounters. At sea a due follow-up waits for land unless its situation fits the sea.
- **Rest:** a day in a settlement restores all HP and the water, at an inn (a common room at 1 gp per member or a private room at 3 gp, meals included, carried food untouched; §5) or on carried food when the party can't or won't pay; a day in camp eats carried food and restores a quarter of max HP. Either removes a level of exhaustion from everyone who ate and drank.
- **Stowaway:** on a sea route the party can't pay for, the best sneak rolls Stealth DC 13. Success slips aboard; a partial gets the party put to work (2 days lost, and a level of exhaustion for the one caught; the crew feeds the party, and each day worked ends like any other with spoilage and animal upkeep: `endOfDay`); a failure costs all its coin (or work, if it has none); a critical failure starts a brawl.
- **Road preview:** for every pace, the days, food and water needed against what is carried (with expected foraging), the forager, odds and what each tier finds, the encounter range ("2–4 encounters") and the hostile share actually met, after the pace's avoidance, on one line with its parts ("2–4 encounters · 30% hostile (10% base, 20% road danger, 10% foraging, −25% stealthy)"), ambush footing (with "(foraging)" when foraging costs a stealthy party its Edge), and warnings (water or food running out, relying on foraging, forced-march exhaustion, and setting out exhausted: any member with exhaustion gets a `departingExhausted` warning naming them, the speed lost and the check penalty, severe when one more level would kill). Forced-march exhaustion compounds (each level is −2 to the next day's CON check), and a march with a 10% or greater chance of exhausting someone to death gets a severe warning. The stowaway preview shows what each tier leads to. Supplies read "Food: 10 / 11, +0.1 per day" (carried / needed, expected foraging per day) and "Water: 10 / 8 (max 8), +1.3 per day" (capacity shown when it matters).
- **The road preview in Plan 4** adds: a "Hire horses" toggle where hiring is possible (the days and cost for each pace, mounted); the load ("Encumbered: 46 of 40 kg", or "Too heavy to set out"); a path that the owned animals can't take ("No road for the cart."); visible wealth and escorted passengers among the hostile share's parts; the arrival day against each held contract's deadline; and the "Provision" button for the chosen pace.
- **Inspiration:** a natural 20 when foraging or stowing away grants Inspiration, as on any non-combat check.

### Encounter composition (all JSON)

1. **Situations:** the core premise. They come from every provenance.
2. **Archetypes:** reusable option sets, for example:
   - *Hostile group:* fight, sneak, negotiate, bribe, flee. A failed sneak or parley takes the other away too (designer decision: no free retry chain; fight, bribe and flee remain). This is a shared `once` group: `"once": "get-past"` on several options means choosing any of them uses up all of them on that stage.
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
- Every bundled situation is tested for playability (reachable stages, valid gotos, slots, archetypes, follow-ups) and the quality rules (at least 2 options per regular stage, at least one of them neither `once` nor gated by requirements so no stage is a dead end; wonders are flavour only).

## 8. Reputation, accessories and modifiers

- **Reputation tiers:** individuals (shopkeepers, notables), settlements, kingdoms, and threat factions.
- **What reputation does:** affects prices, service access, rumour quality, and special encounter options, and unlocks quest types.
- **Spending reputation:** call in a favour for a guaranteed success or a large bonus. Using one faction's favour in front of its rival costs reputation with the rival.
- **Reputation as a reward:** quest patrons can be asked to "put in a good word" instead of paying.
  - The good word raises the party's standing with the patron's people or faction, even far away. Example: a respected orc's word makes a hostile orc kingdom tolerate the party.
  - **The party's welcome is separate from how dangerous a faction is to everyone else.** Hostile encounters with that faction become rarer or turn into parley for the party, while the kingdom still threatens its neighbours. Threat levels, prices and wars are unaffected.
  - This makes reputation a currency the player can earn instead of gold.
- **As built (Plan 4, `town/reputation.ts`):** reputation covers notable people and settlements. Kingdom and faction tiers, favours and parley come later.
  - **Points and tiers:** whole points per settlement and per person, read as a standing: hated (−20 or less), disliked (−19 to −5), stranger (−4 to 4), known (5), liked (15), trusted (30) and honoured (50 or more). Nothing decays. The journal says when a tier changes ("Avarus knows your name now.").
  - **Notable people** are rolled with the world (1–5 per settlement by size, from `data/claude/person-roles.json`, each tied to a service that is there), with names from their ancestry and a title ("Mother Ada Stone"). They are listed, with their standing, in the town's People panel.
  - **Earned by:** trading (a point per 50 gp bought and sold in a settlement, at most 3 per arrival), contracts (the template's points with the patron and their settlement), encounter `reputation` effects (helping or wronging locals), and the good word.
  - **Lost by:** failing or abandoning a contract (5 with the patron and their settlement, and a point more per 10 gp of a lost cargo the party can't pay), and encounters that wrong locals.
  - **What standing does:** each tier above stranger narrows a market's spread by 2 points (below widens it), using the better of the settlement's and the shopkeeper's standing; it makes the rumour check 1 easier per tier; and some contracts need it (standing "known" for three of the guild's). Encounter options may require it (`standing`).
  - **A good word** is the alternative reward on any contract: instead of the gold, 3 points with every settlement of the patron's kingdom, plus the patron's own points.
- **Where encounter reputation lands (Plan 4):** a `reputation` effect or `standing` requirement refers to the encounter's settlement: the domain of the site or settlement it happens in; on a land road, the domain of the nearer end of the road; at sea, the port the party sailed from.
- **Rule hooks:** one declarative mechanism, such as `{ "on": "sellGoods", "category": "precious", "modify": {...} }`. It powers both accessory effects and per-party modifiers, which are composable, random, and allowed to bend the rules.
- **Rule hooks as built (Plan 5a, `gear/hooks.ts`, `RuleHookSchema`):** ten kinds, each a small object the engine reads where the rule is applied (accessories carry them now; per-party modifiers will reuse them). For the wearer: `skill` (+1–2 to that skill's checks, so it shows in every preview), `activity` (+1–3 when leading foraging, gathering, exploring, rumours or stowing away; it also counts when choosing the lead), `endurance` (+ to CON checks against hunger, thirst and forced marches), `carry` (+kg), `maxHp`, `strainFade` (one more Strain stack fades each day), `strainGrace` (the daily Strain threshold is one use higher) and `lucky` ("Once a day, rerolls a natural 1 on the wearer's encounter check": a kept natural 1 is rerolled and the new die stands; only encounter checks, not foraging, gathering or other town and travel checks; the option preview's odds include the reroll while it is unspent, enumerated exactly). The day each wearer last spent it is kept in `luckUsed`, pruned to today's entries whenever it is written. For the party, worn by any living member: `sellBonus` (selling that category pays the share more before whole-gold rounding, stacking, but never above the middle price, so buying and selling back never gains) and `ward` (the road's hostile share is lowered by the best ward; wards don't stack; the road preview's breakdown carries it as the `ward` part).

## 9. UI

- **Layout:**
  - Left: party portraits with HP, conditions and key modifiers, the contracts held (Plan 4), and below them the Altaeus map with its routes, zoomed in and centred on the party and following it (a toggle shows the whole map).
  - Centre: the settlement (the town ledger, §5: market, services, people, roads out with the pace chooser and forecasts, rumours and the notice board), the site, or the journey under way. While an encounter is open it takes the whole column: narrative, compact option cards with odds bars, and the shared Outcomes panel for the hovered or focused option (under the cards, with a minimum height; it grows to show every line rather than scrolling or clipping). Each stage focuses its first option; the arrow keys move between the cards and Space or Enter chooses. A backdrop image (a battle map by biome, or the town map) may come later; the town map shows as the settlement's banner.
  - Right: the journal, and below it the developer tools (practice check, Encounter Deck), collapsed by default and remembered per viewer.
  - Top: the day (with the danger mark and, during an act of the Crisis, the act mark: §10b), gold, supplies as "Food 5 (2d) · Water 1/8 (0d)" (carried, water's capacity, and the days each lasts), Inspiration, and the Saves menu.
  - Bottom: the goods bar by category (goods at 0 hidden, "—" for an empty category; a contract's cargo marked), a capacity meter ("34 / 40 kg", marked Encumbered or Overloaded), the visible-wealth diamonds under a short "Wealth" label (hover or focus explains them: each step adds about +5% hostile encounters and makes thieves and tolls likelier; precious goods and coin above about 50 gp per member count; and what the party's wealth adds now), and "Drop goods".
  - **Narrow screens (≤ 900px):** the three columns stack into one: party, then the centre (settlement, site, journey or encounter), then the map, then the journal, so the actions come early.
  - **Mobile target** (designer decision): a **Samsung Galaxy S26**, about 412 CSS px wide and tall (checked at 412 × 915). The main screens (town ledger, encounter, journey, map) fit that width with no sideways page scroll. Below 480px the gutters and panel padding tighten, and the market table fits by stacking each row's Buy and Sell buttons and hiding a Sell button with nothing to sell.
- **Hover-or-focus explanations** (`src/ui/Tip.tsx`): symbol-only indicators (quality pips, the wealth diamonds) explain themselves in a small popover on hover or keyboard focus, or a tap on a phone, not only in a native tooltip. A service's quality explains its current effects, which the engine reports (`qualityEffects`): each step narrows a shop's spread by `SPREAD_PER_QUALITY` (3 points, against an average quality-3 shop), and inns of `PRIVATE_ROOM_MIN_QUALITY` (3) or better have private rooms.
- **The map** (Plan 3b):
  - **Roads** are coloured by danger (Safe, Watchful, Dangerous, Deadly) with a legend under the map. Sea crossings are dashed, and paths to discovered sites are drawn like roads.
  - **Settlements** are outlined in their kingdom's colour. Discovered points of interest show as a glyph per category (an icon once the game-icons are synced), dimmed once cleared.
  - **Kingdom overlay:** a "Kingdoms" toggle tints every land spot in its domain's kingdom colour and crowns the seats. The choice is remembered per viewer.
  - Settlements and sites are buttons. The arrow keys move between them.
  - **Travel from the map** (Plan 4): selecting a marker one road away opens a small popover with the days, encounters and hostile share, any severe warning (a deadly march, water running out), and a Travel button that uses the last forage and hire choices at the pace shown for that road. Opened from the map it takes focus, Escape closes it, and focus returns to the marker.
  - **Zoom:** the default view is close in on the party (840 × 630 map px); the Kingdoms and zoom buttons above the map are small.
  - **The party** is a large ring with a slowly pulsing halo (still under reduced motion), in fixed colours no other marker uses. On a journey it moves along the road by the share of km travelled, and the view follows it; the journey panel keeps a line like "Day 3 of about 5 · 64 of 112 km" instead of a progress bar.
- **The settlement panel** shows the land and kingdom (with its ruling ancestry), and the domain's threat level, adding "+n from lairs" for the hostile sites the party has found. The roads out include paths to discovered sites, with a "site" badge, and a selected path describes the site at its end. A road's summary is "61 km · 3 days · hills": the road's danger is left to the hostile share's breakdown and the map's road colours. **Explore the domain** (above the roads out) previews the searcher, skill, DC, % chance, days and the non-critical tiers. The critical tiers, and whether anything is left to find, stay a surprise.
- **Outcome lines, not odds bars** (designer decision): town and travel checks (Explore, rumours, foraging, stowing away) show their outcomes as a vertical list, one line per non-critical tier with its d20 faces and chance ("12–19 · 40% · Finds 2 water"), always visible inline (no hover), and never a horizontal odds bar. Odds bars are for encounters only.
  - **Gathering is the compact exception** (Plan 5a review): to keep the ledger short, its tiers run on one line ("▮ 65% 6 fuel · ▮ 15% 3 fuel · ▮ 10% 2 fuel"), the chances always visible and the d20 faces on hover. A muted line under it previews the critical failure from the engine's `mishap` ("A natural 1 (5%) brings trouble: a hostile encounter.", or the lead's injury where no hostile situation fits).
- **Refused buttons stay reachable** (Plan 5a review, `src/ui/ReasonButton.tsx`): Hire, Buy and Sell in the recruits list and the accessory shop use `aria-disabled` rather than `disabled`, with the engine's reason inline and linked by `aria-describedby`; a click does nothing while refused. After a hire, purchase or sale, focus returns to the list's heading. A service tile with another action leaves out an empty "Recruits (0)" or "Accessories (0)" opener, so the inn's tile keeps its height.
- **The road preview** is a block with padding, one fact per row: "About 3 days on the road", "Food: 6 / 6, +0.1 per day", "Water: 6 / 6, +1.3 per day", then deadlines, encounters with the hostile share, footing and fare. The supply warnings sit below the Travel and Provision buttons, so the buttons don't move as warnings come and go.
- **The site panel** (at a point of interest) shows the category and type, the owning domain and kingdom, what the site feeds ("Feeds the orc warband: +2 threat here"), whether it is cleared, and a spring or well if it has one.
  - **Actions:** Visit, or Enter for dungeons and lairs, which is disabled once the site is cleared. Make camp is the only rest, there is no trade, and the panel also offers Explore and the paths out with their previews.
- **The Crisis on screen** (Plan 5b U2; the rules are in §10b). The UI renders the engine's `crisisInfo` and `crisisDeadlines`:
  - **The Crisis panel**, under the contracts. Before the plan is learned it is hidden, or one line once the reveal site is known ("Something stirs. The burned chapel may hold answers."). Then the villain's name and summary, and the three acts: a thwarted act with its day, the current act with where it is ("somewhere in Tradal" or the site), its clues ("clues 1 / 2 · weakness at 3", explained on hover) and its due day ("due day 104 · 37d left") or lateness ("Late 6d: DC +1 at the site · fails on day 134"), and later acts by name and goal. Once the Crisis ends, one line: won or lost, and the day.
  - **The top bar** shows a small "Act I · 37d" (or "Act I · 6d late") after the day while an act is under way, in the bad tone when it is pressing, with the act on hover or tap.
  - **Roads** to the current act's site carry an "act I" badge and give its due day in the preview ("Arrives day 98 · act I due day 104 ✓", "… 6d late, DC +1", or "act I fails on day 134 ✗"), and a pace that arrives after the due day says so.
  - **The site panel** of a Crisis site says which act it is, its lateness, and whether the weakness is known. **The map** draws known Crisis sites with a distinct ring (faded once quiet). An outcome whose days run past the act's last day carries a "too late: Act I fails" chip.
- **End screens** (Plan 5b U3, `EndDialog`): a `role="dialog"` that takes focus, from the engine's `runSummary`. Each shows once.
  - **Victory** (the Crisis won): the villain's victory text, then the plot as a timeline (each act thwarted on its day, failed, or not reached), the party (ancestry, class, level, who fell), the day, gold, XP, and sites found and cleared. **Keep playing** (Escape too) or **New party**.
  - **Game over** (the Crisis lost): the failed act's text and the same summary. **Keep playing with this party** or **New party**.
  - **Fallen** (a party wipe): "The party has fallen", the last 5 journal lines and the summary. **New party** or **Look back** (closes it for this session); a banner under the top bar then keeps "The party has fallen · New party". There is no Keep playing.
  - New party asks first: "Start a new party in a new world? This party and its world are left behind."
- **Save slots** (Plan 5b U1, `src/ui/saves.ts`): three slots in local storage. Slot 1 is the original single save's key, so an older save is slot 1 without moving. **Ironman:** the game auto-saves to its slot after every step, and there is no manual save, no copying between slots and no reload. The slot played last is remembered. The **Saves** menu lists each slot: the party (names and levels), the day, gold, where it is, the Crisis act under way ("Act I · 37d") and the run's ending (Crisis won, Crisis lost, Fallen), with Continue, New party here and Delete. New party here asks first unless the slot is empty or its party has fallen, and Delete always asks. A save that no longer loads is copied aside before a new game takes its slot. Every storage call is guarded, so blocked or full storage leaves the game playable, unsaved.
- **Hall of the Fallen** (Plan 5b U3, `src/ui/hall.ts`): the first time an ending shows, the engine's `runRecord` is written to local storage (`forgotten-heroes/hall/v1`, at most 50 runs, newest first). A run that ends again is updated in place (a party that lost the Crisis and later fell is recorded as fallen, with the Crisis lost). Records that no longer validate are skipped but kept. The Hall is listed under the slots in the Saves menu: each run's party (names, classes, levels, who fell), the day, the ending and the villain.
- **Style:** the prototype only had the Vite default stylesheet, so the visual style is a fresh pass. Parchment and ink tones suit the Altaeus map.
- **Dice animation:** flat d20 outlines whose faces flicker, then settle in quick succession, in at most 1.5 s. Every roll draws the DC as a short line beside the dice, with the total marked once they settle. On high-stakes rolls the last die slows and glows while it rolls; once settled, only a natural 20 (gold) or natural 1 (red) stays highlighted. A click skips it, and reduced-motion is respected.
- **Encounter Deck** (dev panel): every encounter, filterable by source and playable on demand, for comparing which provenance feels most exciting.
- **Demand visualisation** on the world map is to be designed later.
- **Localization:** English is the main language. **Japanese is no longer being extended** (designer decision): new strings need English only, and Japanese falls back to English for them; the existing Japanese stays. Japanese is an optional setting, switchable at any time from the top bar ("EN / 日本語", remembered per viewer). It is rough on purpose: UI widths are not adjusted, and anything untranslated falls back to English.
  - UI strings live in `src/ui/i18n/` dictionaries: `en.ts` defines the keys, other languages are partial.
  - Content is translated by overlay files of kind `translations` in `data/locales/<locale>/` (e.g. `data/locales/ja/skills.json`). Each entry names an entry id of the `target` kind and maps dotted paths (`stages.start.options.read.label`; array items by id or index) to text. Each file keeps a `source` for who wrote the translation. Loading checks every id and path; the UI overlays the strings at render time, so the engine and saves stay language-agnostic.
  - Contract titles and texts, person roles, service names and specialties, and the goods' uses have rough Japanese overlays; a contract's translated template is filled in the UI with the same names the engine uses.
  - Engine-made text (roll lines, effect chips such as "−2 gp", unmet requirements and disabled reasons, the journal) and slot values stay English for now. The encounter view swaps log lines by matching them against the English text they came from. TODO: the engine should emit structured messages (a key plus values) that the UI renders in either language.

## 10. Testing

- Every data file validates against its schema.
- Check odds match exact probabilities, including advantage and disadvantage.
- A seeded replay produces identical state.
- Simulation smoke test: about 1,000 automated journeys with a random-choice policy. It must not crash, and it reports death rate, profit distribution, and options that are best almost universally. These reports guide balancing; they are not pass/fail gates.
- **Economy simulation** (Plan 4, `src/content/economy.sim.test.ts`): a scripted trader (`src/engine/travel/trader.ts`) plays seeds 1–30 for 60 days under four policies (trader, contracts only, trade only, wander) and reports gold per day, going broke, deaths, where the money comes from, trade margins and price spreads. The guard tests (seeds 1–8, 30 days) have generous bounds and pin no tuning value. Run the full report with `ECONOMY_REPORT=/tmp/economy.md pnpm vitest run src/content/economy.sim.test.ts`.
- **Crisis simulation** (Plan 5b I1, `src/content/crisis.sim.test.ts`): a `crusader` policy (the trader, plus going to the reveal site, searching the act's land and playing the act sites; a sim policy, not a rule) and the trader play seeds 1–20 up to day 360. It reports how the plan was learned, each act's site found and thwarted with days to spare, the endings, levels and deaths, and the finale success by act (results in §12 and `docs/notes/crisis-report.md`). The guard test plays crusader seeds 1–3 for 120 days. Run the full report with `CRISIS_REPORT=/tmp/crisis.md pnpm vitest run src/content/crisis.sim.test.ts`.

## 10b. Campaign arc, pressure and progression (Plans 5a and 5b)

**Starting point:** the party starts poor (`STARTING_GOLD` 10): a pair of level-1 heroes who have just left their old lives.

**Reasons to hurry:**
- **Rising danger:** a world danger level rises about 10% every 50 days. It is independent of any scaling based on party level or wealth. Until combat exists it raises encounter DCs and damage; later it raises creature CR.
  - **As built (Plan 5a, `world/danger.ts`):** the danger share is `floor((day − 1) / 50) × 10%` (`DANGER_RAMP_DAYS`, `DANGER_RAMP_STEP`), capped at +100% (`DANGER_RAMP_MAX`, day 501): +10% from day 51, +20% from day 101. Nothing ticks; it follows from the day.
  - **What it does:** when an encounter starts, its snapshot (every stage, the twist table's joined stages and the twist's opening hit included) is hardened once (`harden`): each check's DC becomes `dc + round(dc × danger)` (DC 13 → 14 at +10%, 16 at +20%), and each wound (a negative `hp` effect) `−ceil(|amount| × (1 + danger))` (−4 → −5 at +20%). Healing, gold and goods are unchanged. A site's power (`POWER_DC` a level) goes through the same transform as a flat DC bonus, so the two stack (DC 13 at power 2 on day 101 → 18). Because the snapshot is hardened at the start, the DCs shown are the DCs rolled, and a save loaded on a later day doesn't change an open encounter. The encounter records its `danger` for display.
  - **Only encounters** (road, site, an exploring ambush, a rumour brawl, a follow-up): not foraging, exploring, gathering, rumours, the hostile share or gold losses.
  - **Shown quietly** (Track U): a small "⚠ +20%" mark after the day in the top bar, the day's tooltip, and a line in the encounter header. `dangerInfo(day)` gives the share, the percent, the day of the next rise (null at the cap) and a line for the day's tooltip ("The roads grow more dangerous: +20%", or "The roads are as they have always been").
- **The Crisis:** a villain's three-act plot, with roughly one act due every 100 days.
  - Rumours and clues lead the party to a specific location where they learn the plan.
  - Each act has a site or deed to thwart before its deadline. There is moderate leeway, with penalties for dawdling. As built, every act is a site; deeds without a site (deliver a warning, escort an heir) are left for later.
  - Stopping all three acts is the campaign's win.
  - Failing the Crisis shows a game-over screen, but the player may keep playing to enjoy the current party. No world consequences of the plot are needed for now.
  - **Content** (`data/claude/`): three villains in `villains.json` (kind `villains`: weight, threats, a names table, summary, omen, plan, a reveal site type, three acts with their site type, favoured biomes or `seat`, clue, thwarted and failed texts, and a victory text); their 12 site types in `crisis-sites.json` (§6); the reveal situations, the act situations and the road omens in `crisis-situations.json`; and their name tables in `crisis-names.json`. Each act situation is 3–4 stages ending in a finale check with modest base DCs (12–14), since the danger ramp already adds 20–60% by the time they are played; its approach checks pay no XP (`xp` 0), so a site that stays open until thwarted can't be farmed by leaving and coming back.
  - **The engine as built (Plan 5b, Track E, `src/engine/crisis/`).** Nothing ticks: the rolled plot is stored once (`GameState.crisis`: the villain, its rolled name, the start day, the reveal site, each act's site and due day), plus only what the party did (the day it learned the plan, clues per act, the day each act was thwarted, and whether the end screen was dismissed). Phases, lateness and failure are derived from the day (`crisisStatus`).
    - **Rolling (`generate.ts`):** one Crisis per world, from its own salted stream (`CRISIS_SALT`), so the rest of the world is unchanged. The villain is drawn by weight, ×3 (`CRISIS_THREAT_FAVOUR`) when one of its threats holds a land; its name is its names table's roll plus its title ("Lady Maud Tressel, the Pretender's Hand"). Four new hidden POIs (`poi-<n>`, category quest, threat 0) go on the start's island, each on a free spot: the reveal site 2–8 steady days from the start (`CRISIS_REVEAL_DAYS`) and act I 4–12 (`CRISIS_ACT1_DAYS`, outside the start's own domain), by road and path; acts II and III at least 3 domain hops (`CRISIS_ACT_SPREAD`) from the act before; a `seat` act under a kingdom seat other than the start. A domain weighs ×3 where the villain's threat holds its land or the act's biomes match. Without a spot in range, the nearest domain that has one. Act n is due on `start + 100n ± 10` (`CRISIS_ACT_DAYS`, `CRISIS_DUE_JITTER`). Designer call: the near sites are placed by days, not hops as first planned, because on Altaeus two domain hops are 7–19 steady days.
    - **New games and old saves:** `newGame` rolls it on day 1 from the start; the v10 → v11 migration rolls it from the save's current day and from where the party is (on the road, the journey's start), so an old run gets the full time for act I.
    - **Deadlines (`status.ts`):** the current act is the first not thwarted. From its due day it is late: every check at its site is DC +1 per 10 days late or part of them (`CRISIS_LATE_STEP_DAYS`), on top of the danger ramp. It fails on due + 31 (`CRISIS_LEEWAY_DAYS` 30 of leeway), and with it the Crisis, even if the plan was never learned. Thwarting an act early or late never moves the next one's due day. The journal warns 14d before (`CRISIS_WARN_DAYS`) and on the due day (once the plan is known), and on failing logs the act's `failed` text (or "Far away, something you never learned of is finished.") and "The Crisis is lost."
    - **Too late** (`crisisFailsDuring`, Plan 5b review): a visit to the current act's site whose outcome passes days (a `days` effect) up to the act's fail day before any `thwartAct` among its effects ends there. The outcome carries a "too late: Act I fails" chip in the preview and in its line, the journal says "Too late: Act I, The Opened Graves, has failed. There is nothing left to stop here.", and the encounter closes. The preview and the outcome ask the same function, so the chip is shown before the choice is made.
    - **Learning the plan and clues (`progress.ts`):** `learnPlan` works once, in a situation played at the reveal site: the plan is logged and act I's land becomes known (its first clue). `crisisClue` before the plan reveals the reveal site; during an act it adds to that act's clues (at most 3): at 2 (`CRISIS_SITE_CLUES`) the site is revealed, at 3 (`CRISIS_WEAKNESS_CLUES`) the villain's weakness is known and the party starts the site with the Edge. `thwartAct`, only at the current act's site, keeps the day, pays `XP_THWART` (300) × the act's number, logs its text and makes the next act's land known; after act III the villain's victory text, and the Crisis is won.
    - **Crisis sites** are never found by exploring, rumours, road clues or contracts (no errand names them), with one exception: once the current act has a clue, exploring its site's domain can find it as a normal search. A visit refuses as "quiet" at the reveal site once the plan is known, a thwarted or future act's site, and every site once the Crisis is decided.
    - **Word of it (`clues.ts`):** a rumour success, while the plan is unknown and the reveal site hidden, hears the villain's omen and the reveal site instead of an ordinary site; during an act, in the act's land it gives a clue (+1, +2 on a critical success, `CRISIS_RUMOUR_CLUES`), elsewhere a line pointing the way ("Talk of Morvaine's doings comes from the north-east, out of Tradal."). The preview says which. From day 15 (`CRISIS_SUMMONS_DAY`), arriving in a settlement while the plan is unknown and the reveal site hidden brings the summons: a notable person there (elder, reeve, mayor, priest, captain of the watch, sage or innkeeper, in that order), or else a frightened traveller, tells the omen and of the reveal site. Road omens (situations naming villains) are drawn only while their villain's Crisis is undecided, ×3 (`CRISIS_OMEN_FAVOUR`) on a road touching the current act's land.
    - **Run end (`ending.ts`):** the party has fallen when no member is alive (all at exhaustion 6; a downed member is alive). The step that kills the last of them logs "The last of the party falls. The road goes on without them.", and from then on every action leaves the state unchanged. `runEnding` is fallen first, then won or lost. `runSummary` and `runRecord` (for the Hall, keyed by the game seed so a run is updated in place) are pure; `acknowledgeEnd` ("Keep playing") dismisses the won or lost screen for good.
  - **The ending, as built (Plan 5b U1–U3; the screens are in §9):**
    - **Victory and game over** each show an end screen once (`endSeen`), with **Keep playing** and **New party**. **Keep playing** continues the same world and party with no Crisis left: the remaining Crisis sites lie quiet, the danger ramp goes on, and nothing else changes (no world consequences).
    - **A party wipe** ends the run for good (ironman): the engine refuses every action, the "fallen" screen offers New party or Look back, and the save stays in its slot as an ended run until it is replaced. There is no reload.
    - **Save slots:** three, auto-saved after every step, with no manual save or copying (§9). Migrating a save to v11 rolls its Crisis from its current day, so an old run gets the full 100 days for act I.
    - **Legacy is minimal:** the Hall of the Fallen records every run that ended (won, lost or fallen): names, classes, levels, days, the ending and the villain (§9). A next party in the same world is later (§6).
  - **Decided overnight in Plan 5b** (each easy to change): one Crisis per world, chosen by its seed; deadlines are fixed calendar days and the clock runs from day 1; the party first hears through tavern rumours, road omens or the day-15 summons, and learns the plan only at the reveal site; one failed act loses the Crisis; the Crisis doesn't touch the danger ramp; every Crisis site has water (I2). The open ones are in §12.

**Reasons to grow (Plan 5a):** XP and levels for stats; recruiting, with the party growing from 2 toward 6 and camaraderie getting harder past 7; and low-end magical gear (accessories with rule hooks). Wealth funds a bigger, better-equipped party.

**XP and levels as built (Plan 5a, Track A):**
- **Levels 1–10** follow total XP (`XP_BY_LEVEL`, cumulative, never reset): 0, 300, 900, 1,800, 3,000, 4,500, 6,300, 8,400, 10,800 and 13,500. The I1 simulation kept the table as it was: about level 2 by day 15, 4 by day 60 and 5 (P90 6) by day 120. A level-up adds the hit die + CON modifier to max HP (at least 1), and to HP unless the member is downed (0 HP stays 0: a level never revives), proficiency follows the level, and on odd levels from 3rd a random ability below 20 rises by 1 (the prototype's rules; the player doesn't choose, see §12). Level-ups are applied after every `step`, so XP can come from anywhere; each is a journal line.
- **XP is shared, not split:** every living member (exhaustion below 6) gains the full amount.
- **Encounter checks** pay by the final DC (site power and danger included) and the tier: 5 XP per DC point on a success (`XP_PER_DC`; DC 13 → 65), ×1.5 on a critical success, ½ on a partial, ¼ on a failure or critical failure (something is learned). Fixed options, wonders and practice rolls pay nothing. An outcome with its own `xp` effect replaces the default for that roll (even a conditional one). The XP shows as a chip ("+65 XP") on each outcome before the roll and in the outcome line after it, and the preview carries it as data (`OptionCheckPreview.xp`, `BranchPreview.xp`).
- **Contracts** pay 2 XP per gp of their pay (`CONTRACT_XP_PER_GP`), whether the reward is gold or a good word.
- **Sites:** clearing a dungeon or lair pays `XP_CLEAR` (150) × (1 + its power); each site discovered pays `XP_DISCOVER` (25), however it was found (exploring, rumours, clues, or a contract naming it).
- **No XP** for foraging, gathering, rumours themselves, stowing away or Inspiration, so travel chores aren't grind.

**Gathering materials (Plan 5a):** spend days in a domain gathering a local good (timber, stone, food, fuel, healing herbs) with a skill check. It is profitable at first, but selling it quickly raises local supply through the market's bulk pressure. It gives a broke party a fallback income.
- **Gathering is income, not a safety net** (designer's Plan 4 call): starvation stays the intended lethal pressure; gathering only makes earning possible without capital. Yields per tier for two workers were raised in I1 (e.g. firewood 0/2/3/6/8 units from critical failure to critical success), so a fresh day for two sells for about 4–6 gp.
- **As built (`world/gather.ts`, `data/claude/gathering.json`):** in a settlement (not on the road, at a site or at sea), each gather rule whose lands include the domain's offers a one-day action: timber (forest, jungle; Athletics), stone (hills, mountains; Athletics), fuel (firewood in forest and plains, peat in marsh, scrub in desert), food (game on plains, forest and hills; fish and forage in marsh and jungle; Survival) and healing herbs (forest, marsh, jungle, hills, mountains; Medicine, the hardest and most valuable).
  - The best-suited member leads (Strain and `gather` hooks count); the roll counts toward Strain and a natural 20 grants Inspiration. The DC drops by 1 per output level where the domain makes the good, so gathering is easiest where the good sells cheapest.
  - The whole able party works: a tier's units are the rule's yield for two × workers ÷ 2, lowered by how picked over the land is, rounded, and capped at what the party can carry without being overloaded (the rest is left behind). The preview shows the lead, skill, DC, every non-critical tier's chance and units (faces on hover, §9), "picked over", and what a natural 1 brings (`mishap`).
  - **Depletion:** `gathered` records the units carried home per domain and good (what is left behind for want of room still lies there, so it doesn't count), recovering like market pressure (half-life `RECOVERY_HALF_LIFE_DAYS`); the land is picked over as a market of `GATHER_DEPTH_DAYS` (2) fresh days' work deep, so a domain's gathering income halves in about a week of steady work (I1). Selling still faces the market's bulk pressure, and whole-gold prices floor at 1 gp, which is why depletion exists.
  - The day passes as a day in town on the party's own food (water is free). A critical failure draws a hostile situation that fits the place, or else hurts the lead (`GATHER_INJURY`). Gathering gives no XP.

**Plan order:**
- **Plan 5a:** progression (XP and levels, recruiting, gear), gathering and the danger ramp.
- **Plan 5b (built):** the Crisis arc, run end and game over (with "keep playing"), three ironman save slots and the Hall of the Fallen. The legacy for the next party comes later.

## 11. Scope

**Slice 1 (first playable):**
- The Altaeus graph with one generated political layer.
- Towns with the ledger screen.
- Party creation (2 members), travel, essentials consumption.
- The market and price book.
- Encounters from all provenances (situations, archetypes, parts, follow-ups), Edge and Exposed, and Inspiration.
- Basic reputation (individual and settlement).
- Dice animation, the Encounter Deck, save and load, and run end on a party wipe.
  - **Done (Plan 5b):** run end on a party wipe, three ironman save slots with auto-save, and the Crisis with its end screens.

**Later:**
- World simulation ticks and the counterbalances.
- Successive parties and legacy (beyond the Hall of the Fallen, which is built).
- Accessories with hooks, and per-party modifiers.
- Kingdom- and faction-level reputation with favours.
- Dungeons (alarm level, rooms) and linear combat.
- Owned businesses and mercenary companies.
- Demand visualisation.

## 12. Open questions

- Goods weights, prices and contract pay were tuned in Plan 4 against the economy simulation (`docs/notes/economy-report.md`). Open there: a safety net for a broke party, provisioning order (food before water?), and supply patrons advancing part of the goods' cost.
- **Decided (Plan 6, designer 2026-11-13):**
  - **What should a recruit be worth?** Wages are gone: a recruit costs a one-time sign-on fee by level (rolled 3d6 stats, old wounds and starting gear set where in the range), and a big party's real cost is camaraderie, whose losses scale with the party while the gains stay flat (§3).
  - **A safety net?** None beyond a start that isn't entirely surrounded by danger-3 routes (§3); losing to survival about 75% of the time is right.
- What reputation affects beyond the initial set.
- What triggers a world re-randomise (manual only, or offered after N parties).
- **Plan 5a, to confirm with the designer:**
  - **How hard should day 300 be?** At +60% a DC 13 check becomes DC 21: a level-9 specialist (+8) succeeds about 40% of the time, against about 65% for a level-1 specialist at DC 13 on day 1. That pushes hard to finish the Crisis by about day 300. Levers if too strong: a flat +1 DC per step instead of a proportional one (DC 19 on day 301), or a lower `DANGER_RAMP_MAX`.
  - **Should the player choose the level-up stat?** The prototype rolls it. Choosing would be a small, real decision every other level, at the cost of a click.
  - **The town ledger is taller than a 1440 × 900 screen in about a third of the towns** (up to about 1,070 px, measured over all 53 settlements of three worlds). The cause is the left column (market about 460 px, services up to about 330 px and people up to about 130 px) and predates Plan 5a, which adds a line to an inn's tile in weeks it has recruits. Fitting every town on one screen needs a layout decision (e.g. denser tiles, people in the other column, or a shorter market).
- **Plan 5b results and open questions** (see `docs/notes/crisis-report.md`):
  - **Survival caps the Crisis win rate.** In the Crisis simulation (seeds 1–20, to day 360, with water at the Crisis sites) the crusader wins 25% of runs and falls in 70% (the target was 40–75%). Deaths are hunger and thirst, as in the economy report: even the trader that ignores the Crisis falls in 55% of runs within a year. When a run lives to see the Crisis decided, the crusader wins 5 of 6. Act sites are found with a median of 100 days to spare, 14% of acts are thwarted late, and the plan is learned by day 25 in 70% of runs (target 90%). No Crisis number was tuned: the act DCs, clue rules and leeway are not what holds the targets back.
  - **To confirm with the designer** (the plan's three questions):
    - **Should one failed act lose the whole Crisis?** As built, it does. The alternative: a failed act makes the next one harder (its site stronger, or its due day sooner), and only a failed act III loses.
    - **Should the Crisis touch the danger ramp?** It doesn't. A suggestion: each thwarted act holds the ramp back a step (−10% from then on), a reward the whole world feels; a lost Crisis could add +10%. Either is a world consequence, so it is left out unless wanted.
    - **Is the Hall of the Fallen enough legacy for now?** The fuller legacy (§6: the next party in the same world 5–20 years later, with graves, rumours, gear and grudges) would be a plan of its own.
  - **Recommendations from the simulation (I1):**
    - **An economy safety net** is the real lever for the win rate: should a broke party in town always have a way to eat? (The economy report's open question again.)
    - **Acts could stir only near their season.** As built, an act becomes current as soon as the one before is thwarted, so a fast party can win by about day 125 and the due days only bite on a slow party. If each act should feel like its own season, act n's site could stir only from its due day − 60, with clues to it only from then on.
    - **Act I's finale may be too easy:** it succeeded in every run that reached it (15 of 15, one visit each). It was left alone, since a harder act I would push the win rate further below its band.
