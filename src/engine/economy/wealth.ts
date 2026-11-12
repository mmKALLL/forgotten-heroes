import type { Content } from '../../content/build'
import { GOOD_CATEGORY, WEALTH_TAGS } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { goodsValue } from './goods'
import {
  PURSE_FREE_PER_MEMBER,
  PURSE_SHARE,
  WEALTH_HOSTILE_PER_STEP,
  WEALTH_MAX_STEPS,
  WEALTH_STEP_GP,
  WEALTH_TAG_WEIGHT,
} from '../constants'

// Visible wealth (design §4): precious goods and a heavy purse draw thieves and tolls on the road.
// It counts per member, so a bigger party deters.

export type VisibleWealth = {
  /** gp the party visibly carries: precious goods at base price, and part of a heavy purse. */
  value: number
  /** Precious goods (gems, relics, luxuries) at base price. */
  precious: number
  /** The share of the coin above PURSE_FREE_PER_MEMBER per member that shows (PURSE_SHARE). */
  purse: number
  perMember: number
  /** 0 to WEALTH_MAX_STEPS: one per WEALTH_STEP_GP per member. */
  steps: number
  /**
   * What it adds to the share of hostile encounters on the road (HostileShare.wealth, before the
   * clamp and the pace's avoidance): WEALTH_HOSTILE_PER_STEP per step. For the goods bar's %.
   */
  hostile: number
}

export function visibleWealth(
  state: Pick<GameState, 'goods' | 'gold' | 'party'>,
  content: Content
): VisibleWealth {
  const members = Math.max(1, state.party.length)
  const precious = goodsValue(state.goods, content, (g) => GOOD_CATEGORY[g] === 'precious')
  const purse = Math.max(0, state.gold - PURSE_FREE_PER_MEMBER * members) * PURSE_SHARE
  const value = precious + purse
  const perMember = value / members
  const steps = Math.min(WEALTH_MAX_STEPS, Math.max(0, Math.floor(perMember / WEALTH_STEP_GP)))
  return { value, precious, purse, perMember, steps, hostile: WEALTH_HOSTILE_PER_STEP * steps }
}

/** True for situations visible wealth makes likelier: thieves and tolls (WEALTH_TAGS). */
export const followsMoney = (tags: readonly string[] | undefined): boolean =>
  (tags ?? []).some((t) => (WEALTH_TAGS as readonly string[]).includes(t))

/** A situation's draw weight on the road, given the party's wealth steps. */
export const wealthWeight = (
  weight: number,
  tags: readonly string[] | undefined,
  steps: number
): number => (steps > 0 && followsMoney(tags) ? weight * (1 + WEALTH_TAG_WEIGHT * steps) : weight)
