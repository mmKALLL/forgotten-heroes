# Balance constants

The engine's balance and tuning numbers are all in **[`src/engine/constants.ts`](../../src/engine/constants.ts)**, grouped by topic: starting party, travel and encounters, pace, pursuit, foraging, supplies and rest, carrying capacity, markets, geographic supply, the price book, services and animals, visible wealth, stowing away, politics, settlements, notable people, reputation, rumours, contracts, recruits (the party cap, sign-on fees, rolled stats, old wounds and starting gear), camaraderie (its losses and gains, parting and the low spell), points of interest, site cycles and boons, exploring, gathering, rule hooks and accessories, Strain, checks, territory, progression (the XP table and what pays XP), challenge ratings (the CR → DC table and `CR_STANDARD`, the CR content is written at), levelled work (contract levels and pay by level), authored dungeons (how many are placed, the near-start rule, lairs' CR), delving (wounds, the hoard), world danger (the ramp), and the Crisis (rolling it, the calendar, the danger surge, the waiting penalty, clues and thwarting, and rumours, the summons and omens). Each has a one-line comment, and each section names the module that uses it. Edit a value there, then run `pnpm test`.

**Watch out:** some tests pin exact values (for example `ENCOUNTER_SLOT_CHANCE`, `BOON_COOLDOWN_DAYS`) or measure statistics such as the Rampant share and POIs per world. When you deliberately change a number, update the matching test expectation.

## Knobs in the data files

| File | Field | What it controls |
|---|---|---|
| `data/claude/threats.json` | each threat's `strength` | How strong regional threats are (moves the Rampant share) |
| `data/procedural/poi-types.json` | `weight`, `threat`, `water` per type | How common each POI type is, its threat and whether it has water |
| `data/original/skills.json` | each skill's `ability` | The default ability for each skill |
| `data/claude/goods.json` | `weight` (kg), `price` (gp), `spoilPerDay`, `depth` per good | What cargo weighs against 20 kg per member at STR 10, its base price, how fast food spoils, and how many units a market absorbs before bulk trades move the price |
| `data/claude/producers.json` | each rule's `when` and `output` (1–3 per good) | Where goods are made: land, coast, type, size, wealth and the sites in the domain. A market's supply is the best producer within reach, a level less per `SUPPLY_DAYS_PER_LEVEL` steady days, down to `SUPPLY_MIN` |
| `data/claude/market-rules.json` | each rule's `when`, `label` and `demand` (−2..2) | Which settlements want a good: land, coast, type, size, wealth, threat level and nearby sites. Demand sums and clamps to −3..3; demand − supply (within ±3) moves the price ×1.25 a level. The label is shown when the market explains a price |
| `data/claude/service-roles.json` | `trades`, `buysOnly`, `actions` per service | Which shops buy and sell which goods, and what each service offers (none means "coming later") |
| `data/claude/animals.json` | `price`, `hirePerDay`, `capacity` (kg), `speed`, `waterPerDay`, `upkeepPerDay`, `maxPathDanger` | Pack and riding animals and vehicles: what they cost, carry and drink, and where they can go |
| `data/claude/person-roles.json` | `weight`, `minSize`, `service` per role | Which notable people a settlement has |
| `data/claude/service-roles.json` | `recruits`: `offers`, `levels`, `picks`, `classes`, `fee` per service | Who hires out (the inn, the adventurers' guild, mercenaries): how many recruits a week, their levels (drawn in this range, 0 is a level-1 recruit with two old wounds; those above the lowest living member's level + 2 are listed but won't join), their quality (`picks`: the best of n sets of 3d6 rolls), classes, and a multiplier on the sign-on fee |
| `data/claude/contracts.json` | `km`, `amount`, `passengers`, `urgentChance`, `pay`, `reputation`, `minSize`, `minStanding` per template | Notice-board contracts: how far they send the party, how much cargo, how often they are urgent, the pay multiplier and the reputation they earn |
| `data/claude/poi-situations.json` | precious `goods` amounts in lair-leader and vault outcomes | How much dungeon and lair loot comes as relics, gems and luxuries rather than gold |
| `data/claude/service-roles.json` | `accessories.offers` and `accessories.maxTier` (Magic Items, finesmith) | How many accessories a shop offers a week and the best tier it sells |
| `data/procedural/accessories.json` | `weight`, `minTier`, `value`, `bases` and the hook's amount per part | How often each base and affix is rolled, which tier it needs, what it adds to the price, which bases it fits and how strong its rule hook is |
| `data/claude/poi-situations.json` | `accessory` effects (and their `tier`) in lair and dungeon clearings | Where accessories drop as loot |
| `data/claude/gathering.json` | `biomes`, `skill`, `dc` and `yield` per tier per rule | What a party can gather for a day in each land, how hard it is (before the domain's producers lower the DC) and how many units each tier brings home for two workers |
| `data/claude/villains.json` | `weight`, `threats` and `boss` per villain; `biomes`, `seat`, `leadCr`, `keyCr` and `surge` per act | How often each villain is rolled for a world (favoured where its threats hold a land), where each key site is placed, how hard each act's lead and key encounters are (their DCs come from the CR), and whether the danger surges before the act is due |
| `data/claude/dungeons-1.json`, `dungeons-2.json` | `cr`, `biomes` and `hoard` (`precious`, `accessory`) per dungeon | Each authored dungeon's difficulty (its rooms' DCs move by `crDc(cr) − crDc(CR_STANDARD)`), where it may be placed, and the goods and accessories its hoard holds besides the gold (`DELVE_REWARD` × a same-level contract's pay) |
| `data/claude/dungeon-rooms-1.json`, `dungeon-rooms-2.json` | each room situation's `dc`s and wounds, written at standard difficulty | How hard each room is before its dungeon's CR, and how deep its wounds go before `DELVE_WOUND` |
| `data/claude/dungeon-sites.json` | `pathDanger` of the `authored-dungeon` type | How dangerous the path to every authored dungeon is |
| `data/claude/crisis-sites.json` | `pathDanger` and `water` per type | How dangerous the path to each Crisis site is, and whether it refills the waterskins (every one does: some lie days off the road in the desert) |
| `data/claude/crisis-situations.json` | the `dc` of each Crisis situation's checks (read as offsets from 12, `CRISIS_DC_BASE`), the wounds (`hp`, played as written, so written for the act's CR), the gold paid and asked, and `xp` 0 on the approach checks | How much harder or easier each check is than its act's CR, how much a visit hurts and pays, and that only the finale (and a lead's last stage) pays XP |
Encounter odds and rewards live in the situations themselves (`situations.json` files in every source).

See also [threat-levels.md](threat-levels.md) for how threat and Rampant are worked out.

The economy's numbers (spreads, market depth, contract pay and deadlines, goods prices) were tuned against a simulation: see [economy-report.md](economy-report.md). Rerun it after changing them:

```
ECONOMY_REPORT=/tmp/economy.md pnpm vitest run src/content/economy.sim.test.ts
```

The simulation starts its parties with its own 50 gp (`SIM_GOLD` in the test), so its guards and tables don't move with `STARTING_GOLD`; the report ends with a reference section for the game's own `STARTING_GOLD` start.

The Crisis numbers (the `CRISIS_*` constants, `XP_THWART`, and the act DCs) were checked against the Crisis simulation: see [crisis-report.md](crisis-report.md). Rerun it after changing them:

```
CRISIS_REPORT=/tmp/crisis.md pnpm vitest run src/content/crisis.sim.test.ts
```

`CRISIS_ACT_DAYS` (about 100 days an act) is the designer's number; the report says what changing it would do instead of tuning it.
