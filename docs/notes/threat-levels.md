# Regional threat levels — what "Rampant" means

Each region of Altaeus has one **local threat**: a usurper or menace such as an orc warband, restless dead, a dark cult or a drake brood (`data/claude/threats.json`). The **threat level** says how well the ruling kingdom keeps that threat in check *in that region right now*.

## How the level is worked out

When a world is generated (`src/engine/world/politics.ts`):

1. Each **kingdom** rolls a **defence** of 4–10 and spreads it evenly over the regions it rules. A kingdom with 4 regions and defence 8 has a **garrison of 2 per region**. This is the "growing kingdoms defend less well" rule: the more regions, the thinner the garrisons.
2. Each **region** rolls a **threat** suited to its terrain (e.g. drakes in mountains and deserts, hags in marshes), with a **strength** from that threat's range: weakest goblins 1–3, strongest drakes and giants 3–5.
3. **Threat level = strength − garrison**, rounded and clamped to 0–3:

| Level | Name | Meaning |
|---|---|---|
| 0 | **Held** | The garrison keeps it down. Roads are about as safe as they get. |
| 1 | **Stirring** | Raids and rumours; noticeable but manageable. |
| 2 | **Rising** | The threat openly contests the region. |
| 3 | **Rampant** | The threat effectively has the upper hand there. The kingdom's grip is broken in all but name. |

## What the level affects today

- **Encounter chance on every route in the region:** each encounter slot fills with 20% + 15% per route danger + **10% per threat level**, capped at 90%. A Rampant region adds +30% per slot.
- **The calm start:** the "small town, calm region" start looks for the lowest threat level.
- **Encounter flavour:** twist kinds and situations tagged for a threat are drawn more often in its regions.

Later it will also feed prices and demand (Plan 4) and the kingdom-and-usurper simulation, where threats grow and kingdoms lose grip over time (design §6).

## The balance

The target is **10–15% of regions Rampant** across generated worlds: most regions at Held to Rising, with 1–2 real hot-spots per world that you route around, or profit from (arms and armour sell well there in Plan 4).

It used to be about 27% (roughly 4 of the 16 regions on any map), because threat strengths of up to 6 met garrisons that are often only 1–3 once a kingdom spreads over 3–4 regions. Every threat's top strength is now one lower (1–5 overall), with `DEFENCE` unchanged at 4–10. Over 200 worlds the levels come out:

| Held | Stirring | Rising | Rampant |
|---|---|---|---|
| 38% | 26% | 24% | **12%** |

That is about 2 Rampant regions per world. A content test (`src/content/world.test.ts`) measures the share over 200 seeds and fails outside 8–18%.

Tuning knobs: `DEFENCE` in `politics.ts` (4–10) and the `strength` ranges in `data/claude/threats.json`. Raising `DEFENCE` alone mostly turns Stirring regions into Held ones: even 8–12 still left about 15% Rampant.
