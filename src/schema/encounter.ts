import { z } from 'zod'
import {
  AbilitySchema,
  BiomeSchema,
  CreatureTypeSchema,
  DispositionSchema,
  IdSchema,
  LogToneSchema,
  PoiCategorySchema,
  PositionSchema,
  SkillSchema,
} from './common'
import { MAX_DC, MIN_DC } from './constants'

// ---------------------------------------------------------------------------------------------
// Effects: what an outcome does to the game. The engine interprets them in applyEffects().
// ---------------------------------------------------------------------------------------------

const amount = z.number().int()

// ---------------------------------------------------------------------------------------------
// Conditions: an effect with `if` only applies when its condition holds.
// ---------------------------------------------------------------------------------------------

export const ConditionSchema = z.discriminatedUnion('cond', [
  z
    .object({
      cond: z.literal('twistRevealed'),
      not: z.boolean().optional().describe('True: only when the odds are still hidden'),
    })
    .describe("The twist's odds have been revealed earlier in the encounter (e.g. by Insight)"),
])
export type Condition = z.infer<typeof ConditionSchema>

/** Every effect may carry a condition. It is checked when the outcome starts to apply. */
const when = { if: ConditionSchema.optional().describe('Only applies when this holds') }

export const EffectSchema = z.discriminatedUnion('effect', [
  z
    .object({ effect: z.literal('gold'), amount, ...when })
    .describe('Gain or lose gold; gold never drops below 0'),
  z
    .object({
      effect: z.literal('hp'),
      amount,
      target: z.enum(['actor', 'all', 'random']),
      ...when,
    })
    .describe(
      'Heal (+) or hurt (−) the acting member, everyone, or one random member who can still act'
    ),
  z
    .object({
      effect: z.literal('exhaustion'),
      amount,
      target: z.enum(['actor', 'all']),
      ...when,
    })
    .describe('Add (+) or remove (−) exhaustion levels'),
  z
    .object({ effect: z.literal('inspiration'), amount, ...when })
    .describe('Gain (+) or lose (−) Inspiration; it never drops below 0'),
  z
    .object({ effect: z.literal('days'), amount: z.number().int().min(1), ...when })
    .describe('Time passes: each day everyone eats and drinks from the supplies, or goes without'),
  z
    .object({ effect: z.literal('position'), position: PositionSchema, ...when })
    .describe('Edge or Exposed for the next check in this encounter'),
  z
    .object({
      effect: z.literal('followUp'),
      situation: IdSchema,
      after: z.number().int().min(0).default(0).describe('Other encounters that happen first'),
      ...when,
    })
    .describe('Queue a later encounter'),
  z
    .object({
      effect: z.literal('nextCheckModifier'),
      amount,
      reason: z.string().optional().describe('Shown next to the modifier, e.g. "misread"'),
      ...when,
    })
    .describe(
      "Add to the party's next check in this encounter (e.g. −2 after misreading a situation)"
    ),
  z
    .object({
      effect: z.literal('revealTwist'),
      kind: z
        .boolean()
        .optional()
        .describe('Also reveal which kind of twist it would be (twist-table twists)'),
      ...when,
    })
    .describe('Show the odds of the hidden twist'),
  z
    .object({ effect: z.literal('openingHit'), ...when })
    .describe(
      "The twist's opening hit: the drawn twist kind's opening effects, or a bespoke twist's " +
        '`opening`. Only in twist branches.'
    ),
  z.object({
    effect: z.literal('log'),
    text: z.string(),
    tone: LogToneSchema.default('info'),
    ...when,
  }),
  z
    .object({
      effect: z.literal('discoverPoi'),
      count: z.number().int().min(1).max(3).default(1),
      scope: z
        .enum(['domain', 'land'])
        .default('domain')
        .describe("Where to look: the encounter's domain, or every domain of its land"),
      category: PoiCategorySchema.optional().describe('Only sites of this category'),
      ...when,
    })
    .describe(
      "Reveal the nearest undiscovered points of interest to the encounter's domain (a clue)"
    ),
  z
    .object({ effect: z.literal('clearPoi'), ...when })
    .describe(
      'Clear the dungeon or lair being visited: it lies empty (and feeds no threat) until ' +
        'something moves in again (REINHABIT_DAYS)'
    ),
  z
    .object({ effect: z.literal('trainSkill'), skill: SkillSchema, ...when })
    .describe(
      'Make the best-suited member who lacks the skill proficient in it (ties: party order)'
    ),
  // Extension point: Plan 4 adds { "effect": "goods", "good": "food", "amount": -2 } here.
])
export type Effect = z.infer<typeof EffectSchema>

// ---------------------------------------------------------------------------------------------
// Requirements: an option is only available when all of them hold.
// ---------------------------------------------------------------------------------------------

export const RequirementSchema = z.discriminatedUnion('req', [
  z.object({ req: z.literal('gold'), min: z.number().int().min(1) }),
  z
    .object({ req: z.literal('untrained'), skill: SkillSchema })
    .describe('Some member is not yet proficient in the skill (e.g. paying to train)'),
  z
    .object({
      req: z.literal('undiscovered'),
      scope: z
        .enum(['domain', 'land'])
        .default('domain')
        .describe("Where to look: the encounter's domain, or every domain of its land"),
      category: PoiCategorySchema.optional().describe('Only sites of this category'),
    })
    .describe(
      'Some point of interest there is still undiscovered (e.g. before selling what one knows), ' +
        'so no one pays for a clue that reveals nothing'
    ),
  z
    .object({ req: z.literal('siteReady') })
    .describe(
      "A site's boon (a blessing, healing, a find): only in site situations. Unavailable while " +
        "the site's boon is spent; choosing the option spends it for BOON_COOLDOWN_DAYS days"
    ),
  // Extension point: Plan 4 adds { "req": "goods", "good": "healing", "min": 1 }.
])
export type Requirement = z.infer<typeof RequirementSchema>

// ---------------------------------------------------------------------------------------------
// Checks, outcomes and options.
// ---------------------------------------------------------------------------------------------

/** Inside archetypes a DC can be relative to the DC the situation passes in: "dc", "dc+2", "dc-1". */
export const DC_EXPRESSION = /^dc([+-][0-9]+)?$/

export const DcSchema = z
  .union([z.number().int().min(MIN_DC).max(MAX_DC), z.string().regex(DC_EXPRESSION)])
  .describe('A DC from 1 to 40, or inside an archetype "dc", "dc+2" or "dc-1"')

export const CheckSchema = z.object({
  skill: SkillSchema,
  ability: AbilitySchema.optional().describe(
    'Overrides the skill\'s default ability, e.g. "cha" for Intimidation (CHA)'
  ),
  dc: DcSchema,
  combat: z.boolean().optional().describe('Combat checks never grant Inspiration on a natural 20'),
})
export type Check = z.infer<typeof CheckSchema>

/** A goto target that means "the twist's escalation stage" (see TwistSchema). */
export const TWIST_STAGE = '@twist'

const outcomeFields = {
  text: z.string(),
  effects: z.array(EffectSchema).default([]),
  goto: z
    .union([IdSchema, z.literal(TWIST_STAGE)])
    .optional()
    .describe(
      'Next stage. "@twist" (only in twist branches) goes to the twist\'s escalation stage. ' +
        'Without goto or stay, the encounter ends.'
    ),
  stay: z.boolean().optional().describe('Stay on the current stage'),
}
export const OutcomeBranchSchema = z.object(outcomeFields)
export type OutcomeBranch = z.infer<typeof OutcomeBranchSchema>

export const OutcomeSchema = z.object({
  ...outcomeFields,
  twist: OutcomeBranchSchema.optional().describe(
    'Replaces this outcome when the hidden twist is true'
  ),
})
export type Outcome = z.infer<typeof OutcomeSchema>

const optionFields = {
  id: IdSchema.describe('Unique within its stage'),
  label: z.string(),
  description: z.string().optional(),
  requires: z.array(RequirementSchema).default([]),
  once: z.boolean().optional().describe('Can only be chosen once per encounter'),
}

export const CheckOptionSchema = z.object({
  ...optionFields,
  kind: z.literal('check'),
  check: CheckSchema,
  highStakes: z.boolean().optional().describe('Force the slow, glowing dice roll'),
  outcomes: z.object({
    critFail: OutcomeSchema.optional().describe('Defaults to the fail outcome'),
    fail: OutcomeSchema,
    partial: OutcomeSchema,
    success: OutcomeSchema,
    critSuccess: OutcomeSchema.optional().describe('Defaults to the success outcome'),
  }),
})
export type CheckOption = z.infer<typeof CheckOptionSchema>

export const FixedOptionSchema = z.object({
  ...optionFields,
  kind: z.literal('fixed'),
  outcome: OutcomeSchema,
})
export type FixedOption = z.infer<typeof FixedOptionSchema>

export const OptionSchema = z.discriminatedUnion('kind', [CheckOptionSchema, FixedOptionSchema])
export type Option = z.infer<typeof OptionSchema>

// ---------------------------------------------------------------------------------------------
// Archetypes, stages and situations.
// ---------------------------------------------------------------------------------------------

export const ArchetypeRefSchema = z.object({
  id: IdSchema,
  dc: z
    .number()
    .int()
    .min(MIN_DC)
    .max(MAX_DC)
    .default(13)
    .describe('What "dc" means in the archetype'),
  reward: z
    .number()
    .min(0)
    .max(10)
    .default(1)
    .describe('Multiplies every gold amount in the archetype'),
})
export type ArchetypeRef = z.infer<typeof ArchetypeRefSchema>

export const ArchetypeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string(),
  options: z.array(OptionSchema).min(1),
})
export type Archetype = z.infer<typeof ArchetypeSchema>

export const StageSchema = z.object({
  text: z.string(),
  archetype: ArchetypeRefSchema.optional().describe(
    "Its options come first, then this stage's own"
  ),
  options: z.array(OptionSchema).default([]),
})
export type Stage = z.infer<typeof StageSchema>

export const SlotSourceSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('table'), table: IdSchema.describe('A parts table id') }),
  z.object({
    from: z.literal('creature'),
    types: z.array(CreatureTypeSchema).default([]).describe('Empty means any type'),
    maxCr: z.number().min(0).optional(),
    form: z.enum(['group', 'name']).default('group'),
  }),
])
export type SlotSource = z.infer<typeof SlotSourceSchema>

export const TwistSchema = z.object({
  chance: z.number().min(0).max(1).describe('Rolled secretly when the encounter starts'),
  what: z
    .string()
    .describe(
      'Always shown, e.g. "they are bait for an ambush"; Insight reveals the chance. With the ' +
        'twist table keep it vague ("they are not what they seem"): the kind stays hidden.'
    ),
  table: z
    .boolean()
    .default(false)
    .describe(
      'Draw the twist kind from the twist table (data/procedural) when the encounter starts. ' +
        'Its stages join the situation, and "@twist" goes to them.'
    ),
  kinds: z
    .array(IdSchema)
    .optional()
    .describe('With the table: only these twist kinds can be drawn'),
  stage: IdSchema.optional().describe(
    'A bespoke twist\'s escalation stage: where "@twist" goes. Set by the engine for table twists.'
  ),
  opening: z
    .array(EffectSchema)
    .default([])
    .describe(
      'A bespoke twist\'s opening hit, applied by { "effect": "openingHit" }. Set by the engine ' +
        'for table twists.'
    ),
})
export type Twist = z.infer<typeof TwistSchema>

const situationFields = {
  id: IdSchema,
  title: z.string(),
  notes: z.string().optional(),
  weight: z.number().min(0).default(1).describe('Relative chance in a random draw'),
  tags: z
    .array(z.string())
    .default([])
    .describe('Themes, e.g. "road"; biomes and regions filter where it happens'),
  biomes: z
    .array(BiomeSchema)
    .optional()
    .describe(
      'Only drawn on the road in these terrains; omit for anywhere on land. "sea" for ships.'
    ),
  regions: z
    .array(IdSchema)
    .optional()
    .describe('Only drawn on the road in these regions; omit for anywhere'),
  disposition: DispositionSchema.optional().describe(
    'How it treats the party. A cautious party avoids some hostile encounters and meets the ' +
      'rest on better footing. Required (by the lint) unless followUpOnly; wonders are never hostile.'
  ),
  slots: z
    .record(IdSchema, SlotSourceSchema)
    .default({})
    .describe('Filled when the encounter starts'),
  twist: TwistSchema.optional(),
}

export const SituationSchema = z.object({
  ...situationFields,
  wonder: z.boolean().default(false).describe('One click, flavour only, never a cost'),
  followUpOnly: z
    .boolean()
    .default(false)
    .describe('Never drawn at random; only queued by followUp'),
  site: z
    .boolean()
    .default(false)
    .describe('Only played at a point of interest; never drawn on the road'),
  pursuit: z
    .boolean()
    .optional()
    .describe(
      'A follow-up that hunts the party down. When it comes due, the pace since it was queued ' +
        'decides: covered tracks lose it, a brisk or faster march outruns it, slower lets it catch up.'
    ),
  start: IdSchema.default('start'),
  stages: z.record(IdSchema, StageSchema),
})
export type Situation = z.infer<typeof SituationSchema>

/** A one-stage situation: an archetype dressed with parts-table slots. */
export const SituationTemplateSchema = z.object({
  ...situationFields,
  text: z.string(),
  archetype: ArchetypeRefSchema,
})
export type SituationTemplate = z.infer<typeof SituationTemplateSchema>

// ---------------------------------------------------------------------------------------------
// Parts tables and creatures.
// ---------------------------------------------------------------------------------------------

/**
 * One kind of twist in the twist table (design §7, escalation): what the twist turns out to be,
 * the opening hit when trusting help walks into it, and the stages it escalates into.
 */
export const TwistKindSchema = z.object({
  id: IdSchema,
  name: z.string(),
  notes: z.string().optional(),
  weight: z.number().min(0).default(1).describe('Relative chance of being drawn'),
  what: z
    .string()
    .describe('What it turns out to be, e.g. "they were bait for an ambush"; shown once known'),
  opening: z
    .array(EffectSchema)
    .default([])
    .describe(
      'The opening hit, applied by { "effect": "openingHit" } (trusting help). Fixed options ' +
        'apply it, so no "actor" targets.'
    ),
  slots: z.record(IdSchema, SlotSourceSchema).default({}).describe('Filled when it is drawn'),
  start: IdSchema.default('start').describe('The escalation stage "@twist" goes to'),
  stages: z.record(IdSchema, StageSchema),
  disposition: DispositionSchema.optional().describe('How it treats the party once it hits'),
  biomes: z
    .array(BiomeSchema)
    .default([])
    .describe('Terrain where it is likelier on the road (see TWIST_PLACE_WEIGHT)'),
  regions: z.array(IdSchema).default([]).describe('Regions where it is likelier on the road'),
  threats: z
    .array(IdSchema)
    .default([])
    .describe("Regional threats that make it likelier where they hold the region's roads"),
})
export type TwistKind = z.infer<typeof TwistKindSchema>

export const PartsTableSchema = z.object({
  id: IdSchema,
  description: z.string(),
  rows: z
    .array(
      z.object({
        text: z.string().describe('May contain {other-table}'),
        weight: z.number().min(0).default(1),
      })
    )
    .min(1),
})
export type PartsTable = z.infer<typeof PartsTableSchema>

export const CreatureSchema = z.object({
  id: IdSchema,
  name: z.string(),
  group: z.string().describe('How a group reads in text, e.g. "a band of bandits"'),
  type: CreatureTypeSchema,
  cr: z.number().min(0),
  description: z.string().describe('One line, in our own words'),
})
export type Creature = z.infer<typeof CreatureSchema>
