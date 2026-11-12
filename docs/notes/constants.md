# Balance constants

The engine's balance and tuning numbers are all in **[`src/engine/constants.ts`](../../src/engine/constants.ts)**, grouped by topic: starting party, travel and encounters, pace, pursuit, foraging, supplies and prices, stowing away, politics, settlements, notable people, points of interest, site cycles and boons, exploring, Strain, checks, and territory. Each has a one-line comment, and each section names the module that uses it. Edit a value there, then run `pnpm test`.

**Watch out:** some tests pin exact values (for example `ENCOUNTER_SLOT_CHANCE`, `BOON_COOLDOWN_DAYS`) or measure statistics such as the Rampant share and POIs per world. When you deliberately change a number, update the matching test expectation.

## Knobs in the data files

| File | Field | What it controls |
|---|---|---|
| `data/claude/threats.json` | each threat's `strength` | How strong regional threats are (moves the Rampant share) |
| `data/procedural/poi-types.json` | `weight`, `threat`, `water` per type | How common each POI type is, its threat and whether it has water |
| `data/original/skills.json` | each skill's `ability` | The default ability for each skill |

Encounter odds and rewards live in the situations themselves (`situations.json` files in every source).

See also [threat-levels.md](threat-levels.md) for how threat and Rampant are worked out.
