# Crisis report

The Crisis simulation runs a scripted party through 20 worlds for up to 360 days and records how it hears of the Crisis, learns the plan, finds and thwarts each act, and how the run ends. The newest round (Plan 6 Track B, the roguelite arc) comes first; the Plan 5b rounds follow under "Plan 5b history".

## Plan 6 Track B: summary

In plain words (seeds 1–20, the crusader with the sim's 50 gp start unless said otherwise):

- **Disbanding is no longer the default ending.** Before this round almost every run disbanded (crusader median day 55, trader 70). Now 35% of crusader runs disband (almost all from going broke and hungry, or from repeated failures in a big party near an act's due day), 15% of traders by day 100, and the rest end lost when an act's day passes. The causes were measured (table below): failed checks in a party of 3–4, hunger, and fleeing, against gains the policy hardly used. The sims now keep a party together as a player would (a round at every inn below 85, a private room below 65, fleeing weighed at its camaraderie cost), and the losses were lowered: a failed check 2.5 → 1 and a critical failure 5 → 2 per extra member, hunger 13 → 8 a day.
- **Levels are on the designer's curve:** median 4 on day 30, 7 on day 100, 14 on day 200 and 19 on day 300 (the last two on 7 and 4 runs still going). `XP_BY_LEVEL` was set from the crusader's XP: its income is nearly flat (about 45 XP a day), so from level 6 every level costs 900, rising to 1,600 at the top.
- **Act losses:** of the runs reaching each act's prevention alive, 42% lose act I (target about half) and 50% act II; act III was lost by all 4 runs that reached it (its CR 18 finale, five successes before three failures, was not won in 4 visits at level 19). No crusader wins.
- **Not met: about 75% of runs ending before the Crisis gets going.** Only 5% end before act I's prevention, 15% by day 100. The sensible crusader rarely puts anyone at 0 HP, and HP grows about 8 a level while most wounds didn't. This round added the smallest death-from-risk rule (a wound that downs a member costs 2 exhaustion; 6 is death) and made wounds deepen with the CR, but a policy that rests before a climax and withdraws hurt still almost never dies (5 members in 20 runs). See "For the designer".
- **Dungeons** carry 4–5× the HP loss of a road encounter (16.8 against 3.5 a room) and are driven out of in 23 of 27 delves; 4 were cleared. Clearing pays 75% of a level (designer's call), so a clear is worth most of a level-up; the crusader got 4% of its XP from delving, because it clears so few.
- **Novices and act I's key challenge:** a novice pair (levels 1–2) wins it 22%, a level-3 pair 17%, a level-7 pair 28%, a level-7 party of four 45% (`challenge.sim.test.ts`, 75 runs each). The party of the intended level is near its band (half to two-thirds); novices are not "almost never". Bounded accuracy is the reason: levels 1 to 7 add only about +1.5 to a check, so only party size, gear and HP separate them (see "For the designer").

## What changed (Plan 6 Track B)

Constants (`src/engine/constants.ts`), old → new:

| Constant | Old | New | Why |
| --- | --- | --- | --- |
| `CAMARADERIE_FAIL` | 2.5 | 1 | Failed checks were the largest loss for a party of 3–4 |
| `CAMARADERIE_CRIT_FAIL` | 5 | 2 | The same |
| `CAMARADERIE_HUNGER` | 13 | 8 | A starving party broke up in five days, before anything else could happen |
| `XP_BY_LEVEL` | 150 × n × (n − 1) (57,000 at 20) | 0, 200, 500, 900, 1,500, 2,300, then +900 a level to 8,600 at 13, then 9,600 … 17,700 at 20 | The designer's levels 4 / 7 / 13 / 19 on days 30 / 100 / 200 / 300 |
| `CR_DC` (CR 12 and up) | 18 at CR 12, 21 at CR 18 | 17 at CR 12, 20 at CR 18 | Act II's finale was won 14% of visits at level 14 (now 31%) |
| `DOWNED_EXHAUSTION` (new) | – | 2 | A wound that drops a member to 0 HP, or lands on one already down, adds exhaustion (6 is death) |
| `CR_WOUND_STEP` (new) | – | 1/3 | Wounds go 1/3 deeper per CR above `CR_STANDARD` where a CR applies |
| `DUNGEON_XP_SHARE`, `DUNGEON_MILESTONE_SHARE`, `DUNGEON_END_SHARE` (new) | – | 0.75, 0.25, 0.5 | The designer's dungeon XP (below) |
| `LAIR_XP_SHARE` (new) | – | 0.25 | Lairs pay a smaller share of their CR's level step, × (1 + power) as before |

Mechanics, each the smallest that a target needed (flagged for the designer):

1. **Downed costs exhaustion** (`encounters/effects.ts`): without it no wound could ever kill; only hunger, thirst and forced marches did. A line says so ("Mira goes down, badly hurt: +2 exhaustion.").
2. **Wounds deepen with the CR** (`rules/levels.ts` `crWound`; `world/danger.ts` `harden` takes a `wound` factor), as DCs already did: dungeon rooms (on top of `DELVE_WOUND`), lairs, and hostile road encounters while a levelled contract is held. Without it a level-10 party shrugged off a CR 10 dungeon (HP grows about 8 a level). Crisis sites keep their wounds as written (Track K wrote them for the CR).
3. **Dungeon XP by level** (designer, 2026-11-13): clearing an authored dungeon pays 75% of what its level (`crLevel(cr)`) needs to level up (`levelGap`), in place of `XP_CLEAR` × (1 + power). A room marked `milestone: true` (a new optional field; never the last room) pays 25% when passed, once per inhabited spell (`PoiState.milestones`, an optional field: no save migration), and the hoard the rest, at least 50%: 75% with no milestone, 25/50 with one, 25/25/50 with two (a longer dungeon pays more in all; Claude's reading of "and so on"). The milestone is an engine-only effect (`milestone`), written into the room's snapshot when it starts, so its chip ("+N XP: a milestone (once a clearing)") is what is paid; withdrawing and coming back doesn't offer it again. Marked: the Lich's Gauntlet (the Violet Glyph), the Drakescale Forge (the Drake Pens and the Tithe Heap), Stormwrack Manor (the Hearth Hall) and the Ape King's Vault (the Golden Stair). Lairs follow the same rule at a smaller share (25% of their CR's step, × (1 + power) as before).
4. **Act I's finales:** a failed round now hurts the whole party (−12 / −10 to all, and the text says so), so a novice pair can be knocked out of the fight. The effect on novices is small (26% → 22%).

The sim policies (`src/engine/travel/trader.ts`, not rules): the upkeep above; a met contract the town refuses (its goods were lost) is given up instead of carried for ever (it froze some crusaders between two towns); the crusader delves known dungeons suggested for at most its best level + 1, within 4 days, presses on while everyone has 35% HP and the next room's drive-out chance is at most 70%, and doesn't back out mid-room; every policy stops when the run is over.

## The numbers (Plan 6 Track B)

| Policy | Won | Lost | Fallen | Disbanded | Ended on (P10 / median / P90) | Members dead |
| --- | --- | --- | --- | --- | --- | --- |
| crusader | 0% | 65% | 0% | 35% | 94 / 125 / 302 | 5 |
| crusader, game start | 0% | 70% | 0% | 30% | 96 / 203 / 292 | 5 |
| trader | 0% | 85% | 0% | 15% | 74 / 103 / 104 | 2 |
| trader, on to day 360 | 0% | 65% | 0% | 35% | 74 / 361 / 364 | 4 |

Runs over (fallen or disbanded) by day, crusader: 0% by day 30, 5% by 60, 15% by 100, 20% by 130, 35% by 200, 40% by 300.

Levels (best living member; P10 / median / P90, runs still going):

| Policy | Day 30 | Day 60 | Day 100 | Day 130 | Day 200 | Day 300 |
| --- | --- | --- | --- | --- | --- | --- |
| crusader | 3 / 4 / 5 | 4 / 5 / 6 | 6 / 7 / 9 | 8 / 11 / 13 | 11 / 14 / 17 (7 runs) | 19 (4 runs) |
| trader, on to day 360 | 3 / 4 / 5 | 6 / 6 / 8 | 8 / 10 / 12 | 10 / 13 / 16 | 14 / 17 / 20 | 18 / 20 / 20 |

The crusader's XP (median): 1,113 on day 30, 2,200 on day 60, 3,883 on day 100, 10,216 on day 200. The trader levels faster than the crusader (more contracts, whose pay and XP grow with the level) and reaches level 20 by about day 230.

Each act's prevention (crusader):

| Act | Reach it alive | Thwart | Fail the act | Die or disband in it | Lose | Finale visits won | Level then (median) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I | 19 | 11 | 6 | 2 | 42% | 35% (11/31) | 6 |
| II | 8 | 4 | 2 | 2 | 50% | 31% (4/13) | 14 |
| III | 4 | 0 | 4 | 0 | 100% | 0% (0/4) | 19 |

Dungeons against the road (crusader): road encounters 1,052, 28% of checks failed, 3.5 HP lost an encounter; dungeon rooms 70, 32% failed, 16.8 HP lost a room; deaths 0.2 and 0 per 100. Delves 27: cleared 4, driven out 23, hoard gold 125 on average.

Camaraderie by cause (crusader, mean per run): failed checks −66, hunger and thirst −60, fleeing and other encounter losses −19, deaths −6; contracts +69, rounds at the inn +38, private rooms +4, a member leaving +1. Before the round (old constants, no upkeep, fleeing at face value) failed checks alone were about −110 a run, fleeing −28, and the gains about +85.

## For the designer (Plan 6 Track B)

1. **How should a sensibly played party die?** The 75%-before-the-Crisis target needs deaths the sim doesn't take: it rests before every climax and withdraws hurt, so even with downed exhaustion, deeper dungeon wounds (tried ×3) and two downs being nearly fatal (tried 3 exhaustion a down), only 5–8 members die in 20 runs, and runs end by disbanding (hunger) or by losing an act. Options: (a) accept that the sim is cautious and the 75% is for players who press their luck; (b) make lost climaxes and fights kill outright sometimes (a death save when downed, or 5e's massive damage: overflow beyond max HP kills); (c) wounds as a share of HP, about 25–35% a hit as in 5e (today 5–15% above level 3).
2. **Novices and the key challenge.** Bounded accuracy: levels 1–7 add about +1.5 to a check, so a pair of novices does about as well as a pair of level-7 heroes; what makes the intended party win (45%) is four members (the best specialist each round) and HP. Levers that would separate them: a challenge that needs more than one member (each round's option tied to a different member), proficiency growing faster than 5e's, or gating ("this is beyond you" refusing below the CR's level − 3). Counting a partial as a failure (`CHALLENGE_MARKS`) was tried: it lowers every party by about 7 points and separates them no better (novices 16%, level 7 23%), so it was left as it was.
3. **Act III** is lost by everyone who reaches it: the CR 18 finale (5 successes before 3) at level 19. Lower `CR_DC` at 18 further (20 → 19), or size CR 13+ finales 4/3 (only 4 runs reached it).
4. **Dungeons are mostly driven out** (23 of 27 delves): with a drive-out on every failed room, a five-room dungeon at the party's level clears about one time in six. That is about 2× the risk a room but much more a dungeon; a clear pays well (75% of a level), but the expected XP a delve is low. Levers: only a critical failure drives out (or a room's second failure), or a larger share.
5. **Hunger still ends most disbanded runs** (and 35% of the long-lived traders within a year). Each is a broke party that kept travelling; it fits "neglect", but it means the economy's floor, not risk, is still the main ending after a lost act.

## Plan 5b history

### Summary

In plain words:

- **When the party lives to see the end, the Crisis plays about as intended.** Acts are found with plenty of time (a median of 100 days to spare), few are thwarted late (14%), the finales get harder act by act (100%, 80%, 71% success), and of the runs the Crisis decided, the crusader won 5 of 6.
- **Most parties don't live that long, so the win target is not met:** the crusader wins 25% of runs (target 40–75%) and falls in 70%. Deaths are hunger and thirst, as in the economy report. Even the cautious trader, which ignores the Crisis, falls in 55% of runs by day 360. The Crisis can't be won more often than parties survive a year, and no Crisis number changes that.
- **Every Crisis site now has water** (an abandoned well, a spring or a cistern: `"water": true` on every type in `data/claude/crisis-sites.json`, an overnight design call in I2). Some reveal and act sites lie 3–4 days off the road in the desert, and a party of two couldn't carry the water there and back. With water there, it needs water only for the way there.
- **Learning the plan by day 25 is still short of its target (70%, was 60%; target 90%).** The reveal site is heard of early (median day 8), and the P90 of learning the plan fell from day 73 to day 42. Two runs still never learn it: both parties fell before reaching the site.
- **The villains are now within 2× of each other** (Ashen Prophet 17%, Drake-Speaker 33%, Pretender's Hand 20%); before the water the Ashen Prophet won none of its 6 runs.
- **No tuning value was changed.** The act DCs, clue rules and leeway are not what holds the targets back (see "What tuning could and couldn't do"). The lever left is the economy's safety net, for the designer.
- **One content change, from review:** the act sites' approach checks pay no XP (an explicit `xp` of 0), because an act site stays open until thwarted and leaving and coming back would farm it. The finale still pays its XP, plus `XP_THWART`.
- **A sanity check passes:** the trader, which ignores the Crisis, never wins.

To regenerate the full report (about 30 s):

```
CRISIS_REPORT=/tmp/crisis.md pnpm vitest run src/content/crisis.sim.test.ts
```

Without `CRISIS_REPORT`, the same file only runs its guard test: the crusader plays seeds 1–3 for 120 days (or until the run ends) and must keep a valid state.

**Content:** these runs use the committed data only (no `data/imported-private/`).

### Method

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

### Targets

No tuning value was changed. The only change since I1 is water at every Crisis site (I2).

| Target | Result | Met | In I1, without the water |
| --- | --- | --- | --- |
| The plan is learned by day 25 in ≥ 90% of runs | 70% (median day 14, P90 day 42; 2 runs never) | No | 60% (P90 day 73; 3 never) |
| The median act site is found with ≥ 30d to spare | 100d | Yes | 100d |
| The crusader wins 40–75% of runs | 25% (70% fallen, 5% lost) | No | 20% |
| Fewer than 25% of acts are thwarted late | 14% | Yes | 8% |
| The trader loses nearly every run | 90% lost, 10% fallen, none won | Yes | the same |
| No villain's win rate is more than 2× another's | Ashen Prophet 17%, Drake-Speaker 33%, Pretender's Hand 20% | Yes | No (0% / 33% / 20%) |

For reference, of the 6 runs the Crisis decided (won or lost), the crusader won 5 (83%).

More acts are thwarted late (4 of 28, against 2 of 26) because more parties reach act II and III at all; it is well inside the target.

### The numbers (crusader, seeds 1–20)

| Policy | Won | Lost | Fallen | Ended on (P10 / median / P90) |
| --- | --- | --- | --- | --- |
| crusader | 25% | 5% | 70% | 77 / 125 / 217 |
| crusader, game start | 10% | 30% | 60% | 61 / 138 / 241 |
| trader | 0% | 90% | 10% | 125 / 136 / 141 |
| trader, on to day 360 | 0% | 45% | 55% | 135 / 353 / 363 |

Parties fallen by day (a won or lost run counts as standing):

| Policy | Day 60 | Day 120 | Day 240 | Day 360 |
| --- | --- | --- | --- | --- |
| crusader | 5% | 45% | 70% | 70% |
| crusader, game start | 10% | 40% | 55% | 60% |
| trader, on to day 360 | 0% | 0% | 30% | 55% |

The crusader falls sooner than the trader: chasing the Crisis means long site trips, ferry fares and wages without income. The trader that plays on shows the floor: half the parties don't last a year.

**Hearing of it.** The reveal site was first heard of through a rumour in 11 runs, an omen in 5 and the summons in 4 (median day 8). With the game's start the summons does more (7 runs), since a poor party listens less.

**The acts:**

| Act | Reached | Site found (median day) | Days to spare when found (P10 / median / P90) | Thwarted | Late | Failed | Level then (median) | Visits per thwart | Finale success |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I | 20 | 27 | 40 / 78 / 93 | 15 | 2 | 0 | 3 | 1.0 | 100% (15/15) |
| II | 15 | 48 | 121 / 150 / 173 | 8 | 1 | 1 | 5 | 1.3 | 80% (8/10) |
| III | 8 | 104 | 101 / 199 / 220 | 5 | 1 | 0 | 7 | 1.4 | 71% (5/7) |

With the game's start, act I's finale succeeds 88% of the time (14/16), act II's 55% (6/11) and act III's 33% (2/6). The crusader there gets to the sites poorer and less often fit, and wins 10% of runs (15% without the water: within the noise of 20 seeds).

**An early finish.** An act becomes current as soon as the one before is thwarted, not when its due day nears. A crusader that survives can win long before the calendar says. Seed 16 won on day 124 and seed 15 on day 148, with act III not due until about day 300 (in I1, before the water, seed 18 won on day 93, before act I was even due). The due days only bite on a slow or unlucky party.

### What tuning could and couldn't do

The plan's tuning order was the act DCs, then the clue rules (`CRISIS_RUMOUR_CLUES`, `CRISIS_SUMMONS_DAY`), then `CRISIS_LEEWAY_DAYS` and `CRISIS_LATE_STEP_DAYS`. None of them is what stops the targets:

- **Act DCs:** the finales already succeed 100%, 80% and 71%, and only 14% of acts are thwarted late. Easier DCs wouldn't save a party that starves on the road. Act I is perhaps too easy (100%, one visit each), but making it harder would push the win rate further below its band, so it was left alone.
- **Clue rules:** sites are found with 100 days to spare, and the reveal site is heard of by day 8. A party learns the plan late because it can't reach the site, not because it hasn't heard of it, so an earlier summons or more rumour clues wouldn't help.
- **Leeway and the late step:** few acts run late, so these rarely come into play.
- **`CRISIS_ACT_DAYS` (yours):** the deadlines don't bind. Act sites are found with a median of 100 days to spare, and a surviving crusader finishes early. Shortening the acts wouldn't raise the win rate, and lengthening them wouldn't help either, since the party's survival is what runs out.

#### Water at the Crisis sites (kept in I2)

I1 tried giving every crisis site type `"water": true` (a well, spring or cistern that refills the waterskins on arrival), so a party only needs water for the way there. I2 kept it as an overnight design call; the numbers above are with it:

| | I1, without water | With water (now) |
| --- | --- | --- |
| Plan learned by day 25 | 60% (P90 day 73) | 70% (P90 day 42) |
| Crusader wins | 20% | 25% |
| Ashen Prophet / Drake-Speaker / Pretender's Hand wins | 0% / 33% / 20% | 17% / 33% / 20% (within 2×) |
| Fallen | 70% | 70% |

It helps the far and desert sites, and with them the villain spread, but deaths stay where they are.

### For the designer

1. **Survival is the lever for the win rate.** Half the parties starve within a year even when they ignore the Crisis. This is the economy report's open safety-net question again: should a broke party in town always have a way to eat? Until a party usually lasts a year, the crusader's win rate is capped by survival. When the Crisis does get decided, the crusader wins about two in three.
2. **Crisis sites and water (decided overnight in I2: every crisis site has water).** If that feels too generous, the alternatives were to cap a crisis site's own path at about 2 days when placing it, or to keep reveal sites out of the desert. Either would also lift "plan by day 25".
3. **Should acts wait for their time?** As built, a fast party can thwart all three acts by about day 100. If each act should feel like its own season, act n's site could stir only from some days before its due day (for example due − 60), with clues to it only from then on.
4. **A cosmetic engine note (fixed):** an outcome with an explicit `xp` of 0 no longer shows "+0 XP" in its chips or its journal line.
