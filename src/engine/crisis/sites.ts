import type { CrisisState } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { crisisStatus } from './status'

// Which POIs are the Crisis's sites, and which of them ordinary searches can't find (design §10b).

/** The Crisis's sites: each act's lead site, then its key site. Empty without a Crisis. */
export const crisisSites = (crisis: CrisisState | null): string[] =>
  crisis ? crisis.acts.flatMap((a) => [a.lead, a.key]) : []

/**
 * The Crisis sites that searches, rumours, road clues and paid knowledge (contracts) can't find:
 * all of them, each being found its own way (crisis/progress.ts, crisis/clues.ts). One exception:
 * once the open act's investigation has a clue (its land), exploring its lead site's own domain
 * (`exploring`) can find the lead, as a normal search.
 */
export function crisisHidden(
  state: Pick<GameState, 'crisis' | 'day' | 'world'>,
  exploring?: string | null
): ReadonlySet<string> {
  const hidden = new Set(crisisSites(state.crisis))
  const crisis = state.crisis
  if (!crisis || !exploring) return hidden
  const status = crisisStatus(crisis, state.day)
  if (status.phase !== 'investigation' || status.clues < 1) return hidden
  const site = status.target!
  if (state.world.pois[site]?.domain === exploring) hidden.delete(site)
  return hidden
}
