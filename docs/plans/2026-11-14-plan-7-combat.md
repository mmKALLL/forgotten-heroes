# Plan 7: Linear combat

> Light format (process-speedups): tasks, interfaces, acceptance tests and constraints. Implementers write the code test-first. The design is `docs/plans/2026-11-13-combat-design.md` (agreed with the designer). This plan covers how to build it.

**Goal:** fights become a deep but quick decision on a line of tiles. The classes differ through weapons, armour, abilities and spells. Fighting is one approach among others: Parley, sneaking past, or the skill challenge at a climax. It pays nothing in itself.

## Designer calls added on 2026-11-14 (beyond the design doc)

- **Parley** is a systematic use of charisma. A hostile encounter that offers Fight also offers Parley: the party's best of Persuasion, Deception or Intimidation, against a DC from the enemies' CR. The outcomes, by tier, are:
  - they let you pass;
  - a toll or a deal;
  - they refuse, and the choice stays open;
  - a bad failure starts the fight with the party Exposed, or the enemies get a free round.
- **Intimidation** sets the enemy morale DC (design §6), as agreed.
- **Standing a round** gives camaraderie by the party's best **Performance** modifier instead of a flat +8. It is a small change, done as a side task.
- **Not yet:** haggling in markets, and busking at the inn.
- **For the designer to think about:** more uses for the other skills, e.g. Medicine lowering the chance of a lasting injury (design §7). The hook should be left open.
- **Dark rooms and fuel** (design §7b): about 60% of dungeons have dark rooms, and about 20% are mostly dark.

## Architecture (from design §9)

- **Engine:**
  - It lives in `src/engine/combat/`, pure and seeded: `step` actions, with preview == actual.
  - `GameState.combat` holds the open fight: the line, the units with their HP, uses and tallies, the round, the intents and the log.
  - Nothing ticks between fights except the long-rest recovery of abilities and spells.
- **Data** (JSON, `data/claude/`): `weapons` (the 8 families × quality tiers), `armours` (Cloth, Leather, Chain, Plate), `enemyRoles` (the six roles with stat tables by CR), `classAbilities`, `spells` (arcane and divine pools, levels 1–9) and `summons`.
  - Creatures gain a `role` and a `size` (`creatures.json`).
  - Situations and dungeon rooms gain an optional `fight` (creatures × counts, and an `ambush` flag), and rooms a `dark` flag.
- **Constants:** every number goes in `constants.ts`:
  - the line length;
  - the stack cap (4 size points);
  - the assist +2 per point;
  - the stagger and stun thresholds;
  - the morale thresholds;
  - the injury chances;
  - the death chance on a third injury;
  - the CR budget for road fights;
  - fuel per dark room.
- **Save:** one bump per merged track that changes `GameState`. Each is written as the next version, and the merger renumbers.

## Wave 1: the core (one track at a time; the rest builds on it)

### Track T: types and data shapes
- Zod schemas for weapons, armours, enemy roles, class abilities, spells and summons.
- `Creature.role` and `Creature.size`; `Situation.fight`; `DungeonRoom.dark`; `Character.gear { weapon, armour }`; `Character.uses` (per-rest ability and spell uses); `Character.spells` (known, by level); `Character.alignment` (clerics only).
- `GameState.combat` and a save migration. Founders get starting gear by class.
- Minimal placeholder data is enough to compile and test: two weapons, one armour, the six roles with a two-row CR table, and a fixture fight. The content tracks fill the data in.
- `pnpm schemas`, and validation that checks the references exist.

### Track E: the combat engine (`src/engine/combat/`)
- **The line and placement** (design §2):
  - 7 tiles (5–8 by the room's shape), the party's formation (front and back rank), and the stack cap in size points.
  - A surprise roll: alertness, the party's stealth, and the scout's kit level (`scoutBonus`).
  - Ambush placement: extra enemies apart from the group, or on the party's far side.
- **Turns** (design §3):
  - The party acts in any order. Each member moves 1 and acts, or takes a full action that depends on the weapon (design §4).
  - Then the enemies act, left to right and top to bottom, from their positions at the start of their turn.
- **Attacks:**
  - To-hit: d20 + modifiers against AC, with assisting adding ±2 per point of stack-size difference.
  - Damage dice, with crits (the dagger's 19–20) and weapon traits (cleave, stagger, reach −4, ranged −4 while engaged).
  - A free swing when a unit leaves an engagement.
- **Intents:**
  - Every enemy telegraphs its action at a tile. A broken intent falls back to repositioning toward the role's favoured range.
  - Hit counts within a party turn give stagger (−2 to hit, a weakened intent) and stun (a lost action), with role and boss thresholds.
- **Enemy behaviour:** bloodied enemies (at or below half HP) take −2 to hit. A bloodied boss grows desperate.
- **Morale** (design §6):
  - It can break only at the thresholds: 3–4 units → 1 left, 5–8 → 2 left, 9+ → 3 left.
  - Each remaining enemy rolls WIS against DC 10 + the party's best Intimidation. The majority decides, and a tie flees.
- **Retreat:** a member who reaches the party's end of the line may leave. The fight ends when everyone has left. It costs camaraderie like any flight, using the existing retreat cost.
- **Defeat** (design §7):
  - A member at 0 HP is out of the fight.
  - It costs camaraderie, permanently.
  - A lasting injury on 25% + the damage past 0. On a third or later injury, a 50% chance of death instead, and the member's gear is lost.
  - A wipe means the party is robbed or left for dead.
  - Medicine is a named hook for a later modifier to the injury chance.
- **The preview** (`combatPreview`): every legal action shows its hit %, damage range, traits and resulting intents. The action resolves exactly as the preview says, from the same functions.
- **Tests:**
  - preview == actual for attacks, moves, full actions and intents;
  - determinism and replay;
  - the stack cap;
  - stagger and stun thresholds;
  - each morale threshold and the majority rule;
  - injury and death chances (statistical);
  - wipe and retreat;
  - the migration.

### As built (Tracks T and E)
- Built on branch `plan7-core`; the details, and the calls made while building, are in the combat design's §11 ("As built"). Its save was written as v21 → v22 and renumbered to v22 → v23 (save v23) on merging after the reputation save.
- Track I's entry points: `startCombat(state, content, fight, { footing })` or the `startCombat` action (the open encounter's `fight`, at its footing), and the fight's `win`, `flee` and `lose` branches.
- Not yet: abilities and spells (the data shapes exist), class proficiencies (`proficient` is true for everyone), dark rooms, the CR budget.

### Track U: the combat UI (after E)
- **The line:** tiles left to right, with each tile's units stacked top to bottom.
- **Units:** party and enemy cards with HP, intents (an arrow onto a tile, with odds) and hit pips toward the stagger and stun thresholds.
- **Intents panel:** the enemies in their action order.
- **Before acting:** hit % and damage shown for the chosen action.
- **Controls:**
  - keys 1–9 select an ability or spell, and pressing the key again deselects it;
  - a click on a tile, or Space, acts;
  - End turn and Retreat buttons.
- **Sizes:** it must fit 1440 × 1050 and 412 × 915.
- **Tests:** one smoke test and the critical interactions.

## Wave 2: classes, enemies and integration (parallel after wave 1)

- **Track C (classes and gear):**
  - Proficiencies and the full action by weapon family.
  - Abilities with long-rest uses and the even-level schedule (design §5).
  - The bard's four; the fighter's +2 style picks; Cunning Action with uses.
  - **Level-up choices:** picks appear in the level-up dialog (choice sections in each card), and Continue waits for them.
  - **Gear:** smiths and armourers sell weapons and armour, priced and with weight. Founders' and recruits' starting gear.
- **Track S (spells, content):**
  - Arcane and divine pools for levels 1–9: 5–8 spells for levels 1–6 and 4–6 for 7–9. About 50% damage at levels 1–3, falling toward 25%. Every spell does something different.
  - The 1-of-3 pick when a level opens.
  - Casts per long rest: lower levels cast more (a slimmed-down 5e table).
  - Summons, one per divine level, as temporary party members; good or neutral clerics get beasts or celestials, evil ones undead.
  - Forced movement: push and pull.
  - **Review:** the pools go to the designer as a list.
- **Track N (enemies, content):**
  - Role stat tables by CR (HP, AC, to-hit, damage), modelled on 5e's monster statistics by CR.
  - Every creature gets a role and a size; bosses get a signature move and a second trick.
  - A road CR budget for the party's level and size.
- **Track I (integration):**
  - **Fight** beside the existing options in hostile road situations. The enemy group is built from the situation's creature slot and the CR budget. The CR is shown as far as the party knows it.
  - **Parley** (the designer call above).
  - **Climaxes:** dungeon boss rooms and Crisis keys offer Fight or the skill challenge.
  - **Lairs** fight their occupants.
  - **XP:** none for killing; the situation pays as now.
  - **Rests:** a long rest restores uses; no rest between dungeon rooms.
- **Track D (dark rooms):**
  - `dark` rooms marked true to their maps (60% / 20%).
  - Fuel per dark room, previewed in the delve, or every check Exposed. The darkvision rule: everyone but one member, or a lone member, has darkvision.
- **Side task:** the camaraderie from standing a round scales with the best Performance.

## Wave 3
- **Track B (balance):**
  - **A fight simulation** of each class party against enemies by CR, aiming at the intended win rates: the intended-level party wins most fights, and a party 2 levels below loses most.
  - **The economy and Crisis reports** rerun with fights.
  - **Deaths:** now that fights can kill, check the designer's target of 90%+ runs ending in a game over.
- **Review:** one code review, then a fix round.

## Decided by Claude (please review)
- **Fuel:** 1 fuel per dark room; a lit fight lights the whole line.
- **Parley DC:** `crDc(cr)`, so the same scale as the checks.
- **Casts per rest** (slots by caster level): levels 1–2: 2 casts at spell level 1. Each new spell level starts at 1 cast, and the lower ones gain one at each new spell level, up to 3.
- **Ability uses:** 1 at the level gained, +1 at levels 6, 10, 14 and 18.
- **Cleric alignment:** picked when a cleric is created. Recruits roll good 45%, neutral 35%, evil 20%.
- **Starting gear:** a class-appropriate plain weapon and armour (Plate for fighters and paladins is too dear, so they start in Chain).
