import type { Content } from '../../content/build'
import type {
  ClassAbility,
  CombatState,
  CombatUnit,
  Dice,
  LastingEffect,
} from '../../schema/combat'
import type { Character, GameState } from '../../schema/state'
import type { Ability, LogTone } from '../../schema/types'
import type { Draw } from '../rng'
import { SMITE_UPCAST_DIE, WHOLE_FIGHT_ROUNDS } from '../constants'
import { attackSpec, type AttackSpec } from './attack'
import { canEnter, distance, sideUnits, standing, unitById, unitsOn, withUnit } from './line'
import { discordIntent, fleeIntent } from './intents'
import {
  abilityAsHeld,
  knownAbilities,
  lowestSpellUse,
  maxUses,
  spellCasts,
  spellKey,
  spellLevel,
  spellUsesLeft,
  spend,
  usesLeft,
} from './uses'

// Class abilities in a fight (Plan 7 Track C, combat design §5): the 1–9 slots. Each slot lists
// its legal uses with what each would do (`abilitySlots`), and `useAbility` resolves a use from
// the same numbers: an AttackSpec for Smite, a save's chance for Turn Undead, a heal's range.
// Preview == actual, as for attacks. Uses are spent from `Character.spent` (combat/uses.ts) and
// come back on a long rest.

/** One legal use of an ability: where, at whom, and what it would do. */
export type AbilityUse = {
  /** The tile it acts on: a move's destination, a tile or the nearer of two, a target's tile. */
  tile: number | null
  /** The unit it is aimed at (self, an ally or an enemy), or null for the party or a tile. */
  target: string | null
  /** Each unit it would affect, and the chance it does (1, or a failed save's chance). */
  affects: { unit: string; chance: number }[]
  /** HP healed [min, max] (Lay on Hands: exactly what it will heal). */
  heal: [number, number] | null
  /** Smite: the weapon attack, its extra dice included. */
  attack: AttackSpec | null
  /** Smite: the spell level of the use it spends on a hit. */
  spellLevel: number | null
}

/** One of a member's 1–9 slots in a fight: an ability, its uses and its legal uses now. */
export type AbilitySlot = {
  /** The key that selects it (1–9). */
  key: number
  ability: ClassAbility
  /** Uses left until a long rest (a pool's HP; Smite: spell uses left in all). */
  left: number
  max: number
  /** Takes the member's action, or is free. */
  action: 'action' | 'free'
  available: boolean
  /** Why it can't be used now, or null. */
  reason: string | null
  uses: AbilityUse[]
}

/** The tiles a two-tile area covers from its nearer tile: that one and the next one away. */
export const areaTiles = (combat: CombatState, user: CombatUnit, tile: number): number[] => {
  const dir = Math.sign(tile - user.tile) || 1
  const next = tile + dir
  return next >= 0 && next < combat.line ? [tile, next] : [tile]
}

/** A save's failure chance: d20 + modifier below the DC. */
export const failChance = (dc: number, modifier: number): number =>
  Math.min(1, Math.max(0, (dc - modifier - 1) / 20))

/** An enemy's save modifier: WIS (morale's), 0 for the rest. */
const saveModifier = (u: CombatUnit, ability: Ability): number => (ability === 'wis' ? u.wis : 0)

/** Whether an enemy is of the creature type an ability is limited to. */
function fits(ability: ClassAbility, u: CombatUnit, content: Content): boolean {
  if (!ability.only) return true
  const creature = u.creature && Object.hasOwn(content.creatures, u.creature)
  return creature ? content.creatures[u.creature!].type === ability.only : false
}

/** Smite's dice at a spell level: its own, plus SMITE_UPCAST_DIE for each level above 1. */
function smiteDice(ability: ClassAbility, level: number): Dice[] {
  const dice = ability.effects.flatMap((e) => (e.effect === 'damage' ? [e.dice] : []))
  return level > 1 ? [...dice, { count: level - 1, die: SMITE_UPCAST_DIE, bonus: 0 }] : dice
}

const healEffect = (ability: ClassAbility) => ability.effects.find((e) => e.effect === 'heal')
const poolEffect = (ability: ClassAbility) => ability.effects.find((e) => e.effect === 'healPool')

/** The legal uses of an ability by a unit now (ignoring uses left and the action). */
export function abilityUses(
  combat: CombatState,
  user: CombatUnit,
  member: Character,
  ability: ClassAbility,
  content: Content
): AbilityUse[] {
  const none: Pick<AbilityUse, 'affects' | 'heal' | 'attack' | 'spellLevel'> = {
    affects: [],
    heal: null,
    attack: null,
    spellLevel: null,
  }
  const inRange = (tile: number) => {
    const d = distance(user.tile, tile)
    return d >= ability.range[0] && d <= ability.range[1]
  }
  const kinds = ability.effects.map((e) => e.effect)
  const lasting = (u: CombatUnit) => ({ unit: u.id, chance: 1 })
  // A heal: the target's missing HP caps it.
  const healOn = (u: CombatUnit): [number, number] | null => {
    const missing = u.maxHp - u.hp
    if (missing <= 0) return null
    const pool = poolEffect(ability)
    if (pool) {
      const left = usesLeft(member, ability)
      return left > 0 ? [Math.min(missing, left), Math.min(missing, left)] : null
    }
    const h = healEffect(ability)
    if (!h || h.effect !== 'heal') return null
    const plus = h.dice.bonus + Math.floor(h.perLevel * user.level)
    return [h.dice.count + plus, h.dice.count * h.dice.die + plus]
  }
  switch (ability.target) {
    case 'self': {
      if (kinds.includes('move')) {
        const move = ability.effects.find((e) => e.effect === 'move')!
        const reach = move.effect === 'move' ? move.tiles : 1
        const tiles: number[] = []
        for (const dir of [-1, 1]) {
          for (let s = 1; s <= reach; s++) {
            const to = user.tile + dir * s
            // No passing through enemies; the last tile must have room.
            if (to < 0 || to >= combat.line || unitsOn(combat, to, 'enemy').length > 0) break
            if (s >= ability.range[0] && canEnter(combat, user, to)) tiles.push(to)
          }
        }
        return tiles.sort((a, b) => a - b).map((to) => ({ ...none, tile: to, target: user.id }))
      }
      if (kinds.includes('heal')) {
        const heal = healOn(user)
        return heal ? [{ ...none, tile: user.tile, target: user.id, heal }] : []
      }
      return [{ ...none, tile: user.tile, target: user.id, affects: [lasting(user)] }]
    }
    case 'ally':
      return sideUnits(combat, 'party')
        .filter((u) => inRange(u.tile))
        .flatMap((u): AbilityUse[] => {
          if (kinds.includes('heal') || kinds.includes('healPool')) {
            const heal = healOn(u)
            return heal ? [{ ...none, tile: u.tile, target: u.id, heal }] : []
          }
          return [{ ...none, tile: u.tile, target: u.id, affects: [lasting(u)] }]
        })
    case 'party': {
      if (kinds.includes('heal')) {
        // One roll heals every member who lacks HP (each up to their max).
        const hurt = sideUnits(combat, 'party').filter((u) => u.hp < u.maxHp)
        const heal = hurt.length > 0 ? healOn(hurt[0]) : null
        if (!heal) return []
        const h = healEffect(ability)!
        const plus = h.effect === 'heal' ? h.dice.bonus + Math.floor(h.perLevel * user.level) : 0
        const range: [number, number] =
          h.effect === 'heal' ? [h.dice.count + plus, h.dice.count * h.dice.die + plus] : heal
        return [{ ...none, tile: null, target: null, affects: hurt.map(lasting), heal: range }]
      }
      return [
        { ...none, tile: null, target: null, affects: sideUnits(combat, 'party').map(lasting) },
      ]
    }
    case 'enemy': {
      const foes = sideUnits(combat, 'enemy').filter((u) => fits(ability, u, content))
      if (ability.roll?.roll === 'weapon') {
        const level = ability.spends === 'spell' ? lowestSpellUse(member) : null
        return foes
          .filter((u) => {
            const d = distance(user.tile, u.tile)
            return d >= user.reach[0] && d <= user.reach[1]
          })
          .map((u) => ({
            ...none,
            tile: u.tile,
            target: u.id,
            affects: [lasting(u)],
            attack: attackSpec(combat, user, u, {
              extraDice: smiteDice(ability, level ?? 1),
            }),
            spellLevel: level,
          }))
      }
      return foes
        .filter((u) => inRange(u.tile))
        .map((u) => ({ ...none, tile: u.tile, target: u.id, affects: [savedOn(ability, user, u)] }))
    }
    case 'tile':
    case 'twoTiles': {
      const tiles = [...new Set(sideUnits(combat, 'enemy').map((u) => u.tile))]
        .filter(inRange)
        .sort((a, b) => a - b)
      return tiles.flatMap((tile) => {
        const covered = ability.target === 'tile' ? [tile] : areaTiles(combat, user, tile)
        const hit = covered
          .flatMap((t) => unitsOn(combat, t, 'enemy'))
          .filter((u) => fits(ability, u, content))
        if (hit.length === 0) return []
        return [{ ...none, tile, target: null, affects: hit.map((u) => savedOn(ability, user, u)) }]
      })
    }
  }
}

/** The chance an ability lands on a unit: 1, or the chance it fails its save. */
function savedOn(ability: ClassAbility, user: CombatUnit, u: CombatUnit) {
  const roll = ability.roll
  const chance = roll?.roll === 'save' ? failChance(user.dc, saveModifier(u, roll.ability)) : 1
  return { unit: u.id, chance }
}

/** The member's abilities as slots 1–9, with their uses now (none outside an undecided fight). */
export function abilitySlots(
  state: Pick<GameState, 'combat' | 'party'>,
  content: Content,
  unitId: string
): AbilitySlot[] {
  const member = state.party.find((c) => c.id === unitId)
  if (!member) return []
  const combat = state.combat
  const user = combat ? unitById(combat, unitId) : undefined
  return knownAbilities(member, content)
    .slice(0, 9)
    .map((known, i) => {
      const ability = abilityAsHeld(known, member)
      const spell = ability.spends === 'spell'
      const levels = Array.from({ length: spellLevel(member) }, (_, l) => l + 1)
      const sum = (f: (level: number) => number) => levels.reduce((n, l) => n + f(l), 0)
      const left = spell ? sum((l) => spellUsesLeft(member, l)) : usesLeft(member, ability)
      const max = spell ? sum((l) => spellCasts(member, l)) : maxUses(member, ability)
      const uses =
        combat && user && combat.result === null && standing(user)
          ? abilityUses(combat, user, member, ability, content)
          : []
      const reason = refusal(combat, user, ability, left, uses)
      return {
        key: i + 1,
        ability,
        left,
        max,
        action: ability.action,
        available: reason === null,
        reason,
        uses,
      }
    })
}

/** Why an ability can't be used now (English), or null. */
function refusal(
  combat: CombatState | null,
  user: CombatUnit | undefined,
  ability: ClassAbility,
  left: number,
  uses: AbilityUse[]
): string | null {
  if (!combat || combat.result !== null || !user) return 'only in a fight'
  if (user.side !== 'party' || !standing(user)) return 'out of the fight'
  if (left <= 0) return ability.spends === 'spell' ? 'no spell uses left' : 'no uses left'
  const kinds = ability.effects.map((e) => e.effect)
  if (kinds.includes('extraAction')) return user.acted ? null : 'act first'
  if (kinds.includes('move') && user.moved) return 'already moved'
  if (ability.action === 'action' && user.acted) return 'already acted'
  if (ability.roll?.roll === 'weapon' && user.acted) return 'already acted'
  if (uses.length === 0)
    return kinds.includes('heal') || kinds.includes('healPool')
      ? 'no one needs healing'
      : 'no target in reach'
  return null
}

// ---------------------------------------------------------------------------------------------
// Resolving a use
// ---------------------------------------------------------------------------------------------

export type AbilityAction = {
  type: 'combatAbility'
  unit: string
  ability: string
  tile?: number
  target?: string
}

/** What resolving a use needs from the fight (combat/fight.ts passes its own). */
export type Resolvers = {
  log: (s: GameState, text: string, tone: LogTone) => GameState
  strike: (s: GameState, draw: Draw, spec: AttackSpec) => GameState
  setUnit: (s: GameState, u: CombatUnit) => GameState
  syncHp: (s: GameState, id: string, hp: number) => GameState
}

const combatOf = (s: GameState): CombatState => s.combat!
const unitOf = (s: GameState, id: string): CombatUnit => unitById(combatOf(s), id)!
const withMember = (s: GameState, c: Character): GameState => ({
  ...s,
  party: s.party.map((m) => (m.id === c.id ? c : m)),
})

/** The last round a lasting effect of `rounds` holds, starting this round. */
const untilRound = (round: number, rounds: number) =>
  rounds >= WHOLE_FIGHT_ROUNDS ? 999 : round + rounds - 1

/** Resolves a use of an ability, from the same numbers `abilitySlots` shows. */
export function useAbility(
  s: GameState,
  draw: Draw,
  action: AbilityAction,
  content: Content,
  r: Resolvers
): GameState {
  const slot = abilitySlots(s, content, action.unit).find((x) => x.ability.id === action.ability)
  if (!slot || !slot.available) return s
  const use =
    slot.uses.find(
      (u) =>
        (action.target === undefined || u.target === action.target) &&
        (action.tile === undefined || u.tile === action.tile)
    ) ?? null
  if (!use) return s
  const ability = slot.ability
  let next = s
  const user = unitOf(next, action.unit)
  const member = next.party.find((c) => c.id === user.id)!
  const kinds = ability.effects.map((e) => e.effect)
  const name = ability.name
  // Smite: the weapon attack, and a spell use spent on a hit.
  if (use.attack) {
    next = r.log(next, `${user.name} uses ${name}.`, 'info')
    const logged = combatOf(next).log.length
    next = r.strike(next, draw, use.attack)
    const record = combatOf(next)
      .log.slice(logged)
      .find((e) => e.attack?.attacker === user.id)?.attack
    if (record?.hit && use.spellLevel !== null) {
      const m = next.party.find((c) => c.id === user.id)!
      next = withMember(next, spend(m, spellKey(use.spellLevel)))
    }
    const u = unitOf(next, user.id)
    return standing(u) ? r.setUnit(next, { ...u, acted: true }) : next
  }
  // Spend the use (a pool spends what it heals).
  const cost = poolEffect(ability) ? (use.heal?.[0] ?? 0) : 1
  next = withMember(next, spend(member, ability.id, cost))
  if (kinds.includes('move') && use.tile !== null) {
    next = r.setUnit(next, { ...unitOf(next, user.id), tile: use.tile, moved: true })
    return r.log(next, `${user.name} uses ${name}, slipping to tile ${use.tile + 1}.`, 'info')
  }
  if (kinds.includes('extraAction')) {
    next = r.setUnit(next, { ...unitOf(next, user.id), acted: false })
    return r.log(next, `${user.name} uses ${name}: one more action.`, 'good')
  }
  if (use.heal) {
    // A heal rolls its dice once (a pool heals exactly its preview) for every target.
    const h = healEffect(ability)
    let amount = use.heal[0]
    if (h && h.effect === 'heal') {
      amount = h.dice.bonus + Math.floor(h.perLevel * user.level)
      for (let i = 0; i < h.dice.count; i++) amount += draw.int(1, h.dice.die)
    }
    const ids = use.target ? [use.target] : use.affects.map((a) => a.unit)
    const healed: string[] = []
    for (const id of ids) {
      const target = unitOf(next, id)
      const hp = Math.min(target.maxHp, target.hp + amount)
      next = r.syncHp(r.setUnit(next, { ...target, hp }), target.id, hp)
      healed.push(`${target.name} +${hp - target.hp} HP`)
    }
    next = r.log(next, `${user.name} uses ${name}: ${healed.join(', ')}.`, 'good')
    return spendAction(next, user.id, ability, r)
  }
  // Lasting effects, each on a failed save where there is one.
  const lasting = ability.effects.filter(
    (e) => !['heal', 'healPool', 'move', 'extraAction'].includes(e.effect)
  )
  const round = combatOf(next).round
  const landed: string[] = []
  for (const { unit: id } of use.affects) {
    const roll = ability.roll
    let lands = true
    // A save fails below the DC: the preview's chance is failChance of the same numbers.
    if (roll?.roll === 'save') {
      const t = unitOf(next, id)
      lands = draw.int(1, 20) + saveModifier(t, roll.ability) < user.dc
    }
    if (!lands) continue
    const t = unitOf(next, id)
    const effects: LastingEffect[] = lasting.map((effect) => ({
      source: ability.id,
      by: user.id,
      effect,
      until: untilRound(round, ability.rounds),
    }))
    let changed: CombatUnit = { ...t, effects: [...t.effects, ...effects] }
    const c = withUnit(combatOf(next), changed)
    if (t.side === 'enemy' && kinds.includes('fear'))
      changed = { ...changed, intent: fleeIntent(c, changed) }
    else if (t.side === 'enemy' && kinds.includes('discord'))
      changed = { ...changed, intent: discordIntent(c, changed, content) }
    next = r.setUnit(next, changed)
    landed.push(t.name)
  }
  const affected = use.affects.length
  const text =
    landed.length === 0
      ? `${user.name} uses ${name}, but it takes no hold.`
      : `${user.name} uses ${name}: ${landed.join(', ')}${
          affected > landed.length ? ` (${affected - landed.length} resist)` : ''
        }.`
  next = r.log(next, text, landed.length > 0 ? 'good' : 'bad')
  return spendAction(next, user.id, ability, r)
}

/** An ability that takes an action uses the member's action. */
function spendAction(s: GameState, id: string, ability: ClassAbility, r: Resolvers): GameState {
  if (ability.action !== 'action') return s
  const u = unitOf(s, id)
  return standing(u) ? r.setUnit(s, { ...u, acted: true }) : s
}
