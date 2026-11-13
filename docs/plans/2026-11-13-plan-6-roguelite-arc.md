# Plan 6: The roguelite arc (levels to 20, a phased Crisis, sign-on recruits, dungeons)

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Light format (process-speedups): tasks, interfaces, acceptance tests and constraints; implementers write the code test-first.

**Goal:** Reshape the run around the designer's calls of 2026-11-13. These are recorded in design §3, §8, §10b and §12. Their headline:

- **Runs.** Aim for a 30–60 minute roguelite run. Most parties die of the road, and those that reach the Crisis lose about half the time at each act.
- **Phases.** The Crisis has three acts, and each act has two phases: investigation, then prevention. That makes six phases. The party should gain about **3 levels per phase**, reaching about level 19 for a final CR 18 encounter.
- **Dungeons.** They are the faster but riskier way to grow: about 2× the risk per encounter, a series of rooms, and 1.5–2× the reward of overworld work of the same level.
- **Recruits.** Wages are gone. A recruit costs a one-time sign-on fee by level. Camaraderie is what a big party costs: failures hurt more the bigger the party, and the gains are flat.

**Architecture:** unchanged rules (pure engine, data not functions, constants in `constants.ts`, vocabulary in `src/schema/types.ts`). New shared interface (Track C owns it; Tracks D and K use it):

```ts
// src/engine/rules/challenge.ts
/** The base DC of a check against a foe or obstacle of this challenge rating (CR_DC table in constants). */
export function crDc(cr: number): number
/** The party level a CR is meant for (≈ CR + 1); used by the sims and the "too strong for you" hint. */
export function crLevel(cr: number): number
```

**State:** one save version bump per merged track that changes `GameState`. Every track writes its migration as **v12**, and the merger renumbers the later one to v13 (and so on), chaining them.

**Conventions:** as Plan 5b (TDD, ~0.4–0.6× test-to-code, preview == actual, determinism, migrations, content validation; never pin tuning values; `pnpm format`, `pnpm schemas`). Each track updates the design doc sections it changes and moves the matching §12 questions into "Decided".

---

## Designer calls (2026-11-13), verbatim intent

1. **Camaraderie.** Fleeing fights, failed checks and similar setbacks lower it, with bigger penalties the more members there are: more people pin the blame on someone. The gains stay flat (static), so a bigger party costs more to keep happy.
2. **Wages are gone.** Consuming goods, camaraderie and mood are cost enough. A recruit pays a **sign-on fee** by level: 20–60 at level 1, 40–100 at level 2, 75–150 at level 3, 140–200 at level 4, 200–280 at level 5, and so on.
   - Stats are rolled 3d6, and the two best usually go to the class's key abilities.
   - Higher stats and no injury put a recruit at the high end of the range.
   - Some recruits come with equipment, which is added to the price (as in Battle Brothers).
3. **No safety net.** Losing to survival about 75% of the time is right. The only net: the party starts at a random place that isn't **entirely surrounded by danger-3 routes** (reroll otherwise).
4. **Town screen (M1 MacBook Pro, ≈1050 px of game height).**
   - Bigger margins (12–16 px) at the major section breaks of the travel column.
   - The town graphic is enlarged **below the middle column's people and travel sections**. It may run below the screen, and scrolling to see it is fine.
5. **The Crisis.**
   - **A failed act fails the whole Crisis.**
   - Each act is an **investigation**, then a **prevention**, and both are retryable.
   - Investigation opens on day **30 / 130 / 230**. The climax is expected from day **60 / 160 / 260**, but a party may clear an act sooner; only the start of investigation is gated.
   - The key encounter not beaten by day **100 / 200 / 300** loses the Crisis. There is no leeway and no lateness DC, and the due days are not jittered.
   - Notes on days 30 and 80 of each act tell the party to hurry. A permanent **endgame tracker** opens below the journal from about the act I note.
   - Prevention must be too hard for a party of novices.
   - **Danger surge:** where it suits the theme, the act raises the global danger while the party is within the last 10–20 days before its deadline. This is a reason to finish early.
   - **Boss styles:** some villains are met once, at the end, with henchmen until then. Others are a **recurring** boss who gains 6 CR between prevention encounters, like a Pokémon rival.
6. **The Hall of the Fallen** is enough legacy for now.
7. **Journal text is 14 px.** The column width is fine.
8. **World map.**
   - The image reaches the section's edges and is about 16 px taller.
   - Each location's clickable radius is about 4 px bigger, without drawing bigger rectangles.
9. **Dungeons.**
   - They make the party stronger (levels, gear) at the cost of time away from trading, which has the better risk to reward.
   - Each encounter is about **2× as risky**, and a dungeon is a **series of them**.
   - A dungeon pays a random **1.5–2× the reward** of overworld quests of the same level.

## Interpretations (made by Claude; please review)

- **Levels go to 20.** `XP_BY_LEVEL` is extended, and Track B retunes it from the crusader's observed XP income so that the median is about level 4 by day 30, 7 by 100, 13 by 200 and 19 by 300.
- **Camaraderie scale ×5:** 0–40, start 25, the same five tiers (Fractured 0–9 … Sworn 40). Gains and losses become whole steps:
  - **Losses scale with the party.** A failed encounter check costs `members − 1` (−1 for a pair, −5 for six). A critical failure costs twice that. Fleeing a hostile encounter (an option tagged `retreat`) costs 2 × (members − 1). Hunger costs −5 and a death −10.
  - **Gains are flat.** A night in a private room is +5; its price is per member, so a bigger party pays more for it. A completed contract is +5. A new inn action, **Stand a round** (per member price, once per arrival), gives +3.
- **Old injuries:** about 1 recruit in 5 has an old wound (−2 to one ability, shown in their details), and sits at the low end of the price range. Founders don't.
- **Sign-on fees above level 5:** the table continues at about ×1.35 a level, up to level 20 (`RECRUIT_SIGNON` in constants). A recruit's starting accessory adds its shop price × 0.75.
- **The investigation phase:**
  - Each act has a **lead site** (henchmen), which wakes on its open day. For act I it is the old reveal site, and the summons moves from day 15 to day 30.
  - Winning the lead site's situation learns the plan (act I) and reveals the act's **key site**. Rumours still give clues: they point to the lead site, and the third clue gives the Edge at the key site.
  - The key site's situation is the prevention. Both sites are retryable: failing ends the visit with its costs, and the sites stay.
- **CR.** Crisis encounters take their DCs from CR (`crDc`) and are *not* hardened by the danger ramp, so the CR is the difficulty. Everything else is still hardened.
  - Lead sites are CR ≈ 2 / 8 / 14 and key encounters CR 6 / 12 / 18.
  - Recurring villains use the same named boss at every key site. Finale villains use a lieutenant at acts I and II and the villain at act III.
- **The surge** is +10% danger from deadline − 20 and +20% from deadline − 10. It applies only while that act is unthwarted and only where the act's data sets `surge`. The danger mark and its tooltip say why.
- **Dungeon level.** Each dungeon or lair gets a CR when it is placed (by type, domain threat and distance from the start; low near the start), and it grows with power.
  - **Contracts gain a level** near the party's best level, and their pay and DCs scale with it. "The reward of overworld quests of the same level" is that contract pay.

---

## Wave 1 (parallel worktrees)

### Track A: party (recruits without wages, camaraderie, start)
- **A1. Remove wages.**
  - Drop `wage`, `wagesOwed`, `owedTo`, `RECRUIT_WAGE` and `CAMARADERIE_UNPAID`.
  - The v12 migration drops the fields; owed wages are forgiven silently.
  - Dismissal is free.
  - Update `camaraderieInfo`, the sims (`trader.ts`) and the UI (RecruitsPanel, MemberDetails and the party panel's wage lines).
- **A2. Sign-on fees and rolled recruits.**
  - Recruits roll 3d6 per ability, and the two best go to the class's key abilities (with a small chance not to).
  - About 1 in 5 has an old wound.
  - The fee is placed in the level's range by a quality score: the stat total against its mean, and the wound. It is seeded and stable for the week, like today's offers.
  - Some offers (about 15%, more at the guild and the mercenaries) bring a tier-1 accessory, priced in.
  - Tests:
    - The fee lies within its level's range.
    - Better stats never cost less, all else equal.
    - A wound lowers the fee.
    - Determinism across the week.
- **A3. Camaraderie ×5** with the scaled losses and flat gains above.
  - The `retreat` option tag goes in the schema. Tag existing flee and withdraw options in `data/claude/` (`original/` is left untouched; note it if it needs tags).
  - Add the **Stand a round** inn action.
  - The v12 migration multiplies old values by 5.
  - Tests:
    - A failure costs more in a bigger party.
    - Gains don't depend on party size.
    - The preview of Stand a round equals what it does.
- **A4. A safe start.** `startingSettlement` (random mode) skips settlements whose every route has danger 3, falling back to the old pool if none qualifies. Test it on a fixture.

### Track C: the phased Crisis and levels to 20 (engine)
- **C1.**
  - Levels 1–20: extend `XP_BY_LEVEL` provisionally (Track B tunes it) and `MAX_LEVEL`.
  - Proficiency follows 5e (+2 … +6).
  - Add `src/engine/rules/challenge.ts` with `crDc` and `crLevel` (a provisional `CR_DC` table).
- **C2. The calendar.** Act n opens on 100(n−1)+30, is expected by +60, gets a hurry note on +80, and is due on 100n (`CRISIS_ACT_OPEN`, `CRISIS_ACT_EXPECTED`, `CRISIS_ACT_HURRY` and `CRISIS_ACT_DAYS`).
  - Remove the leeway, the lateness DC and the jitter: an act not thwarted by its due day fails, and so does the Crisis.
  - `crisisFailsDuring` keeps working against the due day.
  - Journal notes on open, hurry and due.
- **C3. The phases.**
  - **Stored:** each act has a `leadSite` and a `keySite`. Act I's lead site is the old reveal site; acts II and III get new lead sites, placed 2–8 days from the previous act's key site (by their own salted stream).
  - **Phases:**
    - A lead site is dormant (hidden and quiet) before its act opens.
    - Winning its situation (`learnPlan` for act I, then the new effect `revealKeySite`) opens the prevention.
    - The key site is quiet until it is revealed, and `thwartAct` there wins the act.
  - **Derived per act:** `dormant | investigation | prevention | thwarted | failed`.
  - The summons moves to the act open day, and clues follow the open act.
  - The v12 migration places the new lead sites and maps old progress: a learned plan means act I is in prevention.
- **C4. Bosses and the surge.**
  - The villain schema gains `boss: 'recurring' | 'finale'` and a named boss or lieutenant per act.
  - Each act gets `leadCr` and `keyCr`, and optionally `surge: true`.
  - Crisis encounters take their DCs from `crDc(cr)`, plus the situation's own offsets, and skip `harden`.
  - `dangerLevel(state)` adds the surge (the danger mark explains it).
  - The tests below cover it.
- **C5. View model.** `crisisTracker(state)` gives, per act: the phase, the days left, the next step ("Find the lead in Tradal", "Strike at the Opened Graves"), the lead and key CR against the party's level, and whether a surge is on. Track K renders it.
- **Tests:**
  - The phase follows the day and the progress.
  - The lead site is dormant before day 30.
  - Thwarting act I on day 50 is allowed.
  - Missing day 100 loses the Crisis.
  - The surge raises the danger only in its window and drops at the thwart.
  - The migration.
  - The crisis-world stats (sites placed and reachable).
- Keep the existing three villains working: convert their data minimally, keeping the reveal situations as act I's lead situation. Track K writes the rest.

### Track U: UI layout
- **U1. Town.**
  - Margins of 12–16 px at the major section breaks of the travel column.
  - The town graphic shown enlarged below the middle column's people and travel sections (full column width, aspect kept, may run below the fold).
  - Check that 1440 × 1050 has the key content above the fold, and that 412 × 915 doesn't scroll sideways.
- **U2.** Journal text at 14 px.
- **U3. World map.**
  - The image fills its section edge to edge and is about 16 px taller.
  - Location hit areas are 4 px larger than the drawn marker (an invisible hit target), with no visual change.
- One smoke test per panel touched. No engine changes.

## Wave 2 (after A and C merge)

### Track D: levelled work and authored dungeons

**Designer calls (2026-11-13, later):**
- Each dungeon is built on one of the **dungeon maps in `~/dnd5e/tiles and battle maps/dungeon maps/`**. The delve shows the party's place on it in a zoomed-in view, like the world map.
- The **content of each dungeon is fixed** (authored). About **20 dungeons**, placed at random around each world.
- A room's possible encounters are based on **what is actually drawn on the map** there.

**Data (new kind `dungeons`, `data/claude/dungeons*.json`):**

```jsonc
{
  "id": "sunken-vault",
  "name": "The Sunken Vault",
  "map": "tiles and battle maps/dungeon maps/_dungeon/<file>.jpg", // relative to ~/dnd5e; listed in assets.manifest.txt
  "mapSize": [4096, 2304],     // the image's pixel size (aspect for the view)
  "cr": 4,                     // fixed; spread over CR 1–18 across the 20
  "biomes": ["hills", "mountains"], // where it may be placed
  "summary": "One line on the map card",
  "entrance": [0.08, 0.52],    // fractions of the image
  "rooms": [                   // in delve order, 3–6
    { "id": "flooded-hall", "name": "The Flooded Hall", "at": [0.31, 0.47],
      "text": "What is here, from the map (in our own words)",
      "situations": ["sunken-vault-eels", "sunken-vault-sluice"] }   // 1–3 possible encounters, one drawn
  ],
  "hoard": { "text": "...", "precious": 1, "accessory": 1 }
}
```

- **Room situations** are ordinary situations with `site: true` and `room: true` in `data/claude/dungeon-rooms*.json`. They are never drawn on the road or at an ordinary site.
- **DCs** are written at standard difficulty (DC 10–15 as usual). The engine rebases them to the dungeon's CR: `dc + crDc(cr) − crDc(CR_STANDARD)`.

**Tasks:**
- **D0. Schema and loading.** The `dungeons` schema and content kind, validation (every room's situations exist and are `room: true`, coordinates in 0–1, a known biome), and `pnpm schemas`. Commit this first: the content agents branch from it.
- **D1. Contracts get a level** (the party's best founder level ± 1, seeded with the board). Their pay and check DCs scale with it (`crDc`), and the board shows the level.
- **D2. Placement.** World generation places up to `DUNGEON_COUNT` (≈20) authored dungeons, each at most once, on free land spots of their biomes (category `dungeon` POIs that point at their dungeon id).
  - They replace the generic dungeon-category POI types. Lairs, camps and the rest stay generic, as one-encounter sites with a CR from their type and domain threat.
  - At least 2 dungeons of CR ≤ 3 lie within about 10 steady days of the start.
  - The site cycle (empty, then re-inhabited) still applies. Re-inhabited rooms draw again from their situations.
  - Adjust `src/content/world.test.ts`'s POI bounds if the totals move.
- **D3. Delving.**
  - Enter starts a **delve** through the rooms in order, each room one drawn situation, in a row without leaving.
  - Each room carries about 2× an overworld encounter's risk: rebased DCs, and wounds × `DELVE_WOUND` (2).
  - Between rooms the party may **press on** or **withdraw**, keeping what it has found. Withdrawing is not fleeing, so it costs no camaraderie.
  - The last room clears the site and pays the hoard: a random 1.5–2× (`DELVE_REWARD`) of a same-level contract's pay, in gold, precious goods and sometimes an accessory, plus `XP_CLEAR`.
  - The preview shows the rooms left, the CR and the hoard range.
- **D4. The delve view.** It shows the dungeon's map image zoomed to the current room, with the rooms visited, the party's marker and the next room (pan and zoom like the world map).
  - Without the image (no local assets, e.g. a public build), it shows a plain schematic: the rooms as dots on parchment, joined in order.
  - The site panel shows the dungeon's name, CR against the party's level, its summary and the room count.
- **D5. Content (separate agents, after D0).** The 20 dungeons, written by agents who **look at each map image** (downscaled copies in the scratchpad) and mark the room coordinates. Each dungeon has 3–6 rooms and 1–3 situations per room, true to what the map shows there (a flooded hall, a collapsed bridge, a ritual circle).
  - Pick maps from the themed folders (`_dungeon`, `_cave : lava`, `_desert`, `_haunted`, `_mountain`, `_aquatic`, `_arctic`, `_coastal`, `_epic`), one floor per dungeon, and spread them over the biomes and CRs.
  - Add each map file to `assets.manifest.txt`, run `pnpm sync-assets`, and add a `CREDITS.md` row for each (map makers from filenames and watermarks; "(guess)" where unsure).
  - The text is our own words: no copyrighted prose in `data/claude/`.
- **Tests:**
  - Preview == actual for withdrawing and pressing on.
  - The hoard lies within its range.
  - A delve's determinism.
  - Placement: count, at most once each, the near low-CR rule.
  - Content validation.
  - The migration if `GameState` changes.
  - One smoke test for the delve view.
- **As built (D1–D4; details in design §6, "Authored dungeons and levelled work"):**
  - **Shared interface:** uses only `crDc` and `crLevel` (Track C's `rules/challenge.ts`). Content is standard at CR 2 (`CR_STANDARD`, where `crDc` = 12 = `CRISIS_DC_BASE`); `rules/levels.ts` holds `crOffset`, `levelCr`, `founderLevel`, `levelPay`, `typicalPay`, `contractDc` and `jobDc`. Dungeon rooms are hardened (danger ramp, power) with the CR offset as a flat bonus rather than played with `atChallenge`, since only the Crisis skips the ramp.
  - **D1:** an offer's level is the founders' best ± 1 from its own keyed stream (the offers themselves don't change as the party levels); pay × `1 + 0.5 × (level − 1)`. Contracts have no checks of their own, so their DCs are read as: the contract's offset (never negative) on hostile road encounters while it is held, and at its bounty/errand site when higher than the site's CR.
  - **D2:** dungeons are placed in `newGame` after the Crisis (the near rule needs the start), from their own salt; all 20 fit on seeds 1–20. Authored dungeon sites are not hostile (no threat; the Rampant share is unchanged) but cycle. The generic dungeon types go to weight 0 (kept for old saves). Lairs get CR `LAIR_CR_BY_THREAT[threat] + domain threat level`.
  - **D3:** the drive-out rule is an effect: `driveOut` is written into every ending fail/critFail branch of a room's snapshot, and `hoard` into the last room's other ending branches, so the previews show them and preview == actual. Any action other than a room's choices, Press on, Withdraw and a few chores withdraws first. The room failure texts of both content sets were rewritten (about 250) to describe being driven back.
  - **D4:** `DelveView` heads the centre column while delving (a 2.4:1 strip during a room, 4:3 between rooms; "Whole dungeon"); `DungeonCard` and `SiteCr` in the site panel; the board's level badge. `pnpm sync-assets` writes colon paths with hyphens so the `_cave : lava` maps load (re-run it).
  - **Save v14** (after Track C's v13): contracts gain `level` (1), `delve` is null, and the authored dungeons are placed in old worlds from where the party is.

### Track K: Crisis content and the tracker UI
- **K1. Per villain:**
  - A boss style (at least one recurring and one finale).
  - Lead site types and situations for acts II and III.
  - Rewritten key situations at the act's CR.
  - The open, hurry and failure texts, and surge flags where thematic.
  - Everything goes in `data/claude/` (`villains.json`, `crisis-sites.json`, `crisis-situations.json`, `crisis-names.json`).
- **K2. The endgame tracker panel** below the journal: permanent from act I's open day, and hidden before it. It shows each act's phase, the days left, the next step and the surge. One smoke test.

## Wave 2b: designer feedback (2026-11-13, afternoon)

**Calls:**
- **Market.** The categories' vertical labels make the sections uneven in height, and the market's symmetry matters. Shorten the labels, with abbreviations if needed ("Consumables" especially; "Equipment" and "Materials" are a little long), so every section is the same height.
- **Services** show their full text inline, with no ellipsis. The hover text is different.
- **Shift** sells 5 at once.
- **Recruit offers** don't mention the accessory's cost, and drop the word "Brings".
- **World map** another 32 px taller, almost square.
- **Kingdom names** are listed roughly by distance.
- **Camaraderie** runs 0–100. Each week below 25 the party loses a member, and 0 is an instant game over. Firing or losing a member gives +5 at once.
- **Lead sites** get +1 CR (3 / 9 / 15).
  - Soft penalty: from day 50 / 150 / 250, while the act's lead is not yet won, overall danger rises by 1% a day.
- **Dungeons:**
  - Gaining information on a dungeon also tells the player the right party level for it.
  - Panning between rooms is smooth, not a jump. It need not follow the corridors exactly.
  - Dungeons of CR 10 and up may be longer when the map clearly has more rooms; the visuals decide.

**Interpretations (Claude):**
- **Camaraderie ×2.5.** The tiers, losses and gains are rescaled, and the "+5 for firing or losing a member" stays a flat +5 on the new scale.
  - The weekly loss replaces Fractured desertion. It falls on day 7, 14, … of an unbroken spell below 25: a hired member if any (seeded), else a founder, never the last living member.
  - Camaraderie 0 ends the run as "disbanded" (a new ending, in the Hall).
- **The waiting penalty** grows by 1% a day from the act's day 50 until its lead is won, then drops away. It stacks with the ramp and the surge, and the tracker and the danger mark say why.
- **The suggested party level** (`crLevel`) is shown once the dungeon is known by word: it was heard of in a rumour, or the party has entered it. A dungeon found only by exploring shows "unknown" until then. This adds to rumours' value against exploring.

**Tracks:**
- **E (engine):** camaraderie 0–100 with weekly losses and the game over, lead +1 CR, the waiting penalty, and the dungeon level knowledge (state and view model). Migration v14 → v15.
  - **As built:** design §3 (the low spell, disbanded), §6 (known by word), §10b (the waiting penalty, lead CRs) and §12 (Claude's calls: +5 only for a living member leaving; disbanded is final like a wipe; rounding; hunger now disbands a starving party in about five days).
- **V (UI):**
  - market labels, services inline, shift-sell ×5, recruit offer text;
  - the map +32 px, kingdoms by distance;
  - the smooth delve pan, and the dungeon card showing the suggested level when known.
- **R (dungeon content):** revisit the CR ≥ 10 dungeons (and any whose maps clearly show more): add rooms where the map has them, true to the image. The schema's room cap rises to 10.

### Track S: climaxes as skill challenges (after track E)
**Designer call:** climaxes (the Crisis key sites and the dungeon boss rooms) should be hard for a low-level party to overcome: several tough enemies, or a multi-stage encounter or skill challenge. One d20 barely tells a level-2 party from a level-6 one.

- **Engine.** A situation can be a **skill challenge**: `challenge: { successes: n, failures: m }`.
  - Each round the player picks one of the stage's options (different members, skills and resources) and rolls.
  - Successes and failures are tallied, and the challenge ends at n successes (win) or m failures (lose). A critical success counts as 2 successes, a critical failure as 2 failures.
  - Several foes can be modelled as a challenge whose options name the foe each round faces.
  - **The preview** shows the tally, each option's odds this round, and the overall chance of winning if the best option is picked every round (computed exactly; shown as "≈"). This keeps input randomness and visible odds.
  - Per-round wounds and costs apply as written. The outcome of the whole is the situation's win or lose ending (`thwartAct`, `hoard`, `driveOut` …).
- **Content.**
  - Convert the 9 Crisis key finales and the 20 dungeon boss rooms to challenges, sized by CR: about 3/2 at CR ≤ 5, 4/3 at CR 6–12, 5/3 above.
  - Optionally convert the multi-stage leads too.
  - With crDc, a novice party should almost always lose act I's key challenge.
- **Tests:** the preview's overall chance equals the exact computation, and a simulated challenge run matches it statistically; preview == actual per round; determinism.

## Wave 3

### Track B: balance (sims)
- Extend the crusader policy to delve, recruit (with sign-on fees) and follow the phases.
- Tune toward:
  - **XP:** 3 levels per phase. The levels in the Interpretations are the target, and `XP_BY_LEVEL` is set from the observed income.
  - **Deaths:** about 70–80% of runs die before the Crisis is decided.
  - **Act losses:** of the runs alive at each act's deadline, about half lose that act.
  - **Dungeons:** they pay off for levels but carry about 2× the risk.
  - **Novices:** a level-1–3 party fails act I's prevention almost always.
- Update `docs/notes/economy-report.md` and `docs/notes/crisis-report.md`.

### Review
- One code review of the whole plan, then a fix round, as before.
