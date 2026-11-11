# Plan 2: Encounters and the Encounter Deck Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Play encounters from every content source. A situation is a small graph of stages. Each stage offers options that are either graded checks or fixed choices, and every option previews the acting member, skill, DC, exact odds and every outcome before the player commits. Archetypes, parts tables, twists and follow-ups compose the content. Edge and Exposed carry risk from one check to the next. A dev Encounter Deck plays any situation, and a d20 animation presents rolls the engine has already decided.

**Architecture:**
- **Schemas** (`src/schema/encounter.ts`): effects, requirements, checks, outcomes, options, stages, situations, archetypes, situation templates, parts tables and creatures. They add five content kinds: `situations`, `situationTemplates`, `archetypes`, `partsTables` and `creatures`.
- **Engine** (`src/engine/encounters/`), all pure:
  - `effects.ts`: `applyEffects(state, effects, ctx)` and `describeEffect`.
  - `slots.ts`: `{who}`/`{Who}`/`{actor}` text slots and the parts-table composer.
  - `compile.ts`: archetype instantiation (`"dc+2"`, reward scaling), templates → situations, and the compiled snapshot.
  - `outcomes.ts`: critical-tier fallback, twist branches, and the high-stakes rule.
  - `run.ts`: start, draw, choose and close; follow-ups; Edge and Exposed; skill-use records.
  - `preview.ts`: `encounterOptions(state)` (what the player sees before committing) and `twistInfo`.
  - `validate.ts`: the playability validator and the quality lint.
- **State:** `GameState` v2 adds `encounter` (a compiled snapshot of the situation, so hand-editing data never breaks a save), `followUps` and `skillUses` (for Strain in Plan 3). `step(state, action, content)` now takes the content.
- **UI:** `EncounterView` with `OptionCard`s, `DiceRoll`, `EncounterDeck` and `SourceBadge`. Components only render previews and dispatch actions.

**Tech stack:** unchanged from Plan 1: pnpm, Vite, React 19, TypeScript (strict), zod 4, Vitest (jsdom + Testing Library for UI).

**Context docs:**
- [Rebuild design](2026-11-12-rebuild-design.md): §3 (Edge/Exposed, Inspiration, Strain), §7 (encounters), §9 (dice, Encounter Deck), §10 (testing), §11 (scope).
- [Plan 1](2026-11-12-plan-1-foundation.md), whose code this plan builds on.
- The prototype events: `git show v0.1.0-svelte-final:src/lib/data.ts` (`eventData`; the first two are handwritten, the last four were generated with ChatGPT).

**Conventions:**
- Prettier style from `.prettierrc.cjs`: no semicolons, single quotes, width 100.
- Schema constants end in `Schema`; inferred types use the plain name. No functions inside data.
- Engine tests use `src/engine/test-fixtures.ts`. Only `src/content/*.test.ts` reads the bundled data.
- Commit after every task. Never push; the user pushes.

**Out of scope (YAGNI):** the world map, travel, goods, towns and reputation (Plans 3–4), run end on a party wipe (Plan 5), and Strain itself (Plan 3). This plan only records the skill uses Strain will count.

---

## Encounter data at a glance

A situation, as written in `data/<source>/situations.json`:

```json
{
  "id": "ambush-at-the-narrows",
  "title": "Ambush at the narrows",
  "slots": { "foe": { "from": "creature", "types": ["humanoid"], "maxCr": 1 } },
  "twist": { "chance": 0.3, "what": "it is a trap" },
  "stages": {
    "start": {
      "text": "{Foe} step out to fill the gap.",
      "archetype": { "id": "hostile-group", "dc": 13, "reward": 1 },
      "options": [
        {
          "id": "veiled-threat", "kind": "check", "label": "A quiet word", "once": true,
          "check": { "skill": "intimidation", "ability": "cha", "dc": 14 },
          "outcomes": {
            "fail": { "text": "Their leader laughs.", "effects": [{ "effect": "position", "position": "exposed" }], "stay": true },
            "partial": { "text": "They let you pass, but remember your faces.", "effects": [{ "effect": "followUp", "situation": "grudge-on-the-road", "after": 3 }] },
            "success": { "text": "{actor}'s quiet words do what swords couldn't." }
          }
        }
      ]
    }
  }
}
```

The rules the engine applies:
- **Stages and outcomes.** An outcome may `goto` another stage or `stay` on this one; otherwise the encounter ends. `critFail` and `critSuccess` are optional and fall back to `fail` and `success`.
- **Options.** `kind: "check"` rolls `{ skill, ability?, dc }`; `ability` overrides the skill's default, e.g. Intimidation (CHA). `kind: "fixed"` has one `outcome` and no roll. `requires` lists conditions such as `{ "req": "gold", "min": 15 }`, and a `once` option disappears after use.
- **Position.** `"edge"` means advantage and `"exposed"` disadvantage on the next check. The roll spends it, and the position returns to normal unless an effect sets it again.
- **Twist.** A situation's `twist.chance` is rolled secretly when the encounter starts. Any outcome may carry a `twist` branch that replaces it when the twist is true. The player always sees what the twist would be; the `revealTwist` effect (e.g. from an Insight check) shows its chance.
- **Archetypes.** A stage's `archetype` reference inserts that archetype's options before the stage's own. Inside an archetype, a DC may be `"dc"`, `"dc+2"` or `"dc-1"`, relative to the reference's `dc`. Every gold amount is multiplied by `reward`.
- **Slots.** `{name}` is filled when the encounter starts, from a parts table or a creature. `{Name}` capitalises the value. `{actor}` is the member who rolled, so it only works in check outcomes.
- **Wonders** (`"wonder": true`) have one stage with one fixed option and never cost anything. `"followUpOnly": true` situations are never drawn at random, only queued by a `followUp` effect.

---

### Task 1: Ability overrides for checks

Checks can pair a skill with another ability, e.g. Intimidation (CHA). `previewCheck` and `normalizeDc` also move out of `state.ts`, because `state.ts` will dispatch to the encounter engine (Task 8) and the engine needs both. Re-exports keep every existing import working.

**Files:**
- Create: `src/engine/preview.ts`
- Modify: `src/engine/rules/character.ts`, `src/engine/rules/abilities.ts`, `src/engine/rules/checks.ts`, `src/engine/state.ts`, `src/schema/constants.ts`
- Test: `src/engine/rules/character.test.ts`, `src/engine/rules/abilities.test.ts`, `src/engine/state.test.ts`

**Step 1: Write the failing tests**

Append to `src/engine/rules/character.test.ts`:

```ts

describe('ability override', () => {
  test('Intimidation (CHA) uses CHA but keeps the skill proficiency', () => {
    expect(statModifier(fighter, 'intimidation')).toBe(5) // STR +3, proficiency +2
    expect(statModifier(fighter, 'intimidation', 'cha')).toBe(1) // CHA −1, proficiency +2
    expect(statModifier(bard, 'intimidation', 'cha')).toBe(3) // CHA +3, not proficient
  })
  test('the best actor depends on the skill and ability pairing', () => {
    expect(chooseActor([fighter, bard], 'intimidation')?.characterId).toBe('fighter')
    expect(chooseActor([fighter, bard], 'intimidation', undefined, 'cha')?.characterId).toBe('bard')
    expect(rankActors([fighter, bard], 'intimidation', 'cha').map((r) => r.modifier)).toEqual([3, 1])
  })
})
```

In `src/engine/rules/abilities.test.ts`, import `checkLabel` too:

```ts
import { abilityModifier, abilityOf, checkLabel, isSkill, proficiencyBonus, statLabel } from './abilities'
```

and add this test before `test('formatting', …)`:

```ts
  test('check labels name an ability only when it overrides the default', () => {
    expect(checkLabel('intimidation', 'cha')).toBe('Intimidation (CHA)')
    expect(checkLabel('intimidation', 'str')).toBe('Intimidation')
    expect(checkLabel('persuasion')).toBe('Persuasion')
  })

```

In `src/engine/state.test.ts`, add this test inside `describe('previewCheck')`, before `test('honours an actor override', …)`:

```ts
  test('takes an ability override, e.g. Intimidation (CHA)', () => {
    expect(previewCheck(state, 'intimidation', 13, 'normal')).toMatchObject({ actorId: 'fighter', modifier: 3 })
    expect(previewCheck(state, 'intimidation', 13, 'normal', undefined, 'cha')).toMatchObject({
      actorId: 'bard',
      modifier: 3,
    })
  })

```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine`. Expected: FAIL. `checkLabel` is not a function, and the override tests get the default ability's modifiers (e.g. 5 instead of 1).

**Step 3: Implement**

Replace `src/engine/rules/character.ts`:

```ts
import type { Character } from '../../schema/state'
import {
  abilityModifier,
  abilityOf,
  isSkill,
  proficiencyBonus,
  type Ability,
  type CheckStat,
} from './abilities'

/** 2024 rules: each exhaustion level is −2 to d20 tests. Level 6 is death. */
export const EXHAUSTION_PENALTY = 2

/**
 * `ability` overrides the skill's default ability, e.g. Intimidation (CHA) for a veiled threat.
 * Proficiency still comes from the skill.
 */
export function statModifier(
  character: Character,
  stat: CheckStat,
  ability: Ability = abilityOf(stat)
): number {
  const score = abilityModifier(character.abilities[ability])
  const proficient = isSkill(stat) && character.skillProficiencies.includes(stat)
  const proficiency = proficient ? proficiencyBonus(character.level) : 0
  return score + proficiency - EXHAUSTION_PENALTY * character.exhaustion
}

export const canAct = (character: Character): boolean => character.hp > 0 && character.exhaustion < 6

export type ActorRank = { characterId: string; modifier: number }

export function rankActors(
  party: readonly Character[],
  stat: CheckStat,
  ability: Ability = abilityOf(stat)
): ActorRank[] {
  return party
    .map((character, order) => ({ character, order, modifier: statModifier(character, stat, ability) }))
    .filter(({ character }) => canAct(character))
    .sort(
      (a, b) =>
        b.modifier - a.modifier ||
        b.character.abilities[ability] - a.character.abilities[ability] ||
        a.order - b.order
    )
    .map(({ character, modifier }) => ({ characterId: character.id, modifier }))
}

export function chooseActor(
  party: readonly Character[],
  stat: CheckStat,
  overrideId?: string,
  ability?: Ability
): ActorRank | null {
  const ranks = rankActors(party, stat, ability)
  return ranks.find((r) => r.characterId === overrideId) ?? ranks[0] ?? null
}
```

In `src/engine/rules/abilities.ts`, add above `abilityModifier`:

```ts
/** "Intimidation", or "Intimidation (CHA)" when a check pairs the skill with another ability. */
export const checkLabel = (stat: CheckStat, ability?: Ability): string =>
  ability && ability !== abilityOf(stat) ? `${statLabel(stat)} (${ability.toUpperCase()})` : statLabel(stat)

```

Append to `src/schema/constants.ts`:

```ts

/** DCs are whole numbers in this range; the engine clamps anything else into it. */
export const MIN_DC = 1
export const MAX_DC = 40
```

In `src/engine/rules/checks.ts`, change the first import to:

```ts
import { MAX_DC, MIN_DC, TIERS, type Tier } from '../../schema/constants'
```

and add above the `RollMode` comment (`/** Edge = advantage…`):

```ts
/** Whole-number DC in [MIN_DC, MAX_DC] (NaN → MIN_DC), so every state stays save-valid. */
export const normalizeDc = (dc: number): number =>
  Number.isNaN(dc) ? MIN_DC : Math.min(MAX_DC, Math.max(MIN_DC, Math.round(dc)))

```

Create `src/engine/preview.ts` (the old `previewCheck`, plus `ability`):

```ts
import type { GameState } from '../schema/state'
import type { Ability, CheckStat } from './rules/abilities'
import { chooseActor } from './rules/character'
import { normalizeDc, tierOdds, type RollMode, type Tier } from './rules/checks'

export type CheckPreview = {
  actorId: string
  actorName: string
  modifier: number
  /** The DC the roll will actually use (normalised, like `step` does). */
  dc: number
  odds: Record<Tier, number>
}

export function previewCheck(
  state: GameState,
  stat: CheckStat,
  dc: number,
  mode: RollMode,
  actorId?: string,
  ability?: Ability
): CheckPreview | null {
  const actor = chooseActor(state.party, stat, actorId, ability)
  if (!actor) return null
  const actorName = state.party.find((c) => c.id === actor.characterId)?.name ?? '?'
  const rollDc = normalizeDc(dc)
  return {
    actorId: actor.characterId,
    actorName,
    modifier: actor.modifier,
    dc: rollDc,
    odds: tierOdds(actor.modifier, rollDc, mode),
  }
}
```

Replace `src/engine/state.ts`:

```ts
import type { Content } from '../content/build'
import { MAX_DC, MIN_DC } from '../schema/constants'
import type { GameState, LogEntry } from '../schema/state'
import { formatModifier } from './format'
import { generateParty } from './party'
import { previewCheck, type CheckPreview } from './preview'
import { createRng } from './rng'
import { CURRENT_SAVE_VERSION } from './save'
import { statLabel, type CheckStat } from './rules/abilities'
import { chooseActor } from './rules/character'
import { TIER_LABELS, normalizeDc, rollCheck, type RollMode, type Tier } from './rules/checks'

export const STARTING_PARTY_SIZE = 2
export const STARTING_GOLD = 50
const LOG_LIMIT = 200
// These moved out so the encounter engine can use them without importing this module.
// Re-exported so existing imports from './state' keep working.
export { MAX_DC, MIN_DC, normalizeDc, previewCheck, type CheckPreview }

export type Action = {
  type: 'practiceCheck'
  stat: CheckStat
  dc: number
  mode: RollMode
  actorId?: string
}

export function newGame(seed: number, content: Content, partySize = STARTING_PARTY_SIZE): GameState {
  const [party, rng] = generateParty(createRng(seed), content, partySize)
  const names = party.map((c) => c.name).join(' and ')
  return {
    version: CURRENT_SAVE_VERSION,
    seed,
    rng,
    day: 1,
    party,
    gold: STARTING_GOLD,
    inspiration: 0,
    log: [{ day: 1, text: `${names} set out together.`, tone: 'info' }],
    lastRoll: null,
  }
}

function appendLog(state: GameState, text: string, tone: LogEntry['tone']): GameState {
  return { ...state, log: [...state.log, { day: state.day, text, tone }].slice(-LOG_LIMIT) }
}

const TONE: Record<Tier, LogEntry['tone']> = {
  critFail: 'bad',
  fail: 'bad',
  partial: 'info',
  success: 'good',
  critSuccess: 'crit',
}

export function step(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'practiceCheck': {
      const actor = chooseActor(state.party, action.stat, action.actorId)
      if (!actor) return appendLog(state, 'No one is able to act.', 'bad')
      const [roll, rng] = rollCheck(state.rng, actor.modifier, normalizeDc(action.dc), action.mode)
      const name = state.party.find((c) => c.id === actor.characterId)?.name ?? '?'
      const crit = roll.tier === 'critSuccess'
      const next: GameState = {
        ...state,
        rng,
        inspiration: state.inspiration + (crit ? 1 : 0),
        lastRoll: { ...roll, stat: action.stat, actorId: actor.characterId },
      }
      const text =
        `${name} rolls ${statLabel(action.stat)}: ${roll.kept} ${formatModifier(roll.modifier)} = ${roll.total}` +
        ` vs DC ${roll.dc}. ${TIER_LABELS[roll.tier]}.` +
        (crit ? ' Inspiration gained!' : '')
      return appendLog(next, text, TONE[roll.tier])
    }
  }
}
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass, no type errors.

**Step 5: Commit**

```bash
git add src/engine src/schema/constants.ts
git commit -m "pair skills with other abilities, e.g. Intimidation (CHA)"
```

---

### Task 2: Encounter schemas

**Files:**
- Create: `src/schema/encounter.ts`
- Modify: `src/schema/constants.ts`, `src/schema/common.ts`, `src/schema/state.ts`
- Test: `src/schema/encounter.test.ts`

**Step 1: Write the failing test `src/schema/encounter.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import {
  DcSchema,
  EffectSchema,
  OptionSchema,
  SituationSchema,
  SituationTemplateSchema,
  SlotSourceSchema,
} from './encounter'

const fixed = (id: string) => ({ id, kind: 'fixed', label: id, outcome: { text: `You ${id}.` } })

describe('effects', () => {
  test('parse with defaults', () => {
    expect(EffectSchema.parse({ effect: 'followUp', situation: 'ambush' })).toEqual({
      effect: 'followUp',
      situation: 'ambush',
      after: 0,
    })
    expect(EffectSchema.parse({ effect: 'log', text: 'Rain.' })).toEqual({ effect: 'log', text: 'Rain.', tone: 'info' })
  })

  test('reject unknown effects, missing targets and bad positions', () => {
    expect(EffectSchema.safeParse({ effect: 'goods', amount: 1 }).success).toBe(false)
    expect(EffectSchema.safeParse({ effect: 'hp', amount: -3 }).success).toBe(false)
    expect(EffectSchema.safeParse({ effect: 'exhaustion', amount: 1, target: 'random' }).success).toBe(false)
    expect(EffectSchema.safeParse({ effect: 'position', position: 'advantage' }).success).toBe(false)
    expect(EffectSchema.safeParse({ effect: 'days', amount: 0 }).success).toBe(false)
  })
})

describe('DCs', () => {
  test.each([14, 1, 40, 'dc', 'dc+2', 'dc-1'])('%s is valid', (dc) => {
    expect(DcSchema.safeParse(dc).success).toBe(true)
  })
  test.each([0, 41, 12.5, 'dc*2', 'DC+1', '14'])('%s is invalid', (dc) => {
    expect(DcSchema.safeParse(dc).success).toBe(false)
  })
})

describe('options', () => {
  test('a check option with an ability override; crit tiers are optional', () => {
    const option = OptionSchema.parse({
      id: 'threaten',
      kind: 'check',
      label: 'Veiled threat',
      check: { skill: 'intimidation', ability: 'cha', dc: 13 },
      outcomes: {
        fail: { text: 'They laugh.', effects: [{ effect: 'position', position: 'exposed' }], stay: true },
        partial: { text: 'They hesitate.' },
        success: { text: 'They back off.', twist: { text: 'It was a feint.' } },
      },
    })
    expect(option.kind === 'check' && option.check.ability).toBe('cha')
    expect(option.requires).toEqual([])
  })

  test('a check option needs fail, partial and success', () => {
    const bad = { id: 'x', kind: 'check', label: 'x', check: { skill: 'stealth', dc: 12 }, outcomes: { fail: { text: '' } } }
    expect(OptionSchema.safeParse(bad).success).toBe(false)
  })
})

describe('situations', () => {
  test('defaults: start stage, weight, slots, not a wonder', () => {
    const s = SituationSchema.parse({
      id: 'quiet-road',
      title: 'Quiet road',
      stages: { start: { text: 'Nothing stirs.', options: [fixed('wait'), fixed('go')] } },
    })
    expect(s).toMatchObject({ start: 'start', weight: 1, wonder: false, followUpOnly: false, slots: {}, tags: [] })
  })

  test('stage ids must be kebab-case', () => {
    const bad = { id: 'x', title: 'x', stages: { Start: { text: '' } } }
    expect(SituationSchema.safeParse(bad).success).toBe(false)
  })

  test('slot sources', () => {
    expect(SlotSourceSchema.parse({ from: 'creature', types: ['humanoid'] })).toEqual({
      from: 'creature',
      types: ['humanoid'],
      form: 'group',
    })
    expect(SlotSourceSchema.safeParse({ from: 'creature', types: ['robot'] }).success).toBe(false)
  })

  test('a template is an archetype plus text and slots', () => {
    const t = SituationTemplateSchema.parse({
      id: 'roadside-plea',
      title: 'Roadside plea',
      text: '{Who} waves you down.',
      slots: { who: { from: 'table', table: 'who' } },
      archetype: { id: 'someone-in-need' },
      twist: { chance: 0.3, what: 'it is a trap' },
    })
    expect(t.archetype).toEqual({ id: 'someone-in-need', dc: 13, reward: 1 })
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/schema`. Expected: FAIL, because `./encounter` cannot be resolved.

**Step 3: Implement**

Append to `src/schema/constants.ts`:

```ts

/** An encounter's position: Edge gives advantage on the next check, Exposed disadvantage. */
export const POSITIONS = ['normal', 'edge', 'exposed'] as const
export type Position = (typeof POSITIONS)[number]

export const LOG_TONES = ['info', 'good', 'bad', 'crit'] as const
export type LogTone = (typeof LOG_TONES)[number]

/** SRD creature types. */
export const CREATURE_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const
export type CreatureType = (typeof CREATURE_TYPES)[number]
```

Replace `src/schema/common.ts`:

```ts
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
```

In `src/schema/state.ts`, change the `./common` import to:

```ts
import { AbilitySchema, AbilityScoresSchema, IdSchema, LogToneSchema, SkillSchema } from './common'
```

add `ability` to `RollRecordSchema`, right after `stat`:

```ts
  stat: CheckStatSchema,
  /** Set when the check overrides the skill's default ability, e.g. Intimidation (CHA). */
  ability: AbilitySchema.optional(),
```

and in `LogEntrySchema` replace `tone: z.enum(['info', 'good', 'bad', 'crit']),` with `tone: LogToneSchema,`.

Create `src/schema/encounter.ts`:

```ts
import { z } from 'zod'
import {
  AbilitySchema,
  CreatureTypeSchema,
  IdSchema,
  LogToneSchema,
  PositionSchema,
  SkillSchema,
} from './common'
import { MAX_DC, MIN_DC } from './constants'

// ---------------------------------------------------------------------------------------------
// Effects: what an outcome does to the game. The engine interprets them in applyEffects().
// ---------------------------------------------------------------------------------------------

const amount = z.number().int()

export const EffectSchema = z.discriminatedUnion('effect', [
  z.object({ effect: z.literal('gold'), amount }).describe('Gain or lose gold; gold never drops below 0'),
  z
    .object({ effect: z.literal('hp'), amount, target: z.enum(['actor', 'all', 'random']) })
    .describe('Heal (+) or hurt (−) the acting member, everyone, or one random conscious member'),
  z
    .object({ effect: z.literal('exhaustion'), amount, target: z.enum(['actor', 'all']) })
    .describe('Add (+) or remove (−) exhaustion levels'),
  z.object({ effect: z.literal('inspiration'), amount: z.number().int().min(1) }),
  z.object({ effect: z.literal('days'), amount: z.number().int().min(1) }).describe('Time passes'),
  z
    .object({ effect: z.literal('position'), position: PositionSchema })
    .describe('Edge or Exposed for the next check in this encounter'),
  z
    .object({
      effect: z.literal('followUp'),
      situation: IdSchema,
      after: z.number().int().min(0).default(0).describe('Other encounters that happen first'),
    })
    .describe('Queue a later encounter'),
  z.object({ effect: z.literal('revealTwist') }).describe('Show the odds of the hidden twist'),
  z.object({ effect: z.literal('log'), text: z.string(), tone: LogToneSchema.default('info') }),
  // Extension point: Plan 4 adds { "effect": "goods", "good": "food", "amount": -2 } here.
])
export type Effect = z.infer<typeof EffectSchema>

// ---------------------------------------------------------------------------------------------
// Requirements: an option is only available when all of them hold.
// ---------------------------------------------------------------------------------------------

export const RequirementSchema = z.discriminatedUnion('req', [
  z.object({ req: z.literal('gold'), min: z.number().int().min(1) }),
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

const outcomeFields = {
  text: z.string(),
  effects: z.array(EffectSchema).default([]),
  goto: IdSchema.optional().describe('Next stage. Without goto or stay, the encounter ends.'),
  stay: z.boolean().optional().describe('Stay on the current stage'),
}
export const OutcomeBranchSchema = z.object(outcomeFields)
export type OutcomeBranch = z.infer<typeof OutcomeBranchSchema>

export const OutcomeSchema = z.object({
  ...outcomeFields,
  twist: OutcomeBranchSchema.optional().describe('Replaces this outcome when the hidden twist is true'),
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
  dc: z.number().int().min(MIN_DC).max(MAX_DC).default(13).describe('What "dc" means in the archetype'),
  reward: z.number().min(0).max(10).default(1).describe('Multiplies every gold amount in the archetype'),
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
  archetype: ArchetypeRefSchema.optional().describe('Its options come first, then this stage\'s own'),
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
  what: z.string().describe('Always shown, e.g. "they are bait for an ambush"; Insight reveals the chance'),
})
export type Twist = z.infer<typeof TwistSchema>

const situationFields = {
  id: IdSchema,
  title: z.string(),
  notes: z.string().optional(),
  weight: z.number().min(0).default(1).describe('Relative chance in a random draw'),
  tags: z.array(z.string()).default([]).describe('Biomes and themes, for later plans'),
  slots: z.record(IdSchema, SlotSourceSchema).default({}).describe('Filled when the encounter starts'),
  twist: TwistSchema.optional(),
}

export const SituationSchema = z.object({
  ...situationFields,
  wonder: z.boolean().default(false).describe('One click, flavour only, never a cost'),
  followUpOnly: z.boolean().default(false).describe('Never drawn at random; only queued by followUp'),
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

export const PartsTableSchema = z.object({
  id: IdSchema,
  description: z.string(),
  rows: z
    .array(z.object({ text: z.string().describe('May contain {other-table}'), weight: z.number().min(0).default(1) }))
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
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/schema
git commit -m "add encounter schemas: effects, checks, options, stages, situations, archetypes"
```

---

### Task 3: Register the encounter content kinds

**Files:**
- Modify: `src/schema/content.ts`, `src/content/build.ts`, `scripts/gen-schemas.ts`
- Test: `src/content/build.test.ts`, `src/content/bundled.test.ts`
- Generate: `data/_schema/*.schema.json`

**Step 1: Write the failing tests**

In `src/content/build.test.ts`, add this block before `describe('locale-independent ordering', …)`:

```ts
describe('encounter content kinds', () => {
  test('situations, archetypes, parts tables, templates and creatures load with their source', () => {
    const { content, errors } = buildContent({
      'data/claude/situations.json': {
        kind: 'situations',
        source: 'claude',
        entries: [{ id: 'quiet-road', title: 'Quiet road', stages: { start: { text: 'Nothing stirs.' } } }],
      },
      'data/claude/archetypes.json': {
        kind: 'archetypes',
        source: 'claude',
        entries: [
          { id: 'tiny', name: 'Tiny', description: 'One option', options: [{ id: 'go', kind: 'fixed', label: 'Go', outcome: { text: 'You go.' } }] },
        ],
      },
      'data/procedural/parts.json': {
        kind: 'partsTables',
        source: 'procedural',
        entries: [{ id: 'mood', description: 'Moods', rows: [{ text: 'grim' }] }],
      },
      'data/procedural/templates.json': {
        kind: 'situationTemplates',
        source: 'procedural',
        entries: [{ id: 'grim-road', title: 'Grim road', text: 'A {mood} road.', slots: { mood: { from: 'table', table: 'mood' } }, archetype: { id: 'tiny' } }],
      },
      'data/imported/creatures.json': {
        kind: 'creatures',
        source: 'imported',
        entries: [{ id: 'wolf', name: 'Wolf', group: 'a pack of wolves', type: 'beast', cr: 0.25, description: 'A hungry hunter.' }],
      },
      'data/imported-private/situations.json': {
        kind: 'situations',
        source: 'imported-private',
        entries: [{ id: 'private-one', title: 'Private', stages: { start: { text: '…' } } }],
      },
    })
    expect(errors).toEqual([])
    expect(content.situations['quiet-road']).toMatchObject({ source: 'claude', start: 'start', wonder: false })
    expect(content.archetypes.tiny.options).toHaveLength(1)
    expect(content.partsTables.mood.rows[0]).toEqual({ text: 'grim', weight: 1 })
    expect(content.situationTemplates['grim-road'].archetype).toEqual({ id: 'tiny', dc: 13, reward: 1 })
    expect(content.creatures.wolf.source).toBe('imported')
    expect(content.situations['private-one'].source).toBe('imported-private')
  })
})
```

Append to `src/content/bundled.test.ts`, and add `import { existsSync } from 'node:fs'` at the top:

```ts

test('data/imported-private/ is optional: absent locally means no private files, present means loaded', () => {
  const present = existsSync(new URL('../../data/imported-private/', import.meta.url))
  const privateFiles = Object.keys(bundledFiles).filter((file) => file.includes('/data/imported-private/'))
  if (present) expect(loadBundledContent()).toBeTruthy()
  else expect(privateFiles).toEqual([])
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/content`. Expected: FAIL with `unknown kind "situations"`.

**Step 3: Implement**

In `src/schema/content.ts`, import the new schemas:

```ts
import {
  ArchetypeSchema,
  CreatureSchema,
  PartsTableSchema,
  SituationSchema,
  SituationTemplateSchema,
} from './encounter'
```

and extend `CONTENT_KINDS` after `skills: SkillDefSchema,`:

```ts
  situations: SituationSchema,
  situationTemplates: SituationTemplateSchema,
  archetypes: ArchetypeSchema,
  partsTables: PartsTableSchema,
  creatures: CreatureSchema,
```

In `src/content/build.ts`, extend `emptyContent()` after `skills: {},`:

```ts
  situations: {},
  situationTemplates: {},
  archetypes: {},
  partsTables: {},
  creatures: {},
```

Situation schemas repeat the same option and outcome shapes many times, so the generated JSON Schema would be about 170 KB. Moving repeated shapes into `$defs` brings it to about 20 KB. In `scripts/gen-schemas.ts`, replace the body of `renderSchema`:

```ts
export function renderSchema(kind: ContentKind): string {
  // io: 'input' keeps fields with defaults optional for people editing by hand.
  // reused: 'ref' moves repeated shapes (options, outcomes, effects) into $defs, keeping files small.
  const schema = z.toJSONSchema(contentFileSchema(kind), { io: 'input', reused: 'ref' })
  return JSON.stringify(schema, null, 2) + '\n'
}
```

**Step 4: Regenerate the schemas and run the tests**

Run: `pnpm schemas`. Expected: `wrote 11 schemas to data/_schema/` (the existing six change slightly because of `$defs`).
Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/schema/content.ts src/content scripts/gen-schemas.ts data/_schema
git commit -m "register situations, templates, archetypes, parts tables and creatures as content kinds"
```

---

### Task 4: GameState v2 with a real migration

The state gains the active `encounter`, the `followUps` queue and `skillUses`. Each encounter check records one skill use; Strain (design §3) counts them from Plan 3 on. Practice rolls don't count.

**Files:**
- Modify: `src/schema/state.ts`, `src/engine/save.ts`, `src/engine/state.ts`
- Test: `src/engine/save.test.ts`

**Step 1: Write the failing test.** In `src/engine/save.test.ts`, import `makeCharacter` from `./test-fixtures` too, then append:

```ts

/** A save as Plan 1 wrote it. */
const V1_SAVE = {
  version: 1,
  seed: 5,
  rng: { state: 12345 },
  day: 3,
  party: [makeCharacter({ id: 'c-ada', name: 'Ada Stone' })],
  gold: 42,
  inspiration: 1,
  log: [{ day: 1, text: 'Ada Stone set out.', tone: 'info' }],
  lastRoll: null,
}

test('a version 1 save loads as version 2 with no encounter, follow-ups or skill uses', () => {
  expect(CURRENT_SAVE_VERSION).toBe(2)
  expect(deserialize(JSON.stringify(V1_SAVE))).toEqual({
    ...V1_SAVE,
    version: 2,
    encounter: null,
    followUps: [],
    skillUses: [],
  })
})

test('migrating a v1 save does not mutate the parsed object', () => {
  const raw = structuredClone(V1_SAVE)
  migrate(raw)
  expect(raw).toEqual(V1_SAVE)
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/engine/save.test.ts`. Expected: FAIL. The v1 save loads as `null`, and `CURRENT_SAVE_VERSION` is 1.

**Step 3: Implement**

Replace `src/schema/state.ts`:

```ts
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
```

Replace `src/engine/save.ts`:

```ts
import { GameStateSchema, type GameState } from '../schema/state'

export const SAVE_KEY = 'forgotten-heroes/save/v1'
/** Where a save that no longer loads is copied, so a new game doesn't destroy it. */
export const UNREADABLE_SAVE_KEY = `${SAVE_KEY}/unreadable`

/** Bump this (and GameStateSchema's `version` literal) when GameState's shape changes. */
export const CURRENT_SAVE_VERSION = 2

export const serialize = (state: GameState): string => JSON.stringify(state)

/** v1 → v2 (Plan 2): no encounter in progress, an empty follow-up queue and no skill uses yet. */
export const v1ToV2 = (raw: Record<string, unknown>): Record<string, unknown> => ({
  ...raw,
  version: 2,
  encounter: null,
  followUps: [],
  skillUses: [],
})

/**
 * Upgrades a parsed save to the current version, one step at a time.
 * When GameState changes, add `case n: return migrate(vNToVNPlus1(raw))` above the current case.
 * Unknown versions throw, so `deserialize` reports them as unreadable.
 */
export function migrate(raw: unknown): unknown {
  const version =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as { version?: unknown }).version
      : undefined
  switch (version) {
    case 1:
      return migrate(v1ToV2(raw as Record<string, unknown>))
    case CURRENT_SAVE_VERSION:
      return raw
    default:
      throw new Error(`unsupported save version: ${String(version)}`)
  }
}

export function deserialize(text: string): GameState | null {
  try {
    const parsed = GameStateSchema.safeParse(migrate(JSON.parse(text)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
```

In `src/engine/state.ts`, `newGame` returns the new fields:

```ts
    lastRoll: null,
    encounter: null,
    followUps: [],
    skillUses: [],
  }
}
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass. The existing "migrate passes a current-version save through unchanged" test now exercises version 2.

**Step 5: Commit**

```bash
git add src/schema/state.ts src/engine/save.ts src/engine/state.ts src/engine/save.test.ts
git commit -m "GameState v2: encounter, follow-ups and skill uses, with v1 to v2 migration"
```

---

### Task 5: Effects

`applyEffects(state, effects, ctx)` interprets the declarative effects. `describeEffect` turns one into a short chip such as `Lyra −3 HP` for previews and the journal. `appendLog` moves to its own module so the encounter engine can use it.

**Files:**
- Create: `src/engine/log.ts`, `src/engine/encounters/effects.ts`
- Modify: `src/engine/state.ts`, `src/engine/test-fixtures.ts`
- Test: `src/engine/encounters/effects.test.ts`

**Step 1: Add encounter fixtures to `src/engine/test-fixtures.ts`.** Replace the imports at the top with:

```ts
import { buildContent, type Content } from '../content/build'
import { SituationSchema } from '../schema/encounter'
import type { Character, EncounterState, GameState } from '../schema/state'
import { newGame } from './state'
```

and append:

```ts

/** A fighter and a bard with known stats, for encounter tests. */
export const brom = makeCharacter({
  id: 'brom',
  name: 'Brom',
  abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 },
  skillProficiencies: ['athletics', 'intimidation'],
  hp: 20,
  maxHp: 20,
})
export const lyra = makeCharacter({
  id: 'lyra',
  name: 'Lyra',
  classId: 'bard',
  abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
  skillProficiencies: ['persuasion', 'deception', 'insight'],
  hp: 16,
  maxHp: 16,
})

export function makeState(overrides: Partial<GameState> = {}): GameState {
  return { ...newGame(1, fixtureContent()), party: [brom, lyra], gold: 20, ...overrides }
}

export function makeEncounter(overrides: Partial<EncounterState> = {}): EncounterState {
  return {
    situation: SituationSchema.parse({ id: 'test-road', title: 'Test road', stages: { start: { text: 'A road.' } } }),
    source: 'original',
    stage: 'start',
    position: 'normal',
    slots: {},
    twist: false,
    twistRevealed: false,
    used: [],
    log: [],
    ...overrides,
  }
}
```

**Step 2: Write the failing test `src/engine/encounters/effects.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { EffectSchema, type Effect } from '../../schema/encounter'
import { makeEncounter, makeState } from '../test-fixtures'
import { applyEffects, describeEffect } from './effects'

const fx = (...effects: unknown[]): Effect[] => effects.map((e) => EffectSchema.parse(e))
const hp = (state: ReturnType<typeof makeState>) => state.party.map((c) => c.hp)

describe('applyEffects', () => {
  const state = makeState({ gold: 10, encounter: makeEncounter() })

  test('gold changes but never drops below 0', () => {
    expect(applyEffects(state, fx({ effect: 'gold', amount: 5 })).gold).toBe(15)
    expect(applyEffects(state, fx({ effect: 'gold', amount: -25 })).gold).toBe(0)
  })

  test('hp to the actor or to all, clamped to 0..maxHp', () => {
    expect(hp(applyEffects(state, fx({ effect: 'hp', amount: -5, target: 'actor' }), { actorId: 'lyra' }))).toEqual([20, 11])
    expect(hp(applyEffects(state, fx({ effect: 'hp', amount: -30, target: 'all' })))).toEqual([0, 0])
    const hurt = { ...state, party: state.party.map((c) => ({ ...c, hp: 5 })) }
    expect(hp(applyEffects(hurt, fx({ effect: 'hp', amount: 100, target: 'all' })))).toEqual([20, 16])
  })

  test('hp to a random member hits one conscious member, is seeded and advances the rng', () => {
    const effects = fx({ effect: 'hp', amount: -3, target: 'random' })
    const a = applyEffects(state, effects)
    expect(applyEffects(state, effects)).toEqual(a)
    expect(a.rng).not.toEqual(state.rng)
    expect(hp(a).filter((h, i) => h !== hp(state)[i])).toHaveLength(1)
    const bromDown = { ...state, party: state.party.map((c) => (c.id === 'brom' ? { ...c, hp: 0 } : c)) }
    expect(hp(applyEffects(bromDown, effects))).toEqual([0, 13])
  })

  test('an actor effect without an actor falls back to a random conscious member', () => {
    const after = applyEffects(state, fx({ effect: 'hp', amount: -2, target: 'actor' }))
    expect(hp(after).reduce((a, b) => a + b)).toBe(20 + 16 - 2)
  })

  test('exhaustion is clamped to 0..6', () => {
    const after = applyEffects(state, fx({ effect: 'exhaustion', amount: 9, target: 'all' }))
    expect(after.party.map((c) => c.exhaustion)).toEqual([6, 6])
    const rested = applyEffects(after, fx({ effect: 'exhaustion', amount: -2, target: 'actor' }), { actorId: 'brom' })
    expect(rested.party.map((c) => c.exhaustion)).toEqual([4, 6])
    expect(applyEffects(state, fx({ effect: 'exhaustion', amount: -1, target: 'all' })).party[0].exhaustion).toBe(0)
  })

  test('inspiration and days', () => {
    const after = applyEffects(state, fx({ effect: 'inspiration', amount: 1 }, { effect: 'days', amount: 2 }))
    expect(after.inspiration).toBe(state.inspiration + 1)
    expect(after.day).toBe(state.day + 2)
  })

  test('position and revealTwist change the encounter', () => {
    const after = applyEffects(state, fx({ effect: 'position', position: 'edge' }, { effect: 'revealTwist' }))
    expect(after.encounter?.position).toBe('edge')
    expect(after.encounter?.twistRevealed).toBe(true)
    const noEncounter = makeState()
    expect(applyEffects(noEncounter, fx({ effect: 'position', position: 'edge' }))).toEqual(noEncounter)
  })

  test('followUp queues a situation', () => {
    const after = applyEffects(state, fx({ effect: 'followUp', situation: 'revenge', after: 2 }))
    expect(after.followUps).toEqual([{ situationId: 'revenge', wait: 2 }])
  })

  test('log writes to the journal and the encounter log', () => {
    const after = applyEffects(state, fx({ effect: 'log', text: 'Rain begins.', tone: 'bad' }))
    expect(after.log.at(-1)).toEqual({ day: state.day, text: 'Rain begins.', tone: 'bad' })
    expect(after.encounter?.log.at(-1)).toEqual({ text: 'Rain begins.', tone: 'bad' })
  })

  test('effects apply in order and never mutate the input', () => {
    const snapshot = structuredClone(state)
    const after = applyEffects(state, fx({ effect: 'gold', amount: -10 }, { effect: 'gold', amount: 4 }))
    expect(after.gold).toBe(4)
    expect(state).toEqual(snapshot)
  })
})

describe('describeEffect', () => {
  test.each([
    [{ effect: 'gold', amount: 10 }, '+10 gp'],
    [{ effect: 'gold', amount: -5 }, '−5 gp'],
    [{ effect: 'hp', amount: -3, target: 'actor' }, 'Lyra −3 HP'],
    [{ effect: 'hp', amount: 4, target: 'all' }, 'everyone +4 HP'],
    [{ effect: 'hp', amount: -2, target: 'random' }, 'someone −2 HP'],
    [{ effect: 'exhaustion', amount: 1, target: 'all' }, 'everyone +1 exhaustion'],
    [{ effect: 'inspiration', amount: 1 }, '+1 inspiration'],
    [{ effect: 'days', amount: 1 }, '1 day passes'],
    [{ effect: 'days', amount: 3 }, '3 days pass'],
    [{ effect: 'position', position: 'edge' }, 'Edge'],
    [{ effect: 'position', position: 'exposed' }, 'Exposed'],
    [{ effect: 'followUp', situation: 'revenge' }, 'consequences later'],
    [{ effect: 'revealTwist' }, 'reveals the odds of a twist'],
  ])('%j reads "%s"', (effect, text) => {
    expect(describeEffect(EffectSchema.parse(effect), 'Lyra')).toBe(text)
  })

  test('log effects are shown as text, not as a chip', () => {
    expect(describeEffect(EffectSchema.parse({ effect: 'log', text: 'Rain.' }), 'Lyra')).toBeNull()
  })
})
```

**Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/engine/encounters`. Expected: FAIL, because `./effects` cannot be resolved.

**Step 4: Implement**

Create `src/engine/log.ts`:

```ts
import type { LogTone, Tier } from '../schema/constants'
import type { GameState } from '../schema/state'

export const LOG_LIMIT = 200

/** Appends to the journal, keeping only the latest LOG_LIMIT entries. */
export function appendLog(state: GameState, text: string, tone: LogTone): GameState {
  return { ...state, log: [...state.log, { day: state.day, text, tone }].slice(-LOG_LIMIT) }
}

export const TIER_TONE: Record<Tier, LogTone> = {
  critFail: 'bad',
  fail: 'bad',
  partial: 'info',
  success: 'good',
  critSuccess: 'crit',
}
```

In `src/engine/state.ts`:
- Delete `const LOG_LIMIT = 200`, the local `appendLog` function and the `TONE` table. Use `TIER_TONE[roll.tier]` where `TONE[roll.tier]` was.
- Add `import { TIER_TONE, appendLog } from './log'`.
- Import `GameState` alone from `../schema/state` (`LogEntry` is no longer used).
- Drop `type Tier` from the `./rules/checks` import.

Create `src/engine/encounters/effects.ts`:

```ts
import type { Effect } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { formatModifier } from '../format'
import { appendLog } from '../log'
import { withRng, type Rng } from '../rng'

export const MAX_EXHAUSTION = 6

/** Who "actor" means for this batch of effects: the member who rolled. Fixed options have none. */
export type EffectContext = { actorId?: string }

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function targetIds(state: GameState, target: 'actor' | 'all' | 'random', ctx: EffectContext): [string[], Rng] {
  if (target === 'all') return [state.party.map((c) => c.id), state.rng]
  if (target === 'actor' && state.party.some((c) => c.id === ctx.actorId)) return [[ctx.actorId!], state.rng]
  // "random", or "actor" with no actor (the content validator forbids that in fixed options).
  const conscious = state.party.filter((c) => c.hp > 0)
  if (conscious.length === 0) return [[], state.rng]
  const [id, rng] = withRng(state.rng, (d) => d.pick(conscious).id)
  return [[id], rng]
}

function applyEffect(state: GameState, effect: Effect, ctx: EffectContext): GameState {
  switch (effect.effect) {
    case 'gold':
      return { ...state, gold: Math.max(0, state.gold + effect.amount) }
    case 'hp': {
      const [ids, rng] = targetIds(state, effect.target, ctx)
      const party = state.party.map((c) =>
        ids.includes(c.id) ? { ...c, hp: clamp(c.hp + effect.amount, 0, c.maxHp) } : c
      )
      return { ...state, rng, party }
    }
    case 'exhaustion': {
      const [ids, rng] = targetIds(state, effect.target, ctx)
      const party = state.party.map((c) =>
        ids.includes(c.id) ? { ...c, exhaustion: clamp(c.exhaustion + effect.amount, 0, MAX_EXHAUSTION) } : c
      )
      return { ...state, rng, party }
    }
    case 'inspiration':
      return { ...state, inspiration: state.inspiration + effect.amount }
    case 'days':
      return { ...state, day: state.day + effect.amount }
    case 'position':
      return state.encounter ? { ...state, encounter: { ...state.encounter, position: effect.position } } : state
    case 'followUp':
      return { ...state, followUps: [...state.followUps, { situationId: effect.situation, wait: effect.after }] }
    case 'revealTwist':
      return state.encounter ? { ...state, encounter: { ...state.encounter, twistRevealed: true } } : state
    case 'log': {
      const next = appendLog(state, effect.text, effect.tone)
      if (!next.encounter) return next
      const log = [...next.encounter.log, { text: effect.text, tone: effect.tone }]
      return { ...next, encounter: { ...next.encounter, log } }
    }
  }
}

/** Pure: applies effects in order. Random targets draw from the state's RNG. */
export function applyEffects(state: GameState, effects: readonly Effect[], ctx: EffectContext = {}): GameState {
  return effects.reduce((current, effect) => applyEffect(current, effect, ctx), state)
}

const WHO = { all: 'everyone', random: 'someone' } as const

/** A short chip for previews and the journal, e.g. "Lyra −3 HP". Log effects return null. */
export function describeEffect(effect: Effect, actorName: string): string | null {
  switch (effect.effect) {
    case 'gold':
      return `${formatModifier(effect.amount)} gp`
    case 'hp':
      return `${effect.target === 'actor' ? actorName : WHO[effect.target]} ${formatModifier(effect.amount)} HP`
    case 'exhaustion':
      return `${effect.target === 'actor' ? actorName : WHO.all} ${formatModifier(effect.amount)} exhaustion`
    case 'inspiration':
      return `+${effect.amount} inspiration`
    case 'days':
      return effect.amount === 1 ? '1 day passes' : `${effect.amount} days pass`
    case 'position':
      return { edge: 'Edge', exposed: 'Exposed', normal: 'normal position' }[effect.position]
    case 'followUp':
      return 'consequences later'
    case 'revealTwist':
      return 'reveals the odds of a twist'
    case 'log':
      return null
  }
}
```

**Step 5: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 6: Commit**

```bash
git add src/engine
git commit -m "apply declarative encounter effects"
```

---

### Task 6: Text slots and the parts-table composer

**Files:**
- Create: `src/engine/encounters/slots.ts`
- Modify: `src/engine/test-fixtures.ts`
- Test: `src/engine/encounters/slots.test.ts`

**Step 1: Add parts tables and creatures to the fixtures.** In `fixtureContent()`, add these two files to the object passed to `buildContent`, after `'data/original/names.json'`:

```ts
    'data/procedural/parts.json': {
      kind: 'partsTables',
      source: 'procedural',
      entries: [
        { id: 'who', description: 'A stranger', rows: [{ text: '{who-attitude} {who-job}' }] },
        { id: 'who-attitude', description: 'Attitude', rows: [{ text: 'a wary' }, { text: 'an angry', weight: 0 }] },
        { id: 'who-job', description: 'Job', rows: [{ text: 'tinker' }, { text: 'pilgrim' }] },
        { id: 'stakes', description: 'Stakes', rows: [{ text: 'A child waits at home.' }] },
      ],
    },
    'data/imported/creatures.json': {
      kind: 'creatures',
      source: 'imported',
      entries: [
        { id: 'wolf', name: 'Wolf', group: 'a pack of wolves', type: 'beast', cr: 0.25, description: 'Hungry.' },
        { id: 'bandit', name: 'Bandit', group: 'a band of bandits', type: 'humanoid', cr: 0.125, description: 'Armed.' },
        { id: 'ogre', name: 'Ogre', group: 'an ogre and its cronies', type: 'giant', cr: 2, description: 'Big.' },
      ],
    },
```

**Step 2: Write the failing test `src/engine/encounters/slots.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { SlotSourceSchema } from '../../schema/encounter'
import { createRng, withRng } from '../rng'
import { fixtureContent } from '../test-fixtures'
import { fillText, rollSlots, rollTable, slotNames } from './slots'

const content = fixtureContent()

describe('text slots', () => {
  test('slotNames lists each slot once, lower-casing a capitalised first letter', () => {
    expect(slotNames('{Who} meets {who} about {stakes}; {actor} {who-job}')).toEqual(['who', 'stakes', 'actor', 'who-job'])
    expect(slotNames('no slots, {not a slot}, {}')).toEqual([])
  })

  test('fillText fills known slots, capitalises {Who}, and leaves unknown slots visible', () => {
    const values = { who: 'a wary tinker', actor: 'Lyra' }
    expect(fillText('{Who} nods at {actor}. {who} waits for {stakes}.', values)).toBe(
      'A wary tinker nods at Lyra. a wary tinker waits for {stakes}.'
    )
  })

  test('fillText ignores inherited object keys', () => {
    expect(fillText('{constructor}', {})).toBe('{constructor}')
  })
})

describe('parts tables', () => {
  test('rollTable expands nested table references and respects zero weights', () => {
    const [values] = withRng(createRng(3), (d) => Array.from({ length: 40 }, () => rollTable(d, content, 'who')))
    expect(new Set(values)).toEqual(new Set(['a wary tinker', 'a wary pilgrim']))
  })

  test('rollTable throws on an unknown table and on a reference loop', () => {
    expect(() => withRng(createRng(1), (d) => rollTable(d, content, 'nope'))).toThrow(/unknown parts table "nope"/)
    const loop = (id: string, next: string) => ({ id, description: '', rows: [{ text: `{${next}}`, weight: 1 }], source: 'procedural' as const, file: 'x' })
    const looped = { ...content, partsTables: { ...content.partsTables, a: loop('a', 'b'), b: loop('b', 'a') } }
    expect(() => withRng(createRng(1), (d) => rollTable(d, looped, 'a'))).toThrow(/too deeply nested/)
  })
})

describe('rollSlots', () => {
  const slots = {
    who: SlotSourceSchema.parse({ from: 'table', table: 'who' }),
    foe: SlotSourceSchema.parse({ from: 'creature', types: ['humanoid', 'giant'], maxCr: 1 }),
    beast: SlotSourceSchema.parse({ from: 'creature', types: ['beast'], form: 'name' }),
  }

  test('fills every slot, deterministically for a seed', () => {
    const [a] = withRng(createRng(9), (d) => rollSlots(d, content, slots))
    const [b] = withRng(createRng(9), (d) => rollSlots(d, content, slots))
    expect(a).toEqual(b)
    expect(a.who).toMatch(/^a wary (tinker|pilgrim)$/)
    expect(a.foe).toBe('a band of bandits') // the ogre is CR 2
    expect(a.beast).toBe('Wolf')
  })

  test('a creature filter that matches nothing throws', () => {
    const none = { foe: SlotSourceSchema.parse({ from: 'creature', types: ['dragon'] }) }
    expect(() => withRng(createRng(1), (d) => rollSlots(d, content, none))).toThrow(/no creature matches slot "foe"/)
  })
})
```

**Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/engine/encounters/slots.test.ts`. Expected: FAIL, because `./slots` cannot be resolved.

**Step 4: Implement `src/engine/encounters/slots.ts`**

```ts
import { sortedEntries, byCodeUnit, type Content } from '../../content/build'
import type { SlotSource } from '../../schema/encounter'
import type { Draw } from '../rng'

/** {who}, {Who} (capitalised), {who-job}. Slot names are ids, so only the first letter may be upper case. */
const SLOT = /\{([A-Za-z][a-z0-9]*(?:-[a-z0-9]+)*)\}/g

const uncapitalise = (name: string) => name[0].toLowerCase() + name.slice(1)
const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)

/** The distinct slot names used in a text, in order of first use. */
export function slotNames(text: string): string[] {
  return [...new Set([...text.matchAll(SLOT)].map((m) => uncapitalise(m[1])))]
}

/** Replaces {name} and {Name}. Unknown slots stay visible, so a mistake shows up in play. */
export function fillText(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(SLOT, (match, raw: string) => {
    const name = uncapitalise(raw)
    if (!Object.hasOwn(values, name)) return match
    return raw === name ? values[name] : capitalise(values[name])
  })
}

export const MAX_TABLE_DEPTH = 5

/** Picks a weighted row and expands any {other-table} references inside it. */
export function rollTable(d: Draw, content: Content, tableId: string, depth = 0): string {
  if (depth > MAX_TABLE_DEPTH) throw new Error(`parts table "${tableId}" is too deeply nested (a loop?)`)
  if (!Object.hasOwn(content.partsTables, tableId)) throw new Error(`unknown parts table "${tableId}"`)
  const row = d.weighted(content.partsTables[tableId].rows, (r) => r.weight)
  const values = Object.fromEntries(slotNames(row.text).map((name) => [name, rollTable(d, content, name, depth + 1)]))
  return fillText(row.text, values)
}

/** Fills a situation's declared slots. Slots are rolled in id order so a seed always gives the same text. */
export function rollSlots(d: Draw, content: Content, slots: Readonly<Record<string, SlotSource>>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const name of Object.keys(slots).sort(byCodeUnit)) {
    const source = slots[name]
    if (source.from === 'table') {
      values[name] = rollTable(d, content, source.table)
      continue
    }
    const matches = sortedEntries(content.creatures).filter(
      (c) =>
        (source.types.length === 0 || source.types.includes(c.type)) &&
        (source.maxCr === undefined || c.cr <= source.maxCr)
    )
    if (matches.length === 0) throw new Error(`no creature matches slot "${name}"`)
    const creature = d.pick(matches)
    values[name] = source.form === 'name' ? creature.name : creature.group
  }
  return values
}
```

**Step 5: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 6: Commit**

```bash
git add src/engine
git commit -m "fill text slots from weighted parts tables and creatures"
```

---

### Task 7: Archetypes, templates and compiled situations

A compiled situation has its archetypes expanded, every DC resolved to a number and its provenance fields removed. It is what an encounter stores in `GameState`.

**Files:**
- Create: `src/engine/encounters/compile.ts`
- Modify: `src/engine/test-fixtures.ts`
- Test: `src/engine/encounters/compile.test.ts`

**Step 1: Add an archetype, situations and a template to the fixtures.** In `src/engine/test-fixtures.ts`, add this above `export function fixtureContent()`:

```ts
/** A small someone-in-need archetype. Gold amounts scale with `reward`, "dc" DCs with `dc`. */
const testNeed = {
  id: 'test-need',
  name: 'Test need',
  description: 'Someone asks for help.',
  options: [
    {
      id: 'trust',
      kind: 'fixed',
      label: 'Help them',
      outcome: {
        text: '{Who} thanks you.',
        effects: [{ effect: 'gold', amount: 10 }],
        twist: { text: 'A trap!', effects: [{ effect: 'gold', amount: -10 }, { effect: 'hp', amount: -3, target: 'random' }] },
      },
    },
    {
      id: 'careful',
      kind: 'fixed',
      label: 'Help carefully',
      outcome: { text: 'You help, warily.', effects: [{ effect: 'gold', amount: 4 }], twist: { text: 'You saw it coming.' } },
    },
    {
      id: 'read',
      kind: 'check',
      label: 'Read them',
      once: true,
      check: { skill: 'insight', dc: 'dc' },
      outcomes: {
        fail: { text: 'You cannot tell.', stay: true },
        partial: { text: 'Something is off.', effects: [{ effect: 'revealTwist' }], stay: true },
        success: { text: '{actor} reads them.', effects: [{ effect: 'revealTwist' }, { effect: 'position', position: 'edge' }], stay: true },
      },
    },
    {
      id: 'rob',
      kind: 'check',
      label: 'Rob them',
      check: { skill: 'deception', dc: 'dc+2' },
      outcomes: {
        critFail: { text: 'Caught!', effects: [{ effect: 'hp', amount: -4, target: 'actor' }] },
        fail: { text: 'They run.' },
        partial: { text: 'A few coins.', effects: [{ effect: 'gold', amount: 3 }] },
        success: { text: 'Their purse.', effects: [{ effect: 'gold', amount: 12 }, { effect: 'followUp', situation: 'grudge', after: 1 }] },
      },
    },
    {
      id: 'donate',
      kind: 'fixed',
      label: 'Give them money',
      requires: [{ req: 'gold', min: 10 }],
      outcome: { text: 'You give.', effects: [{ effect: 'gold', amount: -10 }] },
    },
  ],
}

const testSituations = [
  {
    id: 'roadside',
    title: 'Roadside',
    slots: { who: { from: 'table', table: 'who' }, stakes: { from: 'table', table: 'stakes' } },
    twist: { chance: 0.5, what: 'it is a trap' },
    stages: {
      start: {
        text: '{Who} begs for help. {stakes}',
        archetype: { id: 'test-need', dc: 12, reward: 2 },
        options: [{ id: 'leave', kind: 'fixed', label: 'Leave', outcome: { text: 'You walk on.' } }],
      },
    },
  },
  {
    id: 'cliff',
    title: 'Cliff',
    stages: {
      start: {
        text: 'A cliff blocks the way.',
        options: [
          {
            id: 'climb',
            kind: 'check',
            label: 'Climb',
            check: { skill: 'athletics', dc: 12 },
            outcomes: {
              fail: { text: '{actor} slips.', effects: [{ effect: 'hp', amount: -3, target: 'actor' }, { effect: 'position', position: 'exposed' }], stay: true },
              partial: { text: 'A scraped climb.', effects: [{ effect: 'hp', amount: -1, target: 'actor' }], goto: 'ledge' },
              success: { text: 'Up you go.', effects: [{ effect: 'position', position: 'edge' }], goto: 'ledge' },
            },
          },
          { id: 'around', kind: 'fixed', label: 'Go around', outcome: { text: 'A long detour.', effects: [{ effect: 'days', amount: 1 }] } },
        ],
      },
      ledge: {
        text: 'A gap yawns on the ledge.',
        options: [
          {
            id: 'jump',
            kind: 'check',
            label: 'Jump',
            check: { skill: 'acrobatics', dc: 14 },
            outcomes: {
              fail: { text: 'A bad fall.', effects: [{ effect: 'hp', amount: -6, target: 'actor' }] },
              partial: { text: 'You make it, bruised.', effects: [{ effect: 'hp', amount: -2, target: 'actor' }] },
              success: { text: 'You find a cache.', effects: [{ effect: 'gold', amount: 15 }] },
            },
          },
          { id: 'back', kind: 'fixed', label: 'Climb back down', outcome: { text: 'Back down.' } },
        ],
      },
    },
  },
  {
    id: 'grudge',
    title: 'Grudge',
    followUpOnly: true,
    stages: {
      start: {
        text: 'The people you robbed are back.',
        options: [
          {
            id: 'fight',
            kind: 'check',
            label: 'Fight',
            check: { skill: 'athletics', dc: 13, combat: true },
            outcomes: { fail: { text: 'Beaten.', effects: [{ effect: 'hp', amount: -4, target: 'all' }] }, partial: { text: 'A draw.' }, success: { text: 'They flee.' } },
          },
          { id: 'pay', kind: 'fixed', label: 'Pay them back', requires: [{ req: 'gold', min: 5 }], outcome: { text: 'You pay.', effects: [{ effect: 'gold', amount: -5 }] } },
        ],
      },
    },
  },
  {
    id: 'starfall',
    title: 'Starfall',
    wonder: true,
    weight: 0.5,
    stages: {
      start: {
        text: 'Stars fall over the hills.',
        options: [{ id: 'watch', kind: 'fixed', label: 'Watch', outcome: { text: 'You watch.', effects: [{ effect: 'inspiration', amount: 1 }] } }],
      },
    },
  },
]
```

and add these files to the object passed to `buildContent`, after `'data/imported/creatures.json'`:

```ts
    'data/claude/archetypes.json': { kind: 'archetypes', source: 'claude', entries: [testNeed] },
    'data/original/situations.json': { kind: 'situations', source: 'original', entries: testSituations },
    'data/procedural/templates.json': {
      kind: 'situationTemplates',
      source: 'procedural',
      entries: [
        {
          id: 'plea',
          title: 'Plea',
          text: '{Who} needs help.',
          slots: { who: { from: 'table', table: 'who' } },
          archetype: { id: 'test-need' },
          twist: { chance: 0.2, what: 'it is a trap' },
        },
      ],
    },
```

**Step 2: Write the failing test `src/engine/encounters/compile.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { SituationSchema, type CheckOption, type FixedOption } from '../../schema/encounter'
import { fixtureContent } from '../test-fixtures'
import { allSituations, compileSituation, instantiateArchetype, resolveDc, templateToSituation } from './compile'

const content = fixtureContent()

describe('resolveDc', () => {
  test.each([
    [14, 12, 14],
    ['dc', 12, 12],
    ['dc+2', 12, 14],
    ['dc-1', 12, 11],
    ['dc-20', 12, 1],
    ['dc+50', 12, 40],
  ] as const)('%s with base %i is %i', (dc, base, expected) => {
    expect(resolveDc(dc, base)).toBe(expected)
  })
})

describe('instantiateArchetype', () => {
  const options = instantiateArchetype(content.archetypes['test-need'], { id: 'test-need', dc: 12, reward: 2 })
  const byId = Object.fromEntries(options.map((o) => [o.id, o]))

  test('resolves relative DCs', () => {
    expect((byId.read as CheckOption).check.dc).toBe(12)
    expect((byId.rob as CheckOption).check.dc).toBe(14)
  })

  test('scales gold effects and gold requirements by reward, including twist branches', () => {
    const trust = byId.trust as FixedOption
    expect(trust.outcome.effects).toEqual([{ effect: 'gold', amount: 20 }])
    expect(trust.outcome.twist?.effects).toEqual([
      { effect: 'gold', amount: -20 },
      { effect: 'hp', amount: -3, target: 'random' },
    ])
    expect((byId.donate as FixedOption).requires).toEqual([{ req: 'gold', min: 20 }])
    expect((byId.rob as CheckOption).outcomes.success.effects[0]).toEqual({ effect: 'gold', amount: 24 })
  })

  test('a zero reward drops gold requirements that would scale to 0', () => {
    const free = instantiateArchetype(content.archetypes['test-need'], { id: 'test-need', dc: 12, reward: 0 })
    expect(free.find((o) => o.id === 'donate')?.requires).toEqual([])
  })
})

describe('compileSituation', () => {
  test('puts archetype options before the stage\'s own and drops the reference', () => {
    const compiled = compileSituation(content.situations.roadside, content)
    expect(compiled.stages.start.options.map((o) => o.id)).toEqual(['trust', 'careful', 'read', 'rob', 'donate', 'leave'])
    expect(compiled.stages.start.archetype).toBeUndefined()
    expect(SituationSchema.parse(compiled)).toEqual(compiled)
  })

  test('keeps provenance fields out and leaves situations without archetypes alone', () => {
    const compiled = compileSituation(content.situations.cliff, content)
    expect(compiled).not.toHaveProperty('source')
    expect(compiled).not.toHaveProperty('file')
    expect(compiled.stages).toEqual(content.situations.cliff.stages)
  })

  test('an unknown archetype throws', () => {
    const broken = { ...content.situations.roadside, stages: { start: { text: '', options: [], archetype: { id: 'nope', dc: 13, reward: 1 } } } }
    expect(() => compileSituation(broken, content)).toThrow(/unknown archetype "nope"/)
  })
})

describe('templates', () => {
  test('a template becomes a one-stage situation that compiles', () => {
    const situation = templateToSituation(content.situationTemplates.plea)
    expect(situation).toMatchObject({ id: 'plea', start: 'start', wonder: false, followUpOnly: false })
    expect(situation.stages.start).toEqual({ text: '{Who} needs help.', archetype: { id: 'test-need', dc: 13, reward: 1 }, options: [] })
    expect(compileSituation(situation, content).stages.start.options).toHaveLength(5)
  })

  test('allSituations lists situations and templates with their source, sorted by id', () => {
    const all = allSituations(content)
    expect(all.map((s) => s.id)).toEqual(['cliff', 'grudge', 'plea', 'roadside', 'starfall'])
    expect(all.find((s) => s.id === 'plea')?.source).toBe('procedural')
  })
})
```

**Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/engine/encounters/compile.test.ts`. Expected: FAIL, because `./compile` cannot be resolved.

**Step 4: Implement `src/engine/encounters/compile.ts`**

```ts
import { byCodeUnit, type Content, type Sourced } from '../../content/build'
import {
  DC_EXPRESSION,
  type Archetype,
  type ArchetypeRef,
  type Effect,
  type Option,
  type Outcome,
  type OutcomeBranch,
  type Requirement,
  type Situation,
  type SituationTemplate,
  type Stage,
} from '../../schema/encounter'
import { normalizeDc } from '../rules/checks'

/** The DC an archetype reference gets when it doesn't name one. Matches ArchetypeRefSchema. */
export const DEFAULT_ARCHETYPE_DC = 13

/** A number stays as it is; "dc", "dc+2", "dc-1" are relative to `base`. Always a valid DC. */
export function resolveDc(dc: number | string, base: number): number {
  if (typeof dc === 'number') return normalizeDc(dc)
  const match = DC_EXPRESSION.exec(dc)
  return normalizeDc(match ? base + Number(match[1] ?? 0) : Number.NaN)
}

const scaleEffect = (effect: Effect, reward: number): Effect =>
  effect.effect === 'gold' ? { ...effect, amount: Math.round(effect.amount * reward) } : effect

function scaleBranch<T extends OutcomeBranch | Outcome>(branch: T, reward: number): T {
  const scaled = { ...branch, effects: branch.effects.map((e) => scaleEffect(e, reward)) }
  if ('twist' in scaled && scaled.twist) scaled.twist = scaleBranch(scaled.twist, reward)
  return scaled
}

const scaleRequirements = (requires: Requirement[], reward: number): Requirement[] =>
  requires.flatMap((r) => {
    const min = Math.round(r.min * reward)
    return min > 0 ? [{ ...r, min }] : []
  })

function resolveOption(option: Option, base: number, reward: number): Option {
  const requires = scaleRequirements(option.requires, reward)
  if (option.kind === 'fixed') return { ...option, requires, outcome: scaleBranch(option.outcome, reward) }
  const outcomes = Object.fromEntries(
    Object.entries(option.outcomes).map(([tier, outcome]) => [tier, outcome && scaleBranch(outcome, reward)])
  ) as typeof option.outcomes
  return { ...option, requires, check: { ...option.check, dc: resolveDc(option.check.dc, base) }, outcomes }
}

/** An archetype's options with DCs resolved against `ref.dc` and gold scaled by `ref.reward`. */
export function instantiateArchetype(archetype: Archetype, ref: ArchetypeRef): Option[] {
  return archetype.options.map((option) => resolveOption(option, ref.dc, ref.reward))
}

function compileStage(stage: Stage, content: Content): Stage {
  const { archetype: ref, ...rest } = stage
  const base = ref?.dc ?? DEFAULT_ARCHETYPE_DC
  const own = stage.options.map((option) => resolveOption(option, base, 1))
  if (!ref) return { ...rest, options: own }
  if (!Object.hasOwn(content.archetypes, ref.id)) throw new Error(`unknown archetype "${ref.id}"`)
  return { ...rest, options: [...instantiateArchetype(content.archetypes[ref.id], ref), ...own] }
}

/**
 * The playable form of a situation: archetypes expanded, every DC a number, provenance stripped.
 * This snapshot is what an encounter stores in GameState.
 */
export function compileSituation(situation: Situation, content: Content): Situation {
  const { source: _source, file: _file, ...plain } = situation as Partial<Sourced<Situation>> & Situation
  const stages = Object.fromEntries(
    Object.entries(situation.stages).map(([id, stage]) => [id, compileStage(stage, content)])
  )
  return { ...plain, stages }
}

export function templateToSituation(template: SituationTemplate): Situation {
  const { text, archetype, ...fields } = template
  return {
    ...fields,
    wonder: false,
    followUpOnly: false,
    start: 'start',
    stages: { start: { text, archetype, options: [] } },
  }
}

/** Every situation the deck can play: hand-written situations plus compiled templates, by id. */
export function allSituations(content: Content): Sourced<Situation>[] {
  const templates = Object.values(content.situationTemplates).map((t) => ({
    ...templateToSituation(t),
    source: t.source,
    file: t.file,
  }))
  return [...Object.values(content.situations), ...templates].sort((a, b) => byCodeUnit(a.id, b.id))
}
```

**Step 5: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 6: Commit**

```bash
git add src/engine
git commit -m "instantiate archetypes and compile situations and templates"
```

---

### Task 8: The encounter runner

`step` now takes the content, because starting and drawing an encounter need it. The runner:
- Starts an encounter: it compiles the situation, fills its slots and rolls the hidden twist.
- Draws one: a due follow-up comes first, otherwise a weighted random pick.
- Resolves a choice:
  - A check option rolls with the best actor for the skill and ability pairing, or the player's choice. The roll mode comes from the position, and the roll spends that position.
  - The outcome for the tier is picked (or its twist branch) and its effects applied. The encounter then moves to the next stage, stays, or ends.
  - Each check records a skill use. A natural 20 grants Inspiration, except on combat checks.

**Files:**
- Create: `src/engine/encounters/outcomes.ts`, `src/engine/encounters/run.ts`
- Modify: `src/engine/state.ts`, `src/engine/state.test.ts`, `src/engine/save.test.ts`, `src/ui/useGame.ts`
- Test: `src/engine/encounters/outcomes.test.ts`, `src/engine/encounters/run.test.ts`

**Step 1: Write the failing tests**

`src/engine/encounters/outcomes.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { CheckOptionSchema } from '../../schema/encounter'
import { tierOdds } from '../rules/checks'
import { branchFor, isHighStakes, tierOutcome } from './outcomes'

const option = (overrides: object = {}) =>
  CheckOptionSchema.parse({
    id: 'jump',
    kind: 'check',
    label: 'Jump',
    check: { skill: 'acrobatics', dc: 12 },
    outcomes: {
      fail: { text: 'You fall.', effects: [{ effect: 'hp', amount: -4, target: 'actor' }] },
      partial: { text: 'Bruised.' },
      success: { text: 'Across.', twist: { text: 'Across, into an ambush.' } },
    },
    ...overrides,
  })

describe('tierOutcome and branchFor', () => {
  test('critical tiers fall back to fail and success', () => {
    expect(tierOutcome(option(), 'critFail').text).toBe('You fall.')
    expect(tierOutcome(option(), 'critSuccess').text).toBe('Across.')
  })

  test('the twist branch is used only when the twist is true and a branch exists', () => {
    const success = tierOutcome(option(), 'success')
    expect(branchFor(success, false).text).toBe('Across.')
    expect(branchFor(success, true).text).toBe('Across, into an ambush.')
    expect(branchFor(tierOutcome(option(), 'partial'), true).text).toBe('Bruised.')
  })
})

describe('isHighStakes', () => {
  test('a close call that can cost HP', () => {
    expect(isHighStakes(option(), tierOdds(0, 12, 'normal'))).toBe(true) // 45%
  })
  test('not when the odds are lopsided', () => {
    expect(isHighStakes(option(), tierOdds(8, 12, 'normal'))).toBe(false) // 85%
    expect(isHighStakes(option(), tierOdds(-5, 12, 'normal'))).toBe(false) // 20%
    expect(isHighStakes(option(), tierOdds(-4, 12, 'normal'))).toBe(true) // 25%: the band is inclusive
  })
  test('not when nothing costs HP, unless the content says so', () => {
    const safe = option({ outcomes: { fail: { text: 'No.' }, partial: { text: 'Meh.' }, success: { text: 'Yes.' } } })
    expect(isHighStakes(safe, tierOdds(0, 12, 'normal'))).toBe(false)
    expect(isHighStakes({ ...safe, highStakes: true }, tierOdds(8, 12, 'normal'))).toBe(true)
  })
  test('HP loss hidden in a twist branch counts', () => {
    const twisty = option({
      outcomes: {
        fail: { text: 'No.' },
        partial: { text: 'Meh.' },
        success: { text: 'Yes.', twist: { text: 'Ow.', effects: [{ effect: 'hp', amount: -1, target: 'all' }] } },
      },
    })
    expect(isHighStakes(twisty, tierOdds(0, 12, 'normal'))).toBe(true)
  })
})
```

`src/engine/encounters/run.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { GameStateSchema, type GameState } from '../../schema/state'
import { createRng } from '../rng'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { currentOptions } from './run'

const content = fixtureContent()
const start = (situationId: string, state: GameState = makeState()) =>
  step(state, { type: 'startEncounter', situationId }, content)
const choose = (state: GameState, optionId: string, actorId?: string) =>
  step(state, { type: 'chooseOption', optionId, actorId }, content)
/** The same state with a different RNG seed, to sample many rolls. */
const reseed = (state: GameState, seed: number): GameState => ({ ...state, rng: createRng(seed) })
const withTwist = (state: GameState, twist: boolean): GameState => ({ ...state, encounter: { ...state.encounter!, twist } })

describe('startEncounter', () => {
  test('compiles the situation, fills slots and opens on the start stage', () => {
    const state = start('roadside')
    const encounter = state.encounter!
    expect(encounter.stage).toBe('start')
    expect(encounter.source).toBe('original')
    expect(encounter.position).toBe('normal')
    expect(encounter.slots.who).toMatch(/^a wary (tinker|pilgrim)$/)
    expect(encounter.log).toEqual([{ text: `${encounter.slots.who.replace('a', 'A')} begs for help. A child waits at home.`, tone: 'info' }])
    expect(currentOptions(encounter).map((o) => o.id)).toEqual(['trust', 'careful', 'read', 'rob', 'donate', 'leave'])
    expect(state.log.at(-1)?.text).toMatch(/^Roadside\. A wary/)
    expect(GameStateSchema.parse(state)).toEqual(state)
  })

  test('is deterministic, and the hidden twist follows its chance', () => {
    expect(start('roadside')).toEqual(start('roadside'))
    const twists = Array.from({ length: 200 }, (_, seed) => start('roadside', reseed(makeState(), seed)).encounter!.twist)
    const share = twists.filter(Boolean).length / twists.length
    expect(share).toBeGreaterThan(0.35)
    expect(share).toBeLessThan(0.65)
    expect(start('cliff').encounter!.twist).toBe(false) // no twist defined
  })

  test('an unknown situation logs and starts nothing', () => {
    const state = start('nope')
    expect(state.encounter).toBeNull()
    expect(state.log.at(-1)).toMatchObject({ text: 'Unknown encounter "nope".', tone: 'bad' })
  })
})

describe('fixed options', () => {
  test('apply the outcome and end the encounter', () => {
    const after = choose(withTwist(start('roadside'), false), 'trust')
    expect(after.gold).toBe(20 + 20) // reward 2 doubles the archetype's 10 gp
    expect(after.encounter?.stage).toBeNull()
    expect(after.encounter?.log.at(-1)?.text).toMatch(/thanks you\. \(\+20 gp\)$/)
  })

  test('the twist branch replaces the outcome when the twist is true', () => {
    const before = withTwist(start('roadside'), true)
    const after = choose(before, 'trust')
    expect(after.gold).toBe(0) // 20 − 20
    const hp = (s: GameState) => s.party.reduce((sum, c) => sum + c.hp, 0)
    expect(hp(after)).toBe(hp(before) - 3)
    expect(after.encounter?.log.at(-1)?.text).toBe('A trap! (−20 gp, someone −3 HP)')
  })

  test('unmet requirements block the option and change nothing but the journal', () => {
    const poor = start('roadside', makeState({ gold: 5 }))
    const after = choose(poor, 'donate')
    expect(after.encounter).toEqual(poor.encounter)
    expect(after.gold).toBe(5)
    expect(after.log.at(-1)).toMatchObject({ text: 'Give them money: needs 20 gp.', tone: 'bad' })
  })
})

describe('check options', () => {
  test('roll with the best actor for the skill, or the player\'s choice', () => {
    expect(choose(start('roadside'), 'read').lastRoll).toMatchObject({ stat: 'insight', actorId: 'lyra', dc: 12 })
    expect(choose(start('roadside'), 'read', 'brom').lastRoll?.actorId).toBe('brom')
  })

  test('once options stay on the stage, then disappear; choosing them again is a no-op', () => {
    const after = choose(start('roadside'), 'read')
    expect(after.encounter?.stage).toBe('start')
    expect(after.encounter?.used).toEqual(['start/read'])
    expect(currentOptions(after.encounter!).map((o) => o.id)).not.toContain('read')
    expect(choose(after, 'read')).toEqual(after)
  })

  test('Edge rolls with advantage, Exposed with disadvantage, and the roll spends the position', () => {
    const cliff = start('cliff')
    const edge = choose({ ...cliff, encounter: { ...cliff.encounter!, position: 'edge' } }, 'around')
    expect(edge.encounter?.position).toBe('edge') // fixed options don't spend it
    for (const [position, mode] of [['edge', 'advantage'], ['exposed', 'disadvantage']] as const) {
      const after = choose({ ...cliff, encounter: { ...cliff.encounter!, position } }, 'climb')
      expect(after.lastRoll?.mode).toBe(mode)
      expect(after.lastRoll?.dice).toHaveLength(2)
    }
  })

  test('outcomes set the next position and stage', () => {
    for (let seed = 0; seed < 60; seed++) {
      const after = choose(reseed(start('cliff'), seed), 'climb')
      const tier = after.lastRoll!.tier
      const expected = {
        critFail: ['exposed', 'start'],
        fail: ['exposed', 'start'],
        partial: ['normal', 'ledge'],
        success: ['edge', 'ledge'],
        critSuccess: ['edge', 'ledge'],
      }[tier]
      expect([after.encounter?.position, after.encounter?.stage]).toEqual(expected)
      if (after.encounter?.stage === 'ledge') expect(after.encounter.log.at(-1)?.text).toBe('A gap yawns on the ledge.')
    }
  })

  test('{actor} in outcome text is the member who rolled', () => {
    for (let seed = 0; seed < 40; seed++) {
      const after = choose(reseed(start('cliff'), seed), 'climb', 'lyra')
      if (after.lastRoll?.tier === 'fail') {
        expect(after.encounter?.log.at(-1)?.text).toBe('Lyra slips. (Lyra −3 HP, Exposed)')
        return
      }
    }
    throw new Error('no failed climb in 40 seeds')
  })

  test('a natural 20 grants Inspiration, except on combat checks', () => {
    const crit = (situationId: string, optionId: string) => {
      for (let seed = 0; seed < 400; seed++) {
        const before = reseed(start(situationId), seed)
        const after = choose(before, optionId)
        if (after.lastRoll?.tier === 'critSuccess') return after.inspiration - before.inspiration
      }
      throw new Error('no critical success in 400 seeds')
    }
    expect(crit('cliff', 'climb')).toBe(1)
    expect(crit('grudge', 'fight')).toBe(0)
  })

  test('each check records a skill use; practice rolls and old uses do not stay', () => {
    const old = { day: 1, characterId: 'brom', skill: 'stealth' as const }
    const state = start('cliff', makeState({ day: 9, skillUses: [old, { ...old, day: 3 }] }))
    const after = choose(state, 'climb')
    expect(after.skillUses).toEqual([{ ...old, day: 3 }, { day: 9, characterId: 'brom', skill: 'athletics' }])
    const practised = step(makeState(), { type: 'practiceCheck', stat: 'athletics', dc: 10, mode: 'normal' }, content)
    expect(practised.skillUses).toEqual([])
  })

  test('the encounter ends when no one is left standing', () => {
    const frail = makeState({ party: makeState().party.map((c) => ({ ...c, hp: 1 })) })
    for (let seed = 0; seed < 100; seed++) {
      const after = choose(reseed(start('grudge', frail), seed), 'fight')
      if (after.lastRoll?.tier === 'fail' || after.lastRoll?.tier === 'critFail') {
        expect(after.encounter?.stage).toBeNull()
        expect(after.log.at(-1)).toMatchObject({ text: 'No one is left standing.', tone: 'bad' })
        return
      }
    }
    throw new Error('no failed fight in 100 seeds')
  })

  test('choosing never mutates the input state', () => {
    const before = start('cliff')
    const snapshot = structuredClone(before)
    choose(before, 'climb')
    expect(before).toEqual(snapshot)
  })
})

describe('drawing encounters and follow-ups', () => {
  const draw = (state: GameState, sources?: ('original' | 'procedural')[]) =>
    step(state, { type: 'drawEncounter', sources }, content)

  test('random draws respect the source filter and never pick follow-up-only situations', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = reseed(makeState(), seed)
      expect(draw(state).encounter?.situation.id).not.toBe('grudge')
      expect(draw(state, ['procedural']).encounter?.situation.id).toBe('plea')
    }
  })

  test('an empty filter logs and starts nothing', () => {
    const after = step(makeState(), { type: 'drawEncounter', sources: [] }, content)
    expect(after.encounter).toBeNull()
    expect(after.log.at(-1)?.tone).toBe('bad')
  })

  test('a follow-up fires after its wait, whatever the filter', () => {
    const queued = makeState({ followUps: [{ situationId: 'grudge', wait: 1 }] })
    const first = draw(queued, ['procedural'])
    expect(first.encounter?.situation.id).toBe('plea')
    expect(first.followUps).toEqual([{ situationId: 'grudge', wait: 0 }])
    const second = draw(step(first, { type: 'closeEncounter' }, content), ['procedural'])
    expect(second.encounter?.situation.id).toBe('grudge')
    expect(second.followUps).toEqual([])
  })

  test('closeEncounter clears the encounter', () => {
    expect(step(start('cliff'), { type: 'closeEncounter' }, content).encounter).toBeNull()
  })
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/engine/encounters`. Expected: FAIL, because `./outcomes` and `./run` cannot be resolved.

**Step 3: Implement**

Create `src/engine/encounters/outcomes.ts`:

```ts
import type { CheckOption, Outcome, OutcomeBranch } from '../../schema/encounter'
import { TIERS, successChance, type Tier } from '../rules/checks'

/** The outcome for a tier; critical tiers fall back to fail and success. */
export function tierOutcome(option: CheckOption, tier: Tier): Outcome {
  const { outcomes } = option
  if (tier === 'critFail') return outcomes.critFail ?? outcomes.fail
  if (tier === 'critSuccess') return outcomes.critSuccess ?? outcomes.success
  return outcomes[tier]
}

/** The twist branch replaces the outcome when the hidden twist is true. */
export const branchFor = (outcome: Outcome, twist: boolean): OutcomeBranch =>
  twist && outcome.twist ? outcome.twist : outcome

/** Success chances in this band are close calls (design §9: the dice slow down and glow). */
export const HIGH_STAKES_BAND = [0.25, 0.75] as const

/** Flagged by content, or a close call where some outcome (twist included) costs HP. */
export function isHighStakes(option: CheckOption, odds: Record<Tier, number>): boolean {
  if (option.highStakes) return true
  const chance = successChance(odds)
  if (chance < HIGH_STAKES_BAND[0] || chance > HIGH_STAKES_BAND[1]) return false
  return TIERS.some((tier) => {
    const outcome = tierOutcome(option, tier)
    return [outcome, outcome.twist].some((b) => b?.effects.some((e) => e.effect === 'hp' && e.amount < 0))
  })
}
```

Create `src/engine/encounters/run.ts`:

```ts
import type { Content } from '../../content/build'
import type { Source } from '../../schema/common'
import type { Position } from '../../schema/constants'
import type { Effect, Option, OutcomeBranch, Requirement } from '../../schema/encounter'
import type { EncounterLogEntry, EncounterState, GameState, RollRecord } from '../../schema/state'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { withRng } from '../rng'
import { checkLabel } from '../rules/abilities'
import { canAct, chooseActor } from '../rules/character'
import { TIER_LABELS, normalizeDc, rollCheck, tierOdds, type RollMode } from '../rules/checks'
import { allSituations, compileSituation } from './compile'
import { applyEffects, describeEffect } from './effects'
import { branchFor, isHighStakes, tierOutcome } from './outcomes'
import { fillText, rollSlots } from './slots'

export type EncounterAction =
  | { type: 'startEncounter'; situationId: string }
  | { type: 'drawEncounter'; sources?: Source[] }
  | { type: 'chooseOption'; optionId: string; actorId?: string }
  | { type: 'closeEncounter' }

/** Edge and Exposed apply to the next check only (design §3). */
export const POSITION_MODE: Record<Position, RollMode> = {
  normal: 'normal',
  edge: 'advantage',
  exposed: 'disadvantage',
}

/** Skill uses older than this many days are dropped; Strain (Plan 3) looks back at most a week. */
export const SKILL_USE_DAYS = 7

export function startEncounter(state: GameState, content: Content, situationId: string): GameState {
  const found = allSituations(content).find((s) => s.id === situationId)
  if (!found) return appendLog(state, `Unknown encounter "${situationId}".`, 'bad')
  const situation = compileSituation(found, content)
  const [{ slots, twist }, rng] = withRng(state.rng, (d) => ({
    slots: rollSlots(d, content, situation.slots),
    twist: situation.twist ? d.float() < situation.twist.chance : false,
  }))
  const text = fillText(situation.stages[situation.start].text, slots)
  const encounter: EncounterState = {
    situation,
    source: found.source,
    stage: situation.start,
    position: 'normal',
    slots,
    twist,
    twistRevealed: false,
    used: [],
    log: [{ text, tone: 'info' }],
  }
  return appendLog({ ...state, rng, encounter }, `${situation.title}. ${text}`, 'info')
}

/**
 * A due follow-up (wait 0) comes first, whatever the source filter. Otherwise a weighted random
 * pick, never a followUpOnly situation, and every queued follow-up moves one encounter closer.
 */
export function drawEncounter(state: GameState, content: Content, sources?: readonly Source[]): GameState {
  const due = state.followUps.findIndex((f) => f.wait === 0)
  if (due >= 0) {
    const followUps = state.followUps.filter((_, i) => i !== due)
    return startEncounter({ ...state, followUps }, content, state.followUps[due].situationId)
  }
  const candidates = allSituations(content).filter(
    (s) => !s.followUpOnly && s.weight > 0 && (!sources || sources.includes(s.source))
  )
  if (candidates.length === 0) return appendLog(state, 'No encounters match that filter.', 'bad')
  const [picked, rng] = withRng(state.rng, (d) => d.weighted(candidates, (s) => s.weight))
  const followUps = state.followUps.map((f) => ({ ...f, wait: Math.max(0, f.wait - 1) }))
  return startEncounter({ ...state, rng, followUps }, content, picked.id)
}

export const closeEncounter = (state: GameState): GameState => ({ ...state, encounter: null })

/** Human-readable reasons an option can't be chosen, e.g. "needs 15 gp". Empty when available. */
export function unmetRequirements(state: GameState, requires: readonly Requirement[]): string[] {
  return requires.flatMap((r) => (state.gold >= r.min ? [] : [`needs ${r.min} gp`]))
}

/** The current stage's options that can still be chosen (used `once` options are gone). */
export function currentOptions(encounter: EncounterState): Option[] {
  if (encounter.stage === null) return []
  const stageId = encounter.stage
  const stage = encounter.situation.stages[stageId]
  if (!stage) return []
  return stage.options.filter((o) => !(o.once && encounter.used.includes(`${stageId}/${o.id}`)))
}

const nameOf = (state: GameState, id: string | undefined) => state.party.find((c) => c.id === id)?.name

function resolve(
  state: GameState,
  branch: OutcomeBranch,
  actorId: string | undefined,
  entry: Pick<EncounterLogEntry, 'tone' | 'roll' | 'highStakes'>
): GameState {
  const encounter = state.encounter!
  const fromStage = encounter.stage!
  const actorName = nameOf(state, actorId)
  const values = actorName ? { ...encounter.slots, actor: actorName } : encounter.slots
  const fill = (text: string) => fillText(text, values)
  const effects: Effect[] = branch.effects.map((e) => (e.effect === 'log' ? { ...e, text: fill(e.text) } : e))
  const chips = effects.flatMap((e) => describeEffect(e, actorName ?? 'someone') ?? [])
  const text = fill(branch.text) + (chips.length > 0 ? ` (${chips.join(', ')})` : '')

  // The outcome text comes before any log effects it triggers.
  let next = appendLog(state, text, entry.tone)
  next = { ...next, encounter: { ...encounter, log: [...encounter.log, { ...entry, text }] } }
  next = applyEffects(next, effects, { actorId })

  const target = branch.goto ?? (branch.stay ? fromStage : null)
  const stage = target !== null && Object.hasOwn(encounter.situation.stages, target) ? target : null
  let log = next.encounter!.log
  if (stage !== null && stage !== fromStage) {
    log = [...log, { text: fill(encounter.situation.stages[stage].text), tone: 'info' }]
  }
  if (!next.party.some(canAct)) {
    next = appendLog(next, 'No one is left standing.', 'bad')
    return { ...next, encounter: { ...next.encounter!, stage: null, log } }
  }
  return { ...next, encounter: { ...next.encounter!, stage, log } }
}

export function chooseOption(state: GameState, optionId: string, actorId?: string): GameState {
  const encounter = state.encounter
  if (!encounter || encounter.stage === null) return state
  const option = currentOptions(encounter).find((o) => o.id === optionId)
  if (!option) return state
  const unmet = unmetRequirements(state, option.requires)
  if (unmet.length > 0) return appendLog(state, `${option.label}: ${unmet.join(', ')}.`, 'bad')

  const used = option.once ? [...encounter.used, `${encounter.stage}/${option.id}`] : encounter.used
  if (option.kind === 'fixed') {
    const marked = { ...state, encounter: { ...encounter, used } }
    return resolve(marked, branchFor(option.outcome, encounter.twist), undefined, { tone: 'info' })
  }

  const { skill, ability, combat } = option.check
  const actor = chooseActor(state.party, skill, actorId, ability)
  if (!actor) return appendLog(state, 'No one is able to act.', 'bad')
  const dc = normalizeDc(Number(option.check.dc))
  const mode = POSITION_MODE[encounter.position]
  const [roll, rng] = rollCheck(state.rng, actor.modifier, dc, mode)
  const record: RollRecord = { ...roll, stat: skill, ability, actorId: actor.characterId }
  const inspired = roll.tier === 'critSuccess' && !combat
  const highStakes = isHighStakes(option, tierOdds(actor.modifier, dc, mode))
  const name = nameOf(state, actor.characterId) ?? '?'
  const rollText =
    `${name} rolls ${checkLabel(skill, ability)}: ${roll.kept} ${formatModifier(roll.modifier)} = ` +
    `${roll.total} vs DC ${dc}. ${TIER_LABELS[roll.tier]}.` +
    (inspired ? ' Inspiration gained!' : '')
  const skillUses = [
    ...state.skillUses.filter((u) => u.day > state.day - SKILL_USE_DAYS),
    { day: state.day, characterId: actor.characterId, skill },
  ]
  const rolled = appendLog(
    {
      ...state,
      rng,
      lastRoll: record,
      skillUses,
      inspiration: state.inspiration + (inspired ? 1 : 0),
      // Edge and Exposed are spent by this roll; the outcome may set a new position.
      encounter: { ...encounter, position: 'normal', used },
    },
    rollText,
    TIER_TONE[roll.tier]
  )
  const branch = branchFor(tierOutcome(option, roll.tier), encounter.twist)
  return resolve(rolled, branch, actor.characterId, { tone: TIER_TONE[roll.tier], roll: record, highStakes })
}

export function stepEncounter(state: GameState, action: EncounterAction, content: Content): GameState {
  switch (action.type) {
    case 'startEncounter':
      return startEncounter(state, content, action.situationId)
    case 'drawEncounter':
      return drawEncounter(state, content, action.sources)
    case 'chooseOption':
      return chooseOption(state, action.optionId, action.actorId)
    case 'closeEncounter':
      return closeEncounter(state)
  }
}
```

In `src/engine/state.ts`, add the import:

```ts
import { stepEncounter, type EncounterAction } from './encounters/run'
```

replace the `Action` type:

```ts
export type Action =
  | { type: 'practiceCheck'; stat: CheckStat; dc: number; mode: RollMode; actorId?: string }
  | EncounterAction
```

change the signature to `export function step(state: GameState, action: Action, content: Content): GameState`, and add a `default` case after the `practiceCheck` case:

```ts
    default:
      return stepEncounter(state, action, content)
```

**Step 4: Pass the content to every `step` call**
- In `src/engine/state.test.ts`, add `, content` as the third argument of the three `step(…)` calls (`content` is already defined there).
- In `src/engine/save.test.ts`, add `const content = fixtureContent()` above the first test, and `, content` to its two `step(…)` calls.
- In `src/ui/useGame.ts`, replace the reducer and the `useReducer` call:

```ts
const reducer =
  (content: Content) =>
  (state: GameState, action: UiAction): GameState =>
    action.type === 'replace' ? action.state : step(state, action, content)
```

```ts
  const [state, dispatch] = useReducer(reducer(content), null, () => loadSaved() ?? newGame(randomSeed(), content))
```

**Step 5: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 6: Commit**

```bash
git add src/engine src/ui/useGame.ts
git commit -m "run encounters: start, draw, choose, follow-ups, Edge and Exposed"
```

---

### Task 9: Option previews

`encounterOptions(state, actorIds)` is the encounter's `availableActions` (design §2). For each option it returns:
- the acting member and their modifier, the skill (with any ability override), the DC, the roll mode and the exact odds;
- whether the roll counts as high stakes;
- every outcome tier, with effect chips and twist branches;
- whether the option is available, and why not.

`twistInfo` always says what the twist would be, and gives its chance only once revealed.

**High stakes** (used by the dice animation): either the option sets `highStakes: true`, or the success chance is within 25–75% (inclusive) and some outcome, twist branches included, costs HP. The rule lives in `outcomes.ts` from Task 8.

**Files:**
- Create: `src/engine/encounters/preview.ts`
- Test: `src/engine/encounters/preview.test.ts`

**Step 1: Write the failing test `src/engine/encounters/preview.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import type { GameState } from '../../schema/state'
import { TIERS, tierOdds } from '../rules/checks'
import { step } from '../state'
import { fixtureContent, makeState } from '../test-fixtures'
import { encounterOptions, twistInfo } from './preview'

const content = fixtureContent()
const start = (situationId: string, state: GameState = makeState()) =>
  step(state, { type: 'startEncounter', situationId }, content)
const byId = (state: GameState, actorIds: Record<string, string> = {}) =>
  Object.fromEntries(encounterOptions(state, actorIds).map((o) => [o.id, o]))

describe('encounterOptions', () => {
  const roadside = start('roadside')

  test('check options show actor, skill, DC, exact odds and all five tiers', () => {
    const read = byId(roadside).read
    expect(read.check).toMatchObject({ actorId: 'lyra', actorName: 'Lyra', label: 'Insight', modifier: 2, dc: 12, mode: 'normal' })
    expect(read.check?.odds).toEqual(tierOdds(2, 12, 'normal'))
    expect(read.check?.successChance).toBeCloseTo(0.55)
    expect(read.outcomes.map((o) => o.tier)).toEqual([...TIERS])
    expect(read.outcomes[0]).toMatchObject({ text: 'You cannot tell.', next: 'stay' }) // critFail falls back to fail
    expect(read.outcomes[3]).toEqual({
      tier: 'success',
      text: 'Lyra reads them.',
      effects: ['reveals the odds of a twist', 'Edge'],
      next: 'stay',
      twist: null,
    })
    expect(read.check?.actors.map((a) => a.id)).toEqual(['lyra', 'brom'])
  })

  test('an actor override changes the preview', () => {
    expect(byId(roadside, { read: 'brom' }).read.check).toMatchObject({ actorId: 'brom', modifier: 1 })
  })

  test('the position sets the roll mode', () => {
    const edge = { ...roadside, encounter: { ...roadside.encounter!, position: 'edge' as const } }
    expect(byId(edge).read.check?.mode).toBe('advantage')
    expect(byId(edge).read.check?.odds).toEqual(tierOdds(2, 12, 'advantage'))
  })

  test('fixed options show their outcome and its twist branch', () => {
    const trust = byId(roadside).trust
    expect(trust.check).toBeNull()
    expect(trust.outcomes).toEqual([
      {
        tier: null,
        text: `${roadside.encounter!.slots.who.replace('a', 'A')} thanks you.`,
        effects: ['+20 gp'],
        next: 'end',
        twist: { text: 'A trap!', effects: ['−20 gp', 'someone −3 HP'], next: 'end' },
      },
    ])
  })

  test('unmet requirements make an option unavailable, with the reason', () => {
    const donate = byId(start('roadside', makeState({ gold: 5 }))).donate
    expect(donate).toMatchObject({ available: false, unmet: ['needs 20 gp'] })
  })

  test('used once options are gone, and checks need someone able to act', () => {
    const afterRead = step(roadside, { type: 'chooseOption', optionId: 'read' }, content)
    expect(Object.keys(byId(afterRead))).not.toContain('read')
    const downed = { ...roadside, party: roadside.party.map((c) => ({ ...c, hp: 0 })) }
    expect(byId(downed).rob).toMatchObject({ available: false, unmet: ['no one can act'], check: null })
  })

  test('the high-stakes flag comes from the odds and the outcomes', () => {
    expect(byId(start('cliff')).climb.check?.highStakes).toBe(true) // 70%, a fail costs HP
    expect(byId(roadside).read.check?.highStakes).toBe(false) // nothing costs HP
  })

  test('no encounter, no options', () => {
    expect(encounterOptions(makeState())).toEqual([])
  })
})

describe('twistInfo', () => {
  test('what the twist is shows at once; its chance only once revealed', () => {
    const roadside = start('roadside')
    expect(twistInfo(roadside)).toEqual({ what: 'it is a trap', chance: null })
    const revealed = { ...roadside, encounter: { ...roadside.encounter!, twistRevealed: true } }
    expect(twistInfo(revealed)).toEqual({ what: 'it is a trap', chance: 0.5 })
    expect(twistInfo(start('cliff'))).toBeNull()
    expect(twistInfo(makeState())).toBeNull()
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/engine/encounters/preview.test.ts`. Expected: FAIL, because `./preview` cannot be resolved.

**Step 3: Implement `src/engine/encounters/preview.ts`**

```ts
import type { Outcome, OutcomeBranch } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { previewCheck, type CheckPreview } from '../preview'
import { checkLabel } from '../rules/abilities'
import { rankActors } from '../rules/character'
import { TIERS, successChance, type RollMode, type Tier } from '../rules/checks'
import { describeEffect } from './effects'
import { isHighStakes, tierOutcome } from './outcomes'
import { POSITION_MODE, currentOptions, unmetRequirements } from './run'
import { fillText } from './slots'

export type BranchPreview = { text: string; effects: string[]; next: 'end' | 'stay' | 'stage' }
/** One row of an option card. `tier` is null for fixed options. `twist` is shown as "if …". */
export type OutcomePreview = BranchPreview & { tier: Tier | null; twist: BranchPreview | null }

export type OptionCheckPreview = CheckPreview & {
  label: string
  mode: RollMode
  successChance: number
  highStakes: boolean
  /** Everyone able to act, best first, for the actor picker. */
  actors: { id: string; name: string; modifier: number }[]
}

export type OptionPreview = {
  id: string
  label: string
  description?: string
  kind: 'check' | 'fixed'
  available: boolean
  /** Why it isn't available, e.g. "needs 15 gp". */
  unmet: string[]
  check: OptionCheckPreview | null
  outcomes: OutcomePreview[]
}

/** What the twist would be is always shown (its outcome branches are); the odds only once revealed. */
export type TwistInfo = { what: string; chance: number | null }

function branchPreview(branch: OutcomeBranch, values: Record<string, string>, actorName: string): BranchPreview {
  return {
    text: fillText(branch.text, values),
    effects: branch.effects.flatMap((e) => describeEffect(e, actorName) ?? []),
    next: branch.goto ? 'stage' : branch.stay ? 'stay' : 'end',
  }
}

function outcomePreview(
  outcome: Outcome,
  tier: Tier | null,
  values: Record<string, string>,
  actorName: string
): OutcomePreview {
  return {
    ...branchPreview(outcome, values, actorName),
    tier,
    twist: outcome.twist ? branchPreview(outcome.twist, values, actorName) : null,
  }
}

/**
 * Everything the player sees before committing (design §7): the acting member, skill, DC, odds
 * and every outcome tier. `actorIds` maps option ids to the player's actor overrides.
 */
export function encounterOptions(state: GameState, actorIds: Readonly<Record<string, string>> = {}): OptionPreview[] {
  const encounter = state.encounter
  if (!encounter) return []
  const mode = POSITION_MODE[encounter.position]
  return currentOptions(encounter).map((option) => {
    const unmet = unmetRequirements(state, option.requires)
    const base = { id: option.id, label: option.label, description: option.description, kind: option.kind }
    if (option.kind === 'fixed') {
      const outcomes = [outcomePreview(option.outcome, null, encounter.slots, 'someone')]
      return { ...base, available: unmet.length === 0, unmet, check: null, outcomes }
    }
    const { skill, ability, dc } = option.check
    const preview = previewCheck(state, skill, Number(dc), mode, actorIds[option.id], ability)
    if (!preview) {
      return { ...base, available: false, unmet: [...unmet, 'no one can act'], check: null, outcomes: [] }
    }
    const values = { ...encounter.slots, actor: preview.actorName }
    const nameOf = (id: string) => state.party.find((c) => c.id === id)?.name ?? '?'
    const check: OptionCheckPreview = {
      ...preview,
      label: checkLabel(skill, ability),
      mode,
      successChance: successChance(preview.odds),
      highStakes: isHighStakes(option, preview.odds),
      actors: rankActors(state.party, skill, ability).map((r) => ({ id: r.characterId, name: nameOf(r.characterId), modifier: r.modifier })),
    }
    const outcomes = TIERS.map((tier) => outcomePreview(tierOutcome(option, tier), tier, values, preview.actorName))
    return { ...base, available: unmet.length === 0, unmet, check, outcomes }
  })
}

/** Null when the situation has no twist. The chance is null until revealed (e.g. by Insight). */
export function twistInfo(state: GameState): TwistInfo | null {
  const twist = state.encounter?.situation.twist
  if (!twist) return null
  return { what: twist.what, chance: state.encounter!.twistRevealed ? twist.chance : null }
}
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/engine/encounters
git commit -m "preview every encounter option: actor, skill, DC, odds and outcome tiers"
```

---

### Task 10: Content validator and quality lint

`validateSituation` finds anything that would make a situation unplayable:
- unknown archetypes, stages, parts tables, creatures or follow-up targets;
- unreachable stages;
- undeclared slots, or `{actor}` where nobody rolls;
- `actor` targets in fixed options;
- twist branches or `revealTwist` in a situation without a twist;
- DC expressions outside archetypes.

`lintSituation` enforces the design's quality rules. Regular stages need at least 2 options. Wonders are one stage with one fixed option, and never cost anything.

**Files:**
- Create: `src/engine/encounters/validate.ts`
- Test: `src/engine/encounters/validate.test.ts`

**Step 1: Write the failing test `src/engine/encounters/validate.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { SituationSchema } from '../../schema/encounter'
import { fixtureContent } from '../test-fixtures'
import { contentIssues, lintSituation, validateSituation } from './validate'

const content = fixtureContent()
const situation = (stages: object, extra: object = {}) =>
  SituationSchema.parse({ id: 'broken', title: 'Broken', ...extra, stages })
const fixed = (id: string, outcome: object = { text: 'Done.' }) => ({ id, kind: 'fixed', label: id, outcome })
const check = (id: string, outcomes: object, dc: number | string = 12) => ({
  id,
  kind: 'check',
  label: id,
  check: { skill: 'athletics', dc },
  outcomes: { fail: { text: 'No.' }, partial: { text: 'Meh.' }, success: { text: 'Yes.' }, ...outcomes },
})
const issues = (stages: object, extra?: object) => validateSituation(situation(stages, extra), content)

describe('validateSituation', () => {
  test('the fixture content is clean', () => {
    expect(contentIssues(content)).toEqual({})
  })

  test('unknown archetypes, and DC expressions outside archetypes', () => {
    expect(issues({ start: { text: '', archetype: { id: 'nope' } } })).toEqual(['stage start: unknown archetype "nope"'])
    expect(issues({ start: { text: '', options: [check('a', {}, 'dc+1'), fixed('b')] } })).toEqual([
      'start/a: DC "dc+1" needs an archetype on its stage',
    ])
  })

  test('missing and unreachable stages, duplicate ids, goto with stay', () => {
    const found = issues({
      start: { text: '', options: [check('a', { success: { text: '', goto: 'nowhere' } }), fixed('a', { text: '', goto: 'start', stay: true })] },
      island: { text: '', options: [fixed('x'), fixed('y')] },
    })
    expect(found).toEqual([
      'start/a success: goto unknown stage "nowhere"',
      'start: duplicate option id "a"',
      'start/a outcome: both goto and stay',
      'stage island is unreachable',
    ])
    expect(issues({ only: { text: '' } }, { start: 'begin' })).toContain('start stage "begin" does not exist')
  })

  test('slots must be declared, and {actor} only appears in check outcomes', () => {
    expect(
      issues({
        start: {
          text: '{Who} and {actor} wait.',
          options: [check('a', { success: { text: '{actor} wins {loot}.' } }), fixed('b', { text: '{actor} leaves.' })],
        },
      })
    ).toEqual([
      'stage start: slot {who} is not declared',
      'stage start: {actor} only works in check outcomes',
      'start/a success: slot {loot} is not declared',
      'start/b outcome: {actor} only works in check outcomes',
    ])
  })

  test('slot sources must resolve: tables, nested tables, creatures', () => {
    const loopy = {
      ...content,
      partsTables: {
        ...content.partsTables,
        a: { id: 'a', description: '', rows: [{ text: '{b}', weight: 1 }], source: 'procedural' as const, file: 'x' },
        b: { id: 'b', description: '', rows: [{ text: '{a} {gone}', weight: 1 }], source: 'procedural' as const, file: 'x' },
      },
    }
    const s = situation(
      { start: { text: '{x} {y} {z}', options: [fixed('a'), fixed('b')] } },
      {
        slots: {
          x: { from: 'table', table: 'missing' },
          y: { from: 'table', table: 'a' },
          z: { from: 'creature', types: ['dragon'] },
        },
      }
    )
    expect(validateSituation(s, loopy)).toEqual([
      'slot x: unknown parts table "missing"',
      'slot y: parts table loop: a → b → a',
      'slot y: unknown parts table "gone"',
      'slot z: no creature matches',
    ])
  })

  test('effects: follow-up targets, actor targets in fixed options, twists without a twist', () => {
    expect(
      issues({
        start: {
          text: '',
          options: [
            fixed('a', { text: '', effects: [{ effect: 'followUp', situation: 'nope' }, { effect: 'hp', amount: -1, target: 'actor' }] }),
            check('b', { success: { text: '', effects: [{ effect: 'revealTwist' }], twist: { text: 'Gotcha.' } } }),
          ],
        },
      })
    ).toEqual([
      'start/b success twist: twist branch but the situation has no twist',
      'start/a outcome: follow-up to unknown situation "nope"',
      'start/a outcome: fixed options have no actor; use "all" or "random"',
      'start/b success: revealTwist but the situation has no twist',
    ])
  })
})

describe('lintSituation', () => {
  test('regular stages need at least 2 options', () => {
    expect(lintSituation(situation({ start: { text: '', options: [fixed('a')] } }), content)).toEqual([
      'stage start has 1 option(s); regular encounters need at least 2',
    ])
  })

  test('wonders are one stage, one fixed option, and never cost anything', () => {
    const wonder = (options: object[]) => situation({ start: { text: '', options } }, { wonder: true })
    expect(lintSituation(wonder([fixed('look', { text: '', effects: [{ effect: 'inspiration', amount: 1 }] })]), content)).toEqual([])
    expect(lintSituation(wonder([fixed('a'), fixed('b')]), content)).toEqual(['a wonder is one stage with one fixed option'])
    expect(lintSituation(wonder([fixed('a', { text: '', effects: [{ effect: 'days', amount: 1 }] })]), content)).toEqual([
      'start/a outcome: wonders never cost anything (days)',
    ])
  })

  test('archetype options count towards the minimum', () => {
    const s = situation({ start: { text: '{who}', archetype: { id: 'test-need' } } }, { slots: { who: { from: 'table', table: 'who' } } })
    expect(lintSituation(s, content)).toEqual([])
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/engine/encounters/validate.test.ts`. Expected: FAIL, because `./validate` cannot be resolved.

**Step 3: Implement `src/engine/encounters/validate.ts`**

```ts
import type { Content } from '../../content/build'
import type { Effect, Option, OutcomeBranch, Outcome, Situation } from '../../schema/encounter'
import { allSituations, compileSituation } from './compile'
import { slotNames } from './slots'

/** Slots every check outcome may use without declaring them. */
export const BUILT_IN_SLOTS = ['actor'] as const

type Text = { text: string; where: string; actorAllowed: boolean }

function branches(option: Option): [string, Outcome][] {
  if (option.kind === 'fixed') return [['outcome', option.outcome]]
  return Object.entries(option.outcomes).flatMap(([tier, o]) => (o ? [[tier, o] as [string, Outcome]] : []))
}

const withTwist = (outcome: Outcome): [string, OutcomeBranch][] =>
  outcome.twist ? [['', outcome], [' twist', outcome.twist]] : [['', outcome]]

function textsOf(situation: Situation): Text[] {
  const texts: Text[] = []
  for (const [stageId, stage] of Object.entries(situation.stages)) {
    texts.push({ text: stage.text, where: `stage ${stageId}`, actorAllowed: false })
    for (const option of stage.options) {
      const at = `${stageId}/${option.id}`
      texts.push({ text: option.label, where: `${at} label`, actorAllowed: false })
      if (option.description) texts.push({ text: option.description, where: `${at} description`, actorAllowed: false })
      for (const [name, outcome] of branches(option)) {
        for (const [suffix, branch] of withTwist(outcome)) {
          const where = `${at} ${name}${suffix}`
          const actorAllowed = option.kind === 'check'
          texts.push({ text: branch.text, where, actorAllowed })
          for (const effect of branch.effects) {
            if (effect.effect === 'log') texts.push({ text: effect.text, where: `${where} log`, actorAllowed })
          }
        }
      }
    }
  }
  return texts
}

const allEffects = (situation: Situation): { effect: Effect; option: Option; where: string }[] =>
  Object.entries(situation.stages).flatMap(([stageId, stage]) =>
    stage.options.flatMap((option) =>
      branches(option).flatMap(([name, outcome]) =>
        withTwist(outcome).flatMap(([suffix, branch]) =>
          branch.effects.map((effect) => ({ effect, option, where: `${stageId}/${option.id} ${name}${suffix}` }))
        )
      )
    )
  )

/** Parts-table problems reachable from `tableId`: unknown tables and reference loops. */
function tableIssues(content: Content, tableId: string, path: string[] = []): string[] {
  if (path.includes(tableId)) return [`parts table loop: ${[...path, tableId].join(' → ')}`]
  if (!Object.hasOwn(content.partsTables, tableId)) return [`unknown parts table "${tableId}"`]
  const refs = new Set(content.partsTables[tableId].rows.flatMap((r) => slotNames(r.text)))
  return [...refs].flatMap((ref) => tableIssues(content, ref, [...path, tableId]))
}

/**
 * Structural problems that would make a situation unplayable: missing archetypes, stages,
 * slots, tables, creatures or follow-up targets; unreachable stages; misused {actor} and twists.
 */
export function validateSituation(situation: Situation, content: Content): string[] {
  const issues: string[] = []
  for (const [stageId, stage] of Object.entries(situation.stages)) {
    if (stage.archetype && !Object.hasOwn(content.archetypes, stage.archetype.id)) {
      issues.push(`stage ${stageId}: unknown archetype "${stage.archetype.id}"`)
    }
    for (const option of stage.options) {
      if (option.kind === 'check' && typeof option.check.dc === 'string' && !stage.archetype) {
        issues.push(`${stageId}/${option.id}: DC "${option.check.dc}" needs an archetype on its stage`)
      }
    }
  }
  if (issues.length > 0) return issues
  const compiled = compileSituation(situation, content)
  const stageIds = new Set(Object.keys(compiled.stages))

  if (!stageIds.has(compiled.start)) issues.push(`start stage "${compiled.start}" does not exist`)
  const edges = new Map<string, string[]>()
  for (const [stageId, stage] of Object.entries(compiled.stages)) {
    const seen = new Set<string>()
    const targets: string[] = []
    for (const option of stage.options) {
      if (seen.has(option.id)) issues.push(`${stageId}: duplicate option id "${option.id}"`)
      seen.add(option.id)
      for (const [name, outcome] of branches(option)) {
        for (const [suffix, branch] of withTwist(outcome)) {
          const where = `${stageId}/${option.id} ${name}${suffix}`
          if (suffix && !compiled.twist) issues.push(`${where}: twist branch but the situation has no twist`)
          if (branch.goto && branch.stay) issues.push(`${where}: both goto and stay`)
          if (!branch.goto) continue
          if (stageIds.has(branch.goto)) targets.push(branch.goto)
          else issues.push(`${where}: goto unknown stage "${branch.goto}"`)
        }
      }
    }
    edges.set(stageId, targets)
  }
  const reached = new Set<string>()
  const queue = stageIds.has(compiled.start) ? [compiled.start] : []
  while (queue.length > 0) {
    const stageId = queue.shift()!
    if (reached.has(stageId)) continue
    reached.add(stageId)
    queue.push(...edges.get(stageId)!)
  }
  for (const stageId of stageIds) if (!reached.has(stageId)) issues.push(`stage ${stageId} is unreachable`)

  const declared = new Set([...Object.keys(compiled.slots), ...BUILT_IN_SLOTS])
  for (const { text, where, actorAllowed } of textsOf(compiled)) {
    for (const name of slotNames(text)) {
      if (!declared.has(name)) issues.push(`${where}: slot {${name}} is not declared`)
      else if (name === 'actor' && !actorAllowed) issues.push(`${where}: {actor} only works in check outcomes`)
    }
  }
  for (const [name, source] of Object.entries(compiled.slots)) {
    if (source.from === 'table') {
      issues.push(...tableIssues(content, source.table).map((m) => `slot ${name}: ${m}`))
      continue
    }
    const any = Object.values(content.creatures).some(
      (c) => (source.types.length === 0 || source.types.includes(c.type)) && (source.maxCr === undefined || c.cr <= source.maxCr)
    )
    if (!any) issues.push(`slot ${name}: no creature matches`)
  }

  const situationIds = new Set(allSituations(content).map((s) => s.id))
  for (const { effect, option, where } of allEffects(compiled)) {
    if (effect.effect === 'followUp' && !situationIds.has(effect.situation)) {
      issues.push(`${where}: follow-up to unknown situation "${effect.situation}"`)
    }
    if ((effect.effect === 'hp' || effect.effect === 'exhaustion') && effect.target === 'actor' && option.kind === 'fixed') {
      issues.push(`${where}: fixed options have no actor; use "all" or "random"`)
    }
    if (effect.effect === 'revealTwist' && !compiled.twist) issues.push(`${where}: revealTwist but the situation has no twist`)
  }
  return [...new Set(issues)]
}

const isCost = (e: Effect) =>
  ((e.effect === 'gold' || e.effect === 'hp') && e.amount < 0) ||
  (e.effect === 'exhaustion' && e.amount > 0) ||
  e.effect === 'days' ||
  e.effect === 'followUp' ||
  (e.effect === 'position' && e.position === 'exposed')

/**
 * Design quality rules (design §7). Regular stages offer at least 2 options. Wonders are one
 * stage with one fixed option and never cost anything.
 */
export function lintSituation(situation: Situation, content: Content): string[] {
  const compiled = compileSituation(situation, content)
  const stages = Object.entries(compiled.stages)
  if (!compiled.wonder) {
    return stages.flatMap(([id, stage]) =>
      stage.options.length >= 2 ? [] : [`stage ${id} has ${stage.options.length} option(s); regular encounters need at least 2`]
    )
  }
  const issues: string[] = []
  const options = stages.flatMap(([, stage]) => stage.options)
  if (stages.length !== 1 || options.length !== 1 || options[0].kind !== 'fixed') {
    issues.push('a wonder is one stage with one fixed option')
  }
  for (const { effect, where } of allEffects(compiled)) {
    if (isCost(effect)) issues.push(`${where}: wonders never cost anything (${effect.effect})`)
  }
  return issues
}

/** Validation and lint issues for every situation and template, keyed by situation id. */
export function contentIssues(content: Content): Record<string, string[]> {
  const issues: Record<string, string[]> = {}
  for (const situation of allSituations(content)) {
    const structural = validateSituation(situation, content)
    const found = structural.length > 0 ? structural : lintSituation(situation, content)
    if (found.length > 0) issues[situation.id] = found
  }
  return issues
}
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/engine/encounters
git commit -m "validate situations for playability and lint them for the quality rules"
```

---

### Task 11: Seeded replay

Design §10: a seeded replay produces identical state, and so does a save and load in the middle.

**Files:**
- Test: `src/engine/replay.test.ts`

**Step 1: Write the test `src/engine/replay.test.ts`**

```ts
import { expect, test } from 'vitest'
import type { GameState } from '../schema/state'
import { encounterOptions } from './encounters/preview'
import { deserialize, serialize } from './save'
import { newGame, step } from './state'
import { fixtureContent } from './test-fixtures'

const content = fixtureContent()

/** A fixed policy: draw an encounter, take the first available option until it ends, close it. */
function play(start: GameState, encounters: number): GameState {
  let state = start
  for (let i = 0; i < encounters; i++) {
    state = step(state, { type: 'drawEncounter' }, content)
    for (let guard = 0; state.encounter && state.encounter.stage !== null && guard < 20; guard++) {
      const option = encounterOptions(state).find((o) => o.available)
      if (!option) break
      state = step(state, { type: 'chooseOption', optionId: option.id }, content)
    }
    state = step(state, { type: 'closeEncounter' }, content)
  }
  return state
}

test('a seeded run replays identically, and another seed differs', () => {
  const run = play(newGame(2024, content), 30)
  expect(run.log.length).toBeGreaterThan(60)
  expect(play(newGame(2024, content), 30)).toEqual(run)
  expect(play(newGame(2025, content), 30)).not.toEqual(run)
})

test('saving and loading mid-run does not change what happens next', () => {
  const half = play(newGame(7, content), 15)
  const resumed = deserialize(serialize(half))
  expect(resumed).toEqual(half)
  expect(play(resumed!, 15)).toEqual(play(half, 15))
})
```

**Step 2: Run it**

Run: `pnpm vitest run src/engine/replay.test.ts`. Expected: 2 passed. This guards behaviour already built, so no implementation step is needed. If it fails, something reads randomness or time outside the state's RNG: fix the engine, not the test.

**Step 3: Commit**

```bash
git add src/engine/replay.test.ts
git commit -m "test that seeded encounter runs replay identically across save and load"
```

---

### Task 12: Archetypes, SRD creatures, parts tables and templates

This task holds the systemic content that every source builds on, plus the bundled-content tests that keep all situations playable.
- **`data/claude/archetypes.json`:**
  - `hostile-group`: fight as one graded combat check, slip past, parley, pay, or run.
  - `someone-in-need`: trusting help (bigger reward, worse if it's a trick), cautious help (smaller reward, protected), read them (Insight reveals the twist's odds), ignore, and exploit.
- **`data/imported/creatures.json`:** 15 SRD 5.1 creatures, with one-line descriptions in our own words.
- **`data/procedural/`:** the parts tables and three situation templates.
- **`data/claude/situations.json`:** starts with `grudge-on-the-road`, the follow-up that `exploit` queues. Task 13 fills in the rest.

**Files:**
- Create: `data/claude/archetypes.json`, `data/imported/creatures.json`, `data/procedural/parts.json`, `data/procedural/situation-templates.json`, `data/claude/situations.json`
- Delete: `data/imported/.gitkeep`, `data/procedural/.gitkeep`
- Modify: `README.md`, and `CREDITS.md` (local, gitignored)
- Test: `src/content/encounters.test.ts`

**Step 1: Write the failing test `src/content/encounters.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import type { FixedOption } from '../schema/encounter'
import type { GameState } from '../schema/state'
import { allSituations } from '../engine/encounters/compile'
import { encounterOptions } from '../engine/encounters/preview'
import { lintSituation, validateSituation } from '../engine/encounters/validate'
import { newGame, step } from '../engine/state'
import { loadBundledContent } from './bundled'

const content = loadBundledContent()
const situations = allSituations(content).map((s) => [s.id, s] as const)
const UNFILLED = /\{[A-Za-z][a-z0-9-]*\}/

describe('every bundled situation', () => {
  test.each(situations)('%s is playable: stages reachable, gotos, slots, archetypes, follow-ups', (_, s) => {
    expect(validateSituation(s, content)).toEqual([])
  })

  test.each(situations)('%s follows the quality rules', (_, s) => {
    expect(lintSituation(s, content)).toEqual([])
  })

  test.each(situations)('%s plays to the end with every slot filled', (id) => {
    for (let seed = 0; seed < 6; seed++) {
      let state: GameState = step(newGame(seed, content), { type: 'startEncounter', situationId: id }, content)
      for (let turn = 0; state.encounter?.stage != null && turn < 20; turn++) {
        const available = encounterOptions(state).filter((o) => o.available)
        if (available.length === 0) break
        const option = available[(seed + turn) % available.length]
        state = step(state, { type: 'chooseOption', optionId: option.id }, content)
      }
      for (const entry of state.encounter!.log) expect(entry.text).not.toMatch(UNFILLED)
    }
  })
})

describe('archetypes', () => {
  test('hostile-group and someone-in-need offer the options the design names', () => {
    const ids = (id: string) => content.archetypes[id].options.map((o) => o.id)
    expect(ids('hostile-group')).toEqual(['fight', 'sneak', 'parley', 'bribe', 'flee'])
    expect(ids('someone-in-need')).toEqual(['help-trusting', 'help-cautious', 'read-them', 'ignore', 'exploit'])
  })

  test('trusting help pays more than cautious help, and loses more to a twist', () => {
    const gold = (id: string, twist: boolean) => {
      const option = content.archetypes['someone-in-need'].options.find((o) => o.id === id) as FixedOption
      const branch = twist ? option.outcome.twist! : option.outcome
      return branch.effects.reduce((sum, e) => sum + (e.effect === 'gold' ? e.amount : 0), 0)
    }
    expect(gold('help-trusting', false)).toBeGreaterThan(gold('help-cautious', false))
    expect(gold('help-trusting', true)).toBeLessThan(gold('help-cautious', true))
  })
})

test('SRD creatures are imported, and parts tables feed three templates', () => {
  const creatures = Object.values(content.creatures)
  expect(creatures.length).toBeGreaterThanOrEqual(15)
  expect(creatures.every((c) => c.source === 'imported')).toBe(true)
  expect(Object.keys(content.partsTables)).toEqual(
    expect.arrayContaining(['who', 'who-attitude', 'who-ancestry', 'who-occupation', 'motive', 'stakes', 'complication'])
  )
  expect(Object.keys(content.situationTemplates).sort()).toEqual(['night-visitor', 'roadside-plea', 'toll-gang'])
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/content/encounters.test.ts`. Expected: FAIL. The archetypes and creatures don't exist yet (`Cannot read properties of undefined`).

**Step 3: Write `data/claude/archetypes.json`**

```json
{
  "$schema": "../_schema/archetypes.schema.json",
  "kind": "archetypes",
  "source": "claude",
  "notes": "Reusable option sets from the design (§7). A stage uses one with { \"archetype\": { \"id\", \"dc\", \"reward\" } }: \"dc\" in a check means the stage's DC, and every gold amount is multiplied by reward. Texts say \"they\" so any situation can use them.",
  "entries": [
    {
      "id": "hostile-group",
      "name": "Hostile group",
      "description": "Armed people block the way. Fight, slip past, talk, pay, or run.",
      "options": [
        {
          "id": "fight",
          "kind": "check",
          "label": "Fight",
          "description": "Settle it with steel. Resolved as one graded check.",
          "check": { "skill": "athletics", "dc": "dc", "combat": true },
          "outcomes": {
            "critFail": {
              "text": "The fight goes badly wrong. You break and run, and they loot what you drop.",
              "effects": [
                { "effect": "hp", "amount": -6, "target": "all" },
                { "effect": "gold", "amount": -10 }
              ]
            },
            "fail": {
              "text": "You drive them off, but every one of you is bleeding.",
              "effects": [{ "effect": "hp", "amount": -4, "target": "all" }]
            },
            "partial": {
              "text": "They scatter after a short, ugly fight. {actor} takes the worst of it.",
              "effects": [
                { "effect": "hp", "amount": -4, "target": "actor" },
                { "effect": "gold", "amount": 5 }
              ]
            },
            "success": {
              "text": "{actor} leads the charge and they flee, leaving a purse behind.",
              "effects": [
                { "effect": "hp", "amount": -1, "target": "actor" },
                { "effect": "gold", "amount": 10 }
              ]
            },
            "critSuccess": {
              "text": "A rout. They abandon their camp and their takings.",
              "effects": [{ "effect": "gold", "amount": 20 }]
            }
          }
        },
        {
          "id": "sneak",
          "kind": "check",
          "label": "Slip past",
          "description": "Go around them unseen. If they spot you, you face them badly placed.",
          "once": true,
          "check": { "skill": "stealth", "dc": "dc+1" },
          "outcomes": {
            "critFail": {
              "text": "A branch snaps under {actor}'s boot, right beside their lookout.",
              "effects": [
                { "effect": "hp", "amount": -2, "target": "actor" },
                { "effect": "position", "position": "exposed" }
              ],
              "stay": true
            },
            "fail": {
              "text": "They spot you halfway past. Now you have to deal with them, badly placed.",
              "effects": [{ "effect": "position", "position": "exposed" }],
              "stay": true
            },
            "partial": {
              "text": "You slip by, but a strap catches and a purse falls where you can't go back for it.",
              "effects": [{ "effect": "gold", "amount": -5 }]
            },
            "success": { "text": "You slip past without a sound." },
            "critSuccess": {
              "text": "You slip past, and {actor} lifts a purse from their camp on the way.",
              "effects": [{ "effect": "gold", "amount": 8 }]
            }
          }
        },
        {
          "id": "parley",
          "kind": "check",
          "label": "Parley",
          "description": "Talk your way through. Failing leaves you on the back foot.",
          "once": true,
          "check": { "skill": "persuasion", "dc": "dc+2" },
          "outcomes": {
            "critFail": {
              "text": "Talk sours into insults, and someone throws a stone.",
              "effects": [
                { "effect": "hp", "amount": -2, "target": "random" },
                { "effect": "position", "position": "exposed" }
              ],
              "stay": true
            },
            "fail": {
              "text": "They aren't interested in talking.",
              "effects": [{ "effect": "position", "position": "exposed" }],
              "stay": true
            },
            "partial": {
              "text": "They let you pass, for a toll.",
              "effects": [{ "effect": "gold", "amount": -8 }]
            },
            "success": { "text": "{actor} talks them down. You pass unharmed." },
            "critSuccess": {
              "text": "{actor} talks them round entirely. They share their fire and news of the road.",
              "effects": [{ "effect": "hp", "amount": 2, "target": "all" }]
            }
          }
        },
        {
          "id": "bribe",
          "kind": "fixed",
          "label": "Pay them",
          "requires": [{ "req": "gold", "min": 15 }],
          "outcome": {
            "text": "You pay. They count it twice, then wave you through.",
            "effects": [{ "effect": "gold", "amount": -15 }]
          }
        },
        {
          "id": "flee",
          "kind": "check",
          "label": "Run",
          "description": "Turn back and outpace them. Costs breath, maybe blood, maybe a day.",
          "check": { "skill": "athletics", "dc": "dc-2" },
          "outcomes": {
            "critFail": {
              "text": "You scatter in a panic, dropping packs and coin.",
              "effects": [
                { "effect": "hp", "amount": -3, "target": "all" },
                { "effect": "gold", "amount": -10 }
              ]
            },
            "fail": {
              "text": "You get away, but only after a long, punishing chase.",
              "effects": [
                { "effect": "hp", "amount": -2, "target": "all" },
                { "effect": "exhaustion", "amount": 1, "target": "actor" }
              ]
            },
            "partial": {
              "text": "You outrun them, but the detour costs you a day.",
              "effects": [{ "effect": "days", "amount": 1 }]
            },
            "success": { "text": "You break away and lose them in the brush." }
          }
        }
      ]
    },
    {
      "id": "someone-in-need",
      "name": "Someone in need",
      "description": "Someone asks for help. Needs a twist on the situation: it means they are not what they seem, and mean you harm.",
      "options": [
        {
          "id": "help-trusting",
          "kind": "fixed",
          "label": "Help them, no questions",
          "description": "Your full effort and your trust. The bigger reward, and the bigger loss if it's a trick.",
          "outcome": {
            "text": "You throw yourselves into it. Afterwards they press coin on you and won't hear no.",
            "effects": [{ "effect": "gold", "amount": 15 }],
            "twist": {
              "text": "It was a setup. While you were busy, their friends went through your packs, and one of them had a knife.",
              "effects": [
                { "effect": "gold", "amount": -15 },
                { "effect": "hp", "amount": -4, "target": "random" }
              ]
            }
          }
        },
        {
          "id": "help-cautious",
          "kind": "fixed",
          "label": "Help, but stay on guard",
          "description": "A smaller reward, and nothing lost if it's a trick.",
          "outcome": {
            "text": "You help, with one eye on the treeline. They thank you with what they can spare.",
            "effects": [{ "effect": "gold", "amount": 6 }],
            "twist": {
              "text": "When their friends step out of the trees, you are ready for them. They melt away, and you lose nothing."
            }
          }
        },
        {
          "id": "read-them",
          "kind": "check",
          "label": "Read them first",
          "description": "Insight shows how likely a trick is.",
          "once": true,
          "check": { "skill": "insight", "dc": "dc" },
          "outcomes": {
            "critFail": {
              "text": "{actor} stares a little too long. They notice, and their story hardens.",
              "effects": [{ "effect": "position", "position": "exposed" }],
              "stay": true
            },
            "fail": {
              "text": "{actor} can't tell what they are hiding, if anything.",
              "stay": true
            },
            "partial": {
              "text": "{actor} isn't sure, but has a feel for the odds now.",
              "effects": [{ "effect": "revealTwist" }],
              "stay": true
            },
            "success": {
              "text": "{actor} reads them like a ledger.",
              "effects": [{ "effect": "revealTwist" }],
              "stay": true
            },
            "critSuccess": {
              "text": "{actor} reads them like a ledger, and knows exactly how to play this.",
              "effects": [
                { "effect": "revealTwist" },
                { "effect": "position", "position": "edge" }
              ],
              "stay": true
            }
          }
        },
        {
          "id": "ignore",
          "kind": "fixed",
          "label": "Leave them to it",
          "outcome": { "text": "You walk on. Their voice follows you down the road for a while." }
        },
        {
          "id": "exploit",
          "kind": "check",
          "label": "Take advantage",
          "description": "Talk them out of what they have. Word may get around.",
          "check": { "skill": "deception", "dc": "dc" },
          "outcomes": {
            "critFail": {
              "text": "They see right through you and shout for help. You leave fast, and the story follows you.",
              "effects": [{ "effect": "followUp", "situation": "grudge-on-the-road", "after": 1 }],
              "twist": {
                "text": "They see right through you, and they were the dangerous ones.",
                "effects": [{ "effect": "hp", "amount": -4, "target": "actor" }]
              }
            },
            "fail": { "text": "They clutch their things and back away from you." },
            "partial": {
              "text": "You come away with a few coins and a bad feeling.",
              "effects": [
                { "effect": "gold", "amount": 6 },
                { "effect": "followUp", "situation": "grudge-on-the-road", "after": 2 }
              ],
              "twist": {
                "text": "You come away with a few coins. They were crooks anyway; nobody will miss them.",
                "effects": [{ "effect": "gold", "amount": 6 }]
              }
            },
            "success": {
              "text": "You talk them out of their purse.",
              "effects": [
                { "effect": "gold", "amount": 15 },
                { "effect": "followUp", "situation": "grudge-on-the-road", "after": 2 }
              ],
              "twist": {
                "text": "You rob the robbers. They can hardly complain to the watch.",
                "effects": [{ "effect": "gold", "amount": 20 }]
              }
            }
          }
        }
      ]
    }
  ]
}
```

**Step 4: Write `data/imported/creatures.json`.** Names, types and CRs come from SRD 5.1. The groups and descriptions are original: don't copy SRD prose.

```json
{
  "$schema": "../_schema/creatures.schema.json",
  "kind": "creatures",
  "source": "imported",
  "notes": "Names, types and challenge ratings from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed under CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/legalcode). Groups and descriptions are our own words. Used as the {foe} in hostile-group encounters.",
  "entries": [
    { "id": "bandit", "name": "Bandit", "group": "a band of bandits", "type": "humanoid", "cr": 0.125, "description": "Desperate road-thieves who would rather rob the weak than fight the strong." },
    { "id": "bandit-captain", "name": "Bandit Captain", "group": "a bandit captain and her crew", "type": "humanoid", "cr": 2, "description": "A seasoned outlaw who keeps her gang in line by being the most dangerous of them." },
    { "id": "thug", "name": "Thug", "group": "a gang of thugs", "type": "humanoid", "cr": 0.5, "description": "Hired muscle that deals in threats and broken fingers." },
    { "id": "cultist", "name": "Cultist", "group": "a knot of robed cultists", "type": "humanoid", "cr": 0.125, "description": "Zealots of a hidden god, more fervent than skilled." },
    { "id": "veteran", "name": "Veteran", "group": "a pair of deserters", "type": "humanoid", "cr": 3, "description": "Old soldiers who have seen too many battles to fear one more." },
    { "id": "goblin", "name": "Goblin", "group": "a mob of goblins", "type": "humanoid", "cr": 0.25, "description": "Small, quick and cruel, and much braver in numbers." },
    { "id": "hobgoblin", "name": "Hobgoblin", "group": "a squad of hobgoblins", "type": "humanoid", "cr": 0.5, "description": "Disciplined goblinoid soldiers who fight in tight ranks." },
    { "id": "bugbear", "name": "Bugbear", "group": "a pair of bugbears", "type": "humanoid", "cr": 1, "description": "Hulking goblinoids who prefer an ambush to a fair fight." },
    { "id": "orc", "name": "Orc", "group": "a war band of orcs", "type": "humanoid", "cr": 0.5, "description": "Fierce raiders who take what the land won't give them." },
    { "id": "gnoll", "name": "Gnoll", "group": "a pack of gnolls", "type": "humanoid", "cr": 0.5, "description": "Hyena-headed raiders with a hunger that is never satisfied." },
    { "id": "kobold", "name": "Kobold", "group": "a swarm of kobolds", "type": "humanoid", "cr": 0.125, "description": "Tiny reptilian schemers who trust traps and numbers over courage." },
    { "id": "lizardfolk", "name": "Lizardfolk", "group": "a hunting party of lizardfolk", "type": "humanoid", "cr": 0.5, "description": "Cold-eyed marsh hunters who see everything as food, threat or tool." },
    { "id": "ogre", "name": "Ogre", "group": "an ogre and its hangers-on", "type": "giant", "cr": 2, "description": "A brute of enormous strength and very little patience." },
    { "id": "worg", "name": "Worg", "group": "a pack of worgs", "type": "monstrosity", "cr": 0.5, "description": "Cunning wolf-like beasts that can speak, and hold grudges." },
    { "id": "ghoul", "name": "Ghoul", "group": "a pack of ghouls", "type": "undead", "cr": 1, "description": "Starving dead whose claws lock the living rigid with fear." }
  ]
}
```

**Step 5: Write `data/procedural/parts.json`**

```json
{
  "$schema": "../_schema/partsTables.schema.json",
  "kind": "partsTables",
  "source": "procedural",
  "notes": "Parts tables for situation templates (design §7). A row may reference another table as {table-id}. Written by Claude; tune the weights freely. Later plans will filter rows by world state (region, threat, goods carried).",
  "entries": [
    {
      "id": "who",
      "description": "A stranger on the road: attitude, ancestry, occupation",
      "rows": [{ "text": "{who-attitude} {who-ancestry} {who-occupation}" }]
    },
    {
      "id": "who-attitude",
      "description": "How they carry themselves (with the article)",
      "rows": [
        { "text": "a nervous" },
        { "text": "a weary" },
        { "text": "a cheerful" },
        { "text": "a suspicious" },
        { "text": "an exhausted" },
        { "text": "a proud" },
        { "text": "a frightened" },
        { "text": "a soft-spoken" },
        { "text": "a sharp-eyed" },
        { "text": "a sullen", "weight": 0.5 }
      ]
    },
    {
      "id": "who-ancestry",
      "description": "Ancestry, weighted towards the common folk of the roads",
      "rows": [
        { "text": "human", "weight": 4 },
        { "text": "dwarf", "weight": 2 },
        { "text": "elf" },
        { "text": "half-elf" },
        { "text": "orc" },
        { "text": "goblin" }
      ]
    },
    {
      "id": "who-occupation",
      "description": "What they do for a living",
      "rows": [
        { "text": "tinker" },
        { "text": "pilgrim" },
        { "text": "shepherd" },
        { "text": "courier" },
        { "text": "charcoal-burner" },
        { "text": "tax collector" },
        { "text": "midwife" },
        { "text": "salt trader" },
        { "text": "retired soldier" },
        { "text": "bookbinder" },
        { "text": "wandering priest", "weight": 0.5 },
        { "text": "minstrel", "weight": 0.5 }
      ]
    },
    {
      "id": "motive",
      "description": "Why they need help (a full sentence)",
      "rows": [
        { "text": "Their mule has gone lame a day short of market." },
        { "text": "A wheel has come off their cart, and the load is too heavy to lift alone." },
        { "text": "They lost the road in the fog, and their lamp oil is gone." },
        { "text": "Their companion has a fever and is getting worse." },
        { "text": "Wolves scattered their flock in the night." },
        { "text": "They were robbed at the last crossing and have nothing left for the toll." }
      ]
    },
    {
      "id": "stakes",
      "description": "What happens if nobody helps (a full sentence)",
      "rows": [
        { "text": "If they miss the market, the family goes hungry this winter." },
        { "text": "A wedding is waiting for them in the next town." },
        { "text": "The letters they carry are due at the magistrate's by tomorrow." },
        { "text": "They owe money to people who don't wait." },
        { "text": "Their child is waiting for them alone at home." }
      ]
    },
    {
      "id": "complication",
      "description": "Something that makes a confrontation worse (a full sentence)",
      "rows": [
        { "text": "Rain has turned the road to sucking mud." },
        { "text": "Dusk is falling fast." },
        { "text": "The road narrows between steep banks here." },
        { "text": "One of them is barely more than a child." },
        { "text": "Your pack mule is skittish and close to bolting." }
      ]
    }
  ]
}
```

**Step 6: Write `data/procedural/situation-templates.json`**

```json
{
  "$schema": "../_schema/situationTemplates.schema.json",
  "kind": "situationTemplates",
  "source": "procedural",
  "notes": "Archetypes dressed with parts tables. Each becomes a one-stage situation when played.",
  "entries": [
    {
      "id": "roadside-plea",
      "title": "A plea at the roadside",
      "text": "{Who} waves you down at the roadside. {Motive} {Stakes}",
      "slots": {
        "who": { "from": "table", "table": "who" },
        "motive": { "from": "table", "table": "motive" },
        "stakes": { "from": "table", "table": "stakes" }
      },
      "twist": { "chance": 0.25, "what": "they are bait for an ambush" },
      "archetype": { "id": "someone-in-need", "dc": 13, "reward": 1 }
    },
    {
      "id": "toll-gang",
      "title": "A toll that isn't",
      "text": "{Foe} have dragged a log across the road, and want paying to move it. {Complication}",
      "slots": {
        "foe": { "from": "creature", "types": ["humanoid", "giant"], "maxCr": 2 },
        "complication": { "from": "table", "table": "complication" }
      },
      "archetype": { "id": "hostile-group", "dc": 13, "reward": 1 }
    },
    {
      "id": "night-visitor",
      "title": "A visitor in the night",
      "text": "Late in the night, {who} limps into the light of your fire. {Motive}",
      "slots": {
        "who": { "from": "table", "table": "who" },
        "motive": { "from": "table", "table": "motive" }
      },
      "twist": { "chance": 0.4, "what": "they were sent to scout your camp" },
      "archetype": { "id": "someone-in-need", "dc": 14, "reward": 0.8 }
    }
  ]
}
```

**Step 7: Write `data/claude/situations.json`** (Task 13 adds the other entries):

```json
{
  "$schema": "../_schema/situations.schema.json",
  "kind": "situations",
  "source": "claude",
  "notes": "Situations written by Claude for this game: at least two options per stage that trade different resources (gold, HP, time, skill), asymmetric options that favour particular builds, and two wonders.",
  "entries": [
    {
      "id": "grudge-on-the-road",
      "title": "An old grudge",
      "followUpOnly": true,
      "tags": ["road"],
      "notes": "Queued when you exploit someone in need (the someone-in-need archetype) or leave a threat hanging.",
      "stages": {
        "start": {
          "text": "Someone you wronged on the road has not forgotten. They are waiting at the next bridge, with two cousins and a cudgel each.",
          "options": [
            {
              "id": "fight",
              "kind": "check",
              "label": "Fight",
              "description": "Three of them, angry rather than skilled.",
              "check": { "skill": "athletics", "dc": 12, "combat": true },
              "outcomes": {
                "fail": {
                  "text": "You win, but the cudgels find their mark first.",
                  "effects": [{ "effect": "hp", "amount": -4, "target": "all" }]
                },
                "partial": {
                  "text": "They go into the river, and {actor} nearly goes with them.",
                  "effects": [{ "effect": "hp", "amount": -3, "target": "actor" }]
                },
                "success": {
                  "text": "They go into the river. The bridge-keeper pretends not to see."
                }
              }
            },
            {
              "id": "pay",
              "kind": "fixed",
              "label": "Make it right",
              "requires": [{ "req": "gold", "min": 10 }],
              "outcome": {
                "text": "You pay back what you took, and a little more. They spit, but they let it go.",
                "effects": [{ "effect": "gold", "amount": -10 }]
              }
            },
            {
              "id": "apologise",
              "kind": "check",
              "label": "Apologise, and mean it",
              "once": true,
              "check": { "skill": "persuasion", "dc": 14 },
              "outcomes": {
                "fail": {
                  "text": "They are not interested in words.",
                  "effects": [{ "effect": "position", "position": "exposed" }],
                  "stay": true
                },
                "partial": {
                  "text": "They take the apology, and some coin to go with it.",
                  "effects": [{ "effect": "gold", "amount": -5 }]
                },
                "success": { "text": "They grumble, but let you pass. Maybe it ends here." }
              }
            },
            {
              "id": "run",
              "kind": "check",
              "label": "Take the ford instead",
              "check": { "skill": "acrobatics", "dc": 11 },
              "outcomes": {
                "fail": {
                  "text": "They catch {actor} on the slippery stones.",
                  "effects": [
                    { "effect": "hp", "amount": -3, "target": "actor" },
                    { "effect": "days", "amount": 1 }
                  ]
                },
                "partial": {
                  "text": "You lose them, and most of a day, in the reeds.",
                  "effects": [{ "effect": "days", "amount": 1 }]
                },
                "success": { "text": "You are across the ford before they can reach it." }
              }
            }
          ]
        }
      }
    }
  ]
}
```

**Step 8: Credits**

The creature list is committed CC-BY content, so credit it publicly. In `README.md`, replace the `- None yet.` line under `## Credits` with:

```markdown
- Creature names, types and challenge ratings in `data/imported/creatures.json`: this work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
- Game-icons.net icons (CC BY 3.0) will be credited here when they are added.
```

Add a row to the table in `CREDITS.md`. It is local and gitignored, so it is not part of the commit:

```markdown
| SRD 5.1 creatures | `data/imported/creatures.json` | Wizards of the Coast LLC, System Reference Document 5.1 | CC-BY-4.0 | Yes | Names, types and CRs only; groups and descriptions are our own words. Credited in README. |
```

**Step 9: Remove the placeholders and run the tests**

```bash
git rm -q data/imported/.gitkeep data/procedural/.gitkeep
```

Run: `pnpm test && pnpm typecheck`. Expected: all pass. Every situation and template is playable, lint-clean and fully slot-filled over 6 seeds.

**Step 10: Commit**

```bash
git add data src/content/encounters.test.ts README.md
git commit -m "add archetypes, SRD creatures, parts tables and situation templates"
```

---

### Task 13: Situations written by Claude

Eight situations written for this game, following the quality rules:
- Every stage has at least two options, and they trade different resources (gold, HP, time, exhaustion, skill).
- Some options favour particular builds: Arcana at the hedge-witch, Survival with the apprentice, Intimidation (CHA) at the narrows.
- Two of them are wonders.

The file also keeps `grudge-on-the-road` from Task 12, and adds `lizardfolk-herb`, the follow-up that completes the trade in the ported lizardfolk event (Task 14).

| Id | Shows off |
|---|---|
| `flooded-ferry` | gold vs HP vs time; a second stage when the ford goes wrong; a forced high-stakes roll |
| `hedge-witch` | healing bought with gold, a day of work, or Arcana lore |
| `pilgrims-at-dusk` | a three-stage graph driven by a hidden twist; Insight reveals the odds; keeping watch earns Edge |
| `ambush-at-the-narrows` | `hostile-group` with a creature slot, plus an Intimidation (CHA) option |
| `mapmakers-apprentice` | `someone-in-need` (reward ×1.5) plus a Survival option with twist branches |
| `grudge-on-the-road` | follow-up only: what exploiting people leads to |
| `lantern-moths`, `singing-stones` | wonders |

**Files:**
- Modify: `data/claude/situations.json`
- Test: `src/content/encounters.test.ts`

**Step 1: Write the failing test.** Append to `src/content/encounters.test.ts`:

```ts

const idsFrom = (source: string) =>
  Object.values(content.situations)
    .filter((s) => s.source === source)
    .map((s) => s.id)
    .sort()

test('Claude wrote eight situations, two of them wonders, plus the follow-up for the lizardfolk port', () => {
  expect(idsFrom('claude')).toEqual([
    'ambush-at-the-narrows',
    'flooded-ferry',
    'grudge-on-the-road',
    'hedge-witch',
    'lantern-moths',
    'lizardfolk-herb',
    'mapmakers-apprentice',
    'pilgrims-at-dusk',
    'singing-stones',
  ])
  const wonders = Object.values(content.situations).filter((s) => s.source === 'claude' && s.wonder)
  expect(wonders.map((s) => s.id).sort()).toEqual(['lantern-moths', 'singing-stones'])
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/content/encounters.test.ts`. Expected: FAIL, because only `grudge-on-the-road` exists.

**Step 3: Replace `data/claude/situations.json`**

```json
{
  "$schema": "../_schema/situations.schema.json",
  "kind": "situations",
  "source": "claude",
  "notes": "Situations written by Claude for this game: at least two options per stage that trade different resources (gold, HP, time, skill), asymmetric options that favour particular builds, and two wonders.",
  "entries": [
    {
      "id": "flooded-ferry",
      "title": "The flooded ferry",
      "tags": ["river"],
      "stages": {
        "start": {
          "text": "Spring melt has swollen the river to a brown roar. The ferry rope still holds, and so does the ferrywoman, Ilse, who has tripled her price and isn't ashamed of it.",
          "options": [
            {
              "id": "pay",
              "kind": "fixed",
              "label": "Pay Ilse's price",
              "requires": [{ "req": "gold", "min": 12 }],
              "outcome": {
                "text": "Ilse counts the coins, spits for luck, and hauls you across.",
                "effects": [{ "effect": "gold", "amount": -12 }]
              }
            },
            {
              "id": "haggle",
              "kind": "check",
              "label": "Haggle",
              "description": "She enjoys a haggle. She also enjoys winning one.",
              "requires": [{ "req": "gold", "min": 6 }],
              "once": true,
              "check": { "skill": "persuasion", "dc": 14 },
              "outcomes": {
                "fail": { "text": "Ilse folds her arms. The price stands.", "stay": true },
                "partial": {
                  "text": "She knocks a little off, muttering.",
                  "effects": [{ "effect": "gold", "amount": -9 }]
                },
                "success": {
                  "text": "Ilse laughs and takes half.",
                  "effects": [{ "effect": "gold", "amount": -6 }]
                },
                "critSuccess": {
                  "text": "Ilse takes you across for a song. {actor} has to sing it, all the way over."
                }
              }
            },
            {
              "id": "ford",
              "kind": "check",
              "label": "Ford the river upstream",
              "description": "Free, if the river lets you.",
              "highStakes": true,
              "check": { "skill": "athletics", "dc": 15 },
              "outcomes": {
                "critFail": {
                  "text": "The current takes {actor} off their feet and a long way downstream. You find them half-drowned an hour later.",
                  "effects": [
                    { "effect": "hp", "amount": -8, "target": "actor" },
                    { "effect": "exhaustion", "amount": 1, "target": "actor" }
                  ]
                },
                "fail": { "text": "Halfway across, the bottom drops away.", "goto": "midstream" },
                "partial": {
                  "text": "You make it across, soaked and shaking.",
                  "effects": [{ "effect": "hp", "amount": -2, "target": "all" }]
                },
                "success": { "text": "{actor} finds the shallows and leads you over." }
              }
            },
            {
              "id": "wait",
              "kind": "fixed",
              "label": "Wait for the water to drop",
              "requires": [{ "req": "gold", "min": 4 }],
              "outcome": {
                "text": "Two days of drizzle and bad food in Ilse's lean-to. Then the river calms, and she takes you over at her usual price.",
                "effects": [{ "effect": "days", "amount": 2 }, { "effect": "gold", "amount": -4 }]
              }
            }
          ]
        },
        "midstream": {
          "text": "The river has you. Your packs drag at you, and the far bank is still a long way off.",
          "options": [
            {
              "id": "swim",
              "kind": "check",
              "label": "Swim for it",
              "check": { "skill": "athletics", "dc": 13 },
              "outcomes": {
                "fail": {
                  "text": "You crawl out a mile downstream, battered by every rock in the river.",
                  "effects": [{ "effect": "hp", "amount": -5, "target": "all" }]
                },
                "partial": {
                  "text": "You make the bank, minus a pack.",
                  "effects": [{ "effect": "gold", "amount": -8 }]
                },
                "success": { "text": "{actor} drags everyone to the far bank." }
              }
            },
            {
              "id": "drop-packs",
              "kind": "fixed",
              "label": "Cut your packs loose",
              "outcome": {
                "text": "You let the river have your packs, and the coin in them, and swim free.",
                "effects": [{ "effect": "gold", "amount": -15 }]
              }
            }
          ]
        }
      }
    },
    {
      "id": "hedge-witch",
      "title": "The hedge-witch's price",
      "tags": ["marsh", "forest"],
      "notes": "Most useful when the party is hurt. Arcana-heavy parties get a cheaper deal.",
      "stages": {
        "start": {
          "text": "Smoke rises from a turf hut at the edge of the bog. The old woman inside looks at your wounds before she looks at your faces. 'I can mend that,' she says. 'Everything has a price.'",
          "options": [
            {
              "id": "pay",
              "kind": "fixed",
              "label": "Pay in coin",
              "requires": [{ "req": "gold", "min": 10 }],
              "outcome": {
                "text": "She takes the silver without looking at it and smears something green into your cuts.",
                "effects": [
                  { "effect": "gold", "amount": -10 },
                  { "effect": "hp", "amount": 6, "target": "all" }
                ]
              }
            },
            {
              "id": "work",
              "kind": "fixed",
              "label": "Work it off",
              "description": "A day of cutting turf and hauling water.",
              "outcome": {
                "text": "A long day cutting turf and hauling water. That night she sees to your wounds.",
                "effects": [
                  { "effect": "days", "amount": 1 },
                  { "effect": "hp", "amount": 6, "target": "all" }
                ]
              }
            },
            {
              "id": "trade-lore",
              "kind": "check",
              "label": "Trade her a secret of the craft",
              "description": "She collects spells the way magpies collect spoons.",
              "once": true,
              "check": { "skill": "arcana", "dc": 13 },
              "outcomes": {
                "fail": { "text": "She isn't impressed. 'Coin or sweat,' she says.", "stay": true },
                "partial": {
                  "text": "She takes the lore, grudgingly, and does half the job.",
                  "effects": [{ "effect": "hp", "amount": 3, "target": "all" }]
                },
                "success": {
                  "text": "Her eyes light up. She mends you and sends you off with her blessing.",
                  "effects": [
                    { "effect": "hp", "amount": 6, "target": "all" },
                    { "effect": "inspiration", "amount": 1 }
                  ]
                }
              }
            },
            {
              "id": "leave",
              "kind": "fixed",
              "label": "Thank her and go",
              "outcome": { "text": "She shrugs and goes back to her pot." }
            }
          ]
        }
      }
    },
    {
      "id": "pilgrims-at-dusk",
      "title": "Pilgrims at dusk",
      "tags": ["road"],
      "twist": {
        "chance": 0.35,
        "what": "the pilgrims are ghoul-touched, and hungry for more than bread"
      },
      "stages": {
        "start": {
          "text": "At dusk, three pilgrims in grey ask to share your fire. They are polite and hungry, and one of them never seems to blink.",
          "options": [
            {
              "id": "welcome",
              "kind": "fixed",
              "label": "Share your fire",
              "outcome": {
                "text": "You make room. They eat like they haven't in weeks, and say little.",
                "goto": "night"
              }
            },
            {
              "id": "read",
              "kind": "check",
              "label": "Watch them over the fire",
              "description": "Insight shows how likely the worst is.",
              "once": true,
              "check": { "skill": "insight", "dc": 13 },
              "outcomes": {
                "critFail": {
                  "text": "{actor} stares too long. The pilgrims fall silent and stare back.",
                  "effects": [{ "effect": "position", "position": "exposed" }],
                  "stay": true
                },
                "fail": { "text": "Grief, maybe. Or hunger. {actor} can't tell.", "stay": true },
                "partial": {
                  "text": "Something about them is wrong. {actor} can't say how wrong.",
                  "effects": [{ "effect": "revealTwist" }],
                  "stay": true
                },
                "success": {
                  "text": "{actor} studies them over the fire and gets the measure of them.",
                  "effects": [{ "effect": "revealTwist" }],
                  "stay": true
                }
              }
            },
            {
              "id": "send-away",
              "kind": "fixed",
              "label": "Send them on",
              "outcome": {
                "text": "They bow and walk on into the dark. You sleep badly, but you sleep.",
                "twist": {
                  "text": "They bow and walk on into the dark. Later, you hear something screaming, far down the road."
                }
              }
            }
          ]
        },
        "night": {
          "text": "The fire burns low. The pilgrims sleep, or seem to.",
          "options": [
            {
              "id": "sleep",
              "kind": "fixed",
              "label": "Sleep",
              "outcome": {
                "text": "You wake at dawn to find them gone, and a sprig of rowan tucked into each of your packs.",
                "effects": [{ "effect": "inspiration", "amount": 1 }],
                "twist": {
                  "text": "You wake to cold hands and teeth.",
                  "effects": [{ "effect": "hp", "amount": -5, "target": "random" }],
                  "goto": "attack"
                }
              }
            },
            {
              "id": "watch",
              "kind": "check",
              "label": "Keep watch through the night",
              "description": "Costs someone a night's sleep.",
              "check": { "skill": "perception", "dc": 12 },
              "outcomes": {
                "fail": {
                  "text": "{actor} nods off. At dawn the pilgrims are gone.",
                  "twist": {
                    "text": "{actor} nods off, and wakes to teeth.",
                    "effects": [{ "effect": "hp", "amount": -5, "target": "actor" }],
                    "goto": "attack"
                  }
                },
                "partial": {
                  "text": "A long, cold night. At dawn the pilgrims are gone.",
                  "effects": [{ "effect": "exhaustion", "amount": 1, "target": "actor" }],
                  "twist": { "text": "{actor} sees them rise just in time.", "goto": "attack" }
                },
                "success": {
                  "text": "{actor} keeps a sharp watch. At dawn the pilgrims leave rowan sprigs by the fire.",
                  "effects": [
                    { "effect": "exhaustion", "amount": 1, "target": "actor" },
                    { "effect": "inspiration", "amount": 1 }
                  ],
                  "twist": {
                    "text": "{actor} sees them rise, grey and silent, and shouts the camp awake.",
                    "effects": [{ "effect": "position", "position": "edge" }],
                    "goto": "attack"
                  }
                }
              }
            }
          ]
        },
        "attack": {
          "text": "The pilgrims are on you, grey-skinned and silent, with nails like hooks.",
          "options": [
            {
              "id": "fight",
              "kind": "check",
              "label": "Fight",
              "check": { "skill": "athletics", "dc": 13, "combat": true },
              "outcomes": {
                "fail": {
                  "text": "You drive them off, but their touch leaves you numb and torn.",
                  "effects": [{ "effect": "hp", "amount": -5, "target": "all" }]
                },
                "partial": {
                  "text": "You drive them off into the dark.",
                  "effects": [{ "effect": "hp", "amount": -3, "target": "all" }]
                },
                "success": {
                  "text": "You put them down. Their purses hold old, grave-cold coins.",
                  "effects": [{ "effect": "gold", "amount": 12 }]
                }
              }
            },
            {
              "id": "flee",
              "kind": "check",
              "label": "Grab what you can and run",
              "check": { "skill": "acrobatics", "dc": 12 },
              "outcomes": {
                "fail": {
                  "text": "They drag at you as you go, and you drop half your coin.",
                  "effects": [
                    { "effect": "hp", "amount": -4, "target": "random" },
                    { "effect": "gold", "amount": -10 }
                  ]
                },
                "partial": {
                  "text": "You get away, leaving half your camp behind.",
                  "effects": [{ "effect": "gold", "amount": -10 }]
                },
                "success": { "text": "You run, and they don't follow past the firelight." }
              }
            }
          ]
        }
      }
    },
    {
      "id": "ambush-at-the-narrows",
      "title": "Ambush at the narrows",
      "tags": ["road", "hill"],
      "slots": { "foe": { "from": "creature", "types": ["humanoid"], "maxCr": 1 } },
      "stages": {
        "start": {
          "text": "The road squeezes between two boulders, and {foe} step out to fill the gap. Their leader grins and nods at your packs.",
          "archetype": { "id": "hostile-group", "dc": 13, "reward": 1 },
          "options": [
            {
              "id": "veiled-threat",
              "kind": "check",
              "label": "A quiet word about the last lot",
              "description": "Intimidation (CHA): a calm, specific threat. Better from a silver tongue than a big arm.",
              "once": true,
              "check": { "skill": "intimidation", "ability": "cha", "dc": 14 },
              "outcomes": {
                "fail": {
                  "text": "Their leader laughs. 'Nice try.'",
                  "effects": [{ "effect": "position", "position": "exposed" }],
                  "stay": true
                },
                "partial": {
                  "text": "They let you pass, but they'll remember your faces.",
                  "effects": [
                    { "effect": "followUp", "situation": "grudge-on-the-road", "after": 3 }
                  ]
                },
                "success": {
                  "text": "{actor}'s quiet words do what swords couldn't. They melt back into the rocks."
                },
                "critSuccess": {
                  "text": "They melt back into the rocks, and one of them leaves an apology in silver.",
                  "effects": [{ "effect": "gold", "amount": 5 }]
                }
              }
            }
          ]
        }
      }
    },
    {
      "id": "mapmakers-apprentice",
      "title": "The mapmaker's apprentice",
      "tags": ["road"],
      "twist": {
        "chance": 0.3,
        "what": "the 'apprentice' is the thief, and his friends are waiting for whoever stops to help"
      },
      "stages": {
        "start": {
          "text": "A young man in ink-stained sleeves sits by a broken surveying tripod, crying with rage. His master's instruments were stolen in the night, he says, and he will be beaten for it.",
          "archetype": { "id": "someone-in-need", "dc": 12, "reward": 1.5 },
          "options": [
            {
              "id": "track",
              "kind": "check",
              "label": "Follow the thieves' trail",
              "description": "Survival-minded parties can sort this out properly, for a day's work.",
              "check": { "skill": "survival", "dc": 13 },
              "outcomes": {
                "fail": {
                  "text": "The trail goes cold in the bracken. A wasted day.",
                  "effects": [{ "effect": "days", "amount": 1 }],
                  "twist": {
                    "text": "The trail loops back to the boy, and his friends are waiting for {actor}.",
                    "effects": [
                      { "effect": "hp", "amount": -4, "target": "actor" },
                      { "effect": "days", "amount": 1 }
                    ]
                  }
                },
                "partial": {
                  "text": "You find the instruments dumped in a ditch, half of them broken. He pays what he can.",
                  "effects": [{ "effect": "gold", "amount": 6 }, { "effect": "days", "amount": 1 }]
                },
                "success": {
                  "text": "You find the thieves' camp and take the instruments back. His master pays well.",
                  "effects": [
                    { "effect": "gold", "amount": 15 },
                    { "effect": "days", "amount": 1 }
                  ],
                  "twist": {
                    "text": "The trail loops straight back to the 'apprentice'. His friends didn't expect you from behind, and leave their takings.",
                    "effects": [
                      { "effect": "gold", "amount": 10 },
                      { "effect": "days", "amount": 1 }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    },
    {
      "id": "grudge-on-the-road",
      "title": "An old grudge",
      "followUpOnly": true,
      "tags": ["road"],
      "notes": "Queued when you exploit someone in need (the someone-in-need archetype) or leave a threat hanging.",
      "stages": {
        "start": {
          "text": "Someone you wronged on the road has not forgotten. They are waiting at the next bridge, with two cousins and a cudgel each.",
          "options": [
            {
              "id": "fight",
              "kind": "check",
              "label": "Fight",
              "description": "Three of them, angry rather than skilled.",
              "check": { "skill": "athletics", "dc": 12, "combat": true },
              "outcomes": {
                "fail": {
                  "text": "You win, but the cudgels find their mark first.",
                  "effects": [{ "effect": "hp", "amount": -4, "target": "all" }]
                },
                "partial": {
                  "text": "They go into the river, and {actor} nearly goes with them.",
                  "effects": [{ "effect": "hp", "amount": -3, "target": "actor" }]
                },
                "success": {
                  "text": "They go into the river. The bridge-keeper pretends not to see."
                }
              }
            },
            {
              "id": "pay",
              "kind": "fixed",
              "label": "Make it right",
              "requires": [{ "req": "gold", "min": 10 }],
              "outcome": {
                "text": "You pay back what you took, and a little more. They spit, but they let it go.",
                "effects": [{ "effect": "gold", "amount": -10 }]
              }
            },
            {
              "id": "apologise",
              "kind": "check",
              "label": "Apologise, and mean it",
              "once": true,
              "check": { "skill": "persuasion", "dc": 14 },
              "outcomes": {
                "fail": {
                  "text": "They are not interested in words.",
                  "effects": [{ "effect": "position", "position": "exposed" }],
                  "stay": true
                },
                "partial": {
                  "text": "They take the apology, and some coin to go with it.",
                  "effects": [{ "effect": "gold", "amount": -5 }]
                },
                "success": { "text": "They grumble, but let you pass. Maybe it ends here." }
              }
            },
            {
              "id": "run",
              "kind": "check",
              "label": "Take the ford instead",
              "check": { "skill": "acrobatics", "dc": 11 },
              "outcomes": {
                "fail": {
                  "text": "They catch {actor} on the slippery stones.",
                  "effects": [
                    { "effect": "hp", "amount": -3, "target": "actor" },
                    { "effect": "days", "amount": 1 }
                  ]
                },
                "partial": {
                  "text": "You lose them, and most of a day, in the reeds.",
                  "effects": [{ "effect": "days", "amount": 1 }]
                },
                "success": { "text": "You are across the ford before they can reach it." }
              }
            }
          ]
        }
      }
    },
    {
      "id": "lantern-moths",
      "title": "Lantern moths",
      "wonder": true,
      "weight": 0.3,
      "tags": ["marsh"],
      "stages": {
        "start": {
          "text": "As the marsh grows dark, the reeds light up: thousands of moths, each carrying a cold spark, rise in slow spirals over the water.",
          "options": [
            {
              "id": "watch",
              "kind": "fixed",
              "label": "Watch until the last light fades",
              "outcome": {
                "text": "For a while nobody speaks. Later, nobody can agree on how long you stood there.",
                "effects": [{ "effect": "inspiration", "amount": 1 }]
              }
            }
          ]
        }
      }
    },
    {
      "id": "singing-stones",
      "title": "The singing stones",
      "wonder": true,
      "weight": 0.3,
      "tags": ["hill"],
      "stages": {
        "start": {
          "text": "On the ridge, a ring of standing stones hums in the wind, each a different note. Together they almost make a tune you know.",
          "options": [
            {
              "id": "listen",
              "kind": "fixed",
              "label": "Listen",
              "outcome": {
                "text": "You stop and listen until the wind changes. The tune stays with you for days."
              }
            }
          ]
        }
      }
    },
    {
      "id": "lizardfolk-herb",
      "title": "The lizardfolk's herb",
      "followUpOnly": true,
      "tags": ["swamp"],
      "notes": "Follow-up completing the trade in the ported 'lizardfolk-ritual' (data/original).",
      "stages": {
        "start": {
          "text": "Two days on, you find the jungle the lizardfolk spoke of: wet green dark, loud with insects. Somewhere in here grows the herb they want.",
          "options": [
            {
              "id": "search",
              "kind": "check",
              "label": "Search for the herb",
              "check": { "skill": "nature", "dc": 14 },
              "outcomes": {
                "critFail": {
                  "text": "{actor} brushes a nettle-vine that leaves an arm numb and swollen. No herb.",
                  "effects": [
                    { "effect": "hp", "amount": -4, "target": "actor" },
                    { "effect": "days", "amount": 1 }
                  ]
                },
                "fail": {
                  "text": "A day of searching, and nothing to show for it.",
                  "effects": [{ "effect": "days", "amount": 1 }]
                },
                "partial": {
                  "text": "You find it after a long, leech-ridden day. The lizardfolk keep their word: the artifact is yours.",
                  "effects": [
                    { "effect": "days", "amount": 1 },
                    {
                      "effect": "log",
                      "text": "Weather-calling artifact (items arrive in a later plan).",
                      "tone": "crit"
                    }
                  ]
                },
                "success": {
                  "text": "You find the herb at the foot of a drowned tree. The lizardfolk keep their word: the artifact is yours.",
                  "effects": [
                    {
                      "effect": "log",
                      "text": "Weather-calling artifact (items arrive in a later plan).",
                      "tone": "crit"
                    }
                  ]
                }
              }
            },
            {
              "id": "give-up",
              "kind": "fixed",
              "label": "Give up on the trade",
              "outcome": {
                "text": "You leave the herb to the jungle, and the artifact to the lizardfolk."
              }
            }
          ]
        }
      }
    }
  ]
}
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test`. Expected: all pass, including the playability, lint and slot-filling tests for each new situation.

**Step 5: Commit**

```bash
git add data/claude/situations.json src/content/encounters.test.ts
git commit -m "add eight situations written by Claude, two of them wonders"
```

---

### Task 14: Port the prototype events

The prototype's six events become `data/original/situations.json`, ported as faithfully as the new format allows:
- Prose percentages became checks with DCs and outcome tiers.
- `participants` (unused by the prototype's options) and each `secret` are kept in the entry's `notes`. Secrets surface on critical successes where the prototype hinted at them.
- Items don't exist until a later plan, so the prototype's item rewards are `log` effects.
- Every conversion and addition is listed in the entry's `notes`. The file's `notes` say that the first two events were handwritten and the last four were generated with ChatGPT.

**Files:**
- Create: `data/original/situations.json`
- Test: `src/content/encounters.test.ts`

**Step 1: Write the failing test.** Append to `src/content/encounters.test.ts`:

```ts

test('the six prototype events are ported to original/', () => {
  expect(idsFrom('original')).toEqual([
    'abandoned-dwarven-mine',
    'fishermen-at-the-pond',
    'lizardfolk-ritual',
    'pit-in-the-cave',
    'unburnt-grove',
    'wolves-and-goats',
  ])
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/content/encounters.test.ts`. Expected: FAIL with an empty list.

**Step 3: Write `data/original/situations.json`.** Compare it against `git show v0.1.0-svelte-final:src/lib/data.ts` while porting. The texts are the prototype's, apart from the noted fixes.

```json
{
  "$schema": "../_schema/situations.schema.json",
  "kind": "situations",
  "source": "original",
  "notes": "The prototype's six events (src/lib/data.ts at tag v0.1.0-svelte-final), ported as faithfully as possible. The first two were handwritten by the designer; the last four were generated with ChatGPT for the prototype. Each entry's notes list its prototype participants and secret, how prose odds became checks, and any additions.",
  "entries": [
    {
      "id": "fishermen-at-the-pond",
      "title": "Fishermen at the pond",
      "weight": 0.75,
      "tags": ["river", "plains", "lifeplace", "traders"],
      "notes": "Prototype event 1, handwritten. Participants: 4 human commoners (level 3). Secret: one of them carries an amulet that improves foraging. Conversions: Steal's d20 thresholds (10 / 15 / 20 / above) became Sleight of Hand DC 16, and Fight (combat) became the 'brawl' stage with a graded combat check. Additions: Approach heals 2 HP as a stand-in for food and ale until goods exist (Plan 4); 'Back off' lets you pay your way out of the brawl; the amulet is a log line until items exist.",
      "stages": {
        "start": {
          "text": "A group of fishermen are sitting by a small pond, fishing, drinking ale and laughing at each other's jokes.",
          "options": [
            {
              "id": "approach",
              "kind": "fixed",
              "label": "Approach",
              "description": "Approach the fishermen calmly and join their group.",
              "outcome": {
                "text": "They make room by the water and share their food and ale.",
                "effects": [{ "effect": "hp", "amount": 2, "target": "all" }]
              }
            },
            {
              "id": "steal",
              "kind": "check",
              "label": "Steal",
              "description": "Try to make off with their valuables while they are distracted.",
              "check": { "skill": "sleightOfHand", "dc": 16 },
              "outcomes": {
                "fail": {
                  "text": "The fishermen noticed you and prepare for battle!",
                  "goto": "brawl"
                },
                "partial": { "text": "The fishermen noticed you and secured their belongings." },
                "success": {
                  "text": "You were able to steal their wallets, containing 4 gp in total.",
                  "effects": [{ "effect": "gold", "amount": 4 }]
                },
                "critSuccess": {
                  "text": "You were able to pickpocket one of the fishermen. Gained an Amulet of Foraging!",
                  "effects": [
                    { "effect": "gold", "amount": 4 },
                    {
                      "effect": "log",
                      "text": "Amulet of Foraging (items arrive in a later plan).",
                      "tone": "crit"
                    }
                  ]
                }
              }
            },
            {
              "id": "fight",
              "kind": "fixed",
              "label": "Fight",
              "description": "Initiate combat.",
              "outcome": {
                "text": "You stride towards them with weapons drawn. The laughter stops.",
                "goto": "brawl"
              }
            },
            {
              "id": "ignore",
              "kind": "fixed",
              "label": "Ignore",
              "description": "Let them continue in peace.",
              "outcome": { "text": "Nothing happens." }
            }
          ]
        },
        "brawl": {
          "text": "Four fishermen get to their feet with gutting knives and oars.",
          "options": [
            {
              "id": "fight",
              "kind": "check",
              "label": "Fight",
              "check": { "skill": "athletics", "dc": 11, "combat": true },
              "outcomes": {
                "fail": {
                  "text": "Oars and fists. You win in the end, but it hurts.",
                  "effects": [{ "effect": "hp", "amount": -4, "target": "all" }]
                },
                "partial": {
                  "text": "They break and run, but not before {actor} takes an oar to the head.",
                  "effects": [
                    { "effect": "hp", "amount": -4, "target": "actor" },
                    { "effect": "gold", "amount": 4 }
                  ]
                },
                "success": {
                  "text": "They scatter, leaving their wallets behind.",
                  "effects": [{ "effect": "gold", "amount": 4 }]
                }
              }
            },
            {
              "id": "back-off",
              "kind": "fixed",
              "label": "Back off",
              "description": "Pay for the insult and leave.",
              "requires": [{ "req": "gold", "min": 4 }],
              "outcome": {
                "text": "You toss them a few coins for the trouble and back away.",
                "effects": [{ "effect": "gold", "amount": -4 }]
              }
            }
          ]
        }
      }
    },
    {
      "id": "unburnt-grove",
      "title": "The unburnt grove",
      "weight": 0.25,
      "tags": ["forest"],
      "notes": "Prototype event 2, handwritten. Secret: the trees are imbued with magic that protects them from fire, left by an ancient ritual at a meeting place of high elves. Conversions: the INT check became Arcana DC 12, with the prototype's two results as the partial and success tiers; a critical success reveals the secret. Changes: Investigate and Arcana can each be tried once before you decide; 'inflammable' became 'fireproof' (the prototype meant the opposite); the bark is a log line until items exist.",
      "stages": {
        "start": {
          "text": "You pass through a barren section of forest that was damaged about a decade ago by a forest fire. In the middle of the desolation, you find a circle of trees that seems untouched by the fire that destroyed the surroundings.",
          "options": [
            {
              "id": "investigate",
              "kind": "fixed",
              "label": "Investigate the trees",
              "description": "See if the trees have anything special about them.",
              "once": true,
              "outcome": {
                "text": "You notice that some of the trees are warm to the touch, but don't have other special characteristics.",
                "stay": true
              }
            },
            {
              "id": "arcana",
              "kind": "check",
              "label": "Use arcana knowledge",
              "description": "Try to find clues related to the use of magic.",
              "once": true,
              "check": { "skill": "arcana", "dc": 12 },
              "outcomes": {
                "fail": {
                  "text": "Whatever is here, {actor} can't make sense of it.",
                  "stay": true
                },
                "partial": {
                  "text": "You notice that the trees are protected against fire.",
                  "stay": true
                },
                "success": {
                  "text": "You notice that some sort of ritual or enchantment has been placed around the area a long time ago.",
                  "stay": true
                },
                "critSuccess": {
                  "text": "{actor} recognises the old craft: high elves met here once, and their ritual still guards the trees from fire.",
                  "stay": true
                }
              }
            },
            {
              "id": "burn",
              "kind": "fixed",
              "label": "Burn the trees",
              "description": "Try to set a fire to the remaining trees.",
              "outcome": {
                "text": "The fire has trouble catching onto the trees. It's as if the trees are entirely fireproof."
              }
            },
            {
              "id": "bark",
              "kind": "fixed",
              "label": "Rip bark from the trees",
              "description": "Take a piece of bark with you for future use.",
              "outcome": {
                "text": "You gained a piece of bark. What are you going to do with it?",
                "effects": [
                  {
                    "effect": "log",
                    "text": "Fireproof bark (items arrive in a later plan).",
                    "tone": "info"
                  }
                ]
              }
            },
            {
              "id": "ignore",
              "kind": "fixed",
              "label": "Ignore",
              "description": "Ignore the trees.",
              "outcome": { "text": "You ignore the trees and decide to go somewhere else." }
            }
          ]
        }
      }
    },
    {
      "id": "abandoned-dwarven-mine",
      "title": "The abandoned dwarven mine",
      "weight": 0.6,
      "tags": ["mountain"],
      "notes": "Prototype event 3, generated with ChatGPT for the prototype. Hidden participants: 2 dwarf fighters (level 5) and a human rogue (level 4), unused here as there. Secret: a hidden, heavily trapped passage leads to a treasure room. Conversions: Explore's two results became Investigation DC 13 (finding the map on a success); 'Search for the treasure room' needs the map, so it moved to a second stage as Perception DC 14 against the traps. Additions: a critical failure while exploring brings down rubble; trap damage on the search; the warhammer is a log line until items exist.",
      "stages": {
        "start": {
          "text": "The group stumbles upon an abandoned dwarven mine. It's filled with rubble and looks like it hasn't been used in decades.",
          "options": [
            {
              "id": "explore",
              "kind": "check",
              "label": "Explore the mine",
              "description": "Investigate the abandoned dwarven mine.",
              "check": { "skill": "investigation", "dc": 13 },
              "outcomes": {
                "critFail": {
                  "text": "A rotten prop gives way, and rubble comes down on {actor}.",
                  "effects": [{ "effect": "hp", "amount": -4, "target": "actor" }]
                },
                "fail": {
                  "text": "The party finds nothing out of the ordinary, just rubble and old equipment scattered throughout the mine."
                },
                "partial": {
                  "text": "The party finds nothing out of the ordinary, just rubble and old equipment scattered throughout the mine."
                },
                "success": {
                  "text": "The party finds a map that shows the location of a hidden treasure room!",
                  "goto": "map"
                }
              }
            },
            {
              "id": "leave",
              "kind": "fixed",
              "label": "Leave the mine",
              "description": "Abandon the mine and move on.",
              "outcome": { "text": "Nothing happens." }
            }
          ]
        },
        "map": {
          "text": "The map shows a hidden passage behind a collapsed gallery. Scratched beside it, in old dwarvish: 'mind the floor'.",
          "options": [
            {
              "id": "search",
              "kind": "check",
              "label": "Search for the treasure room",
              "description": "Use the map to find the treasure room.",
              "check": { "skill": "perception", "dc": 14 },
              "outcomes": {
                "critFail": {
                  "text": "{actor} misses the pressure plate. Darts hiss out of the walls.",
                  "effects": [{ "effect": "hp", "amount": -6, "target": "actor" }]
                },
                "fail": {
                  "text": "A trap springs on {actor}, and you retreat bleeding and empty-handed.",
                  "effects": [{ "effect": "hp", "amount": -4, "target": "actor" }]
                },
                "partial": {
                  "text": "You reach the treasure room past one trap too many. There is still gold in the chest.",
                  "effects": [
                    { "effect": "hp", "amount": -3, "target": "actor" },
                    { "effect": "gold", "amount": 15 }
                  ]
                },
                "success": {
                  "text": "The party finds the hidden passage and successfully navigates through the traps to the treasure room. They find a chest filled with gold and gems.",
                  "effects": [{ "effect": "gold", "amount": 30 }]
                },
                "critSuccess": {
                  "text": "The party finds the hidden passage and successfully navigates through the traps to the treasure room. They find a chest filled with gold and gems, as well as a magical dwarven warhammer.",
                  "effects": [
                    { "effect": "gold", "amount": 30 },
                    {
                      "effect": "log",
                      "text": "Magical dwarven warhammer (items arrive in a later plan).",
                      "tone": "crit"
                    }
                  ]
                }
              }
            },
            {
              "id": "leave",
              "kind": "fixed",
              "label": "Leave the mine",
              "description": "Abandon the mine and move on.",
              "outcome": { "text": "Nothing happens." }
            }
          ]
        }
      }
    },
    {
      "id": "lizardfolk-ritual",
      "title": "The lizardfolk ritual",
      "weight": 0.5,
      "tags": ["swamp"],
      "notes": "Prototype event 4, generated with ChatGPT for the prototype. Participants: a half-elf bard and a human wizard (level 3), unused. Secret: the sacrifice is a powerful artifact the lizardfolk have guarded for generations, said to control the weather and bring fortune. Conversions: Steal's prose odds (30% unseen, 50% detected and fighting out, 20% an elemental) became Stealth DC 16: success unseen, fail and partial fight their way out, a critical failure summons the elemental. Additions: the trade's herb quest is the follow-up 'lizardfolk-herb' (data/claude); the artifact is a log line until items exist.",
      "stages": {
        "start": {
          "text": "The party encounters a group of lizardfolk who are performing a ritual. They're gathered around a large stone altar and seem to be offering a sacrifice to their deity.",
          "options": [
            {
              "id": "approach",
              "kind": "fixed",
              "label": "Approach the lizardfolk",
              "description": "Attempt to communicate with the lizardfolk and learn more about their ritual.",
              "outcome": {
                "text": "The party is able to communicate with the lizardfolk and learn more about their culture and traditions. However, they are unable to learn anything about the artifact."
              }
            },
            {
              "id": "steal",
              "kind": "check",
              "label": "Steal the artifact",
              "description": "Attempt to steal the artifact while the lizardfolk are distracted.",
              "check": { "skill": "stealth", "dc": 16 },
              "outcomes": {
                "critFail": {
                  "text": "The lizardfolk call upon their deity and a powerful elemental is summoned to defend the artifact.",
                  "effects": [{ "effect": "hp", "amount": -6, "target": "all" }]
                },
                "fail": {
                  "text": "The party is detected and must fight their way out.",
                  "effects": [{ "effect": "hp", "amount": -4, "target": "all" }]
                },
                "partial": {
                  "text": "The party is detected at the last moment and fights its way out.",
                  "effects": [{ "effect": "hp", "amount": -2, "target": "all" }]
                },
                "success": {
                  "text": "The party is able to steal the artifact without being detected.",
                  "effects": [
                    {
                      "effect": "log",
                      "text": "Weather-calling artifact (items arrive in a later plan).",
                      "tone": "crit"
                    }
                  ]
                }
              }
            },
            {
              "id": "trade",
              "kind": "fixed",
              "label": "Trade for the artifact",
              "description": "Attempt to negotiate with the lizardfolk for the artifact.",
              "outcome": {
                "text": "The lizardfolk are willing to trade the artifact for a rare magical herb that grows in the nearby jungle. The party must find the herb and return it to the lizardfolk in exchange for the artifact.",
                "effects": [{ "effect": "followUp", "situation": "lizardfolk-herb", "after": 1 }]
              }
            },
            {
              "id": "leave",
              "kind": "fixed",
              "label": "Leave the lizardfolk alone",
              "description": "Ignore the lizardfolk and move on.",
              "outcome": { "text": "Nothing happens." }
            }
          ]
        }
      }
    },
    {
      "id": "wolves-and-goats",
      "title": "Wolves on the mountain path",
      "weight": 0.5,
      "tags": ["mountain"],
      "notes": "Prototype event 5, generated with ChatGPT for the prototype. Participant: a half-elf ranger (level 5), unused. Secret: the alpha wolf wears an enchanted collar that only a special key removes (shown on a critical success). Conversions: Fight (50% win, 30% win with losses, 20% lose) became a combat Athletics check at DC 12; Sneak (70% / 30%) Stealth DC 10; Save the wolves (the wolves turn on you, then 70% / 30%) a combat Athletics check at DC 10 where every result costs HP. 'Lose some party members' became heavy HP loss: encounters don't kill outright until the run loop exists (Plan 5).",
      "stages": {
        "start": {
          "text": "As you climb the mountain, you come across a narrow, treacherous path. Suddenly, a group of mountain goats cross your path, but they are being chased by a pack of wolves.",
          "options": [
            {
              "id": "fight",
              "kind": "check",
              "label": "Fight the wolves",
              "description": "Attack the wolves and try to save the goats.",
              "check": { "skill": "athletics", "dc": 12, "combat": true },
              "outcomes": {
                "fail": {
                  "text": "You lose the fight and scramble back down the path.",
                  "effects": [{ "effect": "hp", "amount": -5, "target": "all" }]
                },
                "partial": {
                  "text": "You save the goats, but the wolves maul {actor} before they break.",
                  "effects": [
                    { "effect": "hp", "amount": -5, "target": "actor" },
                    { "effect": "hp", "amount": -2, "target": "all" }
                  ]
                },
                "success": { "text": "You defeat the wolves and save the goats." },
                "critSuccess": {
                  "text": "You defeat the wolves and save the goats. The alpha wears an enchanted collar with a strange keyhole.",
                  "effects": [
                    {
                      "effect": "log",
                      "text": "The alpha's collar needs a special key to remove.",
                      "tone": "crit"
                    }
                  ]
                }
              }
            },
            {
              "id": "sneak",
              "kind": "check",
              "label": "Sneak past the wolves",
              "description": "Try to sneak past the wolves and continue on your journey.",
              "check": { "skill": "stealth", "dc": 10 },
              "outcomes": {
                "fail": {
                  "text": "You get detected and attacked.",
                  "effects": [{ "effect": "hp", "amount": -3, "target": "all" }]
                },
                "partial": {
                  "text": "The wolves notice you at the last moment and snap at your heels as you go.",
                  "effects": [{ "effect": "hp", "amount": -2, "target": "random" }]
                },
                "success": { "text": "You sneak past the wolves and continue on your journey." }
              }
            },
            {
              "id": "save-wolves",
              "kind": "check",
              "label": "Save the wolves",
              "description": "Attempt to drive the goats away to protect the wolves.",
              "check": { "skill": "athletics", "dc": 10, "combat": true },
              "outcomes": {
                "fail": {
                  "text": "The wolves become aggressive and attack the party, losing the goats. You lose the fight.",
                  "effects": [{ "effect": "hp", "amount": -5, "target": "all" }]
                },
                "partial": {
                  "text": "The wolves become aggressive and attack the party, losing the goats. You beat them off, bloodied.",
                  "effects": [{ "effect": "hp", "amount": -3, "target": "all" }]
                },
                "success": {
                  "text": "The wolves become aggressive and attack the party, losing the goats. You defeat the wolves.",
                  "effects": [{ "effect": "hp", "amount": -2, "target": "random" }]
                }
              }
            }
          ]
        }
      }
    },
    {
      "id": "pit-in-the-cave",
      "title": "The pit in the cave",
      "weight": 0.4,
      "tags": ["hill", "mountain"],
      "notes": "Prototype event 6, generated with ChatGPT for the prototype. Participant: a dwarf fighter (level 4), unused. Secret: the pit is a trap with spikes at the bottom. Conversions: Investigate became Perception DC 10, tried once, whose success grants Edge for the jump; Jump (50% / 50%) Athletics DC 12; 'Find a way around' leads to the goblins (50% / 50%), a combat check at DC 12. Addition: you can back away from the goblins at the cost of a day.",
      "stages": {
        "start": {
          "text": "You enter a dark cave and are greeted by the sound of dripping water. You notice a deep pit in the ground that is barely visible in the darkness.",
          "options": [
            {
              "id": "investigate",
              "kind": "check",
              "label": "Investigate the pit",
              "description": "Approach and investigate the pit.",
              "once": true,
              "check": { "skill": "perception", "dc": 10 },
              "outcomes": {
                "critFail": {
                  "text": "{actor} leans too far over the edge and catches a spike climbing back.",
                  "effects": [{ "effect": "hp", "amount": -2, "target": "actor" }],
                  "stay": true
                },
                "fail": { "text": "It's too dark to see the bottom.", "stay": true },
                "partial": {
                  "text": "You spot the spikes at the bottom and realize that it is a trap, likely set up by goblins or other creatures. Beware.",
                  "stay": true
                },
                "success": {
                  "text": "You spot the spikes at the bottom and realize that it is a trap, likely set up by goblins or other creatures. Beware. {actor} also finds the best place to jump.",
                  "effects": [{ "effect": "position", "position": "edge" }],
                  "stay": true
                }
              }
            },
            {
              "id": "jump",
              "kind": "check",
              "label": "Jump over the pit",
              "description": "Attempt to jump over the pit.",
              "check": { "skill": "athletics", "dc": 12 },
              "outcomes": {
                "fail": {
                  "text": "You fail to jump and fall into the spikes, taking damage.",
                  "effects": [{ "effect": "hp", "amount": -5, "target": "actor" }]
                },
                "partial": {
                  "text": "You make the jump, barely, and scrape a shin on the far edge.",
                  "effects": [{ "effect": "hp", "amount": -1, "target": "actor" }]
                },
                "success": { "text": "You successfully jump over the pit." }
              }
            },
            {
              "id": "around",
              "kind": "fixed",
              "label": "Find a way around the pit",
              "description": "Try to find a different way around the pit.",
              "outcome": {
                "text": "You manage to find a path that leads around the pit, avoiding the trap. However, you also find a group of goblins waiting for you.",
                "goto": "goblins"
              }
            }
          ]
        },
        "goblins": {
          "text": "Goblins crouch in the side passage, blades out, grinning.",
          "options": [
            {
              "id": "fight",
              "kind": "check",
              "label": "Fight the goblins",
              "check": { "skill": "athletics", "dc": 12, "combat": true },
              "outcomes": {
                "fail": {
                  "text": "You lose the fight and are driven back out of the cave.",
                  "effects": [{ "effect": "hp", "amount": -5, "target": "all" }]
                },
                "partial": {
                  "text": "You defeat the goblins, bloodied.",
                  "effects": [{ "effect": "hp", "amount": -3, "target": "all" }]
                },
                "success": { "text": "You successfully defeat the goblins." }
              }
            },
            {
              "id": "retreat",
              "kind": "fixed",
              "label": "Back away",
              "outcome": {
                "text": "You back out of the cave and take the long way round.",
                "effects": [{ "effect": "days", "amount": 1 }]
              }
            }
          ]
        }
      }
    }
  ]
}
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test`. Expected: all pass. `lizardfolk-ritual`'s trade queues `lizardfolk-herb` from Task 13.

**Step 5: Commit**

```bash
git add data/original/situations.json src/content/encounters.test.ts
git commit -m "port the six prototype events to original situations"
```

---

### Task 15: Private imports from Road Encounters (local only, never committed)

This task proves the `imported-private` path end to end with 3–5 entries summarised from `~/dnd5e/adventures - solo/Road Encounters.pdf`. **Nothing from it is committed:** `data/imported-private/` is gitignored, and no text from the PDF goes anywhere else.

**Files:**
- Create (gitignored): `data/imported-private/road-encounters.json`
- Modify (local, gitignored): `CREDITS.md`

**Step 1: Read the PDF and pick 3–5 road encounters** that fit an archetype: armed people blocking the way (`hostile-group`), or someone asking for help who may not be what they seem (`someone-in-need`). Read it with the Read tool (`pages` parameter); the PDF is a single file, so don't copy it anywhere.

**Step 2: Write `data/imported-private/road-encounters.json`.** Each entry is a one-stage situation:
- The `text` is a one-line summary in your own words. Quote nothing.
- The stage points at an archetype.
- `notes` names the page.

Use this structure:

```json
{
  "$schema": "../_schema/situations.schema.json",
  "kind": "situations",
  "source": "imported-private",
  "notes": "Summarised from Road Encounters (~/dnd5e/adventures - solo/Road Encounters.pdf) for personal play. Gitignored: never commit.",
  "entries": [
    {
      "id": "road-<short-name>",
      "title": "<short title>",
      "notes": "Road Encounters, p. <n>",
      "slots": { "foe": { "from": "creature", "types": ["humanoid"], "maxCr": 1 } },
      "stages": {
        "start": {
          "text": "<one-line summary in your own words, may use {Foe}>",
          "archetype": { "id": "hostile-group", "dc": 13, "reward": 1 }
        }
      }
    },
    {
      "id": "road-<another>",
      "title": "<short title>",
      "notes": "Road Encounters, p. <n>",
      "twist": { "chance": 0.3, "what": "<what the trick would be>" },
      "stages": {
        "start": {
          "text": "<one-line summary in your own words>",
          "archetype": { "id": "someone-in-need", "dc": 12, "reward": 1 }
        }
      }
    }
  ]
}
```

`someone-in-need` needs a `twist` (the validator reports `revealTwist but the situation has no twist` otherwise). Ids start with `road-` and must not clash with any other situation id.

**Step 3: Verify that the files load and are ignored**

Run: `pnpm test`. Expected: all pass. The bundled tests now include the private entries (playable, lint-clean, slots filled), and the `imported-private` test takes its "present" branch.
Run: `git check-ignore -v data/imported-private/road-encounters.json`. Expected: `.gitignore:…:/data/imported-private/	data/imported-private/road-encounters.json`.
Run: `git status --short`. Expected: nothing under `data/imported-private/`.

**Step 4: Record the source in `CREDITS.md`** (local):

```markdown
| Road Encounters (summaries) | `data/imported-private/road-encounters.json` | Road Encounters PDF in `~/dnd5e/adventures - solo/` (author: check the PDF's title page) | Copyrighted, personal use | No (gitignored) | One-line summaries in our own words, pointing at archetypes |
```

**Step 5: No commit.** Nothing in this task is tracked by git. Confirm with `git status --short`, which should print nothing.

---

### Task 16: Dice animation

Design §9 in detail:
- **Normal rolls:** flat d20 outlines whose faces flicker, then settle one after another. The first die settles at 600 ms and the next 250 ms later, all within 1.5 s.
- **High-stakes rolls:** the last die slows its flicker and settles at 1400 ms. It glows once it lands, and the DC is drawn as a line on the range of possible totals.
- **Skipping:** a click settles everything at once.
- **Reduced motion:** with `prefers-reduced-motion` the result shows at once, with no flicker.

The engine decides the roll before this component mounts. The random faces are presentation only, which is why `Math.random` is allowed here: it is UI code, not engine code.

**Files:**
- Create: `src/ui/dice/schedule.ts`, `src/ui/dice/DiceRoll.tsx`
- Test: `src/ui/dice/schedule.test.ts`, `src/ui/dice/DiceRoll.test.tsx`

**Step 1: Write the failing tests**

`src/ui/dice/schedule.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { DICE_MAX_MS, flickerDelay, settleTimes } from './schedule'

describe('dice schedule', () => {
  test.each([
    [1, false],
    [2, false],
    [1, true],
    [2, true],
  ])('%i dice (high stakes: %s) settle in order within the time limit', (count, highStakes) => {
    const times = settleTimes(count, highStakes)
    expect(times).toHaveLength(count)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(Math.max(...times)).toBeLessThanOrEqual(DICE_MAX_MS)
  })

  test('a high-stakes roll holds the last die back longer', () => {
    const [, normalLast] = settleTimes(2, false)
    const [first, highLast] = settleTimes(2, true)
    expect(highLast).toBeGreaterThan(normalLast)
    expect(highLast - first).toBeGreaterThan(normalLast - first)
  })

  test('only the last high-stakes die slows its flicker, near the end', () => {
    expect(flickerDelay(1000, true)).toBe(flickerDelay(1000, false))
    expect(flickerDelay(200, true)).toBeGreaterThan(flickerDelay(200, false))
  })
})
```

`src/ui/dice/DiceRoll.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { RollRecord } from '../../schema/state'
import { DiceRoll } from './DiceRoll'
import { DICE_MAX_MS, settleTimes } from './schedule'

const roll: RollRecord = {
  stat: 'athletics',
  actorId: 'brom',
  dice: [7, 15],
  kept: 15,
  keptIndex: 1,
  modifier: 3,
  total: 18,
  dc: 14,
  mode: 'advantage',
  tier: 'success',
}
const faces = () => [...document.querySelectorAll('.d20 text')].map((t) => Number(t.textContent))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
})

test('settles on the real dice, one after another, within 1.5 s', () => {
  const onDone = vi.fn()
  render(<DiceRoll roll={roll} onDone={onDone} />)
  expect(onDone).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(settleTimes(2, false)[0]))
  expect(document.querySelectorAll('.d20.settled')).toHaveLength(1)
  act(() => vi.advanceTimersByTime(DICE_MAX_MS))
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(faces()).toEqual([7, 15])
  expect(document.querySelector('.d20.kept text')?.textContent).toBe('15')
})

test('a click skips straight to the result', () => {
  const onDone = vi.fn()
  render(<DiceRoll roll={roll} onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: 'Skip dice animation' }))
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(faces()).toEqual([7, 15])
  expect(screen.getByRole('button', { name: 'Rolled 7 and 15' })).toBeTruthy()
  act(() => vi.advanceTimersByTime(DICE_MAX_MS))
  expect(onDone).toHaveBeenCalledTimes(1)
})

test('high stakes: the DC line is drawn and the last die glows once it settles', () => {
  render(<DiceRoll roll={roll} highStakes />)
  expect(screen.getByText('DC 14')).toBeTruthy()
  act(() => vi.advanceTimersByTime(settleTimes(2, false)[1]))
  expect(document.querySelector('.d20.glow')).toBeNull() // held back past the normal settle time
  act(() => vi.advanceTimersByTime(DICE_MAX_MS))
  expect(document.querySelector('.d20.glow text')?.textContent).toBe('15')
  expect(document.querySelector('.dc-total')).toBeTruthy()
})

test('reduced motion shows the result at once, with no flicker timers', () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query.includes('reduce'), media: query }),
  })
  const onDone = vi.fn()
  render(<DiceRoll roll={roll} onDone={onDone} />)
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(faces()).toEqual([7, 15])
  expect(vi.getTimerCount()).toBe(0)
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/ui/dice`. Expected: FAIL, because `./schedule` and `./DiceRoll` cannot be resolved.

**Step 3: Implement**

`src/ui/dice/schedule.ts`:

```ts
/** The whole roll, every die settled, takes at most this long (design §9). */
export const DICE_MAX_MS = 1500
const FIRST_SETTLE_MS = 600
const SETTLE_GAP_MS = 250
/** On a high-stakes roll the last die lingers until here. */
const HIGH_STAKES_LAST_MS = 1400
const FLICKER_MS = 60
const SLOW_FLICKER_MS = 170
/** How long before settling the last high-stakes die starts to slow down. */
const SLOWDOWN_WINDOW_MS = 600

/** When each die settles, in ms from the start. Dice settle one after another. */
export function settleTimes(count: number, highStakes: boolean): number[] {
  const times = Array.from({ length: count }, (_, i) => FIRST_SETTLE_MS + i * SETTLE_GAP_MS)
  if (highStakes && count > 0) times[count - 1] = HIGH_STAKES_LAST_MS
  return times
}

/** Delay before the next face flicker of an unsettled die. The last high-stakes die slows down. */
export function flickerDelay(msUntilSettle: number, slow: boolean): number {
  return slow && msUntilSettle < SLOWDOWN_WINDOW_MS ? SLOW_FLICKER_MS : FLICKER_MS
}
```

`src/ui/dice/DiceRoll.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { RollRecord } from '../../schema/state'
import { flickerDelay, settleTimes } from './schedule'

export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Presentation only: the engine decided the roll before this component mounted. */
const randomFace = () => 1 + Math.floor(Math.random() * 20)
const replaced = <T,>(list: T[], index: number, value: T) => list.map((v, i) => (i === index ? value : v))

type Props = {
  /** Mount one DiceRoll per roll (give it a key), so each roll animates once. */
  roll: RollRecord
  highStakes?: boolean
  onDone?: () => void
}

/**
 * Flat d20 outlines whose faces flicker, then settle one after another (at most 1.5 s).
 * High-stakes rolls hold back the last die, make it glow and draw the DC line.
 * A click skips; reduced motion shows the result at once.
 */
export function DiceRoll({ roll, highStakes = false, onDone }: Props) {
  const [reduced] = useState(prefersReducedMotion)
  const [settled, setSettled] = useState(() => roll.dice.map(() => reduced))
  const [faces, setFaces] = useState(() => (reduced ? roll.dice : roll.dice.map(randomFace)))
  const timers = useRef<number[]>([])
  const done = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const finish = () => {
    if (done.current) return
    done.current = true
    clearTimers()
    setSettled(roll.dice.map(() => true))
    setFaces(roll.dice)
    onDoneRef.current?.()
  }

  useEffect(() => {
    if (reduced) {
      finish()
      return
    }
    const times = settleTimes(roll.dice.length, highStakes)
    const last = roll.dice.length - 1
    roll.dice.forEach((face, i) => {
      const slow = highStakes && i === last
      let elapsed = 0
      const tick = () => {
        const delay = flickerDelay(times[i] - elapsed, slow)
        if (elapsed + delay >= times[i]) {
          const settle = () => {
            setSettled((s) => replaced(s, i, true))
            setFaces((f) => replaced(f, i, face))
            if (i === last) finish()
          }
          timers.current.push(window.setTimeout(settle, times[i] - elapsed))
          return
        }
        timers.current.push(
          window.setTimeout(() => {
            elapsed += delay
            setFaces((f) => replaced(f, i, randomFace()))
            tick()
          }, delay)
        )
      }
      tick()
    })
    return clearTimers
    // The roll is fixed for this component's lifetime (callers key it per roll).
  }, [])

  const allSettled = settled.every(Boolean)
  return (
    <button
      type="button"
      className="dice-roll"
      onClick={finish}
      aria-label={allSettled ? `Rolled ${roll.dice.join(' and ')}` : 'Skip dice animation'}
    >
      <span className="dice">
        {roll.dice.map((_, i) => (
          <D20
            key={i}
            face={faces[i]}
            settled={settled[i]}
            kept={allSettled && i === roll.keptIndex}
            glow={highStakes && i === roll.dice.length - 1 && settled[i]}
          />
        ))}
      </span>
      {highStakes && <DcLine roll={roll} done={allSettled} />}
    </button>
  )
}

function D20({ face, settled, kept, glow }: { face: number; settled: boolean; kept: boolean; glow: boolean }) {
  const className = ['d20', settled && 'settled', kept && 'kept', glow && 'glow'].filter(Boolean).join(' ')
  return (
    <svg className={className} viewBox="0 0 40 40" width="44" height="44" aria-hidden="true">
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" />
      <polygon points="20,8 31,27 9,27" />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="middle">
        {face}
      </text>
    </svg>
  )
}

/** The DC as a line on the range of possible totals; the total appears once the dice settle. */
function DcLine({ roll, done }: { roll: RollRecord; done: boolean }) {
  const min = 1 + roll.modifier
  const max = 20 + roll.modifier
  const at = (n: number) => `${(100 * (Math.min(max, Math.max(min, n)) - min)) / (max - min)}%`
  return (
    <span className="dc-track" aria-hidden="true">
      <span className="dc-line" style={{ left: at(roll.dc) }}>
        DC {roll.dc}
      </span>
      {done && <span className="dc-total" style={{ left: at(roll.total) }} />}
    </span>
  )
}
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/ui/dice
git commit -m "add the d20 dice animation with high-stakes rolls, skip and reduced motion"
```

---

### Task 17: The encounter view

What the view shows:
- **Header:** the stage text, a source badge, the position (Edge or Exposed) and what the twist would be. The twist's odds appear once revealed.
- **Option cards:** each shows the actor (with a picker), the skill, DC and odds bar, then every outcome tier from best to worst, with effect chips, twist branches and whether the encounter ends or continues.
- **Rolls:** a new roll animates, and what it led to stays hidden until the dice settle.

The view only renders `encounterOptions()` and dispatches actions; no game rule lives in it.

**Files:**
- Create: `src/ui/SourceBadge.tsx`, `src/ui/encounter/OptionCard.tsx`, `src/ui/encounter/EncounterView.tsx`
- Modify: `src/ui/theme.css`
- Test: `src/ui/encounter/EncounterView.test.tsx`

**Step 1: Write the failing test `src/ui/encounter/EncounterView.test.tsx`**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test } from 'vitest'
import { step, type Action } from '../../engine/state'
import { fixtureContent, makeState } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { EncounterView } from './EncounterView'

const content = fixtureContent()
const started = (situationId: string, state: GameState = makeState()) =>
  step(state, { type: 'startEncounter', situationId }, content)

/** Runs the real engine behind the view, like useGame does. */
function Harness({ initial }: { initial: GameState }) {
  const [state, setState] = useState(initial)
  const onAction = (a: Action) => setState((s) => step(s, a, content))
  return state.encounter ? <EncounterView state={state} onAction={onAction} /> : <p>closed</p>
}

afterEach(cleanup)

test('shows the situation, its source, and every option with odds and outcomes', () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  expect(screen.getByRole('heading', { name: 'Roadside' })).toBeTruthy()
  expect(screen.getByText('Original')).toBeTruthy()
  expect(screen.getByText(/begs for help\. A child waits at home\./)).toBeTruthy()
  expect(screen.getByText('Possible twist: it is a trap. Odds unknown.')).toBeTruthy()
  const read = within(screen.getByRole('article', { name: 'Read them' }))
  expect(read.getByText('Insight vs DC 12')).toBeTruthy()
  expect(read.getByText('55%')).toBeTruthy()
  expect(read.getAllByText(/Lyra reads them\./)).toHaveLength(2) // success, and critical success by fallback
  const trust = within(screen.getByRole('article', { name: 'Help them' }))
  expect(trust.getByText(/If it is a trap:/)).toBeTruthy()
  expect(trust.getByText('−20 gp')).toBeTruthy()
})

test('a fixed option ends the encounter, and Close clears it', async () => {
  const state = started('roadside')
  render(<Harness initial={{ ...state, encounter: { ...state.encounter!, twist: false } }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Choose Help them' }))
  expect(screen.getByText(/thanks you\./)).toBeTruthy()
  expect(screen.getByText('The encounter is over.')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByText('closed')).toBeTruthy()
})

test('a check animates the dice and hides the result until they settle (click skips)', async () => {
  render(<Harness initial={started('cliff')} />)
  await userEvent.click(screen.getByRole('button', { name: 'Choose Climb' }))
  const skip = screen.getByRole('button', { name: 'Skip dice animation' })
  expect(screen.queryByRole('button', { name: /^Choose / })).toBeNull()
  await userEvent.click(skip)
  expect(screen.getByRole('button', { name: /^Rolled \d+$/ })).toBeTruthy()
  expect(screen.getByText(/^(Brom slips\.|A scraped climb\.|Up you go\.)/)).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /^Choose / }).length).toBeGreaterThan(0)
})

test('unmet requirements disable the option and say why', () => {
  render(<Harness initial={started('roadside', makeState({ gold: 5 }))} />)
  expect((screen.getByRole('button', { name: 'Choose Give them money' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText('needs 20 gp')).toBeTruthy()
})

test('the player can pick who acts', async () => {
  render(<Harness initial={started('roadside')} />)
  const read = within(screen.getByRole('article', { name: 'Read them' }))
  await userEvent.selectOptions(read.getByRole('combobox', { name: 'Actor for Read them' }), 'brom')
  expect(read.getByText(/Brom \+1:/)).toBeTruthy()
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/ui/encounter`. Expected: FAIL, because `./EncounterView` cannot be resolved.

**Step 3: Implement**

`src/ui/SourceBadge.tsx`:

```tsx
import type { Source } from '../schema/common'

export const SOURCE_LABELS: Record<Source, string> = {
  original: 'Original',
  imported: 'SRD',
  'imported-private': 'Private',
  procedural: 'Procedural',
  claude: 'Claude',
}

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className={`badge source-${source}`} title={`Content source: data/${source}/`}>
      {SOURCE_LABELS[source]}
    </span>
  )
}
```

`src/ui/encounter/OptionCard.tsx`:

```tsx
import { formatModifier, formatPercent } from '../../engine/format'
import type { BranchPreview, OptionPreview } from '../../engine/encounters/preview'
import { TIER_LABELS } from '../../engine/rules/checks'
import { OddsBar } from '../OddsBar'

type Props = {
  option: OptionPreview
  /** What the twist would be, e.g. "they are bait for an ambush", or null if there is none. */
  twistWhat: string | null
  actorId: string
  onActor: (actorId: string) => void
  onChoose: () => void
}

const NEXT = { end: 'ends', stay: 'continues', stage: 'continues' } as const

function Branch({ branch }: { branch: BranchPreview }) {
  return (
    <>
      {branch.text}
      {branch.effects.map((e) => (
        <span key={e} className="chip">
          {e}
        </span>
      ))}
      <span className="muted small"> · {NEXT[branch.next]}</span>
    </>
  )
}

export function OptionCard({ option, twistWhat, actorId, onActor, onChoose }: Props) {
  const { check } = option
  return (
    <article className="option-card" aria-label={option.label}>
      <header className="card-head">
        <strong>{option.label}</strong>
        {check && (
          <span className="muted">
            {check.label} vs DC {check.dc}
            {check.mode !== 'normal' && ` · ${check.mode === 'advantage' ? 'Edge' : 'Exposed'}`}
          </span>
        )}
      </header>
      {option.description && <p className="muted small">{option.description}</p>}
      {check && (
        <>
          <p className="small">
            <label>
              Actor{' '}
              <select aria-label={`Actor for ${option.label}`} value={actorId} onChange={(e) => onActor(e.target.value)}>
                <option value="">Auto: {check.actors[0]?.name}</option>
                {check.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {formatModifier(a.modifier)}
                  </option>
                ))}
              </select>
            </label>{' '}
            {check.actorName} {formatModifier(check.modifier)}: <strong>{formatPercent(check.successChance)}</strong>{' '}
            to succeed
          </p>
          <OddsBar odds={check.odds} />
        </>
      )}
      <ul className="outcomes">
        {[...option.outcomes].reverse().map((o) => (
          <li key={o.tier ?? 'fixed'} className={o.tier ? `tier-${o.tier}` : undefined}>
            {o.tier && <strong>{TIER_LABELS[o.tier]}: </strong>}
            <Branch branch={o} />
            {o.twist && (
              <div className="twist small">
                If {twistWhat ?? 'there is a twist'}: <Branch branch={o.twist} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {option.unmet.length > 0 && <p className="tone-bad small">{option.unmet.join(', ')}</p>}
      <button className="primary" disabled={!option.available} onClick={onChoose} aria-label={`Choose ${option.label}`}>
        Choose
      </button>
    </article>
  )
}
```

`src/ui/encounter/EncounterView.tsx`:

```tsx
import { useState } from 'react'
import { encounterOptions, twistInfo } from '../../engine/encounters/preview'
import { formatPercent } from '../../engine/format'
import type { Action } from '../../engine/state'
import type { EncounterState, GameState } from '../../schema/state'
import { DiceRoll } from '../dice/DiceRoll'
import { SourceBadge } from '../SourceBadge'
import { OptionCard } from './OptionCard'

const lastRollIndex = (encounter: EncounterState) => encounter.log.findLastIndex((e) => e.roll)

/**
 * Renders the active encounter. The rules live in the engine: this shows the previews from
 * encounterOptions() and dispatches the player's choice. A new roll animates, and what it led to
 * stays hidden until the dice settle. Rolls already in the log when the view opened don't animate.
 */
export function EncounterView({ state, onAction }: { state: GameState; onAction: (a: Action) => void }) {
  const encounter = state.encounter!
  // The first log entry is kept by every step, so a new one means a new encounter started here.
  const first = encounter.log[0]
  const [seen, setSeen] = useState(() => ({ first, baseline: lastRollIndex(encounter) }))
  const [shownRoll, setShownRoll] = useState(seen.baseline)
  const [actorIds, setActorIds] = useState<Record<string, string>>({})
  if (seen.first !== first) {
    const baseline = lastRollIndex(encounter)
    setSeen({ first, baseline })
    setShownRoll(baseline)
    setActorIds({})
  }

  const rollIndex = lastRollIndex(encounter)
  const animating = rollIndex > shownRoll
  const visible = animating ? encounter.log.slice(0, rollIndex + 1) : encounter.log
  const twist = twistInfo(state)

  return (
    <section className="panel encounter" aria-label="Encounter">
      <header className="card-head">
        <h2>{encounter.situation.title}</h2>
        <span>
          <SourceBadge source={encounter.source} />
          {encounter.position !== 'normal' && (
            <span className={`badge position-${encounter.position}`}>
              {encounter.position === 'edge' ? 'Edge' : 'Exposed'}
            </span>
          )}
        </span>
      </header>
      {twist && (
        <p className="muted small">
          Possible twist: {twist.what}.{' '}
          {twist.chance === null ? 'Odds unknown.' : `${formatPercent(twist.chance)} chance.`}
        </p>
      )}
      <ol className="encounter-log" aria-live="polite">
        {visible.map((entry, i) => (
          <li key={i} className={`tone-${entry.tone}`}>
            {entry.roll && i === rollIndex && i > seen.baseline && (
              <DiceRoll roll={entry.roll} highStakes={entry.highStakes} onDone={() => setShownRoll(i)} />
            )}
            {!(animating && i === rollIndex) && <span>{entry.text}</span>}
          </li>
        ))}
      </ol>
      {animating ? null : encounter.stage === null ? (
        <div>
          <p className="muted">The encounter is over.</p>
          <button className="primary" onClick={() => onAction({ type: 'closeEncounter' })}>
            Close
          </button>
        </div>
      ) : (
        <div className="options">
          {encounterOptions(state, actorIds).map((option) => (
            <OptionCard
              key={`${encounter.stage}/${option.id}`}
              option={option}
              twistWhat={twist?.what ?? null}
              actorId={actorIds[option.id] ?? ''}
              onActor={(id) => setActorIds({ ...actorIds, [option.id]: id })}
              onChoose={() =>
                onAction({ type: 'chooseOption', optionId: option.id, actorId: actorIds[option.id] || undefined })
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
```

Append to `src/ui/theme.css` (this also covers the dice from Task 16 and the deck from Task 18):

```css
.side { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
.badge { display: inline-block; font-size: 0.7rem; padding: 0.05rem 0.45rem; border-radius: 999px; border: 1px solid var(--line); margin-left: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em; }
.source-original { background: color-mix(in srgb, var(--accent) 18%, transparent); }
.source-imported { background: color-mix(in srgb, var(--good) 18%, transparent); }
.source-imported-private { background: color-mix(in srgb, var(--bad) 18%, transparent); }
.source-procedural { background: color-mix(in srgb, var(--tier-partial) 25%, transparent); }
.source-claude { background: color-mix(in srgb, var(--crit) 22%, transparent); }
.position-edge { border-color: var(--good); color: var(--good); }
.position-exposed { border-color: var(--bad); color: var(--bad); }
.deck h3 { margin: 0.8rem 0 0.3rem; }
.deck-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; max-height: 40vh; overflow: auto; }
.deck-list li { display: flex; align-items: center; gap: 0.5rem; justify-content: space-between; }
.deck-list button { padding: 0.1rem 0.6rem; }
label.inline { flex-direction: row; align-items: center; color: var(--ink); }
.encounter-log { list-style: none; padding: 0; margin: 0 0 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
.options { display: grid; gap: 0.75rem; }
.option-card { border: 1px solid var(--line); border-radius: 4px; padding: 0.6rem 0.75rem; }
.outcomes { list-style: none; padding: 0; margin: 0.4rem 0 0.6rem; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.9rem; }
.outcomes li { border-left: 3px solid var(--line); padding-left: 0.5rem; }
.outcomes li.tier-critFail { border-color: var(--tier-critFail); }
.outcomes li.tier-fail { border-color: var(--tier-fail); }
.outcomes li.tier-partial { border-color: var(--tier-partial); }
.outcomes li.tier-success { border-color: var(--tier-success); }
.outcomes li.tier-critSuccess { border-color: var(--tier-critSuccess); }
.twist { color: var(--bad); }
.chip { display: inline-block; font-size: 0.75rem; padding: 0 0.4rem; margin-left: 0.3rem; border-radius: 3px; background: color-mix(in srgb, var(--line) 45%, transparent); }
.dice-roll { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 0.3rem; background: none; border: none; padding: 0; }
.d20 { stroke: var(--line); stroke-width: 1.5; fill: none; margin-right: 0.3rem; }
.d20 text { stroke: none; fill: var(--ink); font-size: 11px; font-weight: bold; }
.d20.settled { stroke: var(--ink); }
.d20.kept { stroke: var(--accent); stroke-width: 2.5; }
.d20.glow { filter: drop-shadow(0 0 6px var(--crit)); stroke: var(--crit); }
.dc-track { position: relative; display: block; width: 12rem; height: 1.1rem; border-bottom: 1px solid var(--line); }
.dc-line { position: absolute; top: 0; bottom: 0; border-left: 2px solid var(--bad); font-size: 0.7rem; padding-left: 0.2rem; }
.dc-total { position: absolute; bottom: -4px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: var(--accent); }
@media (prefers-reduced-motion: reduce) { .d20.glow { filter: none; } }
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/ui
git commit -m "add the encounter view with option cards, odds and outcome tiers"
```

---

### Task 18: The Encounter Deck and App wiring

The deck is a dev panel:
- It lists every situation and template, grouped by source and filterable by source checkboxes.
- Each row has a source badge, flags (wonder, follow-up, twist) and a ⚠ count of validator and lint issues.
- **Play** starts any situation, and **Random draw** respects the filter. Due follow-ups still come first, whatever the filter.

The centre column shows the encounter while one is active, and the practice check otherwise.

**Files:**
- Create: `src/ui/deck/EncounterDeck.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/App.test.tsx`

**Step 1: Write the failing tests.** In `src/ui/App.test.tsx`, import `within` from `@testing-library/react` too, then append:

```tsx

test('the Encounter Deck plays any situation, and the encounter shows its source', async () => {
  render(<App />)
  const deck = within(screen.getByRole('region', { name: 'Encounter Deck' }))
  await userEvent.click(deck.getByRole('button', { name: 'Play The flooded ferry' }))
  const encounter = within(screen.getByRole('region', { name: 'Encounter' }))
  expect(encounter.getByRole('heading', { name: 'The flooded ferry' })).toBeTruthy()
  expect(encounter.getByText('Claude')).toBeTruthy()
  await userEvent.click(encounter.getByRole('button', { name: "Choose Pay Ilse's price" }))
  expect(encounter.getByText('The encounter is over.')).toBeTruthy()
  await userEvent.click(encounter.getByRole('button', { name: 'Close' }))
  expect(screen.getByRole('region', { name: 'Practice check' })).toBeTruthy()
})

test('random draw honours the source filter', async () => {
  render(<App />)
  const deck = within(screen.getByRole('region', { name: 'Encounter Deck' }))
  for (const label of ['Original', 'SRD', 'Private', 'Claude']) {
    await userEvent.click(deck.getByRole('checkbox', { name: new RegExp(`^${label} \\(`) }))
  }
  await userEvent.click(deck.getByRole('button', { name: 'Random draw' }))
  expect(within(screen.getByRole('region', { name: 'Encounter' })).getByText('Procedural')).toBeTruthy()
})

test('an encounter in progress survives a reload', async () => {
  const { unmount } = render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Play The singing stones' }))
  unmount()
  render(<App />)
  expect(screen.getByRole('heading', { name: 'The singing stones' })).toBeTruthy()
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/ui/App.test.tsx`. Expected: the three new tests FAIL, because there is no "Encounter Deck" region.

**Step 3: Implement**

`src/ui/deck/EncounterDeck.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { Content } from '../../content/build'
import { allSituations } from '../../engine/encounters/compile'
import { contentIssues } from '../../engine/encounters/validate'
import type { Action } from '../../engine/state'
import { SOURCES, type Source } from '../../schema/common'
import type { GameState } from '../../schema/state'
import { SOURCE_LABELS, SourceBadge } from '../SourceBadge'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/** Dev panel: every situation by source, playable on demand, plus a filtered random draw. */
export function EncounterDeck({ content, state, onAction }: Props) {
  const situations = useMemo(() => allSituations(content), [content])
  const issues = useMemo(() => contentIssues(content), [content])
  const [sources, setSources] = useState<Source[]>([...SOURCES])
  const toggle = (source: Source) =>
    setSources(sources.includes(source) ? sources.filter((s) => s !== source) : [...sources, source])

  return (
    <section className="panel deck" aria-label="Encounter Deck">
      <h2>Encounter Deck</h2>
      <div className="controls">
        {SOURCES.map((source) => (
          <label key={source} className="inline">
            <input type="checkbox" checked={sources.includes(source)} onChange={() => toggle(source)} />{' '}
            {SOURCE_LABELS[source]} ({situations.filter((s) => s.source === source).length})
          </label>
        ))}
      </div>
      <button
        className="primary"
        disabled={sources.length === 0}
        onClick={() => onAction({ type: 'drawEncounter', sources })}
      >
        Random draw
      </button>
      {state.followUps.length > 0 && (
        <p className="muted small">
          Queued follow-ups: {state.followUps.map((f) => `${f.situationId} (after ${f.wait})`).join(', ')}
        </p>
      )}
      {SOURCES.filter((source) => sources.includes(source)).map((source) => {
        const group = situations.filter((s) => s.source === source)
        if (group.length === 0) return null
        return (
          <div key={source}>
            <h3>
              <SourceBadge source={source} />
            </h3>
            <ul className="deck-list">
              {group.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.title}
                    {s.wonder && <span className="muted small"> · wonder</span>}
                    {s.followUpOnly && <span className="muted small"> · follow-up</span>}
                    {s.twist && <span className="muted small"> · twist</span>}
                  </span>
                  {issues[s.id] && (
                    <span className="tone-bad small" title={issues[s.id].join('\n')}>
                      ⚠ {issues[s.id].length}
                    </span>
                  )}
                  <button
                    onClick={() => onAction({ type: 'startEncounter', situationId: s.id })}
                    aria-label={`Play ${s.title}`}
                  >
                    Play
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
```

Replace `src/ui/App.tsx`:

```tsx
import { loadBundledContent } from '../content/bundled'
import { CheckPanel } from './CheckPanel'
import { EncounterDeck } from './deck/EncounterDeck'
import { EncounterView } from './encounter/EncounterView'
import { LogPanel } from './LogPanel'
import { PartyPanel } from './PartyPanel'
import { useGame } from './useGame'

const content = loadBundledContent()

export function App() {
  const { state, dispatch, restart } = useGame(content)
  return (
    <div className="app">
      <header className="topbar">
        <h1>Forgotten Heroes</h1>
        <span>Day {state.day}</span>
        <span>{state.gold} gp</span>
        <span title="Gained from natural 20s; spend for rerolls (coming soon)">✦ {state.inspiration} inspiration</span>
        <span className="spacer" />
        <span className="muted small">seed {state.seed}</span>
        <button onClick={restart}>New party</button>
      </header>
      <main className="layout">
        <PartyPanel party={state.party} />
        {state.encounter ? (
          <EncounterView state={state} onAction={dispatch} />
        ) : (
          <CheckPanel state={state} onAction={dispatch} />
        )}
        <div className="side">
          <EncounterDeck content={content} state={state} onAction={dispatch} />
          <LogPanel log={state.log} />
        </div>
      </main>
    </div>
  )
}
```

**Step 4: Run the tests, then check by hand**

Run: `pnpm test && pnpm typecheck && pnpm build`. Expected: all pass, and the build succeeds.

Run `pnpm dev`, open the printed URL, and confirm:
- The deck lists situations under Original, SRD (none: creatures aren't situations), Procedural and Claude, with counts. With Task 15 done, it also lists Private.
- **Play** on "The flooded ferry" shows the stage text, a Claude badge, and four option cards. "Ford the river upstream" shows an odds bar and five tiers.
- Choosing the ford rolls a slow, glowing die with a DC line. A click skips it.
- With the OS set to reduce motion, the dice appear at once.
- "Pilgrims at dusk", then **Watch them over the fire**: on a success the twist line shows a percentage.
- **Random draw** with only Procedural checked plays a template with filled slots, e.g. "A weary dwarf tinker waves you down…".
- Reloading the page mid-encounter keeps the encounter, without replaying the last roll's animation.

**Step 5: Commit**

```bash
git add src/ui
git commit -m "add the Encounter Deck dev panel and show encounters in the app"
```

---

### Task 19: Documentation and final verification

**Files:**
- Modify: `docs/plans/2026-11-12-rebuild-design.md`, `CLAUDE.md`

**Step 1: Record the encounter format in the design.** In `docs/plans/2026-11-12-rebuild-design.md`, add this subsection at the end of §7, after "### Resolution":

```markdown
### Encounter format (Plan 2)

- **Situations** are small stage graphs. Each option is either a graded check (`{ skill, ability?, dc }`, with an outcome per tier) or a fixed choice (requirements and effects, no roll). An outcome may `goto` a stage or `stay`; otherwise the encounter ends. Missing critical tiers fall back to fail and success.
- **Effects** are declarative: gold, HP (actor, all or random), exhaustion, inspiration, days, position, follow-up, reveal twist, and log. Goods arrive in Plan 4.
- **Position:** a check rolls with advantage from Edge or disadvantage from Exposed, then the position resets unless the outcome sets it again.
- **Twists** are rolled secretly at the start. Outcomes may carry a twist branch. The player always sees what the twist would be; Insight reveals its odds.
- **Archetypes** are option sets with a relative DC (`"dc+2"`) and a reward multiplier for gold. **Templates** are archetypes dressed with parts-table slots. **Slots** are filled at the start; `{actor}` names whoever rolled.
- **Saves** store a compiled snapshot of the active situation, so editing content never breaks a save.
- **High-stakes rolls** (slow, glowing dice) are flagged by content, or are close calls (25–75%) where an outcome costs HP.
- **Skill uses** from encounter checks are recorded for Strain (Plan 3).
- Every bundled situation is tested for playability (reachable stages, valid gotos, slots, archetypes, follow-ups) and the quality rules (at least 2 options per regular stage; wonders cost nothing).
```

**Step 2: Point to the encounter tools in `CLAUDE.md`.** Under "Content rules", after the **Skills** bullet, add:

```markdown
- **Encounters** live in `situations.json` files in any source, plus `archetypes`, `situationTemplates`, `partsTables` and `creatures`. `pnpm test` checks every situation for playability and the quality rules. The Encounter Deck (right column) plays any situation and shows a ⚠ count for broken ones.
```

**Step 3: Full verification**

Run: `pnpm test`. Expected: all tests pass.
Run: `pnpm typecheck`. Expected: no errors.
Run: `pnpm build`. Expected: build succeeds.
Run: `pnpm schemas && git status --short data/_schema`. Expected: no changes (the schemas are current).
Run: `git status --short`. Expected: only the doc changes. `data/imported-private/` must not appear.

**Step 4: Commit**

```bash
git add docs/plans/2026-11-12-rebuild-design.md CLAUDE.md
git commit -m "document the encounter format"
```

---

## Design decisions to confirm with the user

These were not settled by the design doc; the plan picks one answer for each.

1. **`{actor}` means the member who rolled**, filled when the option resolves rather than at encounter start. It only works in check outcomes. The NPC is `{who}`, from the parts tables.
2. **What the twist would be is always visible.** The twist branches show in the outcome previews, so the player knows a trick is possible ("they are bait for an ambush"); Insight reveals only the chance. Hiding it entirely would hide outcome tiers, which breaks the "show every outcome" rule.
3. **Effects with no actor.** HP and exhaustion effects in fixed options must target `all` or `random`, because no one rolled. Gold never drops below 0, HP is clamped to 0..max, and exhaustion to 0..6. Encounters end when no one can act, but they don't kill: run end is Plan 5.
4. **Follow-ups.** `after: N` means N other encounters happen first. A due follow-up always comes first in a random draw, even if the Deck's source filter excludes its source. "Play" in the Deck neither consumes nor advances the queue.
5. **Archetype parameters:** `dc` (relative DCs such as `"dc+2"`) and `reward`, which multiplies every gold amount, costs and gold requirements included. Creature CR doesn't change the DC yet.
6. **Combat checks** (`combat: true`) never grant Inspiration on a natural 20 (design §3 says non-combat). Every other encounter check does, as practice checks already do.
7. **Skill uses** are recorded per encounter check (not practice rolls) and kept for 7 days, ready for Strain in Plan 3.
8. **Port liberties** (all listed in each entry's `notes`):
   - DCs were chosen to approximate the prototype's prose odds.
   - Goods and items became HP healing or `log` lines.
   - Two exits were added: "Back off" from the fishermen's brawl, and retreating from the goblins.
   - "Inflammable" became "fireproof".
   - Encounter outcomes never kill, even where the prototype said "lose some party members".
9. **Archetypes are Claude-written** (`data/claude/archetypes.json`). The design named their options, but the numbers and texts are Claude's. Move the file to `original/` if you want to own it.
10. **Wonders** may grant Inspiration (`lantern-moths` does). The lint only forbids costs.
