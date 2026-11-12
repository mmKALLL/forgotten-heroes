import type { Character, GameState } from '../../schema/state'
import { MAX_LEVEL } from '../../schema/types'
import { XP_BY_LEVEL } from '../constants'
import { appendLog } from '../log'
import { withRng, type Draw } from '../rng'
import { ABILITIES, abilityModifier } from './abilities'
import { MAX_EXHAUSTION } from './character'

// Levels and level-ups (Plan 5a, A1). The level follows from total XP and the XP table; proficiency
// follows from the level (abilities.ts). Level-ups are applied after each step (state.ts).

/** Ability scores never rise above this through levelling. */
const ABILITY_CAP = 20

/** The level a total of `xp` reaches, capped at MAX_LEVEL. */
export function levelFor(xp: number): number {
  const reached = XP_BY_LEVEL.findLastIndex((threshold) => xp >= threshold) + 1
  return Math.min(MAX_LEVEL, Math.max(1, reached))
}

/** XP still needed for the next level, or null at the cap. */
export function xpToNext(character: Character): number | null {
  if (character.level >= MAX_LEVEL) return null
  return Math.max(0, XP_BY_LEVEL[character.level] - character.xp)
}

/**
 * One level: HP + hit die + CON modifier (at least 1), and on odd levels from 3rd +1 to a random
 * ability below 20 (the prototype's rules). Nothing happens at the cap.
 */
export function levelUp(character: Character, d: Draw): { character: Character; lines: string[] } {
  if (character.level >= MAX_LEVEL) return { character, lines: [] }
  const level = character.level + 1
  const hp = Math.max(1, character.hitDie + abilityModifier(character.abilities.con))
  const raisable = ABILITIES.filter((a) => character.abilities[a] < ABILITY_CAP)
  const stat = level >= 3 && level % 2 === 1 && raisable.length > 0 ? d.pick(raisable) : null
  const abilities = stat
    ? { ...character.abilities, [stat]: character.abilities[stat] + 1 }
    : character.abilities
  const gains = [`+${hp} max HP`, ...(stat ? [`+1 ${stat.toUpperCase()}`] : [])]
  return {
    character: {
      ...character,
      level,
      abilities,
      hp: character.hp + hp,
      maxHp: character.maxHp + hp,
    },
    lines: [`${character.name} reaches level ${level}: ${gains.join(', ')}.`],
  }
}

/** Levels a fresh character up to `level` (recruits) and sets its XP to that level's threshold. */
export function levelTo(character: Character, level: number, d: Draw): Character {
  const target = Math.min(MAX_LEVEL, Math.max(1, level))
  let next = character
  while (next.level < target) next = levelUp(next, d).character
  return { ...next, xp: Math.max(next.xp, XP_BY_LEVEL[target - 1]) }
}

/** Every member who isn't dead gains `amount` XP, with one journal line. Levels come later. */
export function grantXp(state: GameState, amount: number, why: string): GameState {
  if (amount <= 0) return state
  const party = state.party.map((c) =>
    c.exhaustion < MAX_EXHAUSTION ? { ...c, xp: c.xp + amount } : c
  )
  return appendLog({ ...state, party }, `+${amount} XP: ${why}`, 'good')
}

/** Levels up, one level at a time, every member whose XP has passed their level. */
export function applyLevelUps(state: GameState): GameState {
  if (state.party.every((c) => levelFor(c.xp) <= c.level)) return state
  const [{ party, lines }, rng] = withRng(state.rng, (d) => {
    const lines: string[] = []
    const party = state.party.map((c) => {
      let next = c
      while (levelFor(next.xp) > next.level) {
        const up = levelUp(next, d)
        next = up.character
        lines.push(...up.lines)
      }
      return next
    })
    return { party, lines }
  })
  return lines.reduce((next, line) => appendLog(next, line, 'good'), { ...state, party, rng })
}
