import { byCodeUnit, type Content } from '../content/build'
import { MAX_DC, MIN_DC } from '../schema/types'
import type { GameState } from '../schema/state'
import { formatModifier } from './format'
import { TIER_TONE, appendLog } from './log'
import { generateParty } from './party'
import { previewCheck, type CheckPreview } from './preview'
import { createRng } from './rng'
import { stepEncounter, type EncounterAction } from './encounters/run'
import { CURRENT_SAVE_VERSION } from './save'
import { statLabel, type CheckStat } from './rules/abilities'
import { chooseActor } from './rules/character'
import { TIER_LABELS, normalizeDc, rollCheck, type RollMode } from './rules/checks'
import { stepTravel, type TravelAction } from './travel/journey'
import { observe, stepTrade, type TradeAction } from './economy/trade'
import { useService, type ServiceUse } from './town/services'
import { buyAnimal, sellAnimal } from './town/animals'
import { buyUpgrade, type BuyUpgrade } from './town/upgrades'
import { listenRumours } from './town/rumours'
import { expireContracts, stepContract, voidBounties, type ContractAction } from './town/contracts'
import { provision, type ProvisionFor } from './town/provision'
import { autoRest } from './town/arrival'
import { stepRecruit, type RecruitAction } from './town/recruits'
import { startingGoods } from './travel/supplies'
import { generateWorld, startingSettlement, worldSeed, type StartMode } from './world/generate'
import { explore, forgetExplored, siteActions, visitPoi, type SiteAction } from './world/explore'
import { settlementName } from './world/geo'
import { siteEvents } from './world/sites'
import { acknowledgeLevelUps, applyLevelUps } from './rules/progression'
import { keepLowSpell, mournTheDead } from './town/camaraderie'
import { stepAccessory, type AccessoryAction } from './gear/accessories'
import { gather } from './world/gather'
import { placeDungeons } from './world/dungeons'
import { DELVE_ACTIONS, settleDelve, stepDelve, withdraw, type DelveAction } from './world/delve'
import { generateCrisis } from './crisis/generate'
import { acknowledgeEnd, crisisNews } from './crisis/status'
import { DISBANDED_LINE, FALLEN_LINE, partyWiped, runOver } from './crisis/ending'
import { CAMARADERIE_START, STARTING_GOLD, STARTING_PARTY_SIZE } from './constants'

// These moved out so the encounter engine can use them without importing this module.
// Re-exported so existing imports from './state' keep working.
export { MAX_DC, MIN_DC, normalizeDc, previewCheck, type CheckPreview }

export type Action =
  | { type: 'practiceCheck'; stat: CheckStat; dc: number; mode: RollMode; actorId?: string }
  | EncounterAction
  | TravelAction
  | TradeAction
  /** Use a service here: a healer, a temple's blessing, a courier's news (town/services.ts). */
  | ServiceUse
  /** Buy or sell one pack animal, riding animal or cart at an animals service. */
  | { type: 'buyAnimal'; animal: string }
  | { type: 'sellAnimal'; animal: string }
  /** Play one of the situations of the discovered, uncleared POI the party is at. */
  | { type: 'visitPoi' }
  /** Search the domain the party is in for undiscovered POIs (world/explore.ts). */
  | { type: 'explore' }
  /** Buy a round at the tavern and listen for rumours, once per arrival (town/rumours.ts). */
  | { type: 'listenRumours' }
  /** Take, give up or complete a contract from a notice board (town/contracts.ts). */
  | ContractAction
  /** Buy the food and waterskins a road needs at a pace, and fill the water (town/provision.ts). */
  | ({ type: 'provision' } & ProvisionFor)
  /** Rest a day on arrival if hurt or strained: at an inn if affordable (town/arrival.ts). */
  | { type: 'autoRest' }
  /** Hire a recruit offered here, or dismiss a hired member (town/recruits.ts). */
  | RecruitAction
  /** Buy, sell, wear or take off an accessory (gear/accessories.ts). */
  | AccessoryAction
  /** Spend a day gathering a local good with this rule (world/gather.ts gatherOptions). */
  | { type: 'gather'; rule: string }
  /** "Keep playing" after the Crisis is won or lost: dismiss its end screen (crisis/status.ts). */
  | { type: 'acknowledgeEnd' }
  /** The level-up dialog's Continue: the waiting level-ups are seen (rules/progression.ts). */
  | { type: 'acknowledgeLevelUps' }
  /** Press on into a dungeon's next room, or withdraw (world/delve.ts). */
  | DelveAction
  /** Buy the next level of a party upgrade from a service here (town/upgrades.ts). */
  | BuyUpgrade

/**
 * A new party in a freshly rolled world. `start` picks where it begins (design §6): any mainland
 * settlement (the default, designer decision), or a small one in the calmest mainland domain.
 */
export function newGame(
  seed: number,
  content: Content,
  partySize = STARTING_PARTY_SIZE,
  start: StartMode = 'random'
): GameState {
  const [party, rng] = generateParty(createRng(seed), content, partySize)
  // The world draws from its own stream, so it doesn't change the party or later rolls.
  const rolled = generateWorld(worldSeed(seed), content)
  const location = startingSettlement(rolled, content, start)
  // The world's Crisis (crisis/generate.ts): its own stream, so the rest of the world is unchanged.
  const crisis = generateCrisis(rolled, content, { startDay: 1, start: location })
  const withCrisis = crisis?.world ?? rolled
  // The authored dungeons (world/dungeons.ts): their own stream, low ones near the start.
  const dungeons = placeDungeons(withCrisis, content, location)
  const world = { ...withCrisis, pois: { ...withCrisis.pois, ...dungeons } }
  const names = party.map((c) => c.name).join(' and ')
  const from = location ? ` from ${settlementName({ world }, location)}` : ''
  const state: GameState = {
    version: CURRENT_SAVE_VERSION,
    seed,
    rng,
    day: 1,
    party,
    gold: STARTING_GOLD,
    inspiration: 0,
    log: [{ day: 1, text: `${names} set out together${from}.`, tone: 'info' }],
    lastRoll: null,
    encounter: null,
    followUps: [],
    skillUses: [],
    world,
    location,
    visited: false,
    travel: null,
    goods: startingGoods(party.length),
    waterskins: 0,
    markets: {},
    priceBook: {},
    animals: {},
    reputation: { settlements: {}, people: {} },
    contracts: [],
    contractsTaken: [],
    doneHere: [],
    gear: [],
    camaraderie: CAMARADERIE_START,
    lowSpell: null,
    gathered: {},
    recruitsTaken: [],
    explored: [],
    gearTaken: [],
    luckUsed: {},
    crisis: crisis?.crisis ?? null,
    delve: null,
    upgrades: {},
    levelUps: [],
  }
  // The party knows the prices where it starts.
  return location ? observe(state, content, location) : state
}

/**
 * Applies one action. When days pass, the news of the sites the party knows follows: a dungeon or
 * lair cleared by the realm, or one that something has moved into again (world/sites.ts). Then
 * the Crisis's deadline lines (crisis/status.ts). Then bounties whose site the realm emptied are
 * void, and contracts whose deadline has passed fail
 * (town/contracts.ts). Each member who died in the step costs camaraderie, and the low spell runs
 * (a member leaves each week below Fractured's top; town/camaraderie.ts). Then members whose XP
 * passed their level level up (rules/progression.ts). A step that kills the last living member,
 * or brings camaraderie to 0, says so; after that, every action leaves the state as it is
 * (crisis/ending.ts).
 *
 * Level-ups pause the game (designer call 2026-11-14): while any wait in `levelUps`, every action
 * but `acknowledgeLevelUps` leaves the state as it is, so nothing happens behind the level-up
 * dialog (and a later plan's level-up choices are made before play goes on). Saving and loading
 * are not actions, so they still work. A run that ends in the step drops its level-ups.
 */
export function step(state: GameState, action: Action, content: Content): GameState {
  if (action.type === 'acknowledgeLevelUps') return acknowledgeLevelUps(state)
  if (state.levelUps.length > 0) return state
  // A fallen or disbanded party's run is over for good (crisis/ending.ts): nothing more happens.
  if (runOver(state)) return state
  // Anything but a room's choices, pressing on and a few chores leaves a dungeon first.
  const ready =
    state.delve && !state.delve.inRoom && !DELVE_ACTIONS.includes(action.type)
      ? withdraw(state, content)
      : state
  const delved = settleDelve(act(ready, action, content), content)
  const acted = crisisNews(state, siteNews(state.day, delved), content)
  const settled = forgetExplored(state, expireContracts(voidBounties(acted, content), content))
  const done = applyLevelUps(keepLowSpell(mournTheDead(state, settled)))
  // The run's end screen, not a celebration, follows a step that ends it.
  const over = { ...done, levelUps: [] }
  if (partyWiped(done)) return appendLog(over, FALLEN_LINE, 'crit')
  return runOver(done) ? appendLog(over, DISBANDED_LINE, 'crit') : done
}

/**
 * A step for simulated players (travel/trader.ts, travel/wander.ts, the simulations): they read
 * level-ups in the journal, so any the step brings are acknowledged at once.
 */
export const stepPastLevelUps = (state: GameState, action: Action, content: Content): GameState =>
  acknowledgeLevelUps(step(state, action, content))

/** Rumour lines for the known sites whose cycle turned after day `from`. */
function siteNews(from: number, state: GameState): GameState {
  if (state.day <= from) return state
  const lines = Object.entries(state.world.pois)
    .filter(([, poi]) => poi.discovered)
    .flatMap(([id, poi]) =>
      siteEvents(state.world.seed, id, poi, from, state.day).map((e) => ({ ...e, id, poi }))
    )
    .sort((a, b) => a.day - b.day || byCodeUnit(a.id, b.id))
  return lines.reduce((next, { day, kind, poi }) => {
    const kingdom = next.world.kingdoms.find((k) => k.domains.includes(poi.domain))
    // About one in three is an accident: a fire, a flood, a collapse.
    const how =
      kingdom && day % 3 !== 0
        ? `has been cleared out by soldiers of ${kingdom.name}`
        : 'lies empty after a fire and a collapse'
    const text =
      kind === 'inhabited'
        ? `Word reaches you: something has moved into ${poi.name} again.`
        : `Word reaches you: ${poi.name} ${how}.`
    return appendLog(next, text, kind === 'inhabited' ? 'bad' : 'info')
  }, state)
}

function act(state: GameState, action: Action, content: Content): GameState {
  switch (action.type) {
    case 'practiceCheck': {
      const actor = chooseActor(state.party, action.stat, action.actorId)
      if (!actor) return appendLog(state, 'No one is able to act.', 'bad')
      const [roll, rng] = rollCheck(state.rng, actor.modifier, normalizeDc(action.dc), action.mode)
      const name = state.party.find((c) => c.id === actor.characterId)?.name ?? '?'
      const crit = roll.tier === 'critSuccess'
      const next: GameState = {
        ...state,
        rng,
        inspiration: state.inspiration + (crit ? 1 : 0),
        lastRoll: { ...roll, stat: action.stat, actorId: actor.characterId },
      }
      const text =
        `${name} rolls ${statLabel(action.stat)}: ${roll.kept} ${formatModifier(roll.modifier)} = ${roll.total}` +
        ` vs DC ${roll.dc}. ${TIER_LABELS[roll.tier]}.` +
        (crit ? ' Inspiration gained!' : '')
      return appendLog(next, text, TIER_TONE[roll.tier])
    }
    case 'travel':
    case 'continueJourney':
    case 'rest':
    case 'buyWaterskin':
    case 'sellWaterskin':
      return stepTravel(state, action, content)
    case 'buyGoods':
    case 'sellGoods':
    case 'dropGoods':
      return stepTrade(state, action, content)
    case 'useService':
      return useService(state, content, action)
    case 'buyAnimal':
      return buyAnimal(state, content, action.animal)
    case 'sellAnimal':
      return sellAnimal(state, content, action.animal)
    case 'visitPoi':
      return visitPoi(state, content)
    case 'explore':
      return explore(state, content)
    case 'listenRumours':
      return listenRumours(state, content)
    case 'acceptContract':
    case 'abandonContract':
    case 'completeContract':
    case 'sellCargo':
      return stepContract(state, action, content)
    case 'provision':
      return provision(state, content, action)
    case 'autoRest':
      return autoRest(state, content)
    case 'hireRecruit':
    case 'dismissMember':
      return stepRecruit(state, action, content)
    case 'buyAccessory':
    case 'sellAccessory':
    case 'equipAccessory':
    case 'unequipAccessory':
      return stepAccessory(state, action, content)
    case 'gather':
      return gather(state, content, action.rule)
    case 'acknowledgeEnd':
      return acknowledgeEnd(state)
    case 'acknowledgeLevelUps':
      return acknowledgeLevelUps(state)
    case 'pressOn':
    case 'withdraw':
      return stepDelve(state, action, content)
    case 'buyUpgrade':
      return buyUpgrade(state, content, action.upgrade)
    default:
      return stepEncounter(state, action, content)
  }
}

/** Actions offered where the party is, beyond roads and supplies: exploring and visiting sites. */
export const availableActions = (state: GameState, content: Content): SiteAction[] =>
  siteActions(state, content)
