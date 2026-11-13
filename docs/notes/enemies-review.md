# Enemies: for the designer's review (Plan 7 Track N)

What Track N decided about enemies: the role stat tables, every creature's role and size, the bosses' moves, and the road CR budget. Everything is provisional: Track B's fight simulation tunes the numbers. Items marked **(call)** are judgement calls to check.

## 1. Role stat tables (`data/claude/enemy-roles.json`)

Rows run from CR 0 to 30: 0, 1/8, 1/4, 1/2, every CR from 1 to 20, then 22, 24, 26, 28 and 30. A creature takes the last row at or below its CR. The file's `notes` give the full recipe.

**The standard row** (before the role):
- **AC and to-hit** follow 5e's monster statistics by CR. AC goes from 13 to 19. To-hit goes from +3 to +14, a point higher than the table at CR 1/2–2, because published monsters at those CRs hit harder than it.
- **HP** is a typical published monster's HP at that CR, scaled down because members make one attack a turn:
  - 100% up to CR 1/2;
  - 60% at CR 5;
  - 45% at CR 12;
  - 40% from CR 20.
  - **(call)** Without the scaling, a CR 10 foe would take a level-11 party (about 25 damage a round today) eight rounds or more. Spells and abilities (Tracks C and S) will raise party damage, so Track B may move these shares up.
- **Damage** is one blow a turn: 70% of 5e's damage per round, and a fixed 2.5 / 4 / 5 / 7 at CR 0 to 1/2. **(call)** A standard blow takes about 40% of a member's HP at the intended level, so a member at that level survives two to three hits.
- **WIS** (morale) is CR/4 plus the role's offset.

**By role:**

| Role | HP | AC | To hit | Damage (die) | WIS | Range | Trick |
|---|---|---|---|---|---|---|---|
| Brute | ×1.35 | −1 | +0 | ×1.2 (d12) | −1 | 1 | charge |
| Skirmisher | ×0.85 | +1 | +1 | ×0.85 (d6) | 0 | 1 | hit and run |
| Archer | ×0.7 | −1 | +1 | ×0.8 (d8) | +1 | 3–5 | volley (a tile at −2) |
| Caster | ×0.6 | −2 | +1 | ×0.7 (d6), against each member on the tile | +2 | 2–3 | area |
| Swarm (each unit) | ×0.45 | −1 | +0 | ×0.6 (d4) | −1 | 1 | numbers (assisting) |
| Leader | ×1.1 | +1 | +1 | ×0.9 (d8) | +2 | 1–3 | rally |

Each cell is HP / AC / to hit / damage dice:

| CR | Brute | Skirmisher | Archer | Caster | Swarm | Leader |
|---|---|---|---|---|---|---|
| 0 | 5 / 11 / +2 / 1d4 | 3 / 13 / +3 / 1d4 | 3 / 11 / +3 / 1d4 | 2 / 10 / +3 / 1d4 | 2 / 11 / +2 / 1d4 | 4 / 13 / +3 / 1d4 |
| 1/8 | 12 / 12 / +3 / 1d8 | 8 / 14 / +4 / 1d4+1 | 6 / 12 / +4 / 1d4+1 | 5 / 11 / +4 / 1d4 | 4 / 12 / +3 / 1d4 | 10 / 14 / +4 / 1d6 |
| 1/4 | 18 / 12 / +3 / 1d10 | 11 / 14 / +4 / 1d6+1 | 9 / 12 / +4 / 1d6 | 8 / 11 / +4 / 1d6 | 6 / 12 / +3 / 1d4 | 14 / 14 / +4 / 1d8 |
| 1/2 | 27 / 12 / +4 / 1d12+2 | 17 / 14 / +5 / 1d6+2 | 14 / 12 / +5 / 1d8+1 | 12 / 11 / +5 / 1d6+1 | 9 / 12 / +4 / 1d4+2 | 22 / 14 / +5 / 1d8+2 |
| 1 | 36 / 12 / +4 / 1d12+3 | 23 / 14 / +5 / 1d6+3 | 19 / 12 / +5 / 1d8+2 | 16 / 11 / +5 / 1d6+2 | 12 / 12 / +4 / 1d4+2 | 29 / 14 / +5 / 1d8+2 |
| 2 | 52 / 12 / +4 / 2d12+1 | 33 / 14 / +5 / 2d6+3 | 27 / 12 / +5 / 1d8+5 | 23 / 11 / +5 / 2d6+1 | 17 / 12 / +4 / 2d4+2 | 42 / 14 / +5 / 2d8+2 |
| 3 | 61 / 12 / +5 / 2d12+6 | 38 / 14 / +6 / 3d6+3 | 31 / 12 / +6 / 2d8+4 | 27 / 11 / +6 / 2d6+4 | 20 / 12 / +5 / 3d4+2 | 50 / 14 / +6 / 2d8+5 |
| 5 | 81 / 14 / +6 / 3d12+10 | 51 / 16 / +7 / 4d6+7 | 42 / 14 / +7 / 3d8+6 | 36 / 13 / +7 / 3d6+7 | 27 / 14 / +6 / 4d4+5 | 66 / 16 / +7 / 3d8+9 |
| 8 | 98 / 15 / +7 / 5d12+12 | 62 / 17 / +8 / 6d6+11 | 51 / 15 / +8 / 5d8+7 | 44 / 14 / +8 / 5d6+8 | 33 / 15 / +7 / 6d4+7 | 80 / 17 / +8 / 5d8+11 |
| 10 | 112 / 16 / +7 / 6d12+16 | 71 / 18 / +8 / 8d6+11 | 58 / 16 / +8 / 6d8+9 | 50 / 15 / +8 / 6d6+11 | 37 / 16 / +7 / 8d4+7 | 91 / 18 / +8 / 6d8+14 |
| 14 | 138 / 17 / +8 / 8d12+23 | 87 / 19 / +9 / 11d6+14 | 72 / 17 / +9 / 8d8+14 | 61 / 16 / +9 / 9d6+12 | 46 / 17 / +8 / 11d4+10 | 112 / 19 / +9 / 9d8+16 |
| 18 | 166 / 18 / +10 / 10d12+30 | 105 / 20 / +11 / 13d6+22 | 86 / 18 / +11 / 10d8+18 | 74 / 17 / +11 / 11d6+17 | 55 / 18 / +10 / 13d4+15 | 135 / 20 / +11 / 11d8+22 |
| 20 | 184 / 18 / +10 / 12d12+32 | 116 / 20 / +11 / 16d6+22 | 95 / 18 / +11 / 11d8+24 | 82 / 17 / +11 / 13d6+19 | 61 / 18 / +10 / 15d4+18 | 150 / 20 / +11 / 13d8+24 |
| 30 | 400 / 18 / +14 / 20d12+131 | 252 / 20 / +15 / 20d6+115 | 207 / 18 / +15 / 20d8+84 | 178 / 17 / +15 / 20d6+82 | 133 / 18 / +14 / 20d4+81 | 326 / 20 / +15 / 20d8+106 |

A boss has twice its row's HP (`BOSS_HP_FACTOR`).

Role numbers that are not in the rows:
- Archer and caster ranges are the role's `reach`.
- A caster's area damage is its `damage`, rolled against every member on the tile.
- A swarm's unit HP is its `hp`.
- Rally and volley are constants. **(call)** The engine resolves enemy spells with attack rolls, not saving throws, so casters have no spell DC.

Judgement calls on the tables:
- **(call) Members' AC barely grows** (chain or plate, 15–17). At CR 17 and above, enemies hit them 70–75% of the time. Magic armour or a defensive ability would balance that; it is Track C's call.
- **(call) The swarm is weak per unit.** It wins through numbers: four units on a tile against one member get +6 to hit from assisting. The CR budget counts each unit at its full CR, so swarm creatures are given low CRs.
- **(call) Dice counts are large at high CR** (12d12+32), because one blow stands for a whole 5e multiattack. Above CR 20 the dice cap at 20 and the bonus grows.

## 2. Creatures: role and size

Sizes count as stack points: tiny, small and medium 1, large 2, huge 3, gargantuan 4.

**The original 19** (they meet the party on the road):

| Creature | CR | Role | Size | |
|---|---|---|---|---|
| Bandit | 1/8 | skirmisher | medium | |
| Bandit Captain | 2 | leader | medium | |
| Thug | 1/2 | brute | medium | |
| Cultist | 1/8 | swarm | medium | **(call)** zealots in numbers; the Cult Fanatic is the caster |
| Veteran | 3 | brute | medium | **(call)** could be a leader |
| Goblin | 1/4 | skirmisher | small | nimble, hit and run |
| Hobgoblin | 1/2 | brute | medium | **(call)** "tight ranks": all leaders would rally too often |
| Bugbear | 1 | brute | medium | |
| Orc | 1/2 | brute | medium | the charge fits them best |
| Gnoll | 1/2 | skirmisher | medium | **(call)** pack raiders; could be brutes |
| Kobold | 1/8 | swarm | small | |
| Lizardfolk | 1/2 | brute | medium | |
| Ogre | 2 | brute | large | |
| Worg | 1/2 | skirmisher | large | |
| Ghoul | 1 | skirmisher | medium | |
| Wolf | 1/4 | skirmisher | medium | wears its prey down |
| Dire Wolf | 1 | brute | large | |
| Brown Bear | 1 | brute | large | |
| Giant Spider | 1 | skirmisher | large | **(call)** its web could make it an archer |

**Added SRD creatures** (`data/imported/creatures.json`, `roads: false`), for dungeon rooms and Crisis sites. Road slots draw only `roads: true` creatures, so the road encounters are unchanged.

| Creature | CR | Role | Size | Meant for |
|---|---|---|---|---|
| Giant Rat | 1/8 | swarm | small | Cutpurse Hollow, Ashgrave |
| Mastiff | 1/8 | skirmisher | medium | Cutpurse Hollow's hounds |
| Giant Wolf Spider | 1/4 | skirmisher | medium | Weavers' Hollow |
| Swarm of Insects | 1/2 | swarm | medium | spiderlings, scarabs |
| Hyena | 0 | skirmisher | medium | the Gnawbone matriarch's pack |
| Giant Crab | 1/8 | swarm | medium | Wyrmprow, the Gilded Grottoes |
| Crocodile | 1/2 | brute | large | |
| Giant Crocodile | 5 | brute | huge | Jackal King's Tomb, Skullmire |
| Giant Scorpion | 3 | brute | large | Sun-Drowned Temple |
| Giant Ape | 7 | brute | huge | Ape King's Vault |
| Skeleton | 1/4 | swarm | medium | **(call)** the dead rising in numbers |
| Zombie | 1/4 | brute | medium | the drowned, the risen |
| Shadow | 1/2 | skirmisher | medium | Lich's Gauntlet |
| Specter | 1 | skirmisher | medium | Drowned Keep |
| Ghost | 4 | caster | medium | its face is the area attack |
| Wight | 3 | leader | medium | commands the dead |
| Mummy | 3 | brute | medium | spear-bearers |
| Vampire Spawn | 5 | skirmisher | medium | Stormwrack's butler |
| Animated Armor | 1 | brute | medium | Axe Temple's champions |
| Stone Golem | 10 | brute | large | stone guardians |
| Gargoyle | 2 | skirmisher | medium | Green Undercroft |
| Azer | 2 | brute | medium | Drakescale Forge |
| Fire Elemental | 5 | brute | large | burning figures, the furnace |
| Salamander | 5 | brute | large | Drakescale Forge |
| Otyugh | 5 | brute | large | Green Undercroft's grate |
| Black Pudding | 4 | brute | large | |
| Winter Wolf | 3 | skirmisher | large | Rime-Heart |
| Phase Spider | 3 | skirmisher | large | Greenwyrm Falls |
| Hill Giant | 5 | brute | huge | the giant clans |
| Stone Giant | 7 | archer | huge | boulders |
| Fire Giant | 9 | brute | huge | Drakescale Forge |
| Red Dragon Wyrmling | 4 | swarm | medium | **(call)** the forge's hatchlings, many at once |
| Young Red Dragon | 10 | brute | large | the forge's pens |
| Scout | 1/2 | archer | medium | thralls, lookouts |
| Cult Fanatic | 2 | caster | medium | cult cells |
| Knight | 3 | leader | medium | the Hand's bought knights |
| Mage | 6 | caster | medium | |

**Claude's creatures** (`data/claude/creatures.json`, `roads: false`): two drakes for the Drake-Speaker, **Hill Drake** (CR 3, brute, large) and **Ashmaw** (CR 9, brute, huge), and the bosses below.

## 3. Bosses

A boss is a leader or a brute with two moves. Its CR is that of its dungeon or Crisis act. **(call)** I made them new named creatures, so that every climax has a boss at its CR.

How the moves work:
- The **signature** move (`when: desperate`) replaces the second action a bloodied boss gets.
- The **trick** either comes every other round (`everyOther`) or once (`once`).
- A move's `damage` is a multiple of the boss's own blow, so it scales when the tables are tuned.
- The `todo` notes name the missing engine pieces (§5).

| Boss | Where (CR) | Role, size | Signature (when bloodied) | Trick |
|---|---|---|---|---|
| the Cutpurse Captain | Cutpurse Hollow (1) | leader, medium | Knife Flurry: blow ×1.5 | Grit in the Eyes (every other round): ×0.5, Exposed |
| the Weaver Mother | Weavers' Hollow (2) | brute, large | Venom Frenzy: ×1.5, burns ×0.5 for 2 rounds | Web Line: reach 4, pulls 2 |
| the Horned Priest | Axe Temple (3) | leader, medium | Axe-Light: area ×1.5 | Drink the Light: heals 20% |
| the Priest-King | Sun-Drowned Temple (4) | brute, medium | Glare of the Sun Mask: area, stuns | Rotting Fist: burns ×0.5 for 3 rounds |
| the Bone-Crowned Matriarch | Gnawbone Warren (5) | leader, medium | Rampage: charge ×1.5 | Call the Hyenas (once): 3 hyenas |
| the Sludge Mother | Green Undercroft (7) | brute, huge | Engulf: ×1.5, pulls 1, burns | Spatter: two tiles ×0.6 |
| the Rime-Keeper | Rime-Heart (9) | brute, large | Heart-Frost: two tiles, staggers | Glacier Shove: pushes 2 |
| the Jackal King | Jackal King's Tomb (11) | leader, medium | Dust of Ages: two tiles ×1.2, Exposed | Rise, Spear-Bearers (once): 2 mummies |
| the Last Champion | Lich's Gauntlet (14) | brute, medium | Storm-Blade: two tiles ×1.2 | Violet Fire: burns ×0.5 for 2 rounds |
| the Forge Dragon | Drakescale Forge (17) | brute, huge | Fire Breath: two tiles, reach 4, ×1.5, burns | Wing Buffet: area ×0.5, pushes 2 |
| the Founder | Ashgrave Mausoleum (1) | brute, medium | Paralysing Claws: stuns | Grave Hunger: heals 25% |
| the Sinkhole Crawler | Greyvein Mine (2) | brute, large | Feeler Lash: reach 2, ×0.5, stuns | Drag Below: pulls 1 |
| the Drowned Captain | Wyrmprow Cove (3) | leader, medium | Undertow: area, pulls 1 | All Hands (once): 2 zombies |
| the Star-Priest | Starfloor Crypt (5) | leader, medium | Falling Star: area at 2–4 tiles ×1.5 | Sigil Flare: area ×0.5, pushes 1 |
| the Brood-Mother | Gilded Grottoes (6) | brute, huge | Crushing Claws: ×1.5, staggers | The Brood (once): 3 giant crabs |
| the Drowned Castellan | Drowned Keep (8) | brute, medium | River's Wrath: two tiles, pushes 1 | Hold the Line: rally |
| the Lady of Stormwrack | Stormwrack Manor (10) | leader, medium | Idol's Fire: two tiles ×1.2, burns | Burning Chains: ×0.8, pulls 2 |
| the Skullmire Wyrm | Skullmire (13) | brute, huge | Acid Breath: two tiles, reach 4, ×1.5, burns | Tail Sweep: area ×0.7, pushes 1 |
| the Stone Ape | Ape King's Vault (15) | brute, huge | Earth-Shaking Leap: charge ×1.5, staggers | Hurl a Block: reach 2–5 |
| the Greenwyrm | Greenwyrm Falls (18) | brute, gargantuan | Poison Breath: two tiles, reach 5, ×1.5, burns | Beguiling Words: reach 5, stuns, no damage |
| Sister Ilse Marrow | Opened Graves key (6) | leader, medium | Grave Words: area ×1.2, Exposed | Wake the Sleepers (every other round): 2 zombies |
| Father Anselm Crake | Bone Choir key (12) | leader, medium | Toll the Great Bell: two tiles, staggers | Keep Step: rally +1 more |
| the Ashen Prophet | Ashen Crowning key (18) | leader, medium | Ash Storm: two tiles ×1.3, Exposed | Raise the Fallen (every other round): 2 mummies |
| Agathe Wren | Stolen Seal key (6) | leader, medium | The Sword-Cane: ×1.5 at +2 | Paid Help (once): 2 thugs |
| Captain Ulrika Hask | Bought Garrison key (12) | leader, medium | Captain's Cleave: area on the next tile ×1.2 | Volley on My Word: a volley at 3–5 tiles |
| the Pretender's Hand | False Coronation key (18) | leader, medium | Royal Fury: ×2 | Knights, to Me! (once): 2 knights |
| the Drake-Speaker | Stolen Clutch key (6) | brute, large | Speaker's Roar: charge ×1.5, pushes 1 | Answer Me! (once): a hill drake |
| the Drake-Speaker | Burning Beacons key (12) | brute, large | Beacon Brand: area ×1.3, burns | Ashmaw! (once): Ashmaw |
| the Drake-Speaker | The Waking key (18) | brute, large | Wyrm-Voice: two tiles, staggers | Shake the Mountain: two tiles ×0.6, Exposed |

Judgement calls on the bosses:
- **(call) The recurring Drake-Speaker is three creatures** (CR 6, 12, 18), one per act, each with its own moves.
- **(call) Bosses that call help every other round** (Ilse Marrow, the Ashen Prophet) could flood the line. `once` may be better once the call hook exists.
- **(call) Boss names are fixed text.** The finale villains are "the Ashen Prophet", "the Pretender's Hand" and "the Drake-Speaker". Track I can show the rolled personal name instead.
- **Validation** (`bossIssues`, run by `combatIssues`):
  - a creature with moves must be a leader or a brute, with both moves;
  - called creatures must exist;
  - a fight's `boss` must have a signature move.

## 4. The road CR budget (`src/engine/combat/budget.ts`, constants "Combat: the road CR budget")

The budget works like 5e's encounter budgets:
- **The party's budget** is the sum of `FIGHT_XP_PER_MEMBER` over the members' levels, times `FIGHT_DIFFICULTY` (easy ×0.5, medium ×1, hard ×1.5).
  - **(call)** The per-member curve is our own smooth one, from 50 XP at level 1 to 5000 at level 20. It has no jump at level 5, because members here gain no extra attack.
- **A group's cost** is its creatures' XP (`CR_XP`, the SRD values) times a factor for its size (`FIGHT_GROUP_FACTOR`).
  - A party of fewer than 3 reads the next row up, and a party of 6 or more the row below.
- **`roadFightCount(cr, levels, difficulty)`** gives the number of the slot's creature a road Fight fields:
  - the most that fit the budget, up to `ROAD_FIGHT_MAX` (8);
  - at least 1, even when one alone is over budget. Track I can compare `groupXp` with `fightBudget` to warn, or to withhold Fight.

Examples (medium):

| Party (budget) | Bandit 1/8 | Wolf 1/4 | Orc 1/2 | Bugbear 1 | Ogre 2 | Veteran 3 | Hill Giant 5 |
|---|---|---|---|---|---|---|---|
| 2 × L1 (100 XP) | 2 | 1 | 1 | 1 | 1 | 1 | 1 |
| 3 × L2 (300 XP) | 6 | 3 | 2 | 1 | 1 | 1 | 1 |
| 4 × L3 (600 XP) | 8 | 6 | 3 | 2 | 1 | 1 | 1 |
| 4 × L5 (1600 XP) | 8 | 8 | 6 | 4 | 2 | 1 | 1 |
| 4 × L8 (3400 XP) | 8 | 8 | 8 | 6 | 3 | 2 | 1 |
| 5 × L12 (8500 XP) | 8 | 8 | 8 | 8 | 7 | 6 | 2 |

**(call)** Road slots top out at CR 1–2, so a strong party meets 8 of something weak. Track I may want a leader or a second creature in the group (e.g. a bandit captain with the bandits) to spend the rest of the budget.

## 5. Engine hooks the bosses still need

The engine does not play boss moves yet. Bosses today only get the shared boss rules: double HP, the boss stagger thresholds, and two actions when bloodied. Playing the moves needs:
1. **The core hook:** turning a `signature` or `trick` into an intent, by `when`, with `damage` × its blow, `toHit`, and its own `reach`. Every move needs this.
2. **Two-tile areas for enemies.** The area and volley intents cover one tile. Used by 13 moves.
3. **Forced movement of members** (push, pull). Track S builds push and pull for spells, and the boss moves can share it. Used by 11 moves.
4. **Member conditions.** Today only enemies are staggered or stunned, and Exposed lasts the whole fight. Stun, stagger and a one-roll Exposed on members are needed for 11 moves.
5. **Enemies joining mid-fight** (`call`), placed at the boss's end. Used by 9 moves.
6. **Damage over rounds** (`burn`). Used by 8 moves.
7. **An enemy healing itself** (`heal`). Used by 2 moves.
8. **A rally of its own size** (`toHit` on a rally, Father Anselm). This is a small change.
