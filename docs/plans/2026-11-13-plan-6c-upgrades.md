# Plan 6c: Party upgrades

> Light format (process-speedups): calls, interpretations, tasks and tests; implementers write the code test-first.

**Goal:** a party can buy lasting upgrades that cover its weaknesses, or that push a strength further toward high-risk, high-reward goals. Each upgrade type has **5 levels**, every level dearer than the last.

## Designer calls (2026-11-13)

- **Few types (about 6), each with levels 0–5.** Every type starts at level 0.
- **Prices** are **base × level**: level n costs base × n gp. A normal base is 100 gp, and some types differ. The **company banner** has a base of 200, twice the normal.
- **The types:**
  - **Camp kit.**
  - **Smuggler's compartment.**
  - **Surveyor's maps:** global, +2 to explore checks per level.
  - **Delving gear.**
  - **Company banner:** camaraderie losses are 1 smaller per level. A bigger banner is a soft way to make bigger parties workable.
- **Dropped:** the cook's kit, strongbox, herbalist's kit, fishing gear and guild membership. Store investments are not an upgrade; they are a later design (see "Not now").
- **Waterskins** stay a separate purchase. Their price is raised in the Plan 6 economy batch.

## Interpretations (Claude; please review)

| Upgrade | Per level | Sold by | Base (level n costs base × n) |
|---|---|---|---|
| Camp kit | +1 HP restored per member when camping. From level 3, a night in the wild costs no camaraderie | outfitters, general stores | 75 |
| Smuggler's compartment | 20% of the party's precious goods are hidden from tolls and road thieves (100% at level 5) | smugglers, black markets, shady inns | 125 |
| Surveyor's maps | +2 to explore checks | cartographers, sages, guilds | 100 |
| Delving gear | +1 to dungeon-room checks of Athletics, Perception and Acrobatics; level 5 also +1 to the delve's skill-challenge rounds | outfitters, adventurers' guilds | 100 |
| Company banner | Every camaraderie loss is 1 smaller (losses only, never below 0) | tailors, heralds, capitals | 200 |

- **Where:** an upgrade can be bought where a matching service is (from `service-roles.json`). The next level always costs the listed price there. Quality or wealth may shift it by ±25 gp, decided by the implementer.
- **Global:** upgrades belong to the party, not to a member or a kingdom. They carry no weight and can't be lost, except as noted under §7 of the combat design (gear lost on death does not include party upgrades).

## Not now

- **Investing in a store** is a later design, not an upgrade. See `docs/plans/later-designs.md`.

## Tasks

- **Engine:**
  - `GameState.upgrades: Record<UpgradeId, 0..5>` (save migration).
  - `upgradeOffers(state, content, settlement)`.
  - A `buyUpgrade` action.
  - The effects wired into explore, camping, tolls and thieves, delve rooms, and camaraderie losses.
  - Each effect shows in the previews it touches, so preview == actual.
- **Data:** `data/claude/upgrades.json`, a new kind giving each type its name, effect text, levels, prices and the services that sell it. Prices are data knobs listed in `docs/notes/constants.md`.
- **UI:**
  - Upgrades appear on the service tile that sells them: "Surveyor's maps II · 200 gp", with the short effect line under it.
  - The party panel lists the owned upgrades and their levels.
  - Keep the designer's rule: each mechanical fact once per view.
- **Sims:** the trader buys upgrades when it has spare gold. Rerun the economy and Crisis reports.
- **Tests:**
  - Each upgrade's effect matches between preview and actual.
  - Prices rise level by level, and the banner costs about 2× the others.
  - The migration.
  - A UI smoke test.

## As built (2026-11-13)

- **State and data:** `GameState.upgrades` (a partial record, missing = level 0; save v17 → v18 adds `{}`), the `upgrades` content kind (`src/schema/upgrades.ts`, `data/claude/upgrades.json`: `name`, `description`, `basePrice`, `soldBy`), validated by `economyIssues` (every type defined, `soldBy` services exist). What each level does is code (`src/engine/rules/upgrades.ts`, numbers in the constants' "Party upgrades" section), so the odds stay computable and the effect lines are always true.
- **Buying:** `upgradeOffers(state, content)` lists the next level of each type sold here (on the first present `soldBy` service's tile), and `buyUpgrade` buys it (`town/upgrades.ts`). Prices are base × level everywhere; the "±25 gp by quality or wealth" was left out.
- **Sold by:** camp kit at adventuring supplies and tailors; smuggler's compartment at thieving supplies and ports; surveyor's maps at books and maps and universities; delving gear at adventuring supplies and the adventurers' guild; company banner at tailors.
- **Effects, each previewed by the function that applies it:**
  - Camp kit: `restOption` gains `kitHp` and `cheer`; the camp buttons' tooltips say what the kit adds. **Interpretation:** nights in the wild cost no camaraderie in the rules as built, so level III's "a night in the wild costs no camaraderie" became **+5 camaraderie for a rest in camp, once per arrival or journey** (`CAMP_KIT_CHEER`). Please review.
  - Smuggler's compartment: in a `thieves` or `toll` situation the effects apply to the goods in sight, the hidden ones are added back after, and the chip says "(2 hidden)". Hidden goods don't count toward visible wealth either (Claude's addition: hidden from the eyes that pick a target too).
  - Surveyor's maps: `exploreOption.maps`, folded into its modifier and odds (the line's tooltip names it).
  - Delving gear: `delvingBonus` in the option preview (`upgradeModifier`, shown as "+2 delving gear"), the roll, the challenge's odds of winning (`roundChoices` takes a bonus) and the delve preview's risk.
  - Company banner: `softenLoss` in `changeCamaraderie` (hunger, deaths), on encounter `camaraderie` effects and the setback (via `upgradedEffect`, for chips and application alike), and in `camaraderieInfo`'s costs. The setback (a failed check plus fleeing) counts as one loss.
- **UI:** `src/ui/town/UpgradeOffers.tsx` on each service tile (one line in `ServicesPanel`), the owned list in the party panel. English only.
- **Sims:** the trader policy's `upgrades` option (default on) buys the cheapest next level while it keeps 200 gp of capital, delving gear only when it delves. Economy report: a new "trader, no upgrades" row; the trader spends about 300 gp a run on upgrades, so its net-worth gp/day falls (6.7 → 3.2 by day 60) with going broke and deaths unchanged. The Crisis report moves within its noise. See the notes.
- **Scout's kit (designer call 2026-11-13, added after):** a sixth type, base 150, levels 0–5, sold at the adventurers' guild and mercenaries (designer edit: not adventuring supplies) (no ranger or tracker service exists). Per level: +1 (`SCOUT_CHECK_BONUS`) to a surprise check only (designer call: Exposed checks in general get nothing); and −5% hostile share on the road (`SCOUT_HOSTILE_PER_LEVEL`), a new `scout` part of `HostileShare` shown as "−5% scout's kit" in the road preview and passed by `placeOnRoute` alike. The share part is applied before the 10–85% clamp, so at level V it is −25 points: on most roads that is down to the 10% floor. **Surprise checks** are options tagged `surprise` (a new `OPTION_TAGS` value), tagged in `data/claude/` only: `sold-out-ambush` spot, `horse-thieves` shout, `snare-line` cut and bait, `nets-in-the-reeds` fight, the ten lair raids' `scout` approaches (poi-situations), and `skullmire-dragon` ambush (a dungeon room). `checkUpgrades` (rules/upgrades.ts) sums delving gear and the kit for the option preview (`upgradeParts`, each named on the card), the roll, `roundChoices` (by each round's footing) and the delve risk. No save migration: `upgrades` is a partial record. Combat (Plan 7) should add the kit's level to the party's surprise roll (combat design §2).
- **Tests:** `src/engine/rules/upgrades.test.ts` (each effect, preview == actual), `src/engine/town/upgrades.test.ts` (prices, buying, refusals), the v17 → v18 migration in `save.test.ts`, and `src/ui/town/UpgradeOffers.test.tsx` (the tile and the party panel).
