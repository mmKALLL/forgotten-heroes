import type { Character, GameState } from '../../schema/state'
import { ABILITIES, type Ability } from '../../schema/types'
import type { Draw } from '../rng'
import { MAX_EXHAUSTION } from '../rules/character'
import {
  DEATH_CHANCE,
  INJURY_BASE,
  INJURY_DEATH_AFTER,
  INJURY_PER_OVERKILL,
  OLD_WOUND_PENALTY,
} from '../constants'

// Going down in a fight (combat design §7): a member at 0 HP is out of the fight, and may take a
// lasting injury (−OLD_WOUND_PENALTY to an ability, kept with the old wounds): INJURY_BASE plus
// INJURY_PER_OVERKILL for each point of damage past 0. One who already carries
// INJURY_DEATH_AFTER injuries (old wounds count) instead dies on DEATH_CHANCE, their gear lost
// with them, or else escapes this one.

/**
 * The party's Medicine against lasting injuries (designer idea 2026-11-14, combat design §10): a
 * named hook, added to the injury chance. It changes nothing yet.
 */
export const medicineModifier = (_state: Pick<GameState, 'party'>, _member: Character): number => 0

export type DefeatOdds = {
  /** The chance this downing leaves a mark (an injury, or the roll for death). */
  injury: number
  /** The chance it kills: the mark, then DEATH_CHANCE, for a member with enough injuries. */
  death: number
}

/** What going down with `overkill` damage past 0 risks for a member. */
export function defeatOdds(
  state: Pick<GameState, 'party'>,
  member: Character,
  overkill: number
): DefeatOdds {
  const injury = Math.min(
    1,
    Math.max(
      0,
      INJURY_BASE + INJURY_PER_OVERKILL * Math.max(0, overkill) + medicineModifier(state, member)
    )
  )
  const deadly = member.oldWounds.length >= INJURY_DEATH_AFTER
  return { injury, death: deadly ? injury * DEATH_CHANCE : 0 }
}

export type Defeat = { kind: 'none' } | { kind: 'injury'; ability: Ability } | { kind: 'death' }

/** Rolls what going down does, by `defeatOdds`. */
export function rollDefeat(draw: Draw, odds: DefeatOdds): Defeat {
  if (draw.float() >= odds.injury) return { kind: 'none' }
  if (odds.death > 0) return draw.float() < DEATH_CHANCE ? { kind: 'death' } : { kind: 'none' }
  return { kind: 'injury', ability: draw.pick(ABILITIES) }
}

/** A member after the defeat: injured (never below 3), or dead with their gear lost. */
export function applyDefeat(member: Character, defeat: Defeat): Character {
  if (defeat.kind === 'injury') {
    const a = defeat.ability
    return {
      ...member,
      abilities: { ...member.abilities, [a]: Math.max(3, member.abilities[a] - OLD_WOUND_PENALTY) },
      oldWounds: [...member.oldWounds, a],
    }
  }
  if (defeat.kind === 'death')
    return {
      ...member,
      hp: 0,
      exhaustion: MAX_EXHAUSTION,
      gear: { weapon: null, armour: null },
      accessory: null,
    }
  return member
}
