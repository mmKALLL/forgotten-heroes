import { sortedEntries, type Content } from '../../content/build'
import type { GatherRule } from '../../schema/gather'
import type { GameState } from '../../schema/state'
import type { Ability, Biome, Good, Skill } from '../../schema/types'
import { load } from '../economy/capacity'
import { goodName, goodPrice, goodWeight } from '../economy/goods'
import { pressure, quote, recordTrade } from '../economy/market'
import { production } from '../economy/supply'
import { inProgress } from '../encounters/run'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { checkLabel, statLabel } from '../rules/abilities'
import { chooseLead } from '../rules/character'
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
import { inSettlement } from '../travel/where'
import { ambushCandidates, drawAmbush } from './explore'
import { settlementName } from './geo'
import {
  GATHERER_RATIONS,
  GATHER_DAYS,
  GATHER_DC_PER_OUTPUT,
  GATHER_DEPTH_DAYS,
  GATHER_INJURY,
  OVERLOAD_RATIO,
} from '../constants'

// Gathering (Plan 5a, design §10b): GATHER_DAYS days' work in a settlement's domain, cutting
// timber, quarrying stone, gathering fuel, food or healing herbs (content `gatherRules`). One
// member, the best-suited, rolls and does the work on their own rations while the rest of the
// party waits (designer call 2026-11-13), and the land is picked over by what was carried away:
// `gathered` recovers like a market's pressure (economy/market.ts). Nothing ticks.

const BUSY = 'Finish the current encounter first.'
/** The refusal when the gatherer hasn't the food for the days of work. */
export const GATHER_HUNGRY = 'The gatherer needs food for the work.'

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/** What one tier of a gathering brings home. */
export type GatherOutcome = {
  tier: Tier
  /** The d20 faces that land in it, or null when none do. */
  faces: FaceRange | null
  chance: number
  /** Units of the good, after depletion and what the party can carry. */
  units: number
}

/** A gathering on offer here, with everything the player sees before committing. */
export type GatherOption = {
  rule: string
  good: Good
  /** "Cut timber". */
  label: string
  text: string | null
  /** The gatherer: the best-suited fit member, with their `gather` activity hooks. */
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
  /** Days the work takes (GATHER_DAYS), all at once. */
  days: number
  /**
   * The rations it eats: the gatherer's own, one a day (designer call 2026-11-13: the rest of the
   * party neither eats, rests, heals nor tires meanwhile).
   */
  food: number
  /** Not enough food for the gatherer's days (the gathering is refused). */
  hungry: boolean
  odds: Record<Tier, number>
  faces: Record<Tier, FaceRange | null>
  /** Every tier in TIERS order; the UI lists the non-critical ones. */
  outcomes: GatherOutcome[]
  /** How picked over the land is for this good, 0 (fresh) to 1. */
  depleted: number
  /** Units the party can still carry without being overloaded; the outcomes are capped by it. */
  room: number
  /**
   * What a success's units would sell for here now (the best shop's quote for the lot, bulk
   * pressure included), or at the good's base price where nothing here buys it. The options are
   * sorted by it, biggest first; the UI needn't show it.
   */
  value: number
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
  // A rule's yield is for GATHER_DAYS days: the land is GATHER_DEPTH_DAYS days' work deep.
  const depth = (GATHER_DEPTH_DAYS * Math.max(1, rule.yield.success)) / GATHER_DAYS
  return Math.max(0, 1 - Math.exp(-p / depth))
}

/** Units of a good the party can add before it is overloaded (unbounded for weightless goods). */
function carryRoom(state: GameState, content: Content, good: Good): number {
  const each = goodWeight(content, good)
  if (each <= 0) return Number.MAX_SAFE_INTEGER
  const now = load(state, content)
  return Math.max(0, Math.floor((now.capacity * OVERLOAD_RATIO - now.weight) / each + 1e-9))
}

/** Units a tier yields: the rule's, less the depletion, rounded. */
const tierYield = (rule: GatherRule, tier: Tier, depleted: number): number =>
  Math.max(0, Math.round((rule.yield[tier] ?? 0) * (1 - depleted)))

/** What `units` of a good fetch here now, or at its base price where nothing here buys it. */
function saleValue(state: GameState, content: Content, domain: string, good: Good, units: number) {
  if (units <= 0) return 0
  return (
    quote(state, content, domain, good, 'sell', units)?.total ?? units * goodPrice(content, good)
  )
}

/**
 * The gathering open to the party here: one option per `gatherRules` entry whose biomes include
 * the land of the settlement it is in. None on the road, at a point of interest, during an
 * encounter, or when no one can act. The DC is lowered by GATHER_DC_PER_OUTPUT per output level of
 * the good made in this domain (production), so gathering is easiest where the good is made.
 * Sorted by what a success would sell for here (`value`), biggest first.
 */
export function gatherOptions(state: GameState, content: Content): GatherOption[] {
  if (inProgress(state) || !inSettlement(state)) return []
  const domain = state.location!
  const land = landOf(content, domain)
  if (land === null || land === 'sea') return []
  const food = GATHER_DAYS * GATHERER_RATIONS
  const hungry = (state.goods.food ?? 0) < food
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
        units: Math.min(room, tierYield(rule, tier, depleted)),
      }))
      const success = outcomes.find((o) => o.tier === 'success')!.units
      const reason = room === 0 ? 'The party can carry no more.' : hungry ? GATHER_HUNGRY : null
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
          days: GATHER_DAYS,
          food,
          hungry,
          odds,
          faces,
          outcomes,
          depleted,
          room,
          value: saleValue(state, content, domain, rule.good, success),
          mishap: { chance: odds.critFail, ambush, injury: GATHER_INJURY },
          available: reason === null,
          reason,
        },
      ]
    })
    .sort((a, b) => b.value - a.value)
}

/**
 * A gathering (gatherOptions): the gatherer rolls (it counts toward Strain; a natural 20 grants
 * Inspiration), the units the tier yields arrive as goods (what the party can't carry is left
 * behind), and the land records what was carried away. Then GATHER_DAYS days pass on the
 * gatherer's own rations, one a day: the rest of the party waits, neither eating, resting, healing
 * nor tiring (designer call 2026-11-13). Refused without the food. A critical failure draws a
 * hostile situation that fits the place, or else hurts the gatherer (GATHER_INJURY).
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
  const taken = tierYield(rule, roll.tier, option.depleted)
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
    `${option.label} near ${settlementName(state, domain)} for ${option.days} days: ${name} rolls ` +
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
  // The days pass on the gatherer's rations alone (checked above: they are in hand).
  const eaten = Math.min(next.goods.food ?? 0, option.food)
  next = {
    ...next,
    day: next.day + option.days,
    goods: { ...next.goods, food: (next.goods.food ?? 0) - eaten },
  }
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
