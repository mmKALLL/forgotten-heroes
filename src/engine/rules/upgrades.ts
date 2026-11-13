import { GOODS, GOOD_CATEGORY, WEALTH_TAGS, type Skill, type UpgradeId } from '../../schema/types'
import type { Effect } from '../../schema/encounter'
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
  SCOUT_CHECK_BONUS,
  SCOUT_HOSTILE_PER_LEVEL,
  SMUGGLE_SHARE,
} from '../constants'
import type { RollMode } from './checks'

// What the party's upgrades do (Plan 6c; design §4 "Party upgrades"). Each rule reads only the
// party's levels, so the previews that show an effect and the steps that apply it call the same
// function here: preview == actual. Buying them is town/upgrades.ts.

/** Anything that knows the party's upgrades (none when missing). */
type Owned = Partial<Pick<GameState, 'upgrades'>>

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

/** A surprise check: its option is tagged `surprise` (an ambush, or being caught unawares). */
export const isSurprise = (option: { tags?: readonly string[] }): boolean =>
  option.tags?.includes('surprise') ?? false

/**
 * Scout's kit: added to a surprise check (isSurprise) only, SCOUT_CHECK_BONUS per level (designer
 * call: not to Exposed checks in general). Combat's surprise roll (Plan 7) should read the same
 * bonus. `_mode` is kept so callers needn't change.
 */
export function scoutBonus(
  state: Owned,
  option: { tags?: readonly string[] },
  _mode?: RollMode
): number {
  if (!isSurprise(option)) return 0
  return SCOUT_CHECK_BONUS * upgradeLevel(state, 'scouts-kit')
}

/** Scout's kit: what it takes off the share of hostile encounters on the road (≥ 0). */
export const scoutShare = (state: Owned): number =>
  SCOUT_HOSTILE_PER_LEVEL * upgradeLevel(state, 'scouts-kit')

/** What the party's upgrades add to an encounter check, by upgrade, and in all. */
export type CheckUpgrades = { delving: number; scout: number; total: number }

/**
 * Everything the party's upgrades add to an encounter check: delving gear (delvingBonus) and the
 * scout's kit (scoutBonus). The preview and the roll both call this: preview == actual.
 */
export function checkUpgrades(
  state: Owned,
  situation: { room?: boolean },
  option: { tags?: readonly string[]; check: { skill: string } },
  mode: RollMode,
  round: boolean
): CheckUpgrades {
  const delving = delvingBonus(state, situation, option.check.skill, round)
  const scout = scoutBonus(state, option, mode)
  return { delving, scout, total: delving + scout }
}

/**
 * An encounter effect as the party's upgrades make it, for its chip and for applying it alike:
 * a camaraderie loss softened by the company banner, or null when nothing is left of it.
 */
export function upgradedEffect(state: Owned, effect: Effect): Effect | null {
  if (effect.effect !== 'camaraderie' || effect.amount >= 0) return effect
  const amount = softenLoss(state, effect.amount)
  return amount === 0 ? null : { ...effect, amount }
}

/**
 * The smuggler's compartment's note on a goods loss in a toll or a theft (smugglesPast): how
 * many units of the goods it takes from are hidden ("3 hidden"), or null. The loss then falls on
 * what is in sight only (encounters/run.ts resolve).
 */
export function hiddenNote(
  state: Owned & Pick<GameState, 'goods'>,
  tags: readonly string[] | undefined,
  effect: Effect
): string | null {
  if (effect.effect !== 'goods' || !smugglesPast(tags)) return null
  if (effect.fraction === undefined && (effect.amount ?? 0) >= 0) return null
  const hidden = hiddenGoods(state)
  const targets = effect.good
    ? [effect.good]
    : GOODS.filter((g) => GOOD_CATEGORY[g] === effect.category)
  const n = targets.reduce((sum, g) => sum + (hidden[g] ?? 0), 0)
  return n > 0 ? `${n} hidden` : null
}
