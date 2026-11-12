import type { ContractState, GameState } from '../../schema/state'
import { appendLog } from '../log'

// The small parts of contracts (town/contracts.ts) that encounters and days passing need, kept
// apart so those modules don't import the whole notice board.

/** An escort contract still on the road: its passengers travel with the party. */
const escorting = (c: ContractState) => c.kind === 'escort' && !c.met

/** Passengers the party is escorting: each eats and drinks as a member (travel/days.ts). */
export const escortPassengers = (state: Pick<GameState, 'contracts'>): number =>
  state.contracts.filter(escorting).reduce((sum, c) => sum + c.passengers, 0)

/** True while the party escorts someone, which draws attention on the road (ESCORT_HOSTILE). */
export const isEscorting = (state: Partial<Pick<GameState, 'contracts'>>): boolean =>
  (state.contracts ?? []).some(escorting)

/**
 * A bounty's site was cleared (clearPoi) or an errand's site visited (visitPoi): each such
 * contract on that POI still within its deadline is met, to be reported to its patron.
 */
export function siteContractsMet(
  state: GameState,
  kind: 'bounty' | 'errand',
  poiId: string
): GameState {
  const due = state.contracts.filter(
    (c) => c.kind === kind && c.poi === poiId && !c.met && state.day <= c.deadline
  )
  if (due.length === 0) return state
  const contracts = state.contracts.map((c) => (due.includes(c) ? { ...c, met: true } : c))
  const home = state.world.settlements[due[0].to]?.name ?? due[0].to
  const text =
    kind === 'bounty'
      ? `The bounty is earned: report to ${home} to claim it.`
      : `The errand is done: report to ${home} to claim the reward.`
  return appendLog({ ...state, contracts }, text, 'good')
}
