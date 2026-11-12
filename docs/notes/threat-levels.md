# Threat levels per domain: what "Rampant" means

Each of the 16 **lands** of Altaeus has one **local threat**: a usurper or menace such as an orc warband, restless dead, a dark cult or a drake brood (`data/claude/threats.json`). Each of the 53 **domains** (one per settlement, owning the land nearest to it) belongs to a kingdom. The **threat level** says how well that kingdom keeps the land's threat in check *in that domain right now*.

## How the level is worked out

The world is generated in `src/engine/world/politics.ts` and `pois.ts`. The level itself is derived on demand (`domainThreatLevel`) and never stored, so clearing a lair lowers it at once.

1. **Kingdoms and garrisons.** Each kingdom rolls a total **defence** of `DEFENCE` = 9–22. It splits that defence over its domains by distance from its seat: a domain *h* hops from the seat weighs `1 / (1 + SEAT_FALLOFF × h)`, with `SEAT_FALLOFF = 0.5`. A sprawling kingdom therefore has thin garrisons, and its border domains are thinner still. This is the "growing kingdoms crack at the edges" rule.
2. **Land threats.** Each land rolls a threat suited to its terrain, with a **strength** from that threat's range. The weakest are goblins, bandits and cults at 1–3. The strongest are drakes and giants at 3–5.
3. **Lairs and dungeons.** Every inhabited hostile POI in the domain adds its own threat to the land's strength. Most lairs add 1–2, drake roosts and giant steadings add 2, and hostile dungeons add 1. Undiscovered sites count too, silently. A lair keyed to threats is only placed where one of its threats holds the land (`lairFits`).
   - **Their cycles** (`src/engine/world/sites.ts`): after any clearing a site lies empty 30 days and adds nothing; then it is inhabited for 120 ± 20 days, gaining a level of power every 40 days. At power 2 it adds 1 more threat (at most 3). Then the realm or an accident clears it and the cycle repeats, so about four in five are inhabited at any time. The level on a given day is derived from the day, so it moves as sites empty and fill.
4. **Threat level = (land strength + lairs) − garrison**, rounded and clamped to 0–3:

| Level | Name | Meaning |
|---|---|---|
| 0 | **Held** | The garrison keeps it down. Roads are about as safe as they get. |
| 1 | **Stirring** | Raids and rumours; noticeable but manageable. |
| 2 | **Rising** | The threat openly contests the domain. |
| 3 | **Rampant** | The threat effectively has the upper hand there. The kingdom's grip is broken in all but name. |

## What the level affects today

- **Encounter chance on a route or path:** the route takes the higher level of the domains at its two ends (a POI end counts as its domain). Each encounter slot fills with 20% + 15% per route danger + **10% per threat level** + the pace bonus, capped at 90%. A Rampant domain adds +30% per slot.
- **The calm start:** the default start picks a small settlement in the calmest mainland domain.
- **Encounter flavour:** twist kinds, situations and POI types tagged for a threat are drawn more often where it holds the land.
- **Clearing a site** removes its threat for about a month, which can drop the domain a level or more. Then something moves in again and grows stronger, so the domain drifts back up.

Later it will also feed prices and demand (Plan 4) and the kingdom-and-usurper simulation, where threats grow and kingdoms lose grip over time (design §6).

Later, threats may weaken with distance across a realm instead of affecting all its domains equally.

## The balance

The target is **10–15% of domains Rampant** across generated worlds. Most domains should sit at Held to Rising, with a handful of real hot-spots per world, mostly on kingdom borders, that you route around or profit from.

Measured over 1,200 worlds (six blocks of 200 seeds, after the Plan 3b merge, with every POI in place):

| Held | Stirring | Rising | Rampant |
|---|---|---|---|
| 51.5% | 20.8% | 15.4% | **12.3%** |

- **Rampant per block of 200 seeds:** 11.8–12.8%. That is about 6.5 of the 53 domains per world. Seeds 1–5 give 8, 9, 7, 9 and 14.
- **Spread:** 81–88% of worlds have 2–12 Rampant domains (the old "1–4 of 16 regions" scaled to 53 domains), and only 0–2.5% have none.
- **Without POIs:** only 6–7% would be Rampant. Lairs and dungeons roughly double it, so clearing them visibly matters.
- **Seats versus borders:** a seat's median level is 0 (mean 0.23) and a border domain's median is 1 (mean 1.0).
- **POIs:** 46–53 per world on seeds 1–5 (41–60 over 1,200 worlds), of which 7–15 are hostile (23% overall).

**With the sites' cycles** (Plan 3b review fixes, 1,200 worlds, POIs at least 25 km apart): about 80% of dungeons and lairs are inhabited on any day, and some have grown strong.

| Day | Held | Stirring | Rising | Rampant | 2–12 Rampant | none |
|---|---|---|---|---|---|---|
| 1 | 52.3% | 20.5% | 14.8% | **12.4%** | 87.2% | 1.3% |
| 60 | 52.3% | 20.5% | 14.8% | **12.4%** | 88.2% | 1.4% |
| 120 | 52.2% | 20.6% | 14.8% | **12.4%** | 87.5% | 0.8% |
| 365 | 52.3% | 20.4% | 14.8% | **12.5%** | 88.0% | 1.1% |
| 1000 | 52.3% | 20.5% | 14.8% | **12.4%** | 86.8% | 1.2% |

The empty fifth and the extra threat of the strong third roughly cancel out, so the share is where it was.

A content test (`src/content/world.test.ts`) measures seeds 0–199 on days 1, 120 and 365. It guards the Rampant share at 8–18% (the target stays 10–15%), checks that at least 80% of worlds have 2–12 Rampant domains, and that the seat median stays below the border median.

### History

- **Plan 3, over regions:** strengths of up to 6 against a defence of 4–10, split evenly over regions, made about 27% of regions Rampant. Every threat's top strength was lowered by one, which brought it to 12%.
- **Plan 3b, over domains:** `DEFENCE` started at 8–20, which gave about 10% before lairs existed. Once the hostile POIs were merged it measured 14.1–15.0%, at the top edge of the target. I1 raised `DEFENCE` to 9–22, which brings it to 12.3%.

### Tuning knobs, in the order to reach for them

The constants below live in `src/engine/constants.ts` (see [constants.md](constants.md)).

1. `DEFENCE`. Raising both ends by one or two moves Rampant by about 1–2 points. For example, 10–22 gives 11.5% and 10–24 gives 10.6%.
2. `SEAT_FALLOFF`. This sets how much weaker borders are than seats.
3. The lair `threat` ranges and `weight`s in `data/procedural/poi-types.json`, the POI density (`POI_SPOTS_EACH`, `POI_MAX_PER_DOMAIN`), and the sites' cycles (`REINHABIT_DAYS`, `INHABITED_DAYS`, `POWER_STEP_DAYS`, `POWER_THREAT_AT`).
4. The threat `strength` ranges in `data/claude/threats.json`, only as a last resort.
