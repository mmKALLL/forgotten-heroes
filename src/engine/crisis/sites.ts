import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { crisisStatus } from './status'

// Which POIs are the Crisis's sites, and which of them ordinary searches can't find (design §10b).

/** The Crisis's sites: the reveal site, then each act's site. Empty without a Crisis. */
export const crisisSites = (crisis: CrisisState | null): string[] =>
  crisis ? [crisis.reveal, ...crisis.acts.map((a) => a.poi)] : []

/**
 * The Crisis sites that searches, rumours, road clues and paid knowledge (contracts) can't find:
 * all of them, each being found its own way (crisis/progress.ts, crisis/clues.ts). One exception:
 * once the current act has a clue (its land), exploring the act site's own domain (`exploring`)
 * can find it, as a normal search.
 */
export function crisisHidden(
  state: Pick<GameState, 'crisis' | 'day' | 'world'>,
  exploring?: string | null
): ReadonlySet<string> {
  const hidden = new Set(crisisSites(state.crisis))
  const crisis = state.crisis
  if (!crisis || !exploring) return hidden
  const status = crisisStatus(crisis, state.day)
  if (status.phase !== 'act' || status.clues < 1) return hidden
  const site = crisis.acts[status.act!].poi
  if (state.world.pois[site]?.domain === exploring) hidden.delete(site)
  return hidden
}
