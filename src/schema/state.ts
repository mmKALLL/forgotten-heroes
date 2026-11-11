import { z } from 'zod'
import { AbilitySchema, AbilityScoresSchema, IdSchema, LogToneSchema, SkillSchema } from './common'
import { ABILITIES, SKILLS, TIERS } from './constants'

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  ancestry: IdSchema,
  classId: IdSchema,
  level: z.number().int().min(1).max(20),
  abilities: AbilityScoresSchema,
  skillProficiencies: z.array(SkillSchema),
  hitDie: z.number().int(),
  hp: z.number().int(),
  maxHp: z.number().int().min(1),
  exhaustion: z.number().int().min(0).max(6),
})
export type Character = z.infer<typeof CharacterSchema>

export const CheckStatSchema = z.enum([...SKILLS, ...ABILITIES])

export const RollRecordSchema = z.object({
  stat: CheckStatSchema,
  /** Set when the check overrides the skill's default ability, e.g. Intimidation (CHA). */
  ability: AbilitySchema.optional(),
  actorId: z.string(),
  dice: z.array(z.number().int().min(1).max(20)),
  kept: z.number().int(),
  keptIndex: z.number().int().min(0),
  modifier: z.number().int(),
  total: z.number().int(),
  dc: z.number().int(),
  mode: z.enum(['normal', 'advantage', 'disadvantage']),
  tier: z.enum(TIERS),
})
export type RollRecord = z.infer<typeof RollRecordSchema>

export const LogEntrySchema = z.object({
  day: z.number().int(),
  text: z.string(),
  tone: LogToneSchema,
})
export type LogEntry = z.infer<typeof LogEntrySchema>

export const GameStateSchema = z.object({
  version: z.literal(1),
  seed: z.number().int(),
  rng: z.object({ state: z.number().int().min(0).max(0xffffffff) }),
  day: z.number().int().min(1),
  party: z.array(CharacterSchema),
  gold: z.number().int(),
  inspiration: z.number().int().min(0),
  log: z.array(LogEntrySchema),
  lastRoll: RollRecordSchema.nullable(),
})
export type GameState = z.infer<typeof GameStateSchema>
