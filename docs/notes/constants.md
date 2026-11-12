# Balance constants

The engine's balance and tuning numbers are all in **[`src/engine/constants.ts`](../../src/engine/constants.ts)**, grouped by topic: starting party, travel and encounters, pace, pursuit, foraging, supplies and prices, stowing away, politics, settlements, notable people, reputation, points of interest, site cycles and boons, exploring, Strain, checks, and territory. Each has a one-line comment, and each section names the module that uses it. Edit a value there, then run `pnpm test`.

**Watch out:** some tests pin exact values (for example `ENCOUNTER_SLOT_CHANCE`, `BOON_COOLDOWN_DAYS`) or measure statistics such as the Rampant share and POIs per world. When you deliberately change a number, update the matching test expectation.

## Knobs in the data files

| File | Field | What it controls |
|---|---|---|
| `data/claude/threats.json` | each threat's `strength` | How strong regional threats are (moves the Rampant share) |
| `data/procedural/poi-types.json` | `weight`, `threat`, `water` per type | How common each POI type is, its threat and whether it has water |
| `data/original/skills.json` | each skill's `ability` | The default ability for each skill |
| `data/claude/goods.json` | `weight` (kg), `price` (gp), `spoilPerDay`, `depth` per good | What cargo weighs against 20 kg per member at STR 10, its base price, how fast food spoils, and how many units a market absorbs before bulk trades move the price |
| `data/claude/market-rules.json` | each rule's `when`, `supply` and `demand` (−2..2) | Which settlements make a good cheap or dear: land, coast, type, size, wealth, threat level and nearby sites. Levels sum, clamp to −3..3, and move the price ×1.25 a level |
| `data/claude/service-roles.json` | `trades`, `buysOnly`, `actions` per service | Which shops buy and sell which goods, and what each service offers (none means "coming later") |
| `data/claude/animals.json` | `price`, `hirePerDay`, `capacity` (kg), `speed`, `waterPerDay`, `upkeepPerDay`, `maxPathDanger` | Pack and riding animals and vehicles: what they cost, carry and drink, and where they can go |
| `data/claude/person-roles.json` | `weight`, `minSize`, `service` per role | Which notable people a settlement has |
| `data/claude/contracts.json` | `km`, `amount`, `passengers`, `urgentChance`, `pay`, `reputation`, `minSize`, `minStanding` per template | Notice-board contracts: how far they send the party, how much cargo, how often they are urgent, the pay multiplier and the reputation they earn |
| `data/claude/poi-situations.json` | precious `goods` amounts in lair-leader and vault outcomes | How much dungeon and lair loot comes as relics, gems and luxuries rather than gold |

Encounter odds and rewards live in the situations themselves (`situations.json` files in every source).

See also [threat-levels.md](threat-levels.md) for how threat and Rampant are worked out.

The economy's numbers (spreads, market depth, contract pay and deadlines, goods prices) were tuned against a simulation: see [economy-report.md](economy-report.md) to rerun it before changing them.
