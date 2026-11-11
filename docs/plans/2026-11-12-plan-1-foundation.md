# Plan 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Svelte prototype with a React + TypeScript project built around a pure, seeded game engine. Content is loaded from provenance-split JSON in `data/`. The plan ends with a small playable screen: a generated party and a practice skill check showing exact odds.

**Architecture:**
- **Engine** (`src/engine/`): pure functions over a serialisable `GameState`, with the RNG state stored inside it.
- **Schemas** (`src/schema/`): zod schemas that define every data shape and generate JSON Schema for hand-editing.
- **Content** (`src/content/`): validates and merges the JSON files under `data/<source>/`.
- **UI** (`src/ui/`): renders state and dispatches actions.

**Tech stack:** pnpm, Vite, React 19, TypeScript (strict), zod 4, Vitest (jsdom + Testing Library for UI), tsx for scripts.

**Context docs:** [rebuild design](2026-11-12-rebuild-design.md). The old code is preserved at tag `v0.1.0-svelte-final`; read it with `git show v0.1.0-svelte-final:<path>`.

**Conventions:**
- Prettier style from `.prettierrc.cjs`: no semicolons, single quotes, width 100.
- Schema constants end in `Schema`; inferred types use the plain name.
- No functions inside data.
- Commit after every task. Never push; the user pushes.

---

### Task 1: Replace the Svelte scaffold with React + Vite + Vitest

**Files:**
- Delete: `src/`, `svelte.config.js`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `yarn.lock`, `public/`
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/smoke.test.ts`
- Modify: `.gitignore`, `pnpm-workspace.yaml`, `.vscode/extensions.json`

**Step 1: Remove the prototype files** (they are preserved in the tag)

```bash
git rm -r -q src svelte.config.js tsconfig.node.json vite.config.ts index.html yarn.lock public
rm -rf node_modules
```

**Step 2: Write `package.json`**

```json
{
  "name": "forgotten-heroes",
  "private": true,
  "version": "0.2.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "schemas": "tsx scripts/gen-schemas.ts",
    "sync-assets": "tsx scripts/sync-assets.ts"
  }
}
```

**Step 3: Install dependencies**

```bash
pnpm add react react-dom zod
pnpm add -D vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event @types/react @types/react-dom @types/node tsx
```

If `tsc` from the newest TypeScript major fails on valid code (for example with unsupported options), pin the previous major with `pnpm add -D typescript@^5` and note it in the commit message.

**Step 4: Write `pnpm-workspace.yaml`** (this replaces the placeholder values)

```yaml
allowBuilds:
  esbuild: true
```

**Step 5: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "scripts", "vite.config.ts"]
}
```

**Step 6: Write `vite.config.ts`**

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
})
```

**Step 7: Write `index.html` and `src/main.tsx`**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Forgotten Heroes</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx` (temporary; Task 11 replaces it):

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1>Forgotten Heroes</h1>
  </StrictMode>
)
```

**Step 8: Write the smoke test `src/smoke.test.ts`**

```ts
import { expect, test } from 'vitest'

test('test runner works', () => {
  expect(1 + 1).toBe(2)
})
```

**Step 9: Update `.gitignore`.** Append:

```gitignore

# Assets copied from ~/dnd5e (see assets.manifest.txt). The portrait pack is already tracked (CC BY 3.0) and is not in ~/dnd5e.
/assets/*
!/assets/Terrible Character Portraits/

# Copyrighted imports for personal use only
/data/imported-private/
```

**Step 10: Replace `.vscode/extensions.json`**

```json
{
  "recommendations": ["vitest.explorer"]
}
```

**Step 11: Verify**

Run: `pnpm test`. Expected: 1 passed.
Run: `pnpm build`. Expected: exits 0 and writes `dist/`.
Run: `git status --short assets | head`. Expected: no portrait files listed as deleted.

**Step 12: Commit**

```bash
git add -A
git commit -m "replace Svelte scaffold with React + Vite + Vitest"
```

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/engine/rng.ts`
- Test: `src/engine/rng.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest'
import { createRng, nextFloat, nextInt, pick, withRng } from './rng'

describe('rng', () => {
  test('same seed gives the same sequence', () => {
    const a = withRng(createRng(42), (d) => [d.float(), d.float(), d.float()])
    const b = withRng(createRng(42), (d) => [d.float(), d.float(), d.float()])
    expect(a).toEqual(b)
  })

  test('different seeds diverge', () => {
    const [a] = nextFloat(createRng(1))
    const [b] = nextFloat(createRng(2))
    expect(a).not.toBe(b)
  })

  test('does not mutate the input state', () => {
    const rng = createRng(7)
    nextFloat(rng)
    expect(rng).toEqual(createRng(7))
  })

  test('nextInt covers the inclusive range and nothing else', () => {
    const [values] = withRng(createRng(3), (d) => Array.from({ length: 5000 }, () => d.int(1, 20)))
    expect(Math.min(...values)).toBe(1)
    expect(Math.max(...values)).toBe(20)
    expect(new Set(values).size).toBe(20)
  })

  test('nextInt threads state', () => {
    const [first, rng] = nextInt(createRng(9), 1, 1000)
    const [second] = nextInt(rng, 1, 1000)
    const [again] = nextInt(createRng(9), 1, 1000)
    expect(first).toBe(again)
    expect(second).not.toBeUndefined()
  })

  test('pick throws on an empty list', () => {
    expect(() => pick(createRng(1), [])).toThrow(/empty/)
  })

  test('weighted never picks zero-weight items', () => {
    const items = [
      { id: 'never', w: 0 },
      { id: 'always', w: 5 },
    ]
    const [picks] = withRng(createRng(5), (d) =>
      Array.from({ length: 500 }, () => d.weighted(items, (i) => i.w).id)
    )
    expect(new Set(picks)).toEqual(new Set(['always']))
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/engine/rng.test.ts`. Expected: FAIL, because `./rng` cannot be resolved.

**Step 3: Implement `src/engine/rng.ts`**

```ts
// Mulberry32: a small, fast, seedable PRNG. Its whole state is one uint32, so it serialises trivially.
export type Rng = { readonly state: number }

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 }
}

export function nextFloat(rng: Rng): [number, Rng] {
  const state = (rng.state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, { state }]
}

export interface Draw {
  float(): number
  /** Integer in [min, max], inclusive on both ends. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  weighted<T>(items: readonly T[], weight: (item: T) => number): T
}

/**
 * Run several draws with a local cursor and get the advanced RNG back.
 * The mutation stays inside this call, so callers remain pure.
 */
export function withRng<T>(rng: Rng, fn: (draw: Draw) => T): [T, Rng] {
  let current = rng
  const float = () => {
    const [value, next] = nextFloat(current)
    current = next
    return value
  }
  const int = (min: number, max: number) => min + Math.floor(float() * (max - min + 1))
  const pickOne = <U>(items: readonly U[]): U => {
    if (items.length === 0) throw new Error('cannot pick from an empty list')
    return items[int(0, items.length - 1)]
  }
  const weighted = <U>(items: readonly U[], weight: (item: U) => number): U => {
    const positive = items.filter((item) => weight(item) > 0)
    if (positive.length === 0) throw new Error('cannot pick from an empty or zero-weight list')
    const total = positive.reduce((sum, item) => sum + weight(item), 0)
    let remaining = float() * total
    for (const item of positive) {
      remaining -= weight(item)
      if (remaining < 0) return item
    }
    return positive[positive.length - 1]
  }
  const result = fn({ float, int, pick: pickOne, weighted })
  return [result, current]
}

export const nextInt = (rng: Rng, min: number, max: number) => withRng(rng, (d) => d.int(min, max))

export const pick = <T>(rng: Rng, items: readonly T[]) => withRng(rng, (d) => d.pick(items))
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/engine/rng.test.ts`. Expected: 7 passed.

**Step 5: Commit**

```bash
git add src/engine/rng.ts src/engine/rng.test.ts
git commit -m "add seeded, serialisable RNG"
```

---

### Task 3: Abilities, skills and formatting

**Files:**
- Create: `src/engine/rules/abilities.ts`, `src/engine/format.ts`
- Test: `src/engine/rules/abilities.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest'
import { formatModifier, formatPercent } from '../format'
import { abilityModifier, abilityOf, isSkill, proficiencyBonus, statLabel } from './abilities'

describe('abilities', () => {
  test.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [16, 3],
    [18, 4],
    [20, 5],
  ])('score %i has modifier %i', (score, mod) => {
    expect(abilityModifier(score)).toBe(mod)
  })

  test.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [20, 6],
  ])('level %i has proficiency +%i', (level, bonus) => {
    expect(proficiencyBonus(level)).toBe(bonus)
  })

  test('skills map to abilities; abilities map to themselves', () => {
    expect(abilityOf('persuasion')).toBe('cha')
    expect(abilityOf('sleightOfHand')).toBe('dex')
    expect(abilityOf('con')).toBe('con')
    expect(isSkill('stealth')).toBe(true)
    expect(isSkill('str')).toBe(false)
  })

  test('labels', () => {
    expect(statLabel('sleightOfHand')).toBe('Sleight of Hand')
    expect(statLabel('wis')).toBe('WIS')
  })

  test('formatting', () => {
    expect(formatModifier(3)).toBe('+3')
    expect(formatModifier(0)).toBe('+0')
    expect(formatModifier(-2)).toBe('−2')
    expect(formatPercent(0.4999)).toBe('50%')
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/engine/rules/abilities.test.ts`. Expected: FAIL, module not found.

**Step 3: Implement**

`src/engine/rules/abilities.ts`:

```ts
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof ABILITIES)[number]

export const SKILLS = [
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
] as const
export type Skill = (typeof SKILLS)[number]

/** A check can test a skill or a raw ability (e.g. a CON check to endure a forced march). */
export type CheckStat = Skill | Ability

export const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
}

const SKILL_LABELS: Record<Skill, string> = {
  acrobatics: 'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
}

export const isSkill = (stat: CheckStat): stat is Skill => stat in SKILL_ABILITY

export const abilityOf = (stat: CheckStat): Ability => (isSkill(stat) ? SKILL_ABILITY[stat] : stat)

export const statLabel = (stat: CheckStat): string =>
  isSkill(stat) ? SKILL_LABELS[stat] : stat.toUpperCase()

export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2)

export const proficiencyBonus = (level: number): number => 2 + Math.floor((level - 1) / 4)
```

`src/engine/format.ts`:

```ts
export const formatModifier = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

export const formatPercent = (p: number): string => `${Math.round(p * 100)}%`
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/engine/rules/abilities.test.ts`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/engine
git commit -m "add 5e abilities, skills, and modifier formatting"
```

---

### Task 4: Graded checks with exact odds

Tiers (tunable constants):
- A natural 1 is a **critical failure**.
- A natural 20 is a **critical success**, which grants Inspiration.
- Otherwise, total ≥ DC is a **success**.
- Total ≥ DC − 3 is a **partial success**.
- Anything lower is a **failure**.

Edge is advantage and Exposed is disadvantage.

**Files:**
- Create: `src/engine/rules/checks.ts`
- Test: `src/engine/rules/checks.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest'
import { createRng, withRng } from '../rng'
import { TIERS, rollCheck, successChance, tierFor, tierOdds } from './checks'

const sum = (odds: Record<string, number>) => Object.values(odds).reduce((a, b) => a + b, 0)

describe('tierFor', () => {
  test('natural 1 and 20 override the total', () => {
    expect(tierFor(1, 30, 10)).toBe('critFail')
    expect(tierFor(20, 5, 30)).toBe('critSuccess')
  })
  test('success, partial and fail bands', () => {
    expect(tierFor(11, 11, 11)).toBe('success')
    expect(tierFor(8, 8, 11)).toBe('partial')
    expect(tierFor(7, 7, 11)).toBe('fail')
  })
})

describe('tierOdds', () => {
  test('modifier +0 vs DC 11, normal roll', () => {
    const odds = tierOdds(0, 11, 'normal')
    expect(odds.critFail).toBeCloseTo(1 / 20)
    expect(odds.fail).toBeCloseTo(6 / 20) // d20 2..7
    expect(odds.partial).toBeCloseTo(3 / 20) // d20 8..10
    expect(odds.success).toBeCloseTo(9 / 20) // d20 11..19
    expect(odds.critSuccess).toBeCloseTo(1 / 20)
    expect(successChance(odds)).toBeCloseTo(0.5)
  })

  test('an out-of-reach DC still leaves the natural 20', () => {
    const odds = tierOdds(5, 25, 'normal')
    expect(odds.success).toBe(0)
    expect(odds.critSuccess).toBeCloseTo(1 / 20)
    expect(odds.partial).toBeCloseTo(3 / 20) // totals 22..24
  })

  test('advantage and disadvantage crit rates', () => {
    expect(tierOdds(0, 11, 'advantage').critSuccess).toBeCloseTo(39 / 400)
    expect(tierOdds(0, 11, 'advantage').critFail).toBeCloseTo(1 / 400)
    expect(tierOdds(0, 11, 'disadvantage').critFail).toBeCloseTo(39 / 400)
  })

  test.each(['normal', 'advantage', 'disadvantage'] as const)('%s odds sum to 1', (mode) => {
    for (const dc of [5, 10, 15, 20, 25]) expect(sum(tierOdds(3, dc, mode))).toBeCloseTo(1)
  })
})

describe('rollCheck', () => {
  test('result is consistent with tierFor', () => {
    const [results] = withRng(createRng(11), () => null)
    expect(results).toBeNull()
    let rng = createRng(11)
    for (let i = 0; i < 200; i++) {
      const [roll, next] = rollCheck(rng, 2, 13, 'advantage')
      expect(roll.dice).toHaveLength(2)
      expect(roll.kept).toBe(Math.max(...roll.dice))
      expect(roll.total).toBe(roll.kept + 2)
      expect(roll.tier).toBe(tierFor(roll.kept, roll.total, 13))
      rng = next
    }
  })

  test('empirical frequencies match exact odds', () => {
    const counts = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<string, number>
    let rng = createRng(2024)
    const n = 20000
    for (let i = 0; i < n; i++) {
      const [roll, next] = rollCheck(rng, 0, 11, 'normal')
      counts[roll.tier]++
      rng = next
    }
    const exact = tierOdds(0, 11, 'normal')
    for (const t of TIERS) expect(Math.abs(counts[t] / n - exact[t])).toBeLessThan(0.015)
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/engine/rules/checks.test.ts`. Expected: FAIL, module not found.

**Step 3: Implement `src/engine/rules/checks.ts`**

```ts
import { withRng, type Rng } from '../rng'

export const TIERS = ['critFail', 'fail', 'partial', 'success', 'critSuccess'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_LABELS: Record<Tier, string> = {
  critFail: 'Critical failure',
  fail: 'Failure',
  partial: 'Partial success',
  success: 'Success',
  critSuccess: 'Critical success',
}

/** Edge = advantage, Exposed = disadvantage. Advantage is earned, never free (see design §3). */
export type RollMode = 'normal' | 'advantage' | 'disadvantage'

/** Totals this far below the DC still count as a partial success. */
export const PARTIAL_MARGIN = 3

export function tierFor(d20: number, total: number, dc: number): Tier {
  if (d20 === 20) return 'critSuccess'
  if (d20 === 1) return 'critFail'
  if (total >= dc) return 'success'
  if (total >= dc - PARTIAL_MARGIN) return 'partial'
  return 'fail'
}

const emptyOdds = (): Record<Tier, number> => ({
  critFail: 0,
  fail: 0,
  partial: 0,
  success: 0,
  critSuccess: 0,
})

/** Exact tier probabilities by enumerating every die outcome (20 or 400 cases). */
export function tierOdds(modifier: number, dc: number, mode: RollMode = 'normal'): Record<Tier, number> {
  const odds = emptyOdds()
  if (mode === 'normal') {
    for (let d = 1; d <= 20; d++) odds[tierFor(d, d + modifier, dc)] += 1 / 20
    return odds
  }
  for (let a = 1; a <= 20; a++) {
    for (let b = 1; b <= 20; b++) {
      const kept = mode === 'advantage' ? Math.max(a, b) : Math.min(a, b)
      odds[tierFor(kept, kept + modifier, dc)] += 1 / 400
    }
  }
  return odds
}

export const successChance = (odds: Record<Tier, number>): number => odds.success + odds.critSuccess

export type RollOutcome = {
  dice: number[]
  kept: number
  modifier: number
  total: number
  dc: number
  mode: RollMode
  tier: Tier
}

export function rollCheck(
  rng: Rng,
  modifier: number,
  dc: number,
  mode: RollMode = 'normal'
): [RollOutcome, Rng] {
  return withRng(rng, (d) => {
    const dice = mode === 'normal' ? [d.int(1, 20)] : [d.int(1, 20), d.int(1, 20)]
    const kept =
      mode === 'advantage' ? Math.max(...dice) : mode === 'disadvantage' ? Math.min(...dice) : dice[0]
    const total = kept + modifier
    return { dice, kept, modifier, total, dc, mode, tier: tierFor(kept, total, dc) }
  })
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/engine/rules/checks.test.ts`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/engine/rules
git commit -m "add graded d20 checks with exact tier odds"
```

---

### Task 5: Content schemas and the content loader

Each data file is an envelope: `{ "$schema", "kind", "source", "notes"?, "entries": [...] }`. Its `source` must match its folder (`data/original/`, `data/claude/` and so on). Ids are kebab-case and unique across all sources.

**Files:**
- Create: `src/schema/common.ts`, `src/schema/content.ts`, `src/content/build.ts`
- Test: `src/content/build.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest'
import { buildContent } from './build'

const fighter = {
  id: 'fighter',
  name: 'Fighter',
  hitDie: 10,
  baseAbilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 },
  skillProficiencies: ['athletics'],
}
const classesFile = (source: string, entries: unknown[] = [fighter]) => ({
  kind: 'classes',
  source,
  entries,
})

describe('buildContent', () => {
  test('loads valid entries and tags them with source and file', () => {
    const { content, errors } = buildContent({ '../../data/original/classes.json': classesFile('original') })
    expect(errors).toEqual([])
    expect(content.classes.fighter).toMatchObject({
      name: 'Fighter',
      source: 'original',
      file: '../../data/original/classes.json',
    })
  })

  test('rejects unknown kinds', () => {
    const { errors } = buildContent({ 'data/original/x.json': { kind: 'spaceships', source: 'original', entries: [] } })
    expect(errors[0].message).toMatch(/unknown kind/)
  })

  test('rejects schema violations with a readable message', () => {
    const bad = { ...fighter, hitDie: 7 }
    const { errors } = buildContent({ 'data/original/classes.json': classesFile('original', [bad]) })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/hitDie/)
  })

  test('source must match the folder', () => {
    const { errors } = buildContent({ 'data/claude/classes.json': classesFile('original') })
    expect(errors[0].message).toMatch(/does not match folder/)
  })

  test('duplicate ids across files are errors', () => {
    const { errors } = buildContent({
      'data/original/classes.json': classesFile('original'),
      'data/claude/classes.json': classesFile('claude'),
    })
    expect(errors[0].message).toMatch(/duplicate classes id "fighter"/)
  })

  test('files outside data/<source>/ are errors; _schema is skipped', () => {
    const { errors } = buildContent({
      'elsewhere/classes.json': classesFile('original'),
      'data/_schema/classes.schema.json': { anything: true },
    })
    expect(errors).toHaveLength(1)
    expect(errors[0].file).toBe('elsewhere/classes.json')
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/content/build.test.ts`. Expected: FAIL, module not found.

**Step 3: Implement**

`src/schema/common.ts`:

```ts
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
```

`src/schema/content.ts`:

```ts
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
    .array(z.number().int().min(0).max(20))
    .length(6)
    .describe(
      'Per settlement size tier (smallest first): the service exists if 1d20 exceeds this value (then a further 90% chance). From the prototype.'
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
```

`src/content/build.ts`:

```ts
import { z } from 'zod'
import type { Source } from '../schema/common'
import { CONTENT_KINDS, contentFileSchema, type ContentEntry, type ContentKind } from '../schema/content'

export type Sourced<T> = T & { source: Source; file: string }
export type Content = { [K in ContentKind]: Record<string, Sourced<ContentEntry<K>>> }
export type ContentError = { file: string; message: string }

export const emptyContent = (): Content => ({
  classes: {},
  ancestries: {},
  names: {},
  settlementTypes: {},
  services: {},
})

const isKind = (kind: unknown): kind is ContentKind => typeof kind === 'string' && kind in CONTENT_KINDS

const FOLDER = /(?:^|\/)data\/([^/]+)\//

/** Pure: validates and merges JSON files keyed by path. Never throws; collects errors. */
export function buildContent(files: Record<string, unknown>): { content: Content; errors: ContentError[] } {
  const content = emptyContent()
  const errors: ContentError[] = []
  const sorted = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))

  for (const [file, json] of sorted) {
    const folder = FOLDER.exec(file)?.[1]
    if (!folder) {
      errors.push({ file, message: 'data files must live in data/<source>/' })
      continue
    }
    if (folder === '_schema') continue

    const kind = (json as { kind?: unknown } | null)?.kind
    if (!isKind(kind)) {
      const expected = Object.keys(CONTENT_KINDS).join(', ')
      errors.push({ file, message: `unknown kind ${JSON.stringify(kind)}; expected one of: ${expected}` })
      continue
    }

    const parsed = contentFileSchema(kind).safeParse(json)
    if (!parsed.success) {
      errors.push({ file, message: z.prettifyError(parsed.error) })
      continue
    }
    if (parsed.data.source !== folder) {
      errors.push({ file, message: `source "${parsed.data.source}" does not match folder data/${folder}/` })
      continue
    }

    const table = content[kind] as Record<string, Sourced<{ id: string }>>
    for (const entry of parsed.data.entries as { id: string }[]) {
      const existing = table[entry.id]
      if (existing) {
        errors.push({ file, message: `duplicate ${kind} id "${entry.id}" (already in ${existing.file})` })
        continue
      }
      table[entry.id] = { ...entry, source: parsed.data.source, file }
    }
  }
  return { content, errors }
}

/** Entries sorted by id, for deterministic iteration (and so deterministic RNG use). */
export const sortedEntries = <T extends { id: string }>(table: Record<string, T>): T[] =>
  Object.values(table).sort((a, b) => a.id.localeCompare(b.id))
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/content/build.test.ts`. Expected: 6 passed.

**Step 5: Commit**

```bash
git add src/schema src/content
git commit -m "add content schemas and provenance-aware content loader"
```

---

### Task 6: Port the original data and add Claude-authored classes

**Files:**
- Create: `data/original/classes.json`, `data/original/ancestries.json`, `data/original/settlement-types.json`, `data/original/services.json`, `data/claude/classes.json`, `data/imported/.gitkeep`, `data/procedural/.gitkeep`
- Create: `scripts/port/port-names.ts` (a one-off kept for provenance); it generates `data/original/names.json`

**Step 1: Write `data/original/classes.json`** (stat spreads from the prototype's `character-utils.ts`, with `vit` renamed to `con`)

```json
{
  "$schema": "../_schema/classes.schema.json",
  "kind": "classes",
  "source": "original",
  "notes": "Stat spreads and hit dice from the prototype (vit renamed to con). Skill proficiencies were added during the rebuild port.",
  "entries": [
    { "id": "fighter", "name": "Fighter", "hitDie": 10, "baseAbilities": { "str": 16, "dex": 10, "con": 14, "int": 10, "wis": 12, "cha": 8 }, "skillProficiencies": ["athletics", "intimidation", "survival"] },
    { "id": "cleric", "name": "Cleric", "hitDie": 8, "baseAbilities": { "str": 14, "dex": 8, "con": 12, "int": 10, "wis": 10, "cha": 16 }, "skillProficiencies": ["medicine", "religion", "persuasion"] },
    { "id": "rogue", "name": "Rogue", "hitDie": 8, "baseAbilities": { "str": 10, "dex": 16, "con": 10, "int": 8, "wis": 14, "cha": 12 }, "skillProficiencies": ["stealth", "sleightOfHand", "deception", "perception"] },
    { "id": "wizard", "name": "Wizard", "hitDie": 6, "baseAbilities": { "str": 8, "dex": 12, "con": 10, "int": 16, "wis": 14, "cha": 10 }, "skillProficiencies": ["arcana", "history", "investigation"] }
  ]
}
```

**Step 2: Write `data/claude/classes.json`** (the prototype listed these classes but had no stat spreads for them; each spread sums to 70 like the originals)

```json
{
  "$schema": "../_schema/classes.schema.json",
  "kind": "classes",
  "source": "claude",
  "notes": "Spreads for classes the prototype listed without stats. Each sums to 70, matching the original spreads.",
  "entries": [
    { "id": "bard", "name": "Bard", "hitDie": 8, "baseAbilities": { "str": 8, "dex": 14, "con": 12, "int": 10, "wis": 10, "cha": 16 }, "skillProficiencies": ["persuasion", "performance", "insight"] },
    { "id": "ranger", "name": "Ranger", "hitDie": 10, "baseAbilities": { "str": 12, "dex": 16, "con": 12, "int": 8, "wis": 14, "cha": 8 }, "skillProficiencies": ["survival", "nature", "perception"] },
    { "id": "paladin", "name": "Paladin", "hitDie": 10, "baseAbilities": { "str": 16, "dex": 8, "con": 14, "int": 8, "wis": 10, "cha": 14 }, "skillProficiencies": ["athletics", "religion", "insight"] }
  ]
}
```

**Step 3: Write `data/original/ancestries.json`**

```json
{
  "$schema": "../_schema/ancestries.schema.json",
  "kind": "ancestries",
  "source": "original",
  "notes": "The prototype's Race type. Undead and drake were NPC-only.",
  "entries": [
    { "id": "human", "name": "Human", "playable": true },
    { "id": "elf", "name": "Elf", "playable": true },
    { "id": "half-elf", "name": "Half-elf", "playable": true },
    { "id": "dwarf", "name": "Dwarf", "playable": true },
    { "id": "orc", "name": "Orc", "playable": true },
    { "id": "goblin", "name": "Goblin", "playable": true },
    { "id": "undead", "name": "Undead", "playable": false },
    { "id": "drake", "name": "Drake", "playable": false }
  ]
}
```

**Step 4: Write `data/original/settlement-types.json`** (from `settlementTypeData`; the world-map placement radii are dropped because Altaeus fixes the geography)

```json
{
  "$schema": "../_schema/settlementTypes.schema.json",
  "kind": "settlementTypes",
  "source": "original",
  "notes": "From the prototype's settlementTypeData. worldMapType/worldMapRadiuses dropped (fixed Altaeus geography); see tag v0.1.0-svelte-final.",
  "entries": [
    { "id": "military-camp", "name": "Military camp", "category": "military", "minPopulation": 5, "maxPopulation": 20, "maxServices": 2, "ratio": 0.5, "hostileChance": 0.15, "predominantAncestry": "human" },
    { "id": "caravan", "name": "Caravan", "category": "traders", "minPopulation": 2, "maxPopulation": 20, "maxServices": 2, "ratio": 0.5, "hostileChance": 0.05, "predominantAncestry": "human" },
    { "id": "cottage", "name": "Cottage", "category": "lifeplace", "minPopulation": 1, "maxPopulation": 10, "maxServices": 1, "ratio": 3, "hostileChance": 0.15, "predominantAncestry": "human" },
    { "id": "large-encampment", "name": "Large encampment", "category": "military", "minPopulation": 50, "maxPopulation": 100, "maxServices": 3, "ratio": 1, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "hamlet", "name": "Hamlet", "category": "lifeplace", "minPopulation": 50, "maxPopulation": 150, "maxServices": 4, "ratio": 2.5, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "work-crew", "name": "Work crew", "category": "traders", "minPopulation": 50, "maxPopulation": 200, "maxServices": 3, "ratio": 1, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "stationed-garrison", "name": "Stationed garrison", "category": "military", "minPopulation": 100, "maxPopulation": 300, "maxServices": 3, "ratio": 1, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "fort", "name": "Fort", "category": "military", "minPopulation": 200, "maxPopulation": 400, "maxServices": 4, "ratio": 0.75, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "village", "name": "Village", "category": "lifeplace", "minPopulation": 300, "maxPopulation": 1200, "maxServices": 6, "ratio": 2, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "encamped-army", "name": "Encamped Army", "category": "military", "minPopulation": 1000, "maxPopulation": 3000, "maxServices": 5, "ratio": 0.25, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "refugee-encampment", "name": "Refugee encampment", "category": "lifeplace", "minPopulation": 300, "maxPopulation": 5000, "maxServices": 6, "ratio": 0.15, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "town", "name": "Town", "category": "lifeplace", "minPopulation": 1000, "maxPopulation": 6000, "maxServices": 8, "ratio": 1, "hostileChance": 0.1, "predominantAncestry": "human" },
    { "id": "city", "name": "City", "category": "lifeplace", "minPopulation": 4000, "maxPopulation": 15000, "maxServices": 10, "ratio": 0.5, "hostileChance": 0.04, "predominantAncestry": "human" },
    { "id": "capital", "name": "Capital", "category": "lifeplace", "minPopulation": 12000, "maxPopulation": 50000, "maxServices": 12, "ratio": 0.1, "hostileChance": 0.04, "predominantAncestry": "human" }
  ]
}
```

**Step 5: Write `data/original/services.json`** (merges the prototype's `settlementServicesBySize` with `settlementServiceMetadata`)

```json
{
  "$schema": "../_schema/services.schema.json",
  "kind": "services",
  "source": "original",
  "notes": "From settlementServicesBySize + settlementServiceMetadata in the prototype. 'Port (if coastal)' became 'Port'; coastal gating will be a world rule.",
  "entries": [
    { "id": "inn-tavern", "name": "Inn / Tavern", "presenceThresholdBySize": [10, 8, 6, 4, 2, 1], "itemSaleTags": ["drink", "food", "inn-service"], "typicalRarity": 0.1, "maxRarity": 0.5 },
    { "id": "adventuring-supplies", "name": "Adventuring Supplies", "presenceThresholdBySize": [17, 14, 10, 5, 2, 1], "itemSaleTags": ["general-supplies", "food", "clothing"], "typicalRarity": 0.15, "maxRarity": 0.5 },
    { "id": "animals-mounts", "name": "Animals and Mounts", "presenceThresholdBySize": [12, 11, 9, 7, 5, 3], "itemSaleTags": ["mount"], "typicalRarity": 0.3, "maxRarity": 1 },
    { "id": "books-maps", "name": "Books and Maps", "presenceThresholdBySize": [18, 17, 15, 13, 11, 9], "itemSaleTags": ["magical-supplies"], "typicalRarity": 0.15, "maxRarity": 1 },
    { "id": "jewelry-trader", "name": "Jewelry trader", "presenceThresholdBySize": [20, 19, 18, 16, 14, 12], "itemSaleTags": ["trinket", "jewel"], "typicalRarity": 0.25, "maxRarity": 0.75 },
    { "id": "armourer", "name": "Armourer", "presenceThresholdBySize": [18, 16, 14, 12, 10, 8], "itemSaleTags": ["armor", "clothing"], "typicalRarity": 0.25, "maxRarity": 0.85 },
    { "id": "bank", "name": "Bank", "presenceThresholdBySize": [17, 15, 13, 10, 8, 6], "itemSaleTags": ["bank-service"], "typicalRarity": 0.25, "maxRarity": 1 },
    { "id": "finesmith", "name": "Finesmith", "presenceThresholdBySize": [18, 17, 15, 13, 11, 9], "itemSaleTags": ["trinket", "accessory"], "typicalRarity": 0.5, "maxRarity": 1 },
    { "id": "tailor", "name": "Tailor", "presenceThresholdBySize": [15, 13, 11, 10, 8, 6], "itemSaleTags": ["clothing"], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "potions-poisons-herbs", "name": "Potions, poisons, herbs", "presenceThresholdBySize": [18, 17, 16, 14, 12, 10], "itemSaleTags": ["potion"], "typicalRarity": 0.3, "maxRarity": 1 },
    { "id": "church", "name": "Church", "presenceThresholdBySize": [16, 14, 12, 10, 8, 6], "itemSaleTags": ["holy-service", "holy-symbol"], "typicalRarity": 0.4, "maxRarity": 0.8 },
    { "id": "food-drink", "name": "Food & drink", "presenceThresholdBySize": [14, 12, 10, 8, 6, 4], "itemSaleTags": [], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "high-temple", "name": "High Temple", "presenceThresholdBySize": [18, 16, 14, 12, 10, 8], "itemSaleTags": ["holy-service"], "typicalRarity": 0.6, "maxRarity": 1 },
    { "id": "spell-tomes-scrolls", "name": "Spell tomes and scrolls", "presenceThresholdBySize": [20, 19, 17, 15, 13, 11], "itemSaleTags": ["magical-supplies"], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "thieving-supplies", "name": "Thieving supplies", "presenceThresholdBySize": [19, 18, 16, 14, 12, 10], "itemSaleTags": ["general-supplies"], "typicalRarity": 0.6, "maxRarity": 1 },
    { "id": "weapons-shop", "name": "Weapons Shop", "presenceThresholdBySize": [17, 15, 13, 11, 9, 7], "itemSaleTags": ["weapon"], "typicalRarity": 0.25, "maxRarity": 0.85 },
    { "id": "vehicles-transportation", "name": "Vehicles and transportation", "presenceThresholdBySize": [15, 12, 13, 10, 8, 6], "itemSaleTags": ["transport-service"], "typicalRarity": 0.2, "maxRarity": 0.5 },
    { "id": "adventurers-guild", "name": "Adventurer's Guild", "presenceThresholdBySize": [19, 18, 16, 14, 12, 10], "itemSaleTags": ["general-supplies", "clothing", "weapon", "armor", "magical-supplies"], "typicalRarity": 0.2, "maxRarity": 0.4 },
    { "id": "magic-items", "name": "Magic Items", "presenceThresholdBySize": [20, 20, 19, 16, 15, 14], "itemSaleTags": ["weapon", "armor", "accessory", "consumable"], "typicalRarity": 0.8, "maxRarity": 1 },
    { "id": "blacksmith", "name": "Blacksmith", "presenceThresholdBySize": [12, 10, 8, 6, 4, 2], "itemSaleTags": ["weapon", "armor", "trinket"], "typicalRarity": 0.3, "maxRarity": 0.6 },
    { "id": "necromancer", "name": "Necromancer", "presenceThresholdBySize": [20, 19, 18, 17, 16, 16], "itemSaleTags": ["holy-service", "jewel"], "typicalRarity": 1, "maxRarity": 1 },
    { "id": "couriers", "name": "Couriers", "presenceThresholdBySize": [19, 18, 17, 15, 13, 11], "itemSaleTags": ["transport-service"], "typicalRarity": 0.05, "maxRarity": 0.1 },
    { "id": "brothel", "name": "Brothel", "presenceThresholdBySize": [17, 15, 13, 11, 9, 7], "itemSaleTags": ["massage-service"], "typicalRarity": 0.2, "maxRarity": 0.75 },
    { "id": "land-sales", "name": "Land Sales", "presenceThresholdBySize": [16, 15, 13, 10, 8, 6], "itemSaleTags": ["real-estate-service"], "typicalRarity": 0.4, "maxRarity": 1 },
    { "id": "carpenter", "name": "Carpenter", "presenceThresholdBySize": [15, 13, 10, 8, 6, 4], "itemSaleTags": [], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "entertainers-guild", "name": "Entertainer's Guild", "presenceThresholdBySize": [20, 18, 16, 13, 11, 9], "itemSaleTags": ["massage-service"], "typicalRarity": 0.15, "maxRarity": 0.5 },
    { "id": "healer", "name": "Healer", "presenceThresholdBySize": [18, 15, 12, 10, 7, 4], "itemSaleTags": ["potion", "holy-service"], "typicalRarity": 0.3, "maxRarity": 0.5 },
    { "id": "port", "name": "Port", "presenceThresholdBySize": [19, 18, 16, 14, 12, 10], "itemSaleTags": ["transport-service"], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "workers-union", "name": "Worker's Union", "presenceThresholdBySize": [19, 18, 16, 11, 9, 7], "itemSaleTags": [], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "stonemason", "name": "Stonemason", "presenceThresholdBySize": [18, 15, 12, 10, 7, 4], "itemSaleTags": [], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "university", "name": "University", "presenceThresholdBySize": [20, 20, 18, 16, 14, 12], "itemSaleTags": [], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "mercenaries", "name": "Mercenaries", "presenceThresholdBySize": [19, 18, 17, 16, 14, 12], "itemSaleTags": [], "typicalRarity": 0.25, "maxRarity": 0.5 },
    { "id": "arena", "name": "Arena", "presenceThresholdBySize": [19, 18, 16, 12, 10, 8], "itemSaleTags": ["arena-service"], "typicalRarity": 0.4, "maxRarity": 1 }
  ]
}
```

Note: the prototype had thresholds above 20 for Magic Items (25, 22) and University (22), which made the service impossible at those sizes. They are clamped to 20 here; say so in the commit message.

**Step 6: Write and run the names port script `scripts/port/port-names.ts`**

```ts
// One-off port of the prototype's English human names into data/original/names.json.
// Kept for provenance. Run: pnpm tsx scripts/port/port-names.ts
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const source = execFileSync(
  'git',
  ['show', 'v0.1.0-svelte-final:src/lib/generators/human-names-english.ts'],
  { encoding: 'utf8' }
)
const lists = new Map(
  [...source.matchAll(/var (nm\d+) = (\[[^\]]*\]);/g)].map((m) => [m[1], JSON.parse(m[2]) as string[]])
)
const givenKeys = ['nm1', 'nm2', 'nm3', 'nm4', 'nm5', 'nm6', 'nm7', 'nm8', 'nm9', 'nm10']
const given = [...new Set(givenKeys.flatMap((k) => lists.get(k) ?? []))].sort()
const family = [...new Set(lists.get('nm11') ?? [])].sort()
if (given.length === 0 || family.length === 0) throw new Error('name lists not found in the tagged source')

const file = {
  $schema: '../_schema/names.schema.json',
  kind: 'names',
  source: 'original',
  notes: 'Ported from src/lib/generators/human-names-english.ts at tag v0.1.0-svelte-final.',
  entries: [{ id: 'human-english', ancestries: ['human', 'half-elf'], given, family }],
}
writeFileSync('data/original/names.json', JSON.stringify(file, null, 2) + '\n')
console.log(`wrote ${given.length} given and ${family.length} family names`)
```

Run: `pnpm tsx scripts/port/port-names.ts`. Expected: `wrote <n> given and <m> family names`, with both counts in the hundreds.

**Step 7: Create placeholder folders**

```bash
mkdir -p data/imported data/procedural
touch data/imported/.gitkeep data/procedural/.gitkeep
```

**Step 8: Commit**

```bash
git add data scripts/port
git commit -m "port original classes, ancestries, settlements, services and names to JSON

Service presence thresholds above 20 (magic items, university) are clamped to 20."
```

---

### Task 7: Bundled content and generated JSON Schemas

**Files:**
- Create: `src/content/bundled.ts`, `scripts/gen-schemas.ts`, `data/_schema/*.schema.json` (generated)
- Test: `src/content/bundled.test.ts`, `scripts/gen-schemas.test.ts`

**Step 1: Write the failing tests**

`src/content/bundled.test.ts`:

```ts
import { expect, test } from 'vitest'
import { buildContent } from './build'
import { bundledFiles, loadBundledContent } from './bundled'

test('every data file is valid', () => {
  const { errors } = buildContent(bundledFiles)
  expect(errors).toEqual([])
})

test('core content is present from several sources', () => {
  const content = loadBundledContent()
  expect(content.classes.fighter.source).toBe('original')
  expect(content.classes.bard.source).toBe('claude')
  expect(Object.keys(content.services)).toContain('inn-tavern')
  expect(content.names['human-english'].given.length).toBeGreaterThan(100)
})
```

`scripts/gen-schemas.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { SCHEMA_DIR, renderSchema, schemaKinds } from './gen-schemas'

test.each(schemaKinds)('data/_schema/%s.schema.json is up to date (run pnpm schemas)', (kind) => {
  expect(readFileSync(`${SCHEMA_DIR}${kind}.schema.json`, 'utf8')).toBe(renderSchema(kind))
})
```

**Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/content/bundled.test.ts scripts/gen-schemas.test.ts`. Expected: FAIL, modules not found.

**Step 3: Implement**

`src/content/bundled.ts`:

```ts
import { buildContent, type Content } from './build'

/** Every JSON file under data/, keyed by path. Private imports are included when present locally. */
export const bundledFiles: Record<string, unknown> = import.meta.glob(
  ['../../data/**/*.json', '!../../data/_schema/**'],
  { eager: true, import: 'default' }
)

export function loadBundledContent(): Content {
  const { content, errors } = buildContent(bundledFiles)
  if (errors.length > 0) {
    throw new Error('Invalid content:\n' + errors.map((e) => `- ${e.file}: ${e.message}`).join('\n'))
  }
  return content
}
```

`scripts/gen-schemas.ts`:

```ts
// Generates JSON Schemas from the zod content schemas, for editor autocompletion.
// Run: pnpm schemas
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { CONTENT_KINDS, contentFileSchema, type ContentKind } from '../src/schema/content'

export const SCHEMA_DIR = fileURLToPath(new URL('../data/_schema/', import.meta.url))
export const schemaKinds = Object.keys(CONTENT_KINDS) as ContentKind[]

export function renderSchema(kind: ContentKind): string {
  // io: 'input' keeps fields with defaults optional for people editing by hand.
  return JSON.stringify(z.toJSONSchema(contentFileSchema(kind), { io: 'input' }), null, 2) + '\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(SCHEMA_DIR, { recursive: true })
  for (const kind of schemaKinds) writeFileSync(`${SCHEMA_DIR}${kind}.schema.json`, renderSchema(kind))
  console.log(`wrote ${schemaKinds.length} schemas to data/_schema/`)
}
```

**Step 4: Generate the schemas**

Run: `pnpm schemas`. Expected: `wrote 5 schemas to data/_schema/`.

**Step 5: Run the tests to verify they pass**

Run: `pnpm test`. Expected: all pass.

**Step 6: Manual check.** Open `data/original/classes.json` in VS Code and type an invalid `hitDie` such as `7`. The editor should underline it. Revert the change.

**Step 7: Commit**

```bash
git add src/content scripts data/_schema
git commit -m "load bundled content and generate JSON Schemas for data files"
```

---

### Task 8: Character schema, modifiers and actor selection

**Files:**
- Create: `src/schema/state.ts` (the character part only; Task 10 extends it), `src/engine/rules/character.ts`, `src/engine/test-fixtures.ts`
- Test: `src/engine/rules/character.test.ts`

**Step 1: Write `src/schema/state.ts`** (character part)

```ts
import { z } from 'zod'
import { AbilityScoresSchema, IdSchema, SkillSchema } from './common'

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
```

**Step 2: Write `src/engine/test-fixtures.ts`** (keeps engine tests independent of hand-edited data)

```ts
import { buildContent, type Content } from '../content/build'
import type { Character } from '../schema/state'

export function fixtureContent(): Content {
  const { content, errors } = buildContent({
    'data/original/classes.json': {
      kind: 'classes',
      source: 'original',
      entries: [
        { id: 'fighter', name: 'Fighter', hitDie: 10, baseAbilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 }, skillProficiencies: ['athletics', 'intimidation'] },
        { id: 'bard', name: 'Bard', hitDie: 8, baseAbilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 }, skillProficiencies: ['persuasion', 'performance'] },
      ],
    },
    'data/original/ancestries.json': {
      kind: 'ancestries',
      source: 'original',
      entries: [
        { id: 'human', name: 'Human', playable: true },
        { id: 'dwarf', name: 'Dwarf', playable: true },
        { id: 'drake', name: 'Drake', playable: false },
      ],
    },
    'data/original/names.json': {
      kind: 'names',
      source: 'original',
      entries: [{ id: 'test-names', ancestries: ['human'], given: ['Ada', 'Bram'], family: ['Stone'] }],
    },
  })
  if (errors.length > 0) throw new Error(JSON.stringify(errors, null, 2))
  return content
}

export function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c-test',
    name: 'Test Hero',
    ancestry: 'human',
    classId: 'fighter',
    level: 1,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    skillProficiencies: [],
    hitDie: 10,
    hp: 10,
    maxHp: 10,
    exhaustion: 0,
    ...overrides,
  }
}
```

**Step 3: Write the failing test `src/engine/rules/character.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { makeCharacter } from '../test-fixtures'
import { canAct, chooseActor, rankActors, statModifier } from './character'

const bard = makeCharacter({
  id: 'bard',
  abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
  skillProficiencies: ['persuasion'],
})
const fighter = makeCharacter({
  id: 'fighter',
  abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 8 },
  skillProficiencies: ['athletics', 'intimidation'],
})

describe('statModifier', () => {
  test('ability modifier plus proficiency when proficient', () => {
    expect(statModifier(bard, 'persuasion')).toBe(5) // +3 CHA, +2 proficiency
    expect(statModifier(fighter, 'persuasion')).toBe(-1)
    expect(statModifier(fighter, 'str')).toBe(3) // raw ability: no proficiency
  })
  test('each exhaustion level costs 2', () => {
    expect(statModifier({ ...bard, exhaustion: 2 }, 'persuasion')).toBe(1)
  })
})

describe('actor selection', () => {
  test('the best-suited member acts', () => {
    expect(chooseActor([fighter, bard], 'persuasion')?.characterId).toBe('bard')
    expect(chooseActor([fighter, bard], 'intimidation')?.characterId).toBe('fighter')
  })
  test('conditions can change who is best', () => {
    const tired = { ...bard, exhaustion: 4 }
    expect(chooseActor([fighter, tired], 'persuasion')?.characterId).toBe('fighter')
  })
  test('downed members cannot act', () => {
    const downed = { ...bard, hp: 0 }
    expect(canAct(downed)).toBe(false)
    expect(rankActors([fighter, downed], 'persuasion').map((r) => r.characterId)).toEqual(['fighter'])
  })
  test('ties go to the higher raw ability score, then party order', () => {
    const a = makeCharacter({ id: 'a', abilities: { ...bard.abilities, cha: 16 }, skillProficiencies: [] })
    const b = makeCharacter({ id: 'b', abilities: { ...bard.abilities, cha: 17 }, skillProficiencies: [] })
    expect(chooseActor([a, b], 'persuasion')?.characterId).toBe('b') // both +3
    expect(chooseActor([a, { ...a, id: 'a2' }], 'persuasion')?.characterId).toBe('a')
  })
  test('the player can override the choice', () => {
    expect(chooseActor([fighter, bard], 'persuasion', 'fighter')?.characterId).toBe('fighter')
  })
  test('an override pointing at a downed member falls back to the best', () => {
    const downed = { ...fighter, hp: 0 }
    expect(chooseActor([downed, bard], 'persuasion', 'fighter')?.characterId).toBe('bard')
  })
  test('nobody able to act gives null', () => {
    expect(chooseActor([{ ...bard, hp: 0 }], 'persuasion')).toBeNull()
  })
})
```

**Step 4: Run it to verify it fails**

Run: `pnpm vitest run src/engine/rules/character.test.ts`. Expected: FAIL, module not found.

**Step 5: Implement `src/engine/rules/character.ts`**

```ts
import type { Character } from '../../schema/state'
import { abilityModifier, abilityOf, isSkill, proficiencyBonus, type CheckStat } from './abilities'

/** 2024 rules: each exhaustion level is −2 to d20 tests. Level 6 is death. */
export const EXHAUSTION_PENALTY = 2

export function statModifier(character: Character, stat: CheckStat): number {
  const ability = abilityModifier(character.abilities[abilityOf(stat)])
  const proficient = isSkill(stat) && character.skillProficiencies.includes(stat)
  const proficiency = proficient ? proficiencyBonus(character.level) : 0
  return ability + proficiency - EXHAUSTION_PENALTY * character.exhaustion
}

export const canAct = (character: Character): boolean => character.hp > 0 && character.exhaustion < 6

export type ActorRank = { characterId: string; modifier: number }

export function rankActors(party: readonly Character[], stat: CheckStat): ActorRank[] {
  return party
    .map((character, order) => ({ character, order, modifier: statModifier(character, stat) }))
    .filter(({ character }) => canAct(character))
    .sort(
      (a, b) =>
        b.modifier - a.modifier ||
        b.character.abilities[abilityOf(stat)] - a.character.abilities[abilityOf(stat)] ||
        a.order - b.order
    )
    .map(({ character, modifier }) => ({ characterId: character.id, modifier }))
}

export function chooseActor(
  party: readonly Character[],
  stat: CheckStat,
  overrideId?: string
): ActorRank | null {
  const ranks = rankActors(party, stat)
  return ranks.find((r) => r.characterId === overrideId) ?? ranks[0] ?? null
}
```

**Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/engine/rules/character.test.ts`. Expected: all pass.

**Step 7: Commit**

```bash
git add src/schema/state.ts src/engine
git commit -m "add character modifiers and best-suited actor selection"
```

---

### Task 9: Character and party generation

**Files:**
- Create: `src/engine/party.ts`
- Test: `src/engine/party.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest'
import { CharacterSchema } from '../schema/state'
import { generateCharacter, generateParty } from './party'
import { createRng } from './rng'
import { fixtureContent } from './test-fixtures'

const content = fixtureContent()

describe('generation', () => {
  test('is deterministic for a seed', () => {
    expect(generateCharacter(createRng(1), content)).toEqual(generateCharacter(createRng(1), content))
  })

  test('produces schema-valid characters from content', () => {
    const [c] = generateCharacter(createRng(5), content, { classId: 'bard' })
    expect(CharacterSchema.parse(c)).toEqual(c)
    expect(c.classId).toBe('bard')
    expect(c.skillProficiencies).toEqual(['persuasion', 'performance'])
    expect(c.hp).toBe(c.maxHp)
    expect(c.name).toMatch(/^(Ada|Bram) Stone$/)
  })

  test('adds exactly 3 random ability points on top of the class spread', () => {
    const [c] = generateCharacter(createRng(8), content, { classId: 'fighter' })
    const total = Object.values(c.abilities).reduce((a, b) => a + b, 0)
    expect(total).toBe(70 + 3)
  })

  test('uses the prototype HP formula: hitDie×2 + (CON−10)×2', () => {
    const [c] = generateCharacter(createRng(13), content, { classId: 'fighter' })
    expect(c.maxHp).toBe(10 * 2 + (c.abilities.con - 10) * 2)
  })

  test('only playable ancestries', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(generateCharacter(createRng(seed), content)[0].ancestry).not.toBe('drake')
    }
  })

  test('party members get distinct classes while classes remain', () => {
    const [party] = generateParty(createRng(3), content, 2)
    expect(party).toHaveLength(2)
    expect(new Set(party.map((c) => c.classId)).size).toBe(2)
    expect(new Set(party.map((c) => c.id)).size).toBe(2)
  })

  test('larger parties than class count reuse classes', () => {
    const [party] = generateParty(createRng(3), content, 4)
    expect(party).toHaveLength(4)
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/engine/party.test.ts`. Expected: FAIL, module not found.

**Step 3: Implement `src/engine/party.ts`**

```ts
import { sortedEntries, type Content } from '../content/build'
import type { Character } from '../schema/state'
import { withRng, type Rng } from './rng'
import { ABILITIES } from './rules/abilities'

export type GenerateOptions = { classId?: string; ancestryId?: string }

export function generateCharacter(rng: Rng, content: Content, options: GenerateOptions = {}): [Character, Rng] {
  return withRng(rng, (d) => {
    const cls = options.classId ? content.classes[options.classId] : d.pick(sortedEntries(content.classes))
    if (!cls) throw new Error(`unknown class ${options.classId}`)
    const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
    const ancestry = options.ancestryId ? content.ancestries[options.ancestryId] : d.pick(playable)
    if (!ancestry) throw new Error(`unknown ancestry ${options.ancestryId}`)

    const abilities = { ...cls.baseAbilities }
    for (let i = 0; i < 3; i++) abilities[d.pick(ABILITIES)] += 1

    const tables = sortedEntries(content.names)
    const matching = tables.filter((t) => t.ancestries.includes(ancestry.id))
    const names = d.pick(matching.length > 0 ? matching : tables)
    const given = d.pick(names.given)
    const name = names.family.length > 0 ? `${given} ${d.pick(names.family)}` : given

    // Ported from the prototype: generous starting HP, since there is no full combat yet.
    const maxHp = Math.max(1, cls.hitDie * 2 + (abilities.con - 10) * 2)

    return {
      id: `c-${d.int(0, 36 ** 6 - 1).toString(36)}`,
      name,
      ancestry: ancestry.id,
      classId: cls.id,
      level: 1,
      abilities,
      skillProficiencies: [...cls.skillProficiencies],
      hitDie: cls.hitDie,
      hp: maxHp,
      maxHp,
      exhaustion: 0,
    }
  })
}

export function generateParty(rng: Rng, content: Content, size: number): [Character[], Rng] {
  const classIds = sortedEntries(content.classes).map((c) => c.id)
  const party: Character[] = []
  let current = rng
  for (let i = 0; i < size; i++) {
    const used = new Set(party.map((c) => c.classId))
    const available = classIds.filter((id) => !used.has(id))
    const [classId, afterPick] = withRng(current, (d) => d.pick(available.length > 0 ? available : classIds))
    const [character, afterGen] = generateCharacter(afterPick, content, { classId })
    party.push(character)
    current = afterGen
  }
  return [party, current]
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/engine/party.test.ts`. Expected: all pass.

**Step 5: Commit**

```bash
git add src/engine/party.ts src/engine/party.test.ts
git commit -m "add deterministic character and party generation"
```

---

### Task 10: GameState, step(), check preview and save/load

**Files:**
- Modify: `src/schema/state.ts` (append)
- Create: `src/engine/state.ts`, `src/engine/save.ts`
- Test: `src/engine/state.test.ts`, `src/engine/save.test.ts`

**Step 1: Append to `src/schema/state.ts`**

```ts
import { SKILLS, ABILITIES } from '../engine/rules/abilities'
import { TIERS } from '../engine/rules/checks'

export const CheckStatSchema = z.enum([...SKILLS, ...ABILITIES])

export const RollRecordSchema = z.object({
  stat: CheckStatSchema,
  actorId: z.string(),
  dice: z.array(z.number().int().min(1).max(20)),
  kept: z.number().int(),
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
  tone: z.enum(['info', 'good', 'bad', 'crit']),
})
export type LogEntry = z.infer<typeof LogEntrySchema>

export const GameStateSchema = z.object({
  version: z.literal(1),
  seed: z.number().int(),
  rng: z.object({ state: z.number().int() }),
  day: z.number().int().min(1),
  party: z.array(CharacterSchema),
  gold: z.number().int(),
  inspiration: z.number().int().min(0),
  log: z.array(LogEntrySchema),
  lastRoll: RollRecordSchema.nullable(),
})
export type GameState = z.infer<typeof GameStateSchema>
```

(Move the new imports to the top of the file next to the existing ones.)

**Step 2: Write the failing tests**

`src/engine/state.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { GameStateSchema, type GameState } from '../schema/state'
import { newGame, previewCheck, step } from './state'
import { fixtureContent, makeCharacter } from './test-fixtures'

const content = fixtureContent()

describe('newGame', () => {
  test('is deterministic and schema-valid', () => {
    const a = newGame(99, content)
    expect(newGame(99, content)).toEqual(a)
    expect(GameStateSchema.parse(a)).toEqual(a)
    expect(a.party).toHaveLength(2)
    expect(a.log.length).toBeGreaterThan(0)
  })
})

describe('practiceCheck', () => {
  const base = (): GameState => ({
    ...newGame(1, content),
    party: [
      makeCharacter({ id: 'bard', name: 'Lyra', abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 }, skillProficiencies: ['persuasion'] }),
      makeCharacter({ id: 'fighter', name: 'Brom' }),
    ],
  })

  test('rolls with the best actor, advances rng, logs, and does not mutate input', () => {
    const before = base()
    const snapshot = structuredClone(before)
    const after = step(before, { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' })
    expect(before).toEqual(snapshot)
    expect(after.rng).not.toEqual(before.rng)
    expect(after.lastRoll?.actorId).toBe('bard')
    expect(after.lastRoll?.modifier).toBe(5)
    expect(after.log.length).toBe(before.log.length + 1)
    expect(after.log.at(-1)?.text).toMatch(/^Lyra rolls Persuasion/)
  })

  test('natural 20s grant inspiration', () => {
    let state = base()
    let crits = 0
    for (let i = 0; i < 400; i++) {
      state = step(state, { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' })
      if (state.lastRoll?.tier === 'critSuccess') crits++
    }
    expect(crits).toBeGreaterThan(0)
    expect(state.inspiration).toBe(crits)
  })

  test('nobody able to act logs and changes nothing else', () => {
    const state = { ...base(), party: base().party.map((c) => ({ ...c, hp: 0 })) }
    const after = step(state, { type: 'practiceCheck', stat: 'persuasion', dc: 12, mode: 'normal' })
    expect(after.rng).toEqual(state.rng)
    expect(after.log.at(-1)?.tone).toBe('bad')
  })
})

describe('previewCheck', () => {
  test('shows actor, modifier and exact odds', () => {
    const state = newGame(4, content)
    const preview = previewCheck(state, 'athletics', 10, 'normal')
    expect(preview).not.toBeNull()
    const total = Object.values(preview!.odds).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1)
  })
})
```

`src/engine/save.test.ts`:

```ts
import { expect, test } from 'vitest'
import { deserialize, serialize } from './save'
import { newGame } from './state'
import { fixtureContent } from './test-fixtures'

test('round trip', () => {
  const state = newGame(5, fixtureContent())
  expect(deserialize(serialize(state))).toEqual(state)
})

test('garbage and wrong versions load as null', () => {
  expect(deserialize('not json')).toBeNull()
  expect(deserialize(JSON.stringify({ version: 999 }))).toBeNull()
})
```

**Step 3: Run them to verify they fail**

Run: `pnpm vitest run src/engine/state.test.ts src/engine/save.test.ts`. Expected: FAIL, modules not found.

**Step 4: Implement**

`src/engine/state.ts`:

```ts
import type { Content } from '../content/build'
import type { GameState, LogEntry } from '../schema/state'
import { formatModifier } from './format'
import { generateParty } from './party'
import { createRng } from './rng'
import { statLabel, type CheckStat } from './rules/abilities'
import { chooseActor } from './rules/character'
import { TIER_LABELS, rollCheck, tierOdds, type RollMode, type Tier } from './rules/checks'

export const STARTING_PARTY_SIZE = 2
export const STARTING_GOLD = 50
const LOG_LIMIT = 200

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
    version: 1,
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
      const [roll, rng] = rollCheck(state.rng, actor.modifier, action.dc, action.mode)
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

export type CheckPreview = {
  actorId: string
  actorName: string
  modifier: number
  odds: Record<Tier, number>
}

export function previewCheck(
  state: GameState,
  stat: CheckStat,
  dc: number,
  mode: RollMode,
  actorId?: string
): CheckPreview | null {
  const actor = chooseActor(state.party, stat, actorId)
  if (!actor) return null
  const actorName = state.party.find((c) => c.id === actor.characterId)?.name ?? '?'
  return { actorId: actor.characterId, actorName, modifier: actor.modifier, odds: tierOdds(actor.modifier, dc, mode) }
}
```

`src/engine/save.ts`:

```ts
import { GameStateSchema, type GameState } from '../schema/state'

export const SAVE_KEY = 'forgotten-heroes/save/v1'

export const serialize = (state: GameState): string => JSON.stringify(state)

export function deserialize(text: string): GameState | null {
  try {
    const parsed = GameStateSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
```

**Step 5: Run the tests to verify they pass**

Run: `pnpm test`. Expected: all pass.

**Step 6: Commit**

```bash
git add src/schema src/engine
git commit -m "add GameState, step(), check preview and save/load"
```

---

### Task 11: UI shell (party, practice check with odds, log)

**Files:**
- Create: `src/ui/theme.css`, `src/ui/App.tsx`, `src/ui/useGame.ts`, `src/ui/PartyPanel.tsx`, `src/ui/CheckPanel.tsx`, `src/ui/OddsBar.tsx`, `src/ui/LogPanel.tsx`
- Modify: `src/main.tsx`
- Test: `src/ui/App.test.tsx`
- Delete: `src/smoke.test.ts`

**Step 1: Write the failing test `src/ui/App.test.tsx`**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { App } from './App'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

test('shows the party and logs a practice roll', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Forgotten Heroes' })).toBeTruthy()
  expect(screen.getAllByRole('article').length).toBe(2) // two party cards
  const log = screen.getByRole('list', { name: 'Log' })
  const before = log.querySelectorAll('li').length
  await userEvent.click(screen.getByRole('button', { name: 'Roll' }))
  expect(log.querySelectorAll('li').length).toBe(before + 1)
})

test('the game survives a reload via localStorage', async () => {
  const { unmount } = render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'Roll' }))
  const names = screen.getAllByRole('article').map((a) => a.querySelector('strong')?.textContent)
  unmount()
  render(<App />)
  expect(screen.getAllByRole('article').map((a) => a.querySelector('strong')?.textContent)).toEqual(names)
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/ui/App.test.tsx`. Expected: FAIL, `./App` not found.

**Step 3: Implement**

`src/ui/useGame.ts`:

```ts
import { useEffect, useReducer } from 'react'
import type { Content } from '../content/build'
import { SAVE_KEY, deserialize, serialize } from '../engine/save'
import { newGame, step, type Action } from '../engine/state'
import type { GameState } from '../schema/state'

type UiAction = Action | { type: 'replace'; state: GameState }

const reducer = (state: GameState, action: UiAction): GameState =>
  action.type === 'replace' ? action.state : step(state, action)

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32)

function loadSaved(): GameState | null {
  try {
    const text = localStorage.getItem(SAVE_KEY)
    return text ? deserialize(text) : null
  } catch {
    return null // storage blocked or unavailable
  }
}

export function useGame(content: Content) {
  const [state, dispatch] = useReducer(reducer, null, () => loadSaved() ?? newGame(randomSeed(), content))
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, serialize(state))
    } catch {
      // storage blocked or unavailable: the game still works, it just won't persist
    }
  }, [state])
  const restart = () => dispatch({ type: 'replace', state: newGame(randomSeed(), content) })
  return { state, dispatch, restart }
}
```

`src/ui/OddsBar.tsx`:

```tsx
import { formatPercent } from '../engine/format'
import { TIERS, TIER_LABELS, type Tier } from '../engine/rules/checks'

export function OddsBar({ odds }: { odds: Record<Tier, number> }) {
  return (
    <div className="odds-bar" role="img" aria-label={TIERS.map((t) => `${TIER_LABELS[t]} ${formatPercent(odds[t])}`).join(', ')}>
      {TIERS.filter((t) => odds[t] > 0).map((t) => (
        <span key={t} className={`odds-seg tier-${t}`} style={{ flexGrow: odds[t] }} title={`${TIER_LABELS[t]}: ${formatPercent(odds[t])}`}>
          {odds[t] >= 0.08 ? formatPercent(odds[t]) : ''}
        </span>
      ))}
    </div>
  )
}
```

`src/ui/PartyPanel.tsx`:

```tsx
import { formatModifier } from '../engine/format'
import { ABILITIES, SKILLS, abilityModifier, statLabel } from '../engine/rules/abilities'
import { statModifier } from '../engine/rules/character'
import type { Character } from '../schema/state'

export function PartyPanel({ party }: { party: Character[] }) {
  return (
    <section className="panel" aria-label="Party">
      <h2>Party</h2>
      {party.map((c) => (
        <CharacterCard key={c.id} character={c} />
      ))}
    </section>
  )
}

function CharacterCard({ character: c }: { character: Character }) {
  const best = SKILLS.map((s) => ({ s, m: statModifier(c, s) }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 3)
  return (
    <article className="card">
      <header className="card-head">
        <strong>{c.name}</strong>
        <span className="muted">
          {c.ancestry} {c.classId} · lv {c.level}
        </span>
      </header>
      <div className="hp" aria-label={`HP ${c.hp} of ${c.maxHp}`}>
        <span className="hp-fill" style={{ width: `${(100 * Math.max(0, c.hp)) / c.maxHp}%` }} />
        <span className="hp-text">
          {c.hp}/{c.maxHp} HP
        </span>
      </div>
      <dl className="abilities">
        {ABILITIES.map((a) => (
          <div key={a}>
            <dt>{a.toUpperCase()}</dt>
            <dd>
              {c.abilities[a]} <small>{formatModifier(abilityModifier(c.abilities[a]))}</small>
            </dd>
          </div>
        ))}
      </dl>
      <p className="muted small">Best: {best.map((b) => `${statLabel(b.s)} ${formatModifier(b.m)}`).join(' · ')}</p>
    </article>
  )
}
```

`src/ui/CheckPanel.tsx`:

```tsx
import { useState } from 'react'
import { formatModifier, formatPercent } from '../engine/format'
import { ABILITIES, SKILLS, statLabel, type CheckStat } from '../engine/rules/abilities'
import { rankActors } from '../engine/rules/character'
import { TIER_LABELS, successChance, type RollMode } from '../engine/rules/checks'
import { previewCheck, type Action } from '../engine/state'
import type { GameState } from '../schema/state'
import { OddsBar } from './OddsBar'

const STATS: CheckStat[] = [...SKILLS, ...ABILITIES]

export function CheckPanel({ state, onAction }: { state: GameState; onAction: (a: Action) => void }) {
  const [stat, setStat] = useState<CheckStat>('persuasion')
  const [dc, setDc] = useState(13)
  const [mode, setMode] = useState<RollMode>('normal')
  const [actorId, setActorId] = useState('')
  const preview = previewCheck(state, stat, dc, mode, actorId || undefined)
  const nameOf = (id: string) => state.party.find((c) => c.id === id)?.name ?? '?'
  const roll = state.lastRoll

  return (
    <section className="panel" aria-label="Practice check">
      <h2>Practice check</h2>
      <div className="controls">
        <label>
          Check
          <select value={stat} onChange={(e) => setStat(e.target.value as CheckStat)}>
            {STATS.map((s) => (
              <option key={s} value={s}>
                {statLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          DC
          <input type="number" min={1} max={35} value={dc} onChange={(e) => setDc(Number(e.target.value) || 1)} />
        </label>
        <label>
          Position
          <select value={mode} onChange={(e) => setMode(e.target.value as RollMode)}>
            <option value="normal">Normal</option>
            <option value="advantage">Edge (advantage)</option>
            <option value="disadvantage">Exposed (disadvantage)</option>
          </select>
        </label>
        <label>
          Actor
          <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">Auto (best)</option>
            {rankActors(state.party, stat).map((r) => (
              <option key={r.characterId} value={r.characterId}>
                {nameOf(r.characterId)} {formatModifier(r.modifier)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {preview ? (
        <>
          <p>
            {preview.actorName} rolls {statLabel(stat)} {formatModifier(preview.modifier)} vs DC {dc}:{' '}
            <strong>{formatPercent(successChance(preview.odds))}</strong> to succeed
          </p>
          <OddsBar odds={preview.odds} />
        </>
      ) : (
        <p className="muted">No one is able to act.</p>
      )}

      <button
        className="primary"
        disabled={!preview}
        onClick={() => onAction({ type: 'practiceCheck', stat, dc, mode, actorId: actorId || undefined })}
      >
        Roll
      </button>

      {roll && (
        <div className={`roll tier-${roll.tier}`} aria-live="polite">
          <span className="dice">
            {roll.dice.map((d, i) => (
              <span key={i} className={d === roll.kept && (i === 0 || roll.dice[0] !== d) ? 'die kept' : 'die'}>
                {d}
              </span>
            ))}
          </span>
          <span>
            {formatModifier(roll.modifier)} = {roll.total} vs DC {roll.dc}: <strong>{TIER_LABELS[roll.tier]}</strong>
          </span>
        </div>
      )}
    </section>
  )
}
```

`src/ui/LogPanel.tsx`:

```tsx
import type { LogEntry } from '../schema/state'

export function LogPanel({ log }: { log: LogEntry[] }) {
  return (
    <section className="panel" aria-label="Journal">
      <h2>Journal</h2>
      <ol className="log" aria-label="Log" reversed>
        {[...log].reverse().map((entry, i) => (
          <li key={log.length - i} className={`tone-${entry.tone}`}>
            <span className="muted small">Day {entry.day}</span> {entry.text}
          </li>
        ))}
      </ol>
    </section>
  )
}
```

`src/ui/App.tsx`:

```tsx
import { loadBundledContent } from '../content/bundled'
import { CheckPanel } from './CheckPanel'
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
        <CheckPanel state={state} onAction={dispatch} />
        <LogPanel log={state.log} />
      </main>
    </div>
  )
}
```

`src/ui/theme.css`:

```css
:root {
  --bg: #efe6d2;
  --panel: #f8f2e3;
  --ink: #2b2118;
  --muted: #7a6a55;
  --line: #cdbb98;
  --accent: #7b3f1d;
  --good: #3f6b35;
  --bad: #9c2f24;
  --crit: #b58500;
  --partial: #a7743a;
  --tier-critFail: #7d2018;
  --tier-fail: #c0634f;
  --tier-partial: #d9a75f;
  --tier-success: #6f9a5b;
  --tier-critSuccess: #c9a227;
  font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
  color: var(--ink);
  background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1d1914;
    --panel: #26211a;
    --ink: #eadfc8;
    --muted: #a8977c;
    --line: #4a3f30;
    --accent: #d08a52;
    --good: #8cbf78;
    --bad: #e07a68;
    --crit: #e3bd45;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
h1 { font-size: 1.4rem; margin: 0; letter-spacing: 0.04em; }
h2 { font-size: 1rem; margin: 0 0 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
button { font: inherit; padding: 0.35rem 0.9rem; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 4px; cursor: pointer; }
button.primary { background: var(--accent); color: #fff8ec; border-color: var(--accent); }
button:disabled { opacity: 0.5; cursor: default; }
select, input { font: inherit; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 4px; padding: 0.2rem 0.4rem; }
.muted { color: var(--muted); }
.small { font-size: 0.85rem; }
.app { min-height: 100vh; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 1.25rem; padding: 0.6rem 1rem; border-bottom: 1px solid var(--line); }
.spacer { flex: 1; }
.layout { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.4fr) minmax(240px, 1fr); gap: 1rem; padding: 1rem; flex: 1; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 1rem; min-width: 0; }
.card { border: 1px solid var(--line); border-radius: 4px; padding: 0.6rem 0.75rem; margin-bottom: 0.75rem; }
.card-head { display: flex; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
.hp { position: relative; height: 1.1rem; background: color-mix(in srgb, var(--bad) 20%, transparent); border-radius: 3px; margin: 0.4rem 0; overflow: hidden; }
.hp-fill { position: absolute; inset: 0 auto 0 0; background: color-mix(in srgb, var(--good) 55%, transparent); }
.hp-text { position: relative; font-size: 0.75rem; padding-left: 0.4rem; }
.abilities { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.25rem; margin: 0.4rem 0; text-align: center; }
.abilities dt { font-size: 0.7rem; color: var(--muted); }
.abilities dd { margin: 0; font-variant-numeric: tabular-nums; }
.controls { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem; }
.controls label { display: flex; flex-direction: column; font-size: 0.8rem; color: var(--muted); gap: 0.15rem; }
.odds-bar { display: flex; height: 1.4rem; border-radius: 3px; overflow: hidden; margin: 0.5rem 0 0.9rem; font-size: 0.75rem; }
.odds-seg { display: flex; align-items: center; justify-content: center; color: #fff8ec; min-width: 2px; }
.tier-critFail.odds-seg { background: var(--tier-critFail); }
.tier-fail.odds-seg { background: var(--tier-fail); }
.tier-partial.odds-seg { background: var(--tier-partial); }
.tier-success.odds-seg { background: var(--tier-success); }
.tier-critSuccess.odds-seg { background: var(--tier-critSuccess); }
.roll { margin-top: 0.9rem; display: flex; align-items: center; gap: 0.75rem; }
.die { display: inline-grid; place-items: center; width: 2.2rem; height: 2.2rem; border: 2px solid var(--line); border-radius: 6px; margin-right: 0.25rem; font-weight: bold; opacity: 0.5; }
.die.kept { opacity: 1; border-color: var(--accent); }
.log { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; max-height: 70vh; overflow: auto; }
.tone-good { color: var(--good); }
.tone-bad { color: var(--bad); }
.tone-crit { color: var(--crit); font-weight: bold; }
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './ui/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

Delete `src/smoke.test.ts`.

**Step 4: Run the tests to verify they pass**

Run: `pnpm test`. Expected: all pass.

**Step 5: Manual check.** Run `pnpm dev` and open the printed URL. Confirm:
- Two party cards are shown.
- Changing the check, DC or position updates the odds bar right away.
- The auto-picked actor changes sensibly (for example, Intimidation goes to the fighter).
- Clicking Roll adds a log line and shows the dice; with Edge, the kept die is highlighted.
- Reloading the page keeps the same party.
- "New party" generates a new party.

**Step 6: Commit**

```bash
git add -A src
git commit -m "add UI shell: party cards, practice check with exact odds, journal"
```

---

### Task 12: Asset manifest and sync script

**Files:**
- Create: `scripts/sync-assets.ts`, `assets.manifest.txt`
- Test: `scripts/sync-assets.test.ts`

**Step 1: Write the failing test**

```ts
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseManifest, syncAssets } from './sync-assets'

describe('parseManifest', () => {
  test('skips comments and blanks; strips trailing slashes', () => {
    expect(parseManifest('# c\n\nworld maps/altaeus map.jpg\ntown maps/__altaeus/\n')).toEqual([
      'world maps/altaeus map.jpg',
      'town maps/__altaeus',
    ])
  })
  test('rejects paths escaping the source folder', () => {
    expect(() => parseManifest('../secrets')).toThrow(/relative/)
    expect(() => parseManifest('/etc/passwd')).toThrow(/relative/)
  })
})

describe('syncAssets', () => {
  test('copies files and directories, preserving structure, and reports missing', () => {
    const from = mkdtempSync(join(tmpdir(), 'fh-from-'))
    const to = mkdtempSync(join(tmpdir(), 'fh-to-'))
    mkdirSync(join(from, 'town maps/__altaeus'), { recursive: true })
    writeFileSync(join(from, 'town maps/__altaeus/a.jpg'), 'A')
    mkdirSync(join(from, 'world maps'))
    writeFileSync(join(from, 'world maps/w.jpg'), 'W')

    const result = syncAssets(['town maps/__altaeus', 'world maps/w.jpg', 'nope.png'], from, to)

    expect(result).toEqual({ copied: ['town maps/__altaeus', 'world maps/w.jpg'], missing: ['nope.png'] })
    expect(readFileSync(join(to, 'town maps/__altaeus/a.jpg'), 'utf8')).toBe('A')
    expect(existsSync(join(to, 'world maps/w.jpg'))).toBe(true)
  })
})
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/sync-assets.test.ts`. Expected: FAIL, module not found.

**Step 3: Implement `scripts/sync-assets.ts`**

```ts
// Copies the assets listed in assets.manifest.txt from the dnd5e folder into ./assets/.
// Run: pnpm sync-assets   (DND5E_DIR overrides the default ~/dnd5e)
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseManifest(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const path = normalize(line).replace(/\/+$/, '')
      if (isAbsolute(path) || path.startsWith('..')) {
        throw new Error(`manifest paths must be relative to the dnd5e folder: ${line}`)
      }
      return path
    })
}

export function syncAssets(paths: string[], fromDir: string, toDir: string) {
  const copied: string[] = []
  const missing: string[] = []
  for (const path of paths) {
    const source = join(fromDir, path)
    if (!existsSync(source)) {
      missing.push(path)
      continue
    }
    cpSync(source, join(toDir, path), { recursive: true })
    copied.push(path)
  }
  return { copied, missing }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const fromDir = process.env.DND5E_DIR ?? join(homedir(), 'dnd5e')
  const paths = parseManifest(readFileSync(join(root, 'assets.manifest.txt'), 'utf8'))
  const { copied, missing } = syncAssets(paths, fromDir, join(root, 'assets'))
  console.log(`copied ${copied.length} entries from ${fromDir}`)
  if (missing.length > 0) {
    console.error(`missing:\n${missing.map((m) => `  - ${m}`).join('\n')}`)
    process.exitCode = 1
  }
}
```

**Step 4: Write `assets.manifest.txt`**

```
# Assets copied from the dnd5e folder (DND5E_DIR, default ~/dnd5e) into ./assets/, keeping its structure.
# One path per line, relative to the dnd5e folder. A directory copies everything inside it.
# Copy single files or small subdirectories only: the source folder is very large.
# Recreate everything with: pnpm sync-assets

world maps/altaeus map.jpg
town maps/__altaeus
```

**Step 5: Run the tests, then the script**

Run: `pnpm vitest run scripts/sync-assets.test.ts`. Expected: 3 passed.
Run: `pnpm sync-assets`. Expected: `copied 2 entries from …/dnd5e`.
Run: `git status --short`. Expected: nothing under `assets/` is listed (it's gitignored); `assets.manifest.txt` and `scripts/` are.

**Step 6: Commit**

```bash
git add scripts/sync-assets.ts scripts/sync-assets.test.ts assets.manifest.txt
git commit -m "add asset manifest and sync script for ~/dnd5e assets"
```

---

### Task 13: README and final verification

**Files:**
- Modify: `README.md` (replace the Svelte template text)

**Step 1: Write `README.md`**

```markdown
# Forgotten Heroes

A gritty, magical D&D 5e–flavoured travel-and-trade game. See [the design](docs/plans/2026-11-12-rebuild-design.md).

## Run

    pnpm install
    pnpm sync-assets   # copies images listed in assets.manifest.txt from ~/dnd5e (DND5E_DIR to override)
    pnpm dev

## Develop

- `pnpm test` runs the engine, content and UI tests
- `pnpm typecheck`
- `pnpm schemas` regenerates `data/_schema/` after changing `src/schema/`

## Content

All game content is JSON under `data/`, split by provenance:

| Folder | What | Committed |
|---|---|---|
| `data/original/` | Hand-authored by the designer | yes |
| `data/imported/` | Open-licensed (SRD, CC-BY) | yes |
| `data/imported-private/` | From copyrighted books, for personal play | **no** (gitignored) |
| `data/procedural/` | Parts tables used by runtime combinators | yes |
| `data/claude/` | Authored by Claude Code | yes |

Every file declares `kind` and `source`, and VS Code validates it through `$schema`.

## Credits

- Portraits: Terrible Character Portraits (CC BY 3.0), in `assets/Terrible Character Portraits/`.
- World map of Altaeus by @scenerydnd (personal use; not redistributed).
```

**Step 2: Full verification**

Run: `pnpm test`. Expected: all tests pass.
Run: `pnpm typecheck`. Expected: no errors.
Run: `pnpm build`. Expected: build succeeds.

**Step 3: Commit**

```bash
git add README.md
git commit -m "rewrite README for the rebuild"
```

---

## Roadmap: later plans

Each plan is written in full once the previous one lands, so it can take the user's feedback into account.

- **Plan 2: Encounters and the Encounter Deck.**
  - Schemas for effects, situations, archetypes, parts tables and follow-ups.
  - The encounter composer, including Edge and Exposed within an encounter.
  - Outcome effects (gold, HP, exhaustion, goods placeholders, log).
  - Two kinds of help (trusting and cautious) plus an Insight check that reveals the odds of a twist.
  - The dev Encounter Deck panel.
  - Example content from every source:
    - Ported prototype events in `original`.
    - SRD monsters in `imported`.
    - A private d100 example plus a loader check in `imported-private`.
    - Parts tables in `procedural`.
    - A batch written by Claude in `claude`.
  - The d20 dice animation.
- **Plan 3: World and travel.**
  - The Altaeus graph (marker coordinates, regions, routes) and the political-layer generator (kingdoms and threats).
  - Ported place-name generators.
  - The daily travel loop with essentials, encounter budgets and a map view.
  - Assets manifest entries for battle-map backdrops by biome.
- **Plan 4: Towns and economy.**
  - The 15 goods, carrying capacity (STR-scaled) and endurance (CON).
  - Local supply, demand and price drift, plus the price book.
  - The town ledger screen (market, services, people) and individual and settlement reputation.
- **Plan 5: The run loop and balancing tools.**
  - Run end on a party wipe, and save slots.
  - The simulation smoke test with a random policy, reporting death rate, profit and options that win almost universally.
  - UI polish.
