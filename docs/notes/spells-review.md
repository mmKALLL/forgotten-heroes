# Spells and summons: draft for review (Plan 7 Track S)

**Status:** a content draft for the designer, 2026-11-14, revised after the designer’s review the same day (see "Revisions 2026-11-14" below). The data is `data/claude/spells.json` (121 spells) and `data/claude/summons.json` (18 summons). The engine doesn't cast them yet: Tracks C and S wire them in later. The shapes are in `src/schema/combat.ts`; `pnpm test` checks the pool sizes, the damage share by level, that no two spells of a level do the same thing, and the Callings (`spellIssues`).

## How to read it

- **Pools.** Wizards draw from **arcane**; clerics from **divine**. **Decided (please review): paladins and rangers draw from the divine pool's levels 1–5.** Rather than a third pool, the divine pool carries a few nature spells for rangers (Hail of Thorns, Briar Lash, Spike Growth, Moonbeam, Lightning Arrow, Grasping Vine, Swift Quiver, Tree Stride). Bards have no spells.
- **Targets:** a foe, an ally (or self), self, the party (every member still fighting), one tile, two adjacent tiles, or ✱*friend or foe* (any one unit; a friend never resists the save). An area hits every unit on its tiles, so a fireball over the party's own tile hurts the party.
- **Rolls:** *attack* (d20 + casting ability + proficiency against AC; effects on a hit), *save* (each target saves against the caster's DC; effects on a failure; *half* spells still do half damage on a success), or *auto* (always lands).
- **Rounds:** how long the lasting effects last (1 is this round; "whole fight" is 10, which lasts until the fight ends).
- **Ranges** (designer review 2026-11-14): positioning matters, so ranges are short. Arcane spells reach at most 4 tiles; rays, arrows and missiles 5; heavy areas (Fireball, Wall of Fire, the two-tile blasts) 3. Divine spells are shorter: 1–3 is typical and 4 is long. The ranger’s arrow spells (Hail of Thorns, Lightning Arrow) keep the bow’s 3–5.
- **Damage is fixed by the spell level.** Nothing scales with the caster’s level (the designer prefers it so); a stronger caster gets more casts and higher levels, not bigger dice.
- **Effects** (the new ones are marked ✱):
  - *damage*, *heal*, ✱*temp HP*, ✱*revive* (a downed member gets up with that many HP);
  - *to hit*, *damage*, ✱*AC* (signed: −2 on a foe is a curse), ✱*ward N* (each hit taken is N lower), ✱*vulnerable N* (each hit taken is N higher);
  - *move*, *push*, *pull*, *stagger*, *stun*, *extra action*, *summon*;
  - ✱*blind* (attacks at disadvantage, reach only the next tile), ✱*rooted* (can't move: no step, charge or hit and run), ✱*fear* (won't come closer or attack; steps away), ✱*discord* (its intent turns on its own side), ✱*conceal* (attacks against it at disadvantage), ✱*banish* (off the line, can't act or be hit, then returns; `onReturn` buffs a returning ally);
  - ✱*wall* (no unit enters or crosses the tile, no attack passes it), ✱*hazard* (the tile hurts a unit at the start of each of its turns on it, not when cast; `flee` says how readily an enemy steps off it), ✱*push or pull* (`shift`: the caster picks the direction when casting), ✱*escape* (the whole party leaves at once, as a retreat, without free swings).
- **Callings:** each divine level has one summoning spell. A good or neutral caster calls the beast or celestial, an evil one the undead of the same level (the summon effect's `evil`).
- **Casts per rest** follow the plan's "Decided by Claude" table (not in the data yet).
- **Names** echo SRD 5.1 spells and creatures; a few are ours (Hungry Dark, Veil of Mirrors, Briar Lash, Withering Prayer, Rebuke the Wicked, Hymn of Battle, the Callings, the warden stag, the bone sorcerer, the grave knight, the bone dragon). Every description is our own.
- **Numbers** are 5e-like, to match the role tables and the 5e-style HP. Track B's fight simulation will retune them.

## The pools

### Arcane

| Lvl | Spell | Target (range) | Roll | Effect | Dmg |
|---|---|---|---|---|---|
| 1 | Magic Missile | foe (1–5) | auto | 3d4+3 | yes |
| 1 | Burning Hands | tile (1–1) | DEX save (half) | 3d6 | yes |
| 1 | Thunderwave | tile (1–1) | CON save (half) | 2d8, push 1 | yes |
| 1 | Chromatic Orb | foe (1–4) | attack | 3d8 | yes |
| 1 | Mage Armor | self | auto | AC +3, whole fight |  |
| 1 | Sleep | tile (2–4) | WIS save | stun |  |
| 1 | Grease | tile (1–4) | DEX save | rooted, 2 rds |  |
| 1 | Fog Cloud | tile (0–4) | auto | conceal, 3 rds |  |
| 2 | Scorching Ray | foe (1–5) | attack | 6d6 | yes |
| 2 | Shatter | tile (2–4) | CON save (half) | 3d8 | yes |
| 2 | Acid Arrow | foe (1–5) | attack | 4d4+2, AC -2, 2 rds | yes |
| 2 | Cloud of Daggers | tile (1–4) | auto | hazard 4d4/rd, 3 rds | yes |
| 2 | Hold Person | foe (1–4) | WIS save | stun, 2 rds |  |
| 2 | Misty Step | self | auto | move 3 (free action) |  |
| 2 | Blindness | foe (1–4) | CON save | blind, 3 rds |  |
| 2 | Gust of Wind | tile (1–3) | STR save | push 2 |  |
| 2 | Shove | friend or foe (1–4) | STR save | push or pull 2 |  |
| 3 | Fireball | 2 tiles (2–3) | DEX save (half) | 6d6 | yes |
| 3 | Lightning Bolt | tile (1–4) | DEX save (half) | 8d6 | yes |
| 3 | Hungry Dark | 2 tiles (1–3) | auto | hazard 2d6/rd, blind, 2 rds | yes |
| 3 | Slow | 2 tiles (1–4) | WIS save | rooted, to hit -2, AC -2, 2 rds |  |
| 3 | Haste | ally (0–3) | auto | extra action, AC +2, 3 rds |  |
| 3 | Fear | tile (1–4) | WIS save | fear, 2 rds |  |
| 3 | Bestow Curse | foe (1–1) | WIS save | vulnerable 4, 5 rds |  |
| 4 | Ice Storm | 2 tiles (2–3) | DEX save (half) | 4d8, rooted | yes |
| 4 | Blight | foe (1–4) | CON save (half) | 8d8 | yes |
| 4 | Wall of Fire | tile (1–3) | DEX save (half) | wall, hazard 3d8/rd (flee: always), 3 rds | yes |
| 4 | Black Tentacles | tile (2–4) | STR save | pull 2, rooted, 2 rds |  |
| 4 | Greater Invisibility | ally (0–3) | auto | conceal, to hit +2, 3 rds |  |
| 4 | Banishment | foe (1–4) | CHA save | banish, 3 rds |  |
| 4 | Stoneskin | ally (0–1) | auto | ward 4, whole fight |  |
| 5 | Cone of Cold | 2 tiles (1–2) | CON save (half) | 8d8 | yes |
| 5 | Cloudkill | 2 tiles (2–3) | CON save (half) | hazard 3d8/rd, 3 rds | yes |
| 5 | Wall of Force | tile (1–4) | auto | wall, 3 rds |  |
| 5 | Dominate Person | foe (1–4) | WIS save | discord, 2 rds |  |
| 5 | Telekinesis | foe (1–4) | STR save | pull 3 |  |
| 5 | Repelling Wave | tile (1–3) | STR save | push 3 |  |
| 5 | Veil of Mirrors | party | auto | conceal, 2 rds |  |
| 6 | Chain Lightning | 2 tiles (2–3) | DEX save (half) | 10d8 | yes |
| 6 | Disintegrate | foe (1–5) | DEX save | 10d6+40 | yes |
| 6 | Globe of Invulnerability | tile (0–2) | auto | ward 6, 3 rds |  |
| 6 | Flesh to Stone | foe (1–4) | CON save | stun, AC -4, 3 rds |  |
| 6 | Mass Suggestion | 2 tiles (1–4) | WIS save | fear, 2 rds |  |
| 6 | True Seeing | party | auto | to hit +2, 3 rds |  |
| 6 | Undertow | foe (1–5) | STR save (half) | 6d10, pull 4 | yes |
| 6 | Crashing Wave | 2 tiles (1–3) | STR save (half) | 7d8, push 2 | yes |
| 7 | Delayed Blast Fireball | 2 tiles (2–3) | DEX save (half) | 12d6, push 1 | yes |
| 7 | Finger of Death | foe (1–4) | CON save (half) | 7d8+30 | yes |
| 7 | Forcecage | tile (1–4) | auto | banish, 2 rds |  |
| 7 | Reverse Gravity | 2 tiles (2–4) | DEX save | stun |  |
| 7 | Teleport | party | auto | escape |  |
| 8 | Sunburst | 2 tiles (1–3) | CON save (half) | 12d6, blind, 2 rds | yes |
| 8 | Power Word Stun | foe (1–4) | auto | stun, 2 rds |  |
| 8 | Maze | foe (1–4) | auto | banish, 6d10, 2 rds | yes |
| 8 | Mass Dominate | tile (1–4) | WIS save | discord (1 turn) |  |
| 8 | Demiplane | ally (0–3) | auto | banish, 2 rds; on return to hit +2, AC +2 for 4 rds |  |
| 9 | Meteor Swarm | 2 tiles (2–3) | DEX save (half) | 20d6 | yes |
| 9 | Time Stop | party | auto | extra action |  |
| 9 | Foresight | ally (0–2) | auto | conceal, to hit +4, whole fight |  |
| 9 | Imprisonment | foe (1–4) | WIS save | banish, whole fight |  |
| 9 | Singularity | 2 tiles (2–4) | STR save (half) | 10d10, pull 3 | yes |

### Divine

| Lvl | Spell | Target (range) | Roll | Effect | Dmg |
|---|---|---|---|---|---|
| 1 | Healing Word | ally (0–3) | auto | heal 2d4+2 (free action) |  |
| 1 | Bless | ally (0–2) | auto | to hit +2, 3 rds |  |
| 1 | Bane | tile (1–3) | CHA save | to hit -2, 3 rds |  |
| 1 | Guiding Bolt | foe (1–4) | attack | 4d6, AC -2 | yes |
| 1 | Inflict Wounds | foe (1–1) | attack | 3d10 | yes |
| 1 | Hail of Thorns | tile (3–5) | DEX save (half) | 2d10 | yes |
| 1 | Briar Lash | foe (1–3) | attack | 2d8, pull 1 | yes |
| 1 | First Calling | tile (0–1) | auto | summon Spirit hound / Skeleton archer |  |
| 2 | Spiritual Weapon | foe (1–1) | attack | 1d8+3 (free action) | yes |
| 2 | Heat Metal | foe (1–3) | auto | 2d8, to hit -4, 2 rds | yes |
| 2 | Moonbeam | tile (1–3) | CON save (half) | hazard 2d10/rd, 3 rds | yes |
| 2 | Spike Growth | 2 tiles (1–3) | auto | hazard 2d4/rd (flee: never), 5 rds | yes |
| 2 | Aid | ally (0–2) | auto | temp HP 2d6+4, whole fight |  |
| 2 | Shield of Faith | ally (0–2) | auto | AC +2, whole fight |  |
| 2 | Command | foe (1–3) | WIS save | push 2 |  |
| 2 | Shepherd’s Crook | friend or foe (1–3) | STR save | push or pull 2 |  |
| 2 | Second Calling | tile (0–1) | auto | summon Cave bear / Ghoul |  |
| 3 | Spirit Guardians | tile (1–1) | WIS save (half) | hazard 3d8/rd, 3 rds | yes |
| 3 | Call Lightning | tile (2–4) | DEX save (half) | 4d10 | yes |
| 3 | Lightning Arrow | foe (3–5) | attack | 4d8+4 | yes |
| 3 | Revivify | ally (1–1) | auto | revive 2d8 |  |
| 3 | Mass Healing Word | party | auto | heal 1d4+3 (free action) |  |
| 3 | Crusader's Mantle | party | auto | damage +2, 3 rds |  |
| 3 | Third Calling | tile (0–1) | auto | summon Warden stag / Ogre zombie |  |
| 4 | Guardian of Faith | tile (1–3) | DEX save (half) | wall, hazard 3d8/rd, 3 rds | yes |
| 4 | Withering Prayer | foe (1–4) | CON save (half) | 8d8 | yes |
| 4 | Staggering Smite | foe (1–1) | attack | 4d6+4, stagger | yes |
| 4 | Rebuke the Wicked | tile (1–3) | WIS save | fear, 3 rds |  |
| 4 | Aura of Purity | party | auto | ward 2, 3 rds |  |
| 4 | Grasping Vine | foe (1–4) | DEX save | pull 3 |  |
| 4 | Call of the Fold | tile (1–4) | WIS save | pull 2 |  |
| 4 | Fourth Calling | tile (0–1) | auto | summon Unicorn / Wight |  |
| 5 | Flame Strike | tile (1–4) | DEX save (half) | 6d8 | yes |
| 5 | Insect Plague | 2 tiles (2–3) | CON save (half) | hazard 3d8/rd, 3 rds | yes |
| 5 | Mass Cure Wounds | party | auto | heal 3d8 |  |
| 5 | Hallow | tile (0–2) | auto | to hit +2, AC +2, whole fight |  |
| 5 | Swift Quiver | self | auto | extra action, 3 rds |  |
| 5 | Tree Stride | self | auto | move 4 (free action) |  |
| 5 | Fifth Calling | tile (0–1) | auto | summon Couatl / Wraith |  |
| 6 | Harm | foe (1–1) | CON save (half) | 14d6 | yes |
| 6 | Heal | ally (1–1) | auto | heal 10d8+20 |  |
| 6 | Blade Barrier | tile (1–3) | DEX save (half) | wall, hazard 6d10/rd (flee: always), 3 rds | yes |
| 6 | Word of Recall | party | auto | escape |  |
| 6 | Heroes' Feast | party | auto | temp HP 2d10, whole fight |  |
| 6 | Sixth Calling | tile (0–1) | auto | summon Deva / Mummy |  |
| 7 | Fire Storm | 2 tiles (1–3) | DEX save (half) | 7d10 | yes |
| 7 | Divine Word | tile (1–3) | CHA save | stun, blind, 2 rds |  |
| 7 | Regenerate | ally (1–1) | auto | heal 4d8+15, ward 2, whole fight |  |
| 7 | Plane Shift | foe (1–1) | CHA save | banish, whole fight |  |
| 7 | Sunbeam | tile (1–4) | CON save (half) | 6d8, blind, 2 rds | yes |
| 7 | Seventh Calling | tile (0–1) | auto | summon Roc / Bone sorcerer |  |
| 8 | Earthquake | 2 tiles (1–3) | DEX save (half) | 5d10, stagger | yes |
| 8 | Holy Aura | party | auto | conceal, 3 rds |  |
| 8 | Hymn of Battle | party | auto | to hit +2, damage +2, 3 rds |  |
| 8 | Sympathy | 2 tiles (2–4) | WIS save | pull 3 |  |
| 8 | Eighth Calling | tile (0–1) | auto | summon Planetar / Grave knight |  |
| 9 | Mass Heal | party | auto | heal 10d10+10 |  |
| 9 | Storm of Vengeance | 2 tiles (1–3) | CON save (half) | 12d8, stagger | yes |
| 9 | True Resurrection | party | auto | revive 4d10+10 |  |
| 9 | Ninth Calling | tile (0–1) | auto | summon Solar / Bone dragon |  |

### Damage share

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Arcane | 4/8 (50%) | 4/9 (44%) | 3/7 (43%) | 3/7 (43%) | 2/7 (29%) | 4/8 (50%) | 2/5 (40%) | 2/5 (40%) | 2/5 (40%) |
| Divine | 4/8 (50%) | 4/9 (44%) | 3/7 (43%) | 3/8 (38%) | 2/7 (29%) | 2/6 (33%) | 2/6 (33%) | 1/5 (20%) | 1/4 (25%) |

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

"Damage" counts damage and hazard spells. The target was about 50% at levels 1–3, falling toward 25%. The test holds levels 1–3 at 35–65% and levels 7–9 at 15–40%, and needs the average to fall from levels 1–3 to 4–6 to 7–9. The review’s additions (damaging pushes and pulls at arcane 6–9, Maze’s damage) lift the arcane share at 7–9 to 40%, the top of the band, and arcane 4–6 (about 40.5%) stays only just above 7–9 (40%). One more damaging arcane spell at 7–9 would break the test: swap, or relax the band.

## Schema changes (`src/schema/combat.ts`)

- Abilities and spells gain `roll` (optional: an attack, or a save with its ability and `half`) and `rounds` (1–10, default 1).
- Fourteen new effects (the ✱ list above). The summon effect gains `evil`: the undead an evil caster calls.
- Summons gain `role` (an enemy role: its favoured range and trick) and `description`.
- After the review (2026-11-14): the spell target `unit` (spells only), the effect `shift` (push or pull, the caster's choice), the hazard's `flee` (`never`, `sometimes`, `always`) and the banish's `onReturn` (buffs for a returning ally).
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

## Revisions 2026-11-14 (after the designer's review)

**Ranges** (shorter, so positioning matters):
- Arcane at most 4 tiles; the rays, arrows and missiles (Magic Missile, Scorching Ray, Acid Arrow, Disintegrate, Undertow) 5; the heavy areas at most 3: Fireball, Ice Storm, Wall of Fire, Cloudkill, Chain Lightning, Delayed Blast Fireball, Sunburst, Meteor Swarm, Hungry Dark, Crashing Wave (Cone of Cold stays 1–2, Gust of Wind 1–3).
- Divine at most 4, mostly 1–3. At 4: Guiding Bolt, Call Lightning (2–4), Withering Prayer, Grasping Vine, Call of the Fold, Flame Strike, Sunbeam, Sympathy (2–4). The ranger's arrow spells keep the bow's 3–5 (Hail of Thorns, Lightning Arrow 3–6 → 3–5).
- **Spiritual Weapon** 1–4 → 1 (a foe beside the caster).

**Damage doesn't scale with the caster's level.** No spell did; the data notes and "How to read it" now say so. Each spell's dice are fixed by its spell level.

**Shield → Mage Armor** (arcane 1): self, AC +3 (was +5 for one round as a free action), an action, lasting the whole fight (`rounds: 10`, which the engine already reads as "until the fight ends", `WHOLE_FIGHT_ROUNDS`; the schema's description now says so). No schema extension was needed.

**Push and pull** (added; nothing was swapped out):
- ✱ **Shove** (arcane 2) and ✱ **Shepherd's Crook** (divine 2): one unit, friend or foe, pushed or pulled 2 tiles (the caster picks; a foe gets a STR save, a friend never resists). New in the schema: the spell target `unit` (spells only; class abilities keep their targets) and the effect `shift` (a push or a pull, chosen when cast).
- ✱ **Repelling Wave** (arcane 5): a tile, STR save, push 3, no damage.
- ✱ **Call of the Fold** (divine 4): a tile, WIS save, pull 2, no damage.
- With damage, at arcane 6–9:
  - ✱ **Undertow** (arcane 6): one foe at 1–5, STR save (half), 6d10 and **pull 4**: the strong pull that brings a far mage in.
  - ✱ **Crashing Wave** (arcane 6): two tiles, STR save (half), 7d8 and push 2.
  - **Delayed Blast Fireball** (arcane 7) now also pushes 1.
  - ✱ **Singularity** (arcane 9): two tiles at 2–4, STR save (half), 10d10 and **pull 3**.
- The damage-share test held the line on how many could be added: a damaging arcane spell at 7 or 8 would push those levels past 40%.

**Hazards** hurt only at the start of an affected unit's turn: not when cast, not on stepping in. The schema's hazard description says so, and each hazard spell's description now reads "whoever starts a turn in it". A save (where the spell has one) is rolled each time.
- **For Track S (casting):** an enemy that starts its turn on a hazard tile should consider stepping off it, even at the cost of free swings, but not always. The hazard effect carries this as `flee`: `sometimes` (the default: it leaves when the hazard would hurt it more than the swings it braves), `always` (Wall of Fire and Blade Barrier, the walls of harm) or `never` (Spike Growth: too light to be worth a swing).

**Maze, Forcecage, Mass Dominate, Demiplane:**
- **Forcecage** (arcane 7) is unchanged: in line with Reverse Gravity and Teleport.
- **Maze** (arcane 8) also deals 6d10 (no save) besides the 2-round banish.
- **Dominate Monster → Mass Dominate** (arcane 8, id `mass-dominate`): a tile at 1–4, WIS save, discord for 1 turn (was one foe for 3 rounds).
  - **Question for the designer:** are bosses affected for that one turn too, or immune (or only stifled)? It is the same question as question 5 above (hard control on bosses).
- **Demiplane** (arcane 8): the ally comes back with to hit +2 and AC +2 for 4 rounds. New in the schema: the banish effect's `onReturn` (a few buffs, `toHit`, `damageBonus`, `ac` and `ward`, and their `rounds`). No other spell removes an ally; Forcecage on the party's own tile would, but it is not meant to and has no buff.

**Single-target buffs at low levels:**
- **Bless** (divine 1): one ally (0–2) for 3 rounds (was the whole party for 2).
- **Aid** (divine 2): one ally (0–2), temp HP 2d6+4 (was the party, 1d6+3), still the whole fight.
- Party-wide buffs now start at level 3 (Crusader's Mantle, divine) and level 5 (Veil of Mirrors, arcane).

**Heat Metal** (divine 2): the foe's attacks are at −4 (was −2).

**Pool sizes:** arcane 2 and divine 2 now hold 9 spells. Design §5 asks for 5–8 at levels 1–6; the test allows 5–9 there (the designer said adding is fine), and levels 7–9 still hold 4–6. Totals: 121 spells (61 arcane, 60 divine).

**New and renamed ids:** `mage-armor` (was `shield`), `mass-dominate` (was `dominate-monster`), and the new `shove`, `repelling-wave`, `undertow`, `crashing-wave`, `singularity`, `shepherds-crook` and `call-of-the-fold`.


## Designer answers (2026-11-14)

1. **Rangers and paladins** gain a spell level every 4 levels instead of 2.
   - Rangers (and **druids**, a class for later) draw from **either pool's nature-tagged spells**.
   - Rangers and paladins get **no summons**; druids will get summons.
   - Paladins are expected to lean on non-spell healing, and rangers on bow and dagger expertise later.
2. **Enemy saves:** each role is strong in two abilities (Track N's proposal). On top of that, **leaders get +2 to all saves and bosses +4**, until full stat blocks exist.
3. **Spell DC** is 8 + proficiency + casting ability, and a spell attack is proficiency + casting ability.
4. **Stacking:**
   - A character holds one copy of a given spell's effect; recasting refreshes its duration.
   - A duration spell cast on several targets gives each of them its own copy.
   - **Hazards stack** on a tile.
5. **Saves on tile spells** are rolled once per target, so Sleep isn't guaranteed to take the whole tile. Every unit that isn't banished still counts toward the tile's assist bonus.
6. **Banished units:** what happens when one returns to a tile the party now holds? *Claude's default:*
   - A banished unit leaves the line and blocks nothing.
   - It returns to its old tile if there's room, or else to the nearest tile toward its own side that has room.
   - *Confirmed by the designer (2026-11-14).*
7. **Boss immunity:** bosses get +4 to all saves, as above.
8. **New arcane spells:** single-foe touch spells that hit automatically (no save), at range 1:
   - **Shocking Grasp** at level 1, about half a Lightning Bolt;
   - **Touch of Death** at level 5, about half a Finger of Death.
9. **Escape spells** (Teleport, Word of Recall) cost no camaraderie; the spell use is investment enough.
10. **Friendly fire:** a tile-targeted spell hits allies on the tile; a foe-targeted spell doesn't.
11. **Out of combat:** not needed now, but wanted in future (raising the dead, mending injuries, travel).
12. **Damage kinds and immunities:** not now. For someday: drakes and dragons take 50% less fire, undead take 50% more radiant, and so on.
13. **The evil divine pool** may differ beyond its summons, if it isn't too much work.
