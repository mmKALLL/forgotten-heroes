# Plan 4: Towns and Economy

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make towns worth stopping in and give the party ways to earn a living (design §3, §4, §5, §7, §8). The 15 goods of design §4 become real cargo with weight. Carrying capacity scales with STR, pack animals and carts. Each settlement has a market whose supply and demand follow its type, size, land, threat and nearby sites. Prices drift by day and sag under bulk selling, and the party only knows the prices it has seen or heard (the **price book**). Carried precious goods draw thieves. The settlement screen becomes the **town ledger**: Market, Services and People panels on one screen. Notable people and settlements keep a **reputation** with the party. **Contracts** from notice boards add deadlines, which make the brisk pace and the forced march worth choosing. **Rumours** at the tavern feed the price book and reveal sites. Finally the smoke policy learns to trade, and the simulation reports profit and survival.

**Architecture:**
- **Content (all JSON, no functions):** new kinds `goods`, `serviceRoles`, `marketRules`, `animals`, `personRoles` and `contracts`. Claude writes all of them in `data/claude/`. `data/original/services.json` and `settlement-types.json` stay as they are: what each service does is an overlay keyed by service id (`serviceRoles`).
- **Engine, all pure, two new folders:**
  - `src/engine/economy/`: `goods.ts` (definitions, weight, spoilage), `capacity.ts`, `market.ts` (supply and demand, price, drift, pressure, quotes, shops), `trade.ts` (buy and sell actions, price book), `wealth.ts` (visible wealth).
  - `src/engine/town/`: `services.ts` (the services panel model and its actions), `animals.ts`, `people.ts`, `reputation.ts`, `rumours.ts`, `contracts.ts`, `ledger.ts` (one view model for the whole town ledger).
- **Nothing ticks.** Price drift, a market's recovery from bulk trades, notice boards and service quality are all derived from the world seed, the settlement, the good and the day, in the same way `world/sites.ts` derives a site's cycle. State stores only what the party did: its net trades per market, the price book, reputation, accepted contracts, and owned animals.
- **State v6:** a single shape change in T2, so every track compiles against the same `GameState`.
- **The UI only renders view models** (`marketView`, `serviceRows`, `peopleRows`, `noticeBoard`, `townLedger`). Prices, odds and refusals are worked out in the engine.

**Tech stack:** unchanged. pnpm, Vite, React 19, strict TypeScript, zod 4, Vitest with jsdom and Testing Library.

**Context:** design §3 (carrying capacity, endurance, Strain recovery by lodging), §4, §5, §6 (rumours as discovery), §7 (forced march and time pressure, hired horses, encounter budget), §8, §10 (simulation) and §11 (slice 1 scope). Previous plans: `2026-11-12-plan-3-world-travel.md` and `2026-11-12-plan-3b-domains-pois.md`.

**Conventions:**
- **TDD.** Write the listed tests first, then make them pass. Engine tests use `src/engine/test-fixtures.ts`, and only `src/content/*.test.ts` reads the bundled data.
- **Constants:** every balance number goes in `src/engine/constants.ts`, in a section named after the module that uses it, with a one-line comment. Add a row to `docs/notes/constants.md` for each new data-file knob.
- **Vocabulary** (id lists, enums) goes in `src/schema/types.ts`. The schemas never import the engine.
- **Before each commit:** run `pnpm format`, plus `pnpm schemas` after changing `src/schema/`.
- **Committing:** commit after each task with `git add <paths>`. Never use `git add -A`, and never push. If `index.lock` exists, wait and retry.
- **Private data:** never commit anything from `data/imported-private/`. Contract and NPC names are original; nothing from published settings.
- **Worktree agents:** worktrees get created from an old commit. Before anything else, run `git checkout -B plan4-<track> <base>`, where `<base>` is the commit the coordinator names (T2's commit on `rebuild`, or the merge-point commit). Then check `git log -1` and stop if it is wrong.
- **Shared UI files:** other agents may be editing the UI. Re-read a component before changing it, and apply your change to the current markup.

---

## Tracks and merge points

```
T1 → T2 (on `rebuild`) ──┬── Track A: A1 → A2 → A3 ═M1═ → A4 ═M2═ → A5
                         ├── Track B: B1 ──(needs M1)→ B2 → B3 → B4 ═M3═ → B5
                         └── Track C: (needs M1) C1 → C2 → (needs M2) C3 → (needs M3) C4
                                                         all merged → I1 → I2
```

- **T1 and T2** run first on `rebuild`. Each track then runs in its own worktree, branched from T2.
- **M1** (after A3): goods, capacity, the market and trading are live. B and C rebase onto it.
- **M2** (after A4): services, lodging tiers and animals work. C rebases onto it for C3.
- **M3** (after B4): reputation, rumours and contracts work. C rebases onto it for C4, and B continues with B5.
- **Merging:** each track merges back to `rebuild` with `git merge --no-ff` once its last task is green. B1 may merge early, because it only adds data and validators.
- **Conflict hot spots:** `src/engine/state.ts` (the action switch), `travel/journey.ts` (arrival hooks), `travel/preview.ts` (`PaceOption` fields) and `travel/wander.ts`. Keep additions in those files small and append-only, and put the logic in the new modules.
- **I1 and I2** run on `rebuild` after everything has merged.

---

## T1. Shared vocabulary and content schemas

**Files:**
- Modify: `src/schema/types.ts`, `common.ts`, `content.ts`, `encounter.ts`; `src/content/build.ts` (`emptyContent`); `src/engine/test-fixtures.ts`.
- Generate: `data/_schema/*.schema.json` (`pnpm schemas`).

**Vocabulary (`types.ts`):**
- `GOODS`: all 15, in design order: food, water, fuel, healing, alchemicals, arcana, arms, armour, gear, timber, stone, metal, gems, relics, luxuries.
- `GOOD_CATEGORIES = ['essentials', 'consumables', 'equipment', 'materials', 'precious']`, and `GOOD_CATEGORY: Record<Good, GoodCategory>`. This mapping is fixed by the design, so it is vocabulary rather than data.
- `SERVICE_FUNCTIONS = ['trade', 'rest', 'hire', 'temple', 'underworld']`: the design §5 groups.
- `SERVICE_ACTIONS = ['market', 'lodging', 'heal', 'bless', 'animals', 'rumours', 'board', 'passage', 'news']`: the actions the engine supports. Anything else is "coming later".
- `CONTRACT_KINDS = ['courier', 'supply', 'escort', 'bounty', 'errand']`.
- `STANDINGS = ['hated', 'disliked', 'stranger', 'known', 'liked', 'trusted', 'honoured']`: reputation tiers, worst first.

**Content kinds (`content.ts`, with schemas in a new `src/schema/economy.ts`):**
- `goods`, `GoodDefSchema`: `{ id: Good, name, unit ("ration", "load"…), weight (lb per unit, ≥ 0), price (base gp per unit, ≥ 0), spoilPerDay (0–1, default 0), depth (market depth factor, default 1), uses (text shown in the UI) }`.
- `serviceRoles`, `ServiceRoleSchema`: `{ id: service id, function: ServiceFunction, trades: Good[] (default []), buysOnly: Good[] (default []; e.g. a necromancer buys relics), actions: ServiceAction[] (default []), specialty?: string }`.
- `marketRules`, `MarketRuleSchema`: `{ id, when: { types?, biomes?, coastal?, minSize?, maxSize?, threatAtLeast? (0–3), nearPoi?: PoiCategory[], minWealth? }, supply: partial Good → int −2..2, demand: partial Good → int −2..2, notes? }`. Every listed condition must hold for the rule to apply.
- `animals`, `AnimalDefSchema`: `{ id, name, price, hirePerDay?, capacity (lb), speed (default 1; riding animals 2), rider: boolean, needs?: animal id (a cart needs a mule), roadsOnly (default false), waterPerDay (default 1) }`.
- `personRoles`, `PersonRoleSchema`: `{ id, name ("innkeeper"), service?: id (the role appears only where that service is present), minSize (0–5), weight, titles: string[] (e.g. "Mother", "Old") }`.
- `contracts`, `ContractTemplateSchema`: `{ id, kind, title, text (slots {good} {amount} {dest} {patron} {site}), weight, minSize, service?: id (posted only there; otherwise on the notice board), minStanding?: Standing, km: {min, max}, goods?: Good[], amount?: {min, max}, poiCategories?: PoiCategory[], urgentChance (0–1), pay (multiplier, default 1), reputation: {patron, settlement} }`. Refines: `supply`/`courier` need `goods` and `amount`, and `bounty`/`errand` need `poiCategories`.
- Add all six to `TRANSLATABLE_KINDS` where they have text.

**Encounter vocabulary (`encounter.ts`):**
- Effect `goods`: `{ good?: Good, category?: GoodCategory, amount?: int, fraction?: (0, 1] }`. Exactly one of `good`/`category`, and exactly one of `amount`/`fraction`. A `fraction` takes that share of what is carried, rounded up (theft). A category with an `amount` spreads the change over that category's goods, most valuable first.
- Effect `reputation`: `{ amount: int }`, with the encounter's domain settlement.
- Requirement `goods`: `{ good, min }`. Requirement `standing`: `{ min: Standing }`, at the encounter's domain settlement.
- These replace the two "Extension point: Plan 4" comments.
- Situation `tags` already exist. Document `thieves` and `toll` as the tags visible wealth weighs (A5).

**Fixtures:**
- 15 goods with simple round numbers.
- 4 service roles: an inn (lodging, rumours, board), a general store (market for food, fuel and gear), animals, and a jeweller (gems and luxuries, buys relics).
- 3 market rules: a coastal rule, a threat rule (arms demand at threat ≥ 2) and a biome rule.
- Mule, cart, riding horse.
- 3 person roles.
- One template per contract kind.

**Tests:**
- Schema: a `goods` effect with both `good` and `category` fails, and so does one with neither `amount` nor `fraction`. A `bounty` template without `poiCategories` fails. A market-rule level of 3 fails. Defaults are filled in.
- `pnpm schemas` leaves no diff.

**Commit:** `add goods, market, service-role, animal, person-role and contract schemas`

## T2. GameState v6 and the migration

**Files:** modify `src/schema/state.ts` and `world.ts`, `src/engine/save.ts` (+ tests), `src/engine/state.ts` (`newGame`), `src/engine/world/generate.ts`; create `src/engine/town/people.ts` and its tests.

**State v6** (`version: z.literal(6)`, `CURRENT_SAVE_VERSION = 6`). New fields all have zod defaults:
- `world.people: Record<personId, { settlement, role, name, ancestry }>`.
- `markets: Record<settlementId, Partial<Record<Good, { units: number; day: number }>>>`: the party's net trades, sales positive and purchases negative, as of `day`. Recovery is derived (A2).
- `priceBook: Record<settlementId, { day: number; heard: boolean; prices: Partial<Record<Good, { buy: number | null; sell: number | null }>> }>`.
- `spoilage: Partial<Record<Good, number>>`: the fractional carry of spoilage, 0–1.
- `animals: Partial<Record<animalId, number>>`: owned pack animals and carts.
- `travel.hired: { animal: id; count: int } | null`: mounts hired for this journey (default null).
- `reputation: { settlements: Record<id, number>; people: Record<id, number> }`: points; tiers are derived (B2).
- `contracts: ContractState[]` (the shape is below) and `contractsTaken: string[]` (offer ids accepted, so a board never re-offers them).
- `doneHere: string[]`: once-per-arrival actions taken here ("rumours", "bless:<service>"). Cleared on arrival, like `visited`.

**`ContractState`:**
```json
{ "id": "c-norrikk-2-w3-1", "template": "carry-cloth", "kind": "courier",
  "patron": "p-norrikk-2-innkeeper", "from": "norrikk-2", "to": "tradal-1",
  "good": "luxuries", "amount": 4, "poi": null, "passengers": 0,
  "accepted": 12, "deadline": 19, "pay": 40, "urgent": false,
  "reputation": { "patron": 6, "settlement": 3 } }
```

**People generation:**
- `generatePeople(seed, content, world)` uses its own salted stream (`withRng(createRng(worldSeed ^ PEOPLE_SALT))`), so adding it changes no other world draw.
- Each settlement gets `PEOPLE_BY_SIZE[sizeTier]` people (constants; e.g. 1, 2, 2, 3, 4, 5).
- Roles are drawn by weight from the `personRoles` that fit: the size is at least `minSize`, and the role's `service` is present. There are no duplicate roles in one settlement.
- Names come from the ancestry name tables. The ancestry is the settlement's, 75% of the time.
- Ids are `p-<settlement>-<role>`.
- `generateWorld` calls it last.

**Migration `v5ToV6(raw, content)`:**
- Adds `world.people` (generated as above, so it is identical to a new game with that seed) and the empty defaults.
- Sets `travel.hired = null`.
- Keeps `goods` and `waterskins` as they are. The old keys are a subset of the 15 goods.

**Tests:**
- A v5 fixture migrates and parses, and its goods, waterskins, gold, party and location are untouched.
- A v1 save chains through to v6.
- Migrating twice gives identical output.
- `newGame(seed).world.people` equals the migrated save's `world.people` for the same seed.
- People are deterministic. A role whose service is absent never appears. A settlement never has two people in the same role.
- The world generated before people (kingdoms, POIs, settlements) is unchanged from v5 for seeds 1–3.

**Constraint:** this is the only task that changes the state shape.

**Commit:** `GameState v6: markets, price book, reputation, contracts, animals and people`

---

## Track A: goods, market and travel engine

### A1. Goods, weight, carrying capacity and spoilage

**Files:**
- Create: `src/engine/economy/goods.ts`, `capacity.ts` and their tests.
- Modify: `travel/days.ts` (spoilage), `travel/journey.ts` and `routes.ts` (encumbrance), `travel/preview.ts` (warnings), `encounters/effects.ts`, `run.ts` and `preview.ts` (the `goods` effect, chips and requirement), `rules/character.ts` if a helper fits there.

**Interfaces:**
- `goodDef(content, good)`, `goodsWeight(goods, content)` and `goodsValue(goods, content, filter?)` (at base price).
- `memberCapacity(c)`: `CARRY_BASE_LB × clamp(1 + CARRY_PER_STR × (STR − 10), CARRY_MIN, CARRY_MAX)`. This gives 0.8× at STR 8, 1.8× at STR 18, and 2.25× at most. Exhaustion 3 or more halves it, which suits 5e.
- `carryCapacity(state, content)`: the sum over able members, plus the owned animals' `capacity`, plus hired mounts. A cart without a draught animal adds nothing.
- `load(state, content) → { weight, capacity, ratio, level: 'light' | 'encumbered' | 'overloaded' }`. Encumbered is above 1.0×; overloaded is above `OVERLOAD_RATIO` (1.5×).
- Constants: `CARRY_BASE_LB` (60), `CARRY_PER_STR` (0.1), `CARRY_MIN` (0.5), `CARRY_MAX` (2.25), `OVERLOAD_RATIO`, `ENCUMBERED_SPEED` (2/3).

**Behaviour:**
- **Encumbered:** land speed × `ENCUMBERED_SPEED`, and the forced march is not offered. The road preview says "Encumbered: 140 of 120 lb".
- **Overloaded:** departure is refused with "Too heavy to set out: drop or sell N lb". Sea passage ignores weight (the ship carries it).
- **Spoilage:** at the end of each `consumeDay`, each good with `spoilPerDay` loses `floor(units × rate + carry)`, and the remainder goes back into `state.spoilage`. It is deterministic and previewable. Any loss is logged ("2 rations spoiled").
- **The `goods` effect** follows T1's rules. Its chip reads "−2 healing" or "lose half your precious goods". The `goods` requirement's unmet text is "needs 1 healing".

**Tests:**
- STR 8, 10 and 18 give 0.8×, 1.0× and 1.8×, STR 30 caps at 2.25×, and an exhausted member carries half.
- A mule raises capacity, and a cart without a mule doesn't.
- Encumbered changes `kmPerDay` and the days in the preview. Overloaded refuses `travel`, but not on a sea route.
- Spoilage over 10 days of 20 food at 2% loses exactly the summed floors, and the carry stays in [0, 1).
- `goods` with `fraction: 0.5` on 3 gems takes 2. A category `amount: −2` takes the most valuable first. A requirement gates an option.
- The Plan 3 travel tests still pass, because the fixture party is light.

**Commit:** `goods have weight; carrying capacity by STR and animals; spoilage`

### A2. The market model

**Files:** create `src/engine/economy/market.ts` and its tests.

**Interfaces:**
- `marketLevels(state, content, settlementId) → Record<Good, { supply: int; demand: int }>`. These are the sums of the matching `marketRules`, each clamped to −3..3. The condition inputs are the settlement type, `sizeTier`, the land biome, `coastal`, `domainThreatLevel` on today's day, `wealth`, and the categories of inhabited POIs in its domain (discovered or not).
- `drift(seed, settlementId, good, day) → number` in [1 − `DRIFT`, 1 + `DRIFT`]. This is value noise: a seeded value at every `DRIFT_PERIOD_DAYS` knot, linearly interpolated, so it never ticks and moves smoothly.
- `pressure(entry, day)`: `units × 0.5^((day − entry.day) / RECOVERY_HALF_LIFE_DAYS)`.
- `midPrice(state, content, settlementId, good, day)`: `price × PRICE_STEP^(demand − supply) × drift`, times the pressure factor `exp(−pressure / depth)`. Here `depth = MARKET_DEPTH[sizeTier] × goodDef.depth`.
- `shopsFor(state, content, settlementId, good) → Shop[]`. A shop is `{ service, quality: 1–5, spread }`: present services whose role `trades` the good, or whose `buysOnly` includes it (those can only buy from the party).
  - **Quality** is derived: `clamp(3 + round(wealth / 2) + seeded(−1..1), 1, 5)`.
  - **Spread** is `SPREAD_BY_SIZE[sizeTier] − SPREAD_PER_QUALITY × (quality − 3)`, plus a reputation hook (`spreadModifier`, a parameter that defaults to 0; B2 plugs it in).
  - **Market stalls:** every settlement has a pseudo-shop that sells only the essentials, at the worst spread.
- `quote(state, content, settlementId, good, side: 'buy' | 'sell', amount, shop?) → { total, unitFirst, unitLast, shop } | null`. It sums unit by unit as the pressure moves. A buy total is rounded up and a sale rounded down, so gold stays an integer. It is null when no shop trades that good that way.
- Constants: `PRICE_STEP` (1.25), `DRIFT` (0.15), `DRIFT_PERIOD_DAYS` (10), `RECOVERY_HALF_LIFE_DAYS` (10), `MARKET_DEPTH` (by size tier), `SPREAD_BY_SIZE` (about 0.4 for an outpost down to 0.15 for a metropolis), `SPREAD_PER_QUALITY`.

**Behaviour:** buying is always dearer than selling at the same shop on the same day, whatever the pressure, so there is no arbitrage within one town. Water costs nothing. It isn't traded, and refilling stays free in settlements.

**Tests:**
- Determinism.
- A demand rule raises the mid price, and a supply rule lowers it.
- Arms demand rises at threat ≥ 2 (fixture rule).
- `drift` stays within bounds and changes by at most `2 × DRIFT / DRIFT_PERIOD_DAYS` per day.
- Selling 10 at once fetches less than 10 × the first unit, and less than or equal to selling 5, waiting a half-life, and selling 5.
- After `RECOVERY_HALF_LIFE_DAYS` the pressure halves.
- For every good and shop, buy is greater than sell.
- A good no present service trades is offered only if it is an essential.

**Commit:** `settlement markets: supply and demand, drift, bulk pressure and shops`

### A3. Trading and the price book  ⇒ merge point M1

**Files:**
- Create: `src/engine/economy/trade.ts` and its tests.
- Modify: `src/engine/state.ts` (actions), `travel/journey.ts` (observe on arrival), `travel/supplies.ts` (remove `buyFood`/`sellSupplies`, keep `buyWaterskin`), `travel/wander.ts`, `src/engine/replay.test.ts`, and the PlacePanel buttons only as far as they need to compile.

**Interfaces:**
- Actions: `{ type: 'buyGoods'; good; amount; shop? }` and `{ type: 'sellGoods'; good; amount; shop? }`.
  - **Buying** is refused outside a settlement, when unaffordable (it buys as many as the gold allows, as `buyFood` did), or when it would make the party overloaded ("too heavy").
  - **Selling** caps at what is carried.
  - Both update `markets[settlement][good]`, folding the old pressure to today before adding, and log "Sold 6 gems for 212 gp (35 → 31 gp each)".
- `observe(state, content, settlementId)`: writes the whole market into `priceBook` with `heard: false` and today's day. It is called on arrival at a settlement, at the start (`newGame`), and after every trade.
- `marketView(state, content) → MarketRow[]`, grouped by category. Each row has the good, carried amount, buy/sell quote for 1, levels as arrows (supply ↑↓, demand ↑↓), best shop, and `known` elsewhere: the best sell and cheapest buy in the price book, each with its settlement name, age in days and `heard`.
- `priceAge(entry, day)` and `STALE_DAYS` (14) for the UI's "stale" styling.

**Behaviour:** food now costs what the local market asks. `FOOD_PRICE` and `SELL_SHARE` are removed, and `wander` buys rations through `buyGoods`.

**Tests:**
- Buy then sell the same amount at once loses money.
- Buying past overload is refused, and so is buying at a POI ("Not here").
- Arriving writes a price-book entry. A trade refreshes it, and its age grows with the days.
- `marketView` rows list the best known elsewhere.
- The replay test is updated, and seeded replays stay identical.
- The smoke test (`src/content/world.test.ts`, "journeys on Altaeus") still passes.

**Commit:** `buy and sell the 15 goods; the price book`

### A4. Services, lodging, healers, temples and animals  ⇒ merge point M2

**Files:**
- Create: `src/engine/town/services.ts`, `animals.ts` and their tests.
- Modify: `travel/supplies.ts` (rest by lodging tier), `rules/strain.ts` (fade count), `travel/journey.ts` and `routes.ts` (hired mounts, stabling, sea fare per animal, carts on roads only), `travel/preview.ts` (mounted options), `src/engine/state.ts`.

**Interfaces:**
- `serviceRows(state, content) → ServiceRow[]`. Each row is `{ service, name, function, quality, specialty, actions: ServiceActionView[], later: boolean }`, grouped by function. A service with no supported `actions` gets `later: true` ("coming later").
- **Lodging** (`{ type: 'rest'; lodging?: 'common' | 'private' | false }`). These depend on the inn's quality:
  - common room: `LODGING_PRICE` per member, Strain fades 1 stack, as today;
  - private room (quality ≥ 3): `PRIVATE_ROOM_PRICE`, Strain fades `PRIVATE_ROOM_FADE` (2) stacks;
  - no inn: today's "rest on your own food".
  - Camp is unchanged.
- **Heal** (`{ type: 'useService'; service; action: 'heal' }`): all HP back and one level of exhaustion off for each member who needs it, at `HEALER_PRICE` per member treated, without spending a day.
- **Bless** (a temple, once per arrival via `doneHere`): `BLESSING_PRICE` for 1 Inspiration.
- **News** (couriers): `NEWS_PRICE` buys the price-book entry of one named settlement on the same island, `heard: true`, aged by the km between the two towns at a courier's pace.
- **Animals:** `{ type: 'buyAnimal' | 'sellAnimal'; animal }` and `travel` with `hire?: true`.
  - Hiring rents one riding animal per member for this journey: `hirePerDay × members × expected days`, paid at departure. It needs the Animals & Mounts service, and works only for journeys to a settlement.
  - Mounted land speed is × the animal's `speed` (2), but only × `MOUNT_ROUGH_SPEED` (1.25) in mountains, marsh and jungle. It stacks with pace.
  - Mounts add their capacity. They are returned on arrival.
  - Owned animals: stabling (`STABLING_PRICE` per animal per night) is added to inn rests. Each animal drinks `waterPerDay` from the carried water on the road (twice that in the desert). The sea fare is per animal too.
  - A cart (`roadsOnly`) can't take POI paths. Such a path shows "No road for the cart".
- `routeOptions` gains a `mounted` variant per pace when hiring is possible: days, cost and the encounter range.

**Tests:**
- A private room fades two Strain stacks, and a common room one.
- The healer costs gold, passes no day, and is refused without the gold.
- The blessing works once per arrival.
- News writes a heard entry with the right age.
- Hired horses halve the days on plains and change them by 1.25× in mountains. They cost the right gold and are gone on arrival.
- A cart blocks POI paths. Stabling is added to the rest cost.
- Unsupported services list as `later`.

**Commit:** `services: lodging tiers, healers, temples, couriers and animals (hired horses)`

### A5. Visible wealth and thieves

**Files:** create `src/engine/economy/wealth.ts` and its tests. Modify `travel/routes.ts` (`hostileShare`), `travel/preview.ts` (the share's reasons), `encounters/run.ts` (draw weights).

**Interfaces:**
- `visibleWealth(state, content) → { value, perMember, steps }`. `value` is the carried precious goods at base price. `steps = clamp(floor(perMember / WEALTH_STEP_GP), 0, WEALTH_MAX_STEPS)`. Party size deters because the value is per member.
- `hostileShare(..., wealthSteps = 0)` gains a `wealth` part: `WEALTH_HOSTILE_PER_STEP × steps` (0.05 each, at most 0.2).
- When a hostile situation is drawn, those tagged `thieves` or `toll` weigh × (1 + `WEALTH_TAG_WEIGHT` × steps).

**Behaviour:** the road preview lists "visible wealth +10%" among the reasons, and the goods bar (C1) shows the steps.

**Tests:**
- 0 precious goods add nothing.
- The same gems carried by 4 members add fewer steps than by 2.
- The share respects `HOSTILE_SHARE_RANGE`.
- Over 1,000 seeded draws, a `thieves` situation is drawn more often when wealthy.

**Commit:** `visible wealth draws thieves and tolls`

---

## Track B: data, people, reputation, rumours and contracts

### B1. Goods, markets, services and animals as data (after T2)

**Files:**
- Create in `data/claude/`: `goods.json`, `market-rules.json`, `service-roles.json`, `animals.json` and `person-roles.json`.
- Create: `src/engine/economy/validate.ts` (`economyIssues`) and its tests.
- Modify: `src/content/` tests and `docs/notes/constants.md`.

**Content:**
- **Goods:** starting numbers, to be tuned in I1.

  | Good | Weight | Price | Notes |
  |---|---|---|---|
  | Food | 2 lb | 0.8 gp | spoils 2% a day |
  | Water | 5 lb | 0 | |
  | Fuel | 5 lb | 0.3 gp | |
  | Healing | 1 lb | 8 gp | |
  | Alchemicals | 1 lb | 20 gp | |
  | Arcana | 0.5 lb | 25 gp | |
  | Arms | 10 lb | 15 gp | |
  | Armour | 20 lb | 30 gp | |
  | Gear | 10 lb | 5 gp | |
  | Timber, Stone | 50 lb | 1 gp | deep markets |
  | Metal | 20 lb | 5 gp | |
  | Gems | 0.1 lb | 50 gp | shallow markets |
  | Relics | 2 lb | 60 gp | |
  | Luxuries | 5 lb | 20 gp | |

  `uses` names what each good does in play: "Spent in encounters to treat wounds", "Opens trail options in rough country (gear)", and so on.
- **Market rules:** about 25–40 rules.
  - Fishing and port towns (`coastal`) supply luxuries.
  - Mining in mountains and hills supplies metal, stone and gems.
  - Forests supply timber, and plains supply food.
  - Military types demand arms, armour and food.
  - Threat ≥ 2 demands arms, armour and healing. A Rampant domain demands timber and stone too ("rebuilding").
  - A dungeon or ruin nearby demands gear and healing, and supplies relics.
  - Wealthy towns demand luxuries, gems and arcana.
  - Deserts demand water-side gear and supply luxuries (spice).
- **Service roles:** one for each of the 33 services. Each gets its function, what it trades, its actions, and `later` implied where it has none.
- **Animals:** mule (`capacity` 200, 8 gp), riding horse (hire 1 gp a day, `speed` 2, 75 gp to buy), cart (`capacity` 400, needs a mule, `roadsOnly`, 15 gp).
- **Person roles:** 10–15 roles, such as innkeeper, reeve, priest, guildmaster, harbourmaster, quartermaster, fence and stablemaster, tied to services where it fits.

**Validator (`economyIssues`):**
- Every good is defined exactly once.
- Every service has a role.
- Every non-essential good is traded or bought by at least one service.
- Every `needs`, `service` and `types` id exists.

**Content tests (bundled data, seeds 1–5):**
- Every good is buyable somewhere and sellable somewhere.
- For each traded good, the ratio of the dearest to the cheapest mid price across the world is 1.5–4, so trade routes exist but none is absurd.

**Commit:** `goods, market rules, service roles, animals and person roles`

### B2. People and reputation (after M1)

**Files:**
- Create: `src/engine/town/reputation.ts` and its tests.
- Modify: `town/people.ts` (`peopleRows`), `economy/market.ts` (plug in `spreadModifier`), `encounters/effects.ts` and `run.ts` (the `reputation` effect and the `standing` requirement), `src/engine/state.ts`.

**Interfaces:**
- `standingOf(points) → Standing`, with thresholds in `STANDING_POINTS`. For example: hated ≤ −20, disliked ≤ −5, stranger < 5, known < 15, liked < 30, trusted < 50, honoured otherwise.
- `settlementStanding(state, id)`, `personStanding(state, personId)` and `addReputation(state, { settlement?, person?, amount, reason })`. It logs "Your name is known in Avarus now" when a tier changes.
- `spreadModifier(state, settlementId)`: −`STANDING_SPREAD` per tier above stranger, and + per tier below. A shop whose keeper is a person uses the better of the two standings.
- **Trading volume:** +1 settlement point per `TRADE_REP_GP` traded, at most `TRADE_REP_MAX` per arrival.
- `peopleRows(state, content) → { id, name, role, standing, points }[]` for the current settlement.

**Tests:**
- The tiers sit at the thresholds.
- Liked lowers the buy price and raises the sell price, and disliked does the reverse.
- The `reputation` effect changes the encounter's domain settlement. The `standing` requirement gates an option.
- The volume reputation caps per arrival.

**Commit:** `reputation with people and settlements`

### B3. Rumours at the tavern

**Files:** create `src/engine/town/rumours.ts` and its tests. Modify `src/engine/state.ts` and `world/explore.ts` (`siteActions` lists rumours).

**Interfaces:**
- `rumourOption(state, content) → { actorId, skill, dc, chances, cost, outcomes } | null`, in the shape of `exploreOption`. It is null without an `inn-tavern` (or another `rumours` service) or once heard this arrival.
- Action `{ type: 'listenRumours' }`.

**Rules:**
- The best of Insight and Persuasion rolls against `RUMOUR_DC` (12), −1 per standing tier above stranger.
- The party buys a round (`RUMOUR_PRICE` per member). No day passes, and it is once per arrival (`doneHere`).
- The roll counts toward Strain, and a natural 20 grants Inspiration.
- **Tiers:**
  - Critical failure: a false rumour, a heard entry for one neighbour with a price skew of ±`FALSE_RUMOUR_SKEW` (40%) and no tell.
  - Failure: nothing.
  - Partial: one neighbour's prices.
  - Success: two neighbours' prices, plus `discoverPoi` (land scope) when something there is undiscovered.
  - Critical success: three neighbours' prices, the clue, and a lead (a bonus contract offer on this board, B4).
- **Heard prices** are skewed by ±`RUMOUR_SKEW` (10%), seeded, and dated `today − travel days from there`. Stale news is real.

**Tests:**
- The odds match `previewCheck`.
- Each tier writes the listed entries, with the right ages and `heard: true`.
- The clue respects `undiscovered`.
- It is refused a second time this arrival.
- Standing lowers the DC.

**Commit:** `rumours at the tavern: prices, clues and leads`

### B4. Contracts and notice boards  ⇒ merge point M3

**Files:**
- Create: `src/engine/town/contracts.ts` and its tests.
- Modify: `src/engine/state.ts`, `travel/journey.ts` (arrival and day hooks), `travel/days.ts` (escort passengers eat and drink), `travel/preview.ts` (a `deadline` field on `PaceOption`), `encounters/effects.ts` (`clearPoi` completes bounties), `world/explore.ts` (`visitPoi` completes errands).

**Interfaces:**
- `noticeBoard(state, content, settlementId) → Offer[]`. It is derived from (world seed, settlement, week = ⌊(day − 1) / 7⌋), with `BOARD_SIZE[sizeTier]` offers. Offers already in `contractsTaken` are left out. It adds the rumour lead when there is one, and a template's `service` adds offers only where that service exists.
  - Templates gated by `minStanding` show as locked, with their requirement.
- **Offer generation:**
  - The destination is a settlement (courier, supply, escort) or a POI of `poiCategories` (bounty, errand) within `km`.
  - A bounty's lair is revealed on acceptance.
  - `deadline = accepted + ceil(steadyDays × slack)`. The slack is 1.1–1.4, or 0.75–0.9 for an urgent offer (`urgentChance`), which only brisk or forced paces make.
  - `pay = round(CONTRACT_PAY_PER_DAY × steadyDays × template.pay × (urgent ? URGENT_PAY : 1) × (1 + 0.1 × threat))`.
- **Actions:**
  - `acceptContract { offerId }`: at most `MAX_CONTRACTS` (3). A courier's goods are handed over at acceptance and count against capacity, and the party must have room.
  - `abandonContract { id }`.
  - `completeContract { id, reward: 'gold' | 'goodWord' }`.
- **Completion:**
  - courier and escort: arrive at `to` by the deadline;
  - supply: be at `to` (the patron's town) with `amount` of `good`, which is handed over;
  - bounty: `clearPoi` on that POI;
  - errand: `visitPoi` there.
  - The player then chooses the reward: gold (`pay`) plus reputation, or **a good word** instead of the gold. The good word gives `GOOD_WORD_POINTS` with every settlement of the patron's kingdom, plus the patron's reputation.
- **Failure:** the deadline passes, or the contract is abandoned. The party loses reputation (`FAIL_REP` with the patron and settlement). A courier's goods are lost or must be paid for at base price, and debts go to −gold as far as there is gold, with the remainder as more lost reputation.
- **Escort:** each passenger eats and drinks as a member, and adds `ESCORT_HOSTILE` to the hostile share.
- `PaceOption.deadline`: for each active contract with this destination, `{ contractId, arrivesDay, deadline, inTime }`.

**Tests:**
- The board is deterministic within a week and changes the next week.
- A taken offer is not offered again.
- An urgent deadline is missed at steady but met at forced, in the preview and in a real journey.
- Each kind completes by its own trigger and fails past its deadline.
- The good word raises every settlement of the kingdom, and gold is unchanged.
- An escort's passenger eats.
- The cap of 3 holds.
- A courier with no room is refused.

**Commit:** `contracts from notice boards, with deadlines and a good word`

### B5. Contract templates and goods in encounters (after M3)

**Files:**
- Create: `data/claude/contracts.json`.
- Modify: `data/claude/situations.json`, `poi-situations.json` and `archetypes.json` where it fits, and their `notes`.
- Update the `src/content/` tests.

**Content:**
- **Contracts:** 15–25 templates covering all five kinds. Plain notice boards post courier, supply and escort. The adventurers' guild posts bounty and errand, and some of those need standing known or better. A temple posts errands to shrines.
- **Consumables in encounters:** add `goods` requirements and costs to 10–15 existing options, so consumables are spent to unlock or boost options as design §4 says:
  - "Bind the wound (1 healing)" as a sure heal;
  - "Throw alchemist's fire (1 alchemicals)" as a fight option with a lower DC;
  - "Ward with salt and chalk (1 arcana)" against undead and fey;
  - gear for climbing or crossing options in hills and mountains.
- **Theft and tolls:** tag the existing thief and toll situations `thieves` or `toll`, and add 3–4 new ones that take precious goods (`goods` `fraction`) or demand a toll in gold or goods. Each still offers at least 2 options that trade off different resources.
- **Relics and gems:** dungeon vaults and some lair clearings give `goods` relics or gems as well as, or instead of, gold, so dungeon loot has to be carried home and sold where demand is.
- **Reputation:** 4–6 road outcomes that help or wrong locals carry a `reputation` effect.

**Tests:**
- Every template generates at least one offer somewhere on seeds 1–5.
- Every edited situation passes playability and the quality lint (no ⚠ in the Encounter Deck).
- Every good of the consumables category is used by at least 3 options.

**Commit:** `contract templates; consumables, thieves and relics in encounters`

---

## Track C: the town ledger UI (after M1)

### C1. Goods bar, capacity meter and visible wealth

**Files:** create `src/ui/GoodsBar.tsx` and its tests. Modify `src/ui/App.tsx` (top bar), `theme.css`, `i18n/en.ts` and `ja.ts`.

**Behaviour:**
- The bottom bar (design §9) shows the 15 goods grouped by category, hiding goods at 0 unless the category is empty, in which case it shows "—".
- A capacity meter reads "84 / 120 lb", marked Encumbered or Overloaded.
- A visible-wealth pip shows its steps, with a tooltip like "Precious goods worth 220 gp: +10% hostile on the road".
- The top bar keeps food in days and water. On narrow screens the bar stacks under the journal.

**Tests:**
- The categories render. The meter shows the load level.
- The wealth tooltip appears only when steps > 0.
- Japanese falls back to English for missing keys.

**Commit:** `goods bar with capacity meter and visible wealth`

### C2. The town ledger and the Market panel

**Files:**
- Create: `src/ui/town/TownLedger.tsx`, `MarketPanel.tsx` and their tests.
- Modify: `src/ui/world/PlacePanel.tsx` (it hosts the ledger and drops its supplies buttons and services list), `theme.css`, i18n.

**Behaviour:**
- **The ledger** shows one screen with three panels and no modals: Market, Services and People. Until C3 and C4, Services and People render the plain lists of today. The banner, realm and threat lines stay above, and the roads out below.
- **Market rows** are grouped by category. Each row shows:
  - the good with its `uses` tooltip, and the amount carried;
  - buy and sell;
  - supply and demand arrows;
  - the best shop with quality pips;
  - the price-book comparison, e.g. "sells 31 gp in Avarus · 12 days ago", dimmed with "(stale)" past `STALE_DAYS` and marked "heard" for rumours.
- **Buy and sell** take an amount stepper (1, 5, max) with a live quote, e.g. "Sell 10: 87 gp (9 → 8 each)". A buy that would overload is disabled with the reason. Waterskins stay as a row under Essentials.
- **Keyboard:** rows are a table with buttons, and everything is keyboard-operable.

**Tests:**
- Rows group by category.
- The quote updates with the amount.
- The stale and heard markers appear.
- An overloading buy is disabled.
- Buy and sell dispatch the right actions.

**Commit:** `town ledger with the market panel`

### C3. The Services panel and hired horses (after M2)

**Files:** create `src/ui/town/ServicesPanel.tsx` and its tests. Modify `TownLedger.tsx`, `src/ui/world/RoadsOut.tsx` (mounted toggle), i18n.

**Behaviour:**
- **Rows** are grouped by function (Trade, Rest & Recovery, Hire & Contracts, Temple & Arcane, Underworld). Each row shows its quality pips, specialty and the party's standing there (from C4; "—" until then), with inline actions:
  - rest: common or private room, with prices;
  - healer, with the price and who would be treated;
  - blessing, with "already blessed" once used this arrival;
  - news, with a settlement picker;
  - animals: buy or sell a mule or cart, showing capacity gained and the stabling price.
  - `later` services show "coming later".
- **Roads out** gain a "Hire horses" toggle where hiring is possible. It shows the cost and the days for each pace, and the mounted variant comes from `routeOptions`.

**Tests:**
- The groups render.
- An unsupported service shows "coming later".
- The healer's button shows its price and dispatches.
- The hire toggle changes the shown days and cost.

**Commit:** `services panel: lodging, healers, temples, couriers, animals and hired horses`

### C4. People, reputation, rumours and contracts (after M3)

**Files:**
- Create: `src/ui/town/PeoplePanel.tsx`, `NoticeBoard.tsx`, `src/ui/ContractsPanel.tsx` and their tests.
- Modify: `TownLedger.tsx`, `ServicesPanel.tsx` (standing column), `RoadsOut.tsx` (deadline lines), `App.tsx` (the contracts panel under the party), i18n.

**Behaviour:**
- **People panel:** each notable person's name, role and standing tier. The settlement's own standing goes in the ledger header.
- **Rumours:** "Listen for rumours" in the inn row shows the actor, skill, DC, % chance, cost and the non-critical tiers before the player commits, as Explore does.
- **Notice board** (Hire & Contracts): each offer shows its kind, destination, distance, deadline ("by day 19, 7 days at a steady pace"), pay, reputation and an "urgent" badge. Locked offers show their standing requirement.
- **Active contracts:** a compact list under the party panel with days left. On completion it offers the choice "Take 40 gp" or "Ask for a good word".
- **Roads out:** each pace shows "arrives day 18 · deadline day 17 ✗" for contracts to that destination.

**Tests:**
- People render with tiers.
- The rumour preview shows the DC and %.
- Accept dispatches, and a locked offer is disabled with its reason.
- The deadline line marks late paces.
- The completion choice dispatches either reward.

**Commit:** `people, rumours, notice boards and contracts in the ledger`

---

## Integration (after all tracks merge)

### I1. Economy simulation and tuning

**Files:** modify `src/engine/travel/wander.ts` (or create `src/engine/travel/trader.ts`) and `src/content/world.test.ts`; create `src/content/economy.sim.test.ts` and `docs/notes/economy.md`; tune `src/engine/constants.ts` and `data/claude/goods.json` / `market-rules.json` / `contracts.json`.

**Work:**
- **A `trader` policy** built on `wander`. In a settlement it:
  - sells anything whose local sell price beats the best price-book price elsewhere less a margin;
  - takes the best affordable contract it can meet at a steady or brisk pace;
  - listens for rumours when it can afford them;
  - buys the good with the best known margin to a neighbour, within capacity and keeping a reserve for food;
  - travels towards that neighbour or its contract's destination, with forced marches only for deadlines.
- **The report** (printed, not gated, per design §10) covers seeds 1–30, 40 legs each. It reports the median and 10th/90th-percentile gold per day, the share that went broke (gold < 5 with no saleable goods), deaths, contracts done and failed, and the most profitable good and route. The plain `wander` policy is the baseline.
- **Targets** (record the measured values in `economy.md`):
  - a trader nets about +3 to +10 gp a day early on;
  - fewer than 10% of traders go broke by day 60;
  - plain `wander` no longer goes broke in most seeds when contracts are taken;
  - no single good or route earns more than 3× the median margin (an outlier).
- **Tuning order:** spreads, `PRICE_STEP`, market rules, contract pay, then goods prices.
- **Gates:** seeds 1–8 run without throwing and keep a valid state, and seeds 1–3 have no deaths, as in Plan 3b.

**Commit:** `trader smoke policy; tune prices, spreads and contract pay`

### I2. Docs and full verification

**Files:** `docs/plans/2026-11-12-rebuild-design.md` (§3 capacity, §4, §5, §7 hired horses, §8 reputation as built, §9 the ledger and goods bar), `docs/notes/constants.md`, `docs/notes/economy.md`.

**Work:**
- Write the rules as built, with their numbers and constants, into the design doc, along with the decisions confirmed below.
- Run `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
- Run `pnpm test` once with `data/imported-private/` moved aside, then restore it exactly.

**Commit:** `document towns and economy (Plan 4)`

---

## Decisions confirmed by the designer (override anything above)

- **Weight in kilograms:** carrying capacity is **20 kg per member at STR 10** (scaled 0.8×–1.8× by STR), plus animals. Food and water count. Pick goods/food/water weights so the trade-off stays meaningful at that scale (e.g. a day's food ≈ 1 kg, a day's water ≈ 2 kg — tune with the I1 economy report and note the numbers in `src/engine/constants.ts`). Up to 1.5× capacity = encumbered (⅔ speed, no forced march); beyond that the party can't depart and the market refuses purchases that would put it there.
- **Horses can be bought too** (in addition to hiring per journey): owned horses have a daily upkeep (fodder/stabling, in gp or food), can be stolen (thief encounters / visible wealth), and work anywhere a horse can go (not on site paths if the path is rough — follow the cart rule's spirit). Hired horses stay as proposed (per journey to a settlement, ~1 gp per member per day, returned on arrival). Speed 2× (1.25× in rough terrain) for both.
- **Visible wealth = precious goods + a heavy purse:** gems/relics/luxuries count fully; coin above ~50 gp per member counts partly (constant). Banks (later) will let the party avoid carrying coin.
- **Reputation scope:** people + settlements, plus "a good word" as the alternative contract reward raising standing across the patron's kingdom. Kingdom/faction tiers, favours and parley later.
- All other proposals in the section below are accepted as written.

## Design decisions to confirm with the user (original proposals)

1. **Weight in pounds.** A member carries 60 lb at STR 10, scaled 0.8× to 1.8× (at most 2.25×), halved at exhaustion 3 or more. Food and water weigh too (2 lb a ration, 5 lb a day of water), so hauling water through a desert competes with cargo.
2. **Over capacity.** Up to 1.5× capacity the party is *encumbered*: ⅔ speed and no forced march. Beyond 1.5× it can't set out, and the market refuses purchases that would put it there.
3. **Waterskins stay containers**, not one of the 15 goods, and water stays free in every settlement (no water market). The "Water" good only matters as weight and capacity.
4. **Fuel has no use yet** beyond trade, because nothing is cold until biomes or seasons add it. The proposal is to wire fuel into camp rest in a later plan (mountains, then winter).
5. **Hired horses** are rented per journey to a settlement (not to a site): about 1 gp per member per day. They give 2× land speed (1.25× in mountains, marsh and jungle), stacking with pace, add capacity, and are returned on arrival. Mules and carts can be bought. A cart can't use paths to sites.
6. **Prices:** ±15% drift over about 10-day waves, bulk trades recovering with a 10-day half-life, and buy/sell spreads from 40% in an outpost to 15% in a metropolis, tighter at better shops and with better standing. Food now costs what each town asks, instead of a flat 1 gp.
7. **The price book** records a whole market on arrival. Rumours and couriers add "heard" prices that are dated by distance and slightly off, and a critical failure at the tavern plants a false rumour with no tell.
8. **Reputation now covers people and settlements only** (design §11 slice 1). The **good word** is in now, as the alternative reward on any contract: it raises standing with every settlement of the patron's kingdom. Kingdom and faction tiers, favours, and faction parley ("hostile orcs tolerate you") are deferred to a later plan.
9. **What standing does now:** better or worse spreads, gated contract offers (the guild needs "known"), and an easier rumour check. Reputation doesn't decay over time.
10. **Contracts:** five kinds (courier, supply, escort, bounty, errand), at most 3 active, and boards refresh weekly. Deadlines are 1.1–1.4× the steady-pace days, or 0.75–0.9× for urgent offers (which pay more), so the brisk pace and the forced march have a real use. Failing a contract costs reputation, and a courier's lost goods must be paid for.
11. **Visible wealth counts precious goods only**, not coin, per member carried. Each step of 100 gp per member adds +5% hostile share (at most +20%) and makes thieves and tolls likelier. Should a heavy purse count too?
12. **Notable people** are generated with the world (2–5 per settlement by size, tied to the services present), so an old save gets the same people as a new game with its seed.
13. **Lodging tiers:** a common room (as today) and a private room at better inns (Strain fades 2 stacks a night). The healer saves the day of rest for gold, and the temple sells one blessing (Inspiration) per visit.

## Out of scope

- Kingdom and faction reputation, favours, rival factions and parley with hostile factions.
- Character gear slots, accessories, rule hooks and per-party modifiers (design §4 and §8).
- Hirelings and mercenaries, owned businesses, banks and loans.
- World-simulation events moving supply and demand (wars, famines, rebuilding as a pressure), beyond threat level and nearby sites.
- Fuel and cold, seasons, and water markets in desert towns.
- Demand visualisation on the map, multi-leg route planning, and magical travel.
- Localising engine-made text (the journal, effect chips and quotes stay in English).
- The town map as a full backdrop; the banner stays as it is.
