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
- **Hits within one party turn** (enemies only) climb a three-step ladder (designer call 2026-11-14):

  | Enemy | Stifled | Staggered | Stunned |
  |---|---|---|---|
  | Normal | 2 hits | 3 hits | 4 or more hits |
  | Caster or archer | 1 hit | 2 hits | 3 hits |
  | Boss | 4 hits | 5 hits | 6 hits |

  - **Stifled:** −2 to hit.
  - **Staggered:** −2 to hit, and its intent does half damage.
  - **Stunned:** loses its action this round (no damage), and the intent is cancelled.
  - A mace's hit counts as 2 hits on the ladder.
  - Each enemy shows pips counting toward its thresholds, with a mark at each step; an attack's preview names the step one more hit would reach ("A hit now staggers it: −2 to hit, half damage").
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
| Maces | d8 | 1 | +2 attack | a hit counts as 2 hits toward stifle, stagger and stun |
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
- **Designer call (2026-11-14): healing songs.** In lieu of spells, the bard has a fifth and a sixth song: **individual healing** (one ally) and **party healing** (everyone, smaller). Each of the six songs has its **own long-rest use limit**, and a specialisation pick raises both that song's uses and its effect (a bigger die or heal). The specialisation picks include the healing songs.

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
- **Designer review of the spells (2026-11-14; details in `docs/notes/spells-review.md`, "Revisions 2026-11-14"):**
  - **Short ranges**, so positioning matters: arcane at most 4 (rays, arrows and missiles 5, heavy areas 3); divine mostly 1–3, with 4 as long range.
  - **No scaling with the caster's level:** a spell's damage is fixed by its spell level.
  - **Hazards** hurt only at the start of a unit's turn on the tile. Enemies sometimes step off one, braving free swings (the hazard's `flee`).
  - **Push and pull** without damage at levels 2 (friend or foe) and 4–5 (a tile); arcane 6–9 adds damaging ones, with strong pulls to reach the enemy's mages.
  - Party-wide buffs start at level 3; Bless is one ally. Levels 1–6 may hold 9 spells (the level-2 additions).

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
  - It also costs **+2 exhaustion** (`DOWNED_EXHAUSTION`, as outside fights; designer call 2026-11-14): a short-term penalty beside the long-term ones. At 6 the member dies, gear lost. Every intent or free swing that could drop a member says what it would cost.
- **Lasting injuries.**
  - A downed member has a chance of **25% + the damage below 0** (in %) of a **lasting injury**: −2 to an ability, like a recruit's old wound.
  - A member who would take a **third or later** injury instead has a **50% chance of dying**, and their equipment is lost with them.
- **A party wipe:** the enemies win, and the player chooses how the party gets out of it (designer call 2026-11-14), each way's exact cost shown first. Each costs `CAMARADERIE_WIPE` (20) camaraderie, and the living come to with 1 HP; then the encounter's `lose` branch applies.
  - **Surrender:** half of each good but essentials (rounded down) and all the gold, except 20% of the gold a level of the smuggler's compartment (at most all of it).
  - **Struggle:** three lasting injuries (−2 to a random ability, as old wounds), two for a party of two or fewer, each on a different random living member while any is left. They never kill: the third-injury death rule is for going down only, so struggling is the way out that keeps everyone. The injuries are drawn from the game's RNG as it stands, so the option names them exactly.
  - **Sacrifice:** one living member, picked by the player (the option lists each by name), stays behind and dies, their gear lost with them; the death costs `CAMARADERIE_DEATH` as any. Not offered to a lone survivor, so it never ends the run.

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
- **Enemies** show their intents (an arrow onto a tile, plus the odds) and their pips up the hit ladder (stifled, staggered, stunned), with a mark at each step. The intents panel lists them in action order.
- **Party actions:**
  - A party member's action shows its hit %, damage range and trait effect before it is committed.
  - The 1–9 keys select abilities and spells. Space or a click on a tile acts.
- **Screen sizes:** it must fit 1440 × 1050 and 412 × 915 (Galaxy S26) with no sideways scroll.

### As built: Track U (the combat UI)

- `src/ui/combat/CombatView.tsx` draws `combatView(state)` (`src/engine/combat/view.ts`: the tiles with their units top to bottom, each unit's status and hit pips, the intents in action order, each ready member's legal targets from `combatPreview`) and dispatches `combatMove`, `combatAct` (with the previewed `target` and `full`), `combatRetreat`, `combatEndTurn` and `closeCombat`. It takes the centre column while a fight is open; auto-travel waits. The layout, controls and phone fit are in the rebuild design §9 ("The fight").
- **Each fact once:** an intent's odds are on its arrow only (the intents panel says what it does and whom it would hit); an attack's hit %, damage and crit are in the Action panel only (the tiles just outline what can be targeted).
- **Controls:** a click on a target or its tile, or Space, acts; ←/→ cycle the targets (focus follows), ↑/↓ the ready members, F the full action, 1–9 the slots (pressing again deselects; an empty slot selected blocks acting). Track C fills them with the acting member's abilities (`abilitySlots`): a slot shows its uses left; selected, the Action panel shows the ability, its uses until a long rest and a button per legal use with what it does (the heal, the attack's odds and damage, each unit's chance), and Space uses it when it has only one; spells join with Track S. Space on a focused button presses that button, and after End turn focus returns to the heading, so a second Space doesn't end the next turn.
- **Phones:** the whole line fits the width rather than scrolling, so the enemies and intents stay on screen with the party (chosen over a sideways-scrolling line, which hid the enemies at first sight).
- **Playtesting:** the Encounter Deck's Fight (test) and Ambush (test) open a bandit fight without an encounter: `startCombat` takes an optional `fight` (the open encounter's otherwise; with no encounter its branches apply to nothing).
- **Decided while building (please review):** the action's preview names the step one more hit reaches ("A hit now stifles it: −2 to hit", "staggers it: −2 to hit, half damage", "stuns it: it loses its action"; the engine's `onHit`, a mace's hit counting 2); the intents panel names a broken intent as "breaks (out of reach, or no one there) and will reposition".

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
- The role stat tables by CR, and the road CR budget: drafted by Track N (§12), for review in `docs/notes/enemies-review.md`.
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
- **Save v23** (v22 → v23; written as v21 → v22 on `plan7-core` and renumbered on merging after the reputation save): `combat: null`, class gear for every member, no uses or spells, a cleric's alignment. Only what is missing is filled in.

**The engine (Track E, `src/engine/combat/`).**
- **State.** `GameState.combat` holds the line's length, the round, the units (members and enemies, each with tile, HP, AC, to-hit, dice, reach, crit face, status, moved/acted, hits this turn, a forced stagger (for abilities) and the intent), the footing (Edge or Exposed for the whole fight), the surprise result, the group's size for morale, the morale state, the fight's snapshot (for its branches), the result and the fight's own log (each attack recorded with the odds it was rolled at).
- **Actions** through `step`: `startCombat` (the open encounter's `fight`, at the encounter's footing), `combatMove { unit, to }`, `combatAct { unit, tile, target?, full? }`, `combatRetreat { unit }`, `combatEndTurn`, `closeCombat`. While a fight is undecided every other action is refused; once decided, any other action clears it. `startCombat(state, content, fight, { footing })` is the entry point for Track I.
- **Placement.** The party fills from tile 0 (back rank first), the enemies from the far end (archers and casters behind), each tile up to `STACK_CAP` size points. An ambush adds `AMBUSH_EXTRA` copies of the group's lowest-CR creature, at random either two tiles in front of the group ("apart") or on tile 0 with the party shifted up one ("behind").
- **Surprise.** Coming upon them: the best Stealth (disadvantage if anyone wears plate); walking into an ambush: the best Perception. Both add the scout's kit (`scoutBonus`) and roll against `SURPRISE_DC_BASE` + the enemies' best WIS. `SURPRISE_RESULT` reads the tier: the enemies lose their first turn, act before the party's first turn, only the quicker half of the party (by DEX) acts in round 1, or nothing. `surprisePreview` gives the odds of each.
- **Turns.** Members act in any order: one step and one action, or the full action standing still (daggers a second attack at −2, blades and thrown at −6, the rest one attack at +2). Ending the turn runs the enemies in action order (left to right, top to bottom, as they stand when the turn starts), then a new round: hit counts and staggers clear, members are ready, intents are planned.
- **Attacks.** d20 + to-hit against AC; to-hit is the stat, assisting (`ASSIST_PER_POINT` × the stack-size difference, either way), a polearm at the next tile (−4), a bow or thrown weapon while engaged (−4), and for enemies stifled or staggered, bloodied (not bosses), volley and rally. A natural 20 (a dagger's 19) crits: doubled dice. Axes cleave on a crit; a mace's hit counts 2 on the hit ladder. Edge and Exposed roll 2d20.
- **Intents.** Planned at the start of the party's turn, aimed at a tile: melee enemies strike from where they stand or step in; brutes charge two tiles; skirmishers hit and step back without free swings; archers and casters seek a spot within their favoured range (archers volley a crowded tile, casters hit everyone on it); leaders rally every other round with two or more allies; a bloodied boss acts twice. A blow that finds no one (out of reach or an empty tile) repositions toward the favoured range instead, if the enemy hasn't moved.
- **Stifle, stagger and stun** by hits in one party turn (`STAGGER_HITS`; a mace's hit counts `MACE_HIT_WEIGHT`): stifled is −2 to hit, staggered also half damage, stunned loses the action (§3). `CombatUnit.staggered` still forces at least staggered (for an ability's `stagger` effect); nothing sets it yet.
- **Free swings.** Leaving an adjacent enemy's reach (moving away, or off the line) gives each engaged, unstunned melee enemy a swing; enemies moving away from members draw theirs.
- **Morale.** Tested once, when the group first stands at its threshold; each saves WIS against `MORALE_DC_BASE` + the best Intimidation among members still fighting; a tie flees. A rout wins the fight.
- **Defeat.** A member at 0 HP is down: out of the fight, `CAMARADERIE_DOWNED` lost, `DOWNED_EXHAUSTION` gained (at 6 they die, gear and accessory lost, with no injury roll), and otherwise the injury roll (`INJURY_BASE` + `INJURY_PER_OVERKILL` per point past 0, plus `medicineModifier`, a named hook that is 0 for now). A member who already has `INJURY_DEATH_AFTER` injuries (old wounds count) dies instead on `DEATH_CHANCE`, gear and accessory lost, and otherwise escapes this one. Deaths cost `CAMARADERIE_DEATH` as everywhere. The view's `risks` (`downedRisk`) give what going down would cost each standing member; an intent's attack carries it as `drops` when its best roll could drop the target (`couldDrop`), and the UI says so on intents and on free swings.
- **Endings.** Victory or rout applies `win`; retreat (every member still fighting left by tile 0) costs the usual retreat camaraderie and applies `flee`. A wipe waits for the player's choice (§7): while it waits every other action, `closeCombat` included, is refused; `combatWipeChoice { choice, member? }` applies the cost (`wipeOptions` in `combat/defeat.ts`, which the view shows as `wipe`), `CAMARADERIE_WIPE`, 1 HP for the living and `lose`, and closes the fight. Downed members stay at 0 HP after a won fight. (The automatic robbed / left-for-dead wipe is gone.)
- **Preview.** `combatPreview(state)` lists each ready member's moves (with the free swings each draws), attacks per target (single and full action, each an `AttackSpec`: parts, modifier, hit and crit chance, damage and crit range, what one more hit does to the target) and retreat, every intent in action order (its step on the hit ladder, broken, and the attacks it lands with, rally included), and the morale threshold, DC and flee chance. The actions resolve with the same functions; the tests compare each logged roll's odds with the preview.

**Decided while building (please review).**
- Lasting injuries are stored as old wounds, and old wounds count toward the third injury (so a level-0 recruit, with two, risks death the first time they go down).
- "25% + the damage past 0" reads as one percentage point per point of overkill.
- ~~A staggered enemy's weakened intent does half damage.~~ Superseded by the three-step ladder (§3; designer call 2026-11-14).
- The surprise table: sneaking up, a success or better gives the party the free round and a critical failure leaves half the party flat-footed; walking into an ambush, a failure gives the enemies the free round, a partial half the party, a critical success the party's.
- Retreating takes the member's move; a member can attack first and then leave.
- ~~A wipe by robbers takes all the gold and half of each good.~~ Superseded by the wipe's choice (§7; designer call 2026-11-14).
- **The wipe's choice (Plan 7, defeat track; please review).** The player picks who is sacrificed (any living member, each a button), rather than the game. Struggle's injuries never kill (no third-injury death roll), and each goes to a different member while any is left. Surrender keeps essentials whole and doesn't also hide precious goods (the compartment shields only the gold here). No save change: a wipe waits as `combat.result: 'wipe'`, and the choice clears the fight.

## 12. As built: Track N, enemies (Plan 7, wave 2)

The details and the judgement calls to review are in `docs/notes/enemies-review.md`.

- **Role tables** (`data/claude/enemy-roles.json`) run from CR 0 to 30.
  - The standard row follows 5e's monster statistics for AC and to-hit.
  - HP is a published monster's HP at the CR, scaled down for one attack a turn: 100% up to CR 1/2, 40% from CR 20.
  - Damage is one blow a turn, 70% of 5e's damage per round.
  - Each role then scales HP, AC, to-hit, damage and WIS (brute ×1.35 HP and ×1.2 damage on d12s, down to swarm units at ×0.45 HP).
  - Provisional until Track B's simulation.
- **Creatures.** Every creature has a role and a size.
  - 37 SRD creatures were added for dungeon rooms and Crisis sites.
  - `Creature.roads` (default true) keeps the new ones out of road creature slots, so road encounters are unchanged.
- **Bosses.** 29 named bosses in `data/claude/creatures.json`: one per authored dungeon at its CR, one per Crisis key at its keyCr (the recurring Drake-Speaker three times), plus two drakes.
  - Each boss is a leader or a brute with a `signature` move (played when bloodied, in place of the second action) and a `trick` (every other round, or once).
  - Moves are data (`BossMoveSchema`: an intent kind, `damage` as a multiple of the boss's blow, reach, one or two tiles, and riders: push, pull, stagger, stun, exposed, heal, call, burn).
  - The engine does not play them yet. Each move's `todo` names what it lacks, and `bossIssues` checks them.
- **The road CR budget** (`combat/budget.ts`) works like 5e's encounter XP budget.
  - `fightBudget(levels, difficulty)` is a per-member XP by level, times easy, medium or hard.
  - `groupXp(crs, partySize)` is the SRD XP by CR, times a group-size factor shifted for small or large parties.
  - `roadFightCount(cr, levels, difficulty)` is how many of the slot's creature fit, from 1 to `ROAD_FIGHT_MAX`.
  - Track I wires it in.

## 13. As built: Track C, classes and gear (Plan 7, wave 2)

**Proficiencies** (`CLASS_PROFICIENCIES`, combat/gear.ts). Each class has the weapon families of §5 and a heaviest armour (fighters and paladins plate, rangers and clerics chain, rogues and bards leather, wizards cloth); every class with a casting ability (wizard, cleric, paladin, ranger, bard) can use a staff.
- **An untrained weapon adds no proficiency bonus to hit** (5e's rule, chosen over a flat −4: it scales with level, so a wizard with a sword falls further behind as the fighter grows).
- **Untrained armour puts the wearer's attacks at disadvantage** (5e's rule for attacks; it combines with the party's footing, so Edge cancels it). Spells in untrained armour wait for spell casting. The member's sheet warns of both.

**Weapons and armour** (`data/claude/weapons.json`, `armours.json`). One weapon per family in the four qualities (32): dagger, longsword, battleaxe, mace, spear, shortbow, javelins, quarterstaff; plain at 5e-like prices (1–25 gp), fine about four times that, +1 at 250–450 gp and +2 at 1000–1800 gp; 0.5–2.5 kg. Armour: travelling clothes (1 gp, 1 kg), leather (10 gp, 4 kg), chain mail (60 gp, 8 kg), plate (600 gp, 12 kg). Weights are on the carrying scale (20 kg a member at STR 10), lighter than 5e's.

**Arms shops** (`town/arms.ts`; `arms` on a service role). The weapons shop sells weapons, the armourer armour, the blacksmith both but only plain. A shop stocks every plain piece and armour, fine weapons from quality 3, +1 from 4 and +2 at 5 (`ARMS_QUALITY_AT`), without limit. Bought pieces go to the party's **stash** (`GameState.stash`); a shop buys back what it deals in at `ARMS_RESALE` (half). A purchase that would overload the party is refused. Members wear and take off pieces from their sheet (`equipArms`, `unequipArms`), outside encounters and fights. What living members wear and the stash weigh on the party's load. Recruits come with their class's plain kit (`STARTING_GEAR`), part of their fee; a dismissed member leaves with what they wear.

**Ability uses** (combat/uses.ts). A member keeps the uses **spent** since the last long rest (`Character.spent`), so what is left follows from the level: an ability has 1 use from the level it is gained and 1 more at levels 6, 10, 14 and 18 (`ABILITY_USE_LEVELS`). A **long rest** (any day's rest, in camp or in town, `rest`) clears `spent`. Spell uses follow the plan's casts table (`spellCasts`: the newest spell level 1, each lower one 1 more up to 3, level 1 at least 2; full casters open spell level n at class level 2n − 1, half casters at 2, 5, 9, 13, 17); only Smite spends them so far. The designer's progression (`docs/notes/spells-review.md`) supersedes this provisional table; spell casting replaces it (TODO).

**Abilities** (`data/claude/class-abilities.json`, combat/abilities.ts). Played through the `combatAbility { unit, ability, tile?, target? }` action. `abilitySlots(state, content, unit)` is the 1–9 view model for the combat UI: each slot's key, the ability as held (specialised), uses left and max, action or free, whether it can be used now and why not, and every legal use with what it would do (`affects` with each unit's chance, `heal` range, Smite's `attack` spec). `useAbility` resolves from those same numbers: preview == actual.
- **Fighter:** Second Wind (1, free: heal 1d10 + level), Action Surge (2, free, after acting: act again). Style picks at 4, 8, 12, 16: two-attack or single-blow, each pick +2 damage (`STYLE_DAMAGE`) on every attack of that kind of full action (two-attack: daggers, blades, thrown; single-blow: the rest). Picks stack.
- **Rogue:** Cunning Action (1, free): the member's move becomes up to two tiles without free swings, past no enemy; they can still attack.
- **Paladin:** Lay on Hands (1): a pool of 5 HP a level (the pool is its uses), healing exactly what an ally on the paladin's tile or the next lacks, up to what is left. Smite (2): a weapon attack (the member's single attack, at the odds shown) with 2d8 more, +1d8 per spell level above 1, spending the paladin's lowest spell use **only on a hit**.
- **Ranger:** Mark (1, free, any foe on the line): the ranger's hits on it deal 1d6 more for the rest of the fight.
- **Cleric:** Turn Undead (2): each undead on two tiles 1–3 away saves WIS (`dc`: 8 + proficiency + WIS) or is feared for 3 rounds: it steps away from the party each turn and never attacks. The preview shows each one's chance.
- **Bard** (six songs, each with its own uses): Inspire (1, an ally up to 3 away: +1d6 to their attack rolls this round), Mending Song (1, an ally up to 3 away: heal 1d8 + level), Cutting Words (2, a foe up to 6 away: −1d6 on its attacks this round), Rallying Song (4, the party: +2 to hit this round), Song of Renewal (6, the party: one roll heals every member 1d6 + half the level), Discord (6, the enemies on a tile 1–4 away: each falls back a step; one that can't strikes another enemy on its tile at −4, `DISCORD_PENALTY`). Specialisation picks at 4, 8, 12, 16 and 20: one song not yet specialised, which gains `SPECIALISE_USES` (1) more use and its `specialised` effect (Inspire and Cutting Words d8, Rallying Song +2 damage too, Mending Song 2d8 + level, Song of Renewal 2d6 + half the level, Discord two tiles).
- **Lasting effects** are stored on units (`CombatUnit.effects`: source, user, effect, last round) and cleared by the new round past them; "this round" lasts the party's turn and the enemies' turn after it, 10 rounds or more the whole fight. Attack specs read them: to-hit and damage bonuses as parts, roll dice (Inspire, Cutting Words) folded into the hit chance exactly, a mark's dice as `extraDice`. Fear and discord replan the enemy's intent at once and at every new round while they hold.
- Abilities that take an action can't follow the member's action (and Smite needs it); free ones can. A heal needs someone hurt.

**Level-up picks** (rules/progression.ts, save v24). A level that grants a pick (`CLASS_PICKS`) adds a choice to the member's waiting level-up (`choices`: kind, level, chosen). The dialog shows each in the member's card; `chooseLevelUp` makes or changes it (it joins `Character.picks` at once); `acknowledgeLevelUps` is refused while any is unchosen. Simulated players take the first option (`stepPastLevelUps`). TODO with spell casting: a spell's 1-of-3 pick is another choice kind.

**Save v24** (v23 → v24): `uses` (uses left, never written in play) gives way to `spent` (everyone rested), `picks` start empty, waiting level-ups get no choices, and the stash is empty.

**Decided while building (please review).**
- Proficiency penalties: 5e's (no proficiency bonus; disadvantage in untrained armour), not flat penalties.
- Staffs suit every class with a casting ability, bards included.
- Fighter styles are +2 **damage** a pick (to hit would run away with four stacked picks).
- Smite spends its spell use only on a hit (5e's smite is declared after hitting).
- Inspire and Cutting Words last the round (all the ally's or foe's attacks then), not "the next roll", so the odds shown are exact.
- Discord and Turn Undead's DC is 8 + proficiency + the casting ability; enemies save WIS with their morale modifier, other saves at +0.
- The bard's picks start at level 4 (five picks for six songs); each song is specialised at most once.
- Shops stock without limit, at fixed prices (no spread); armour comes in one quality.

