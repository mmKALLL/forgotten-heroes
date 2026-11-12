import { z } from 'zod'
import {
  BiomeSchema,
  ContractKindSchema,
  GoodSchema,
  IdSchema,
  PoiCategorySchema,
  ServiceActionSchema,
  ServiceFunctionSchema,
  StandingSchema,
} from './common'

// ---------------------------------------------------------------------------------------------
// Goods, markets and services (Plan 4). Weights are in kilograms, prices in gold pieces.
// ---------------------------------------------------------------------------------------------

/** One of the 15 goods of design §4: its unit, weight, base price and how fast it spoils. */
export const GoodDefSchema = z.object({
  id: GoodSchema,
  name: z.string(),
  unit: z.string().describe('What one unit is called, e.g. "ration" or "load"'),
  weight: z.number().min(0).describe('kg per unit'),
  price: z.number().min(0).describe('Base price in gp per unit, before supply and demand'),
  spoilPerDay: z
    .number()
    .min(0)
    .max(1)
    .default(0)
    .describe('The share of the units carried that spoils each day (food), 0 for none'),
  depth: z
    .number()
    .gt(0)
    .default(1)
    .describe('Market depth: how many units a market absorbs before bulk trades move the price'),
  uses: z.string().describe('What it is good for, shown in the UI'),
})
export type GoodDef = z.infer<typeof GoodDefSchema>

/**
 * What a service (a `services` id) does in the engine: its design §5 group, the goods it trades
 * and the actions it offers. A service with no role, or none of the actions, is "coming later".
 */
export const ServiceRoleSchema = z.object({
  id: IdSchema.describe('The services entry it describes'),
  function: ServiceFunctionSchema,
  trades: z.array(GoodSchema).default([]).describe('Goods it buys and sells'),
  buysOnly: z
    .array(GoodSchema)
    .default([])
    .describe('Goods it buys but never sells, e.g. a necromancer buys relics'),
  actions: z.array(ServiceActionSchema).default([]),
  specialty: z.string().optional().describe('A line of flavour shown with the service'),
})
export type ServiceRole = z.infer<typeof ServiceRoleSchema>

const level = z.number().int().min(-2).max(2)
const levels = z
  .partialRecord(GoodSchema, level)
  .default({})
  .describe('Good → −2 (scarce or unwanted) to +2 (plentiful or sought after)')

/**
 * A rule of supply and demand. It applies to a settlement when every listed condition holds,
 * and a market sums the levels of every rule that applies (A2).
 */
export const MarketRuleSchema = z.object({
  id: IdSchema,
  when: z
    .object({
      types: z.array(IdSchema).optional().describe('Settlement type ids'),
      biomes: z.array(BiomeSchema).optional().describe("The land's biome"),
      coastal: z.boolean().optional(),
      minSize: z.number().int().min(0).max(5).optional().describe('Size tier, 0 outpost'),
      maxSize: z.number().int().min(0).max(5).optional(),
      threatAtLeast: z
        .number()
        .int()
        .min(0)
        .max(3)
        .optional()
        .describe("The domain's threat level today"),
      nearPoi: z
        .array(PoiCategorySchema)
        .optional()
        .describe('An inhabited site of one of these categories in the domain'),
      minWealth: z.number().int().optional(),
    })
    .describe('Every listed condition must hold'),
  supply: levels,
  demand: levels,
  notes: z.string().optional(),
})
export type MarketRule = z.infer<typeof MarketRuleSchema>

/** A pack or riding animal, or a vehicle, that can be bought (and sometimes hired). */
export const AnimalDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  price: z.number().min(0).describe('gp to buy one'),
  hirePerDay: z
    .number()
    .min(0)
    .optional()
    .describe('gp per day to hire one for a journey to a settlement; omit if it is not for hire'),
  capacity: z.number().min(0).describe('kg it carries (or hauls)'),
  speed: z
    .number()
    .gt(0)
    .default(1)
    .describe('Land speed multiplier while ridden: 2 for riding animals (less in rough terrain)'),
  rider: z.boolean().default(false).describe('Carries a rider: one per member to ride'),
  needs: IdSchema.optional().describe('Another animal it needs to move, e.g. a cart needs a mule'),
  roadsOnly: z.boolean().default(false).describe('Keeps to roads: never on paths to sites (carts)'),
  maxPathDanger: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe('Only takes paths to sites up to this pathDanger (horses avoid rough paths)'),
  waterPerDay: z.number().min(0).default(1).describe('Units of water it drinks per day'),
  upkeepPerDay: z
    .number()
    .min(0)
    .default(0)
    .describe('gp per day while owned: fodder, stabling and care'),
  stealable: z
    .boolean()
    .default(false)
    .describe('Thieves can lead it away (an `animals` loss without a named animal)'),
})
export type AnimalDef = z.infer<typeof AnimalDefSchema>

/** A kind of notable person, generated with the world (T2) where it fits. */
export const PersonRoleSchema = z.object({
  id: IdSchema,
  name: z.string().describe('e.g. "innkeeper"'),
  service: IdSchema.optional().describe('Only where this service is present'),
  minSize: z.number().int().min(0).max(5).default(0).describe('Smallest size tier it appears in'),
  weight: z.number().min(0).default(1).describe('Relative chance of being drawn'),
  titles: z.array(z.string()).default([]).describe('Forms of address, e.g. "Mother", "Old"'),
})
export type PersonRole = z.infer<typeof PersonRoleSchema>

const range = (what: string) =>
  z
    .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
    .refine((r) => r.min <= r.max, 'min must not exceed max')
    .describe(what)

const NEEDS_GOODS = ['courier', 'supply']
const NEEDS_SITES = ['bounty', 'errand']

/** A contract a notice board (or a service) can post (design §8). */
export const ContractTemplateSchema = z
  .object({
    id: IdSchema,
    kind: ContractKindSchema,
    title: z.string(),
    text: z
      .string()
      .describe(
        'May use {patron}; courier and supply add {dest} {good} {amount}, escort {dest}, bounty and errand {site}'
      ),
    weight: z.number().min(0).default(1).describe('Relative chance of being posted'),
    minSize: z.number().int().min(0).max(5).default(0).describe('Smallest size tier posting it'),
    service: IdSchema.optional().describe('Posted only at this service; otherwise on the board'),
    minStanding: StandingSchema.optional().describe('Offered only at this standing or better'),
    km: range('How far away the destination or site is'),
    goods: z.array(GoodSchema).min(1).optional().describe('courier and supply: what is carried'),
    amount: range('courier and supply: how many units').optional(),
    passengers: range('escort: how many travel with the party (default 1)').optional(),
    poiCategories: z
      .array(PoiCategorySchema)
      .min(1)
      .optional()
      .describe('bounty and errand: the kinds of site it sends the party to'),
    urgentChance: z.number().min(0).max(1).describe('Urgent offers have tighter deadlines'),
    pay: z.number().min(0).default(1).describe('Multiplies the pay worked out by the engine'),
    reputation: z
      .object({ patron: z.number().int().min(0), settlement: z.number().int().min(0) })
      .describe('Reputation points on completion'),
  })
  .refine((t) => !NEEDS_GOODS.includes(t.kind) || (t.goods && t.amount), {
    message: 'courier and supply contracts need goods and an amount',
    path: ['goods'],
  })
  .refine((t) => !NEEDS_SITES.includes(t.kind) || t.poiCategories, {
    message: 'bounty and errand contracts need poiCategories',
    path: ['poiCategories'],
  })
export type ContractTemplate = z.infer<typeof ContractTemplateSchema>
