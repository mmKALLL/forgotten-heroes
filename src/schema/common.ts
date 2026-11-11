import { z } from 'zod'
import { ABILITIES, CREATURE_TYPES, LOG_TONES, POSITIONS, SKILLS } from './constants'

export const SOURCES = ['original', 'imported', 'imported-private', 'procedural', 'claude'] as const
export const SourceSchema = z.enum(SOURCES)
export type Source = z.infer<typeof SourceSchema>

export const IdSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids must be kebab-case')

export const AbilitySchema = z.enum(ABILITIES)
export const SkillSchema = z.enum(SKILLS)
export const PositionSchema = z.enum(POSITIONS)
export const LogToneSchema = z.enum(LOG_TONES)
export const CreatureTypeSchema = z.enum(CREATURE_TYPES)

const score = z.number().int().min(1).max(30)
export const AbilityScoresSchema = z.object({
  str: score,
  dex: score,
  con: score,
  int: score,
  wis: score,
  cha: score,
})
