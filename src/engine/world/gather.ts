import { sortedEntries, type Content } from '../../content/build'
import type { GatherRule } from '../../schema/gather'
import type { GameState } from '../../schema/state'
import type { Ability, Biome, Good, Skill } from '../../schema/types'
import { load } from '../economy/capacity'
import { goodName, goodWeight } from '../economy/goods'
import { pressure, recordTrade } from '../economy/market'
import { production } from '../economy/supply'
import { inProgress } from '../encounters/run'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { checkLabel, statLabel } from '../rules/abilities'
import { canAct, chooseLead } from '../rules/character'
import {
  TIERS,
  TIER_LABELS,
  normalizeDc,
  rollCheck,
  tierFaces,
  tierOdds,
  type FaceRange,
  type Tier,
} from '../rules/checks'
import { useSkill } from '../rules/strain'
import { consumeDay } from '../travel/days'
import { autoRefill } from '../travel/supplies'
import { inSettlement } from '../travel/where'
import { ambushCandidates, drawAmbush } from './explore'
import { settlementName } from './geo'
import {
  DEFAULT_PACE,
  GATHER_DC_PER_OUTPUT,
  GATHER_DEPTH_DAYS,
  GATHER_INJURY,
  OVERLOAD_RATIO,
} from '../constants'

// Gathering (Plan 5a, design §10b): a day's work in a settlement's domain, cutting timber,
// quarrying stone, gathering fuel, food or healing herbs (content `gatherRules`). The lead rolls,
// the whole able party works, and the land is picked over by what it carried away: `gathered`
// recovers like a market's pressure (economy/market.ts). Nothing ticks.

const BUSY = 'Finish the current encounter first.'

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/** What one tier of a gathering day brings home. */
export type GatherOutcome = {
  tier: Tier
  /** The d20 faces that land in it, or null when none do. */
  faces: FaceRange | null
  chance: number
  /** Units of the good, after depletion and what the party can carry. */
  units: number
}

/** A day's gathering on offer here, with everything the player sees before committing. */
export type GatherOption = {
  rule: string
  good: Good
  /** "Cut timber". */
  label: string
  text: string | null
  /** The lead: the best-suited fit member, with their `gather` activity hooks. */
  actorId: string
  actorName: string
  skill: Skill
  ability: Ability | null
  /** "Athletics", or "Athletics (CON)". */
  checkLabel: string
  modifier: number
  /** The DC rolled against: the rule's, lowered by what the domain makes of the good. */
  dc: number
  /** The rule's own DC, before the producers here lower it. */
  baseDc: number
  /** Members who can act: each works, and the yield scales with them (the rule's is for two). */
  workers: number
  odds: Record<Tier, number>
  faces: Record<Tier, FaceRange | null>
  /** Every tier in TIERS order; the UI lists the non-critical ones. */
  outcomes: GatherOutcome[]
  /** How picked over the land is for this good, 0 (fresh) to 1. */
  depleted: number
  /** Units the party can still carry without being overloaded; the outcomes are capped by it. */
  room: number
  /**
   * What a critical failure (a natural 1) brings, besides nothing: a hostile encounter when one
   * fits the place, else the lead is hurt for `injury` HP.
   */
  mishap: { chance: number; ambush: boolean; injury: number }
  available: boolean
  reason: string | null
}

/** A settlement's land: its region's biome. */
const landOf = (content: Content, domain: string): Biome | null =>
  own(content.regions, own(content.settlements, domain)?.region)?.biome ?? null

/** How picked over the land around `domain` is for `good`, 0–1, for a rule of this yield. */
export function depletion(
  state: Pick<GameState, 'gathered' | 'day'>,
  domain: string,
  rule: Pick<GatherRule, 'good' | 'yield'>
): number {
  const p = pressure(own(state.gathered, domain)?.[rule.good], state.day)
  const depth = GATHER_DEPTH_DAYS * Math.max(1, rule.yield.success)
  return Math.max(0, 1 - Math.exp(-p / depth))
}

/** Units of a good the party can add before it is overloaded (unbounded for weightless goods). */
function carryRoom(state: GameState, content: Content, good: Good): number {
  const each = goodWeight(content, good)
  if (each <= 0) return Number.MAX_SAFE_INTEGER
  const now = load(state, content)
  return Math.max(0, Math.floor((now.capacity * OVERLOAD_RATIO - now.weight) / each + 1e-9))
}

/** Units a tier yields: the rule's (for two workers) × workers / 2, less the depletion, rounded. */
const tierYield = (rule: GatherRule, tier: Tier, workers: number, depleted: number): number =>
  Math.max(0, Math.round(((rule.yield[tier] ?? 0) * workers * (1 - depleted)) / 2))

/**
 * The gathering open to the party here: one option per `gatherRules` entry whose biomes include
 * the land of the settlement it is in. None on the road, at a point of interest, during an
 * encounter, or when no one can act. The DC is lowered by GATHER_DC_PER_OUTPUT per output level of
 * the good made in this domain (production), so gathering is easiest where the good is made.
 */
export function gatherOptions(state: GameState, content: Content): GatherOption[] {
  if (inProgress(state) || !inSettlement(state)) return []
  const domain = state.location!
  const land = landOf(content, domain)
  if (land === null || land === 'sea') return []
  const workers = state.party.filter(canAct).length
  const made = production(state, content, domain)
  const ambush = ambushCandidates(state, content).length > 0
  return sortedEntries(content.gatherRules)
    .filter((rule) => (rule.biomes as readonly Biome[]).includes(land))
    .flatMap((rule): GatherOption[] => {
      const lead = chooseLead(state.party, rule.skill, 'gather', rule.ability)
      if (!lead) return []
      const output = made.find((p) => p.good === rule.good)?.output ?? 0
      const dc = normalizeDc(rule.dc - GATHER_DC_PER_OUTPUT * output)
      const odds = tierOdds(lead.modifier, dc)
      const faces = tierFaces(lead.modifier, dc)
      const depleted = depletion(state, domain, rule)
      const room = carryRoom(state, content, rule.good)
      const outcomes = TIERS.map((tier) => ({
        tier,
        faces: faces[tier],
        chance: odds[tier],
        units: Math.min(room, tierYield(rule, tier, workers, depleted)),
      }))
      const reason = room === 0 ? 'The party can carry no more.' : null
      return [
        {
          rule: rule.id,
          good: rule.good,
          label: rule.label,
          text: rule.text ?? null,
          actorId: lead.characterId,
          actorName: state.party.find((c) => c.id === lead.characterId)?.name ?? '?',
          skill: rule.skill,
          ability: rule.ability ?? null,
          checkLabel: checkLabel(rule.skill, rule.ability),
          modifier: lead.modifier,
          dc,
          baseDc: rule.dc,
          workers,
          odds,
          faces,
          outcomes,
          depleted,
          room,
          mishap: { chance: odds.critFail, ambush, injury: GATHER_INJURY },
          available: reason === null,
          reason,
        },
      ]
    })
}

/**
 * A day's gathering (gatherOptions): the lead rolls (it counts toward Strain; a natural 20 grants
 * Inspiration), the units the tier yields arrive as goods (what the party can't carry is left
 * behind), and the land records what was carried away. Then the day passes as a day in town on the
 * party's own food (water is free in town). A critical failure draws a hostile situation that
 * fits the place, or else hurts the lead (GATHER_INJURY).
 */
export function gather(state: GameState, content: Content, ruleId: string): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const option = gatherOptions(state, content).find((o) => o.rule === ruleId)
  if (!option) return appendLog(state, 'There is nothing like that to gather here.', 'bad')
  if (!option.available) return appendLog(state, option.reason!, 'bad')
  const rule = content.gatherRules[ruleId]
  const domain = state.location!
  const [roll, rng] = rollCheck(state.rng, option.modifier, option.dc)
  const { party, skillUses, strained } = useSkill(state, option.actorId, option.skill)
  const inspired = roll.tier === 'critSuccess'
  const units = option.outcomes.find((o) => o.tier === roll.tier)!.units
  const taken = tierYield(rule, roll.tier, option.workers, option.depleted)
  const name = option.actorName
  const what = goodName(content, option.good).toLowerCase()
  let next = appendLog(
    {
      ...state,
      rng,
      party,
      skillUses,
      inspiration: state.inspiration + (inspired ? 1 : 0),
      lastRoll: { ...roll, stat: option.skill, ability: rule.ability, actorId: option.actorId },
      goods: { ...state.goods, [option.good]: (state.goods[option.good] ?? 0) + units },
      // The land is picked over by what is carried home: what is left behind still lies there.
      gathered: recordTrade(state.gathered, domain, option.good, units, state.day),
    },
    `${option.label} near ${settlementName(state, domain)}: ${name} rolls ` +
      `${option.checkLabel} ${roll.kept} ${formatModifier(roll.modifier)} = ${roll.total} ` +
      `vs DC ${option.dc}. ${TIER_LABELS[roll.tier]}. ` +
      (units > 0 ? `${units} ${what} gathered.` : 'Nothing worth carrying home.') +
      (inspired ? ' Inspiration gained!' : ''),
    TIER_TONE[roll.tier]
  )
  if (taken > units) {
    next = appendLog(
      next,
      `${taken - units} ${what} left behind: the party can carry no more.`,
      'info'
    )
  }
  if (strained > 0) {
    next = appendLog(
      next,
      `${name} is strained: ${statLabel(option.skill)} −${strained} until it fades.`,
      'bad'
    )
  }
  const day = consumeDay(next, null, DEFAULT_PACE, content).state
  next = { ...day, goods: autoRefill(day, content) }
  if (roll.tier !== 'critFail') return next
  const ambushed = drawAmbush(next, content)
  if (ambushed) return ambushed
  const hurt = next.party.map((c) =>
    c.id === option.actorId ? { ...c, hp: Math.max(0, c.hp - GATHER_INJURY) } : c
  )
  return appendLog(
    { ...next, party: hurt },
    `${name} is hurt in the work: −${GATHER_INJURY} HP.`,
    'bad'
  )
}
