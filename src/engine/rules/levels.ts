import type { Character, GameState } from '../../schema/state'
import { MAX_LEVEL } from '../../schema/types'
import { crDc, crLevel } from './challenge'
import {
  XP_BY_LEVEL,
  CR_WOUND_STEP,
  CONTRACT_PAY_PER_DAY,
  CONTRACT_PAY_PER_LEVEL,
  CONTRACT_TYPICAL_DAYS,
  CR_STANDARD,
} from '../constants'

// Levelled work (Plan 6 D1–D3): contracts, dungeons and lairs play at a level or challenge rating.
// Content is written at standard difficulty (CR_STANDARD); a CR moves every DC by the difference
// of the CR_DC table (rules/challenge.ts), and a level pays more.

/** What a CR adds to a check written at standard difficulty: crDc(cr) − crDc(CR_STANDARD). */
export const crOffset = (cr: number): number => crDc(cr) - crDc(CR_STANDARD)

/**
 * How much deeper wounds written at standard difficulty go at a CR (dungeon rooms, Plan 6 B):
 * 1 + CR_WOUND_STEP a CR above CR_STANDARD, never below 1, so a dungeon meant for a stronger party
 * hurts like one.
 */
export const crWound = (cr: number): number =>
  1 + CR_WOUND_STEP * Math.max(0, Math.floor(cr) - CR_STANDARD)

/**
 * The XP a member of this level needs to reach the next (XP_BY_LEVEL); at the top level, the last
 * step's. What dungeons and lairs pay a share of (Plan 6 B).
 */
export function levelGap(level: number): number {
  const at = Math.max(1, Math.min(XP_BY_LEVEL.length - 1, Math.floor(level)))
  return XP_BY_LEVEL[at] - XP_BY_LEVEL[at - 1]
}

/** The challenge rating a level of work is (the lowest CR meant for a party of that level). */
export function levelCr(level: number): number {
  let cr = 0
  while (crLevel(cr) < level && cr < MAX_LEVEL * 2) cr++
  return cr
}

/** The founders' best level (alive or dead): what the work on offer is pitched at. At least 1. */
export const founderLevel = (party: readonly Pick<Character, 'hired' | 'level'>[]): number =>
  Math.max(1, ...party.filter((c) => !c.hired).map((c) => c.level))

/** A contract's pay multiplier at a level: 1 at level 1, + CONTRACT_PAY_PER_LEVEL a level. */
export const levelPay = (level: number): number => 1 + CONTRACT_PAY_PER_LEVEL * (level - 1)

/**
 * What a typical contract of this level pays (CONTRACT_TYPICAL_DAYS steady days of pay): the
 * yardstick for a dungeon's hoard ("the reward of overworld work of the same level").
 */
export const typicalPay = (level: number): number =>
  Math.ceil(CONTRACT_PAY_PER_DAY * CONTRACT_TYPICAL_DAYS * levelPay(level))

/**
 * What a contract's level adds to its checks: crOffset of its CR, never below 0 (low-level work
 * is as written). Played at its site (a bounty's or errand's) and in hostile encounters on the
 * road while it is held (jobDc).
 */
export const contractDc = (level: number): number => Math.max(0, crOffset(levelCr(level)))

/** The DC the party's unmet contracts add to hostile road encounters: the highest of them. */
export const jobDc = (state: Pick<GameState, 'contracts'>): number =>
  Math.max(0, ...state.contracts.filter((c) => !c.met).map((c) => contractDc(c.level)))

/** How much deeper a contract's level makes wounds (crWound of its CR; Plan 6 B). */
export const contractWound = (level: number): number => crWound(levelCr(level))

/** How much deeper the party's unmet contracts make wounds in hostile road encounters. */
export const jobWound = (state: Pick<GameState, 'contracts'>): number =>
  Math.max(1, ...state.contracts.filter((c) => !c.met).map((c) => contractWound(c.level)))
