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
