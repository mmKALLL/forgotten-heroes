import type { RuleHook, RuleHookOf } from '../../schema/gear'
import type { Character, GameState } from '../../schema/state'
import {
  GOOD_CATEGORY,
  GOODS,
  type GoodCategory,
  type Good,
  type HookActivity,
  type Skill,
} from '../../schema/types'
import { statLabel } from '../rules/abilities'

// Rule hooks (Plan 5a, design §8): small declarative rule changes the engine interprets. Each
// rule that a hook bends asks one of the readers below, so the hooks stay data and the odds stay
// computable. Accessories carry them now; per-party modifiers will reuse the same readers.

/** Hooks that act for the whole party, whoever wears them. The rest act for the wearer only. */
export const PARTY_HOOKS: readonly RuleHook['hook'][] = ['sellBonus', 'ward']

/** The sixth level of exhaustion is death (MAX_EXHAUSTION; rules/character imports this module). */
const DEAD_AT = 6

type Wearer = Partial<Pick<Character, 'accessory'>>

/** The hooks a character carries: its worn accessory's. */
export const hooksOf = (c: Wearer): RuleHook[] => c.accessory?.hooks ?? []

const ofKind = <K extends RuleHook['hook']>(hooks: readonly RuleHook[], kind: K) =>
  hooks.filter((h): h is RuleHookOf<K> => h.hook === kind)

const total = (amounts: readonly number[]) => amounts.reduce((sum, n) => sum + n, 0)

/** Every party-scoped hook worn by a living member. */
export const partyHooks = (state: Pick<GameState, 'party'>): RuleHook[] =>
  state.party
    .filter((c) => c.exhaustion < DEAD_AT)
    .flatMap((c) => hooksOf(c).filter((h) => PARTY_HOOKS.includes(h.hook)))

/** + to the wearer's checks with this skill. */
export const skillBonus = (c: Wearer, skill: Skill): number =>
  total(
    ofKind(hooksOf(c), 'skill')
      .filter((h) => h.skill === skill)
      .map((h) => h.amount)
  )

/** + when the wearer leads this activity (forage, gather, explore, rumours, stowaway). */
export const activityBonus = (c: Wearer, activity: HookActivity): number =>
  total(
    ofKind(hooksOf(c), 'activity')
      .filter((h) => h.activity === activity)
      .map((h) => h.amount)
  )

/** + to the wearer's CON checks against exhaustion (hunger, thirst, a forced march). */
export const enduranceBonus = (c: Wearer): number =>
  total(ofKind(hooksOf(c), 'endurance').map((h) => h.amount))

/** kg the wearer carries on top of their own capacity. */
export const carryBonus = (c: Wearer): number => total(ofKind(hooksOf(c), 'carry').map((h) => h.kg))

/** Max HP an accessory adds while worn (applied on equip, removed on unequip). */
export const maxHpBonus = (hooks: readonly RuleHook[]): number =>
  total(ofKind(hooks, 'maxHp').map((h) => h.amount))

/** Extra Strain stacks the wearer's skills fade each day. */
export const strainFadeOf = (c: Wearer): number =>
  total(ofKind(hooksOf(c), 'strainFade').map((h) => h.amount))

/** How much higher the wearer's daily Strain threshold is. */
export const strainGraceOf = (c: Wearer): number =>
  total(ofKind(hooksOf(c), 'strainGrace').map((h) => h.amount))

/** True when the wearer has a `lucky` hook, spent or not. */
export const isLucky = (c: Wearer): boolean => ofKind(hooksOf(c), 'lucky').length > 0

/**
 * True when this member's next check rerolls a natural 1: they wear a `lucky` hook and haven't
 * spent it today.
 */
export function hasLuck(
  state: Pick<GameState, 'party' | 'day' | 'luckUsed'>,
  characterId: string
): boolean {
  const c = state.party.find((m) => m.id === characterId)
  return c !== undefined && isLucky(c) && state.luckUsed[characterId] !== state.day
}

/** Spends a member's luck for today. */
export const spendLuck = <S extends Pick<GameState, 'day' | 'luckUsed'>>(
  state: S,
  characterId: string
): S => ({ ...state, luckUsed: { ...state.luckUsed, [characterId]: state.day } })

/** The share more that selling this good pays: every worn `sellBonus` for its category (they stack). */
export const sellBonus = (state: Pick<GameState, 'party'>, good: Good): number =>
  total(
    ofKind(partyHooks(state), 'sellBonus')
      .filter((h) => h.category === GOOD_CATEGORY[good])
      .map((h) => h.share)
  )

/** How much lower the road's hostile share is: the best worn ward (wards don't stack). */
export const wardShare = (state: Pick<GameState, 'party'>): number =>
  Math.max(0, ...ofKind(partyHooks(state), 'ward').map((h) => h.share))

/** What an activity hook boosts, for describeHook. */
const ACTIVITY_LABELS: Readonly<Record<HookActivity, string>> = {
  forage: 'foraging',
  gather: 'gathering',
  explore: 'exploring',
  rumours: 'listening for rumours',
  stowaway: 'stowing away',
}

/** "gems, relics and luxuries". */
function categoryGoods(category: GoodCategory): string {
  const goods = GOODS.filter((g) => GOOD_CATEGORY[g] === category)
  return goods.length < 2
    ? goods.join('')
    : `${goods.slice(0, -1).join(', ')} and ${goods[goods.length - 1]}`
}

const percent = (share: number) => `${Math.round(share * 100)}%`

/** One line saying what a hook does, e.g. "+1 Perception" or "−3% hostile on the road". */
export function describeHook(hook: RuleHook): string {
  switch (hook.hook) {
    case 'skill':
      return `+${hook.amount} ${statLabel(hook.skill)}`
    case 'activity':
      return `+${hook.amount} when leading ${ACTIVITY_LABELS[hook.activity]}`
    case 'endurance':
      return `+${hook.amount} to endure hunger, thirst and forced marches`
    case 'carry':
      return `+${hook.kg} kg carried`
    case 'maxHp':
      return `+${hook.amount} max HP`
    case 'strainFade':
      return 'Strain fades faster'
    case 'strainGrace':
      return 'Strain sets in later'
    case 'lucky':
      return 'Once a day, rerolls a natural 1'
    case 'sellBonus':
      return `Sells ${categoryGoods(hook.category)} for ${percent(hook.share)} more`
    case 'ward':
      return `−${percent(hook.share)} hostile on the road`
  }
}
