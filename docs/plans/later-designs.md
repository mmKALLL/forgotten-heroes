# Later designs

Designer calls recorded for after the base gameplay is mostly done. Each becomes a plan of its own.

## Store investments (designer, 2026-11-13)

This is the "owned businesses" item of design §11, in a first, simple form.

- **Not a party upgrade.** It is tied to one service in one town.
- **Unlock:** good relations with the town (a standing tier, to be chosen).
- **Each investment level:**
  - costs about **300–500 gp**;
  - raises that service's quality by 1. Quality may go beyond 5: golden circles are drawn on top of the red ones;
  - adds about **50 gp of goods** to the shop's storage each week. The party picks them up free when it visits the town.
  - raises the shop's **input demand** (its role's `inputs` in `service-roles.json`, e.g. a smith's metal): the data-driven demand that every service already adds where it is (designer call 2026-11-13) is the hook to scale, so an invested smithy pays more for metal.
- **Dearer, valuable goods:** both the cost and the weekly value are higher for goods whose base price is above 25 gp, or which are light for their value (jewellery).
- **Open:**
  - how storage caps (if it does) while the party is away;
  - what happens to an investment when the town changes hands or is raided;
  - whether it counts toward the Hall of the Fallen.

## Secret contracts for the wealthy (designer idea, 2026-11-13)

Visible wealth has an upside: people of high standing (aristocrats, guild masters, rich merchants) take a party that clearly has money seriously, and offer it discreet work.

**Claude's proposal for its shape** (to confirm):
- **Who offers:** notable people of a high class, using the existing notable people (`person-roles.json`, e.g. a noble, a guild master or a merchant prince). The offer is made through the People panel, not the notice board.
- **When:** the party has visible wealth of 3 or more steps (`WEALTH_BREAKPOINTS`) and at least neutral standing with that person.
- **What:**
  - **The work:** a few kinds of quiet work. These are a sealed delivery (no questions), recovering a relic from a site, smuggling precious goods past a toll, and a payment that has to arrive unseen.
  - **Pay and secrecy:** pay is about 1.5–2× a same-level contract, plus a good word with that person.
  - **The catch:** the work is secret. Failing it, or being caught (a thieves or toll situation drawn while it is held), costs standing with the town, not just the patron.
- **How it shows:** at most one secret offer per town at a time. It is shown as "a private word" beside the person, and it counts toward the board's 3-offer limit only if the designer wants that.

## Dark dungeons need fuel → moved into Plan 7 (combat design §7b)

## Relic accessories (designer, 2026-11-14)

- **Common accessories** keep the minor passive boosts (today's tier 1).
- **Uncommon and rare accessories** change the game's mechanics significantly, like the relics in Slay the Spire, rather than adding small numbers. They are valuable: usually rewards for clearing a dungeon, on a par with +2-or-better magic items.
- **Rolling:**
  - **Uncommon:** two common affixes (30%), or one uncommon affix (70%).
  - **Rare:** two uncommon affixes (30%), or one rare affix (70%).
- **Next step:** draft a list of uncommon and rare relic effects for review. The new hook targets from combat could carry them: attacks, armour, spell uses, saves, the line, and Parley. Some of Claude's earlier examples (Mule's Bell, Cartographer's Compass, Gambler's Die, Hungry Blade, Merchant's Ledger, Pilgrim's Token) are trade-off relics of this kind.

## Also listed for later

- **Classes:** the Monk (ki: stunning, harrying) and the Barbarian (big single blows), from the combat design.
- **Spell points**, DDO-style, as an alternative casting model.
- **Dungeon alarm level:** failures raise it and it ramps up the difficulty. It is an indirect dungeon resource beside HP and ability uses.
- **Sneak Attack** on the rogue's first turn.
