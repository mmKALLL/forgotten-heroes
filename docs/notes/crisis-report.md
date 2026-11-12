# Crisis report

The Crisis simulation runs a scripted party through 20 worlds for up to 360 days and records how it hears of the Crisis, learns the plan, finds and thwarts each act, and how the run ends. This note records the targets, the method, the numbers, what was changed, and what is left for the designer (Plan 5b, I1).

## Summary

In plain words:

- **When the party lives to see the end, the Crisis plays about as intended.** Acts are found with plenty of time (a median of 100 days to spare), few are thwarted late (8%), the finales get harder act by act (100%, 88%, 67% success), and of the runs the Crisis decided, the crusader won 4 of 6.
- **Most parties don't live that long, so the win target is not met:** the crusader wins 20% of runs (target 40–75%) and falls in 70%. Deaths are hunger and thirst, as in the economy report. Even the cautious trader, which ignores the Crisis, falls in 55% of runs by day 360. The Crisis can't be won more often than parties survive a year, and no Crisis number changes that.
- **Learning the plan by day 25 is not met either (60%, target 90%).** The reveal site is heard of early (median day 8), but some lie 3–4 days off the road in the desert, and a party of two can't carry the water there and back. Those runs learn the plan late or never, and they are most of the Ashen Prophet's losses (0 wins in 6 runs).
- **No tuning value was changed.** The act DCs, clue rules and leeway are not what holds the targets back (see "What tuning could and couldn't do"). The levers are the economy's safety net and the crisis sites' water, both for the designer.
- **One content change, from review:** the act sites' approach checks now pay no XP (an explicit `xp` of 0), because an act site stays open until thwarted and leaving and coming back would farm it. The finale still pays its XP, plus `XP_THWART`.
- **A sanity check passes:** the trader, which ignores the Crisis, never wins.

To regenerate the full report (about 30 s):

```
CRISIS_REPORT=/tmp/crisis.md pnpm vitest run src/content/crisis.sim.test.ts
```

Without `CRISIS_REPORT`, the same file only runs its guard test: the crusader plays seeds 1–3 for 120 days (or until the run ends) and must keep a valid state.

**Content:** these runs use the committed data only (no `data/imported-private/`).

## Method

**The crusader** (`crusader` in `src/engine/travel/trader.ts`; a sim policy, not a rule) trades as the trader does, but:

- It goes to the reveal site once it is known. Before then, it listens for rumours in every town.
- With an act's land known (from learning the plan or thwarting the act before), it travels there, listens at each town's tavern, and searches each of the land's domains in turn.
- With the act's site known, it rests until fit (HP at 75% or more, no exhaustion), goes there and plays the site on every arrival until the act is thwarted. At a Crisis site it never takes the option that only leaves.
- It sets out only when it can:
  - it has no contract in hand;
  - it has 15 gp per living member (`CRUSADE_GOLD_PER_MEMBER`);
  - it can supply the road. For the road to a site, that means the water and food for the way there and back plus a day at the site. The desert drinks twice, a laden party walks slower, and it buys a mule when the load is too much.
- Otherwise it works as the trader does (contracts, cargo, gathering) until it can set out. In town it eats first, and if it is stuck for three legs without a day passing it rests a day.

Without those habits, a first version walked into the desert without water. It fell in 60% of runs, many on the way back from the reveal site.

**Policies in the report:**

| Policy | What it is |
| --- | --- |
| crusader | The crusader with the sim's 50 gp start, as in the economy report: the game's 10 gp start is fragile and would hide the Crisis behind the economy. |
| crusader, game start | The crusader with the game's `STARTING_GOLD` (10 gp). |
| trader | The economy report's trader, which ignores the Crisis, stopping when the Crisis is lost (the sanity check). |
| trader, on to day 360 | The same trader playing on to day 360 or until it falls: a control for how long a party lasts without the Crisis. |

Every run stops on day 360 or when the run ends (won, lost or fallen). "Late" means thwarted after the due day; an act fails on its due day + 31.

## Targets

No tuning value was changed, so the numbers before and after tuning are the same.

| Target | Result | Met |
| --- | --- | --- |
| The plan is learned by day 25 in ≥ 90% of runs | 60% (median day 14, P90 day 73; 3 runs never) | No |
| The median act site is found with ≥ 30d to spare | 100d | Yes |
| The crusader wins 40–75% of runs | 20% (70% fallen, 10% lost) | No |
| Fewer than 25% of acts are thwarted late | 8% | Yes |
| The trader loses nearly every run | 90% lost, 10% fallen, none won | Yes |
| No villain's win rate is more than 2× another's | Ashen Prophet 0%, Drake-Speaker 33%, Pretender's Hand 20% | No (the Ashen Prophet's 0 of 6 is the reveal-site water problem) |

For reference, of the 6 runs the Crisis decided (won or lost), the crusader won 4 (67%).

## The numbers (crusader, seeds 1–20)

| Policy | Won | Lost | Fallen | Ended on (P10 / median / P90) |
| --- | --- | --- | --- | --- |
| crusader | 20% | 10% | 70% | 76 / 131 / 229 |
| crusader, game start | 15% | 35% | 50% | 58 / 170 / 234 |
| trader | 0% | 90% | 10% | 125 / 136 / 141 |
| trader, on to day 360 | 0% | 45% | 55% | 135 / 353 / 363 |

Parties fallen by day (a won or lost run counts as standing):

| Policy | Day 60 | Day 120 | Day 240 | Day 360 |
| --- | --- | --- | --- | --- |
| crusader | 10% | 40% | 65% | 70% |
| crusader, game start | 15% | 15% | 50% | 50% |
| trader, on to day 360 | 0% | 0% | 30% | 55% |

The crusader falls sooner than the trader: chasing the Crisis means long site trips, ferry fares and wages without income. The trader that plays on shows the floor: half the parties don't last a year.

**Hearing of it.** The reveal site was first heard of through a rumour in 11 runs, an omen in 5 and the summons in 4 (median day 8). With the game's start the summons does more (7 runs), since a poor party listens less.

**The acts:**

| Act | Reached | Site found (median day) | Days to spare when found (P10 / median / P90) | Thwarted | Late | Failed | Level then (median) | Visits per thwart | Finale success |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I | 20 | 27 | 30 / 78 / 96 | 15 | 2 | 1 | 3 | 1.0 | 100% (15/15) |
| II | 15 | 57 | 88 / 140 / 176 | 7 | 0 | 1 | 5 | 1.1 | 88% (7/8) |
| III | 7 | 105 | 136 / 204 / 223 | 4 | 0 | 0 | 6 | 1.5 | 67% (4/6) |

With the game's start, act I's finale succeeds 71% of the time (15/21) and act II's 78%. The crusader there gets to the sites poorer and less often fit.

**An early finish.** An act becomes current as soon as the one before is thwarted, not when its due day nears. A crusader that survives can win long before the calendar says. Seed 18 won on day 93, before act I was even due, and seeds 15 and 16 won by day 134. The due days only bite on a slow or unlucky party.

## What tuning could and couldn't do

The plan's tuning order was the act DCs, then the clue rules (`CRISIS_RUMOUR_CLUES`, `CRISIS_SUMMONS_DAY`), then `CRISIS_LEEWAY_DAYS` and `CRISIS_LATE_STEP_DAYS`. None of them is what stops the targets:

- **Act DCs:** the finales already succeed 100%, 88% and 67%, and only 8% of acts are thwarted late. Easier DCs wouldn't save a party that starves on the road. Act I is perhaps too easy (100%, one visit each), but making it harder would push the win rate further below its band, so it was left alone.
- **Clue rules:** sites are found with 100 days to spare, and the reveal site is heard of by day 8. A party learns the plan late because it can't reach the site, not because it hasn't heard of it, so an earlier summons or more rumour clues wouldn't help.
- **Leeway and the late step:** few acts run late, so these rarely come into play.
- **`CRISIS_ACT_DAYS` (yours):** the deadlines don't bind. Act sites are found with a median of 100 days to spare, and a surviving crusader finishes early. Shortening the acts wouldn't raise the win rate, and lengthening them wouldn't help either, since the party's survival is what runs out.

### An experiment: springs at the Crisis sites

One run gave every crisis site type `"water": true` (a spring that refills the waterskins on arrival), so a party only needs water for the way there. The change was not kept, since it is a design call:

| | As is | With springs |
| --- | --- | --- |
| Plan learned by day 25 | 60% (P90 day 73) | 70% (P90 day 42) |
| Crusader wins | 20% | 25% |
| Ashen Prophet / Drake-Speaker / Pretender's Hand wins | 0% / 33% / 20% | 17% / 33% / 20% (within 2×) |
| Fallen | 70% | 70% |

It helps the far and desert sites, and with them the villain spread, but deaths stay where they are.

## For the designer

1. **Survival is the lever for the win rate.** Half the parties starve within a year even when they ignore the Crisis. This is the economy report's open safety-net question again: should a broke party in town always have a way to eat? Until a party usually lasts a year, the crusader's win rate is capped by survival. When the Crisis does get decided, the crusader wins about two in three.
2. **Crisis sites and water.** Some reveal and act sites lie 3–4 days off the road in the desert, and a party of two can't carry the water there and back. Options:
   - give the crisis site types a spring (`water: true` in `data/claude/crisis-sites.json`; see the experiment above);
   - cap a crisis site's own path at about 2 days when placing it;
   - keep reveal sites out of the desert.
   Any of these would also lift "plan by day 25".
3. **Should acts wait for their time?** As built, a fast party can thwart all three acts by about day 100. If each act should feel like its own season, act n's site could stir only from some days before its due day (for example due − 60), with clues to it only from then on.
4. **A cosmetic engine note:** an outcome with an explicit `xp` of 0 shows "+0 XP" in its line, e.g. "(Edge, +0 XP)". A zero XP effect could be left out of the chips and the line.
