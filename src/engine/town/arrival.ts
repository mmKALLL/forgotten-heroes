import type { Content } from '../../content/build'
import type { Character, GameState } from '../../schema/state'
import { inProgress } from '../encounters/run'
import { appendLog } from '../log'
import { MAX_EXHAUSTION } from '../rules/character'
import { goodsOf, inSettlement, rest, restOption } from '../travel/supplies'

// Auto-rest on arrival (a click-saver, Plan 4 designer decisions): a per-viewer setting in the UI;
// when the party arrives in a settlement hurt or strained, it rests a day: at an inn if it can
// pay, else on its own food.

/** A living member who would gain from a day's rest: hurt, exhausted or strained. */
const worn = (c: Character): boolean =>
  c.exhaustion < MAX_EXHAUSTION &&
  (c.hp < c.maxHp || c.exhaustion > 0 || Object.keys(c.strain ?? {}).length > 0)

export const needsRest = (state: Pick<GameState, 'party'>): boolean => state.party.some(worn)

/**
 * The day's rest auto-rest would take here: at an inn (lodging true) when there is one the party
 * can pay for, else on carried food when there is a ration for everyone; null when no one needs
 * it, the party isn't in a settlement (or is busy), or it can do neither.
 */
export function arrivalRest(state: GameState, content: Content): { lodging: boolean } | null {
  if (!inSettlement(state) || state.travel || inProgress(state) || !needsRest(state)) return null
  if (restOption(state, content, true).lodging) return { lodging: true }
  return goodsOf(state.goods, 'food') >= state.party.length ? { lodging: false } : null
}

/** Rests a day if arrivalRest says so, and says why in the journal; otherwise changes nothing. */
export function autoRest(state: GameState, content: Content): GameState {
  const plan = arrivalRest(state, content)
  if (!plan) return state
  const noted = appendLog(
    state,
    plan.lodging
      ? 'Auto-rest: the party arrives worn and takes rooms at the inn.'
      : 'Auto-rest: the party arrives worn and rests on its own food.',
    'info'
  )
  return rest(noted, content, plan.lodging)
}
