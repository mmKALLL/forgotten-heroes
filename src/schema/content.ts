import { z } from 'zod'
import { AbilityScoresSchema, IdSchema, SkillSchema, SourceSchema } from './common'

export const ClassDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  baseAbilities: AbilityScoresSchema,
  skillProficiencies: z.array(SkillSchema),
})
export type ClassDef = z.infer<typeof ClassDefSchema>

export const AncestryDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  playable: z.boolean(),
})
export type AncestryDef = z.infer<typeof AncestryDefSchema>

export const NameTableSchema = z.object({
  id: IdSchema,
  ancestries: z.array(IdSchema).describe('Ancestry ids this table names; others fall back to any table'),
  given: z.array(z.string()).min(1),
  family: z.array(z.string()).default([]),
})
export type NameTable = z.infer<typeof NameTableSchema>

export const SettlementTypeDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  category: z.enum(['lifeplace', 'traders', 'military', 'other']),
  minPopulation: z.number().int().min(0),
  maxPopulation: z.number().int().min(0),
  maxServices: z.number().int().min(0),
  ratio: z.number().min(0).describe('Relative frequency among settlements in a country'),
  hostileChance: z.number().min(0).max(1),
  predominantAncestry: IdSchema,
})
export type SettlementTypeDef = z.infer<typeof SettlementTypeDefSchema>

export const ServiceDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  presenceThresholdBySize: z
    .array(z.number().int().min(0))
    .length(6)
    .describe(
      'Per settlement size tier (smallest first): the service exists if 1d20 + the settlement wealth bonus exceeds this value (then a further 90% chance). Values above 20 need a wealth bonus, e.g. a prosperous wizard hamlet with a university. From the prototype; needs tuning.'
    ),
  itemSaleTags: z.array(z.string()),
  typicalRarity: z.number().min(0).max(1),
  maxRarity: z.number().min(0).max(1),
})
export type ServiceDef = z.infer<typeof ServiceDefSchema>

export const CONTENT_KINDS = {
  classes: ClassDefSchema,
  ancestries: AncestryDefSchema,
  names: NameTableSchema,
  settlementTypes: SettlementTypeDefSchema,
  services: ServiceDefSchema,
} as const
export type ContentKind = keyof typeof CONTENT_KINDS
export type ContentEntry<K extends ContentKind> = z.infer<(typeof CONTENT_KINDS)[K]>

export function contentFileSchema<K extends ContentKind>(kind: K) {
  return z.object({
    $schema: z.string().optional(),
    kind: z.literal(kind),
    source: SourceSchema,
    notes: z.string().optional(),
    entries: z.array(CONTENT_KINDS[kind]),
  })
}
