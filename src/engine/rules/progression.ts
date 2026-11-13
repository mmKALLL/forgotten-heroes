import type { Character, GameState } from '../../schema/state'
import { MAX_LEVEL, type Tier } from '../../schema/types'
import { XP_BY_LEVEL, XP_CRIT, XP_FAIL, XP_PARTIAL, XP_PER_DC } from '../constants'
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

/** Where a member stands between their level's threshold and the next, for the XP bar. */
export type XpProgress = {
  xp: number
  /** XP still needed for the next level, or null at the cap. */
  toNext: number | null
  /** The total XP the next level needs (its threshold), or null at the cap. */
  next: number | null
  /** 0–1 of the way from this level's threshold to the next (1 at the cap). */
  share: number
}

export function xpProgress(character: Character): XpProgress {
  const toNext = xpToNext(character)
  if (toNext === null) return { xp: character.xp, toNext, next: null, share: 1 }
  const from = XP_BY_LEVEL[character.level - 1] ?? 0
  const span = XP_BY_LEVEL[character.level] - from
  const share = span > 0 ? Math.min(1, Math.max(0, (character.xp - from) / span)) : 0
  return { xp: character.xp, toNext, next: XP_BY_LEVEL[character.level], share }
}

/**
 * One level: HP + hit die + CON modifier (at least 1), and on odd levels from 3rd +1 to a random
 * ability below 20 (the prototype's rules). A downed member's HP stays 0. Nothing happens at the
 * cap.
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
      // A downed member (0 HP) stays down: the level raises max HP, not the fallen.
      hp: character.hp > 0 ? character.hp + hp : 0,
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

/** Each tier's share of a success's XP: a failure still teaches something. */
const XP_TIER_SHARE: Readonly<Record<Tier, number>> = {
  critFail: XP_FAIL,
  fail: XP_FAIL,
  partial: XP_PARTIAL,
  success: 1,
  critSuccess: XP_CRIT,
}

/** The XP a check of this (final) DC pays at this tier, unless its outcome sets its own. */
export const checkXp = (dc: number, tier: Tier): number =>
  Math.round(XP_PER_DC * dc * XP_TIER_SHARE[tier])

/** Every member who isn't dead gains `amount` XP, silently (the caller says so). */
export function gainXp(state: GameState, amount: number): GameState {
  if (amount <= 0) return state
  const party = state.party.map((c) =>
    c.exhaustion < MAX_EXHAUSTION ? { ...c, xp: c.xp + amount } : c
  )
  return { ...state, party }
}

/** The journal line for XP gained, e.g. "+65 XP: Bandits on the ford". */
export const xpLine = (amount: number, why: string): string => `+${amount} XP: ${why}`

/** Every member who isn't dead gains `amount` XP, with one journal line. Levels come later. */
export function grantXp(state: GameState, amount: number, why: string): GameState {
  if (amount <= 0) return state
  return appendLog(gainXp(state, amount), xpLine(amount, why), 'good')
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
