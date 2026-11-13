import { GOODS, GOOD_CATEGORY, WEALTH_TAGS, type Skill, type UpgradeId } from '../../schema/types'
import type { Goods, GameState } from '../../schema/state'
import {
  BANNER_SOFTEN,
  CAMP_KIT_CHEER,
  CAMP_KIT_CHEER_LEVEL,
  CAMP_KIT_HP,
  DELVING_GEAR_BONUS,
  DELVING_GEAR_CHALLENGE_LEVEL,
  DELVING_GEAR_SKILLS,
  MAPS_EXPLORE,
  SMUGGLE_SHARE,
} from '../constants'

// What the party's upgrades do (Plan 6c; design §4 "Party upgrades"). Each rule reads only the
// party's levels, so the previews that show an effect and the steps that apply it call the same
// function here: preview == actual. Buying them is town/upgrades.ts.

type Owned = Pick<GameState, 'upgrades'>

/** The level the party owns of an upgrade (0 when not bought). */
export const upgradeLevel = (state: Owned, id: UpgradeId): number => state.upgrades?.[id] ?? 0

/**
 * Company banner: a camaraderie loss (a negative amount) BANNER_SOFTEN smaller per level, never
 * past 0; gains are unchanged.
 */
export function softenLoss(state: Owned, amount: number): number {
  if (amount >= 0) return amount
  return Math.min(0, amount + BANNER_SOFTEN * upgradeLevel(state, 'company-banner'))
}

/** Camp kit: the HP each member regains on a day's rest in camp, on top of CAMP_HEAL. */
export const campKitHp = (state: Owned): number => CAMP_KIT_HP * upgradeLevel(state, 'camp-kit')

/** Camp kit: the camaraderie a day's rest in camp brings (once per arrival), or 0. */
export const campKitCheer = (state: Owned): number =>
  upgradeLevel(state, 'camp-kit') >= CAMP_KIT_CHEER_LEVEL ? CAMP_KIT_CHEER : 0

/** Smuggler's compartment: the share of each precious good hidden (0–1). */
export const smuggledShare = (state: Owned): number =>
  Math.min(1, SMUGGLE_SHARE * upgradeLevel(state, 'smugglers-compartment'))

/**
 * Smuggler's compartment: the precious goods hidden from tolls and road thieves (and from the
 * eyes that judge visible wealth), by good: the share of each, rounded down.
 */
export function hiddenGoods(state: Owned & Pick<GameState, 'goods'>): Goods {
  const share = smuggledShare(state)
  if (share <= 0) return {}
  const hidden: Goods = {}
  for (const g of GOODS) {
    if (GOOD_CATEGORY[g] !== 'precious') continue
    const n = Math.min(state.goods[g] ?? 0, Math.floor((state.goods[g] ?? 0) * share + 1e-9))
    if (n > 0) hidden[g] = n
  }
  return hidden
}

/** The goods the compartment leaves in sight: what is carried less what is hidden. */
export function visibleGoods(state: Owned & Pick<GameState, 'goods'>): Goods {
  const hidden = hiddenGoods(state)
  const goods = { ...state.goods }
  for (const [g, n] of Object.entries(hidden) as [keyof Goods, number][]) goods[g] = goods[g]! - n
  return goods
}

/** Adds goods back (the hidden ones after a toll or theft). */
export function addGoods(goods: Goods, more: Goods): Goods {
  const next = { ...goods }
  for (const [g, n] of Object.entries(more) as [keyof Goods, number][]) next[g] = (next[g] ?? 0) + n
  return next
}

/** Whether a situation is a toll or road thieves (WEALTH_TAGS): what the compartment hides from. */
export const smugglesPast = (tags: readonly string[] | undefined): boolean =>
  (tags ?? []).some((t) => (WEALTH_TAGS as readonly string[]).includes(t))

/** Surveyor's maps: added to explore checks. */
export const mapsBonus = (state: Owned): number =>
  MAPS_EXPLORE * upgradeLevel(state, 'surveyors-maps')

/**
 * Delving gear: added to a check in a dungeon room (`room` situations): DELVING_GEAR_BONUS per
 * level for DELVING_GEAR_SKILLS, and from DELVING_GEAR_CHALLENGE_LEVEL 1 more on every skill-
 * challenge round. 0 anywhere else.
 */
export function delvingBonus(
  state: Owned,
  situation: { room?: boolean },
  skill: string,
  round: boolean
): number {
  const level = upgradeLevel(state, 'delving-gear')
  if (!situation.room || level === 0) return 0
  const gear = (DELVING_GEAR_SKILLS as readonly string[]).includes(skill as Skill)
    ? DELVING_GEAR_BONUS * level
    : 0
  return gear + (round && level >= DELVING_GEAR_CHALLENGE_LEVEL ? 1 : 0)
}
