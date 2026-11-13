import type { Character, GameState, LevelUp } from '../../schema/state'
import { MAX_LEVEL, type Tier } from '../../schema/types'
import { XP_BY_LEVEL, XP_CRIT, XP_FAIL, XP_PARTIAL, XP_PER_DC } from '../constants'
import { appendLog } from '../log'
import { withRng, type Draw } from '../rng'
import { ABILITIES, abilityModifier, proficiencyBonus, type Ability } from './abilities'
import { MAX_EXHAUSTION } from './character'

// Levels and level-ups (Plan 5a, A1). The level follows from total XP and the XP table; proficiency
// follows from the level (abilities.ts). Level-ups are applied after each step (state.ts), and
// wait in `GameState.levelUps` until the player has seen them (acknowledgeLevelUps).

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
export function levelUp(
  character: Character,
  d: Draw
): { character: Character; lines: string[]; maxHp: number; stat: Ability | null } {
  if (character.level >= MAX_LEVEL) return { character, lines: [], maxHp: 0, stat: null }
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
    maxHp: hp,
    stat,
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

/**
 * Levels up, one level at a time, every member whose XP has passed their level, and records each
 * living member's levels as one pending level-up for the dialog (merged with one already waiting).
 */
export function applyLevelUps(state: GameState): GameState {
  if (state.party.every((c) => levelFor(c.xp) <= c.level)) return state
  const [{ party, lines, ups }, rng] = withRng(state.rng, (d) => {
    const lines: string[] = []
    const ups: LevelUp[] = []
    const party = state.party.map((c) => {
      let next = c
      const up: LevelUp = {
        characterId: c.id,
        from: c.level,
        to: c.level,
        gains: { maxHp: 0, abilities: {}, proficiency: 0 },
      }
      while (levelFor(next.xp) > next.level) {
        const one = levelUp(next, d)
        next = one.character
        lines.push(...one.lines)
        up.to = next.level
        up.gains.maxHp += one.maxHp
        if (one.stat) up.gains.abilities[one.stat] = (up.gains.abilities[one.stat] ?? 0) + 1
      }
      up.gains.proficiency = proficiencyBonus(up.to) - proficiencyBonus(up.from)
      // The dead (their XP can pass a level in the step they fall) have nothing to celebrate.
      if (up.to > up.from && next.exhaustion < MAX_EXHAUSTION) ups.push(up)
      return next
    })
    return { party, lines, ups }
  })
  const levelUps = ups.reduce(mergeLevelUp, state.levelUps)
  return lines.reduce((next, line) => appendLog(next, line, 'good'), {
    ...state,
    party,
    rng,
    levelUps,
  })
}

/** Adds a member's level-up to those waiting, merged into their entry if they have one. */
function mergeLevelUp(pending: LevelUp[], up: LevelUp): LevelUp[] {
  const i = pending.findIndex((p) => p.characterId === up.characterId)
  if (i < 0) return [...pending, up]
  const was = pending[i]
  const abilities = { ...was.gains.abilities }
  for (const [a, n] of Object.entries(up.gains.abilities) as [Ability, number][])
    abilities[a] = (abilities[a] ?? 0) + n
  const merged: LevelUp = {
    characterId: up.characterId,
    from: was.from,
    to: up.to,
    gains: {
      maxHp: was.gains.maxHp + up.gains.maxHp,
      abilities,
      proficiency: proficiencyBonus(up.to) - proficiencyBonus(was.from),
    },
  }
  return pending.map((p, j) => (j === i ? merged : p))
}

/** The player has seen the level-ups (the dialog's Continue): the game goes on. */
export const acknowledgeLevelUps = (state: GameState): GameState =>
  state.levelUps.length > 0 ? { ...state, levelUps: [] } : state

/** A waiting level-up as the dialog shows it: who, from and to, and what they gained. */
export type LevelUpCard = LevelUp & {
  name: string
  classId: string
  /** Max HP now, after the gain. */
  maxHpNow: number
  /** Ability scores now, after the gains. */
  scores: Character['abilities']
  /** The proficiency bonus before and after (equal on most levels). */
  proficiencyFrom: number
  proficiencyTo: number
}

/** The level-ups waiting for the player, one card per member still in the party. */
export function levelUpCards(state: GameState): LevelUpCard[] {
  return state.levelUps.flatMap((up) => {
    const c = state.party.find((m) => m.id === up.characterId)
    if (!c) return []
    return [
      {
        ...up,
        name: c.name,
        classId: c.classId,
        maxHpNow: c.maxHp,
        scores: c.abilities,
        proficiencyFrom: proficiencyBonus(up.from),
        proficiencyTo: proficiencyBonus(up.to),
      },
    ]
  })
}
