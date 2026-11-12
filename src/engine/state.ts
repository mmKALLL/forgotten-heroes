import type { Content } from '../content/build'
import { MAX_DC, MIN_DC } from '../schema/constants'
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
import { generateWorld, startingSettlement, worldSeed } from './world/generate'
import { settlementName } from './world/geo'

export const STARTING_PARTY_SIZE = 2
export const STARTING_GOLD = 50
// These moved out so the encounter engine can use them without importing this module.
// Re-exported so existing imports from './state' keep working.
export { MAX_DC, MIN_DC, normalizeDc, previewCheck, type CheckPreview }

export type Action =
  | { type: 'practiceCheck'; stat: CheckStat; dc: number; mode: RollMode; actorId?: string }
  | EncounterAction
  | TravelAction

export function newGame(
  seed: number,
  content: Content,
  partySize = STARTING_PARTY_SIZE
): GameState {
  const [party, rng] = generateParty(createRng(seed), content, partySize)
  // The world draws from its own stream, so it doesn't change the party or later rolls.
  const world = generateWorld(worldSeed(seed), content)
  const location = startingSettlement(world, content)
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
    travel: null,
    goods: startingGoods(party.length),
    waterskins: 0,
  }
}

export function step(state: GameState, action: Action, content: Content): GameState {
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
    default:
      return stepEncounter(state, action, content)
  }
}
