# Open questions for the designer

Collected 2026-11-14. Each question has Claude's default, which is what is built now. Answer whichever you like, in any order. Anything unanswered keeps its default.

## Combat: the core rules (combat design §11)

1. **Old wounds count toward the third injury.** A level-0 recruit already has two, so going down once risks death. *Default: yes.*
2. **"25% + overkill"**: each point of damage past 0 adds 1 percentage point to the chance of a lasting injury. *Default: yes.*
3. **Going down in a fight** costs −5 camaraderie, +2 exhaustion and the injury roll. *Is −5 right, given that a death is −20?*
4. **Surprise:**
   - When the party sneaks up, the best Stealth rolls (with disadvantage if anyone wears Plate).
   - When the party walks into an ambush, the best Perception rolls.
   - Either way the scout's kit adds to the roll, against 10 + the enemies' best WIS.
   - *Default: as built.*
5. **Ambushers** are 1–3 copies of the group's weakest creature, placed apart from the group or behind the party. *Default: as built.*
6. **Enemy behaviour:**
   - A leader rallies every other round while it has two or more allies.
   - A bloodied boss acts twice.
   - *Too strong?*
7. **Retreating uses the member's move,** so a member can attack and then leave. *Default: yes.*
8. **The wipe:**
   - The player picks who is sacrificed.
   - Struggle's injuries never kill.
   - Surrender protects only gold (the smuggler's compartment), not precious goods.
   - *Default: as built.*

## Classes and gear (combat design §13)

9. **Untrained weapon:** no proficiency bonus to hit, as in 5e. **Untrained armour:** attacks at disadvantage, which Edge cancels. *Default: as built.*
10. **Fighter style picks** give +2 damage per pick, not +2 to hit, so four stacked picks can't run away. *Default: damage.*
11. **Ability and spell uses come back on any day's rest**, camp included. *Should only an inn or a "long rest" restore them?*
12. **Gear prices:** plain weapons 1–25 gp, fine about 4× that, +1 250–450 gp, +2 1000–1800 gp. Armour: Cloth 1, Leather 10, Chain 60, Plate 600. *OK, given that a 50 gp start is typical?*
13. **Starting gear:** a plain class weapon and armour. Fighters and paladins start in Chain, not Plate. *Default: yes.*
14. **Cleric alignment** is picked at creation. Recruits roll good 45%, neutral 35%, evil 20%. *Default: yes.*
15. **Ability uses:** 1 when gained, +1 at levels 6, 10, 14 and 18. *Default: yes.*

## Enemies (`docs/notes/enemies-review.md`)

16. **HP scaling:** enemy HP is a typical 5e monster's HP, scaled down for one attack a turn (100% up to CR 1/2, 60% at CR 5, 40% from CR 20). *The balance pass will tune it. Any instinct?*
17. **Members' AC is flat** (armour + DEX, no growth with level), so enemies of CR 17+ hit them 70–75% of the time. *Should AC grow with level, through magic armour or a proficiency-like bonus?*
18. **Strong parties on the road** meet up to 8 of a weak creature, because road creatures top out at CR 1–2. *Add a leader or a tougher creature to big road groups?*
19. **Bosses that call help** every other round (Ilse Marrow, the Ashen Prophet) could flood the line. *Limit it to once or twice a fight?*
20. **Boss names are fixed text** ("the Ashen Prophet"), not the villain's rolled name. *Use the rolled name?*

## Spells (`docs/notes/spells-review.md`, 10 questions there)

You're on these already. The revisions from your review are being applied now; see "Revisions 2026-11-14" in the same file once they land.

## Plan 7 integration (decided by Claude)

21. **Fuel:** 1 per dark room. A lit fight lights the whole line. *Default: yes.*
22. **The Parley DC** uses the same CR scale as checks (`crDc`). Its tiers:
    - success: they let you pass;
    - partial: a toll or a deal;
    - failure: they refuse;
    - critical failure: the fight starts with the party Exposed.

    *Default: as built.*
23. **Fight odds:** the Fight option names the enemies and their CR; it shows no win %. *Should the CR be hidden until you have met that creature, like a dungeon's level?*

## Older items, still open

24. **The scout's kit** at level V gives −25% hostile share before the clamp, so most roads hit the 10% floor. *Too strong?*
25. **The flying carpet:** every pace stays open, it adds no hostility, it can't be stolen, and it pays a sea fare. *OK?*
26. **The donkey** rules out brisk and forced marches like a cart, but adds no hostility. *That was my reading of "only the first animal". Right?*
27. **Recruits don't get the founders' three random +1s**, so they're a little weaker on average. *OK?*
28. **Act III** was lost in every simulated run that reached it. You planned to test it yourself.
29. **The Tab key** in town switches Market and Travel when nothing has focus or after a click, and moves focus during keyboard use. *Does it feel right in play?*
30. **Your `data/original/situations.json`** has two check options without a description: "Fight" in fishermen-at-the-pond (brawl), and "Fight the goblins" in pit-in-the-cave (goblins). *Yours to write.*
