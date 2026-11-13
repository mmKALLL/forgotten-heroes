import { sortedEntries, type Content } from '../../content/build'
import {
  TWIST_STAGE,
  type Effect,
  type Option,
  type OutcomeBranch,
  type Outcome,
  type Situation,
  type Stage,
  type TwistKind,
} from '../../schema/encounter'
import {
  TWIST_STAGE_PREFIX,
  allSituations,
  attachTwistKind,
  compileSituation,
  twistKindsFor,
} from './compile'
import { slotNames } from './slots'
import { playsRound } from './challenge'

/** Slots every check outcome may use without declaring them. */
export const BUILT_IN_SLOTS = ['actor'] as const

type Text = { text: string; where: string; actorAllowed: boolean }

function branches(option: Option): [string, Outcome][] {
  if (option.kind === 'fixed') return [['outcome', option.outcome]]
  return Object.entries(option.outcomes).flatMap(([tier, o]) =>
    o ? [[tier, o] as [string, Outcome]] : []
  )
}

const withTwist = (outcome: Outcome): [string, OutcomeBranch][] =>
  outcome.twist
    ? [
        ['', outcome],
        [' twist', outcome.twist],
      ]
    : [['', outcome]]

function textsOf(situation: Situation): Text[] {
  const texts: Text[] = [{ text: situation.title, where: 'title', actorAllowed: false }]
  if (situation.twist)
    texts.push({ text: situation.twist.what, where: 'twist', actorAllowed: false })
  for (const [stageId, stage] of Object.entries(situation.stages)) {
    texts.push({ text: stage.text, where: `stage ${stageId}`, actorAllowed: false })
    for (const option of stage.options) {
      const at = `${stageId}/${option.id}`
      texts.push({ text: option.label, where: `${at} label`, actorAllowed: false })
      if (option.description)
        texts.push({ text: option.description, where: `${at} description`, actorAllowed: false })
      for (const [name, outcome] of branches(option)) {
        for (const [suffix, branch] of withTwist(outcome)) {
          const where = `${at} ${name}${suffix}`
          const actorAllowed = option.kind === 'check'
          texts.push({ text: branch.text, where, actorAllowed })
          for (const effect of branch.effects) {
            if (effect.effect === 'log')
              texts.push({ text: effect.text, where: `${where} log`, actorAllowed })
          }
        }
      }
    }
    for (const [name, branch] of challengeBranches(stage)) {
      const where = `${stageId} challenge ${name}`
      texts.push({ text: branch.text, where, actorAllowed: false })
      for (const effect of branch.effects)
        if (effect.effect === 'log')
          texts.push({ text: effect.text, where: `${where} log`, actorAllowed: false })
    }
  }
  return texts
}

/** A challenge stage's win and lose branches (none for another stage). */
const challengeBranches = (stage: Stage): [string, OutcomeBranch][] =>
  stage.challenge
    ? [
        ['win', stage.challenge.win],
        ['lose', stage.challenge.lose],
      ]
    : []

/** Every effect of a situation; `option` is null for a challenge's win and lose branches. */
const allEffects = (
  situation: Situation
): { effect: Effect; option: Option | null; where: string; inTwist: boolean }[] =>
  Object.entries(situation.stages).flatMap(([stageId, stage]) => [
    ...stage.options.flatMap((option) =>
      branches(option).flatMap(([name, outcome]) =>
        withTwist(outcome).flatMap(([suffix, branch]) =>
          branch.effects.map((effect) => ({
            effect,
            option: option as Option | null,
            where: `${stageId}/${option.id} ${name}${suffix}`,
            inTwist: suffix !== '',
          }))
        )
      )
    ),
    ...challengeBranches(stage).flatMap(([name, branch]) =>
      branch.effects.map((effect) => ({
        effect,
        option: null,
        where: `${stageId} challenge ${name}`,
        inTwist: false,
      }))
    ),
  ])

/** Problems an archetype expansion would throw on, so they are reported before compiling. */
function stageIssues(stages: Record<string, Stage>, content: Content, at = ''): string[] {
  const issues: string[] = []
  for (const [stageId, stage] of Object.entries(stages)) {
    if (stage.archetype && !Object.hasOwn(content.archetypes, stage.archetype.id)) {
      issues.push(`${at}stage ${stageId}: unknown archetype "${stage.archetype.id}"`)
    }
    for (const option of stage.options) {
      if (option.kind === 'check' && typeof option.check.dc === 'string' && !stage.archetype) {
        issues.push(
          `${at}${stageId}/${option.id}: DC "${option.check.dc}" needs an archetype on its stage`
        )
      }
    }
  }
  return issues
}

/** An opening hit is applied by fixed options, so it has no actor, and it can't nest. */
function openingIssues(opening: readonly Effect[], content: Content, where: string): string[] {
  const situationIds = new Set(allSituations(content).map((s) => s.id))
  return opening.flatMap((effect) => {
    if (
      (effect.effect === 'hp' ||
        effect.effect === 'healFraction' ||
        effect.effect === 'exhaustion') &&
      effect.target === 'actor'
    )
      return [`${where}: an opening hit has no actor; use "all" or "random"`]
    if (effect.effect === 'openingHit') return [`${where}: an opening hit can't contain openingHit`]
    if (effect.effect === 'followUp' && !situationIds.has(effect.situation))
      return [`${where}: follow-up to unknown situation "${effect.situation}"`]
    return []
  })
}

/** Twist kinds that compile: their archetypes exist and relative DCs have one. */
const compilableKinds = (kinds: TwistKind[], content: Content): TwistKind[] =>
  kinds.filter((k) => stageIssues(k.stages, content).length === 0)

/** How a situation's twist is set up: the table, its kinds, a bespoke stage and opening. */
function twistIssues(situation: Situation, content: Content): string[] {
  const twist = situation.twist
  if (!twist) return []
  const issues: string[] = []
  if (twist.table) {
    if (twist.stage) issues.push('twist: a table twist gets its stage from the table; drop "stage"')
    if (twist.opening.length > 0)
      issues.push('twist: a table twist gets its opening hit from the table; drop "opening"')
    for (const id of twist.kinds ?? [])
      if (!Object.hasOwn(content.twists, id)) issues.push(`twist: unknown twist kind "${id}"`)
    if (twistKindsFor(content, twist).length === 0)
      issues.push('twist: the twist table has no kind to draw')
    for (const id of Object.keys(situation.stages))
      if (id.startsWith(TWIST_STAGE_PREFIX))
        issues.push(`stage ${id}: ids starting "${TWIST_STAGE_PREFIX}" are for the twist table`)
    for (const kind of twistKindsFor(content, twist))
      for (const name of Object.keys(kind.slots))
        if (Object.hasOwn(situation.slots, name))
          issues.push(`twist kind ${kind.id}: slot "${name}" clashes with the situation's own`)
  } else {
    if (twist.kinds) issues.push('twist: "kinds" only works with "table": true')
    if (twist.stage && !Object.hasOwn(situation.stages, twist.stage))
      issues.push(`twist: stage "${twist.stage}" does not exist`)
    issues.push(...openingIssues(twist.opening, content, 'twist opening'))
  }
  return issues
}

/** A situation as it can play: once per twist kind it could draw, or just itself. */
function playableForms(compiled: Situation, content: Content): Situation[] {
  if (!compiled.twist?.table) return [compiled]
  const kinds = compilableKinds(twistKindsFor(content, compiled.twist), content)
  return kinds.length === 0
    ? [compiled]
    : kinds.map((kind) => attachTwistKind(compiled, kind, content))
}

/** Parts-table problems reachable from `tableId`: unknown tables, loops, nothing to pick. */
function tableIssues(content: Content, tableId: string, path: string[] = []): string[] {
  if (path.includes(tableId)) return [`parts table loop: ${[...path, tableId].join(' → ')}`]
  if (!Object.hasOwn(content.partsTables, tableId)) return [`unknown parts table "${tableId}"`]
  const { rows } = content.partsTables[tableId]
  const own = rows.some((r) => r.weight > 0)
    ? []
    : [`parts table "${tableId}" has no row with weight > 0`]
  const refs = new Set(rows.flatMap((r) => slotNames(r.text)))
  return [...own, ...[...refs].flatMap((ref) => tableIssues(content, ref, [...path, tableId]))]
}

/**
 * Structural problems that would make a situation unplayable: missing archetypes, stages,
 * slots, tables, creatures or follow-up targets; unreachable stages; misused {actor} and twists.
 */
export function validateSituation(situation: Situation, content: Content): string[] {
  const early = stageIssues(situation.stages, content)
  if (early.length > 0) return early
  const compiled = compileSituation(situation, content)
  const issues = twistIssues(compiled, content)
  for (const form of playableForms(compiled, content))
    issues.push(...validateCompiled(form, content))
  issues.push(...unknownRegions(compiled.regions ?? [], content))
  if (compiled.room && !compiled.site) issues.push('a dungeon room needs site: true')
  return [...new Set(issues)]
}

const unknownRegions = (regions: readonly string[], content: Content): string[] =>
  regions.flatMap((r) => (Object.hasOwn(content.regions, r) ? [] : [`unknown region "${r}"`]))

/** validateSituation for one compiled form (a table twist's kind already joined in). */
function validateCompiled(compiled: Situation, content: Content): string[] {
  const issues: string[] = []
  const stageIds = new Set(Object.keys(compiled.stages))
  const twistStage = compiled.twist?.stage

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
          if (suffix && !compiled.twist)
            issues.push(`${where}: twist branch but the situation has no twist`)
          if (branch.goto && branch.stay) issues.push(`${where}: both goto and stay`)
          if (!branch.goto) continue
          if (branch.goto === TWIST_STAGE) {
            if (!suffix) issues.push(`${where}: goto "${TWIST_STAGE}" only works in a twist branch`)
            else if (!twistStage)
              issues.push(`${where}: goto "${TWIST_STAGE}" needs a twist table or a twist "stage"`)
            else if (stageIds.has(twistStage)) targets.push(twistStage)
            continue
          }
          if (stageIds.has(branch.goto)) targets.push(branch.goto)
          else issues.push(`${where}: goto unknown stage "${branch.goto}"`)
        }
      }
    }
    for (const [name, branch] of challengeBranches(stage)) {
      const where = `${stageId} challenge ${name}`
      if (branch.stay) issues.push(`${where}: can't stay; the challenge is decided`)
      if (branch.tally) issues.push(`${where}: tally only works in a round's outcome`)
      if (!branch.goto) continue
      if (stageIds.has(branch.goto)) targets.push(branch.goto)
      else issues.push(`${where}: goto unknown stage "${branch.goto}"`)
    }
    issues.push(...challengeIssues(stageId, stage))
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
  for (const stageId of stageIds)
    if (!reached.has(stageId)) issues.push(`stage ${stageId} is unreachable`)

  const declared = new Set([...Object.keys(compiled.slots), ...BUILT_IN_SLOTS])
  for (const { text, where, actorAllowed } of textsOf(compiled)) {
    for (const name of slotNames(text)) {
      if (!declared.has(name)) issues.push(`${where}: slot {${name}} is not declared`)
      else if (name === 'actor' && !actorAllowed)
        issues.push(`${where}: {actor} only works in check outcomes`)
    }
  }
  for (const [name, source] of Object.entries(compiled.slots)) {
    if (source.from === 'table') {
      issues.push(...tableIssues(content, source.table).map((m) => `slot ${name}: ${m}`))
      continue
    }
    const any = Object.values(content.creatures).some(
      (c) =>
        (source.types.length === 0 || source.types.includes(c.type)) &&
        (source.maxCr === undefined || c.cr <= source.maxCr)
    )
    if (!any) issues.push(`slot ${name}: no creature matches`)
  }

  const situationIds = new Set(allSituations(content).map((s) => s.id))
  for (const { effect, option, where, inTwist } of allEffects(compiled)) {
    if (effect.if?.cond === 'twistRevealed' && !compiled.twist)
      issues.push(`${where}: condition twistRevealed but the situation has no twist`)
    if (effect.effect === 'openingHit') {
      if (!inTwist) issues.push(`${where}: openingHit only works in a twist branch`)
      else if (compiled.twist && compiled.twist.opening.length === 0)
        issues.push(`${where}: openingHit but the twist has no opening hit`)
    }
    if (effect.effect === 'followUp' && !situationIds.has(effect.situation)) {
      issues.push(`${where}: follow-up to unknown situation "${effect.situation}"`)
    }
    if (
      (effect.effect === 'hp' ||
        effect.effect === 'healFraction' ||
        effect.effect === 'exhaustion') &&
      effect.target === 'actor' &&
      (option === null || option.kind === 'fixed')
    ) {
      issues.push(
        option === null
          ? `${where}: a challenge's win and lose have no actor; use "all" or "random"`
          : `${where}: fixed options have no actor; use "all" or "random"`
      )
    }
    if (effect.effect === 'revealTwist' && !compiled.twist)
      issues.push(`${where}: revealTwist but the situation has no twist`)
    if (
      effect.effect === 'animals' &&
      effect.animal &&
      !Object.hasOwn(content.animals, effect.animal)
    )
      issues.push(`${where}: unknown animal "${effect.animal}"`)
    if (
      (effect.effect === 'clearPoi' ||
        effect.effect === 'learnPlan' ||
        effect.effect === 'revealKeySite' ||
        effect.effect === 'thwartAct') &&
      !compiled.site
    )
      issues.push(`${where}: ${effect.effect} only works in a site situation`)
    // Delving (Plan 6 D3): the engine writes these into a room's snapshot (encounters/room.ts).
    if (effect.effect === 'hoard') issues.push(`${where}: hoard is added by the engine only`)
    if (effect.effect === 'driveOut' && !compiled.room)
      issues.push(`${where}: driveOut only works in a dungeon room`)
  }
  for (const villain of compiled.villains)
    if (!Object.hasOwn(content.villains, villain)) issues.push(`unknown villain "${villain}"`)
  // A consumable that unlocks an option is used up by it, whatever the roll.
  for (const [stageId, stage] of Object.entries(compiled.stages))
    for (const option of stage.options)
      for (const r of option.requires) {
        if (r.req !== 'goods') continue
        for (const [name, outcome] of branches(option))
          for (const [suffix, branch] of withTwist(outcome)) {
            const spends = branch.effects.some(
              (e) => e.effect === 'goods' && e.good === r.good && (e.amount ?? 0) < 0
            )
            if (!spends)
              issues.push(
                `${stageId}/${option.id} ${name}${suffix}: needs ${r.good} but doesn't spend it`
              )
          }
      }
  if (!compiled.site) {
    for (const [stageId, stage] of Object.entries(compiled.stages))
      for (const option of stage.options)
        if (option.requires.some((r) => r.req === 'siteReady'))
          issues.push(`${stageId}/${option.id}: siteReady only works in a site situation`)
  }
  return issues
}

/**
 * A skill challenge's rounds (challenge.ts): they stay on the stage until the tally decides, so
 * they have no goto or stay, nor a hidden twist; a fixed option that tallies is once only (or it
 * would win for free); `tally` means nothing outside a challenge.
 */
function challengeIssues(stageId: string, stage: Stage): string[] {
  const issues: string[] = []
  for (const option of stage.options) {
    const round = stage.challenge !== undefined && playsRound(option)
    for (const [name, outcome] of branches(option)) {
      const where = `${stageId}/${option.id} ${name}`
      if (!stage.challenge) {
        if (outcome.tally || outcome.twist?.tally)
          issues.push(`${where}: tally only works in a challenge stage`)
        continue
      }
      if (!round) continue
      if (outcome.goto || outcome.stay)
        issues.push(`${where}: a challenge round can't goto or stay; the tally decides`)
      if (outcome.twist) issues.push(`${where}: a challenge round can't have a twist branch`)
    }
    if (round && option.kind === 'fixed' && !option.once)
      issues.push(`${stageId}/${option.id}: a fixed option that tallies must be once`)
  }
  return issues
}

/**
 * A twist kind checked as if it were a situation of its own (its stages, slots and opening), plus
 * what only a twist kind must not do: go to "@twist" from inside the escalation.
 */
export function validateTwistKind(kind: TwistKind, content: Content): string[] {
  const early = stageIssues(kind.stages, content)
  if (early.length > 0) return early
  const issues = openingIssues(kind.opening, content, 'opening')
  const asSituation = twistKindAsSituation(kind)
  for (const { effect, where } of allEffects(asSituation)) {
    if (effect.effect === 'openingHit') issues.push(`${where}: openingHit only works in situations`)
  }
  for (const [stageId, stage] of Object.entries(asSituation.stages))
    for (const option of stage.options)
      for (const [name, outcome] of branches(option))
        for (const [suffix, branch] of withTwist(outcome))
          if (branch.goto === TWIST_STAGE)
            issues.push(
              `${stageId}/${option.id} ${name}${suffix}: a twist kind can't goto "${TWIST_STAGE}"`
            )
  issues.push(...validateSituation(asSituation, content))
  issues.push(...unknownRegions(kind.regions, content))
  for (const threat of kind.threats)
    if (!Object.hasOwn(content.threats, threat)) issues.push(`unknown threat "${threat}"`)
  if (issues.length === 0) issues.push(...lintSituation(asSituation, content))
  return [...new Set(issues)]
}

/** A twist kind as a stand-alone situation, for checking. Its twist always happens. */
const twistKindAsSituation = (kind: TwistKind): Situation => ({
  id: kind.id,
  title: kind.name,
  weight: 0,
  tags: [],
  slots: kind.slots,
  twist: { chance: 1, what: kind.what, table: false, stage: kind.start, opening: [] },
  wonder: false,
  followUpOnly: true,
  site: false,
  room: false,
  villains: [],
  start: kind.start,
  stages: kind.stages,
})

/**
 * Design quality rules (design §7). Every situation that can be drawn has a disposition. Regular stages offer at least 2 options, and at least one of
 * them is neither `once` nor gated by requirements, so a stage can't become a dead end. Wonders
 * are one stage with one fixed option and flavour only: no effects but log lines.
 */
export function lintSituation(situation: Situation, content: Content): string[] {
  const compiled = compileSituation(situation, content)
  const forms = playableForms(compiled, content)
  return [
    ...new Set([...dispositionIssues(situation), ...forms.flatMap((form) => lintCompiled(form))]),
  ]
}

/** Every situation that can be drawn says how it treats the party; a wonder is never hostile. */
function dispositionIssues(situation: Situation): string[] {
  if (situation.wonder && situation.disposition === 'hostile')
    return ['a wonder is pleasant or neutral, never hostile']
  if (!situation.followUpOnly && !situation.disposition)
    return ['needs a disposition: hostile, neutral or pleasant']
  return []
}

/**
 * A challenge offers a choice every round: at least 2 options that play a round, one of them
 * never used up (not once, no requirements), so the tally can always go on.
 */
function challengeLint(id: string, stage: Stage): string[] {
  if (!stage.challenge) return []
  const rounds = stage.options.filter(playsRound)
  const issues: string[] = []
  if (rounds.length < 2)
    issues.push(`stage ${id}: a challenge needs at least 2 options that play a round`)
  if (!rounds.some((o) => !o.once && o.requires.length === 0))
    issues.push(`stage ${id}: a challenge needs a round option that is never used up`)
  return issues
}

function lintCompiled(compiled: Situation): string[] {
  const stages = Object.entries(compiled.stages)
  if (!compiled.wonder) {
    return stages.flatMap(([id, stage]) => [
      ...(stage.options.length >= 2
        ? []
        : [
            `stage ${id} has ${stage.options.length} option(s); regular encounters need at least 2`,
          ]),
      ...(stage.options.length === 0 ||
      stage.options.some((o) => !o.once && o.requires.length === 0)
        ? []
        : [
            `stage ${id}: every option is once or has requirements, so the stage can become a dead end`,
          ]),
      ...challengeLint(id, stage),
    ])
  }
  const issues: string[] = []
  const options = stages.flatMap(([, stage]) => stage.options)
  if (stages.length !== 1 || options.length !== 1 || options[0].kind !== 'fixed') {
    issues.push('a wonder is one stage with one fixed option')
  }
  for (const { effect, where } of allEffects(compiled)) {
    if (effect.effect !== 'log')
      issues.push(`${where}: wonders are flavour only, with no effects but log (${effect.effect})`)
  }
  return issues
}

/**
 * Validation and lint issues for every situation and template, keyed by situation id, and for
 * every twist kind, keyed "twists/<id>". An id used
 * by more than one entry is reported, and the issues of every entry with that id are kept.
 */
export function contentIssues(content: Content): Record<string, string[]> {
  const issues: Record<string, string[]> = {}
  const add = (id: string, found: string[]) => {
    if (found.length > 0) issues[id] = [...(Object.hasOwn(issues, id) ? issues[id] : []), ...found]
  }
  const counts = new Map<string, number>()
  for (const { id } of allSituations(content)) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const [id, count] of counts) if (count > 1) add(id, [`duplicate situation id "${id}"`])
  for (const situation of allSituations(content)) {
    const structural = validateSituation(situation, content)
    add(situation.id, structural.length > 0 ? structural : lintSituation(situation, content))
  }
  for (const kind of sortedEntries(content.twists))
    add(`twists/${kind.id}`, validateTwistKind(kind, content))
  return issues
}
