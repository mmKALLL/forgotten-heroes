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

export const STARTING_PARTY_SIZE = 2
export const STARTING_GOLD = 50
// These moved out so the encounter engine can use them without importing this module.
// Re-exported so existing imports from './state' keep working.
export { MAX_DC, MIN_DC, normalizeDc, previewCheck, type CheckPreview }

export type Action =
  | { type: 'practiceCheck'; stat: CheckStat; dc: number; mode: RollMode; actorId?: string }
  | EncounterAction

export function newGame(
  seed: number,
  content: Content,
  partySize = STARTING_PARTY_SIZE
): GameState {
  const [party, rng] = generateParty(createRng(seed), content, partySize)
  const names = party.map((c) => c.name).join(' and ')
  return {
    version: CURRENT_SAVE_VERSION,
    seed,
    rng,
    day: 1,
    party,
    gold: STARTING_GOLD,
    inspiration: 0,
    log: [{ day: 1, text: `${names} set out together.`, tone: 'info' }],
    lastRoll: null,
    encounter: null,
    followUps: [],
    skillUses: [],
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
    default:
      return stepEncounter(state, action, content)
  }
}
