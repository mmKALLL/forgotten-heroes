import type { Content } from '../../content/build'
import type { Effect, Option, OutcomeBranch, Outcome, Situation } from '../../schema/encounter'
import { allSituations, compileSituation } from './compile'
import { slotNames } from './slots'

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
  }
  return texts
}

const allEffects = (situation: Situation): { effect: Effect; option: Option; where: string }[] =>
  Object.entries(situation.stages).flatMap(([stageId, stage]) =>
    stage.options.flatMap((option) =>
      branches(option).flatMap(([name, outcome]) =>
        withTwist(outcome).flatMap(([suffix, branch]) =>
          branch.effects.map((effect) => ({
            effect,
            option,
            where: `${stageId}/${option.id} ${name}${suffix}`,
          }))
        )
      )
    )
  )

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
  const issues: string[] = []
  for (const [stageId, stage] of Object.entries(situation.stages)) {
    if (stage.archetype && !Object.hasOwn(content.archetypes, stage.archetype.id)) {
      issues.push(`stage ${stageId}: unknown archetype "${stage.archetype.id}"`)
    }
    for (const option of stage.options) {
      if (option.kind === 'check' && typeof option.check.dc === 'string' && !stage.archetype) {
        issues.push(
          `${stageId}/${option.id}: DC "${option.check.dc}" needs an archetype on its stage`
        )
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
          if (suffix && !compiled.twist)
            issues.push(`${where}: twist branch but the situation has no twist`)
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
  for (const { effect, option, where } of allEffects(compiled)) {
    if (effect.effect === 'followUp' && !situationIds.has(effect.situation)) {
      issues.push(`${where}: follow-up to unknown situation "${effect.situation}"`)
    }
    if (
      (effect.effect === 'hp' || effect.effect === 'exhaustion') &&
      effect.target === 'actor' &&
      option.kind === 'fixed'
    ) {
      issues.push(`${where}: fixed options have no actor; use "all" or "random"`)
    }
    if (effect.effect === 'revealTwist' && !compiled.twist)
      issues.push(`${where}: revealTwist but the situation has no twist`)
  }
  return [...new Set(issues)]
}

const isCost = (e: Effect) =>
  ((e.effect === 'gold' || e.effect === 'hp' || e.effect === 'nextCheckModifier') &&
    e.amount < 0) ||
  (e.effect === 'exhaustion' && e.amount > 0) ||
  e.effect === 'days' ||
  e.effect === 'followUp' ||
  (e.effect === 'position' && e.position === 'exposed')

/**
 * Design quality rules (design §7). Regular stages offer at least 2 options, and at least one of
 * them is neither `once` nor gated by requirements, so a stage can't become a dead end. Wonders
 * are one stage with one fixed option and never cost anything.
 */
export function lintSituation(situation: Situation, content: Content): string[] {
  const compiled = compileSituation(situation, content)
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
    ])
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

/**
 * Validation and lint issues for every situation and template, keyed by situation id. An id used
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
  return issues
}
