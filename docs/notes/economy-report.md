# Economy report (Plan 4, I1)

The economy simulation runs a scripted party through 30 worlds for 60 days each and keeps the books. This note records the targets, the method, the numbers before and after tuning, what was changed, and what is still open.

To regenerate the full report (about 10 s):

```
ECONOMY_REPORT=/tmp/economy.md pnpm vitest run src/content/economy.sim.test.ts
```

Without `ECONOMY_REPORT`, the same file only runs the guard tests (seeds 1–8, 30 days). Their bounds are deliberately generous and pin no tuning value: the trader's median gp/day is above 0, fewer than 25% go broke by day 30, seeds 1–3 have no deaths, and food's dearest price is at most 4.5× its cheapest.

The latest numbers are in "Geographic supply, whole gold and the supply split" at the end; the sections before it record the I1 tuning.

## Targets

From Plan 4 I1, plus the designer's notes:

- A trader nets about +3 to +10 gp a day early on.
- Fewer than 10% of traders go broke by day 60.
- `wander` no longer goes broke in most seeds when contracts are taken. The "contracts only" policy below stands for that.
- No good or route earns more than 3× the median margin.
- Each good's dearest-to-cheapest price is 1.5–4×. Food was often above 4×. (Superseded by the designer's geographic-supply decision: about ½× to 2× the base price between the extremes; see the last section.)
- Trade is a real income but not the main one. Contracts and loot carry more.
- A starting party doesn't go broke in its first ~30 days with sensible play.
- Encounter rates stay as they are.

## Method

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

## Before → after (seeds 1–30, 60 days)

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

## What changed and why

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

## Engine fixes found by the simulation

- **Provisioning with no coin said "the party already has what the road needs".** A broke party then set out with no food (`town/provision.ts`). `ready` is now false whenever the plan is short.
- **A fraction of a gp of animal upkeep logged "There is no coin left for the animals' fodder" with gold in the purse** (`town/animals.ts`).
- **The "varies its pace" replay test now uses a seed whose party stays fed.** A starving party camps for months, and that fills the capped log.

## Policy fixes (for whoever extends the trader)

These traps would catch a player too, so they are worth knowing:

- The "provision" button buys waterskins first, filling them can overload the party, and auto-refill keeps them full.
  - On desert roads a party of two ended up carrying 70 kg of water and starving.
  - The trader now sells spare skins when laden, and swaps skins for rations when provisioning leaves no room for food.
  - **For the designer:** should provisioning put food before water, or warn when the skins make the party encumbered?
- Long contracts (more than 8 steady days), sites more than 2 days out, and roads that can't be supplied are skipped.
- Fixed options that cost coin (tolls, a healer's fee) are a last resort. This cut encounter losses from about 30 gp to 12 gp a run.

## Known outliers and open points

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

## Designer questions

1. **A safety net for a broke party.** Should a broke party in town always have a way to eat, such as a day's labour for meals? Starvation is the main cause of death in the simulation, and it only hits parties that are already broke.
2. **"Gather materials".** The numbers suggest it is worth adding as an early, capital-free income:
   - Trading can't bootstrap from a small purse.
   - Hamlets often have no board.
   - The 10 gp reference below goes broke in 10% of runs.
   - A gather activity would also make trade-only play possible. If it is added, its local supply should saturate quickly, so it stays a stopgap.
3. **Provisioning order** (above): food first, or a warning when waterskins make the party encumbered? *Answered: water stays first; provisioning fills only the water the road needs and warns when that encumbers the party (last section).*
4. **Should supply patrons advance part of the goods' cost?** That would make supply runs possible for a poor party. *Answered: no advance. Supply runs are split into freight and procurement (last section).*

## Reference: a 10 gp start

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

## After merging C4 and the designer's changes

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

## Geographic supply, whole gold and the supply split (designer decisions)

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

