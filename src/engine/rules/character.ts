import type { Character } from '../../schema/state'
import {
  abilityModifier,
  abilityOf,
  isSkill,
  proficiencyBonus,
  type Ability,
  type CheckStat,
} from './abilities'
import { strainOf } from './strain'
import { activityBonus, skillBonus } from '../gear/hooks'
import type { HookActivity } from '../../schema/types'

/** The sixth level of exhaustion is death. */
export const MAX_EXHAUSTION = 6

/** 2024 rules: each exhaustion level is −2 to d20 tests. Level 6 is death. */
export const EXHAUSTION_PENALTY = 2

/**
 * `ability` overrides the skill's default ability, e.g. Intimidation (CHA) for a veiled threat.
 * Proficiency still comes from the skill. Exhaustion lowers every check; Strain lowers its skill;
 * a worn `skill` hook raises it (gear/hooks.ts).
 */
export function statModifier(
  character: Character,
  stat: CheckStat,
  ability: Ability = abilityOf(stat)
): number {
  const score = abilityModifier(character.abilities[ability])
  const proficient = isSkill(stat) && character.skillProficiencies.includes(stat)
  const proficiency = proficient ? proficiencyBonus(character.level) : 0
  const strain = isSkill(stat) ? strainOf(character, stat) : 0
  const gear = isSkill(stat) ? skillBonus(character, stat) : 0
  return score + proficiency - EXHAUSTION_PENALTY * character.exhaustion - strain + gear
}

export const canAct = (character: Character): boolean =>
  character.hp > 0 && character.exhaustion < 6

export type ActorRank = { characterId: string; modifier: number }

/** Fit members, best first. For an `activity`, each member's activity hooks count (gear/hooks.ts). */
export function rankActors(
  party: readonly Character[],
  stat: CheckStat,
  ability: Ability = abilityOf(stat),
  activity?: HookActivity
): ActorRank[] {
  return party
    .map((character, order) => ({
      character,
      order,
      modifier:
        statModifier(character, stat, ability) +
        (activity ? activityBonus(character, activity) : 0),
    }))
    .filter(({ character }) => canAct(character))
    .sort(
      (a, b) =>
        b.modifier - a.modifier ||
        b.character.abilities[ability] - a.character.abilities[ability] ||
        a.order - b.order
    )
    .map(({ character, modifier }) => ({ characterId: character.id, modifier }))
}

export function chooseActor(
  party: readonly Character[],
  stat: CheckStat,
  overrideId?: string,
  ability?: Ability,
  activity?: HookActivity
): ActorRank | null {
  const ranks = rankActors(party, stat, ability, activity)
  return ranks.find((r) => r.characterId === overrideId) ?? ranks[0] ?? null
}

/**
 * Who leads a town or travel activity (foraging, gathering, exploring, rumours, stowing away):
 * the best-suited fit member, with their activity hooks counted in the modifier.
 */
export const chooseLead = (
  party: readonly Character[],
  stat: CheckStat,
  activity: HookActivity,
  ability?: Ability
): ActorRank | null => chooseActor(party, stat, undefined, ability, activity)
