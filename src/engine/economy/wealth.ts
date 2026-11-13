import type { Content } from '../../content/build'
import { GOOD_CATEGORY, WEALTH_TAGS } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { goodsValue } from './goods'
import { visibleGoods } from '../rules/upgrades'
import { WEALTH_HOSTILE_PER_STEP, WEALTH_BREAKPOINTS, WEALTH_TAG_WEIGHT } from '../constants'

// Visible wealth (design §4): coin and precious goods draw thieves and tolls on the road. Every
// breakpoint passed (WEALTH_BREAKPOINTS) is a step, whatever the party's size (designer call).

export type VisibleWealth = {
  /** gp the party visibly carries: precious goods at base price, and all its coin. */
  value: number
  /** Precious goods (gems, relics, luxuries) in sight, at base price. */
  precious: number
  /** The coin carried. */
  purse: number
  /** 0 to WEALTH_MAX_STEPS: the WEALTH_BREAKPOINTS reached. */
  steps: number
  /**
   * What it adds to the share of hostile encounters on the road (HostileShare.wealth, before the
   * clamp and the pace's avoidance): WEALTH_HOSTILE_PER_STEP per step. For the top bar's wealth %.
   */
  hostile: number
}

/** What shows: the smuggler's compartment's hidden goods don't (rules/upgrades.ts). */
export function visibleWealth(
  state: Pick<GameState, 'goods' | 'gold' | 'party'> & Partial<Pick<GameState, 'upgrades'>>,
  content: Content
): VisibleWealth {
  const precious = goodsValue(visibleGoods(state), content, (g) => GOOD_CATEGORY[g] === 'precious')
  const purse = Math.max(0, state.gold)
  const value = precious + purse
  const steps = WEALTH_BREAKPOINTS.filter((gp) => value >= gp).length
  return { value, precious, purse, steps, hostile: WEALTH_HOSTILE_PER_STEP * steps }
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
