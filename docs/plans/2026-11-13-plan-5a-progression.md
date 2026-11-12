# Plan 5a: Progression, gathering and the danger ramp

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the party reasons and ways to grow, and the world a reason to hurry (design §3, §4, §8, §10b). Characters earn **XP** from encounters, contracts, cleared sites and discoveries, and **level up** to 10 (HP, proficiency and a stat every other level, as in the prototype). The party **recruits** from taverns, the adventurers' guild and mercenaries, from 2 up to 6 members, paying a hiring fee and **daily wages**. A small party-wide **camaraderie** value suffers from unpaid wages, deaths and hunger, and a fractured party loses hired members. Each character wears one **accessory**, rolled from affix tables, whose declarative **rule hooks** bend a few rules (+1 to a skill, more carrying, Strain fading faster, a lucky reroll…). A broke party can **gather** a local good (timber, stone, fuel, food, healing herbs) for a day at a time, with the odds shown as outcome lines. Meanwhile a **world danger level** rises 10% every 50 days and makes encounters harder and more harmful. Finally the economy simulation is rerun with gathering and wages, and the 10 gp start is tuned lightly.

**Architecture:**
- **Content (all JSON, no functions):**
  - New kind `accessoryParts` in `data/procedural/accessories.json`: bases, prefixes and suffixes, each with a weight, a value and (affixes) one rule hook.
  - New kind `gatherRules` in `data/claude/gathering.json`: what can be gathered in which land, with which skill, DC and yield per tier.
  - `serviceRoles` gain optional `recruits` and `accessories` blocks (who hires out, who sells gear). `data/claude/service-roles.json` fills them for the inn, the adventurers' guild, mercenaries, Magic Items and the finesmith.
  - Encounter effects gain `xp`, `camaraderie` and `accessory` (loot).
- **Engine, all pure:**
  - `src/engine/rules/progression.ts`: XP table, level-ups, `grantXp`, default check XP.
  - `src/engine/world/danger.ts`: the danger level by day, and the snapshot transform that raises DCs and damage.
  - `src/engine/town/recruits.ts`, `src/engine/town/camaraderie.ts`: offers, hiring, wages, camaraderie and desertion.
  - `src/engine/gear/hooks.ts` (what a character's or the party's hooks add), `src/engine/gear/accessories.ts` (rolling, shops, equip/buy/sell).
  - `src/engine/world/gather.ts`: the gathering option and action.
- **Nothing ticks** (as in Plan 4). The danger level is derived from the day. Recruit and accessory offers are derived from (world seed, settlement, week), like the notice board. State stores only what the party did: XP, accessories owned, wages owed, offers taken, recent gathering per domain.
- **Level-ups and camaraderie losses from deaths happen after each `step`** (like `siteNews`), so XP and deaths can come from anywhere without each call site knowing about levels.
- **State v10:** a single shape change in T2, so every track compiles against the same `GameState`.
- **The UI only renders view models** (`characterSheet`, `recruitOffers`, `accessoryOffers`, `gatherOptions`, `dangerInfo`). Odds, prices and refusals are worked out in the engine.

**Tech stack:** unchanged. pnpm, Vite, React 19, strict TypeScript, zod 4, Vitest with jsdom and Testing Library.

**Context:** design §3 (characters, Strain, mood/morale/camaraderie notes, party 2–6), §4 (character gear), §8 (rule hooks for accessories and per-party modifiers), §10b (danger ramp, gathering, the 5a/5b split); `docs/notes/economy-report.md` (the 10 gp start: about a third broke by day 30; gathering is meant as the fallback income); the prototype's levelling (`git show v0.1.0-svelte-final:src/lib/utils/character-utils.ts`: HP by hit die + CON, +1 random stat on odd levels from 3rd). Previous plan: `2026-11-12-plan-4-towns-economy.md`.

**Conventions:**
- **TDD, lighter testing policy** (~0.4–0.6× test-to-code). Write the listed acceptance tests first, then make them pass. Keep: preview == actual, determinism, the migration, content validation, a few world statistics. UI: one smoke test per panel plus the critical interactions. Never pin tuning values in tests; no exhaustive edge cases; don't prune existing tests. Engine tests use `src/engine/test-fixtures.ts`; only `src/content/*.test.ts` reads the bundled data.
- **Constants:** every balance number goes in `src/engine/constants.ts`, in a section named after the module that uses it, with a one-line comment. Add a row to `docs/notes/constants.md` for each new data-file knob.
- **Vocabulary** (id lists, enums) goes in `src/schema/types.ts`. The schemas never import the engine.
- **Before each commit:** run `pnpm format`, plus `pnpm schemas` after changing `src/schema/`.
- **Committing:** commit after each task with `git add <paths>`. Never use `git add -A`, and never push. If `index.lock` exists, wait and retry.
- **Private data:** never commit anything from `data/imported-private/`. Accessory and recruit names are original or generic; nothing from published settings.
- **Worktree agents:** worktrees get created from an old commit. Before anything else, run `git checkout -B plan5a-<track> <base>`, where `<base>` is the commit the coordinator names (T2's commit on `rebuild`, or a merge-point commit). Then check `git log -1` and stop if it is wrong.
- **Shared UI files:** other agents may be editing the UI. Re-read a component before changing it, and apply your change to the current markup.
- **Strings:** new UI strings go in `src/ui/i18n/en.ts` only. Japanese is not needed (it falls back to English); don't add the new kinds to `TRANSLATABLE_KINDS`.
- **Day shorthand:** no space between a number and "d" ("2d").

---

## Tracks and merge points

```
T1 → T2 (on `rebuild`) ──┬── Track A: A1 ═M1═ → A2 → A3 ═MA═
                         ├── Track B: (needs M1) B1 → B2 ═MB═
                         └── Track C: C1 → C2 → C3 ═MC═
                Track U: (needs MA + MB) U1 → (needs MC) U2 → U3
                                          all merged → I1 → I2
```

- **T1 and T2** run first on `rebuild`. Tracks A, B and C then run in their own worktrees, branched from T2.
- **M1** (after A1): `rules/progression.ts` exists (`levelTo`, `grantXp`). It is small and pure, so it merges to `rebuild` at once, and B rebases onto it before B1 (recruits are generated at a level).
- **MA, MB, MC:** each track merges back to `rebuild` with `git merge --no-ff` once its last task is green.
- **Track U** (UI) starts once MA and MB are merged; U2 also needs MC. It can run as one agent.
- **Conflict hot spots:**
  - `src/engine/state.ts` (the action switch and the post-step passes): append-only, one line per action.
  - `encounters/run.ts`: A2 (XP after a roll), A3 (danger at `startEncounter`) and C1 (`lucky` in `chooseOption`). Keep each change to a call into the new module.
  - `travel/days.ts`: B2 (wages in `endOfDay`) and C1 (`strainFade` in `consumeDay`).
  - `rules/character.ts` `statModifier` (C1 only).
- **I1 and I2** run on `rebuild` after everything has merged.

---

## T1. Vocabulary and content schemas

**Files:**
- Modify: `src/schema/types.ts`, `common.ts`, `content.ts`, `economy.ts` (service roles), `encounter.ts` (effects); `src/content/build.ts` (`emptyContent`); `src/engine/test-fixtures.ts`.
- Create: `src/schema/gear.ts` (rule hooks, accessory parts, accessories) and `src/schema/gather.ts` (gather rules).
- Generate: `data/_schema/*.schema.json` (`pnpm schemas`).

**Vocabulary (`types.ts`):**
- `MAX_LEVEL = 10` (levels 1–10 for now; the schema still allows up to 20).
- `HOOK_KINDS = ['skill', 'activity', 'endurance', 'carry', 'maxHp', 'strainFade', 'strainGrace', 'lucky', 'sellBonus', 'ward']`.
- `HOOK_ACTIVITIES = ['forage', 'gather', 'explore', 'rumours', 'stowaway']`: the town and travel checks an `activity` hook can boost.
- `CAMARADERIE_TIERS`: `[{ id: 'fractured', min: 0 }, { id: 'strained', min: 2 }, { id: 'steady', min: 4 }, { id: 'close', min: 6 }, { id: 'sworn', min: 8 }]`, with `CAMARADERIE_MAX = 8` (a scale of 0–8: fewer than 10 steps, design §3).
- `SERVICE_ACTIONS` gains `'recruit'` and `'accessories'`.

**Rule hooks (`gear.ts`, `RuleHookSchema`, discriminated on `hook`):**

| Hook | Fields | Scope | Effect |
|---|---|---|---|
| `skill` | `skill`, `amount` 1–2 | wearer | + to that skill's checks |
| `activity` | `activity`, `amount` 1–3 | wearer | + when the wearer leads that activity (forage, gather, explore, rumours, stowaway) |
| `endurance` | `amount` 1–3 | wearer | + to CON checks against exhaustion (hunger, thirst, forced march) |
| `carry` | `kg` 1–20 | wearer | + carrying capacity |
| `maxHp` | `amount` 1–10 | wearer | + max HP while worn |
| `strainFade` | `amount` 1 | wearer | Strain fades this many more stacks a day |
| `strainGrace` | `amount` 1 | wearer | the daily Strain threshold is this much higher |
| `lucky` | — | wearer | once a day, a natural 1 on the wearer's check is rerolled |
| `sellBonus` | `category`, `share` 0.05–0.2 | party | selling that category pays this share more (before rounding) |
| `ward` | `share` 0.02–0.1 | party | hostile share on the road lowered by this (the best ward counts, they don't stack) |

The same schema will carry per-party modifiers later (design §8); nothing here is accessory-specific.

**Content kinds:**
- `accessoryParts`, `AccessoryPartSchema`: `{ id, part: 'base' | 'prefix' | 'suffix', name ("Ring", "Fox-eyed", "of the Long Road"), weight (default 1), minTier: 1 | 2 (default 1), value (gp), hook?: RuleHook (affixes need one; bases have none), bases?: id[] (an affix only on these bases), notes? }`. Refine: an affix has a hook, a base has none.
- `gatherRules`, `GatherRuleSchema`: `{ id, good: Good, label ("Cut timber"), text?, biomes: Biome[] (land, never sea), skill, ability?, dc (1–30), yield: Record<Tier, int ≥ 0> (units per two workers), notes? }`.
- `serviceRoles` gain:
  - `recruits?: { offers: [min, max] (per week), levels: [min, max], classes?: id[] (default any), fee: multiplier (default 1), wage: multiplier (default 1) }`;
  - `accessories?: { offers: [min, max], maxTier: 1 | 2 }`.
  - A role with `recruits` must list the `recruit` action, and one with `accessories` the `accessories` action (refine).

**Encounter effects (`encounter.ts`):**
- `xp`: `{ amount: int ≥ 0 }`: every living member gains it. A check outcome that has an `xp` effect replaces the roll's default XP (A2).
- `camaraderie`: `{ amount: int }`, clamped to 0–8.
- `accessory`: `{ tier: 1 | 2 }`: roll one accessory into the party's gear (loot).

**Fixtures:** 2 bases, 6 affixes (a skill, carry, strainFade, lucky, sellBonus and ward hook), 3 gather rules (timber in forest, stone in hills, healing herbs in marsh), and `recruits` and `accessories` on the fixture inn (or a new fixture guild role).

**Tests:** an affix without a hook fails; a base with one fails; a `recruits` role without the `recruit` action fails; a gather rule on `sea` fails; the `xp` effect rejects a negative amount. `pnpm schemas` leaves no diff.

**Commit:** `add rule hook, accessory, gather-rule and recruit schemas`

## T2. GameState v10 and the migration

**Files:** modify `src/schema/state.ts`, `src/engine/save.ts` (+ tests), `src/engine/state.ts` (`newGame`), `src/engine/party.ts`.

**State v10** (`version: z.literal(10)`, `CURRENT_SAVE_VERSION = 10`). New fields all have zod defaults:
- `Character.xp`: int ≥ 0, default 0 (total XP, never reset; levels come from the table).
- `Character.wage`: gp per day, ≥ 0, default 0. Founders are 0; hired members have their wage.
- `Character.accessory`: `AccessorySchema | null`, default null.
- `AccessorySchema` (in `gear.ts`): `{ id, name ("Fox-eyed Ring of the Long Road"), tier, hooks: RuleHook[], value }`: a self-contained snapshot, so editing the affix tables never breaks a save.
- `gear: Accessory[]`: accessories carried but not worn (weightless), default [].
- `camaraderie`: int 0–8, default 5 ("steady"; the schema keeps the literal, with a comment naming `CAMARADERIE_START`).
- `wagesOwed`: gp ≥ 0, default 0 (like `upkeepOwed`).
- `gathered`: `Record<settlementId, Partial<Record<Good, MarketTrade>>>`, default {}: units gathered recently per domain, recovering like market pressure (C3).
- `recruitsTaken`, `gearTaken`: offer ids taken, default [].
- `luckUsed`: `Record<characterId, day>`, default {}: the day each wearer's `lucky` hook was last spent.
- `EncounterState.danger`: number ≥ 0, default 0: the danger share applied to this encounter's snapshot (A3), for display.

**Migration `v9ToV10(raw)`:** adds the defaults; every existing character gets `xp: 0`, `wage: 0`, `accessory: null`. Nothing else changes.

**`newGame`:** sets `camaraderie` to `CAMARADERIE_START` (constants, 5) and the empty defaults. `generateCharacter` returns `xp: 0, wage: 0, accessory: null`.

**Tests:** a v9 fixture migrates and parses with party, gold and goods untouched; a v1 save chains through to v10; migrating twice gives identical output; `newGame` is unchanged for seeds 1–3 apart from the new fields.

**Constraint:** this is the only task that changes the state shape.

**Commit:** `GameState v10: xp, wages, accessories, camaraderie, gathering`

---

## Track A: XP, levels and the danger ramp

### A1. Levels and level-ups  ⇒ merge point M1

**Files:** create `src/engine/rules/progression.ts` and its tests; modify `src/engine/constants.ts`, `src/engine/state.ts` (the post-step pass).

**Interfaces:**
- `XP_BY_LEVEL` (constants): the total XP needed for each level 1–10, e.g. `[0, 300, 900, 1800, 3000, 4500, 6300, 8400, 10800, 13500]` (placeholders, tuned in I1).
- `levelFor(xp) → number` (capped at `MAX_LEVEL`) and `xpToNext(character) → number | null` (null at the cap).
- `levelUp(character, d) → { character, lines: string[] }`, one level:
  - HP: `max(1, hitDie + conModifier)` (the prototype's generous rule), added to `maxHp` and `hp`.
  - Stat: on odd levels from 3rd (3, 5, 7, 9), +1 to a seeded random ability (the prototype's rule), at most 20.
  - Proficiency follows `proficiencyBonus(level)` as now.
  - Lines: "Mira reaches level 3: +9 max HP, +1 WIS."
- `levelTo(character, level, d) → Character`: levels a fresh character up (recruits) and sets `xp` to that level's threshold.
- `grantXp(state, amount, why) → GameState`: every member who isn't dead (exhaustion < 6) gains `amount`; one journal line ("+65 XP: Bandits on the ford"). Level-ups are not applied here.
- `applyLevelUps(state) → GameState`: every member whose `levelFor(xp)` exceeds `level` levels up, one level at a time, drawing from `state.rng` (`withRng`), logging each line with tone `good`. Called at the end of `step` (after `siteNews`), so it covers XP from anywhere.

**Tests:** thresholds are monotonic; enough XP for two levels gives two level-ups in one step; the stat rises only on odd levels from 3; a level-10 character keeps gaining XP but not levels; `levelTo` is deterministic for a seed; `grantXp` skips the dead.

**Commit:** `XP table and level-ups (HP, proficiency, a stat every other level)`

### A2. XP sources

**Files:** modify `encounters/run.ts` (after a roll), `encounters/effects.ts` (the `xp` effect, `clearPoi`, `revealPois`; the `camaraderie` effect is B2's), `encounters/preview.ts`, `town/contracts.ts` (`completeContract`); constants.

**Behaviour:**
- **Checks in encounters:** after each roll, unless the outcome branch has an `xp` effect, the party gains `checkXp(dc, tier)`:
  - success: `XP_PER_DC × dc` (e.g. 5 × DC 13 = 65); critical success × `XP_CRIT` (1.5); partial × ½; fail and critical failure × `XP_FAIL` (¼: something is learned).
  - The DC used is the final one (site power and danger included), so harder checks pay more.
  - Fixed options give no default XP. Wonders give none (their lint already allows only log lines). Practice checks give none.
- **Effect `xp`:** grants its amount (and suppresses the default for that roll).
- **Contracts:** completing one grants `round(pay × CONTRACT_XP_PER_GP)` (e.g. 2 XP per gp), also when the reward is a good word (computed from `pay`).
- **Sites:** `clearPoi` grants `XP_CLEAR × (1 + power)`; each site revealed by `revealPois` (explore, rumours, clues) grants `XP_DISCOVER`.
- **No XP** for foraging, stowing away, gathering, rumours or Inspiration (decided overnight).
- **Preview:** `OptionCheckPreview.xp` (the success XP) and each outcome's preview shows "+65 XP" as a chip; an explicit `xp` effect previews as itself.

**Tests:** preview XP equals the XP actually gained for a success (preview == actual); an `xp` effect replaces the default; a contract completed with a good word still grants XP; clearing a stronger site grants more.

**Commit:** `XP from encounter checks, contracts, cleared sites and discoveries`

### A3. The danger ramp  ⇒ merge point MA

**Files:** create `src/engine/world/danger.ts` and its tests; modify `encounters/run.ts` (`startEncounter`), `world/explore.ts` (`strengthen` moves into `danger.ts` as a shared snapshot transform), constants.

**Interfaces:**
- Constants: `DANGER_RAMP_DAYS = 50`, `DANGER_RAMP_STEP = 0.1`, `DANGER_RAMP_MAX = 1`.
- `dangerLevel(day) → number`: `min(DANGER_RAMP_MAX, floor((day − 1) / DANGER_RAMP_DAYS) × DANGER_RAMP_STEP)`. Day 1–50: 0; day 51: 0.1; day 101: 0.2.
- `dangerInfo(day) → { share, percent, nextDay: number | null, text }`: e.g. `{ percent: 20, nextDay: 151, text: "The roads grow more dangerous: +20%" }`. At 0 the text is "The roads are as they have always been"; at the cap `nextDay` is null.
- `harden(situation, { dcBonus, danger }) → Situation`: one transform over the compiled snapshot (every stage, including the joined twist stages):
  - each check DC becomes `dc + dcBonus + round(dc × danger)`, normalised;
  - each `hp` effect with a negative amount becomes `−ceil(|amount| × (1 + danger))`;
  - healing, gold and goods are unchanged.
- `startEncounter` applies `harden` with the day's danger to every encounter (road, site, explore ambush, rumour brawl) and stores `encounter.danger`. `visitPoi` passes the site's power as `dcBonus` through the same transform (replacing `strengthen`).

**Constraint:** the danger is independent of party level and wealth (design §10b). It touches only encounters, not foraging, exploring, gathering or rumours. Snapshots are hardened once at the start, so a save loaded on a later day doesn't change an open encounter.

**Tests:** `dangerLevel` steps at days 51 and 101 and caps; a DC 13 check on day 101 shows and rolls DC 16 (preview == actual); a −4 HP outcome becomes −5 on day 101; twist stages are hardened too; site power and danger stack.

**Commit:** `world danger rises 10% every 50 days: harder DCs and damage`

---

## Track B: recruiting, wages and camaraderie (after M1)

### B1. Recruit offers and hiring

**Files:** create `src/engine/town/recruits.ts` and its tests; modify `src/engine/state.ts`, `town/services.ts` (`actionView` for `recruit`), `data/claude/service-roles.json` (`recruits` blocks and the `recruit` action), constants.

**Interfaces:**
- `recruitOffers(state, content, settlementId) → RecruitOffer[]`: derived from (world seed, settlement, week, service), with a salted stream like the notice board. Each service with a `recruits` block offers a seeded number in `offers`.
  - `RecruitOffer = { id ("r-<settlement>-w<week>-<service>-<n>"), service, character (generated, then levelTo), fee, wage, available, reason }`.
  - The class comes from the role's `classes` (or any). The ancestry is the settlement's `RECRUIT_LOCAL_ANCESTRY` (0.75) of the time, else any playable.
  - The level is seeded within the role's `levels`, but never above the party's highest level + 1.
  - `fee = ceil(RECRUIT_FEE_PER_LEVEL × level × role.fee)`; `wage = RECRUIT_WAGE × (1 + level) × role.wage` (e.g. 0.5 × 2 = 1 gp a day at level 1).
  - Offers in `recruitsTaken` are left out.
  - Refusals: party full (`PARTY_CAP` = 6 living members), not enough gold, busy.
- **Data:** the inn offers 0–1 level-1 recruits; the adventurers' guild 1–3 of levels 1–3; mercenaries 1–2 fighters, rangers or paladins of levels 2–4 with `fee` 0.5 and `wage` 1.5 (cheap to sign, dear to keep).
- **Actions:** `hireRecruit { offerId }` (pays the fee, adds the character with its `wage`, records the offer, logs "Bram, a dwarf fighter (level 2), joins for 2 gp a day."); `dismissMember { characterId }` (hired members only; logs it; owed wages stay owed).
- A new member brings `STARTING_FOOD_DAYS` of food of their own (as a starting member does), so hiring never starves the party on day one.

**Tests:** offers are deterministic within a week and change the next; a hired offer isn't offered again; the cap of 6 living members holds (a dead member doesn't count); a recruit's level never exceeds the party's highest + 1; founders can't be dismissed.

**Commit:** `recruits at taverns, the adventurers' guild and mercenaries`

### B2. Wages, camaraderie and desertion  ⇒ merge point MB

**Files:** create `src/engine/town/camaraderie.ts` and its tests; modify `travel/days.ts` (`endOfDay`), `town/contracts.ts` (`completeContract`), `town/services.ts` (private room), `encounters/effects.ts` (`camaraderie` effect), `src/engine/state.ts` (the post-step pass), `travel/journey.ts` (desertion on arrival, next to the other arrival hooks), constants.

**Behaviour:**
- **Wages:** `endOfDay` pays every hired member's `wage` after the animals' upkeep, as far as the gold goes; the rest goes to `wagesOwed` (fractions carry quietly, as with upkeep). Owed wages are paid first the next day.
- **Camaraderie** (0–8, tiers in `types.ts`), changed only by these rules (each a constant):
  - −1 at the end of a day on which a whole gp of wages went unpaid;
  - −1 at the end of a day on which anyone went without food or water (once a day);
  - −2 when a member dies (exhaustion 6), detected in the post-step pass by comparing the dead before and after;
  - +1 for each contract completed;
  - +1 for a night in a private room, once per arrival (`doneHere: 'bond'`);
  - the `camaraderie` encounter effect.
  - Each change that crosses a tier logs it ("The party is strained: wages are owed.").
- **Desertion:** while camaraderie is `fractured` (0–1), on each arrival in a settlement every hired member deserts with `DESERT_CHANCE` (0.25, seeded). They take no gold or goods; their owed wages are written off. Founders never desert. The journal names who left.
- **View model:** `camaraderieInfo(state) → { value, tier, causes: string[], wagesPerDay, wagesOwed, desertRisk }`. `causes` lists what is pulling it down now (wages owed, someone went hungry today, the fractured tier's desertion risk); the journal carries the history, so no list of past changes is stored.

**Tests:** wages are paid daily and owed when broke, and camaraderie drops that day; a death costs 2; a completed contract adds 1; a fractured party loses some hired members on arrival over seeds (statistical, generous bound) and never a founder; the private-room bonus applies once per arrival.

**Commit:** `daily wages, camaraderie and desertion`

---

## Track C: accessories and gathering

### C1. Rule hooks in the engine

**Files:** create `src/engine/gear/hooks.ts` and its tests; modify `rules/character.ts` (`statModifier`), `rules/checks.ts` (`tierOdds`/`rollCheck` with a natural-1 reroll), `rules/strain.ts`, `travel/days.ts` (`endure`, `consumeDay` fade), `economy/capacity.ts` (`memberCapacity`), `economy/market.ts` or `trade.ts` (sell quotes), `travel/routes.ts` (`hostileShare` gains a `ward` part), `travel/forage.ts`, `world/explore.ts`, `town/rumours.ts`, `travel/stowaway.ts` (activity bonuses), `encounters/run.ts` and `encounters/preview.ts` (`lucky`).

**Interfaces:**
- `hooksOf(character) → RuleHook[]` (its accessory's hooks) and `partyHooks(state) → RuleHook[]` (every worn accessory's party-scoped hooks).
- Small readers, one per use: `skillBonus(c, skill)`, `activityBonus(c, activity)`, `enduranceBonus(c)`, `carryBonus(c)`, `strainFadeOf(c)`, `strainGraceOf(c)`, `hasLuck(state, c)` (worn and not spent today), `sellBonus(state, good)`, `wardShare(state)` (the best one).
- `statModifier` adds `skillBonus`; the activity checks add `activityBonus` for whoever leads; `endure` adds `enduranceBonus`; `memberCapacity` adds `carryBonus`; `fadeStrainAfter` fades `1 + strainFadeOf(c)`; `strainFrom` uses `STRAIN_PER_DAY + strainGraceOf(c)`; the sell quote multiplies the mid price by `1 + sellBonus` before whole-gold rounding; `hostileShare` gains a `ward` part (negative), shown in the road preview's breakdown.
- **`lucky`:** `tierOdds(modifier, dc, mode, rerollOnes = false)` enumerates the reroll exactly; `rollCheck` rerolls a kept natural 1 once when asked. `chooseOption` asks when `hasLuck` holds for the actor, and a reroll spends it (`luckUsed[c] = day`, a journal line "Mira's charm turns the luck."). The option preview's odds use the same flag (preview == actual).
- **`maxHp`:** applied on equip and removed on unequip (C2), never derived at read time; HP is clamped to at least 1 on removal.

**Tests:** a +1 skill hook shows in the preview and in the roll; `tierOdds` with `rerollOnes` sums to 1 and matches a brute-force count; the luck is spent once a day; a `ward` lowers the hostile share in the preview and on the journey alike; carry raises capacity; `strainGrace` delays the stack by one use.

**Commit:** `rule hooks: skills, activities, endurance, carry, Strain, luck, selling, wards`

### C2. Accessories: affix tables, loot, shops and equipping

**Files:** create `src/engine/gear/accessories.ts` and its tests; create `data/procedural/accessories.json`; modify `encounters/effects.ts` (`accessory` effect), `town/services.ts` (`actionView` for `accessories`), `data/claude/service-roles.json` (Magic Items, finesmith), `data/claude/poi-situations.json` (a few loot placements), `src/engine/state.ts`, constants.

**Interfaces:**
- `rollAccessory(d, content, tier, id) → Accessory`: a base by weight, then for tier 1 one affix (prefix or suffix), for tier 2 a prefix and a suffix with different hook kinds; only affixes whose `minTier ≤ tier` and whose `bases` allow the base. Name "Fox-eyed Ring", "Ring of the Long Road", "Fox-eyed Ring of the Long Road". `value` = base + affixes.
- **Data (`accessories.json`, `source: procedural`):** about 8 bases (ring, amulet, cloak, boots, charm, brooch, belt, gloves) and about 24 affixes covering all 10 hook kinds, at tier 1 (+1 skills, small carry, ward 0.03…) and tier 2 (+2 skills, `lucky`, `strainFade`…). Tier-1 values about 30–80 gp, tier 2 about 120–250 gp (low-end only).
- `accessoryOffers(state, content, settlementId) → AccessoryOffer[]`: derived from (world seed, settlement, week, service) for services with an `accessories` block (Magic Items 2–4 offers up to tier 2, the finesmith 1–2 of tier 1). Price = value; offers in `gearTaken` are left out.
- **Actions:** `buyAccessory { offerId }` (into `gear`); `sellAccessory { id }` at a service with an `accessories` block, for `ceil(value × ACCESSORY_RESALE)` (0.5); `equipAccessory { characterId, id }` (from `gear`; a worn one goes back to `gear`; applies `maxHp`); `unequipAccessory { characterId }`.
- **Loot:** the `accessory` effect rolls one into `gear` with a seeded id, logs "Found: Fox-eyed Ring (+1 Perception)". Add it to about 6 dungeon and lair outcomes in `data/claude/poi-situations.json` (critical successes and clearings, mostly tier 1). The content lint allows it only outside wonders.
- `describeHook(hook) → string` ("+1 Perception", "+5 kg carried", "Strain fades faster", "Once a day, rerolls a natural 1", "Sells gems, relics and luxuries for 10% more", "−3% hostile on the road").

**Tests:** rolling is deterministic and respects tiers, bases and distinct hook kinds; shop offers are fixed within a week and a bought one disappears; equip/unequip round-trips HP; the loot effect adds to `gear`; a content test checks every affix's hook is valid and every hook kind appears in the table.

**Commit:** `accessories from affix tables: loot, Magic Items and the finesmith`

### C3. Gathering  ⇒ merge point MC

**Files:** create `src/engine/world/gather.ts` and its tests; create `data/claude/gathering.json`; modify `src/engine/state.ts`, constants; `src/content/*.test.ts` (content check).

**Interfaces:**
- `gatherOptions(state, content) → GatherOption[]`: in a settlement (not on the road, at a site or at sea), one per `gatherRules` entry whose `biomes` include the domain's land:
  - `GatherOption = { rule, good, label, actorId, actorName, skill, modifier, dc, workers, outcomes: { tier, faces, chance, units }[] (non-critical tiers shown), depleted: number (0–1), available, reason }`.
  - The lead is the best-suited member (`chooseActor`, so Strain counts); `activityBonus(c, 'gather')` applies.
  - **Producers make it easier:** the DC is lowered by the domain's own output level for that good (`production`, 0–3), so gathering is easy where a good is made, and sells cheapest there.
  - `workers` = members who can act; units for a tier = `floor(yield[tier] × workers / 2 × (1 − depleted))`.
  - **Depletion:** `depleted` comes from `gathered[domain][good]` through the market's `pressure` math with `GATHER_DEPTH` (e.g. 8 units) and the same recovery half-life, so the nearby land is "picked over" within a week and recovers over weeks.
- **Action `gather { rule }`:** one day. The lead rolls (it counts toward Strain; a natural 20 grants Inspiration), the party spends a camp day in the domain (`passDay`: it eats its own food), and the units arrive as goods, capped at what keeps the party from being overloaded (the rest is left behind, logged). `gathered` records the units. A critical failure draws a hostile situation that fits the place (reusing explore's ambush), or else injures the lead.
- **Data (`gathering.json`, Claude):** each land biome has at least one rule: timber (forest, jungle; Athletics), fuel (forest, plains, marsh peat, desert scrub; Survival), stone (hills, mountains; Athletics), food (plains, forest, hills, jungle, marsh; Survival), healing herbs (forest, marsh, jungle, hills, mountains; Medicine, the hardest and most valuable). Yields are set so that a fresh day's work for two sells for about 3–6 gp in the domain, before depletion and bulk pressure.
- **Selling** uses the market as is: bulk pressure saturates the local price, and the 1 gp whole-gold floor is why depletion exists (cheap goods would otherwise never saturate).

**Tests:** the option's outcome lines match the action's yield for a seeded roll (preview == actual); depletion lowers the next day's yield and recovers over time; producers lower the DC; yield never overloads the party; a content test checks every land biome has a rule.

**Commit:** `gather local goods for a day: timber, stone, fuel, food, healing herbs`

---

## Track U: UI (after MA and MB; U2 also after MC)

### U1. Character sheet, levels and camaraderie

**Files:** modify `src/ui/PartyPanel.tsx` (+ test), `src/ui/i18n/en.ts`; create `src/ui/CharacterSheet.tsx` if the panel grows too big; engine view model `characterSheet(state, content, id)` in `src/engine/rules/progression.ts` (level, XP and next threshold, HP, abilities with modifiers, proficient skills with their totals, Strain, accessory with `describeHook` lines, wage).

**Behaviour:**
- Each portrait shows "Lv 3" and a thin XP bar to the next level (no bar at the cap). Clicking a portrait opens the sheet (a popover or an expanding row; keyboard reachable, Escape closes).
- The sheet has an **Accessory** slot: the worn one with its hook lines, Unequip, and a picker of the party's unworn `gear` to equip. Hired members show their wage and a Dismiss button (with a confirm).
- Under the portraits, one line: "Camaraderie: Steady (5/8) · wages 3 gp a day", with the `camaraderieInfo` causes on hover; owed wages in the bad tone.
- Level-ups are journal lines from the engine (tone `good`); nothing else is needed.

**Tests:** one smoke test (level and XP bar render; equipping from gear dispatches `equipAccessory`).

**Commit:** `character sheet: level, XP, accessory slot; camaraderie line`

### U2. Recruits and the accessory shop (after MC)

**Files:** modify `src/ui/town/ServicesPanel.tsx` (+ test), `src/ui/i18n/en.ts`; create `src/ui/town/RecruitsPanel.tsx`, `src/ui/town/AccessoryShop.tsx`.

**Behaviour:**
- A service with `recruit` opens the recruits list: name, ancestry, class, level, the key abilities, proficient skills, fee and wage ("Hire · 20 gp, then 2 gp a day"), and the refusal reason inline when not available.
- A service with `accessories` lists the offers (name, hook lines, price, Buy) and, below, the party's unworn gear with Sell prices.
- Both fit the town ledger's one-screen layout (Plan 4): they open as a panel replacing the services tiles until closed, not as a new scrolling section.

**Tests:** one smoke test per panel (hire dispatches `hireRecruit`; buy dispatches `buyAccessory`).

**Commit:** `recruits and accessory shop in the town ledger`

### U3. Gathering and the danger level

**Files:** modify `src/ui/world/PlacePanel.tsx` (or a new `GatherAction.tsx` next to `ExploreAction.tsx`), `src/ui/App.tsx` (top bar), `src/ui/encounter/EncounterView.tsx`, `src/ui/i18n/en.ts`.

**Behaviour:**
- **Gather** sits with Explore (above the roads out): one row per option ("Cut timber · Ravi · Athletics +5 · DC 9"), its outcome lines with `TierOutcomes` (vertical, d20 faces and chance, units per tier; never an odds bar), "picked over" when depleted, and "Gather a day".
- **Danger:** the day in the top bar keeps its date tooltip and adds the `dangerInfo` text ("The roads grow more dangerous: +20% · next rise on day 151"). When danger is above 0, a small "⚠ +20%" mark sits after the day. An open encounter with `danger > 0` shows "Danger +20%: harder checks, worse wounds" in its header in small type.

**Tests:** one smoke test (gather row renders its outcome lines and dispatches `gather`; the day tooltip names the danger).

**Commit:** `gather action and the danger level in the top bar`

---

## Integration (after all tracks merge)

### I1. Economy and progression simulation, light tuning

**Files:** modify `src/engine/travel/trader.ts`, `src/content/economy.sim.test.ts`, `docs/notes/economy-report.md`; tune `src/engine/constants.ts`, `data/claude/gathering.json`, `data/claude/service-roles.json`.

**Work:**
- **Trader policy additions** (a sim policy, not a rule):
  - **Gather when poor:** in a settlement with no contract in hand, under a reserve (e.g. 10 gp or two days of food for the party), gather the option with the best expected sale value here, then sell; stop when depleted below half.
  - **Hire:** with gold above a reserve of 30 days of the new wage plus the fee, hire the best affordable recruit up to 4 members.
  - **Gear:** equip loot on whoever gains most (skill hooks on the party's best user of the skill).
- **Report additions** (seeds 1–30; 60 days as before, plus 120 days on seeds 1–10 for levels and danger):
  - the 10 gp start (the game's `STARTING_GOLD`): gp/day, broke by day 30 / 60, deaths; with and without gathering;
  - gathering: days spent, gp earned, share of income, gp per gathering day by week (to see saturation);
  - recruiting: members by day 30 / 60, wages paid, desertions;
  - levels: median and P10/P90 level by day 30, 60, 120;
  - danger: deaths and encounter success rate by 50-day band (120-day runs).
- **Targets:**
  - the 10 gp start: under 15% broke by day 30 (from ~33%), deaths not higher than before;
  - gathering is a stopgap: under 15% of the trader's income, and a domain's gather income halves within about a week;
  - the 50 gp trader stays in the +3–10 gp/day band with a recruit's wages;
  - levels: about level 2 by day 10–15, level 3–4 by day 60, level 5–6 by day 120;
  - no single gather rule earns more than 2× the median gather rule per day.
- **Tuning order:** gather yields and `GATHER_DEPTH`, then wages and fees, then `XP_BY_LEVEL`. `STARTING_GOLD` is the designer's: don't change it; report what it would take instead.
- **Gates:** the existing guard tests stay green; seeds 1–8 run 60 days without throwing and keep a valid state.

**Commit:** `sim: gathering, wages, levels and danger; tune gathering and XP`

### I2. Docs and full verification

**Files:** `docs/plans/2026-11-12-rebuild-design.md` (§3 levels, recruiting, camaraderie as built; §4 character gear; §8 rule hooks as built; §10b danger ramp and gathering as built; §12 open questions), `docs/notes/constants.md`, `docs/notes/economy-report.md`.

**Work:**
- Write the rules as built, with their numbers and constants, into the design doc, along with the decisions below (and any the designer changes).
- Run `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
- Run `pnpm test` once with `data/imported-private/` moved aside, then restore it exactly.

**Commit:** `document progression, gathering and the danger ramp (Plan 5a)`

---

## Decided overnight (please review)

The designer asked us to keep going and make reasonable calls. Each of these is easy to change later; most are a constant or a data value.

1. **XP is shared, not split:** every living member gains the full amount (5e would split it). A bigger party levels as fast as a small one; its cost is wages.
2. **Levels 1–10 with our own XP table** (cumulative, tuned by the sim to about level 2 in the second week, 5–6 by day 120). The prototype's per-level table (500, 1500, 3000…) was too slow for this pace of play.
3. **Level-ups follow the prototype:** HP + full hit die + CON modifier (generous, as starting HP is), proficiency by 5e level, and **+1 to a random ability on odd levels from 3rd**. The player doesn't choose (see "to confirm" below).
4. **XP sources:** encounter checks by final DC and tier (failures teach a quarter), contracts by pay, cleared sites by power, discoveries. **No XP** for foraging, gathering, rumours, stowing away or Inspiration, so travel chores aren't grind. Content can set an explicit `xp` effect, which replaces the default for that roll.
5. **Founders draw no wages and never desert;** only hired members do. Founders are the forgotten heroes; hirelings are hirelings.
6. **Party cap is a hard 6 living members** in this plan; "7+ with steep camaraderie costs" comes later. Dead members stay listed but don't count.
7. **Recruits are never above the party's highest level + 1,** so wealth can buy a veteran but not skip the climb. Mercenaries are cheap to sign and dear to keep (fee ×0.5, wage ×1.5).
8. **Wages:** 0.5 gp × (level + 1) a day (1 gp at level 1), paid daily like animal upkeep; a hired member brings 5 days of their own food.
9. **Camaraderie 0–8, starting at 5 (Steady),** with tiers Fractured, Strained, Steady, Close, Sworn. Only a few causes: unpaid wages (−1/day), a day of hunger or thirst (−1), a death (−2), a contract done (+1), a private room once per arrival (+1), and encounter effects. Its only effect now: at Fractured, hired members may desert on arrival (25% each). Morale and mood stay out of scope.
10. **Accessories:** one slot per character, tiers 1–2 only ("low-end"), weightless, a self-contained snapshot in the save. Ten hook kinds (table in T1), all engine-interpreted. Party-scoped hooks: `sellBonus` stacks, `ward` doesn't (the best one counts). No identification step.
11. **`lucky` rerolls a natural 1 once a day,** automatically, and the odds preview includes it while the charge is unspent (so input randomness holds).
12. **`maxHp` is applied on equip and removed on unequip,** not derived at read time.
13. **Gathering is a one-day action in a settlement's domain** (not at sites, not at sea), led by the best-suited member, with the whole able party working. It counts toward Strain. A critical failure can draw a hostile encounter, like exploring.
14. **Gathering depletes the land** ("picked over") with the market's pressure math, besides the market's bulk pressure on sales. Whole-gold prices floor at 1 gp, so cheap goods (food, fuel) would never saturate on price alone.
15. **Producers make gathering easier** (DC −1 per output level), so it is easiest where the good is made and sells cheapest; carrying it elsewhere is the trade-off.
16. **Gathering is income, not a safety net:** starvation stays the intended lethal pressure (the designer's Plan 4 call); gathering only makes earning possible without capital.
17. **Danger ramp:** `floor((day − 1) / 50) × 10%`, capped at +100% (day 501). It raises each encounter DC by `round(DC × danger)` (DC 13 → 14 at +10%, 16 at +20%) and damage by `× (1 + danger)`, rounded up. Only encounters: not foraging, exploring, gathering, rumours, the hostile share or gold losses. It is applied to the snapshot when an encounter starts.
18. **Danger is shown quietly:** the day's tooltip in the top bar, a small "⚠ +20%" mark after the day, and a line in the encounter header.
19. **Shops:** Magic Items sells tier 1–2, the finesmith tier 1; both buy back at half value. Offers refresh weekly like notice boards.

## Design decisions to confirm with the user

1. **How hard should day 300 be?** At +60% a DC 13 check becomes DC 21. A level-9 specialist (+8) then succeeds about 40% of the time, against about 65% for a level-1 specialist at DC 13 on day 1. That is a strong push to finish the Crisis (Plan 5b) by about day 300. If it is too strong, the lever is a flat +1 DC per step instead of a proportional one (DC 19 on day 301), or a lower cap.
2. **Should the player choose the level-up stat?** The prototype rolls it at random. Choosing would be a small, real decision every other level, in line with "few hard choices", at the cost of one more click.

## Out of scope

- The Crisis, run end and game over, and the legacy for the next party (Plan 5b).
- Real combat; creature CR scaling with danger.
- Mood, morale and individual relationships; camaraderie effects beyond desertion; party sizes above 6.
- Weapon and armour slots and quality tiers; mid- and high-tier accessories; identification; per-party modifiers (they will reuse `RuleHookSchema`).
- Faction and kingdom reputation; mercenary companies and owned businesses.
- Gathering at points of interest, and selling to a market that refuses gluts.
- Japanese strings for the new UI and content.
