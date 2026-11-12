# Plan 5b: The Crisis, run end and legacy

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give each world a campaign to win or lose (design §10b) and give each run an ending. Every world rolls one **Crisis**: a villain from data with a **three-act plot**, each act due about 100 days after the last. The party first hears of trouble through tavern rumours, a road omen or a notable person, and then **learns the plan** at a revealed site. Each act has its own hidden **act site**. **Clues** narrow it from a land to the site, and an extra clue reveals a **weakness** that gives the Edge there. A multi-stage site situation **thwarts** the act. The due day has **moderate leeway**: every 10 days late makes the site harder, and 30 days late the act fails. Stopping all three acts wins the campaign, and a failed act loses it. Either ending shows an end screen with a run summary, and **"Keep playing"** continues with the same party. A **party wipe** ends the run for good. The game gets **three save slots** with auto-save, and a minimal **legacy**: a Hall of the Fallen that records each run. Finally a simulation checks that a scripted party can win in time, and the clue and deadline numbers are tuned lightly.

**Architecture:**
- **Content (all JSON, no functions):**
  - New kind `villains` in `data/claude/villains.json`. Each villain has its threats, a names table, an omen line, the plan, three acts (name, goal, site type, placement hints, clue, thwarted and failed texts) and a victory text.
  - **Crisis site types** are ordinary `poiTypes` with `weight: 0` (so they are never drawn as normal POIs) and category `quest`, in `data/claude/crisis-sites.json`. Their names go in `data/claude/crisis-names.json` (`partsTables`).
  - **Reveal situations, act situations and road omens** are ordinary situations in `data/claude/crisis-situations.json`. Reveal and act situations are `site: true`. Omens name their villain (`villains: [id]`).
  - New encounter effects: `learnPlan`, `crisisClue` and `thwartAct`.
- **Engine, all pure (`src/engine/crisis/`):**
  - `generate.ts`: the villain, the reveal site, the three act sites and their due days, rolled once per world.
  - `status.ts`: the derived phase, lateness and failure, the post-step news, and the `crisisInfo` view model.
  - `progress.ts`: learning the plan, clues and thwarting (the effects), and which crisis sites are hidden or quiet.
  - `clues.ts`: rumours, the summons on arrival, and omens.
  - `ending.ts`: the party wipe, the run summary and the Hall record.
- **Nothing ticks.** The rolled plot is stored once: the villain, the site POI ids and the due days. Progress stores only what the party did: the day it learned the plan, clues per act, and the day each act was thwarted. Whether an act is late or has failed, and whether the Crisis is won or lost, is derived from the day. Journal lines for crossings (an act due soon, due, failed) come from a post-step pass, like `siteNews`.
- **Crisis sites are new POIs** added to `world.pois` when the Crisis is rolled. They use their own salted stream, so the rest of the world is unchanged. From then on they use the existing site machinery: discovery, paths, `visitPoi`, `harden` and one visit per arrival.
- **State v11:** a single shape change in T2 (`GameState.crisis`), so every track compiles against the same `GameState`.
- **The UI only renders view models** (`crisisInfo`, `crisisDeadlines`, `runSummary`, `slotSummary`). Phases, lateness and refusals are worked out in the engine. Save slots and the Hall live in `localStorage`, handled by the UI (`src/ui/saves.ts`, `src/ui/hall.ts`); their records are built by pure engine functions.

**Tech stack:** unchanged. pnpm, Vite, React 19, strict TypeScript, zod 4, Vitest with jsdom and Testing Library.

**Context:**
- Design: §6 (POIs, site cycles, discovery, "Persistent world with successive parties"), §7 (situations, site situations, Edge and Exposed), §10b (the Crisis, the danger ramp as built), §11 (run end on a party wipe, save and load) and §12.
- `docs/solo-dm-notes.txt`: clue points unlock the BBEG's lair (2–4 of them), and collecting more buys a secret weakness or a hidden treasure. Only generate the BBEG once enough clues are found. Barkeeps and bar visitors give campaign clues. BBEGs grow more desperate as they are damaged.
- `docs/design-doc.txt`: soft time limits, and failure costs that stop short of death.
- Previous plan: `2026-11-13-plan-5a-progression.md`.

**Conventions:**
- **TDD, lighter testing policy** (~0.4–0.6× test-to-code). Write the listed acceptance tests first, then make them pass.
  - Keep: preview == actual, determinism, the migration, content validation, and a few world statistics.
  - UI: one smoke test per panel plus the critical interactions.
  - Never pin tuning values in tests, skip exhaustive edge cases, and don't prune existing tests.
  - Engine tests use `src/engine/test-fixtures.ts`; only `src/content/*.test.ts` reads the bundled data.
- **Constants:** every balance number goes in `src/engine/constants.ts`, in a section named after the module that uses it, with a one-line comment. Add a row to `docs/notes/constants.md` for each new data-file knob. UI-only numbers (the slot count, the Hall's cap) stay in their UI modules.
- **Vocabulary** (id lists, enums, `CRISIS_ACTS = 3`) goes in `src/schema/types.ts`. The schemas never import the engine.
- **Before each commit:** run `pnpm format`, plus `pnpm schemas` after changing `src/schema/`.
- **Committing:** commit after each task with `git add <paths>`. Never use `git add -A`, and never push. If `index.lock` exists, wait and retry.
- **Private data:** never commit anything from `data/imported-private/`. Villain, site and act names and texts are original; nothing comes from published settings or adventures.
- **Worktree agents:** worktrees get created from an old commit. Before anything else, run `git checkout -B plan5b-<track> <base>`, where `<base>` is the commit the coordinator names (T2's commit on `rebuild`, or a merge-point commit). Then check `git log -1` and stop if it is wrong.
- **Shared UI files:** other agents may be editing the UI. Re-read a component before changing it, and apply your change to the current markup.
- **Strings:** new UI strings go in `src/ui/i18n/en.ts` only. Japanese is not needed (it falls back to English); don't add `villains` to `TRANSLATABLE_KINDS`.
- **Day shorthand:** no space between a number and "d" ("37d").

---

## Tracks and merge points

```
T1 → T2 (on `rebuild`) ──┬── Track E: E1 → E2 ═M1═ → E3 → E4 → E5 ═ME═
                         ├── Track K: K1 → K2 → K3 ═MK═
                         └── Track U: U1 → (needs M1) U2 → (needs ME) U3
                                          all merged → I1 → I2
```

- **T1 and T2** run first on `rebuild`. Tracks E, K and U then run in their own worktrees, branched from T2.
- **M1** (after E2): the Crisis is rolled for new games and old saves, and `crisisStatus`, `crisisInfo` and the post-step news exist. It merges to `rebuild` at once, and U rebases onto it before U2.
- **ME, MK:** each track merges back to `rebuild` with `git merge --no-ff` once its last task is green. U3 needs ME. Track U merges as MU after U3.
- **Track K** needs only T1's schemas. Its content tests walk situations by schema. The world statistic that needs the generator (act 1 within reach) waits for I1.
- **Conflict hot spots:**
  - `src/engine/state.ts` (the action switch and the post-step passes): append-only, one line per action or pass.
  - `encounters/run.ts`: E3 (crisis-site hardening and the weakness Edge at `startEncounter`) and E4 (the omen filter in `drawEncounter`). Keep each change to a call into `crisis/`.
  - `encounters/effects.ts` (E3 only), `world/explore.ts` (E3 only), `town/rumours.ts` (E4 only).
  - `world/pois.ts`: E1 extracts `freeSpots`, and E3 adds the hidden-site filter to `poisToDiscover` and `anyUndiscovered`.
  - `src/ui/App.tsx`: U1, U2 and U3 change it in turn, all on Track U.
- **I1 and I2** run on `rebuild` after everything has merged.

---

## T1. Vocabulary and content schemas

**Files:**
- Modify: `src/schema/types.ts`, `content.ts`, `encounter.ts` (effects and the situation field); `src/content/build.ts` (`emptyContent`); `src/engine/test-fixtures.ts`.
- Create: `src/schema/crisis.ts` (villains, the Crisis state, and the Hall's run record).
- Generate: `data/_schema/*.schema.json` (`pnpm schemas`).

**Vocabulary (`types.ts`):** `CRISIS_ACTS = 3`; `RUN_ENDINGS = ['won', 'lost', 'fallen']`.

**Content kind `villains`, `VillainSchema`:**
- `{ id, name ("The Ashen Prophet"), names?: partsTables id (the villain's own name, e.g. "Morvaine"), weight (default 1), threats: threat id[] (favoured where they hold a land), summary (one line for the panel), omen (what a notable person or a rumour says before the plan is known), plan (logged in full when it is learned), reveal: poiTypes id (where the plan is learned), acts: [act, act, act], victory (shown when all three are thwarted), notes? }`.
- **Act:** `{ id, name ("The Opened Graves"), goal ("wake the dead of the old barrow-field"), site: poiTypes id, biomes?: Biome[] (favoured terrain), seat?: boolean (placed in a kingdom seat's domain), clue ("{villain}'s diggers have been seen in {land}."), thwarted (text), failed (text: shown on the game-over screen) }`.
- Text slots: `{villain}`, `{land}`, `{site}`, `{seat}`.
- Refine: exactly `CRISIS_ACTS` acts, with distinct act ids and distinct site types.

**Encounter effects (`encounter.ts`):**
- `learnPlan`: `{ effect: 'learnPlan' }`: the party learns the villain's plan. It only works in the Crisis's reveal situation.
- `crisisClue`: `{ effect: 'crisisClue', amount: 1–2 (default 1) }`: a clue to the current stage of the Crisis (E3).
- `thwartAct`: `{ effect: 'thwartAct' }`: thwarts the act whose site is being visited. It only works there.

**Situations:** an optional `villains: id[]` (default []). A situation that names villains is an omen: it is drawn on the road only while one of those villains' Crisis is undecided (E4).

**Crisis state (`crisis.ts`, used by T2):**
- `CrisisActStateSchema = { id (the villain's act id), poi, due: int ≥ 1 }`.
- `CrisisStateSchema = { villain, name (the rolled name, "Morvaine, the Ashen Prophet"), startDay: int ≥ 1, reveal: poi id, acts: CrisisActState[] (length 3), learned: day | null (default null), clues: int ≥ 0 [3] (default [0, 0, 0]; the engine caps them), thwarted: (day | null)[3] (default all null), endSeen: boolean (default false: the won or lost screen was dismissed with "Keep playing") }`.
- `RunRecordSchema` (the Hall, U3): `{ id, seed, ending: RunEnding | null, day, villain: string | null, acts: ('thwarted' | 'failed' | null)[], party: { name, ancestry, classId, level, fallen: boolean }[], place: string, recorded: string (an ISO date the UI stamps) }`.

**Fixtures:** one villain with a reveal type and three act site types (`weight: 0`, category `quest`). The reveal situation is one stage with a `learnPlan` outcome. Each act situation is two stages: an approach, then a finale check whose success has `thwartAct`. Add one omen naming the villain, with a `crisisClue`.

**Tests:**
- A villain with two acts fails, and so does one with a repeated site type.
- `crisisClue` rejects an amount of 3.
- `pnpm schemas` leaves no diff.

**Commit:** `add villain, crisis-state and crisis-effect schemas`

## T2. GameState v11 and the migration

**Files:** modify `src/schema/state.ts`, `src/engine/save.ts` (+ tests), `src/engine/state.ts` (`newGame`).

**State v11** (`version: z.literal(11)`, `CURRENT_SAVE_VERSION = 11`): `crisis: CrisisStateSchema.nullable().default(null)`. It is null only when no villain fits the content (test fixtures without villains). E1 rolls it.

**Migration `v10ToV11(raw, content)`:** sets `crisis: null` for now. E1 makes it roll the Crisis from the save's world seed, starting on the save's current day.

**`newGame`:** sets `crisis: null` for now (E1 rolls it).

**Tests:**
- A v10 fixture migrates and parses with the party, gold, goods and world untouched.
- A v1 save chains through to v11.
- Migrating twice gives identical output.

**Constraint:** this is the only task that changes the state shape.

**Commit:** `GameState v11: the Crisis`

---

## Track E: the Crisis engine and run end

### E1. Rolling the Crisis

**Files:** create `src/engine/crisis/generate.ts` and its tests; modify `world/pois.ts` (extract `freeSpots`), `src/engine/state.ts` (`newGame`), `src/engine/save.ts` (`v10ToV11`), constants.

**Interfaces:**
- `generateCrisis(world, content, { startDay, start }) → { world, crisis } | null`. It uses its own salted stream (`CRISIS_SALT`, from the world seed), so a world always rolls the same Crisis. It returns null without villains.
- **Villain:** drawn by `weight × CRISIS_THREAT_FAVOUR` (3) when one of its threats holds a land in this world. Its name comes from its `names` table plus its title.
- **Placement:** all four sites go on the start's island (the mainland), measured in hops over the domain adjacency (`territory(content).adjacent`):
  - the reveal site: `CRISIS_REVEAL_HOPS` [1, 2] from the start (0 if nothing fits);
  - act I: `CRISIS_ACT1_HOPS` [2, 5] from the start;
  - acts II and III: at least `CRISIS_ACT_SPREAD` (3) hops from the previous act. An act with `seat: true` goes in a kingdom seat's domain (not the start's).
  - Within those bounds a domain weighs ×`CRISIS_THREAT_FAVOUR` where the villain's threat holds its land or the act's `biomes` match its land.
  - Each site takes a free spot (`freeSpots`: at least `POI_MIN_KM` from the settlement and `POI_SPACING_KM` from every other POI). Without one, the next-best domain is used.
- **The new POIs** get ids `poi-<n>` continuing the count. Each has its type and category (`quest`), threat 0, `discovered: false`, and a name from the type's names table with `{villain}` and `{land}` filled.
- **Due days:** act n (1–3) is due on `startDay + n × CRISIS_ACT_DAYS (100) ± CRISIS_DUE_JITTER (10)`, seeded.
- **Wiring:** `newGame` rolls it with `startDay: 1` after the starting settlement is known. `v10ToV11` rolls it with `startDay` set to the save's day and `start` set to its location (or, on the road, the journey's `from`).

**Tests:**
- Rolling is deterministic for a seed.
- It adds exactly four hidden POIs of the villain's types on distinct free spots, and every other POI is identical to `generateWorld`'s.
- Due days rise about 100 apart.
- Act I's hop range holds on seeds 1–20.
- A seat act lands in a seat domain.
- A migrated day-150 save has its first due day after day 150.
- It returns null with no villains.

**Commit:** `roll the Crisis: villain, reveal site, three act sites and due days`

### E2. Status, deadlines and news  ⇒ merge point M1

**Files:** create `src/engine/crisis/status.ts` and its tests; modify `src/engine/state.ts` (the post-step pass and the `acknowledgeEnd` action), constants.

**Interfaces:**
- `crisisStatus(crisis, day) → CrisisStatus`, fully derived:
  - `{ phase: 'unknown' | 'act' | 'won' | 'lost', act: 0 | 1 | 2 | null, due, daysLeft, late (days past due, ≥ 0), lateDc, failsOn, clues, weakness, endedDay }`.
  - The current act is the first one not thwarted. It is **lost** once `day > due + CRISIS_LEEWAY_DAYS` (30), even if the plan was never learned: the clock runs from the start. It is **won** when all three are thwarted.
  - `lateDc = ceil(late / CRISIS_LATE_STEP_DAYS)` (10): +1 for 1–10 days late, +3 for 21–30.
  - `phase` is `unknown` until `learned`, then `act`.
- `crisisNews(before, after)` runs in `step` after `siteNews`. It logs each crossing once, in day order:
  - `CRISIS_WARN_DAYS` (14) before the due day: "Act I, The Opened Graves, is due in 14d.";
  - on the due day: "...is due today: each 10d late from now makes it harder.";
  - on failing, the act's `failed` text and "The Crisis is lost." (tone `bad`).
  - Warnings need the plan learned; the failure line always shows (before the plan is known it reads "Far away, something you never learned of is finished.").
- `crisisInfo(state, content) → CrisisInfo | null`, the panel's view model:
  - the villain's name and summary (once learned);
  - the reveal site's name (when discovered and the plan unknown);
  - three acts, each `{ n, name, goal, where: land name | site name | null, due, daysLeft, late, lateDc, failsOn, clues, needs: CRISIS_SITE_CLUES, weakness, thwartedDay, failed }`, with the place known only for the current act;
  - `ended: { outcome, day } | null` and `showEnd` (ended and not `endSeen`).
- `crisisDeadlines(state, content, arrivalDay, to) → { act, due, failsOn, inTime } | null`: for the road preview, when `to` is the current act's site.
- **Action `acknowledgeEnd`** ("Keep playing"): sets `endSeen`.

**Tests:**
- The phase at the boundary days: due, due + 1, due + leeway, and due + leeway + 1.
- Thwarting act I late leaves act II's due day where it was.
- The Crisis is lost without the plan ever being learned.
- A step that crosses two news days logs both, in order, and only once.

**Commit:** `crisis status: derived phases, lateness and failure; news lines`

### E3. Learning the plan, clues and thwarting

**Files:** modify `encounters/effects.ts`, `encounters/preview.ts` (chips), `encounters/run.ts` (`startEncounter` options), `world/explore.ts` (`visitPoi`, `visitRefusal`), `world/pois.ts` (the hidden-site filter), constants; create `src/engine/crisis/progress.ts` and its tests.

**Behaviour:**
- **`learnPlan`** at the reveal site, once:
  - sets `learned` to the day;
  - logs the villain's `plan` (tone `crit`) and act I's `clue`;
  - gives act I its first clue: the land is now known.
- **`crisisClue`:**
  - Before the plan is learned, it reveals the reveal site (`revealPois`).
  - During an act, it adds to that act's clues, capped at `CRISIS_WEAKNESS_CLUES` (3). At `CRISIS_SITE_CLUES` (2) the act site is revealed (with the usual `XP_DISCOVER`). At 3 the weakness is known: "You know Morvaine's weakness at the Bone Choir: you will go in with the Edge."
  - After the Crisis ends, it does nothing.
- **`thwartAct`**, only at the current act's site:
  - sets `thwarted[i]` to the day;
  - grants `XP_THWART × (i + 1)` (constants; `grantXp`);
  - logs the act's `thwarted` text;
  - gives the next act its first clue (its land), with its `clue` line.
  - After act III it logs the villain's `victory`, and the Crisis is won.
- **Crisis sites at `visitPoi`:**
  - The current act's site is hardened with `dcBonus = lateDc` (with the day's danger, through `harden`). With the weakness known, it starts with the Edge (`startEncounter` gains `{ dcBonus, position }` options).
  - Other crisis sites refuse with the new block `'quiet'`: the reveal site once the plan is learned, a thwarted act's site ("The plot at {site} is broken."), a future act's site, and every site after the Crisis ends.
- **Discovery:** crisis sites are left out of `poisToDiscover` and `anyUndiscovered` (road clues, rumours, paid knowledge, exploring). There is one exception: once the current act has at least one clue, exploring that act site's own domain can find it, as a normal search. A `hidden` set is passed in from `crisisHidden(state)`.
- **Preview chips:** "Learn the plan", "+1 clue: Act II", "Thwart Act I".

**Tests:**
- `learnPlan` works once.
- Two clues reveal the site, and the third gives the Edge at its start.
- Thwarting act I gives act II its land.
- At 15 days late a DC 12 check shows and rolls 2 higher than on time, danger included (preview == actual).
- An act site isn't found by rumours, road clues or paid knowledge, only by exploring its domain with a clue in hand.
- A thwarted site refuses a visit.
- Thwarting act III wins.

**Commit:** `learn the plan, follow clues, thwart acts at their sites`

### E4. Rumours, the summons and omens

**Files:** create `src/engine/crisis/clues.ts` and its tests; modify `town/rumours.ts` (outcomes and resolution), `travel/journey.ts` (next to `contractsOnArrival`), `encounters/run.ts` (`drawEncounter`), `world/geo.ts` (`compass(from, to)`), constants.

**Behaviour:**
- **Rumours,** on a success or better:
  - While the plan is unknown and the reveal site hidden, the site clue is the reveal site instead of an ordinary one.
  - During an act, in the act's land: +`CRISIS_RUMOUR_CLUES` (1) clue, or +2 on a critical success.
  - During an act, anywhere else: one line pointing the way: "Talk of Morvaine's doings comes from the north-east, out of Tradal." (`compass` from here to the land's label). It gives no clue point.
  - The preview's success line says which applies ("…and a clue to Morvaine's plot"), so preview == actual.
- **The summons:** from day `CRISIS_SUMMONS_DAY` (15), the first arrival in a settlement while the plan is unknown and the reveal site hidden tells the villain's `omen` and reveals the reveal site. The teller is a notable person who lives there (by role priority: elder, reeve, mayor, priest, captain of the watch, sage, innkeeper), or else "a frightened traveller". It happens once, since the reveal site is then discovered. It is the guaranteed fallback.
- **Omens:** a situation with `villains` is drawn on the road only while one of those villains' Crisis is undecided. It weighs ×`CRISIS_OMEN_FAVOUR` (3) on a road touching the current act's land. Its `crisisClue` works as in E3.

**Tests:**
- A rumour success in the act's land adds a clue, and its preview said so.
- A rumour success elsewhere logs a direction and adds no clue.
- The summons fires once, not before day 15, and not once the reveal site is known.
- An omen is never drawn for another villain or after the Crisis ends.

**Commit:** `crisis clues from rumours, a summons on arrival, and road omens`

### E5. Party wipe and run summaries  ⇒ merge point ME

**Files:** create `src/engine/crisis/ending.ts` and its tests; modify `src/engine/state.ts` (the guard and the post-step line).

**Interfaces:**
- `partyWiped(state)`: no living member (every member at `MAX_EXHAUSTION`). A downed member (0 HP) is alive: a party that is all down still camps and recovers.
- **`step` when wiped** returns the state unchanged for every action. A step that wipes the party logs once: "The last of the party falls. The road goes on without them." (tone `crit`).
- `runEnding(state) → 'won' | 'lost' | 'fallen' | null`: fallen first, then the Crisis's outcome.
- `runSummary(state, content) → RunSummary`:
  - `{ ending, day, villain, acts: { name, thwartedDay, failedDay }[], party: { name, ancestry, classId, level, fallen }[], gold, sitesDiscovered, sitesCleared, xp (the party's total), lastLines (the journal's last 5) }`.
  - Sites cleared are counted from `clearedDay`; nothing new is stored.
- `runRecord(state, content) → RunRecord` (for the Hall): the summary trimmed to `RunRecordSchema`, with `id` = the game seed, so a run's record is updated in place, never duplicated.

**Tests:**
- A wiped party can't travel, and a downed one isn't wiped.
- A won Crisis summary lists three thwarted days.
- `runRecord` is the same for the same state.
- A wiping step logs the line once.

**Commit:** `run end: party wipe, run summary and the Hall record`

---

## Track K: villains, sites and situations

### K1. Villains, reveal sites and names

**Files:** create `data/claude/villains.json`, `data/claude/crisis-sites.json` (kind `poiTypes`), `data/claude/crisis-names.json` (kind `partsTables`), `data/claude/crisis-situations.json` (the reveal situations; K2 and K3 add to it).

**Three villains** (original names and texts):
- **The Ashen Prophet** (dark cult, restless dead): a necromancer who would wake the barrow-kings.
  - Reveal: a burned chapel where the cult's ledger survived.
  - Acts: I *The Opened Graves* (a desecrated barrow-field), II *The Bone Choir* (a hidden ossuary where the dead learn to march), III *The Ashen Crowning* (the royal crypt under a seat; `seat: true`).
- **The Pretender's Hand** (pretender, bandit lord): a disinherited heir buying swords for a crown.
  - Reveal: a waylaid courier's camp.
  - Acts: I *The Stolen Seal* (a forger's den), II *The Bought Garrison* (a mercenary muster), III *The False Coronation* (a seat).
- **The Drake-Speaker** (drake brood, giant clan): an outcast who would wake an old wyrm.
  - Reveal: a shepherd's hut under a scorched hill.
  - Acts: I *The Stolen Clutch* (a brood cave), II *The Burning Beacons* (watch-fires on the heights), III *The Waking* (a mountain hall; `biomes: mountains, hills`).

**Data:**
- **Crisis site types:** one per reveal and act (12), each with `weight: 0`, `category: 'quest'`, `hostile: false`, a `pathDanger` of 1–2, its names table and its situations.
- **Names:** about 8 per villain name table, and 6 or more per site table, with `{land}` where it reads well.
- **Reveal situations** (3): two stages each. Every ending except "leave" has `learnPlan`. A check decides the cost: a trap, a survivor to tend, a guard to slip past.

**Tests:** the content suite validates the files.

**Commit:** `three villains, their reveal sites and names`

### K2. Act situations

**Files:** modify `data/claude/crisis-situations.json`.

**Content:**
- **Nine act situations**, `site: true`, 3–4 stages each, like the dungeon delves.
  - **Approach:** at least two options that trade off different resources (stealth for time, force for HP, gold for a bribe, lore for the Edge).
  - **Finale:** a check whose success and critical success have `thwartAct`, and whose partial thwarts the act at a cost (HP, a level of exhaustion, or camaraderie).
  - **Failure** throws the party out hurt, without `thwartAct`, so it can try again on a later arrival.
- **Act III escalates:** the villain grows desperate (solo notes), so act III has one more stage than act I.
- **Base DCs stay modest (11–14):** lateness and the danger ramp (+20–60% by days 100–300) add the rest.
- **Rewards:** gold. A tier-1 accessory at act I and II critical successes, and tier 2 at act III. XP comes from `thwartAct`.

**Tests:** the content suite validates the files and checks playability and quality.

**Commit:** `act situations for the three villains`

### K3. Omens and content checks  ⇒ merge point MK

**Files:** modify `data/claude/crisis-situations.json`; create `src/content/crisis.test.ts`.

**Content:** six road omens, two per villain: one hostile and one neutral, each naming its villain, with a `crisisClue` on a success. For example, grave-robbers with a cart of bones, or a courier with a forged seal.

**Content checks (`crisis.test.ts`):**
- Every villain's threats, reveal type and act site types exist. Those types have `weight: 0` and situations.
- Every act situation can reach `thwartAct` from its start.
- Every reveal situation has `learnPlan` on every ending except a 'leave' (walk the stage graph).
- `thwartAct` and `learnPlan` appear in no other situation, and `crisisClue` appears only in omens and site situations.
- Every omen has a `crisisClue`.

**Commit:** `crisis omens and content checks`

---

## Track U: saves, the Crisis panel and end screens

### U1. Save slots

**Files:** create `src/ui/saves.ts`, `src/ui/SavesMenu.tsx` (+ test; it replaces `NewPartyButton`), `src/engine/slots.ts` (`slotSummary`, + test); modify `src/ui/useGame.ts`, `src/ui/App.tsx`, `src/ui/i18n/en.ts`.

**Behaviour:**
- **Three slots** (`SLOT_COUNT`, a UI constant).
  - Slot 1 is the existing key `forgotten-heroes/save/v1`, so nobody's save moves. Slots 2 and 3 are `forgotten-heroes/save/v1/slot-2` and `/slot-3`.
  - The active slot is remembered in `forgotten-heroes/active-slot`.
  - Each slot keeps its own unreadable copy at `<key>/unreadable` (slot 1's is the existing `UNREADABLE_SAVE_KEY`).
- **Auto-save** writes to the active slot after every state change, as now. There is no manual save and no copy between slots (ironman, design §6).
- **The Saves menu** (top bar, where "New party" is): each slot shows its `slotSummary` or "Empty".
  - `slotSummary(state, content)`: the names, day, levels, gold and a Crisis line ("Act II · 34d left", "Crisis won", "Crisis lost", "Fallen").
  - Actions: Continue, New party here (confirm when it holds a run that hasn't ended) and Delete (confirm).
  - An unreadable slot says so and keeps its copy.

**Tests:**
- One smoke test: switching to slot 2 loads its save, and a new party in slot 2 leaves slot 1 untouched.
- A `slotSummary` unit test.

**Commit:** `three save slots with auto-save`

### U2. The Crisis panel (after M1)

**Files:** create `src/ui/CrisisPanel.tsx` (+ test); modify `src/ui/App.tsx` (left column, under contracts), `src/ui/DayMark.tsx`, `src/ui/world/RoadsOut.tsx`, `src/ui/world/PoiPanel.tsx`, `src/ui/world/WorldMap.tsx`, `src/ui/i18n/en.ts`.

**Behaviour:**
- **Before the plan is known**, the panel is hidden, unless the reveal site is known: "Something stirs. {site} may hold answers."
- **Once the plan is known:**
  - Header: the villain's name and summary.
  - Three act rows, each with its name and goal:
    - a thwarted act: "✓ day 74";
    - the current act: where it is ("somewhere in Tradal", or the site's name), clues "1 / 2 · weakness at 3", and "due day 104 · 37d left" (bad tone under 14d);
    - when late: "Late 6d: DC +1 at the site · fails on day 134";
    - a future act: name and goal only.
- **Top bar:** a small mark after the day, "Act I · 37d" (bad tone under 14d or late), with `crisisInfo` in its tooltip.
- **Roads out:** a road to the current act's site shows its arrival day against the due day, like contract deadlines (`crisisDeadlines`).
- **Site panel:** at an act site it shows "Act I of Morvaine's plot", lateness and the weakness. A quiet site shows its refusal.
- **Map:** discovered crisis sites get a distinct ring; thwarted ones are dimmed.
- **After the Crisis ends** (once dismissed), the panel shows one line: "Morvaine is defeated (day 288)" or "Morvaine's plot is complete (day 331)".

**Tests:** one smoke test: the current act renders with its due day and clues, and a late act shows its DC line.

**Commit:** `crisis panel, top-bar mark, deadlines on the road and at the site`

### U3. End screens and the Hall of the Fallen (after ME)

**Files:** create `src/ui/EndDialog.tsx` (+ test), `src/ui/hall.ts`, `src/ui/HallOfFallen.tsx`; modify `src/ui/App.tsx`, `src/ui/SavesMenu.tsx`, `src/ui/i18n/en.ts`.

**Behaviour:**
- **Victory** (won, not yet dismissed): the villain's `victory` text, then the `runSummary`:
  - the acts as a timeline (thwarted days);
  - the party roster with levels and who fell;
  - days, gold, and sites discovered and cleared.
  - Buttons: **Keep playing** (dispatches `acknowledgeEnd`) and **New party** (the new-party flow in this slot).
- **Game over** (lost, not yet dismissed): the failed act's `failed` text and the same summary. Buttons: **Keep playing with this party** and **New party**.
- **Fallen** (wiped): "The party has fallen", the last 5 journal lines and the summary. Buttons: **New party** and **Look back** (closes the dialog for this session). A banner stays under the top bar: "The party has fallen · New party".
- **The dialog** is `role="dialog"` with focus on its first button. Escape means Keep playing, or Look back.
- **The Hall:**
  - The first time an ending shows, `runRecord` is written to `forgotten-heroes/hall/v1`. Records are validated with `RunRecordSchema` on load (invalid ones are dropped), keyed by id and capped at 50.
  - A run that ends again is updated in place: a party that lost the Crisis and later fell is recorded as fallen, with the Crisis lost.
  - The Saves menu lists the Hall: names, classes, levels, days, the ending and the villain.

**Tests:**
- One smoke test per ending: victory's Keep playing dispatches `acknowledgeEnd`, and the fallen dialog has no Keep playing.
- The Hall holds one record per run.

**Commit:** `victory, game-over and fallen screens; the Hall of the Fallen`

---

## Integration (after all tracks merge)

### I1. Crisis simulation, a world statistic, light tuning

**Files:**
- Modify: `src/engine/travel/trader.ts` (a `crusader` policy), `src/content/world.test.ts` (the statistic).
- Create: `src/content/crisis.sim.test.ts` (the report behind `CRISIS_REPORT=/tmp/crisis.md`; guard tests always run), `docs/notes/crisis-report.md`.
- Tune: `src/engine/constants.ts` and the act DCs in `data/claude/crisis-situations.json`.

**Work:**
- **The `crusader` policy** (a sim policy, not a rule). It trades as the trader does, but:
  - goes to the reveal site once it is known;
  - with an act's land known, travels there, listens at its taverns and explores its domains;
  - with the site known and the party fit (HP ≥ 75%, no exhaustion), goes there and visits on every arrival until the act is thwarted.
- **The report** (seeds 1–20, up to day 360, crusader and trader):
  - the day the plan is learned (median, P90) and how it was found (rumour, omen, summons);
  - for each act, the day its site was found, the day it was thwarted, and the days to spare or late;
  - won, lost and fallen shares, levels at each act, and deaths;
  - the finale success rate by act.
- **World statistic** (`world.test.ts`, seeds 1–50): the Crisis rolls on every seed, and act I's site is 4–12 steady days from the start in at least 90% of worlds.
- **Targets:**
  - the plan is learned by day 25 in at least 90% of runs;
  - the median act site is found with at least 30 days to spare;
  - the crusader wins 40–75% of runs, and fewer than 25% of acts are thwarted late;
  - the trader, which ignores the Crisis, loses nearly every run (a sanity check);
  - no villain's win rate is more than 2× another's.
- **Tuning order:** act DCs, then the clue rules (`CRISIS_RUMOUR_CLUES`, `CRISIS_SUMMONS_DAY`), then `CRISIS_LEEWAY_DAYS` and `CRISIS_LATE_STEP_DAYS`. `CRISIS_ACT_DAYS` (about 100) is the designer's: don't change it; report what it would take instead.
- **Gates:** the existing guard tests stay green, and crusader seeds 1–3 run 120 days without throwing and keep a valid state.

**Commit:** `sim: a crusader policy for the Crisis; tune clues and act DCs`

### I2. Docs and full verification

**Files:**
- `docs/plans/2026-11-12-rebuild-design.md`: §6 (crisis sites; "Persistent world" with the Hall as built and the rest still later), §9 (the Crisis panel, end screens, save slots), §10b (the Crisis as built), §11 (run end and save slots done), §12 (open questions).
- `docs/notes/constants.md` and `docs/notes/crisis-report.md`.
- `CLAUDE.md`: one line under content rules for `villains` and the crisis files, and the `CRISIS_REPORT` command next to the economy report's.

**Work:**
- Write the rules as built, with their numbers and constants, into the design doc, along with the decisions below (and any the designer changes).
- Run `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
- Run `pnpm test` once with `data/imported-private/` moved aside, then restore it exactly.

**Commit:** `document the Crisis, run end and save slots (Plan 5b)`

---

## Decided overnight (please review)

The designer asked us to keep going and make reasonable calls. Each of these is easy to change later; most are a constant or a data value.

1. **One Crisis per world, chosen by the world seed:** a villain from `villains` by weight, ×3 where one of its threats holds a land, so it fits the world's troubles. The same world always rolls the same villain. This plan writes three villains.
2. **Crisis sites are new POIs,** placed when the Crisis is rolled: a reveal site and three act sites. They are weight-0 `quest` types, all on the mainland. The reveal site is 1–2 domains from the start, act I is 2–5, and each later act is at least 3 domains from the one before. An act marked `seat` goes under a kingdom's seat. The rest of the world is unchanged. They don't cycle, feed threat or fill up again.
3. **Deadlines are fixed calendar days:** act n is due on day `start + 100n ± 10`. Thwarting an act early doesn't move the next one's due day, so dawdling on one act eats into the next. The clock runs from day 1, even before the plan is known.
4. **How the party first hears:** a tavern rumour's site clue becomes the reveal site, a road omen can point there, and from day 15 a notable person takes the party aside on its next arrival anywhere (the guaranteed fallback). The plan itself is learned only by visiting the reveal site.
5. **Clues follow the solo notes' clue points.** Each act starts with one clue, its land: from learning the plan for act I, and from thwarting the previous act for the others. A second clue reveals the site; it comes from a rumour in that land, a road omen, or exploring the right domain, which can find the site directly. A third reveals the villain's **weakness**: the party starts the site with the Edge (advantage earned, not given). Rumours elsewhere point the way by compass direction. Ordinary clues, paid knowledge and exploring never find a Crisis site before its act.
6. **Thwarting is a 3–4 stage site situation** with a finale check. A success thwarts the act, a partial thwarts it at a cost, and a failure throws the party out to try again on a later arrival (one visit per arrival, as at every site). Thwarting pays `XP_THWART` × the act's number.
7. **Dawdling:** after the due day, every 10 days late adds +1 DC to every check at the act site, on top of the danger ramp. 30 days late the act fails. The journal warns 14d before the due day and on it.
8. **One failed act loses the Crisis** (to confirm).
9. **The Crisis doesn't touch the danger ramp** (to confirm). Act situations are written with modest base DCs (11–14), because the ramp already adds 20–60% by the time they are played.
10. **Display:**
    - a Crisis panel under the contracts;
    - a small "Act I · 37d" mark after the day in the top bar;
    - the due day on roads to the act site;
    - lateness and the weakness on the site panel;
    - a distinct ring on the map.
    Before the plan is learned only the reveal site shows, once known.
11. **End screens:**
    - Victory shows the villain's defeat. Game over shows the failed act's outcome.
    - Both show the acts' timeline, the party (levels, who fell), days, gold, and sites discovered and cleared.
    - Both offer **Keep playing** and **New party**. Each shows once (`endSeen`).
12. **Keep playing** continues the same world and party with no Crisis left. The remaining crisis sites lie quiet, the danger ramp goes on, and nothing else changes (no world consequences, as the designer said).
13. **A party wipe** means every member is dead (exhaustion 6). Downed isn't dead. The run ends for good: the engine refuses every action, the "fallen" screen offers New party or Look back, and the save stays in its slot as an ended run until it is replaced. There is no reload (ironman).
14. **Save slots:**
    - Three slots. Slot 1 is the existing `forgotten-heroes/save/v1` key, so no save moves.
    - Auto-save after every step. No manual save and no copying between slots (ironman).
    - The active slot is remembered.
    - Migrating to v11 rolls the Crisis for an old save, starting from its current day, so an old run gets the full 100 days for act I.
15. **Legacy is minimal:** a Hall of the Fallen in local storage records each run that ended (won, lost or fallen): names, classes, levels, days, the ending and the villain. A next party in the same world is not part of this plan.
16. **Every act is a site.** Deeds without a site (deliver a warning, escort an heir) are left for later. A deed can usually be written as a site situation for now.

## Design decisions to confirm with the user

1. **Should one failed act lose the whole Crisis?** As planned, an act that is 30 days past due fails, and with it the campaign. The alternative is that a failed act makes the next one harder (its site stronger, or its due day sooner), and only a failed act III loses.
2. **Should the Crisis touch the danger ramp?** It doesn't, as planned. A small suggestion: each thwarted act holds the ramp back one step (−10% from then on), as a reward the whole world feels. A lost Crisis could add +10% instead. Either is a world consequence, so it is left out unless wanted.
3. **Is the Hall of the Fallen enough legacy for now?** The design's fuller legacy is the next party in the same world 5–20 years later, with the fallen party's graves, rumours, gear in shops and grudges (§6). That would be a plan of its own.

## Out of scope

- The fuller legacy: successive parties in the same world, years passing, per-party modifiers.
- World consequences of a won or lost Crisis, and any Crisis effect on threats, kingdoms or the danger ramp.
- Deed acts without a site; more than one Crisis per world; a second Crisis after the first ends.
- Villains that move, react or grow stronger in response to the party (beyond lateness); real combat with the villain.
- Manual saves, save copies and cloud saves; exporting a save.
- Japanese strings for the new UI and content.
