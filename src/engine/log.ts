import type { LogTone, Tier } from '../schema/constants'
import type { GameState } from '../schema/state'

export const LOG_LIMIT = 200

/** Appends to the journal, keeping only the latest LOG_LIMIT entries. */
export function appendLog(state: GameState, text: string, tone: LogTone): GameState {
  return { ...state, log: [...state.log, { day: state.day, text, tone }].slice(-LOG_LIMIT) }
}

export const TIER_TONE: Record<Tier, LogTone> = {
  critFail: 'bad',
  fail: 'bad',
  partial: 'info',
  success: 'good',
  critSuccess: 'crit',
}
