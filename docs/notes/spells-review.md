# Spells and summons: draft for review (Plan 7 Track S)

**Status:** a content draft for the designer, 2026-11-14. The data is `data/claude/spells.json` (114 spells) and `data/claude/summons.json` (18 summons). The engine doesn't cast them yet: Tracks C and S wire them in later. The shapes are in `src/schema/combat.ts`; `pnpm test` checks the pool sizes, the damage share by level, that no two spells of a level do the same thing, and the Callings (`spellIssues`).

## How to read it

- **Pools.** Wizards draw from **arcane**; clerics from **divine**. **Decided (please review): paladins and rangers draw from the divine pool's levels 1–5.** Rather than a third pool, the divine pool carries a few nature spells for rangers (Hail of Thorns, Briar Lash, Spike Growth, Moonbeam, Lightning Arrow, Grasping Vine, Swift Quiver, Tree Stride). Bards have no spells.
- **Targets:** a foe, an ally (or self), self, the party (every member still fighting), one tile, or two adjacent tiles. An area hits every unit on its tiles, so a fireball over the party's own tile hurts the party.
- **Rolls:** *attack* (d20 + casting ability + proficiency against AC; effects on a hit), *save* (each target saves against the caster's DC; effects on a failure; *half* spells still do half damage on a success), or *auto* (always lands).
- **Rounds:** how long the lasting effects last (1 is this round; "whole fight" is 10).
- **Effects** (the new ones are marked ✱):
  - *damage*, *heal*, ✱*temp HP*, ✱*revive* (a downed member gets up with that many HP);
  - *to hit*, *damage*, ✱*AC* (signed: −2 on a foe is a curse), ✱*ward N* (each hit taken is N lower), ✱*vulnerable N* (each hit taken is N higher);
  - *move*, *push*, *pull*, *stagger*, *stun*, *extra action*, *summon*;
  - ✱*blind* (attacks at disadvantage, reach only the next tile), ✱*rooted* (can't move: no step, charge or hit and run), ✱*fear* (won't come closer or attack; steps away), ✱*discord* (its intent turns on its own side), ✱*conceal* (attacks against it at disadvantage), ✱*banish* (off the line, can't act or be hit, then returns);
  - ✱*wall* (no unit enters or crosses the tile, no attack passes it), ✱*hazard* (the tile hurts whoever is on it when cast, enters it, or starts a turn on it), ✱*escape* (the whole party leaves at once, as a retreat, without free swings).
- **Callings:** each divine level has one summoning spell. A good or neutral caster calls the beast or celestial, an evil one the undead of the same level (the summon effect's `evil`).
- **Casts per rest** follow the plan's "Decided by Claude" table (not in the data yet).
- **Names** echo SRD 5.1 spells and creatures; a few are ours (Hungry Dark, Veil of Mirrors, Briar Lash, Withering Prayer, Rebuke the Wicked, Hymn of Battle, the Callings, the warden stag, the bone sorcerer, the grave knight, the bone dragon). Every description is our own.
- **Numbers** are 5e-like, to match the role tables and the 5e-style HP. Track B's fight simulation will retune them.

## The pools

### Arcane

| Lvl | Spell | Target (range) | Roll | Effect | Dmg |
|---|---|---|---|---|---|
| 1 | Magic Missile | foe (1–6) | auto | 3d4+3 | yes |
| 1 | Burning Hands | tile (1–1) | DEX save (half) | 3d6 | yes |
| 1 | Thunderwave | tile (1–1) | CON save (half) | 2d8, push 1 | yes |
| 1 | Chromatic Orb | foe (1–5) | attack | 3d8 | yes |
| 1 | Shield | self | auto | AC +5 (free action) |  |
| 1 | Sleep | tile (2–5) | WIS save | stun |  |
| 1 | Grease | tile (1–5) | DEX save | rooted, 2 rds |  |
| 1 | Fog Cloud | tile (0–5) | auto | conceal, 3 rds |  |
| 2 | Scorching Ray | foe (1–5) | attack | 6d6 | yes |
| 2 | Shatter | tile (2–6) | CON save (half) | 3d8 | yes |
| 2 | Acid Arrow | foe (1–5) | attack | 4d4+2, AC -2, 2 rds | yes |
| 2 | Cloud of Daggers | tile (1–5) | auto | hazard 4d4/rd, 3 rds | yes |
| 2 | Hold Person | foe (1–4) | WIS save | stun, 2 rds |  |
| 2 | Misty Step | self | auto | move 3 (free action) |  |
| 2 | Blindness | foe (1–4) | CON save | blind, 3 rds |  |
| 2 | Gust of Wind | tile (1–3) | STR save | push 2 |  |
| 3 | Fireball | 2 tiles (2–6) | DEX save (half) | 6d6 | yes |
| 3 | Lightning Bolt | tile (1–6) | DEX save (half) | 8d6 | yes |
| 3 | Hungry Dark | 2 tiles (1–5) | auto | hazard 2d6/rd, blind, 2 rds | yes |
| 3 | Slow | 2 tiles (1–5) | WIS save | rooted, to hit -2, AC -2, 2 rds |  |
| 3 | Haste | ally (0–3) | auto | extra action, AC +2, 3 rds |  |
| 3 | Fear | tile (1–4) | WIS save | fear, 2 rds |  |
| 3 | Bestow Curse | foe (1–1) | WIS save | vulnerable 4, 5 rds |  |
| 4 | Ice Storm | 2 tiles (2–6) | DEX save (half) | 4d8, rooted | yes |
| 4 | Blight | foe (1–5) | CON save (half) | 8d8 | yes |
| 4 | Wall of Fire | tile (1–5) | DEX save (half) | wall, hazard 3d8/rd, 3 rds | yes |
| 4 | Black Tentacles | tile (2–5) | STR save | pull 2, rooted, 2 rds |  |
| 4 | Greater Invisibility | ally (0–3) | auto | conceal, to hit +2, 3 rds |  |
| 4 | Banishment | foe (1–4) | CHA save | banish, 3 rds |  |
| 4 | Stoneskin | ally (0–1) | auto | ward 4, whole fight |  |
| 5 | Cone of Cold | 2 tiles (1–2) | CON save (half) | 8d8 | yes |
| 5 | Cloudkill | 2 tiles (2–6) | CON save (half) | hazard 3d8/rd, 3 rds | yes |
| 5 | Wall of Force | tile (1–5) | auto | wall, 3 rds |  |
| 5 | Dominate Person | foe (1–4) | WIS save | discord, 2 rds |  |
| 5 | Telekinesis | foe (1–6) | STR save | pull 3 |  |
| 5 | Veil of Mirrors | party | auto | conceal, 2 rds |  |
| 6 | Chain Lightning | 2 tiles (2–6) | DEX save (half) | 10d8 | yes |
| 6 | Disintegrate | foe (1–5) | DEX save | 10d6+40 | yes |
| 6 | Globe of Invulnerability | tile (0–2) | auto | ward 6, 3 rds |  |
| 6 | Flesh to Stone | foe (1–4) | CON save | stun, AC -4, 3 rds |  |
| 6 | Mass Suggestion | 2 tiles (1–5) | WIS save | fear, 2 rds |  |
| 6 | True Seeing | party | auto | to hit +2, 3 rds |  |
| 7 | Delayed Blast Fireball | 2 tiles (2–6) | DEX save (half) | 12d6 | yes |
| 7 | Finger of Death | foe (1–5) | CON save (half) | 7d8+30 | yes |
| 7 | Forcecage | tile (1–5) | auto | banish, 2 rds |  |
| 7 | Reverse Gravity | 2 tiles (2–6) | DEX save | stun |  |
| 7 | Teleport | party | auto | escape |  |
| 8 | Sunburst | 2 tiles (1–6) | CON save (half) | 12d6, blind, 2 rds | yes |
| 8 | Power Word Stun | foe (1–6) | auto | stun, 2 rds |  |
| 8 | Maze | foe (1–5) | auto | banish, 2 rds |  |
| 8 | Dominate Monster | foe (1–5) | WIS save | discord, 3 rds |  |
| 8 | Demiplane | ally (0–4) | auto | banish, 2 rds |  |
| 9 | Meteor Swarm | 2 tiles (2–6) | DEX save (half) | 20d6 | yes |
| 9 | Time Stop | party | auto | extra action |  |
| 9 | Foresight | ally (0–4) | auto | conceal, to hit +4, whole fight |  |
| 9 | Imprisonment | foe (1–4) | WIS save | banish, whole fight |  |

### Divine

| Lvl | Spell | Target (range) | Roll | Effect | Dmg |
|---|---|---|---|---|---|
| 1 | Healing Word | ally (0–4) | auto | heal 2d4+2 (free action) |  |
| 1 | Bless | party | auto | to hit +2, 2 rds |  |
| 1 | Bane | tile (1–5) | CHA save | to hit -2, 3 rds |  |
| 1 | Guiding Bolt | foe (1–6) | attack | 4d6, AC -2 | yes |
| 1 | Inflict Wounds | foe (1–1) | attack | 3d10 | yes |
| 1 | Hail of Thorns | tile (3–5) | DEX save (half) | 2d10 | yes |
| 1 | Briar Lash | foe (1–3) | attack | 2d8, pull 1 | yes |
| 1 | First Calling | tile (0–1) | auto | summon Spirit hound / Skeleton archer |  |
| 2 | Spiritual Weapon | foe (1–4) | attack | 1d8+3 (free action) | yes |
| 2 | Heat Metal | foe (1–4) | auto | 2d8, to hit -2, 2 rds | yes |
| 2 | Moonbeam | tile (1–5) | CON save (half) | hazard 2d10/rd, 3 rds | yes |
| 2 | Spike Growth | 2 tiles (1–5) | auto | hazard 2d4/rd, 5 rds | yes |
| 2 | Aid | party | auto | temp HP 1d6+3, whole fight |  |
| 2 | Shield of Faith | ally (0–4) | auto | AC +2, whole fight |  |
| 2 | Command | foe (1–4) | WIS save | push 2 |  |
| 2 | Second Calling | tile (0–1) | auto | summon Cave bear / Ghoul |  |
| 3 | Spirit Guardians | tile (1–1) | WIS save (half) | hazard 3d8/rd, 3 rds | yes |
| 3 | Call Lightning | tile (2–6) | DEX save (half) | 4d10 | yes |
| 3 | Lightning Arrow | foe (3–6) | attack | 4d8+4 | yes |
| 3 | Revivify | ally (1–1) | auto | revive 2d8 |  |
| 3 | Mass Healing Word | party | auto | heal 1d4+3 (free action) |  |
| 3 | Crusader's Mantle | party | auto | damage +2, 3 rds |  |
| 3 | Third Calling | tile (0–1) | auto | summon Warden stag / Ogre zombie |  |
| 4 | Guardian of Faith | tile (1–3) | DEX save (half) | wall, hazard 3d8/rd, 3 rds | yes |
| 4 | Withering Prayer | foe (1–5) | CON save (half) | 8d8 | yes |
| 4 | Staggering Smite | foe (1–1) | attack | 4d6+4, stagger | yes |
| 4 | Rebuke the Wicked | tile (1–4) | WIS save | fear, 3 rds |  |
| 4 | Aura of Purity | party | auto | ward 2, 3 rds |  |
| 4 | Grasping Vine | foe (1–5) | DEX save | pull 3 |  |
| 4 | Fourth Calling | tile (0–1) | auto | summon Unicorn / Wight |  |
| 5 | Flame Strike | tile (1–6) | DEX save (half) | 6d8 | yes |
| 5 | Insect Plague | 2 tiles (2–6) | CON save (half) | hazard 3d8/rd, 3 rds | yes |
| 5 | Mass Cure Wounds | party | auto | heal 3d8 |  |
| 5 | Hallow | tile (0–3) | auto | to hit +2, AC +2, whole fight |  |
| 5 | Swift Quiver | self | auto | extra action, 3 rds |  |
| 5 | Tree Stride | self | auto | move 4 (free action) |  |
| 5 | Fifth Calling | tile (0–1) | auto | summon Couatl / Wraith |  |
| 6 | Harm | foe (1–1) | CON save (half) | 14d6 | yes |
| 6 | Heal | ally (1–1) | auto | heal 10d8+20 |  |
| 6 | Blade Barrier | tile (1–5) | DEX save (half) | wall, hazard 6d10/rd, 3 rds | yes |
| 6 | Word of Recall | party | auto | escape |  |
| 6 | Heroes' Feast | party | auto | temp HP 2d10, whole fight |  |
| 6 | Sixth Calling | tile (0–1) | auto | summon Deva / Mummy |  |
| 7 | Fire Storm | 2 tiles (1–6) | DEX save (half) | 7d10 | yes |
| 7 | Divine Word | tile (1–5) | CHA save | stun, blind, 2 rds |  |
| 7 | Regenerate | ally (1–1) | auto | heal 4d8+15, ward 2, whole fight |  |
| 7 | Plane Shift | foe (1–1) | CHA save | banish, whole fight |  |
| 7 | Sunbeam | tile (1–6) | CON save (half) | 6d8, blind, 2 rds | yes |
| 7 | Seventh Calling | tile (0–1) | auto | summon Roc / Bone sorcerer |  |
| 8 | Earthquake | 2 tiles (1–6) | DEX save (half) | 5d10, stagger | yes |
| 8 | Holy Aura | party | auto | conceal, 3 rds |  |
| 8 | Hymn of Battle | party | auto | to hit +2, damage +2, 3 rds |  |
| 8 | Sympathy | 2 tiles (2–6) | WIS save | pull 3 |  |
| 8 | Eighth Calling | tile (0–1) | auto | summon Planetar / Grave knight |  |
| 9 | Mass Heal | party | auto | heal 10d10+10 |  |
| 9 | Storm of Vengeance | 2 tiles (1–6) | CON save (half) | 12d8, stagger | yes |
| 9 | True Resurrection | party | auto | revive 4d10+10 |  |
| 9 | Ninth Calling | tile (0–1) | auto | summon Solar / Bone dragon |  |

### Damage share

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Arcane | 4/8 (50%) | 4/8 (50%) | 3/7 (43%) | 3/7 (43%) | 2/6 (33%) | 2/6 (33%) | 2/5 (40%) | 1/5 (20%) | 1/4 (25%) |
| Divine | 4/8 (50%) | 4/8 (50%) | 3/7 (43%) | 3/7 (43%) | 2/7 (29%) | 2/6 (33%) | 2/6 (33%) | 1/5 (20%) | 1/4 (25%) |

### Summons

| Lvl | Good / neutral | Evil |
|---|---|---|
| 1 | Spirit hound (beast, skirmisher, medium): HP 13, AC 13, +4, 1d6+2 | Skeleton archer (undead, archer, medium): HP 13, AC 13, +4, 1d6+2, reach 3–5 |
| 2 | Cave bear (beast, brute, large): HP 30, AC 12, +5, 2d6+3 | Ghoul (undead, skirmisher, medium): HP 26, AC 12, +4, 2d6+2 |
| 3 | Warden stag (beast, leader, large): HP 40, AC 13, +5, 2d6+3 | Ogre zombie (undead, brute, large): HP 50, AC 9, +5, 2d8+4 |
| 4 | Unicorn (celestial, skirmisher, large): HP 55, AC 14, +6, 2d8+4 | Wight (undead, leader, medium): HP 50, AC 14, +6, 2d8+4 |
| 5 | Couatl (celestial, caster, medium): HP 65, AC 15, +7, 2d8+4, reach 1–3 | Wraith (undead, skirmisher, medium): HP 65, AC 13, +7, 3d8+3 |
| 6 | Deva (celestial, leader, medium): HP 85, AC 16, +8, 2d10+4 | Mummy (undead, brute, medium): HP 90, AC 13, +7, 2d10+6 |
| 7 | Roc (beast, brute, huge): HP 120, AC 15, +9, 3d10+6 | Bone sorcerer (undead, caster, medium): HP 100, AC 15, +9, 3d8+5, reach 1–3 |
| 8 | Planetar (celestial, brute, large): HP 140, AC 18, +10, 4d8+7 | Grave knight (undead, leader, large): HP 140, AC 18, +10, 4d8+6 |
| 9 | Solar (celestial, archer, large): HP 170, AC 19, +11, 4d10+6, reach 3–5 | Bone dragon (undead, brute, huge): HP 180, AC 17, +11, 4d10+7 |

"Damage" counts damage and hazard spells. The target was about 50% at levels 1–3, falling toward 25%. The test holds levels 1–3 at 35–65% and levels 7–9 at 15–40%, and needs the average to fall from levels 1–3 to 4–6 to 7–9.

## Schema changes (`src/schema/combat.ts`)

- Abilities and spells gain `roll` (optional: an attack, or a save with its ability and `half`) and `rounds` (1–10, default 1).
- Fourteen new effects (the ✱ list above). The summon effect gains `evil`: the undead an evil caster calls.
- Summons gain `role` (an enemy role: its favoured range and trick) and `description`.
- `spellIssues` (in `combatIssues`): only divine spells summon; one Calling per divine level; each Calling's summons exist, are of its level, and the `evil` one is undead.

## Questions for the designer

1. **Rangers and paladins** share the divine pool's levels 1–5 (above). Should rangers get their own small nature pool instead, or only draw from tagged spells? And should paladins and rangers be able to summon? Paladins have no alignment, so they would call the good summons.
2. **Enemy saves.** Enemies only have a WIS save (for morale). Saves need a bonus for each ability. The proposal is a save bonus by CR, with each role strong in two abilities (brutes STR/CON, skirmishers DEX/WIS, casters INT/WIS…) (Track N).
3. **The spell DC and attack:** 8 + proficiency + the casting ability, and proficiency + the casting ability, as in 5e?
4. **Lasting spells stack.** Nothing stops a caster from stacking Stoneskin, Shield of Faith, Aid, Hallow and Bless. Should there be 5e-style concentration (one lasting spell per caster at a time)?
5. **Hard control** is cheap at low levels: Sleep (L1) stuns a whole tile on a failed save, and Hold Person (L2) stuns for 2 rounds. Should bosses be immune, or count a stun as only a stagger?
6. **Escape spells** (Teleport A7, Word of Recall D6) end the fight as a retreat. Should they still cost the retreat's camaraderie, as proposed?
7. **Friendly fire:** areas hit allies on their tiles. Keep it? It makes the party's formation and crowding matter.
8. **Out-of-combat uses.** None yet. Candidates: Revivify or True Resurrection raising a member who just died, Regenerate mending a lasting injury, Word of Recall as travel, healing spells between fights.
9. **Damage kinds** (fire, radiant…) are not modelled. Do you want undead to be weak to radiant, or kept for Turn Undead only?
10. **An evil cleric** differs only in its summons. Should the evil divine pool swap some spells too (e.g. Inflict Wounds for Healing Word)?


## Designer notes (2026-11-14)

- The effect "slow" is renamed **rooted** (it can't move).
- Spells needn't be in full balance: variance and adapting to the situation are fun.
- **Casts per long rest** (replacing the plan's provisional table): one cast per known spell level, plus one more cast for the level two below the best. From caster level 6, even levels add lower-level casts. Per improvement point, by spell level (1st/2nd/3rd/4th…):
  1/0/0/0 → 1/1/0/0 → 1/1/1/0 → 2/1/1/0 → 2/1/1/1 → 2/2/1/1 → … (the pattern continues to 9th).

## Designer review notes (2026-11-14, being applied)

- **Ranges:**
  - Arcane spells mostly reach 4 at most; rays, arrows and magic missiles 5; heavy area spells (Fireball, firewall) 3.
  - Divine spells are lower: 4 is long range, 1–3 typical. Spiritual Weapon reaches 1.
- **Damage** doesn't scale with caster level.
- **Shield** becomes "Mage Armor" and lasts until the fight ends.
- **More push and pull:**
  - a level-2 push or pull on a single friend or foe, with no damage;
  - a level 4–5 group push or pull;
  - push and pull with damage at levels 6–9. Pull is especially valuable.
- **Hazards:** they deal damage only at the start of an affected unit's turn. Enemies sometimes flee the tile, even at the cost of free swings.
- **Maze** deals damage too.
- **Dominate Monster** becomes Mass Dominate: discord on a group for 1 turn.
- **Demiplane:** the ally gets a 4-round buff on return.
- **Bless** is a single ally for 3 rounds. Party-wide buffs belong at higher levels.
- **Heat Metal** gives −4 to hit.
