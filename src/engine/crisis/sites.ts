import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'

// Which POIs are the Crisis's sites, and which of them ordinary searches can't find (design §10b).

/** The Crisis's sites: the reveal site, then each act's site. Empty without a Crisis. */
export const crisisSites = (crisis: CrisisState | null): string[] =>
  crisis ? [crisis.reveal, ...crisis.acts.map((a) => a.poi)] : []

/**
 * The Crisis sites that searches, rumours, road clues and paid knowledge (contracts) never find:
 * all of them. Each is found its own way instead (crisis/progress.ts, crisis/clues.ts).
 */
export const crisisHidden = (state: Pick<GameState, 'crisis'>): ReadonlySet<string> =>
  new Set(crisisSites(state.crisis))
