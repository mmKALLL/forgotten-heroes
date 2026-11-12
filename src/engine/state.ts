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
import { startingGoods } from './travel/supplies'
import { generateWorld, startingSettlement, worldSeed, type StartMode } from './world/generate'
import { explore, siteActions, visitPoi, type SiteAction } from './world/explore'
import { settlementName } from './world/geo'
import { siteEvents } from './world/sites'
import { STARTING_GOLD, STARTING_PARTY_SIZE } from './constants'

// These moved out so the encounter engine can use them without importing this module.
// Re-exported so existing imports from './state' keep working.
export { MAX_DC, MIN_DC, normalizeDc, previewCheck, type CheckPreview }

export type Action =
  | { type: 'practiceCheck'; stat: CheckStat; dc: number; mode: RollMode; actorId?: string }
  | EncounterAction
  | TravelAction
  /** Play one of the situations of the discovered, uncleared POI the party is at. */
  | { type: 'visitPoi' }
  /** Search the domain the party is in for undiscovered POIs (world/explore.ts). */
  | { type: 'explore' }

/**
 * A new party in a freshly rolled world. `start` picks where it begins (design §6): a small
 * settlement in the calmest mainland domain, or any mainland settlement.
 */
export function newGame(
  seed: number,
  content: Content,
  partySize = STARTING_PARTY_SIZE,
  start: StartMode = 'calm'
): GameState {
  const [party, rng] = generateParty(createRng(seed), content, partySize)
  // The world draws from its own stream, so it doesn't change the party or later rolls.
  const world = generateWorld(worldSeed(seed), content)
  const location = startingSettlement(world, content, start)
  const names = party.map((c) => c.name).join(' and ')
  const from = location ? ` from ${settlementName({ world }, location)}` : ''
  return {
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
  }
}

/**
 * Applies one action. When days pass, the news of the sites the party knows follows: a dungeon or
 * lair cleared by the realm, or one that something has moved into again (world/sites.ts).
 */
export function step(state: GameState, action: Action, content: Content): GameState {
  return siteNews(state.day, act(state, action, content))
}

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
    case 'buyFood':
    case 'buyWaterskin':
    case 'sellSupplies':
      return stepTravel(state, action, content)
    case 'visitPoi':
      return visitPoi(state, content)
    case 'explore':
      return explore(state, content)
    default:
      return stepEncounter(state, action, content)
  }
}

/** Actions offered where the party is, beyond roads and supplies: exploring and visiting sites. */
export const availableActions = (state: GameState, content: Content): SiteAction[] =>
  siteActions(state, content)
