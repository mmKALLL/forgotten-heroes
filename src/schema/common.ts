import { z } from 'zod'
import {
  ABILITIES,
  ALIGNMENTS,
  BIOMES,
  CONTRACT_KINDS,
  CREATURE_TYPES,
  DISPOSITIONS,
  GOOD_CATEGORIES,
  GOODS,
  LOG_TONES,
  PACES,
  POI_CATEGORIES,
  POSITIONS,
  SERVICE_ACTIONS,
  SERVICE_FUNCTIONS,
  SIZE_TIERS,
  SKILLS,
  STANDINGS,
} from './types'

export const SOURCES = ['original', 'imported', 'imported-private', 'procedural', 'claude'] as const
export const SourceSchema = z.enum(SOURCES)
export type Source = z.infer<typeof SourceSchema>

export const IdSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids must be kebab-case')

export const AbilitySchema = z.enum(ABILITIES)
export const SkillSchema = z.enum(SKILLS)
export const PositionSchema = z.enum(POSITIONS)
export const LogToneSchema = z.enum(LOG_TONES)
export const CreatureTypeSchema = z.enum(CREATURE_TYPES)
export const BiomeSchema = z.enum(BIOMES)
export const SizeTierSchema = z.enum(SIZE_TIERS)
export const AlignmentSchema = z.enum(ALIGNMENTS)
export const GoodSchema = z.enum(GOODS)
export const GoodCategorySchema = z.enum(GOOD_CATEGORIES)
export const ServiceFunctionSchema = z.enum(SERVICE_FUNCTIONS)
export const ServiceActionSchema = z.enum(SERVICE_ACTIONS)
export const ContractKindSchema = z.enum(CONTRACT_KINDS)
export const StandingSchema = z.enum(STANDINGS)
export const PaceSchema = z.enum(PACES)
export const DispositionSchema = z.enum(DISPOSITIONS)
export const PoiCategorySchema = z.enum(POI_CATEGORIES)

const score = z.number().int().min(1).max(30)
export const AbilityScoresSchema = z.object({
  str: score,
  dex: score,
  con: score,
  int: score,
  wis: score,
  cha: score,
})
