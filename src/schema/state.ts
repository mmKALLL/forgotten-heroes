import { z } from 'zod'
import {
  AbilitySchema,
  AbilityScoresSchema,
  IdSchema,
  LogToneSchema,
  PositionSchema,
  SkillSchema,
  SourceSchema,
} from './common'
import { ABILITIES, SKILLS, TIERS } from './constants'
import { SituationSchema } from './encounter'

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

export const EncounterLogEntrySchema = z.object({
  text: z.string(),
  tone: LogToneSchema,
  /** The roll behind this entry, so the UI can animate it. */
  roll: RollRecordSchema.optional(),
  highStakes: z.boolean().optional(),
})
export type EncounterLogEntry = z.infer<typeof EncounterLogEntrySchema>

export const EncounterStateSchema = z.object({
  /** A compiled snapshot (archetypes expanded, DCs numeric), so editing data never breaks a save. */
  situation: SituationSchema,
  source: SourceSchema,
  /** The current stage, or null once the encounter has ended. */
  stage: IdSchema.nullable(),
  position: PositionSchema,
  /** Slot values filled when the encounter started, e.g. { who: "a wary dwarf tinker" }. */
  slots: z.record(z.string(), z.string()),
  /** The hidden twist, rolled at the start. The UI must not show it. */
  twist: z.boolean(),
  twistRevealed: z.boolean(),
  /** "stage/option" keys of `once` options already chosen. */
  used: z.array(z.string()),
  log: z.array(EncounterLogEntrySchema),
})
export type EncounterState = z.infer<typeof EncounterStateSchema>

export const FollowUpSchema = z.object({
  situationId: IdSchema,
  /** Other encounters that must happen before this one is drawn. */
  wait: z.number().int().min(0),
})
export type FollowUp = z.infer<typeof FollowUpSchema>

/** One encounter check by one character. Strain (Plan 3) counts these per day and week. */
export const SkillUseSchema = z.object({
  day: z.number().int().min(1),
  characterId: z.string(),
  skill: SkillSchema,
})
export type SkillUse = z.infer<typeof SkillUseSchema>

export const GameStateSchema = z.object({
  version: z.literal(2),
  seed: z.number().int(),
  rng: z.object({ state: z.number().int().min(0).max(0xffffffff) }),
  day: z.number().int().min(1),
  party: z.array(CharacterSchema),
  gold: z.number().int(),
  inspiration: z.number().int().min(0),
  log: z.array(LogEntrySchema),
  lastRoll: RollRecordSchema.nullable(),
  encounter: EncounterStateSchema.nullable(),
  followUps: z.array(FollowUpSchema),
  skillUses: z.array(SkillUseSchema),
})
export type GameState = z.infer<typeof GameStateSchema>
