import { z } from 'zod'
import { AbilitySchema, IdSchema, LogToneSchema, PositionSchema } from './common'
import { FightSchema } from './encounter'
import {
  ARMOUR_GRADES,
  COMBAT_RESULTS,
  COMBAT_SIDES,
  CREATURE_SIZES,
  ENEMY_ROLES,
  MAX_LEVEL,
  SPELL_POOLS,
  WEAPON_FAMILIES,
  WEAPON_QUALITIES,
} from './types'

// Linear combat (Plan 7, docs/plans/2026-11-13-combat-design.md). The content kinds (weapons,
// armours, enemy roles, class abilities, spells and summons) and the open fight in GameState.
// The rules that read them are src/engine/combat/; their numbers are in src/engine/constants.ts.

export const WeaponFamilySchema = z.enum(WEAPON_FAMILIES)
export const WeaponQualitySchema = z.enum(WEAPON_QUALITIES)
export const ArmourGradeSchema = z.enum(ARMOUR_GRADES)
export const EnemyRoleSchema = z.enum(ENEMY_ROLES)
export const CreatureSizeSchema = z.enum(CREATURE_SIZES)
export const SpellPoolSchema = z.enum(SPELL_POOLS)
export const CombatSideSchema = z.enum(COMBAT_SIDES)

/** A tile distance band, [nearest, farthest], e.g. a bow's [3, 5]. */
export const RangeSchema = z
  .tuple([z.number().int().min(0).max(8), z.number().int().min(0).max(8)])
  .refine(([a, b]) => a <= b, { message: 'a range is [nearest, farthest]' })

/** Damage dice: `count`d`die` + `bonus`, e.g. 2d6+3. A critical hit doubles the dice. */
export const DiceSchema = z.object({
  count: z.number().int().min(1).max(20),
  die: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  bonus: z.number().int().default(0),
})
export type Dice = z.infer<typeof DiceSchema>

// ---------------------------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------------------------

export const WeaponSchema = z.object({
  id: IdSchema,
  name: z.string(),
  family: WeaponFamilySchema.describe('Its die, reach, full action and trait (constants)'),
  quality: WeaponQualitySchema.default('plain').describe('Fine is +1 to hit; magic +1/+2'),
  price: z.number().min(0).optional().describe('gp at a smith (Track C)'),
  weight: z.number().min(0).optional().describe('kg (Track C)'),
})
export type Weapon = z.infer<typeof WeaponSchema>

export const ArmourSchema = z.object({
  id: IdSchema,
  name: z.string(),
  grade: ArmourGradeSchema.describe('Its AC and DEX cap (constants)'),
  price: z.number().min(0).optional().describe('gp at an armourer (Track C)'),
  weight: z.number().min(0).optional().describe('kg (Track C)'),
})
export type Armour = z.infer<typeof ArmourSchema>

// ---------------------------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------------------------

/** One row of a role's stat table: what a creature of this role has from this CR up. */
export const RoleStatsSchema = z.object({
  cr: z.number().min(0),
  hp: z.number().int().min(1),
  ac: z.number().int().min(1),
  toHit: z.number().int(),
  damage: DiceSchema,
  wis: z.number().int().describe('Its WIS save modifier (morale)'),
})
export type RoleStats = z.infer<typeof RoleStatsSchema>

/** An enemy role (combat design §6) and its stat table by CR. The id is the role. */
export const EnemyRoleDefSchema = z.object({
  id: EnemyRoleSchema,
  name: z.string(),
  favoured: RangeSchema.describe('The distance it tries to keep from the nearest member'),
  reach: RangeSchema.describe('The distances its attack reaches'),
  stats: z
    .array(RoleStatsSchema)
    .min(1)
    .refine((rows) => rows.every((r, i) => i === 0 || rows[i - 1].cr < r.cr), {
      message: 'rows go by rising CR',
    })
    .describe('By rising CR: a creature takes the last row at or below its CR'),
})
export type EnemyRoleDef = z.infer<typeof EnemyRoleDefSchema>

// ---------------------------------------------------------------------------------------------
// Abilities, spells and summons (shapes for Tracks C and S; the engine reads them later)
// ---------------------------------------------------------------------------------------------

/**
 * Who or what an ability or spell is aimed at: itself, one member, every member still fighting,
 * one enemy, or every unit on one tile or on two adjacent tiles (an area: allies on it too).
 */
export const CombatTargetSchema = z.enum(['self', 'ally', 'party', 'enemy', 'tile', 'twoTiles'])

/**
 * What an ability or spell does: small typed objects the engine interprets (no functions). Each
 * applies to every target; the lasting ones (toHit, damageBonus, ac, tempHp, ward, vulnerable,
 * the conditions, wall and hazard) last the user's `rounds`. Amounts are signed: toHit −2 on an
 * enemy is a curse, ac +2 on a member a ward.
 */
export const CombatEffectSchema = z.discriminatedUnion('effect', [
  z.object({ effect: z.literal('damage'), dice: DiceSchema }),
  z.object({
    effect: z.literal('heal'),
    dice: DiceSchema,
    perLevel: z
      .number()
      .min(0)
      .default(0)
      .describe("Plus this many HP per the user's level, rounded down (Second Wind: 1d10 + level)"),
  }),
  z.object({ effect: z.literal('toHit'), amount: z.number().int() }),
  z.object({ effect: z.literal('damageBonus'), amount: z.number().int() }),
  z.object({ effect: z.literal('move'), tiles: z.number().int().min(1).max(4) }),
  z.object({ effect: z.literal('push'), tiles: z.number().int().min(1).max(4) }),
  z.object({ effect: z.literal('pull'), tiles: z.number().int().min(1).max(4) }),
  z.object({ effect: z.literal('stagger') }),
  z.object({ effect: z.literal('stun') }),
  z.object({ effect: z.literal('extraAction') }),
  z.object({
    effect: z.literal('summon'),
    summon: IdSchema.describe('The beast or celestial a good or neutral caster calls'),
    evil: IdSchema.optional().describe('The undead an evil caster calls instead'),
  }),
  // Track S (spells) added the rest; the engine plays none of them yet.
  z.object({ effect: z.literal('ac'), amount: z.number().int() }),
  z.object({ effect: z.literal('tempHp'), dice: DiceSchema }),
  /** Each hit the target takes is this much lower (at least 0). */
  z.object({ effect: z.literal('ward'), amount: z.number().int().min(1) }),
  /** Each hit the target takes is this much higher. */
  z.object({ effect: z.literal('vulnerable'), amount: z.number().int().min(1) }),
  /** A downed member (0 HP, not dead) gets back up with this many HP. */
  z.object({ effect: z.literal('revive'), dice: DiceSchema }),
  /** Its attacks are at disadvantage and reach only the next tile. */
  z.object({ effect: z.literal('blind') }),
  /** It can't move: no step, charge or hit and run; an intent that needs a move breaks. */
  z.object({ effect: z.literal('rooted') }),
  /** It won't come closer or attack: on its turn it moves a tile away from the other side. */
  z.object({ effect: z.literal('fear') }),
  /** Its intent turns on its own side (the nearest one it can reach), or it repositions. */
  z.object({ effect: z.literal('discord') }),
  /** Attacks against the target are at disadvantage. */
  z.object({ effect: z.literal('conceal') }),
  /** It leaves the line (it can't act or be attacked), then returns to its tile or the nearest free one. */
  z.object({ effect: z.literal('banish') }),
  /** A wall stands on the tile: no unit may move into or across it, and no attack passes it. */
  z.object({ effect: z.literal('wall') }),
  /** The tile hurts: units on it when cast, entering it or starting a turn on it take the dice. */
  z.object({ effect: z.literal('hazard'), dice: DiceSchema }),
  /** Every member still fighting leaves the line at once, without free swings: a retreat. */
  z.object({ effect: z.literal('escape') }),
  // Track C (class abilities) added these; the engine plays them (combat/abilities.ts).
  /**
   * Heals what the target lacks from the user's pool of perLevel × level HP a long rest (Lay on
   * Hands); the pool is the ability's uses.
   */
  z.object({ effect: z.literal('healPool'), perLevel: z.number().int().min(1) }),
  /** The user's hits on the target deal these dice more (a ranger's Mark). */
  z.object({ effect: z.literal('mark'), dice: DiceSchema }),
  /** The target's attack rolls get +1d`die` (sign 1: Inspire) or −1d`die` (sign −1: Cutting Words). */
  z.object({
    effect: z.literal('rollDie'),
    die: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    sign: z.union([z.literal(1), z.literal(-1)]),
  }),
])
export type CombatEffect = z.infer<typeof CombatEffectSchema>

/**
 * How the effects land: always (no roll), on a hit with an attack (d20 + the casting ability and
 * proficiency against AC), or on each target that fails a save against the user's DC. A target
 * that saves takes half the damage of a `half` spell, and nothing else.
 */
export const CombatRollSchema = z.discriminatedUnion('roll', [
  z.object({ roll: z.literal('attack') }),
  /** The user's own weapon attack (single, not the full action); damage effects add to its dice. */
  z.object({ roll: z.literal('weapon') }),
  z.object({ roll: z.literal('save'), ability: AbilitySchema, half: z.boolean().default(false) }),
])
export type CombatRoll = z.infer<typeof CombatRollSchema>

const usedFields = {
  description: z.string(),
  target: CombatTargetSchema,
  range: RangeSchema.default([0, 0]).describe('Tiles from the user (0: its own tile)'),
  effects: z.array(CombatEffectSchema).min(1),
  action: z
    .enum(['action', 'free'])
    .default('action')
    .describe('Spells and abilities take an action unless free'),
  roll: CombatRollSchema.optional().describe('An attack or a save; none: it always lands'),
  rounds: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(1)
    .describe('How long the lasting effects last (1: this round; 10: the whole fight)'),
}

export const ClassAbilitySchema = z.object({
  id: IdSchema,
  name: z.string(),
  classId: IdSchema,
  level: z.number().int().min(1).max(MAX_LEVEL).describe('The level it is gained at'),
  ...usedFields,
  spends: z
    .enum(['uses', 'spell'])
    .default('uses')
    .describe("What it spends: its own uses, or one of the user's spell uses (Smite)"),
  only: z
    .string()
    .optional()
    .describe('It affects only creatures of this type (Turn Undead: "undead")'),
  specialised: z
    .object({
      description: z.string(),
      target: CombatTargetSchema.optional(),
      range: RangeSchema.optional(),
      effects: z.array(CombatEffectSchema).min(1).optional(),
    })
    .optional()
    .describe("What a bard's specialisation pick changes (level-up choices)"),
})
export type ClassAbility = z.infer<typeof ClassAbilitySchema>

export const SpellSchema = z.object({
  id: IdSchema,
  name: z.string(),
  pool: SpellPoolSchema,
  level: z.number().int().min(1).max(9),
  ...usedFields,
})
export type Spell = z.infer<typeof SpellSchema>

/**
 * A summon (divine): a temporary party member for one fight. Its role gives its favoured range
 * and its trick as for enemies (a brute charges, a skirmisher hits and runs, an archer volleys,
 * a caster strikes a tile, a leader rallies).
 */
export const SummonSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string().default(''),
  level: z.number().int().min(1).max(9).describe('The spell level whose pool holds it'),
  kind: z
    .enum(['beast', 'celestial', 'undead'])
    .describe('Good or neutral clerics call beasts or celestials, evil ones undead'),
  role: EnemyRoleSchema.default('brute'),
  size: CreatureSizeSchema.default('medium'),
  hp: z.number().int().min(1),
  ac: z.number().int().min(1),
  toHit: z.number().int(),
  damage: DiceSchema,
  reach: RangeSchema.default([1, 1]),
})
export type Summon = z.infer<typeof SummonSchema>

// ---------------------------------------------------------------------------------------------
// The open fight (GameState.combat)
// ---------------------------------------------------------------------------------------------

/**
 * An enemy's telegraphed action (combat design §3), aimed at a tile, not a unit: it moves to
 * `from` first (at most one tile, two for a charge), then acts on `tile`. A `move` intent's tile
 * is where it goes. `twice`: a desperate boss acts twice.
 */
export const IntentSchema = z.object({
  kind: z.enum(['attack', 'charge', 'hitAndRun', 'volley', 'area', 'rally', 'move']),
  from: z.number().int().min(0),
  tile: z.number().int().min(0),
  twice: z.boolean().default(false),
})
export type Intent = z.infer<typeof IntentSchema>

/**
 * A lasting effect on a unit (Track C): what (`effect`), from which ability, by whom, and the last
 * round it holds (a new round past it clears it).
 */
export const LastingEffectSchema = z.object({
  source: IdSchema.describe('The ability (or spell) id'),
  by: z.string().describe('The unit that used it'),
  effect: CombatEffectSchema,
  until: z.number().int().min(1).describe('The last round it holds'),
})
export type LastingEffect = z.infer<typeof LastingEffectSchema>

export const UNIT_STATUSES = ['in', 'down', 'dead', 'fled', 'left'] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

/** One unit on the line: a member (id = character id) or an enemy (e1, e2, …). */
export const CombatUnitSchema = z.object({
  id: z.string(),
  side: CombatSideSchema,
  name: z.string(),
  tile: z.number().int().min(-1),
  size: CreatureSizeSchema,
  hp: z.number().int(),
  maxHp: z.number().int().min(1),
  ac: z.number().int(),
  toHit: z.number().int(),
  damage: DiceSchema,
  reach: RangeSchema,
  /** The lowest d20 face that is a critical hit (19 for daggers). */
  critMin: z.number().int().min(2).max(20).default(20),
  /** A member's weapon family; null for enemies. */
  family: WeaponFamilySchema.nullable().default(null),
  role: EnemyRoleSchema.nullable().default(null),
  creature: IdSchema.nullable().default(null),
  boss: z.boolean().default(false),
  /** An enemy's WIS save (morale). */
  wis: z.number().int().default(0),
  /** In the fight, or out of it: down (0 HP), dead, fled (enemies) or left (retreated members). */
  status: z.enum(UNIT_STATUSES).default('in'),
  /** This party turn: moved a tile; used its action. */
  moved: z.boolean().default(false),
  acted: z.boolean().default(false),
  /** Hits taken this party turn (enemies): toward stagger and stun. */
  hits: z.number().int().min(0).default(0),
  /** Staggered by a trait (a mace's hit) whatever the hit count, until its turn has passed. */
  staggered: z.boolean().default(false),
  intent: IntentSchema.nullable().default(null),
  /** A member's level (abilities that scale with it); 1 for enemies. */
  level: z.number().int().min(1).default(1),
  /** A member's DC for abilities with a save: 8 + proficiency + the casting ability. */
  dc: z.number().int().default(10),
  /** Wears armour they aren't trained in: their attacks are at disadvantage. */
  untrained: z.boolean().default(false),
  /** A fighter's style picks: this much more damage on each attack of their full action. */
  fullDamage: z.number().int().min(0).default(0),
  /** Lasting effects of abilities (and later spells) on the unit. */
  effects: z.array(LastingEffectSchema).default([]),
})
export type CombatUnit = z.infer<typeof CombatUnitSchema>

/** An attack's record in the fight's log: the odds it was rolled at and what came of it. */
export const AttackRecordSchema = z.object({
  attacker: z.string(),
  target: z.string(),
  /** The hit chance the roll was made at (the preview's). */
  chance: z.number().min(0).max(1),
  kept: z.number().int().min(1).max(20),
  modifier: z.number().int(),
  hit: z.boolean(),
  crit: z.boolean(),
  /** The damage range the roll was made at: a hit's, or a crit's. */
  range: z.tuple([z.number().int(), z.number().int()]),
  damage: z.number().int().min(0),
})
export type AttackRecord = z.infer<typeof AttackRecordSchema>

export const CombatLogEntrySchema = z.object({
  text: z.string(),
  tone: LogToneSchema,
  attack: AttackRecordSchema.optional(),
})
export type CombatLogEntry = z.infer<typeof CombatLogEntrySchema>

export const CombatStateSchema = z.object({
  /** The line's length in tiles; tile 0 is the party's end. */
  line: z.number().int().min(5).max(8),
  round: z.number().int().min(1),
  units: z.array(CombatUnitSchema),
  /** The party's footing for the whole fight: Edge (advantage) or Exposed (disadvantage). */
  footing: PositionSchema.default('normal'),
  /** The surprise roll: a free round for one side, only half the party in round 1, or none. */
  surprise: z.enum(['party', 'enemy', 'half', 'none']).default('none'),
  /** With `half`: the members who may act in round 1. */
  firstMovers: z.array(z.string()).default([]),
  /** The enemy group's size at the start (morale thresholds). */
  groupSize: z.number().int().min(1),
  /** Morale: not yet tested, held, or broke (a rout). It is tested once, at its threshold. */
  morale: z.enum(['untested', 'held', 'broke']).default('untested'),
  /** The fight as it was set (the situation's `fight`), for its outcome branches. */
  fight: FightSchema.nullable().default(null),
  result: z.enum(COMBAT_RESULTS).nullable().default(null),
  log: z.array(CombatLogEntrySchema).default([]),
})
export type CombatState = z.infer<typeof CombatStateSchema>
