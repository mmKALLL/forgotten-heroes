# Economy report

The economy simulation runs a scripted party through 30 worlds for 60 days each and keeps the books. This note records the targets, the method, the numbers before and after each round of tuning, what was changed, and what is still open. The newest round (Plan 6 Track B) comes first; Plan 5a and the Plan 4 rounds follow.

## Reputation with settlements only (2026-11-14)

Designer call: no per-person reputation. A contract's reputation is now one number for the board's town (the old patron's and settlement's points summed), and spreads, locks and the rumour DC read the town alone. The sim's trader doesn't read reputation, so only the knock-on effects move, all within noise: trader gp/day by 30 (median) 1.8 → 2.2, by 60 1.9 → 1.7; contract pay 677 → 673 gp a run; broke shares and deaths unchanged. Nothing was retuned.

## Wounds by the party's HP, and inn rooms (2026-11-13)

Fixed wounds now scale with the party's average max HP (÷ 25, at least ×1), a common room heals 40% and a private room 80% of max HP (4 gp a member), and resting in town without a room heals as camp does. Over 60 days the parties are still mostly level 1–4, so the books barely move: the trader's gp/day by 60 (median) 2.4 → 2.8, lodging 11.0 → 12.4 gp a run, days resting in town (all runs) 286 → 302; contracts only 2.6 → 2.4 gp/day; wander deaths 19 → 18. Nothing was retuned.

## Gathering: one gatherer, two days (2026-11-13)

Designer call: a gathering takes `GATHER_DAYS` (2) days at once, done by the best-suited member alone on their own rations (one a day, refused without them); the rest of the party waits. The yields were doubled, so a gathering is worth what the old one-day, two-worker day was per day; `GATHER_DEPTH_DAYS` still counts days of work (a success's yield ÷ `GATHER_DAYS` a day). The options are listed by what a success would sell for here, biggest first. The trader now buys the gatherer's rations first when it is short. Both runs below use the committed data and the same sim; the sim's day counts were also fixed (every action had been counted as the run's 60 days, so the old "Time" and "gathering days" lines were wrong; the gp were right).

| (seeds 1–30, 60 days) | before | after |
| --- | --- | --- |
| Trader, 50 gp: gp/day by 30 / 60 (median) | 1.4 / 3.0 | 1.6 / 2.9 |
| Trader, 50 gp: broke by 30 / 60; deaths | 20% / 27%; 3 | 23% / 33%; 6 |
| Trader, 10 gp start: gp/day by 30 / 60; broke by 30 / 60; deaths | 2.9 / 3.0; 17% / 27%; 2 | 2.2 / 3.0; 17% / 37%; 6 |
| Gathering, 50 gp trader: runs; days a run; gp a run; gp a gathering day | 12/30; 1.0; 13.4; 13.4 | 9/30; 2.2; 18.6; 8.5 |
| Gathering, 10 gp trader: runs; days a run; gp a run; gp a gathering day | 22/30; 2.6; 28.7; 10.9 | 20/30; 3.3; 36.5; 11.2 |
| Fresh value a day (median): firewood, peat, scrub | 17.8, 17.9, 16.6 | 16.2, 16.5, 15.0 |
| Fresh value a day (median): herbs, fish, game | 4.9, 4.9, 4.6 | 4.8, 4.9, 4.6 |
| Fresh value a day (median): timber, stone | 1.9, 1.9 | 1.0, 1.0 |
| Saturation: the best option first worth half on day (P10 / median / P90) | 3 / 3 / 7 | 3 / 3 / 7 |

- **Per day, gathering is worth what it was** for every rule the party can carry (herbs, food, fuel within a few percent). Timber and stone halve a day: a starting party can carry only 1–2 units of them, so a two-day gathering brings home what a day did. They were already the weakest rules (0.4×, now 0.2× the median rule).
- **Fuel is a clear outlier** since its base price rose from 0.3 to 5 gp: firewood, peat and scrub are worth 15–17 gp a day fresh, about 3.3× the median rule (the I1 target was no rule above 2×). A success of firewood (12 bundles) is worth about 33 gp at a typical market (12–72), against 18 for herbs and 12 for food. So fuel comes first wherever it can be gathered (firewood first in 59 of 63 places; herbs first in about half of theirs). The gathering yields were left alone; halving fuel's yields would bring it to about 1.7–2× (the carrying cap bites less).
- **More broke deaths.** A broke party with under 2 rations can no longer gather food to get out of it (before, it went hungry that day and brought food home), and starves: the trader's deaths rose from 3 to 6 (50 gp) and 2 to 6 (10 gp start), almost all with 0 gp and 0 food. This follows from "refused without the food" and from "gathering is income, not a safety net"; a hunt that needs no rations would undo it.

## Demand by focus, size and services (2026-11-13)

Designer calls: arms are wanted where places attack (camps and forts, most when their domain is held), armour where they defend (cities and capitals, most under threat); forges, weaponsmiths and armourers make arms and armour where metal is to hand; every service wants its inputs (a smith metal, a healer healing, a magic shop arcana); villages want timber, towns stone, cities stone and metal. Goods are now listed cheapest first within each category (gear before arms, luxuries before gems). Both runs below use the same engine, before (the old rules and goods order) and after:

| Policy (50 gp start) | gp/day by 30 / 60 (median), before → after | Broke by 30 / 60 | Deaths |
| --- | --- | --- | --- |
| trader | 3.3 / 2.7 → 3.7 / 3.0 | 10% / 13% → 13% / 17% | 2 → 1 |
| trader, no upgrades | 3.7 / 6.9 → 4.0 / 7.2 | 10% / 13% → 13% / 17% | 2 → 1 |
| contracts only | 4.7 / 2.8 → 4.3 / 2.6 | 3% / 7% → 7% / 10% | 1 → 1 |
| The game's 10 gp start, trader | 4.9 / 3.6 → 5.3 / 3.5 | 13% / 17% → 13% / 17% | 1 → 1 |

| Median price against base (seeds 1–30, days 1, 50, 100) | healing | arcana | gear | arms | armour | timber | stone | metal | gems | relics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 1.08× | 0.99× | 1.01× | 0.96× | 0.83× | 0.91× | 1.14× | 1.11× | 1.45× | 1.61× |
| after | 1.22× | 1.04× | 1.01× | 1.02× | 1.03× | 0.98× | 1.25× | 1.30× | 1.50× | 1.66× |

- **The relationships hold** (seeds 1–20, days 1, 60 and 120; `src/content/economy.test.ts` asserts them on seeds 1–5): arms demand averages 3.0 at a calm fort against 0.3 in a calm city, and 2.2 at a fort under threat; armour 1.0 in a calm city or capital, 2.6 under threat, against 1.5 at a threatened fort and 0 in a calm town or village. Metal demand is about 2.1–2.3 in cities and capitals, 0.9 in towns, 0.5–0.8 in villages and hamlets; stone 1.6–1.9 in towns and cities, 0.3–0.6 in villages; timber 1.9 in villages and hamlets, 1.0–1.2 in towns and cities.
- **Prices rose a little** where demand was added: metal (median 1.11× → 1.30×), stone, healing (1.08× → 1.22×: herbalists and healers want what they sell) and armour (0.83× → 1.03×, as cities' workshops now make armour at 1 not 2 and the forges need metal). Arms and armour are cheaper near mines with smiths and dearer far from them, which is the new trade: metal from the mines to the cities, arms to the forts.
- **The economy is otherwise unchanged within its variance:** the trader's earnings hold (3.7 / 3.0 gp a day). Reordering the goods reshuffles the seeded streams (rumours, cargo choices), so single runs move: one more 50 gp trader in 30 dips under 5 gp for a day (seed 2 hires, then provisions down to 1 gp, and recovers). The 30-day guard on 8 seeds now allows at most 2 broke (it was fewer than 2).

## Party upgrades (Plan 6c, 2026-11-13)

The trader now buys party upgrades (`upgrades`, default on): in a town, while its gold is 200 gp (`UPGRADE_CAPITAL` in the policy, its trading capital) above the price, the cheapest next level for sale there; delving gear only when it delves. A new policy row, **trader, no upgrades**, is the old trader, and its numbers are the previous round's exactly (3.7 / 6.7 gp a day), so the comparison is like for like. The books gain a "Party upgrades" spend line and the levels bought.

| Policy (50 gp start) | gp/day by 30 / 60 (median) | Broke by 30 / 60 | Deaths | Upgrades (mean gp a run; runs that bought any) |
| --- | --- | --- | --- | --- |
| trader | 3.3 / 3.2 | 7% / 10% | 3 | 302; 20 of 30 |
| trader, no upgrades | 3.7 / 6.7 | 7% / 10% | 3 | – |
| contracts only | 4.7 / 3.1 | 3% / 7% | 1 | 423; 22 of 30 |
| The game's 10 gp start, trader | 4.0 / 4.0 | 13% / 17% | 1 | (not tallied) |

- **What it buys** (levels, all 30 runs): camp kit 43, surveyor's maps 12, smuggler's compartment 8, company banner 4. The camp kit leads because it is the cheapest (75 gp a level).
- **gp a day counts net worth** (gold and cargo), so an upgrade bought is money spent: the day-60 median halves (6.7 → 3.2) for about 300 gp of upgrades a run. Within 60 days the trader's upgrades don't earn their price back in coin (they pay in HP, camaraderie and safer cargo, which the trader's books don't count). Going broke and deaths are unchanged, since it only spends what is above its capital.
- **The poor start** buys too once it is past its capital: its day-60 median falls 10.6 → 4.0 for the same reason as the trader's, while going broke is unchanged (13% / 17%).
- **Levels and danger** are unchanged within the runs' variance (best level 6 by day 60; 120-day runs: no deaths in 10).

## Transport rules: the wagon, camels and the flying carpet (2026-11-13)

Designer calls: the wagon is several times the cart's price for more kg per gp (60 gp, 400 kg → 150 gp, 1500 kg: 10 kg/gp against the cart's 6.7; with the draft horse, 230 gp for 1620 kg, 7.0 kg/gp, against cart and mule at 5.8); the camel 90 gp, 150 kg → 100 gp, 120 kg; a new flying carpet at 2500 gp. Carts, wagons and the donkey are slow (no brisk or forced pace), and each cart or wagon adds +10% hostile. The report gains a "Vehicles" section: kg per gp, and what a full load of one heavy good fetches at once in a town and a city against market depth. A full wagon of timber or stone keeps about 62–79% of the price on average; of metal 31–45%, of armour 16–26%, of arms 8–13%, so the wagon pays for bulk materials or loads split over goods and markets (a cart's full load keeps 49–97%). The policies don't buy carts, wagons or camels, so their numbers are unchanged (the trader only buys a mule, which is neither slow nor a vehicle).

## Permanent purchases dearer, no animal upkeep (2026-11-13)

Designer calls: waterskins 2 → 5 gp (resale 1 → 2); animals have no upkeep and cost more instead (donkey 5 → 12, mule 8 → 20, camel 50 → 90, draft horse 50 → 80, riding horse 75 → 120, cart 15 → 30, wagon 35 → 60). The sim's trader no longer sells its spare waterskins when laden and rebuys them for the next dry road (that churn cost about 30 gp a run at the new price); it pours out their water instead. The report's "Animals' upkeep" spend row is gone (what it also caught, other gold lost on the road, now counts as encounter losses).

| Policy (50 gp start) | gp/day by 30 / 60 (median), before → after | Broke by 30 / 60 | Deaths |
| --- | --- | --- | --- |
| trader | 4.4 / 6.6 → 3.7 / 6.7 | 10% / 13% → 7% / 10% | 0 → 3 |
| trader, no recruits | 6.3 / 9.3 → 6.0 / 12.1 | 3% / 7% → 3% / 3% | 0 → 0 |
| contracts only | 6.2 / 12.0 → 5.7 / 11.3 | 10% / 10% → 3% / 7% | 1 → 1 |
| The game's 10 gp start, trader | 4.9 / 9.6 → 4.0 / 10.6 | 7% / 10% → 13% / 17% | 0 → 1 |

**The trader still works**: its day-60 earnings hold, and the guards pass. The poor start feels it most: a 5 gp waterskin is half its purse, and its gold on day 15 falls (median 41 → 23 gp). With waterskins back at 2 gp (the rest unchanged) the 10 gp start goes broke in 10% / 13% of runs, so the dearer skins cost about one run in 30, and the rest of the move is run-to-run variance (one run is 3%; deaths are 0–3 in 30 runs either way). That is the intended trade-off (a real decision for a poor party); if the designer wants the poor start safer, the lever is `WATERSKIN_PRICE`.

## Plan 6 Track B (the roguelite arc)

This round tuned the run's arc (camaraderie, levels, dungeons, the Crisis); see [crisis-report.md](crisis-report.md) for its targets, what changed and why. Its effect on the economy, rerun on the committed data:

- **The trader keeps its party together** (a round at every inn below 85 camaraderie, a private room below 65, flight weighed at its camaraderie cost) and gives up a contract the town refuses because its goods were lost. Upkeep is counted as lodging (22 gp a run).
- **Wages are gone** (Plan 6 A): recruits cost a sign-on fee, 150 gp a run for the 50 gp trader (1.9 hires); the trader now earns well inside the old +3–10 gp a day band: 4.4 by day 30 and 6.6 by day 60 (median), with up to four members; 9.3 by day 60 without recruits. Contract pay grows with the contract's level (Plan 6 D1), which is most of the rise.
- **Levels** follow the new `XP_BY_LEVEL` (level 4 by day 30, 6 by day 60, 12 by day 120 for the trader); the 120-day trader levels faster than the crusader, since its contracts pay more XP as it levels.
- **Going broke:** 10% by day 30 and 13% by day 60 (50 gp start), 7% / 10% from the game's 10 gp start. Desertions: 3 in 30 runs.
- **Danger:** encounter success falls from 58% (days 1–50) to 43–55% after; 2 deaths in 10 runs over 120 days. Hostile encounters on a levelled contract now wound deeper with its level (`CR_WOUND_STEP`), as their DCs already rose.

| Policy (seeds 1–30, 60 days, 50 gp start) | gp/day by 30 (P10 / median / P90) | gp/day by 60 | Broke by 30 / 60 | Deaths |
| --- | --- | --- | --- | --- |
| trader | −1.1 / 4.4 / 13.7 | 0.1 / 6.6 / 18.0 | 10% / 13% | 0 |
| trader, one recruit at most | 0.5 / 5.1 / 13.7 | 1.4 / 7.8 / 15.6 | 7% / 10% | 0 |
| trader, no recruits | 0.9 / 6.3 / 14.6 | 3.3 / 9.3 / 19.6 | 3% / 7% | 0 |
| contracts only | −1.0 / 6.2 / 12.7 | 1.1 / 12.0 / 19.3 | 10% / 10% | 1 |
| trade only | −1.5 / −1.0 / −0.3 | −1.0 / −0.5 / −0.1 | 17% / 27% | 0 |
| wander | −2.0 / −1.4 / 0.0 | −2.0 / −1.2 / 0.0 | 23% / 47% | 17 |

| The game's 10 gp start | gp/day by 30 / 60 (median) | Broke by 30 / 60 | Deaths |
| --- | --- | --- | --- |
| trader (gathers, hires, wears gear) | 4.9 / 9.6 | 7% / 10% | 0 |
| no gathering | 6.3 / 8.0 | 7% / 10% | 1 |
| none of gathering, hiring, gear | 7.6 / 12.2 | 3% / 7% | 2 |

Levels (the party's best; P10 / median / P90): 50 gp trader day 30 3 / 4 / 5, day 60 5 / 6 / 8; 120-day runs (seeds 1–10) day 120 9 / 12 / 15.

**Still open:** trade alone still doesn't pay (−0.5 gp a day); wander starves (47% broke by day 60, 17 deaths), as before; the guards (above 0 gp a day, under 25% broke by day 30, seeds 1–3 without deaths) all hold.

### Summary (Plan 5a, I1)

In plain words:

- **The 10 gp start now works.** Gathering gives a poor party a way to earn without capital, and the trader now goes broke in 7% of runs by day 30 (30% without gathering), with half the deaths (8 against 16 of 60 founders).
- **Gathering stays a stopgap.** It is 1–3% of the trader's income. A fresh day's work for two sells for about 4–6 gp, and a domain's gathering income halves in about 8 days of steady work.
- **Recruits cost more than they earn, and that target is not met.** A 50 gp trader that hires one recruit makes about 2.6 gp a day by day 60 (3.1 without recruits; the target band is +3 to +10). A recruit draws a wage and eats about 1 gp a day, and nothing in the game yet pays more for a bigger party. Wages were halved; going further would make recruits nearly free. This is a design question (see "For the designer" below).
- **Levels are on pace without changes:** level 2 by about day 15, 4 by day 60, 5 (P90 6) by day 120. `XP_BY_LEVEL` is unchanged.
- **The danger ramp bites gently by day 120:** encounter success falls from 66% to 59% at +20%, and deaths rise from 0 to 3 per band (10 runs).

To regenerate the full report (about 45 s):

```
ECONOMY_REPORT=/tmp/economy.md pnpm vitest run src/content/economy.sim.test.ts
```

Without `ECONOMY_REPORT`, the same file only runs the guard tests: seeds 1–8 for 30 days with generous bounds that pin no tuning value (the trader's median gp/day is above 0, fewer than 25% go broke by day 30, seeds 1–3 have no deaths, food's dearest price is at most 4.5× its cheapest), and seeds 1–8 for 60 days from the game's start, which must keep a valid state.

### Plan 5a, I1: gathering, recruits, levels and danger

#### What the trader does now

The trader policy (`src/engine/travel/trader.ts`, a sim policy, not a rule) gained three habits, each with an option to turn it off:

- **Gather when poor** (`gather`): in a settlement with no contract in hand and under 20 gp (or two days of food for the party), it gathers the option with the best expected sale value here, sells what it brought home (keeping food for the road), and stops once that option's land is picked over to half its yield. The plan suggested 10 gp; at 10 gp a party set out on its first road with too little and arrived broke, and 20 gp is about what a first courier job's road food needs.
- **Hire** (`hire`, `hireUpTo`, default 4 living members): it hires the best recruit on offer (highest level, then lowest wage) when it holds the fee plus 30 days of the whole wage bill and the recruit's food. The plan's reserve counted wages only; without the food, a party hired at 40 gp and went broke soon after.
- **Gear** (`gear`): it puts each accessory carried on a member who wears none (a skill hook on the best user of that skill), and sells spares where a shop buys them.

The report adds: the game's 10 gp start with and without these habits, and with other starts; "still poor on day 30 / 60" (worth under 10 gp and no contract), to tell a party that dips and recovers from one that is stuck; gathering's days, income, share and saturation; a probe of each gather rule's fresh-day value; recruiting; levels by day 10, 15, 30, 60 and 120 (120-day runs on seeds 1–10); and encounters and deaths per 50-day danger band. Two trader variants (one recruit at most, no recruits) separate the cost of recruits from the rest.

**Content:** these runs use the committed data only (no `data/imported-private/`), so they don't match the Plan 4 numbers below exactly. The "none of gathering, hiring, gear" row is the like-for-like baseline.

#### Targets: before and after

**Before** is the final policy on the data and constants as merged (`96123bf`). For the 10 gp start, the policy without its new habits is shown too, as the Plan 4 baseline. **After** is this commit.

| Target | Before | After | Met? |
|---|---|---|---|
| 10 gp start: under 15% broke by day 30 | 30% without the new habits; 10% with them | 7% (10% by day 60; 3% still poor on day 30) | Yes |
| 10 gp start: deaths not higher than before | 16 of 60 without the new habits; 9 with them | 8 | Yes |
| Gathering under 15% of the trader's income | 2% (50 gp) / 3% (10 gp) | 1% / 3% | Yes |
| A domain's gathering income halves within about a week | median day 14 (P10 6) | median day 8 (P10 3) | Yes, roughly |
| 50 gp trader in the +3–10 gp/day band with a recruit's wages | one recruit at most: 2.3 / 2.1 by day 30 / 60 (old wage, after the gathering tuning); up to four members: 2.6 / 1.1 | one recruit: 2.7 / 2.6; up to four: 2.6 / 1.3; no recruits: 2.7 / 3.1 | **No** |
| Level about 2 by day 10–15 | median 1 on day 10, 2 on day 15 | unchanged | Yes |
| Level 3–4 by day 60 | median 4 (P10 3) | unchanged | Yes |
| Level 5–6 by day 120 | median 5 (P10 3, P90 6) | median 5 (P10 4, P90 6) | Yes |
| No gather rule over 2× the median rule's day | 1.15× (healing herbs) | 1.13× (firewood) | Yes |

#### What changed

The plan's order was followed: gathering, then wages and fees, then the XP table.

- **Gather yields** (`data/claude/gathering.json`, units per tier for two workers, critical failure / failure / partial / success / critical success). A fresh day was worth about 3–3.5 gp for two, barely above the 2 gp the party eats, so a poor party gathered for weeks without saving enough to set out. Now about 4.5–5 gp. Every partial success now brings home at least 1 unit (a content test checks it):
  - cut-timber and quarry-stone: 0/0/1/2/3 → 0/1/2/3/4
  - gather-firewood and cut-peat: 0/1/2/4/6 → 0/2/3/6/8
  - gather-scrub: 0/0/2/4/5 → 0/1/3/5/7
  - hunt-game and fish-and-forage: 0/0/2/4/6 → 0/1/3/6/8
  - healing-herbs: 0/0/0/1/2 → 0/0/1/1/2
- **`GATHER_DEPTH_DAYS` 4 → 2.** At 4, a domain's gathering income took about two weeks to halve, because the party switches between rules as each is picked over. At 2 it halves in about 8 days.
- **`RECRUIT_WAGE` 0.5 → 0.25** (½ gp a day at level 1, 1 gp at level 3; mercenaries ×1.5). One recruit cost the 50 gp trader about 1 gp a day of its net worth by day 60; now about 0.5. Fees (`RECRUIT_FEE_PER_LEVEL` 10) are a small one-off and were left alone.
- **`XP_BY_LEVEL` unchanged.** Levels already land in the target bands.
- **`STARTING_GOLD` unchanged** (the designer's). It is not needed for the target: the 10 gp start already goes broke in only 7% of runs. More starting gold doesn't help either, because the trader hires sooner: 15 gp gives 13% broke by day 30, 20 gp 10%, 25 gp 17%, 30 gp 23%.

#### Findings

- **Gathering is what saves the 10 gp start.** Without it, the trader goes broke in 30% of runs and 20 founders die. With it, 7% and 8. Most gathering happens in the first week (53 of the 114 gathering days, 30 runs), before the first contract pays.
- **Recruits are a pure cost today.** A recruit adds carrying, a body for checks and shared XP, but contract pay doesn't grow with the party and a recruit eats 1 gp a day besides the wage. With up to four members, the 50 gp trader pays about 47 gp of wages and 23 gp of fees per 60 days, and its gp/day by day 60 falls from 3.1 to 1.3.
- **Even without recruits, the 50 gp trader is at the bottom of the band** (2.7 by day 30, 3.1 by day 60). Before Plan 5a it made 4.1 / 4.6, on runs that likely included the private road encounters. The danger ramp from day 51, the rule hooks and that content difference together account for it; this round did not investigate further.
- **Timber and stone are weak gathering** (about 2 gp a day, 0.4× the median rule). They are heavy (20–25 kg a unit) and cheap, so the party's carrying and a small market's sag cap them. They are within the "no rule above 2× the median" target, and still useful for freight and procurement.
- **Desertions are rare:** 7 in 30 runs with a 50 gp start, 1 with 10 gp.
- **Danger:** encounter success 66% (days 1–50), 64% (+10%), 59% (+20%); deaths 0, 2 and 3 in 10 runs.

#### For the designer

1. **What should a recruit be worth?** Today the only return is safety and carrying. To make the "+3 gp a day with a recruit" target hold, the lightest levers are: contract pay that grows with the party (escorts and bounties paying per member), work only a bigger party can take, or `CONTRACT_PAY_PER_DAY` 10 → about 12. Lowering wages further (`RECRUIT_WAGE` 0.25 is already ½ gp at level 1) would make recruits nearly free, and the food would still cost 1 gp a day each. It may also be fine as it is: recruits as the price of safety, with Plan 5b's Crisis as their payoff.
2. **`RECRUIT_WAGE` was halved** (Decided overnight #8 said 0.5 × (level + 1)). Revert it if wages should bite harder.
3. **Timber and stone gathering** could be made worth more (a bigger unit, or a higher yield), or left as the poor choice they are. The preview shows their odds and units, so a player can see it.

#### After the Plan 5a review fixes

Rerun on the committed data (no `data/imported-private/`) after the review fixes: recruit levels drawn within the service's range and capped by the founders' best + 1 (stable all week), a dismissed member's owed wages settled or written off, stowaway work days ending with wages and upkeep, and gathering depleting the land by the units carried. Nothing moves enough to change a conclusion above; the tables below are still the I1 run.

- 50 gp trader: 2.4 / 1.3 gp a day by day 30 / 60 (was 2.6 / 1.3), broke 3% / 10% (7% / 10%), 1 death (0). With one recruit at most: 2.8 / 2.6 (2.7 / 2.6). Without recruits, contracts only and the 10 gp start: unchanged.
- Recruiting: 1.8 hires and 47.8 gp of wages a run (1.7, 46.9); 6 desertions (7).
- Levels and danger: day 120 best level 3 / 5 / 6 (4 / 5 / 6); deaths over 120 days 6 in 10 runs (5).

#### The Plan 5a report (seeds 1–30, 60 days)

##### Policies (seeds 1–30, 60 days, a 50 gp start)

| Policy | gp/day by 30 (P10 / median / P90) | gp/day by 60 (P10 / median / P90) | IQR by 60 | Broke by 30 | Broke by 60 | Deaths |
| --- | --- | --- | --- | --- | --- | --- |
| trader | -1.5 / 2.6 / 7.0 | -0.5 / 1.3 / 5.2 | 0.2 – 2.9 | 7% | 10% | 0 |
| trader, one recruit at most | -1.5 / 2.7 / 7.1 | -0.5 / 2.6 / 5.9 | 1.2 – 4.8 | 7% | 10% | 0 |
| trader, no recruits | -0.7 / 2.7 / 7.4 | -0.2 / 3.1 / 6.5 | 0.8 – 5.7 | 7% | 7% | 1 |
| contracts only | 0.7 / 3.2 / 6.8 | 0.2 / 3.0 / 6.1 | 1.1 – 4.8 | 3% | 7% | 0 |
| trade only | -1.5 / -1.0 / -0.5 | -0.7 / -0.5 / -0.1 | -0.6 – -0.2 | 17% | 30% | 5 |
| wander | -1.7 / -1.2 / 0.1 | -1.4 / -0.4 / 0.2 | -1.2 – -0.2 | 23% | 40% | 58 |

##### The game's 10 gp start (STARTING_GOLD), seeds 1–30, 60 days

| Trader | gp/day by 30 (median) | gp/day by 60 (median) | Broke by 30 | Broke by 60 | Still poor on day 30 / 60 | Deaths |
| --- | --- | --- | --- | --- | --- | --- |
| trader (gathers, hires, wears gear) | 2.5 | 1.9 | 7% | 10% | 3% / 3% | 8 |
| no gathering | 2.1 | 1.5 | 30% | 37% | 20% / 20% | 20 |
| none of gathering, hiring, gear | 3.4 | 4.0 | 30% | 30% | 20% / 17% | 16 |

The full trader with other starts:

| Start (gp) | Broke by 30 | Broke by 60 | Still poor on day 30 | Deaths |
| --- | --- | --- | --- | --- |
| 15 | 13% | 23% | 7% | 6 |
| 20 | 10% | 13% | 3% | 7 |
| 25 | 17% | 30% | 7% | 8 |
| 30 | 23% | 27% | 10% | 6 |

Gold in hand, the full trader (P10 / median / P90): day 5 5 / 10 / 27, day 10 0 / 24 / 66, day 15 2 / 27 / 93, day 20 5 / 32 / 124, day 25 3 / 54 / 165, day 30 6 / 79 / 182.

##### Gathering (the trader, seeds 1–30, 60 days)

| Start | Runs that gather | Days (mean) | gp (mean) | gp per day | Share of income |
| --- | --- | --- | --- | --- | --- |
| 50 gp trader | 7/30 | 1.2 | 5.8 | 4.8 | 1% |
| 10 gp trader | 14/30 | 3.8 | 13.3 | 3.5 | 3% |

gp per gathering day by week of play (gathering days in brackets):

| Start | Wk 1 | Wk 2 | Wk 3 | Wk 4 | Wk 5 | Wk 6 | Wk 7 | Wk 8 | Wk 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 50 gp trader | – | 9.3 (3) | 6.7 (3) | 10.5 (2) | 4.0 (6) | 4.1 (7) | 2.8 (8) | 5.4 (5) | 1.5 (2) |
| 10 gp trader | 3.7 (53) | 2.7 (16) | 2.1 (18) | 2.6 (9) | 3.3 (4) | 4.0 (12) | – | 12.0 (1) | 12.0 (2) |

##### Gathering rules: a fresh day's expected value for the starting party (seeds 1–10, every settlement)

| Rule | Places | gp (P10 / median / P90) | × the median rule |
| --- | --- | --- | --- |
| gather-firewood | 210 | 4.8 / 5.1 / 5.7 | 1.13× |
| fish-and-forage | 130 | 4.1 / 4.9 / 5.4 | 1.06× |
| cut-peat | 70 | 4.4 / 4.8 / 5.5 | 1.04× |
| hunt-game | 240 | 4.1 / 4.6 / 5.4 | 1.01× |
| healing-herbs | 370 | 2.6 / 4.6 / 7.8 | 0.99× |
| gather-scrub | 70 | 3.4 / 3.8 / 4.1 | 0.82× |
| cut-timber | 180 | 1.0 / 1.9 / 3.8 | 0.42× |
| quarry-stone | 120 | 0.9 / 1.8 / 3.4 | 0.39× |

##### Gathering saturation: one domain, 14 days running (177 domains, seeds 1–10)

Expected gp of the best option each day (median across domains), and its share of day 1:

| Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gp | 5.2 | 4.8 | 4.0 | 3.5 | 3.1 | 2.8 | 2.8 | 2.6 | 2.5 | 2.4 | 2.3 | 2.3 | 2.3 | 2.0 |
| × day 1 | 1.00 | 0.91 | 0.76 | 0.68 | 0.60 | 0.54 | 0.54 | 0.50 | 0.48 | 0.46 | 0.44 | 0.43 | 0.43 | 0.38 |

The best option is first worth half its day-1 value on day 3 / 8 / 14 (P10 / median / P90; 15 = not within 14 days).

##### Recruiting (seeds 1–30, 60 days)

| Start | Members by 30 (P10 / median / P90) | Members by 60 | Hires a run | Wages a run (gp) | Desertions (all runs) |
| --- | --- | --- | --- | --- | --- |
| 50 gp trader | 2 / 3 / 4 | 2 / 4 / 4 | 1.7 | 46.9 | 7 |
| 10 gp trader | 2 / 2 / 4 | 2 / 4 / 4 | 1.2 | 30.1 | 1 |

##### Levels: the party’s best level (P10 / median / P90)

| Runs | Day 10 | Day 15 | Day 30 | Day 60 | Day 120 |
| --- | --- | --- | --- | --- | --- |
| 50 gp trader, seeds 1–30, 60 days | 1 / 1 / 2 | 1 / 2 / 2 | 2 / 3 / 3 | 3 / 4 / 4 | – |
| 10 gp trader, seeds 1–30, 60 days | 1 / 1 / 2 | 1 / 2 / 2 | 2 / 2 / 3 | 3 / 3 / 4 | – |
| 50 gp trader, seeds 1–10, 120 days | 1 / 2 / 2 | 2 / 2 / 2 | 2 / 3 / 3 | 3 / 4 / 4 | 4 / 5 / 6 |

##### Danger: the 50 gp trader by 50-day band (seeds 1–10, 120 days)

| Days | Danger | Encounter checks | Success or better | Deaths |
| --- | --- | --- | --- | --- |
| 1–50 | +0% | 199 | 66% | 0 |
| 51–100 | +10% | 183 | 64% | 2 |
| 101–120 | +20% | 51 | 59% | 3 |

Deaths over 120 days: 5 in 10 runs.

### Plan 4 history

The Plan 4 rounds, oldest first. "The 10 gp start" and "STARTING_GOLD" there refer to the designer's start before gathering existed.

#### Targets

From Plan 4 I1, plus the designer's notes:

- A trader nets about +3 to +10 gp a day early on.
- Fewer than 10% of traders go broke by day 60.
- `wander` no longer goes broke in most seeds when contracts are taken. The "contracts only" policy below stands for that.
- No good or route earns more than 3× the median margin.
- Each good's dearest-to-cheapest price is 1.5–4×. Food was often above 4×. (Superseded by the designer's geographic-supply decision: about ½× to 2× the base price between the extremes; see the last section.)
- Trade is a real income but not the main one. Contracts and loot carry more.
- A starting party doesn't go broke in its first ~30 days with sensible play.
- Encounter rates stay as they are.

#### Method

- **Policies.** The policies are in `src/engine/travel/trader.ts`, built on what a player can see (the price book, the notice board, the previews).
  - **trader:** completes contracts and sells cargo where the price is as good as any it knows. It rests when hurt, listens for rumours, and takes the notice-board contract worth the most per day. That value includes any cargo the price book says would sell at the destination. It buys courier news for a contract's destination, buys a mule when the extra cargo would pay for it, and otherwise follows the best cargo run in its price book. When poor or idle it looks for a fresh notice board, explores every fifth leg, and otherwise scouts unknown markets. In encounters it takes the likeliest check, or a free fixed option when every check is a long shot.
  - **contracts only:** the trader with trading off.
  - **trade only:** the trader with contracts off.
  - **wander:** the existing smoke policy, unchanged.
- **Definitions.**
  - **gp/day:** the change in net worth (gold plus cargo at base price, not counting a courier's goods) divided by the days played.
  - **Broke:** in a settlement with under 5 gp, no cargo worth 5 gp, and no contract in hand. A party on its first job with 3 gp left is poor, not broke. The plan's definition, without the contract clause, read a 10 gp start as broke on day 1.
  - **Deaths:** members at exhaustion 6, out of 60 members (30 runs of 2).
- **Before** is the final policy on the data and constants as they were at commit `trader policy and economy report`. **After** is this commit. Comparing them that way isolates the tuning. The policy itself also improved during the work (see "Policy fixes"), so a before run on the first draft of the policy looks worse still.

#### Before → after (seeds 1–30, 60 days)

| | Before | After |
|---|---|---|
| Trader gp/day by day 30 (P10 / median / P90) | −1.7 / 0.2 / 2.2 | 0.0 / 3.3 / 8.8 |
| Trader gp/day by day 60 (P10 / median / P90) | −1.3 / −0.2 / 1.8 | 1.8 / 3.9 / 7.2 |
| Trader broke by day 30 / 60 | 33% / 33% | 7% / 7% |
| Trader deaths (of 60 members) | 20 | 8 |
| Contracts-only gp/day by 30 (median) | 0.4 | 5.0 |
| Contracts-only broke by 30 / 60 | 20% / 30% | 3% / 3% |
| Trade-only gp/day by 60 (median) | −0.4 | −0.5 |
| Trade-only broke by 60 | 77% | 67% |
| Wander broke by 60 (no contracts, unchanged policy) | 43% | 27% |
| Trader median gold on days 10 / 20 / 30 | 43 / 50 / 47 | 79 / 109 / 140 |
| First contract paid (median day; runs with one) | 9 (24/30) | 7 (28/30) |
| Trader income per run: contracts / trade profit / loot (gold + goods) | 98 / 5 / 50 | 332 / 24 / 59 |
| Trader spending per run: food / lodging / encounters | 112 / 9 / 12 | 94 / 12 / 12 |
| Contracts done / failed (trader) | 109 / 18 | 212 / 24 |
| Supply contracts taken | 1 | 28 |
| Food price spread (median / max) | 3.9× / 4.9× | 3.1× / 3.9× |
| Luxuries spread (median / max) | 3.3× / 4.6× | 3.0× / 3.7× |
| Gems spread (median / max) | 2.2× / 3.1× | 2.2× / 3.1× |
| Trade margin (median over all sales) | 28% (26 sales) | 28% (56 sales) |

**The first 30 days (after).** The trader's gold in hand (P10 / median / P90) runs 47 on day 5, 79 on day 10, 109 on day 20 and 140 on day 30. The P10 line stays at 26–49 gp throughout. Most parties are paid for their first contract around day 7.

**Against the targets:**
- The trader's +3.3 gp/day by day 30 (3.9 by day 60) is inside the +3–10 target.
- 7% of traders are broke by day 60, under the 10% target.
- Contracts-only (wander that takes contracts) goes broke 3% of the time.
- Every good's spread is now 1.6–4.0×.
- One outlier remains (below).
- Trade is real but small: a mean of 24 gp profit per 60 days against 332 from contracts and 59 from loot.

#### What changed and why

The plan's tuning order was followed: spreads and market depth, then market rules, then contract pay, then goods prices.

- **`SPREAD_BY_SIZE` 0.40…0.15 → 0.24…0.10, and `SPREAD_MIN` 0.05 → 0.02.**
  - With a 30–40% gap between buying and selling, a good had to be 1.4× dearer elsewhere just to break even, so almost no run was worth making.
  - Now two levels of supply and demand (×1.56) give a margin of about 30%.
  - The floor was lowered so that standing still narrows the best shop's spread in a city.
- **`MARKET_DEPTH` doubled to [6, 10, 16, 24, 40, 60].** At the old depths a village moved a luxury's price 18% per bale, so every planned trade was one unit. Bulk trades still sag prices, and they now take a few units to do it.
- **`CONTRACT_PAY_PER_DAY` 6 → 10.**
  - A party of two eats about 1 gp a day and loses about 0.2 gp a day to tolls and thieves. At 6 gp per steady day, with the days between jobs, contract work barely beat food.
  - At 10 gp a day, contracts are the main income (about 5.5 gp a day of play) and the trader lands in the target band.
- **`DEADLINE_SLACK` [1.1, 1.4] → [1.25, 1.6], plus a new `DEADLINE_GRACE_DAYS` = 1 (not for urgent work).**
  - Encounters cost days ("you lose a day", "2 days pass"), and a 3–5 day run could fail through no fault of the player.
  - Urgent offers are unchanged ([0.75, 0.9]), so the brisk pace and the forced march keep their use.
- **Supply contracts** (the designer's note that short supply runs were too tight):
  - The new `SUPPLY_SOURCING_DAYS` = 2 gives non-urgent supply runs time to find the goods.
  - The new `SUPPLY_GOODS_PAY` = 1.2 makes the patron pay for the goods at 1.2× base price on top of the delivery pay. Before, a militia's 6 arms cost about 90 gp for 30 gp of pay.
  - Amounts now fit two people or a mule: timber 2–4, stone 2–3, arms 2–4, grain 10–20, iron 2–4, mail 1–2.
  - Urgency is lower for arms (0.4 → 0.25) and grain (0.35 → 0.2).
  - Supply templates weigh less on plain boards (0.4–0.6), because they need capital that a new party doesn't have.
- **New contract template `letters-and-parcels`.** A light courier job (1–2 arcana, 20–90 km, pay ×0.8) that any board can post. Hamlet boards were often only supply runs, which a poor party can't take.
- **The church posts a notice board** (`service-roles.json`). A quarter of settlements, mostly hamlets, had no board at all. A parish board brings that to about a fifth (110 of 530 over seeds 1–10). Hamlets without an inn or a church still have none.
- **Food 0.8 → 0.5 gp a ration** (5e's price). Food was the largest single cost, and the main reason `wander` went broke.
- **Market rules:**
  - Plains supply food at level 1 (was 2).
  - Hill quarries and villages no longer supply food.
  - Wealthy towns demand luxuries at level 1 (was 2).
  - Wonders no longer demand arcana.
  - The food changes bring its worst spread from 4.9× to 3.9×.
- **Loot** in `poi-situations.json` was left alone. Loot is about 15% of the trader's income, which is in line.

#### Engine fixes found by the simulation

- **Provisioning with no coin said "the party already has what the road needs".** A broke party then set out with no food (`town/provision.ts`). `ready` is now false whenever the plan is short.
- **A fraction of a gp of animal upkeep logged "There is no coin left for the animals' fodder" with gold in the purse** (`town/animals.ts`).
- **The "varies its pace" replay test now uses a seed whose party stays fed.** A starving party camps for months, and that fills the capped log.

#### Policy fixes (for whoever extends the trader)

These traps would catch a player too, so they are worth knowing:

- The "provision" button buys waterskins first, filling them can overload the party, and auto-refill keeps them full.
  - On desert roads a party of two ended up carrying 70 kg of water and starving.
  - The trader now sells spare skins when laden, and swaps skins for rations when provisioning leaves no room for food.
  - **For the designer:** should provisioning put food before water, or warn when the skins make the party encumbered?
- Long contracts (more than 8 steady days), sites more than 2 days out, and roads that can't be supplied are skipped.
- Fixed options that cost coin (tolls, a healer's fee) are a last resort. This cut encounter losses from about 30 gp to 12 gp a run.

#### Known outliers and open points

- **Arcana is the one outlier: 3 sales at a 172% median margin, against 28% overall.**
  - Two of the sales are a single pair of towns in one world: a cheap market near an expert's site and a wealthy town.
  - Arcana's world-wide spread is now 1.9–3.2×, so this looks like stacked shallow levels in one world, not a rule that is out of line. Watch it.
- **Trading alone doesn't pay.** Trade-only loses about 0.5 gp a day, and 67% go broke by day 60.
  - With 50 gp, about 20 gp spare after reserves, and 14 kg of room after food and water, a 25–30% margin earns 4–8 gp a run.
  - Trade grows with capital and a mule, and rides along with contracts.
- **Supply contracts still fail a third of the time** (10 of 28). The goods are often not sold at the board's town, and carrying them is slow.
- **Bounties are almost never taken.** The trader only takes them when fully fit; most need standing "known" and the adventurers' guild.
- **Deaths: 8 of 60 members for the trader.**
  - Almost all are a broke party starving: on the road, or "No one is fit to travel on" camps that never recover without food.
  - A run of hostile encounters can drain a 50 gp purse before the first job.
- **"Thieves in the night… −1 animal"** is logged when the party owns no animal. The effect does nothing, but the text is wrong.

#### Designer questions

1. **A safety net for a broke party.** Should a broke party in town always have a way to eat, such as a day's labour for meals? Starvation is the main cause of death in the simulation, and it only hits parties that are already broke.
2. **"Gather materials".** The numbers suggest it is worth adding as an early, capital-free income:
   - Trading can't bootstrap from a small purse.
   - Hamlets often have no board.
   - The 10 gp reference below goes broke in 10% of runs.
   - A gather activity would also make trade-only play possible. If it is added, its local supply should saturate quickly, so it stays a stopgap.
3. **Provisioning order** (above): food first, or a warning when waterskins make the party encumbered? *Answered: water stays first; provisioning fills only the water the road needs and warns when that encumbers the party (last section).*
4. **Should supply patrons advance part of the goods' cost?** That would make supply runs possible for a poor party. *Answered: no advance. Supply runs are split into freight and procurement (last section).*

#### Reference: a 10 gp start

`STARTING_GOLD` was 50 during this tuning; the designer has since set it to 10 (see "After merging C4" below).

With the final numbers and a 10 gp start, the trader:
- earns a median +4.4 gp/day by day 30 (much like a 50 gp start; only the cushion is smaller);
- goes broke in 10% of runs by day 30 and by day 60;
- loses 10 of 60 members.

Gold in hand (P10 / median / P90):

| Day | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|
| Gold | 0 / 9 / 33 | 3 / 41 / 70 | 2 / 32 / 101 | 14 / 57 / 151 | 0 / 92 / 167 | 7 / 125 / 224 |

The first job decides the run: parties that land a courier job in the first days are comfortable by day 10, and the P10 line stays near zero for the whole month. A 10 gp start is tight but survivable for about 9 parties in 10. Before this tuning, a 10 gp start went broke in 57% of runs by day 30.

#### After merging C4 and the designer's changes

Rerun once on `rebuild` after merging Plan 4 C4 (the Stealthy ½ and Cautious ¾ paces) and the designer's `STARTING_GOLD` 10 and sea speed 40 km a day. The policy tables now start every party with the simulation's own 50 gp (`SIM_GOLD`), so they compare with the numbers above; the reference section uses the game's `STARTING_GOLD`.

| | I1 (above) | After the merge |
|---|---|---|
| Trader gp/day by day 30 (P10 / median / P90) | 0.0 / 3.3 / 8.8 | 0.5 / 5.2 / 8.5 |
| Trader gp/day by day 60 (P10 / median / P90) | 1.8 / 3.9 / 7.2 | 0.7 / 4.2 / 8.3 |
| Trader broke by day 30 / 60 | 7% / 7% | 3% / 7% |
| Trader deaths (of 60 members) | 8 | 4 |
| Trade-only broke by 60 | 67% | 57% |
| Wander broke by 60 | 27% | 17% |
| Trader income per run: contracts / trade profit / loot gold | 332 / 24 / 59 | 357 / 23 / 55 |
| **10 gp start:** gp/day by 30 (median) | 4.4 | 3.1 |
| **10 gp start:** broke by day 30 / 60 | 10% / 10% | 23% / 27% |
| **10 gp start:** deaths (of 60 members) | 10 | 12 |

The 50 gp trader stays inside the targets. **The game's 10 gp start is now tighter:** about a quarter of runs go broke within the first month (gold in hand on day 5, P10 / median / P90: 2 / 10 / 33; day 30: 0 / 96 / 227). The safety net and "gather materials" questions above matter more with this start; Plan 5a's gathering is meant to answer them.

#### Geographic supply, whole gold and the supply split (designer decisions)

Rerun after four designer decisions (design §4, §5):

- **Whole-gold prices:** every unit price is rounded up to a whole gp, at least 1 gp. Food (0.5 gp base) and fuel (0.3) cost 1 gp almost everywhere (food 2 gp at the dearest markets).
- **Geographic supply:** goods have producers (`data/claude/producers.json`); a market's supply is the best producer within reach, a level less per 3 steady days, down to −2 when none is near. Market rules only add demand. Demand − supply is kept within ±3, so prices run from about ½× to 2× the base price. Drift is ±10% (was ±15%). Shortages (demand 3+ over supply) are marked and named by rumours and couriers.
- **Supply contracts split** into freight (heavy goods handed over, carried as cargo) and procurement (posted for a shortage; bring the goods in from elsewhere; base value plus the round trip to the nearest producer; no advance). The 1.2× goods payment and the 2 sourcing days are gone.
- **Provisioning** fills only the water the road needs and warns when it encumbers; refilling by itself fills spare skins only while the party stays light.

**Before** is commit `be60a05` (the trader on the old market rules, fractional prices and supply runs). **After** is this branch. No guard failed, so nothing was re-tuned beyond the new data: the producer rules were set so that luxuries come from 3–5 places a world and relics from 2–4 (seeds 1–5), and the shortage gap (3) so that about 9% of goods-in-markets are short (under 1% for food and fuel, 13–25% for stone, metal, gems, relics and luxuries).

| | Before (`be60a05`) | After |
|---|---|---|
| Trader gp/day by day 30 (P10 / median / P90) | 0.1 / 4.1 / 8.8 | 0.2 / 3.8 / 7.2 |
| Trader gp/day by day 60 (P10 / median / P90) | 2.0 / 4.1 / 7.2 | 0.8 / 4.0 / 6.8 |
| Trader broke by day 30 / 60 | 3% / 3% | 3% / 3% |
| Trader deaths (of 60 members) | 6 | 6 |
| Contracts-only gp/day by 30 (median); broke by 60 | 5.5; 0% | 5.6; 3% |
| Trade-only broke by 60 | 67% | 87% |
| Wander broke by 60 | 27% | 30% |
| Trader income per run: contracts / trade profit / loot gold | 341 / 21 / 55 | 337 / 24 / 55 |
| Trader food and waterskins per run | 97 gp | 125 gp |
| Trade margin (median over all sales) | 30% (50 sales) | 21% (65 sales; 17 are fuel at 0%) |
| Supply runs (trader: taken / done / failed) | 24 / 10 / 11 | – |
| Freight (trader: taken / done / failed) | – | 16 / 12 / 4 |
| Procurement (trader: taken / done / failed) | – | 1 / 1 / 0 |
| **10 gp start:** gp/day by 30 (median); broke by 30 / 60; deaths | 4.4; 10% / 10%; 10 | 3.7; 20% / 20%; 10 |

**How often each kind is posted** (seeds 1–30, every board, weeks 1–9; 11,376 boards with offers): courier 56%, escort 24%, freight 8%, errand 8%, procurement 2%, bounty 1%. **7% of boards post a procurement.** Its source is usually far: a shortage means nothing is made near, and the nearest producer is typically 7–20 steady days away (templates allow up to 300 km), so a procurement is a long, well-paid job. The trader skips anything over 8 steady days, so it took only one.

**Prices against the base price** (seeds 1–30, days 1, 50 and 100, mid prices before the spread):

| Good | Base gp | Cheapest | Median | Dearest | Producers a world (seeds 1–5) |
|---|---|---|---|---|---|
| food | 0.5 | 0.46× | 0.79× | 2.11× | 40–45 |
| fuel | 0.3 | 0.46× | 0.79× | 2.14× | 30–39 |
| healing | 8 | 0.46× | 1.05× | 2.15× | 15–24 |
| alchemicals | 20 | 0.46× | 0.87× | 2.14× | 18–23 |
| arcana | 25 | 0.46× | 1.00× | 2.14× | 8–14 |
| arms | 15 | 0.58× | 0.97× | 2.15× | 16–22 |
| armour | 30 | 0.58× | 0.83× | 2.15× | 14–20 |
| gear | 5 | 0.58× | 0.98× | 2.15× | 20–29 |
| timber | 2 | 0.46× | 0.91× | 2.15× | 18 |
| stone | 2 | 0.46× | 1.14× | 2.15× | 12 |
| metal | 8 | 0.46× | 1.08× | 2.15× | 7–10 |
| gems | 50 | 0.58× | 1.43× | 2.15× | 7–10 |
| relics | 60 | 0.73× | 1.59× | 2.15× | 2–4 |
| luxuries | 20 | 0.46× | 1.14× | 2.15× | 3–5 |

Every good reaches the ½×–2× band at its extremes; typical prices sit near the base. Common goods are cheaper than their base in most places (food and fuel at a median 0.79×); scarce goods are dearer (gems 1.43×, relics 1.59×, luxuries and stone 1.14×). Dearest ÷ cheapest within a world is now a median of 2.3× (relics) to 4.1× (healing), at most 4.6×; specialised goods (metal 4.0×, healing 4.1×, luxuries 3.6×) spread wider than food (3.2×). Relics spread least because they are scarce almost everywhere.

**Findings:**

- **The 50 gp trader stays inside the +3–10 gp/day target** (3.8 by day 30, 4.0 by day 60), with 3% broke.
- **Food now costs about 1 gp a ration** (whole gold), 28% more food spending per run. The 10 gp start feels it: 20% of those runs are broke by day 30 (10% before). If that is too harsh, the lightest levers are `CONTRACT_PAY_PER_DAY` or a cheaper lodging that includes meals; the safety-net and "gather materials" questions above still apply.
- **Cheap goods are flat under whole gold:** food and fuel trade at 1 gp nearly everywhere, so fuel cargo earns nothing (the trader's 17 fuel sales were all at 0%). Fuel needs a bigger unit (a cartload) or a use before it is worth trading.
- **Trade-only is worse** (87% broke by 60): with whole gold, small bulk trades lose their fractional margins, and the trader carries more fuel and food at no profit. Trade still pays alongside contracts (24 gp a run, as before).
- **Freight replaces most supply runs:** the trader takes about as many (16 against 24) and fails far fewer (4 against 11), since the goods are handed over and need no capital.
- **Outliers:** gems had 2 sales at a 241% median margin (one of them 461%, Greenwall → Fort Thorn); alchemicals 1 sale at 74%. Too few sales to call a pattern; watch them.


#### After the Plan 4 review fixes

Rerun (seeds 1–30, 60 days) after merging the Plan 4 review fixes and the UI pass: Provision buys food only (waterskins by hand), water refills by itself (also on setting out), contract cargo is reserved, exhaustion slows travel, Cautious is gone. The trader (a sim policy, not a rule) now buys the waterskins a road needs before provisioning, never takes a road whose water it can't buy or carry the skins for (it gives up a contract with no such road), leaves sites at a pace whose supplies last, and walks brisk instead of forcing a march while encumbered. Without those, seeds 2 and 3 died of thirst.

| | Before (geographic supply) | After |
|---|---|---|
| Trader gp/day by day 30 / 60 (median) | 3.8 / 4.0 | 4.1 / 4.6 |
| Trader broke by day 30 / 60; deaths | 3% / 3%; 6 | 3% / 3%; 4 |
| Contracts-only gp/day by 30 (median); broke by 60 | 5.6; 3% | 5.2; 3% |
| Trade-only / wander broke by 60 | 87% / 30% | 87% / 23% |
| Trader food and waterskins per run | 125 gp | 125 gp |
| **10 gp start:** gp/day by 30 (median); broke by 30 / 60; deaths | 3.7; 20% / 20%; 10 | 3.4; 33% / 33%; 16 |

The 50 gp trader stays in the +3–10 gp/day band. **The 10 gp start got harsher** (a third broke, 16 deaths), likely because a poor party now buys its waterskins by hand and avoids roads it can't water, so it has fewer roads to take; not investigated further. That is the safety-net question above again; levers are `STARTING_GOLD`, `CONTRACT_PAY_PER_DAY` or cheaper waterskins.
