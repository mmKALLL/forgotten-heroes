# Combat design (Plan 7): linear combat

**Status:** design agreed with the designer on 2026-11-13, through a section-by-section review. Open questions are listed at the end. This document feeds the Plan 7 implementation plan.

**Why:** classes should feel different beyond their stat and skill spread. The game now rests on two pillars, travel and trade on one side and combat and dungeons on the other, and both are needed to win a run. Runs last 30–60 minutes in a roguelite style. Combat follows the original vision (`docs/design-doc.txt`): it is fought on a linear distance tracker, it is deep in its decisions but quick to play, and fighting itself pays nothing.

## 1. Where fights happen

- **Places:** dungeon rooms and lairs with enemies, and the Crisis lead and key sites.
- **On the road,** a hostile situation keeps its quick graded options, and **Fight** is one of them. Fighting opens a combat. The situation's text says roughly how many enemies there are.
- **Climaxes** (dungeon bosses and Crisis keys) mostly offer a choice between **Fight** and the existing **skill challenge**. The player picks whichever they rate their chances better at.
- **Odds before choosing.** The Fight option shows the enemies' CR as far as the party knows it: exactly, as a range, or "unknown". This follows the same knowledge rule as a dungeon's suggested level (rumours and earlier visits reveal it). There is no simulation.
- **Rewards.** Killing pays nothing. XP and loot come from the situation: the room, the cleared dungeon, the thwarted act. They are paid the same whether the party fought or took another approach.

## 2. The line

- **Size.** A fight is a line of 7 tiles. The room's shape can set it to 5–8.
- **Stacking.** A tile holds up to **4 size points** of one side's units. A large creature counts as 2 and a huge one as 3. Opposing units never share a tile.
- **Start positions.**
  - The party starts at one end in its formation: front and back rank, set in the party panel. The enemies start at the other end.
  - A **surprise** roll, driven by alertness, the party's stealth and its scouting, can give one side a free round, or let only half the party act in round 1.
    - The **scout's kit** (a party upgrade, design §4) adds its level to the party's surprise roll, the same bonus it gives surprise checks in encounters (`scoutBonus` in `src/engine/rules/upgrades.ts`).
  - An **ambush** adds 1–3 enemies, either a little apart from the main group or on the party's far side, so the party is caught in the middle and its casters need protecting.
- **Reach.**
  - Melee weapons hit the next tile (range 1).
  - Polearms reach 1–2 tiles, at −4 against the next tile.
  - Ranged weapons have their own bands (§4) and take −4 while the attacker is engaged.
- **Engagement.** Units on adjacent tiles are engaged. Leaving an engagement gives each engaged enemy a free swing.
- **Assisting replaces flanking.** Compare the size of the attacker's stack with the size of the target's stack. The bigger side gets **+2 to hit for each point of difference** (3 against 2 gives +2). A polearm attacking from 2 tiles away compares its own tile with the target's.
- **Area attacks** hit every unit on one tile, or on two adjacent tiles. Crowding a tile is strong for assisting and dangerous against area attacks.

## 3. Turns

- **Order.**
  - Sides take turns, the party first.
  - On the party's turn, each member acts once, in any order the player picks.
  - On the enemies' turn, enemies act from the **leftmost tile to the rightmost, and top to bottom within a tile**, in the order of their positions when the enemy turn starts.
- **Actions.**
  - Move 1 tile and act, or stand still and take a **full action**, whose effect depends on the weapon family (§4).
  - Spells and abilities take an action unless they say otherwise.
- **Telegraphed intents.**
  - At the start of the party's turn, every enemy shows its planned action ("Ogre: smash tile 3, 60% to hit, 9–18").
  - **Intents target tiles, not units.** A planned swing at tile 3 lands on whoever is there when the enemy acts. A unit can step out of the way, or push or pull an enemy onto that tile to take the blow.
  - **A broken intent** (out of reach, blocked) falls back to repositioning toward the enemy's favoured range. The preview updates live as the party acts.
- **Hits within one party turn** (enemies only):

  | Enemy | Staggered | Stunned |
  |---|---|---|
  | Normal | 3 hits | 4 or more hits |
  | Caster or archer | 1 hit | 2 hits |
  | Boss | 5 hits | 6 hits |

  - **Staggered:** −2 to hit, and the intent is weakened.
  - **Stunned:** loses its action this round, and the intent is cancelled.
  - So two hits interrupt a caster's spell.
  - Each enemy shows pips counting toward its next threshold.
- **Running away.**
  - A member who reaches the party's end of the line may leave the fight, braving any free swings on the way.
  - When everyone has left, the fight ends as a retreat: the situation's retreat outcome applies, and camaraderie drops as for any flight.

## 4. Weapons and armour

**Weapon families** (each has a damage die; a *full action* is what standing still gives):

| Family | Die | Reach | Full action | Trait |
|---|---|---|---|---|
| Daggers | d4 | 1 | 2nd attack at −2 | crit on 19–20 |
| Blades | d8 | 1 | 2nd attack at −6 | — |
| Axes | d10 | 1 | +2 attack | a crit also hits a 2nd enemy on that tile |
| Maces | d8 | 1 | +2 attack | on a hit the target is Staggered |
| Polearms | d10 | 1–2 | +2 attack | −4 at reach 1 |
| Bows | d8 | 3–5 | +2 aimed | −4 while engaged |
| Thrown | d6 | 1–3 | 2nd throw at −6 | — |
| Staffs | d6 | 1–4 | +2 | uses the casting ability; every caster can use one |

- Ranged weapons spend nothing (no arrows or throws to count). Their weaker damage and the penalty while engaged are their cost.
- **Quality tiers:** plain, fine (+1 to hit), +1 and +2 magic. Smiths sell them and hoards hold them.

**Armour:**
- **Cloth** AC 10 + DEX.
- **Leather** AC 12 + DEX.
- **Chain** AC 14 + DEX, at most +2.
- **Plate** AC 16. Disadvantage on Stealth.

Every grade weighs on carrying, and classes have their own armour proficiencies.

## 5. Classes

**General rules:**
- Abilities and spells come back only on a **long rest**: camping or an inn. There are no short-rest recharges, and no rests between a dungeon's rooms, so uses wear down over a delve.
- An ability starts at **1 use** and gains more on certain even level-ups, reaching about 4–6 by level 20.
- **Odd levels** give stats, as today. **Even levels** give new abilities, action bonuses and extra uses. Spell levels follow 5e.
- Most classes have about **4 abilities** at most. Wizards, clerics and paladins have spells on top.
- **Controls:** keys 1–9 select an ability or spell slot, and pressing the same key again deselects it. With nothing selected, an action is a regular attack. Clicking a tile, or pressing Space, picks the target and acts.

**The seven classes:**

| Class | Proficiencies | Abilities and casting |
|---|---|---|
| Fighter | all weapons, Plate | Second Wind (heal), Action Surge (an extra action). On some even levels, +2 to the two-attack style or to the single-blow style |
| Rogue | daggers, blades, bows, thrown; Leather | Cunning Action (move 2, or leave melee without free swings; limited uses, attacking still allowed). Sneak Attack later (on its first turn) |
| Paladin | blades, axes, maces, polearms; Plate | Smite (spend a spell use for heavy radiant damage), Lay on Hands (a pool of healing). Half caster, spell levels 1–5 |
| Ranger | blades, bows, thrown; Chain | Mark (+d6 damage against one foe). Half caster, spell levels 1–5 |
| Cleric | maces, thrown, staffs; Chain | Full caster (divine: healing, wards, radiant, **summons**). Turn Undead |
| Wizard | daggers, staffs; Cloth | Full caster (arcane: area damage, control) |
| Bard | blades, daggers, bows; Leather | No spells. Four kinds of buff and debuff (below) |

**The bard's four:**
- **Inspire** (one ally): +d6 to their next roll.
- **Rallying Song** (party): +2 to hit, or to damage, this round.
- **Cutting Words** (one enemy): −d6 to its telegraphed attack.
- **Discord** (the enemies on one tile): their intents break. They reposition, or attack each other at −4 when they can't.
- Some even levels let the bard **specialise** one of the four, for example Inspire becoming d8, or Discord reaching two tiles.

**Spells:**
- A caster **knows one spell per spell level**. When a spell level opens, they pick 1 of 3 spells drawn from that level's pool.
- **Pools** are separate for arcane and divine. Levels 1–6 have 5–8 spells each, and levels 7–9 have 4–6.
- Every spell in a pool offers **different utility**. About 50% are damage spells at levels 1–3, falling toward about 25% higher up.
- **Casts per long rest:** lower spell levels get more casts as the caster grows. For example, at a high level, level-1 spells are cast 3×, level-2 spells 2×, and the highest level 1×. This is a slimmed-down 5e slot table.
- **Summons** (divine): each spell level's pool holds one summon. A summon is a temporary party member for that fight only.
  - A good or neutral cleric calls beasts or celestial helpers, and an evil one calls undead.
  - Each tier is stronger at higher spell levels.
  - This needs an alignment for clerics only: picked at creation, rolled for recruits.
- **Forced movement:** a few abilities and spells push or pull, for example a shield bash, a pulling spell or a polearm hook. They make the tile-targeted intents something to play against.

**Later classes:** the Monk (ki: stunning, harrying) and the Barbarian (big single blows). DDO-style spell points may come later too.

## 6. Enemies

**Stats** come from **role templates × CR** (tables in `constants.ts`, like 5e's monster statistics by CR): HP, AC, to-hit and damage. Each creature takes a role and keeps its own name and flavour.

| Role | Favoured range | Trick |
|---|---|---|
| Brute | 1 | Charge: move 2 tiles and attack. High HP, single +2 blows |
| Skirmisher | 1 | Hit and run: attack, then step back 1 tile without free swings |
| Archer | 3–5 | Volley on a tile: every unit there is attacked at −2 |
| Caster | 2–3 | One area or control spell on a tile. High risk, high reward: closer than archers, and interrupted by 2 hits |
| Swarm | 1 | Many small units with low HP, each size 1, so they win stack comparisons by numbers |
| Leader | 1–3 | Rally: allies get +2 to hit this round |

- **Bosses** are a leader or brute with hand-written extras: a signature move and a second trick.
- **Bloodied:** at half HP or less, a normal enemy has −2 to hit. A bloodied boss grows **desperate**: an extra action each round, or its signature move.
- **Morale.**
  - It can break only when the group is nearly wiped out:

    | Original group | Remaining |
    |---|---|
    | 3–4 | 1 |
    | 5–8 | 2 |
    | 9 or more | 3 |

  - Each remaining enemy rolls WIS against **DC 10 + the party's best Intimidation modifier**. The group then follows the majority, and a tie means it flees.
  - Fleeing enemies leave by their end of the line. A rout wins the fight.
- **Composition.**
  - Dungeon rooms and climaxes list their enemies (creature × count).
  - A road Fight builds a group from the situation's creature slot, with a CR budget (like 5e's encounter XP budget) for the party's level and size.

## 7. Defeat, injuries and death

- **Downed.**
  - At 0 HP a member is **removed from the fight** at once.
  - It costs **camaraderie, permanently**. It doesn't fade, so the party must win it back in other ways. (Camaraderie is the party's single mood stat: a deliberate simplification.)
- **Lasting injuries.**
  - A downed member has a chance of **25% + the damage below 0** (in %) of a **lasting injury**: −2 to an ability, like a recruit's old wound.
  - A member who would take a **third or later** injury instead has a **50% chance of dying**, and their equipment is lost with them.
- **A party wipe:** the enemies win. The party is robbed or left for dead with injuries. Death only on bad luck or at a boss.

## 7b. Dark dungeons and fuel (designer call 2026-11-14; part of Plan 7)

- **Rooms can be dark** (`dark: true` on a dungeon room, true to the map: caves, crypts, sewers, deep halls).
  - Fuel should matter in about **60% of all dungeons**, which have at least one dark room.
  - About **20%** should be mostly dark.
- **Lighting:** a dark room is lit with fuel (torches, lamp oil). The delve preview says how many units the dark rooms ahead will burn, so a party provisions before setting out.
- **Unlit rooms are still explorable**, but the party is **Exposed in every check** there, fights included.
- **Darkvision:** the penalty doesn't apply when every member but one is of a darkvision ancestry (orc, dwarf, elf), or when the only member has darkvision.
- **To decide:** fuel per dark room (1 unit each is the natural start), and whether a lit fight lights the whole line or only the tiles near the party.

## 8. UI

- **The line** is drawn left to right, with the units on each tile stacked top to bottom.
- **Enemies** show their intents (an arrow onto a tile, plus the odds) and their pips toward stagger and stun. The intents panel lists them in action order.
- **Party actions:**
  - A party member's action shows its hit %, damage range and trait effect before it is committed.
  - The 1–9 keys select abilities and spells. Space or a click on a tile acts.
- **Screen sizes:** it must fit 1440 × 1050 and 412 × 915 (Galaxy S26) with no sideways scroll.

## 9. Architecture

- **The engine** lives in `src/engine/combat/`, pure as everywhere:
  - `GameState.combat` holds the open fight: the line, the units, the tallies and the round.
  - Actions go through `step` (`combatAct`, `combatEndTurn`, `combatFlee`).
  - Enemy intents and the AI are deterministic from the seeded RNG.
  - Every preview equals what happens.
- **Data** (JSON, no functions):
  - `data/claude/` gets weapons, armours, enemy roles, the class abilities, spells (arcane and divine pools by level) and summons.
  - Creatures gain a role and a size.
  - Situations and dungeon rooms gain an optional `fight` (creatures × counts, and an ambush).
- **Tests:**
  - Preview == actual for attacks, spells and intents.
  - Determinism and a save migration.
  - A simulation of class matchups and fights by CR, so that a party at the intended level wins the intended share.

## 10. Open questions

- **Medicine and lasting injuries** (designer idea, 2026-11-14, to think over): the party's best Medicine could lower the chance of a lasting injury, and other skills could get similar uses. Track E leaves a named hook for it.

- The spell lists for each pool (arcane and divine, levels 1–9) and the summon tiers.
- The role stat tables by CR, and the road CR budget.
- The even-level schedule of abilities and uses per class.
- Cleric alignment: chosen at creation, and how it shows.
- How a fight's XP relates to the situation's (none of its own, as decided; check that it feels right in play).
- Weapon and armour prices, weights and where they are sold. Starting gear for founders and recruits.

## 11. As built: Tracks T and E (Plan 7, wave 1)

**Data shapes (Track T).**
- Six new content kinds, each in `data/claude/` as a marked placeholder for the content tracks: `weapons` (one plain weapon per family), `armours` (one per grade), `enemyRoles` (the six roles, each with `favoured` and `reach` bands and a stat table of `{ cr, hp, ac, toHit, damage, wis }` rows; a creature takes the last row at or below its CR), `classAbilities`, `spells` and `summons`. Abilities and spells share a small typed effect list (damage, heal, toHit, damageBonus, move, push, pull, stagger, stun, extraAction, summon); the engine doesn't play them yet (Tracks C and S).
- `Creature.role` (default `brute`) and `Creature.size` (default `medium`), so every existing creature validates. `Situation.fight` (`enemies` as creature × count with an optional `boss`, `ambush`, `line` 5–8, and the `win`, `flee` and `lose` branches applied to the encounter at the end). `DungeonRoom.dark` (optional; Track D).
- `Character.gear` (`weapon`, `armour` ids), `uses` (by ability id or `spell-<level>`), `spells` (level → spell id), `alignment` (clerics: good, neutral or evil, rolled 45/35/20 from the character's id on its own stream, so it never moves the game's RNG) and `rank` (front or back; unset follows the weapon: bows and staffs stand at the back).
- Founders get `STARTING_GEAR` by class (fighters and paladins in chain). `combatIssues` checks every reference (roles, starting gear, fight creatures, ability classes, summons).
- **Save v22** (written as v21 → v22 on this branch; the merger renumbers after the reputation save): `combat: null`, class gear for every member, no uses or spells, a cleric's alignment. Only what is missing is filled in.

**The engine (Track E, `src/engine/combat/`).**
- **State.** `GameState.combat` holds the line's length, the round, the units (members and enemies, each with tile, HP, AC, to-hit, dice, reach, crit face, status, moved/acted, hits this turn, a trait stagger and the intent), the footing (Edge or Exposed for the whole fight), the surprise result, the group's size for morale, the morale state, the fight's snapshot (for its branches), the result and the fight's own log (each attack recorded with the odds it was rolled at).
- **Actions** through `step`: `startCombat` (the open encounter's `fight`, at the encounter's footing), `combatMove { unit, to }`, `combatAct { unit, tile, target?, full? }`, `combatRetreat { unit }`, `combatEndTurn`, `closeCombat`. While a fight is undecided every other action is refused; once decided, any other action clears it. `startCombat(state, content, fight, { footing })` is the entry point for Track I.
- **Placement.** The party fills from tile 0 (back rank first), the enemies from the far end (archers and casters behind), each tile up to `STACK_CAP` size points. An ambush adds `AMBUSH_EXTRA` copies of the group's lowest-CR creature, at random either two tiles in front of the group ("apart") or on tile 0 with the party shifted up one ("behind").
- **Surprise.** Coming upon them: the best Stealth (disadvantage if anyone wears plate); walking into an ambush: the best Perception. Both add the scout's kit (`scoutBonus`) and roll against `SURPRISE_DC_BASE` + the enemies' best WIS. `SURPRISE_RESULT` reads the tier: the enemies lose their first turn, act before the party's first turn, only the quicker half of the party (by DEX) acts in round 1, or nothing. `surprisePreview` gives the odds of each.
- **Turns.** Members act in any order: one step and one action, or the full action standing still (daggers a second attack at −2, blades and thrown at −6, the rest one attack at +2). Ending the turn runs the enemies in action order (left to right, top to bottom, as they stand when the turn starts), then a new round: hit counts and staggers clear, members are ready, intents are planned.
- **Attacks.** d20 + to-hit against AC; to-hit is the stat, assisting (`ASSIST_PER_POINT` × the stack-size difference, either way), a polearm at the next tile (−4), a bow or thrown weapon while engaged (−4), and for enemies stagger, bloodied (not bosses), volley and rally. A natural 20 (a dagger's 19) crits: doubled dice. Axes cleave on a crit; maces stagger on a hit. Edge and Exposed roll 2d20.
- **Intents.** Planned at the start of the party's turn, aimed at a tile: melee enemies strike from where they stand or step in; brutes charge two tiles; skirmishers hit and step back without free swings; archers and casters seek a spot within their favoured range (archers volley a crowded tile, casters hit everyone on it); leaders rally every other round with two or more allies; a bloodied boss acts twice. A blow that finds no one (out of reach or an empty tile) repositions toward the favoured range instead, if the enemy hasn't moved.
- **Stagger and stun** by hits in one party turn (`STAGGER_HITS`): staggered is −2 to hit and half damage (the "weakened intent"); stunned loses the action.
- **Free swings.** Leaving an adjacent enemy's reach (moving away, or off the line) gives each engaged, unstunned melee enemy a swing; enemies moving away from members draw theirs.
- **Morale.** Tested once, when the group first stands at its threshold; each saves WIS against `MORALE_DC_BASE` + the best Intimidation among members still fighting; a tie flees. A rout wins the fight.
- **Defeat.** A member at 0 HP is down: out of the fight, `CAMARADERIE_DOWNED` lost, and the injury roll (`INJURY_BASE` + `INJURY_PER_OVERKILL` per point past 0, plus `medicineModifier`, a named hook that is 0 for now). A member who already has `INJURY_DEATH_AFTER` injuries (old wounds count) dies instead on `DEATH_CHANCE`, gear and accessory lost, and otherwise escapes this one. Going down in a fight doesn't add `DOWNED_EXHAUSTION` (the injury roll replaces it there). Deaths cost `CAMARADERIE_DEATH` as everywhere.
- **Endings.** Victory or rout applies `win`; retreat (every member still fighting left by tile 0) costs the usual retreat camaraderie and applies `flee`; a wipe applies `lose`: with any humanoid foe the party is robbed (all gold, `WIPE_GOODS_TAKEN` of each good), otherwise left for dead; either way the living come to with 1 HP. Downed members stay at 0 HP after a won fight.
- **Preview.** `combatPreview(state)` lists each ready member's moves (with the free swings each draws), attacks per target (single and full action, each an `AttackSpec`: parts, modifier, hit and crit chance, damage and crit range, what one more hit does to the target) and retreat, every intent in action order (stunned, staggered, broken, and the attacks it lands with, rally included), and the morale threshold, DC and flee chance. The actions resolve with the same functions; the tests compare each logged roll's odds with the preview.

**Decided while building (please review).**
- Lasting injuries are stored as old wounds, and old wounds count toward the third injury (so a level-0 recruit, with two, risks death the first time they go down).
- "25% + the damage past 0" reads as one percentage point per point of overkill.
- A staggered enemy's weakened intent does half damage.
- The surprise table: sneaking up, a success or better gives the party the free round and a critical failure leaves half the party flat-footed; walking into an ambush, a failure gives the enemies the free round, a partial half the party, a critical success the party's.
- Retreating takes the member's move; a member can attack first and then leave.
- A wipe by robbers takes all the gold and half of each good.
