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

### Track D: levelled work and dungeons
- **D1. Contracts get a level** (the party's best founder level ± 1, seeded with the board). Their pay and check DCs scale with it (`crDc`), and the board shows the level.
- **D2. Dungeons and lairs get a CR** at placement (by type, domain threat and distance from the start) that rises with power. The site panel shows it against the party's level.
- **D3. Delving.**
  - Enter starts a **delve**: 3–5 rooms (by type and size), each one a site situation, played in a row without leaving.
  - Every room is at the dungeon's CR, with about 2× an overworld encounter's risk (DCs from `crDc`, wounds ×2: `DELVE_RISK`).
  - Between rooms the party may **press on** or **withdraw**, keeping what it has found. Withdrawing costs no camaraderie: it is not fleeing.
  - The last room clears the site and pays the hoard, a random 1.5–2× (`DELVE_REWARD`) of a same-level contract's pay, in gold, precious goods and sometimes an accessory, plus `XP_CLEAR`.
  - The preview shows the rooms left, the CR and the hoard range.
- **D4. Content.** Room situations for the dungeon and lair types in `data/claude/poi-situations.json` (or a new `dungeon-rooms.json`): about 3–4 rooms per type family, plus a few generic ones.
- **Tests:**
  - Preview == actual for withdrawing and pressing on.
  - The hoard lies within its range.
  - A delve's determinism.
  - The migration if `GameState` changes.

### Track K: Crisis content and the tracker UI
- **K1. Per villain:**
  - A boss style (at least one recurring and one finale).
  - Lead site types and situations for acts II and III.
  - Rewritten key situations at the act's CR.
  - The open, hurry and failure texts, and surge flags where thematic.
  - Everything goes in `data/claude/` (`villains.json`, `crisis-sites.json`, `crisis-situations.json`, `crisis-names.json`).
- **K2. The endgame tracker panel** below the journal: permanent from act I's open day, and hidden before it. It shows each act's phase, the days left, the next step and the surge. One smoke test.

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
