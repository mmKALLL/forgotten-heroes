import type { Biome, Pace, Tier } from '../../schema/types'
import type { GameState } from '../../schema/state'
import { chooseLead } from '../rules/character'
import { rollCheck, tierOdds, TIERS } from '../rules/checks'
import { useSkill } from '../rules/strain'
import { goodsOf, partyWaterCapacity, waterNeed } from './supplies'
import { FORAGE_DC, FORAGE_PACE_MODIFIER } from '../constants'

export const FORAGE_SKILL = 'survival' as const

/** Who would forage today, against what DC, and the odds of every tier. */
export type ForageCheck = {
  actorId: string
  skill: typeof FORAGE_SKILL
  dc: number
  modifier: number
  odds: Record<Tier, number>
  /** What each tier finds (forageYield), before the waterskins fill up. */
  outcomes: Record<Tier, { food: number; water: number }>
}

/**
 * The day's foraging check: the best-suited fit member (chooseActor, so Strain, exhaustion and
 * wounds count) rolls Survival against the terrain's DC, at a penalty on a forced march.
 * Null at sea, on a road gone from the data, or with no one fit to look.
 */
export function forageCheck(
  state: Pick<GameState, 'party'>,
  terrain: Biome | null,
  pace: Pace
): ForageCheck | null {
  if (terrain === null || terrain === 'sea') return null
  const actor = chooseLead(state.party, FORAGE_SKILL, 'forage')
  if (!actor) return null
  const dc = FORAGE_DC[terrain]
  const modifier = actor.modifier + FORAGE_PACE_MODIFIER[pace]
  const members = state.party.length
  return {
    actorId: actor.characterId,
    skill: FORAGE_SKILL,
    dc,
    modifier,
    odds: tierOdds(modifier, dc),
    outcomes: Object.fromEntries(
      TIERS.map((tier) => [tier, forageYield(tier, members, terrain)])
    ) as ForageCheck['outcomes'],
  }
}

/**
 * What a forage roll finds: a success is a day of water for the whole party, a critical success
 * a day of food too, a partial success half a day of water (rounded down); a failure, nothing.
 */
export function forageYield(
  tier: Tier,
  members: number,
  terrain: Biome | null
): { food: number; water: number } {
  const water = waterNeed(terrain) * members
  switch (tier) {
    case 'critSuccess':
      return { food: members, water }
    case 'success':
      return { food: 0, water }
    case 'partial':
      return { food: 0, water: Math.floor(water / 2) }
    case 'fail':
    case 'critFail':
      return { food: 0, water: 0 }
  }
}

/** The food and water one day's foraging finds on average (before the waterskins fill up). */
export function expectedForage(
  state: Pick<GameState, 'party'>,
  terrain: Biome | null,
  pace: Pace
): { food: number; water: number } {
  const check = forageCheck(state, terrain, pace)
  if (!check) return { food: 0, water: 0 }
  let food = 0
  let water = 0
  for (const tier of TIERS) {
    const found = forageYield(tier, state.party.length, terrain)
    food += check.odds[tier] * found.food
    water += check.odds[tier] * found.water
  }
  return { food, water }
}

export type ForageResult = {
  actorId: string
  tier: Tier
  dc: number
  /** What was kept: water beyond the waterskins' capacity is `wasted`. */
  food: number
  water: number
  wasted: number
  /** The forager's new Survival Strain stacks, or 0 when none was added. */
  strained: number
  /** A natural 20: Inspiration gained, as on any check. */
  inspired: boolean
}

/**
 * One day's foraging (journey.ts calls it before the day's rations). The roll counts as a use of
 * Survival for Strain, and a natural 20 grants Inspiration. Water is kept up to the party's capacity. Logs nothing: the journey folds
 * the day's finds into its summary line.
 */
export function forageDay(
  state: GameState,
  terrain: Biome | null,
  pace: Pace
): { state: GameState; result: ForageResult | null } {
  const check = forageCheck(state, terrain, pace)
  if (!check) return { state, result: null }
  const [roll, rng] = rollCheck(state.rng, check.modifier, check.dc)
  const found = forageYield(roll.tier, state.party.length, terrain)
  const water = goodsOf(state.goods, 'water')
  const kept = Math.max(water, Math.min(partyWaterCapacity(state), water + found.water))
  const { party, skillUses, strained } = useSkill(state, check.actorId, FORAGE_SKILL)
  const goods = {
    ...state.goods,
    food: goodsOf(state.goods, 'food') + found.food,
    water: kept,
  }
  const inspired = roll.tier === 'critSuccess'
  return {
    state: {
      ...state,
      rng,
      party,
      skillUses,
      goods,
      inspiration: state.inspiration + (inspired ? 1 : 0),
    },
    result: {
      actorId: check.actorId,
      tier: roll.tier,
      dc: check.dc,
      food: found.food,
      water: kept - water,
      wasted: found.water - (kept - water),
      strained,
      inspired,
    },
  }
}
