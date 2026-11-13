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
import { AccessoryTierSchema } from './gear'
import { MAX_LEVEL } from './types'

/** A whole-number range written as [min, max]. */
const span = (min: number, max: number, what: string) =>
  z
    .tuple([z.number().int().min(min).max(max), z.number().int().min(min).max(max)])
    .refine(([lo, hi]) => lo <= hi, 'min must not exceed max')
    .describe(what)

// ---------------------------------------------------------------------------------------------
// Goods, markets and services (Plan 4). Weights are in kilograms, prices in gold pieces.
// ---------------------------------------------------------------------------------------------

/** One of the 15 goods of design §4: its unit, weight, base price and how long it keeps. */
export const GoodDefSchema = z.object({
  id: GoodSchema,
  name: z.string(),
  unit: z.string().describe('What one unit is called, e.g. "ration" or "load"'),
  weight: z.number().min(0).describe('kg per unit'),
  price: z.number().min(0).describe('Base price in gp per unit, before supply and demand'),
  shelfDays: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Days each batch keeps before what is left of it spoils at once (food only); absent: never spoils'
    ),
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
export const ServiceRoleSchema = z
  .object({
    id: IdSchema.describe('The services entry it describes'),
    function: ServiceFunctionSchema,
    trades: z.array(GoodSchema).default([]).describe('Goods it buys and sells'),
    buysOnly: z
      .array(GoodSchema)
      .default([])
      .describe('Goods it buys but never sells, e.g. a necromancer buys relics'),
    actions: z.array(ServiceActionSchema).default([]),
    specialty: z.string().optional().describe('A line of flavour shown with the service'),
    recruits: z
      .object({
        offers: span(0, 10, 'How many recruits it offers a week, [min, max]'),
        levels: span(
          0,
          MAX_LEVEL,
          "Their levels, [min, max]; 0 is a level-1 recruit with two old wounds. Above the lowest living member's level + 2 they won't join"
        ),
        picks: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(1)
          .describe(
            'Quality: how many sets of six 3d6 rolls a recruit makes; the best set by total is kept'
          ),
        classes: z.array(IdSchema).min(1).optional().describe('Class ids it offers (default any)'),
        fee: z.number().gt(0).default(1).describe('Multiplies the sign-on fee'),
        gear: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('The chance an offer brings a tier-1 accessory (default RECRUIT_GEAR_CHANCE)'),
      })
      .optional()
      .describe('Who hires out here (Plan 5a); needs the "recruit" action'),
    accessories: z
      .object({
        offers: span(0, 10, 'How many accessories it offers a week, [min, max]'),
        maxTier: AccessoryTierSchema.describe('The best tier it sells'),
      })
      .optional()
      .describe('Accessories sold here (Plan 5a); needs the "accessories" action'),
  })
  .refine((r) => r.recruits === undefined || r.actions.includes('recruit'), {
    message: 'a role with recruits needs the "recruit" action',
    path: ['actions'],
  })
  .refine((r) => r.accessories === undefined || r.actions.includes('accessories'), {
    message: 'a role with accessories needs the "accessories" action',
    path: ['actions'],
  })
export type ServiceRole = z.infer<typeof ServiceRoleSchema>
export type RecruitsBlock = NonNullable<ServiceRole['recruits']>
export type AccessoriesBlock = NonNullable<ServiceRole['accessories']>

const level = z.number().int().min(-2).max(2)
const levels = z
  .partialRecord(GoodSchema, level)
  .default({})
  .describe('Good → −2 (unwanted) to +2 (sought after)')

/** The conditions on a settlement that market and producer rules share. */
const placeConditions = {
  types: z.array(IdSchema).optional().describe('Settlement type ids'),
  biomes: z.array(BiomeSchema).optional().describe("The land's biome"),
  coastal: z.boolean().optional(),
  minSize: z.number().int().min(0).max(5).optional().describe('Size tier, 0 outpost'),
  maxSize: z.number().int().min(0).max(5).optional(),
  minWealth: z.number().int().optional(),
}

/**
 * A rule of local demand (design §4). It applies to a settlement when every listed condition
 * holds, and a market sums the demand of every rule that applies. Supply comes from producers.
 */
export const MarketRuleSchema = z.object({
  id: IdSchema,
  label: z.string().describe('A short reason shown when the price is explained, e.g. "Garrison"'),
  when: z
    .object({
      ...placeConditions,
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
    })
    .describe('Every listed condition must hold'),
  demand: levels,
  notes: z.string().optional(),
})
export type MarketRule = z.infer<typeof MarketRuleSchema>

/**
 * Where goods are made (design §4, geographic supply): every settlement whose conditions all hold
 * produces the listed goods at an output level (summed over its rules, at most 3). A market's
 * supply of a good comes from the best producer within reach, less a level per few days of road.
 */
export const ProducerRuleSchema = z.object({
  id: IdSchema,
  label: z.string().describe('What is made there, shown with the producer, e.g. "Sawmills"'),
  when: z
    .object({
      ...placeConditions,
      nearPoi: z
        .array(PoiCategorySchema)
        .optional()
        .describe('A site of one of these categories in the domain (inhabited or not)'),
    })
    .describe('Every listed condition must hold'),
  output: z
    .partialRecord(GoodSchema, z.number().int().min(1).max(3))
    .describe('Good → output level, 1 (a little) to 3 (a great centre of it)'),
  notes: z.string().optional(),
})
export type ProducerRule = z.infer<typeof ProducerRuleSchema>

/** A pack or riding animal, or a vehicle, that can be bought (and sometimes hired). */
export const AnimalDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  price: z
    .number()
    .min(0)
    .describe('gp to buy one; owning it costs nothing more (no upkeep, designer call 2026-11-13)'),
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
  roadsOnly: z
    .boolean()
    .default(false)
    .describe(
      'Keeps to roads: never on paths to sites (unused since carts may leave roads, 2026-11-13)'
    ),
  maxPathDanger: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .describe('Only takes paths to sites up to this pathDanger (horses avoid rough paths)'),
  waterPerDay: z
    .number()
    .min(0)
    .multipleOf(0.5)
    .default(1)
    .describe(
      'Units of water it drinks per day (halves allowed); the total for all animals is rounded up to whole units'
    ),
  stealable: z
    .boolean()
    .default(false)
    .describe('Thieves can lead it away (an `animals` loss without a named animal)'),
  vehicle: z
    .boolean()
    .default(false)
    .describe(
      'A vehicle (cart, wagon): each working one adds VEHICLE_HOSTILE to the hostile share'
    ),
  slow: z
    .boolean()
    .default(false)
    .describe(
      'Slow: while the party has a working one, the brisk and forced paces are unavailable'
    ),
  flies: z
    .boolean()
    .default(false)
    .describe(
      "Flies (the flying carpet): when it is the party's only animal, it carries the whole party and " +
        '`capacity` kg whatever their strength, at `speed` on any terrain and any path; ' +
        'with other animals it is rolled up and carries nothing'
    ),
  desertWater: z
    .boolean()
    .default(false)
    .describe(
      'Camels: in the desert each one cuts the party’s water by CAMEL_DESERT_WATER_SAVING, up to CAMEL_DESERT_WATER_MAX'
    ),
  soldIn: z
    .object({
      biomes: z
        .array(BiomeSchema)
        .min(1)
        .optional()
        .describe("The settlement's land is one of these"),
      minSizeTier: z.number().int().min(0).max(5).optional().describe('At least this size'),
    })
    .optional()
    .describe(
      'Sold only at animals services in settlements that match; omit to sell it at every one'
    ),
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

const NEEDS_GOODS = ['courier', 'freight', 'procurement']
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
        'May use {patron}; courier and freight add {dest} {good} {amount}, procurement {good} {amount} {source}, escort {dest}, bounty and errand {site}'
      ),
    weight: z.number().min(0).default(1).describe('Relative chance of being posted'),
    minSize: z.number().int().min(0).max(5).default(0).describe('Smallest size tier posting it'),
    service: IdSchema.optional().describe('Posted only at this service; otherwise on the board'),
    minStanding: StandingSchema.optional().describe('Offered only at this standing or better'),
    km: range(
      'How far away the destination or site is; for procurement, the nearest producer of the good'
    ),
    goods: z
      .array(GoodSchema)
      .min(1)
      .optional()
      .describe(
        'courier: what is carried; freight: what is carried, if made here; procurement: what is wanted, if short here'
      ),
    amount: range('courier, freight and procurement: how many units').optional(),
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
    message: 'courier, freight and procurement contracts need goods and an amount',
    path: ['goods'],
  })
  .refine((t) => !NEEDS_SITES.includes(t.kind) || t.poiCategories, {
    message: 'bounty and errand contracts need poiCategories',
    path: ['poiCategories'],
  })
export type ContractTemplate = z.infer<typeof ContractTemplateSchema>
