import type { Character } from '../../schema/state'
import { abilityModifier, abilityOf, isSkill, proficiencyBonus, type CheckStat } from './abilities'

/** 2024 rules: each exhaustion level is −2 to d20 tests. Level 6 is death. */
export const EXHAUSTION_PENALTY = 2

export function statModifier(character: Character, stat: CheckStat): number {
  const ability = abilityModifier(character.abilities[abilityOf(stat)])
  const proficient = isSkill(stat) && character.skillProficiencies.includes(stat)
  const proficiency = proficient ? proficiencyBonus(character.level) : 0
  return ability + proficiency - EXHAUSTION_PENALTY * character.exhaustion
}

export const canAct = (character: Character): boolean => character.hp > 0 && character.exhaustion < 6

export type ActorRank = { characterId: string; modifier: number }

export function rankActors(party: readonly Character[], stat: CheckStat): ActorRank[] {
  return party
    .map((character, order) => ({ character, order, modifier: statModifier(character, stat) }))
    .filter(({ character }) => canAct(character))
    .sort(
      (a, b) =>
        b.modifier - a.modifier ||
        b.character.abilities[abilityOf(stat)] - a.character.abilities[abilityOf(stat)] ||
        a.order - b.order
    )
    .map(({ character, modifier }) => ({ characterId: character.id, modifier }))
}

export function chooseActor(
  party: readonly Character[],
  stat: CheckStat,
  overrideId?: string
): ActorRank | null {
  const ranks = rankActors(party, stat)
  return ranks.find((r) => r.characterId === overrideId) ?? ranks[0] ?? null
}
