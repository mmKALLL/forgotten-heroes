import type { GameState } from '../schema/state'
import type { Ability, CheckStat } from './rules/abilities'
import { chooseActor } from './rules/character'
import { normalizeDc, tierOdds, type RollMode, type Tier } from './rules/checks'

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
  actorId?: string,
  ability?: Ability
): CheckPreview | null {
  const actor = chooseActor(state.party, stat, actorId, ability)
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
