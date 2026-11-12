# ~/dnd5e `_backups` coverage report

Generated 2026-11-12. For each map in `~/dnd5e/_backups`, this report checks whether at least one variant (day/night, gridded/gridless, and so on) also exists somewhere under `~/dnd5e/tiles and battle maps`.

## How it was checked

- Curated files were renamed, so matching uses a perceptual image hash (64-bit dHash), not filenames.
- Scanned: Czepeku `originals/` (one map per folder) and Party of Two (one map per `Set` folder). Skipped: print tiles (`A2`, `Tabloid`), hex-grid copies, PDFs, `0_Grids`, and Czepeku `room content assets`.
- **has copy**: hash distance ≤ 8 out of 64 bits. In a spot check, every one of these was the same map.
- **unsure**: distance 9–11. A spot check found mostly false matches, so treat these as having no copy until checked by eye.
- **no copy**: distance ≥ 12.
- Caveat: a curated copy that was cropped or heavily edited will not match, so a few maps marked "no copy" may actually exist.
- **Rotation re-check (2026-11-12):** every map marked "no copy" or "unsure" was checked again against 90° and 270° rotations of the curated images. One real match was found: Thieves Guild Hideout (rotated 270°, an exact fingerprint match). The other rotated near-matches (distance 7–8) were false positives: three different Aztec sets all "matched" the same wizard-tower image, so those stay as they were.

## Summary

| Collection | has copy | unsure | no copy | total |
|---|---|---|---|---|
| Czepeku | 108 | 4 | 8 | 120 |
| Party of Two / 2_Battlefields | 1 | 1 | 10 | 12 |
| Party of Two / 2_City | 0 | 3 | 12 | 15 |
| Party of Two / 2_CityofTowers | 0 | 9 | 3 | 12 |
| Party of Two / 2_Desert | 0 | 1 | 8 | 9 |
| Party of Two / 2_Lovecraft | 0 | 2 | 4 | 6 |
| Party of Two / 2_MagicalForest | 1 | 1 | 10 | 12 |
| Party of Two / 2_RadiantCitadel | 0 | 2 | 13 | 15 |
| Party of Two / 2_Steampunk | 0 | 3 | 6 | 9 |
| Party of Two / 2_Undermountain | 0 | 6 | 9 | 15 |
| Party of Two / 5_Airborne | 0 | 0 | 4 | 4 |
| Party of Two / 5_Aztec | 0 | 5 | 7 | 12 |
| Party of Two / 5_Dungeon | 3 | 4 | 2 | 9 |
| Party of Two / 5_Feywild | 2 | 0 | 4 | 6 |
| Party of Two / 5_Mansion | 0 | 2 | 2 | 4 |
| Party of Two / 5_PortTown | 2 | 0 | 6 | 8 |
| Party of Two / 5_Underdark | 1 | 1 | 4 | 6 |
| Party of Two / 5_Woods | 0 | 0 | 6 | 6 |
| **All** | **118** | **44** | **118** | **280** |

Sizes when checked: Czepeku backup about 13 GB; Party of Two about 141 GB. Most of the Party of Two size is print and hex-grid copies of each map.

## Every map

Closest match is the most similar image in `tiles and battle maps`. For maps with no copy, it is usually unrelated.

| Status | Map (under `_backups/`) | Distance | Closest match |
|---|---|---|---|
| no copy | czepeku maps backup/originals/Beached Kraken [78x23] - $5 Rewards | 18 | in-town : urban/_lightning train/G_LightningRail_PostalCar.png |
| has copy | czepeku maps backup/originals/Thieves Guild Hideout [17x48] - $5 Rewards | 0 (rotated 270°) | gate:guild:fort:siege/guild/desert thieves guild.jpeg |
| no copy | czepeku maps backup/originals/Train Station Concourse [36x71] - $5 Rewards | 14 | in-town : urban/forest monster festival.jpeg |
| no copy | czepeku maps backup/originals/Train Station Concourse [36x71] - $5 Rewards 2 | 14 | in-town : urban/forest monster festival.jpeg |
| no copy | czepeku maps backup/originals/Train Station Concourse [36x71] - Transparent | 16 | dungeon maps/__dungeon entrances/forest dungeon entrance.jpg |
| no copy | czepeku maps backup/originals/Treetop Dungeon [28x28] - $5 Rewards - Gridded Pt. 1 | 14 | dungeon maps/_dungeon/the mad alchemist's lair.jpeg |
| no copy | czepeku maps backup/originals/Treetop Dungeon [28x28] - $5 Rewards - Gridded Pt. 2 | 13 | dungeon maps/_epic/infinite wizards tower/Ground Floor/Gridless/GL_MagicWizardTower_GroundFloor_02.jpg |
| no copy | czepeku maps backup/originals/Treetop Dungeon [28x28] - $5 Rewards - Gridless Pt. 1 | 14 | dungeon maps/_dungeon/the mad alchemist's lair.jpeg |
| no copy | czepeku maps backup/originals/Treetop Dungeon [28x28] - $5 Rewards - Gridless Pt. 2 | 13 | dungeon maps/_epic/infinite wizards tower/Ground Floor/Gridless/GL_MagicWizardTower_GroundFloor_02.jpg |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set1 | 17 | generic outdoors/_dice grimorium maps/lava barren mountain path.jpg |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set10 | 15 | generic outdoors/_open-ocean/G_OpenOcean_KuaToaIdol_Day.jpg |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set11 | 17 | fire emblem based maps/fe boat boarding.png |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set12 | 19 | in-town : urban/_boat : airship/airship original.jpg |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set3 | 13 | dungeon maps/_epic/infinite wizards tower/Interior Rooms/Gridless/GL_MagicWizardTower_InteriorFloor_01.jpg |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set4 | 16 | dungeon maps/_epic/great library night/G_GreatLibrary_B2OrreryShadowPlanets_Night.jpg |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set6 | 14 | generic outdoors/_dice grimorium maps/cliff hanging bridge.jpg |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set7 | 16 | fire emblem based maps/fe swamp summoning portal.png |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set8 | 18 | in-town : urban/_tavern : inn/tavern map 2.jpg |
| no copy | party of two maps/2_Battlefields/2_Battlefields_Set9 | 17 | gate:guild:fort:siege/gate : siege/cliff abandoned mine entrance.jpg |
| no copy | party of two maps/2_City/2_City_Set02 | 13 | generic outdoors/_dice grimorium maps/forest straight road.jpg |
| no copy | party of two maps/2_City/2_City_Set03 | 15 | dungeon wonders/magical portal room.jpeg |
| no copy | party of two maps/2_City/2_City_Set04 | 16 | gate:guild:fort:siege/camp/forest goblin camp.webp |
| no copy | party of two maps/2_City/2_City_Set05 | 15 | dungeon maps/_epic/great library day/G_GreatLibrary_B0GoundFloor_Day.jpg |
| no copy | party of two maps/2_City/2_City_Set06 | 16 | in-town : urban/_tavern : inn/desert wild west saloon dust storm 1F.jpg |
| no copy | party of two maps/2_City/2_City_Set07 | 15 | in-town : urban/graveyard bleak.jpg |
| no copy | party of two maps/2_City/2_City_Set08 | 13 | in-town : urban/_building : indoors/royal public bath battle.jpeg |
| no copy | party of two maps/2_City/2_City_Set09 | 15 | fire emblem based maps/fe swamp summoning portal.png |
| no copy | party of two maps/2_City/2_City_Set10 | 18 | gate:guild:fort:siege/encampment/hillsy camp righteous.webp |
| no copy | party of two maps/2_City/2_City_Set11 | 16 | dungeon wonders/shadows of the void.jpeg |
| no copy | party of two maps/2_City/2_City_Set13 | 15 | dungeon maps/__dungeon entrances/generic white chapel entrance.jpeg |
| no copy | party of two maps/2_City/2_City_Set15 | 18 | dungeon maps/_epic/necropolis/necropolis 1 - entrance.jpeg |
| no copy | party of two maps/2_CityofTowers/2_CoT_Set10 | 12 | dungeon maps/_epic/shadowfell fortress/G_ShadowfellFortressInterior_Floor_B1.jpg |
| no copy | party of two maps/2_CityofTowers/2_CoT_Set11 | 14 | dungeon maps/_epic/__zatnikotel-maps/_dragon-lairs/Metalic/Gold Dragon Lair.jpg |
| no copy | party of two maps/2_CityofTowers/2_CoT_Set12 | 13 | generic outdoors/_dice grimorium maps/forest giant mushroom wilderness 1.jpg |
| no copy | party of two maps/2_Desert/2_Desert_Set02 | 15 | dungeon maps/_epic/infinite wizards tower/Ground Floor/Gridded/G_MagicWizardTower_GroundFloor_15.jpg |
| no copy | party of two maps/2_Desert/2_Desert_Set03 | 15 | dungeon wonders/flaming skull chamber.jpg |
| no copy | party of two maps/2_Desert/2_Desert_Set04 | 14 | dungeon maps/_epic/__zatnikotel-maps/_dragon-lairs/Night/Green Dragon Entrance NIGHT.jpg |
| no copy | party of two maps/2_Desert/2_Desert_Set05 | 14 | dungeon maps/_epic/__zatnikotel-maps/_dragon-lairs/Night/Green Dragon Entrance NIGHT.jpg |
| no copy | party of two maps/2_Desert/2_Desert_Set06 | 14 | dungeon maps/_epic/gauntlet of the lich.jpeg |
| no copy | party of two maps/2_Desert/2_Desert_Set07 | 12 | dungeon maps/_epic/shadowfell fortress/G_ShadowfellFortressInterior_Floor_B1.jpg |
| no copy | party of two maps/2_Desert/2_Desert_Set08 | 16 | in-town : urban/temperate bridge town.jpg |
| no copy | party of two maps/2_Desert/2_Desert_Set09 | 13 | dungeon maps/_epic/shadowfell fortress/G_ShadowfellFortressInterior_Floor_B1.jpg |
| no copy | party of two maps/2_Lovecraft/2_Lovecraft_Set02 | 14 | dungeon maps/_epic/great library night/G_GreatLibrary_B2Orrery_Night.jpg |
| no copy | party of two maps/2_Lovecraft/2_Lovecraft_Set03 | 16 | fire emblem based maps/fe forest path with large river.png |
| no copy | party of two maps/2_Lovecraft/2_Lovecraft_Set04 | 13 | generic outdoors/_dice grimorium maps/cliff hanging bridge.jpg |
| no copy | party of two maps/2_Lovecraft/2_Lovecraft_Set06 | 14 | generic outdoors/swamp old ruins.jpg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set01 | 15 | gate:guild:fort:siege/camp/desert camp.jpg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set02 | 14 | generic outdoors/_all/ocean isle 4.jpeg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set03 | 18 | generic outdoors/_dice grimorium maps/forest fountain.jpg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set05 | 13 | generic outdoors/_dice grimorium maps/winter coastal opening.jpg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set07 | 14 | generic outdoors/_dice grimorium maps/forest straight road.jpg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set08 | 18 | in-town : urban/_building : indoors/church 1F - shield.jpg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set09 | 14 | dungeon maps/__dungeon entrances/cliff ambush with lookout spot.jpeg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set10 | 14 | in-town : urban/_building : indoors/royal throne room.jpeg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set11 | 13 | dungeon maps/_aquatic/sunken ruins.jpeg |
| no copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set12 | 14 | in-town : urban/_building : indoors/royal throne room.jpeg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set01 | 12 | generic outdoors/feywild enchanted underwater boot.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set02 | 16 | dungeon maps/_epic/drow manor/G_DrowManor_BallRoom.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set03 | 16 | dungeon maps/_epic/drow manor/G_DrowManor_BallRoom.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set04 | 13 | dungeon maps/_epic/__zatnikotel-maps/_dragon-lairs/Night/Gold Dragon Entrance NIGHT GRID.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set06 | 13 | gate:guild:fort:siege/fort : castle/forest fort nangalore.webp |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set07 | 18 | dungeon maps/_epic/frost giant tomb.jpeg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set08 | 21 | generic outdoors/_wilderness-dwelling/mountaintop mysterious monastery.jpeg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set09 | 16 | dungeon maps/_epic/necropolis/necropolis 5 - blood altar.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set10 | 18 | in-town : urban/_tavern : inn/temperate tavern casino.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set11 | 12 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridless/GL_MagicWizardTower_NorthBalcony_01.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set13 | 16 | generic outdoors/feywild enchanted underwater boot.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set14 | 14 | in-town : urban/_arena/arena variation 40x28.jpg |
| no copy | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set15 | 12 | generic outdoors/_dice grimorium maps/forest straight road.jpg |
| no copy | party of two maps/2_Steampunk/2_Steampunk_Set01 | 12 | dungeon maps/_epic/buried ziggurat/022-map-2.03-buried-ziggurat-5-player.webp |
| no copy | party of two maps/2_Steampunk/2_Steampunk_Set02 | 14 | in-town : urban/swamp bullywug blue lagoon.jpg |
| no copy | party of two maps/2_Steampunk/2_Steampunk_Set04 | 15 | dungeon maps/_epic/geothermal rift/B3F G_GeothermalRift_GeothermalStation_B3.jpg |
| no copy | party of two maps/2_Steampunk/2_Steampunk_Set05 | 18 | in-town : urban/_arena/multiplanar spirit sumo.webp |
| no copy | party of two maps/2_Steampunk/2_Steampunk_Set06 | 15 | dungeon maps/_dungeon/_dice grimorium maps/Cultist-Cave-Gridded-26x39-Map1.jpg |
| no copy | party of two maps/2_Steampunk/2_Steampunk_Set09 | 13 | generic outdoors/_dice grimorium maps/forest straight road.jpg |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set01 | 16 | dungeon maps/__dungeon entrances/hillsy cave entrance.jpeg |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set02 | 15 | dungeon wonders/mechanical palace primedus.jpg |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set03 | 12 | dungeon maps/_epic/great library day/G_GreatLibrary_B2Orrery_Day.jpg |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set07 | 18 | dungeon maps/_epic/tomb of amun-sa/080-map-5.02-maze-of-mists-map-player.webp |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set08 | 14 | dungeon maps/__dungeon entrances/forest cave and gates.jpg |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set09 | 15 | generic outdoors/_wilderness-dwelling/swamp giant pumpkin 32x24.jpg |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set10 | 12 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridded/G_MagicWizardTower_NorthBalcony_03.jpg |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set11 | 17 | in-town : urban/desert wall between common folk and nobility.jpeg |
| no copy | party of two maps/2_Undermountain/2_Undermountain_Set14 | 12 | dungeon maps/_cave : lava/_dice grimorium maps/Maze-1.jpg |
| no copy | party of two maps/5_Airborne/5_AIrborne_Set01 | 14 | generic outdoors/_wilderness-dwelling/swamp giant pumpkin 32x24.jpg |
| no copy | party of two maps/5_Airborne/5_AIrborne_Set02 | 17 | generic outdoors/cliff goblin bridge graffiti.jpg |
| no copy | party of two maps/5_Airborne/5_Airborne_Set03 | 14 | gate:guild:fort:siege/fort : castle/forest castle assaulted by mysterious assailants.jpeg |
| no copy | party of two maps/5_Airborne/5_Airborne_Set04 | 16 | dungeon maps/_cave : lava/cavern insect:mushroom lair with difficult terrain.jpeg |
| no copy | party of two maps/5_Aztec/5_Aztec_Ext_Set04 | 12 | dungeon maps/_epic/shadowfell fortress/G_ShadowfellFortressInterior_Floor_B1.jpg |
| no copy | party of two maps/5_Aztec/5_Aztec_Ext_Set05 | 14 | dungeon maps/_epic/shadowfell fortress/G_ShadowfellFortressInterior_Floor_2.jpg |
| no copy | party of two maps/5_Aztec/5_Aztec_Ext_Set06 | 14 | dungeon maps/_epic/tomb of annihilation/tomb of annihilation level 6.webp |
| no copy | party of two maps/5_Aztec/5_Aztec_Ext_Set08 | 16 | generic outdoors/_dice grimorium maps/temperate river.jpg |
| no copy | party of two maps/5_Aztec/5_Aztec_Ext_Set09 | 12 | dungeon maps/_epic/geothermal rift/B3F G_GeothermalRift_GeothermalStation_B3.jpg |
| no copy | party of two maps/5_Aztec/5_Aztec_Ext_Set10 | 12 | in-town : urban/_building : indoors/royal public bath battle.jpeg |
| no copy | party of two maps/5_Aztec/5_Aztec_Ext_Set11 | 13 | dungeon maps/__tutorial/desert small cathedral dungeon.jpeg |
| no copy | party of two maps/5_Dungeon/5_Dungeon_Set02 | 12 | dungeon maps/_epic/drow manor/G_DrowManor_BallRoom.jpg |
| no copy | party of two maps/5_Dungeon/5_Dungeon_Set08 | 14 | dungeon maps/_dungeon/fane of the night serpent.webp |
| no copy | party of two maps/5_Feywild/5_Feywild_Set02 | 15 | in-town : urban/_dice grimorium maps/ForestVillage-1.jpg |
| no copy | party of two maps/5_Feywild/5_Feywild_Set03 | 13 | dungeon maps/_epic/drow manor/G_DrowManor_JadeSpiderFrontEntrance.jpg |
| no copy | party of two maps/5_Feywild/5_Feywild_Set04 | 15 | dungeon wonders/mechanical palace primedus.jpg |
| no copy | party of two maps/5_Feywild/5_Feywild_Set05 | 12 | in-town : urban/_tavern : inn/desert wild west saloon dust storm 1F.jpg |
| no copy | party of two maps/5_Mansion/5_Mansion_Set02 | 13 | dungeon maps/__tutorial/desert small cathedral dungeon.jpeg |
| no copy | party of two maps/5_Mansion/5_Mansion_Set03 | 12 | dungeon maps/_epic/geothermal rift/G_GeothermalRift_TheSummoning_NoMonsters_B4.jpg |
| no copy | party of two maps/5_PortTown/5_PortTown_Set01 | 17 | generic outdoors/_dice grimorium maps/temperate riverside forest with cliff.jpg |
| no copy | party of two maps/5_PortTown/5_PortTown_Set02 | 16 | dungeon maps/_epic/great library day/G_GreatLibrary_B6ForbiddenLibrary_Day.jpg |
| no copy | party of two maps/5_PortTown/5_PortTown_Set04 | 17 | generic outdoors/_all/desert mound with cliffs.jpeg |
| no copy | party of two maps/5_PortTown/5_PortTown_Set06 | 13 | dungeon maps/_epic/buried ziggurat/022-map-2.03-buried-ziggurat-5-player.webp |
| no copy | party of two maps/5_PortTown/5_PortTown_Set07 | 12 | in-town : urban/_building : indoors/royal public bath battle.jpeg |
| no copy | party of two maps/5_PortTown/5_PortTown_Set08 | 14 | in-town : urban/_arena/hillsy arena 1.jpg |
| no copy | party of two maps/5_Underdark/5_Underdark_Set02 | 13 | dungeon maps/_aquatic/sunken ruins.jpeg |
| no copy | party of two maps/5_Underdark/5_Underdark_Set04 | 14 | in-town : urban/coastal colossus port construction site.jpg |
| no copy | party of two maps/5_Underdark/5_Underdark_Set05 | 12 | dungeon maps/_epic/drow manor/G_DrowManor_BallRoom.jpg |
| no copy | party of two maps/5_Underdark/5_Underdark_Set06 | 16 | gate:guild:fort:siege/camp/arctic camp.jpg |
| no copy | party of two maps/5_Woods/5_Woods_Set01 | 13 | gate:guild:fort:siege/camp/desert camp.jpg |
| no copy | party of two maps/5_Woods/5_Woods_Set02 | 13 | dungeon maps/_epic/great library day/G_GreatLibrary_B6ForbiddenLibrary_Day.jpg |
| no copy | party of two maps/5_Woods/5_Woods_Set03 | 15 | fire emblem based maps/fe merchant city port.png |
| no copy | party of two maps/5_Woods/5_Woods_Set04 | 15 | fire emblem based maps/fe dry prosperous coastal city.png |
| no copy | party of two maps/5_Woods/5_Woods_Set05 | 13 | gate:guild:fort:siege/camp/temperate camp yellyark.webp |
| no copy | party of two maps/5_Woods/5_Woods_Set06 | 17 | in-town : urban/_arena/hillsy arena 1.jpg |
| unsure | czepeku maps backup/originals/Airships! [Various] - $5 Rewards Pt. 2 | 11 | in-town : urban/_boat : airship/airship original.jpg |
| unsure | czepeku maps backup/originals/Chaos at the Coral Court Adventure | 11 | generic outdoors/_open-ocean/G_OpenOcean_DesertIsland2.jpg |
| unsure | czepeku maps backup/originals/Giant Kitchen [105x22] - $5 Rewards Pt. 2 | 10 | generic outdoors/_open-ocean/G_OpenOcean_BloodSea.jpg |
| unsure | czepeku maps backup/originals/Open Ocean [50x50] - $5 Rewards (Tokens) | 11 | dungeon maps/_epic/__zatnikotel-maps/_dragon-lairs/Night/Blue Dragon Entrance NIGHT.jpg |
| unsure | party of two maps/2_Battlefields/2_Battlefields_Set5 | 9 | in-town : urban/swamp bullywug blue lagoon.jpg |
| unsure | party of two maps/2_City/2_City_Set01 | 10 | dungeon wonders/_planar : space/planar eldritch church outsider.jpg |
| unsure | party of two maps/2_City/2_City_Set12 | 9 | dungeon maps/_epic/great library night/G_GreatLibrary_B2OrreryShadowPlanets_Night.jpg |
| unsure | party of two maps/2_City/2_City_Set14 | 11 | dungeon maps/_epic/shadowfell fortress/G_ShadowfellFortressInterior_Floor_B1.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set1 | 9 | dungeon maps/_epic/infinite wizards tower/Interior Rooms/Gridless/GL_MagicWizardTower_InteriorFloor_59.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set2 | 9 | dungeon maps/_epic/infinite wizards tower/Interior Rooms/Gridless/GL_MagicWizardTower_InteriorFloor_59.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set3 | 9 | dungeon maps/_epic/infinite wizards tower/Interior Rooms/Gridless/GL_MagicWizardTower_InteriorFloor_59.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set4 | 9 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridded/G_MagicWizardTower_NorthBalcony_01.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set5 | 9 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridded/G_MagicWizardTower_NorthBalcony_01.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set6 | 9 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridded/G_MagicWizardTower_NorthBalcony_01.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set7 | 10 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridded/G_MagicWizardTower_NorthBalcony_01.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set8 | 10 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridded/G_MagicWizardTower_NorthBalcony_01.jpg |
| unsure | party of two maps/2_CityofTowers/2_CoT_Set9 | 10 | in-town : urban/_boat : airship/airship original.jpg |
| unsure | party of two maps/2_Desert/2_Desert_Set01 | 11 | dungeon maps/_epic/shadowfell fortress/G_ShadowfellFortressInterior_Floor_B1.jpg |
| unsure | party of two maps/2_Lovecraft/2_Lovecraft_Set01 | 9 | generic outdoors/_dice grimorium maps/forest straight road.jpg |
| unsure | party of two maps/2_Lovecraft/2_Lovecraft_Set05 | 10 | dungeon maps/__tutorial/desert small cathedral dungeon.jpeg |
| unsure | party of two maps/2_MagicalForest/2_Magical_Forest_Set06 | 10 | dungeon wonders/_planar : space/planar gauntlet island.jpg |
| unsure | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set05 | 9 | dungeon maps/_epic/drow manor/G_DrowManor_BallRoom.jpg |
| unsure | party of two maps/2_RadiantCitadel/2_RadiantCitadel_Set12 | 9 | dungeon maps/_epic/great library day/G_GreatLibrary_B5VioletStudy_Day.jpg |
| unsure | party of two maps/2_Steampunk/2_Steampunk_Set03 | 9 | dungeon maps/_epic/drow manor/G_DrowManor_JadeSpiderFrontEntrance.jpg |
| unsure | party of two maps/2_Steampunk/2_Steampunk_Set07 | 10 | generic outdoors/temperate ancient castle ruins - wood elf ambush.jpeg |
| unsure | party of two maps/2_Steampunk/2_Steampunk_Set08 | 10 | dungeon maps/_epic/geothermal rift/G_GeothermalRift_BrassCity_B4.jpg |
| unsure | party of two maps/2_Undermountain/2_Undermountain_Set04 | 9 | in-town : urban/_dice grimorium maps/GraveyardOverlook-1.jpg |
| unsure | party of two maps/2_Undermountain/2_Undermountain_Set05 | 11 | generic outdoors/_dice grimorium maps/forest straight road.jpg |
| unsure | party of two maps/2_Undermountain/2_Undermountain_Set06 | 11 | in-town : urban/_arena/arena2 by zatnikotel.jpg |
| unsure | party of two maps/2_Undermountain/2_Undermountain_Set12 | 11 | dungeon maps/_desert/desert minotaur labyrinth.jpg |
| unsure | party of two maps/2_Undermountain/2_Undermountain_Set13 | 10 | dungeon maps/_epic/infinite wizards tower/Ground Floor/Gridless/GL_MagicWizardTower_GroundFloor_05.jpg |
| unsure | party of two maps/2_Undermountain/2_Undermountain_Set15 | 10 | dungeon maps/_epic/gauntlet of the lich.jpeg |
| unsure | party of two maps/5_Aztec/5_Aztec_Ext_Set01 | 9 | dungeon maps/_epic/infinite wizards tower/Ground Floor/Gridless/GL_MagicWizardTower_GroundFloor_01.jpg |
| unsure | party of two maps/5_Aztec/5_Aztec_Ext_Set02 | 9 | dungeon maps/_epic/infinite wizards tower/Ground Floor/Gridless/GL_MagicWizardTower_GroundFloor_01.jpg |
| unsure | party of two maps/5_Aztec/5_Aztec_Ext_Set03 | 9 | dungeon maps/_epic/infinite wizards tower/Ground Floor/Gridless/GL_MagicWizardTower_GroundFloor_01.jpg |
| unsure | party of two maps/5_Aztec/5_Aztec_Ext_Set07 | 10 | gate:guild:fort:siege/gate : siege/desert wall between common folk and nobility.jpeg |
| unsure | party of two maps/5_Aztec/5_Aztec_Ext_Set12 | 10 | in-town : urban/swamp bullywug blue lagoon.jpg |
| unsure | party of two maps/5_Dungeon/5_Dungeon_Set01 | 11 | dungeon maps/_cave : lava/_dice grimorium maps/DragonLair-3.jpg |
| unsure | party of two maps/5_Dungeon/5_Dungeon_Set05 | 9 | generic outdoors/_dice grimorium maps/forest straight road.jpg |
| unsure | party of two maps/5_Dungeon/5_Dungeon_Set06 | 10 | dungeon maps/_cave : lava/_dice grimorium maps/Maze-1.jpg |
| unsure | party of two maps/5_Dungeon/5_Dungeon_Set07 | 10 | dungeon maps/_epic/__zatnikotel-maps/_dragon-lairs/Night/Blue Dragon Entrance NIGHT GRID.jpg |
| unsure | party of two maps/5_Mansion/5_Mansion_Set01 | 9 | dungeon maps/_aquatic/shark cave.jpg |
| unsure | party of two maps/5_Mansion/5_Mansion_Set04 | 11 | dungeon maps/_epic/couatl pyramid/G_CouatlInterior_Floor1.jpg |
| unsure | party of two maps/5_Underdark/5_Underdark_Set01 | 11 | dungeon wonders/nevermelting iceblock.jpeg |
| has copy | czepeku maps backup/originals/Abandoned Mine Entrance [33x21] - $5 Rewards | 0 | gate:guild:fort:siege/gate : siege/cliff abandoned mine entrance.jpg |
| has copy | czepeku maps backup/originals/Adventurer's Guildhall [33x24] - $5 Rewards | 0 | gate:guild:fort:siege/guild/temperate adventurer's guildhall with fortifications.jpeg |
| has copy | czepeku maps backup/originals/Airships! [Various] - $5 Rewards Pt. 1 | 0 | in-town : urban/_boat : airship/airship pirate.jpg |
| has copy | czepeku maps backup/originals/Ancient Battlefield [25x45] - $5 Rewards | 0 | generic outdoors/elven swamp ancient battle field.jpg |
| has copy | czepeku maps backup/originals/Ancient Hydra Lair [50x50] - $5 Rewards | 0 | dungeon maps/_desert/cave desert hydra lair.jpg |
| has copy | czepeku maps backup/originals/Ancient Wizards Lair [35x35] - $5 Rewards | 0 | dungeon wonders/_planar : space/planar ancient wizard lair - original.jpg |
| has copy | czepeku maps backup/originals/Antlion Canyon [14x32] - $5 Rewards | 0 | generic outdoors/desert antlion canyon.jpeg |
| has copy | czepeku maps backup/originals/Astral Plane [70x48] - $5 Rewards | 0 | dungeon wonders/_planar : space/astral plane defeated god.jpg |
| has copy | czepeku maps backup/originals/Baba Yaga's Domain [26x43] - $5 Rewards | 0 | generic outdoors/_wilderness-dwelling/forest baba yaga hut.jpg |
| has copy | czepeku maps backup/originals/Black Dragon Lair [41x45] - $5 Rewards - Gridded | 0 | dungeon maps/__dungeon entrances/swamp black dragon lair.jpg |
| has copy | czepeku maps backup/originals/Black Dragon Lair [41x45] - $5 Rewards - Gridless | 0 | dungeon maps/__dungeon entrances/swamp black dragon lair.jpg |
| has copy | czepeku maps backup/originals/Blue Dragon Lair [34x62] - $5 Rewards | 0 | dungeon maps/__dungeon entrances/arctic blue dragon lair.jpg |
| has copy | czepeku maps backup/originals/Bridge Town [39x56] - $5 Rewards (Gridded) | 0 | in-town : urban/temperate bridge town.jpg |
| has copy | czepeku maps backup/originals/Bridge Town [39x56] - $5 Rewards (Gridless) | 0 | in-town : urban/oriental cliff bridge town.jpg |
| has copy | czepeku maps backup/originals/Bullywug Swamp [51x45] - $5 Rewards Pt.1 | 0 | in-town : urban/swamp bullywug blue lagoon.jpg |
| has copy | czepeku maps backup/originals/Bullywug Swamp [51x45] - $5 Rewards Pt.2 | 0 | in-town : urban/swamp bullywug blue lagoon.jpg |
| has copy | czepeku maps backup/originals/Cavern of the Venom Queen [35x50] - $5 Rewards | 0 | dungeon maps/_cave : lava/spider cavern of the venom queen.jpg |
| has copy | czepeku maps backup/originals/Celestial Realm [32x45] - $5 Rewards | 0 | dungeon wonders/_planar : space/celestial realm portal.jpg |
| has copy | czepeku maps backup/originals/City Marketplace [23x36] - $5 Rewards | 0 | gate:guild:fort:siege/gate : siege/desert wall between common folk and nobility.jpeg |
| has copy | czepeku maps backup/originals/City Rooftop Chase [16x50] - $5 Rewards | 0 | in-town : urban/desert rooftop chase.jpg |
| has copy | czepeku maps backup/originals/City Streets [Various] - $5 Rewards Pt. 1 | 0 | in-town : urban/_building : indoors/_stores/plantie's food shop.jpg |
| has copy | czepeku maps backup/originals/City Streets [Various] - $5 Rewards Pt. 2 | 5 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridded/G_MagicWizardTower_NorthBalcony_01.jpg |
| has copy | czepeku maps backup/originals/Colosseum of Challenges [43x28] - $5 Rewards | 0 | in-town : urban/_arena/desert gladiatorial arena.jpeg |
| has copy | czepeku maps backup/originals/Colossus Port [70x108]- $5 Rewards (Gridded Pt.1) | 0 | in-town : urban/coastal colossus port blue sea.jpg |
| has copy | czepeku maps backup/originals/Colossus Port [70x108]- $5 Rewards (Gridded Pt.2) | 4 | in-town : urban/coastal colossus port blue sea full.jpg |
| has copy | czepeku maps backup/originals/Colossus Port [70x108]- $5 Rewards (Gridless Pt.1) | 0 | in-town : urban/coastal colossus port blue sea full.jpg |
| has copy | czepeku maps backup/originals/Colossus Port [70x108]- $5 Rewards (Gridless Pt.2) | 4 | in-town : urban/coastal colossus port blue sea full.jpg |
| has copy | czepeku maps backup/originals/Coral Throne [29x44] - $5 Rewards  | 0 | dungeon maps/__dungeon entrances/aquatic merfolk tomb entrance.jpeg |
| has copy | czepeku maps backup/originals/Couatl Exterior [27x57] - $5 Rewards | 0 | dungeon maps/__dungeon entrances/swamp ziggurat grand temple entrance.jpeg |
| has copy | czepeku maps backup/originals/Couatl Interior [Various] - $5 Rewards | 0 | dungeon maps/_epic/couatl pyramid/G_CouatlInterior_BossRoom_Cosmic.jpg |
| has copy | czepeku maps backup/originals/Crossroads [26x39] - $5 Rewards | 0 | generic outdoors/_all/temperate crossroads 2.jpg |
| has copy | czepeku maps backup/originals/Depths of the Festerwood [25x45] - $5 Rewards | 0 | generic outdoors/swamp festerwood meadows.jpg |
| has copy | czepeku maps backup/originals/Desert Canyon [41x57] - $5 Rewards (Gridded) | 0 | in-town : urban/desert canyon coal station.jpg |
| has copy | czepeku maps backup/originals/Desert Canyon [41x57] - $5 Rewards (Gridless) | 0 | in-town : urban/desert canyon coal station.jpg |
| has copy | czepeku maps backup/originals/Drakescale Peak [35x50] - $5 Rewards | 0 | dungeon maps/_cave : lava/lava drakescale peak.jpg |
| has copy | czepeku maps backup/originals/Drow Manor [Various] - $5 Rewards | 0 | dungeon maps/_epic/drow manor/G_DrowManor_Bedroom.jpg |
| has copy | czepeku maps backup/originals/Eldritch Church [26x57] - $5 Rewards Pt.1 | 0 | dungeon wonders/_planar : space/planar eldritch church chaos.jpg |
| has copy | czepeku maps backup/originals/Eldritch Church [26x57] - $5 Rewards Pt.2 | 0 | dungeon wonders/_planar : space/planar eldritch church.jpg |
| has copy | czepeku maps backup/originals/Fey Village [23x28] - $5 Rewards | 0 | in-town : urban/feywild great tree throne.jpg |
| has copy | czepeku maps backup/originals/Floating Sky Castle [24x35] - $5 Rewards | 0 | dungeon maps/_epic/floating castle/1F G_FloatingCastle_OriginalServantsQuaters_Day.jpg |
| has copy | czepeku maps backup/originals/Forest Shrine Festival [43x73] - $5 Rewards (Gridded Pt.1) | 0 | in-town : urban/oriental forest shrine festival.jpg |
| has copy | czepeku maps backup/originals/Forest Shrine Festival [43x73] - $5 Rewards (Gridded Pt.2) | 0 | in-town : urban/oriental forest shrine festival.jpg |
| has copy | czepeku maps backup/originals/Forest Shrine Festival [43x73] - $5 Rewards (Gridless Pt.1) | 0 | in-town : urban/oriental forest shrine festival.jpg |
| has copy | czepeku maps backup/originals/Forest Shrine Festival [43x73] - $5 Rewards (Gridless Pt.2) | 1 | in-town : urban/oriental forest shrine.jpg |
| has copy | czepeku maps backup/originals/Giant Kitchen [105x22] - $5 Rewards Pt. 1 | 0 | gate:guild:fort:siege/fort : castle/mountaintop giant kitchen table.jpg |
| has copy | czepeku maps backup/originals/Goblin Bridge [37x20] - $5 Rewards | 0 | generic outdoors/cliff goblin bridge graffiti.jpg |
| has copy | czepeku maps backup/originals/Grand Opera House [42x79] - $5 Rewards (Gridded) | 0 | in-town : urban/_building : indoors/royal grand opera house auction.jpg |
| has copy | czepeku maps backup/originals/Grand Opera House [42x79] - $5 Rewards (Gridless) | 2 | in-town : urban/_building : indoors/royal grand opera house auction.jpg |
| has copy | czepeku maps backup/originals/Green Dragon Lair [24x54] - $5 Rewards | 0 | dungeon maps/__dungeon entrances/forest green dragon lair.jpg |
| has copy | czepeku maps backup/originals/Grounded Castle [24x35] - $5 Rewards | 5 | dungeon maps/_epic/floating castle/4F G_FloatingCastle_KingsRoom_Day.jpg |
| has copy | czepeku maps backup/originals/Harpy Cove [34x51] - $5 Rewards (Gridded) | 0 | generic outdoors/cliff dark harpy cove.jpeg |
| has copy | czepeku maps backup/originals/Harpy Cove [34x51] - $5 Rewards (Gridless) | 0 | generic outdoors/cliff dark harpy cove.jpeg |
| has copy | czepeku maps backup/originals/Hell's Tax Office [21x37] - $5 Rewards  | 0 | dungeon wonders/_planar : space/hell's tax office.jpg |
| has copy | czepeku maps backup/originals/Impact Site [36x50] - $5 Rewards - Gridded | 0 | generic outdoors/_wilderness-dwelling/farm airship crash impact site.jpg |
| has copy | czepeku maps backup/originals/Impact Site [36x50] - $5 Rewards - Gridless | 0 | generic outdoors/_wilderness-dwelling/farm airship crash impact site.jpg |
| has copy | czepeku maps backup/originals/Inside a Bag of Holding [55x55] - $5 Rewards | 0 | dungeon wonders/_planar : space/bag of holding.jpg |
| has copy | czepeku maps backup/originals/Island Fort [35x35] - $5 Rewards | 0 | generic outdoors/ocean temperate island.jpg |
| has copy | czepeku maps backup/originals/Japanese Bathhouse [16x43] - $5 Rewards | 0 | in-town : urban/oriental luxury hot springs.jpg |
| has copy | czepeku maps backup/originals/Lair of the Beholder God [29x30] - $5 Rewards | 0 | dungeon wonders/_planar : space/planar lair of the beholder god.jpg |
| has copy | czepeku maps backup/originals/Lair of the Illithids [23x42] - $5 Rewards | 0 | dungeon wonders/_planar : space/planar lair of the illithids - psionic blast.jpg |
| has copy | czepeku maps backup/originals/Land of Giants [18x27] - $5 Rewards | 0 | generic outdoors/forest land of giants river.jpg |
| has copy | czepeku maps backup/originals/Lightning Rail Part 2 - $5 Rewards | 0 | in-town : urban/_lightning train/G_LightningRail_PostalCar.png |
| has copy | czepeku maps backup/originals/Lightning Rail [5x14] - $5 Rewards | 0 | in-town : urban/_lightning train/G_LightningRail_EngineCar.png |
| has copy | czepeku maps backup/originals/Magic Wizard's Tower [7x7] - $5 Rewards | 0 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridless/GL_MagicWizardTower_NorthBalcony_02.jpg |
| has copy | czepeku maps backup/originals/Mechanical Palace [26x42] - $5 Rewards | 0 | dungeon wonders/mechanical palace dark primus.jpg |
| has copy | czepeku maps backup/originals/Medusas Wake [32x47] - $5 Rewards | 0 | dungeon maps/__dungeon entrances/temperate medusa's wake cave.jpg |
| has copy | czepeku maps backup/originals/Merfolk Marina [33x49] - $5 Rewards | 0 | in-town : urban/aquatic mermaid marina no grid.jpg |
| has copy | czepeku maps backup/originals/Mid-Air Dragon Flight [45x45] - $5 Rewards | 0 | generic outdoors/_open-sky/GL_DragonMidFlight_CloudSky_02_Day.jpg |
| has copy | czepeku maps backup/originals/Minotaur Labyrinth [26x50] - $5 Rewards | 0 | dungeon maps/_desert/desert minotaur labyrinth.jpg |
| has copy | czepeku maps backup/originals/Monster Festival [26x42] - $5 Rewards | 0 | in-town : urban/forest monster festival.jpeg |
| has copy | czepeku maps backup/originals/Mountain Monastery [18x31] - $5 Rewards | 0 | generic outdoors/_all/mountaintop monastery.jpg |
| has copy | czepeku maps backup/originals/Mountaintop Altar [23x36] - $5 Rewards | 0 | dungeon wonders/mountaintop with sacred sword.jpeg |
| has copy | czepeku maps backup/originals/Mountaintop Observatory - $5 Rewards (Gridded Pt.1) | 0 | dungeon wonders/mountaintop with cosmic dragon.jpg |
| has copy | czepeku maps backup/originals/Mountaintop Observatory - $5 Rewards (Gridded Pt.2) | 0 | generic outdoors/_wilderness-dwelling/mountaintop observatory.jpg |
| has copy | czepeku maps backup/originals/Mountaintop Observatory - $5 Rewards (Gridless Pt.1) | 0 | gate:guild:fort:siege/camp/mountain top camp.jpg |
| has copy | czepeku maps backup/originals/Mountaintop Observatory - $5 Rewards (Gridless Pt.2) | 0 | dungeon maps/__dungeon entrances/mountaintop observatory.jpeg |
| has copy | czepeku maps backup/originals/Necropolis Dungeon [Various] - $5 Rewards | 0 | dungeon maps/_epic/necropolis/necropolis 4 - abandoned tomb.jpg |
| has copy | czepeku maps backup/originals/Necropolis Entrance [32x56] - $5 Rewards (Gridded) | 0 | dungeon maps/_epic/necropolis/necropolis 1 - entrance.jpeg |
| has copy | czepeku maps backup/originals/Necropolis Entrance [32x56] - $5 Rewards (Gridless) | 1 | dungeon maps/_epic/necropolis/necropolis 1 - entrance.jpeg |
| has copy | czepeku maps backup/originals/Oasis City [47x66] - $5 Rewards (Gridded) | 0 | gate:guild:fort:siege/gate : siege/desert town gate.jpeg |
| has copy | czepeku maps backup/originals/Oasis City [47x66] - $5 Rewards (Gridless) | 1 | gate:guild:fort:siege/gate : siege/desert town gate.jpeg |
| has copy | czepeku maps backup/originals/Ogre Queen Feast [40x50] - $5 Rewards | 0 | gate:guild:fort:siege/fort : castle/forest castle assaulted by mysterious assailants.jpeg |
| has copy | czepeku maps backup/originals/Open Ocean [50x50] - $5 Rewards (Gridded) | 0 | generic outdoors/_open-ocean/G_OpenOcean_LookoutTowers_Night.jpg |
| has copy | czepeku maps backup/originals/Open Ocean [50x50] - $5 Rewards (Gridless) | 0 | generic outdoors/_open-ocean/G_OpenOcean_RocNestIslandEggs_Day.jpg |
| has copy | czepeku maps backup/originals/Opulent Ballroom [32x58] - $5 Rewards | 0 | in-town : urban/_arena/rich ballroom.jpg |
| has copy | czepeku maps backup/originals/Overgrown Magic Forest [27x41] - $5 Rewards | 0 | gate:guild:fort:siege/camp/forest magic deep pond.jpg |
| has copy | czepeku maps backup/originals/Pharaoh's Tomb [25x76] - $5 Rewards  | 0 | dungeon maps/_desert/pharaohs tomb.jpg |
| has copy | czepeku maps backup/originals/Pirate Tavern [27x36] - $5 Rewards | 0 | gate:guild:fort:siege/guild/coastal rich pirate tavern.jpeg |
| has copy | czepeku maps backup/originals/Plague Hospital [24x52] - $5 Rewards  | 0 | in-town : urban/_building : indoors/plague hospital.jpg |
| has copy | czepeku maps backup/originals/Pseudodragon Lair [46x61] - $5 Rewards (Gridded) | 0 | gate:guild:fort:siege/guild/temperate pseudo dragon lair underground.jpg |
| has copy | czepeku maps backup/originals/Pseudodragon Lair [46x61] - $5 Rewards (Gridless) | 2 | gate:guild:fort:siege/guild/temperate pseudo dragon lair.jpg |
| has copy | czepeku maps backup/originals/Realm of Dreams [30x30] - $5 Rewards | 6 | dungeon maps/_epic/infinite wizards tower/North Balcony/Gridded/G_MagicWizardTower_NorthBalcony_01.jpg |
| has copy | czepeku maps backup/originals/Remote Ice Village [30x30] - $5 Rewards | 0 | in-town : urban/arctic igloo village.jpg |
| has copy | czepeku maps backup/originals/Royal Throne Room [17x48] - $5 Rewards | 0 | in-town : urban/_building : indoors/royal throne room.jpeg |
| has copy | czepeku maps backup/originals/Serene Lakeside [21x32] - $5 Rewards | 0 | generic outdoors/_wilderness-dwelling/swamp witch coven lakeside.jpg |
| has copy | czepeku maps backup/originals/Shadowfell Fortress Interior [42x59] - $5 Rewards | 0 | dungeon maps/_epic/shadowfell fortress/G_ShadowfellFortressInterior_Floor_2.jpg |
| has copy | czepeku maps backup/originals/Shadowfell Fortress [26x67] - $5 Rewards | 0 | gate:guild:fort:siege/gate : siege/planar shadow fell fortress barricades.jpg |
| has copy | czepeku maps backup/originals/Steampunk Warforged Factory [33x41] - $5 Rewards | 0 | gate:guild:fort:siege/guild/desert warforged factory.jpg |
| has copy | czepeku maps backup/originals/The Great Library [Various] - $5 Rewards | 0 | dungeon maps/_epic/great library day/G_GreatLibrary_B1ChronoRoom_Day.jpg |
| has copy | czepeku maps backup/originals/The Stranded Casino [42x23] - $5 Rewards | 0 | in-town : urban/_boat : airship/pirate forest stranded casino ship/1-2F G_TheStrandedCasino_Original.jpg |
| has copy | czepeku maps backup/originals/Train Station Platform [36x71] - $5 Rewards (Gridded) | 0 | in-town : urban/_building : indoors/royal train station platforms 2F.jpg |
| has copy | czepeku maps backup/originals/Train Station Platform [36x71] - $5 Rewards (Gridless) | 1 | in-town : urban/_building : indoors/royal train station platforms 1F.jpg |
| has copy | czepeku maps backup/originals/Vampire Mansion [35x26] - $5 Rewards | 0 | gate:guild:fort:siege/fort : castle/temperate vampire mansion basement.jpg |
| has copy | czepeku maps backup/originals/Warforged Titan Scrapyard [22x48] - $5 Rewards | 0 | gate:guild:fort:siege/camp/temperate warforged titan scrapyard bazaar.jpg |
| has copy | czepeku maps backup/originals/Wild West Saloon [21x35] - $5 Rewards | 0 | in-town : urban/_tavern : inn/desert wild west saloon dust storm 1F.jpg |
| has copy | czepeku maps backup/originals/Windmill Farm [31x46] - $5 Rewards | 0 | generic outdoors/_wilderness-dwelling/farm windmill.jpg |
| has copy | czepeku maps backup/originals/Zen Monastery [21x49] - $5 Rewards | 0 | generic outdoors/oriental tropical zen monastery.jpg |
| has copy | party of two maps/2_Battlefields/2_Battlefields_Set2 | 8 | dungeon maps/_epic/infinite wizards tower/Interior Rooms/Gridless/GL_MagicWizardTower_InteriorFloor_52.jpg |
| has copy | party of two maps/2_MagicalForest/2_Magical_Forest_Set04 | 8 | in-town : urban/swamp bullywug blue lagoon.jpg |
| has copy | party of two maps/5_Dungeon/5_Dungeon_Set03 | 5 | generic outdoors/_open-ocean/G_OpenOcean_Krakenstorm.jpg |
| has copy | party of two maps/5_Dungeon/5_Dungeon_Set04 | 8 | dungeon maps/_epic/geothermal rift/G_GeothermalRift_BrassCity_B4.jpg |
| has copy | party of two maps/5_Dungeon/5_Dungeon_Set09 | 5 | generic outdoors/_open-ocean/_variants/G_OpenOcean_Kraken_Night.jpg |
| has copy | party of two maps/5_Feywild/5_Feywild_Set01 | 7 | dungeon maps/_epic/geothermal rift/G_GeothermalRift_BrassCity_B4.jpg |
| has copy | party of two maps/5_Feywild/5_Feywild_Set06 | 8 | generic outdoors/swamp old ruins.jpg |
| has copy | party of two maps/5_PortTown/5_PortTown_Set03 | 0 | in-town : urban/_boat : airship/pirate ship.jpg |
| has copy | party of two maps/5_PortTown/5_PortTown_Set05 | 0 | in-town : urban/_boat : airship/junk boarding.jpg |
| has copy | party of two maps/5_Underdark/5_Underdark_Set03 | 3 | in-town : urban/underground magical city street.jpeg |
