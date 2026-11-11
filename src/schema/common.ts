import { z } from 'zod'
import { ABILITIES, SKILLS } from '../engine/rules/abilities'

export const SOURCES = ['original', 'imported', 'imported-private', 'procedural', 'claude'] as const
export const SourceSchema = z.enum(SOURCES)
export type Source = z.infer<typeof SourceSchema>

export const IdSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids must be kebab-case')

export const AbilitySchema = z.enum(ABILITIES)
export const SkillSchema = z.enum(SKILLS)

const score = z.number().int().min(1).max(30)
export const AbilityScoresSchema = z.object({
  str: score,
  dex: score,
  con: score,
  int: score,
  wis: score,
  cha: score,
})
