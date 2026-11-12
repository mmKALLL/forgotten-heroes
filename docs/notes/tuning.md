# Tuning knobs

Where the game's balance numbers live. They are all plain constants, so edit the value, run `pnpm test`, and check what the tests say.

**Watch out:** some tests pin exact values (for example `ENCOUNTER_SLOT_CHANCE`) or measure statistics such as Rampant share and POIs per world. When you deliberately change a number, update the matching test expectation.

## Travel and encounters

| File | Constants | What they control |
|---|---|---|
| `src/engine/travel/routes.ts` | `ENCOUNTER_SLOT_CHANCE` (0.3) | Chance that each encounter slot beyond the minimum fills |
| | `SHORT_HOP_DAYS`, `LONG_JOURNEY_DAYS`, `encounterRange()` | Encounter count range by journey length (0–2, 1–3, 2–4) |
| | `HOSTILE_BASE` (0.1), `HOSTILE_PER_DANGER`, `HOSTILE_PER_THREAT`, `HOSTILE_SHARE_RANGE` | How likely an encounter is to be hostile |
| | `KM_PER_DAY`, `SEA_FARE` | Travel speed by terrain; ship fare |
| `src/engine/travel/pace.ts` | `PACE_SPEED`, `PACE_HOSTILE_BONUS`, `CAUTIOUS_HOSTILE_AVOIDANCE` | The paces: speed, extra hostility, and how much cautious avoids |
| | `FORCED_MARCH_EXTRA_RATIONS`, `FORCED_MARCH_DC`, `COVER_TRACKS_EXTRA_DAYS` | Forced-march cost; the time cost of covering tracks |
| `src/engine/travel/tuning.ts` | `FORAGE_DC`, `FORAGE_PACE_MODIFIER`, `FORAGE_HOSTILE_BONUS` | Foraging difficulty by terrain; the hostility it attracts |
| | `WATER_DAYS`, `WATERSKIN_WATER`, `WATERSKIN_PRICE`, `LODGING_PRICE`, `SELL_SHARE` | Water capacity, prices, selling |
| | `STOWAWAY_*` | Stowing away: DC and the costs of getting caught |

## World

| File | Constants | What they control |
|---|---|---|
| `src/engine/world/politics.ts` | `KINGDOMS`, `DEFENCE`, `SEAT_FALLOFF`, `SAME_LAND_WEIGHT`, `RULER_WEIGHTS` | Kingdom count, strength, garrison falloff from the seat, border growth |
| `src/engine/world/pois.ts` | `POI_SPOTS_EACH`, `POI_MAX_PER_DOMAIN`, `POI_MIN_KM`, `POI_FAVOURED` | Point-of-interest density and placement |
| `src/engine/world/explore.ts` | `EXPLORE_DAYS`, `EXPLORE_DC_BONUS`, `EXPLORE_SKILLS` | Exploring a domain |
| `src/engine/world/territory.ts` | `SPOT_LINK_KM`, `OFF_ROAD_WINDING` | Territory and off-road distances |
| `data/claude/threats.json` | each threat's `strength` | How strong regional threats are (affects Rampant share) |
| `data/procedural/poi-types.json` | `weight`, `threat`, `water` per type | How common each POI type is, and its threat and water |

## Characters and checks

| File | Constants | What they control |
|---|---|---|
| `src/engine/rules/strain.ts` | `STRAIN_PER_DAY`, `STRAIN_PER_WEEK`, `SKILL_USE_DAYS` | Strain thresholds (3 a day, 10 a week) |
| `src/engine/rules/checks.ts` | `PARTIAL_MARGIN` | How close to the DC counts as a partial success |
| `data/original/skills.json` | each skill's `ability` | Default ability per skill |

See also [threat-levels.md](threat-levels.md) for how threat and Rampant are worked out.
