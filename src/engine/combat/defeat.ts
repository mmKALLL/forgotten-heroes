import type { Character, GameState, Goods } from '../../schema/state'
import { ABILITIES, GOODS, GOOD_CATEGORY, type Ability } from '../../schema/types'
import { withRng, type Draw } from '../rng'
import { MAX_EXHAUSTION } from '../rules/character'
import { smuggledShare, softenLoss } from '../rules/upgrades'
import {
  CAMARADERIE_DEATH,
  CAMARADERIE_DOWNED,
  CAMARADERIE_WIPE,
  DEATH_CHANCE,
  DOWNED_EXHAUSTION,
  INJURY_BASE,
  INJURY_DEATH_AFTER,
  INJURY_PER_OVERKILL,
  OLD_WOUND_PENALTY,
  WIPE_GOODS_TAKEN,
  WIPE_SMALL_PARTY,
  WIPE_STRUGGLE_INJURIES,
  WIPE_STRUGGLE_INJURIES_SMALL,
} from '../constants'

// Going down in a fight (combat design §7): a member at 0 HP is out of the fight, costs
// CAMARADERIE_DOWNED and DOWNED_EXHAUSTION (as outside fights: at 6 they die, gear lost), and may
// take a lasting injury (−OLD_WOUND_PENALTY to an ability, kept with the old wounds): INJURY_BASE plus
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

/** What going down would cost a member now: the intents and free swings that could drop them say so. */
export type DownedRisk = {
  exhaustion: number
  /** The exhaustion kills: the member dies, gear lost, with no injury roll. */
  fatal: boolean
  /** The camaraderie lost (negative), after the company banner. */
  camaraderie: number
  /** The injury and death chances at exactly 0 HP (the injury chance grows with the overkill). */
  injury: number
  death: number
}

export function downedRisk(
  state: Pick<GameState, 'party' | 'upgrades'>,
  member: Character
): DownedRisk {
  const fatal = member.exhaustion + DOWNED_EXHAUSTION >= MAX_EXHAUSTION
  const odds = defeatOdds(state, member, 0)
  return {
    exhaustion: DOWNED_EXHAUSTION,
    fatal,
    camaraderie: softenLoss(state, -CAMARADERIE_DOWNED),
    injury: fatal ? 0 : odds.injury,
    death: fatal ? 1 : odds.death,
  }
}

/** A downed member's exhaustion: DOWNED_EXHAUSTION more, at most MAX_EXHAUSTION (dead). */
export const exhaustDowned = (member: Character): Character => ({
  ...member,
  exhaustion: Math.min(MAX_EXHAUSTION, member.exhaustion + DOWNED_EXHAUSTION),
})

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

// ---------------------------------------------------------------------------------------------
// A wipe's choice (combat design §7; designer call 2026-11-14)
// ---------------------------------------------------------------------------------------------

// When the last member goes down, the player picks how the party gets out of it; each way costs
// CAMARADERIE_WIPE, and the living come to with 1 HP.
// - Surrender: WIPE_GOODS_TAKEN of each good but essentials (rounded down), and all the gold but
//   the smuggler's compartment's share (SMUGGLE_SHARE a level, at most all of it).
// - Struggle: WIPE_STRUGGLE_INJURIES lasting injuries (WIPE_STRUGGLE_INJURIES_SMALL for a party of
//   WIPE_SMALL_PARTY or fewer living members), each on a random living member (a different one
//   while any is left) and a random ability. They never kill: the third-injury death rule is for
//   going down, and struggling is the way out that keeps everyone.
// - Sacrifice: one living member the player picks stays behind and dies, gear lost; only with two
//   or more living members. The death also costs CAMARADERIE_DEATH, as any death.
// The struggle's injuries are drawn from the state's RNG as it stands: the preview peeks at the
// same draws the choice then makes, so it names them exactly (preview == actual).

export const WIPE_CHOICES = ['surrender', 'struggle', 'sacrifice'] as const
export type WipeChoice = (typeof WIPE_CHOICES)[number]

export type WipeInjury = { member: string; ability: Ability }

export type WipeOptions = {
  surrender: {
    /** The gold given up, and the gold the compartment keeps. */
    gold: number
    kept: number
    /** The goods given up, by good. */
    goods: Goods
    camaraderie: number
  }
  struggle: { injuries: WipeInjury[]; camaraderie: number }
  /** Who may stay behind (the player picks); null with one living member. */
  sacrifice: { members: string[]; camaraderie: number; death: number } | null
}

/** The living members of a party. */
export const livingOf = (party: readonly Character[]): Character[] =>
  party.filter((c) => c.exhaustion < MAX_EXHAUSTION)

/** The struggle's injuries: random living members (each once before any twice), random abilities. */
export function rollStruggle(draw: Draw, living: readonly Character[]): WipeInjury[] {
  if (living.length === 0) return []
  const count =
    living.length <= WIPE_SMALL_PARTY ? WIPE_STRUGGLE_INJURIES_SMALL : WIPE_STRUGGLE_INJURIES
  const injuries: WipeInjury[] = []
  let pool: Character[] = []
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool = [...living]
    const member = draw.pick(pool)
    pool = pool.filter((c) => c.id !== member.id)
    injuries.push({ member: member.id, ability: draw.pick(ABILITIES) })
  }
  return injuries
}

/** Each way out of a wipe, with exactly what it costs. */
export function wipeOptions(
  state: Pick<GameState, 'party' | 'gold' | 'goods' | 'upgrades' | 'rng'>
): WipeOptions {
  const alive = livingOf(state.party)
  const kept = Math.floor(state.gold * smuggledShare(state) + 1e-9)
  const goods: Goods = {}
  for (const g of GOODS) {
    if (GOOD_CATEGORY[g] === 'essentials') continue
    const n = Math.floor((state.goods[g] ?? 0) * WIPE_GOODS_TAKEN)
    if (n > 0) goods[g] = n
  }
  const camaraderie = softenLoss(state, -CAMARADERIE_WIPE)
  const [injuries] = withRng(state.rng, (draw) => rollStruggle(draw, alive))
  return {
    surrender: { gold: state.gold - kept, kept, goods, camaraderie },
    struggle: { injuries, camaraderie },
    sacrifice:
      alive.length >= 2
        ? {
            members: alive.map((c) => c.id),
            camaraderie,
            death: softenLoss(state, -CAMARADERIE_DEATH),
          }
        : null,
  }
}
