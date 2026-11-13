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

- The spell lists for each pool (arcane and divine, levels 1–9) and the summon tiers.
- The role stat tables by CR, and the road CR budget.
- The even-level schedule of abilities and uses per class.
- Cleric alignment: chosen at creation, and how it shows.
- How a fight's XP relates to the situation's (none of its own, as decided; check that it feels right in play).
- Weapon and armour prices, weights and where they are sold. Starting gear for founders and recruits.
