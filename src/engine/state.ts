import type { Content } from '../content/build'
import type { GameState, LogEntry } from '../schema/state'
import { formatModifier } from './format'
import { generateParty } from './party'
import { createRng } from './rng'
import { statLabel, type CheckStat } from './rules/abilities'
import { chooseActor } from './rules/character'
import { TIER_LABELS, rollCheck, tierOdds, type RollMode, type Tier } from './rules/checks'

export const STARTING_PARTY_SIZE = 2
export const STARTING_GOLD = 50
const LOG_LIMIT = 200
export const MIN_DC = 1
export const MAX_DC = 40

/** Whole-number DC in [MIN_DC, MAX_DC] (NaN → MIN_DC), so every state stays save-valid. */
export const normalizeDc = (dc: number): number =>
  Number.isNaN(dc) ? MIN_DC : Math.min(MAX_DC, Math.max(MIN_DC, Math.round(dc)))

export type Action = {
  type: 'practiceCheck'
  stat: CheckStat
  dc: number
  mode: RollMode
  actorId?: string
}

export function newGame(seed: number, content: Content, partySize = STARTING_PARTY_SIZE): GameState {
  const [party, rng] = generateParty(createRng(seed), content, partySize)
  const names = party.map((c) => c.name).join(' and ')
  return {
    version: 1,
    seed,
    rng,
    day: 1,
    party,
    gold: STARTING_GOLD,
    inspiration: 0,
    log: [{ day: 1, text: `${names} set out together.`, tone: 'info' }],
    lastRoll: null,
  }
}

function appendLog(state: GameState, text: string, tone: LogEntry['tone']): GameState {
  return { ...state, log: [...state.log, { day: state.day, text, tone }].slice(-LOG_LIMIT) }
}

const TONE: Record<Tier, LogEntry['tone']> = {
  critFail: 'bad',
  fail: 'bad',
  partial: 'info',
  success: 'good',
  critSuccess: 'crit',
}

export function step(state: GameState, action: Action): GameState {
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
      return appendLog(next, text, TONE[roll.tier])
    }
  }
}

export type CheckPreview = {
  actorId: string
  actorName: string
  modifier: number
  /** The DC the roll will actually use (normalised, like `step` does). */
  dc: number
  odds: Record<Tier, number>
}

export function previewCheck(
  state: GameState,
  stat: CheckStat,
  dc: number,
  mode: RollMode,
  actorId?: string
): CheckPreview | null {
  const actor = chooseActor(state.party, stat, actorId)
  if (!actor) return null
  const actorName = state.party.find((c) => c.id === actor.characterId)?.name ?? '?'
  const rollDc = normalizeDc(dc)
  return {
    actorId: actor.characterId,
    actorName,
    modifier: actor.modifier,
    dc: rollDc,
    odds: tierOdds(actor.modifier, rollDc, mode),
  }
}
