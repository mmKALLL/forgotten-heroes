import type { Content } from '../../content/build'
import type { Biome } from '../../schema/types'
import type { GameState } from '../../schema/state'
import type { PoiState } from '../../schema/world'
import { revealPois } from '../encounters/effects'

export { NOTHING_TO_LEARN } from '../encounters/effects'
import { allSituations } from '../encounters/compile'
import { fitsPlace, inProgress, startEncounter, type Place } from '../encounters/run'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { withRng } from '../rng'
import { statLabel } from '../rules/abilities'
import { canAct, chooseLead } from '../rules/character'
import { TIERS, TIER_LABELS, rollCheck, tierOdds, type Tier } from '../rules/checks'
import { useSkill } from '../rules/strain'
import { forageDay } from '../travel/forage'
import { passDay } from '../travel/supplies'
import { settlementName } from './geo'
import { domainAt, poisToDiscover } from './pois'
import { crisisHidden } from '../crisis/sites'
import { crisisRefusal, crisisVisit } from '../crisis/progress'
import { omenFactor } from '../crisis/clues'
import { siteStatus } from './sites'
import { dungeonOf, siteCr } from './dungeons'
import { enterDungeon } from './delve'
import { contractDc, crOffset } from '../rules/levels'
import { rumourOption, type RumourOption } from '../town/rumours'
import { siteContractsMet } from '../town/contract-hooks'
import {
  DEFAULT_PACE,
  EXPLORE_DAYS,
  EXPLORE_DC_BONUS,
  EXPLORE_FINDS,
  FORAGE_DC,
} from '../constants'

// Visiting and exploring points of interest (design §6). A visit plays one of the site's
// situations; exploring spends days searching the domain for sites not yet found.

/** The skills a search can use; the better one rolls (Survival on a tie). */
export const EXPLORE_SKILLS = ['survival', 'perception'] as const
/** Logged when a successful search finds nothing: the domain has no sites left to find. */
export const PICKED_CLEAN = 'This area seems picked clean.'

const BUSY = 'Finish the current encounter first.'

/** What exploring would be: who searches, with what, against what DC, and every tier's odds. */
export type ExploreOption = {
  actorId: string
  skill: (typeof EXPLORE_SKILLS)[number]
  modifier: number
  dc: number
  days: number
  /** The odds of each tier (tierOdds). */
  chances: Record<Tier, number>
  /** The chance to find at least one site (the tiers that find something). */
  findChance: number
  /** What each tier leads to, in TIERS order (English). */
  outcomes: string[]
  /** The sites each tier finds and the days it takes, for previews in any language. */
  finds: Record<Tier, { found: number; days: number }>
}

/** What each tier of a search leads to (English; in TIERS order in exploreOption). */
export const EXPLORE_OUTCOMES: Readonly<Record<Tier, string>> = {
  critFail: 'Nothing found, and trouble finds you',
  fail: 'Nothing found',
  partial: `One site found, after ${EXPLORE_DAYS + 1} days`,
  success: 'One site found',
  critSuccess: 'Two sites found',
}

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/** The domain the party is in (a settlement's own, or a POI's owner), when not on the road. */
const domainHere = (state: GameState): string | null =>
  state.travel ? null : domainAt(state.world, state.location)

/** A domain's terrain: its settlement's land biome. */
function domainTerrain(content: Content, domainId: string): Biome | null {
  const site = own(content.settlements, domainId)
  return own(content.regions, site?.region)?.biome ?? null
}

/** Where the party is, as an encounter place: a POI's spot terrain, or the domain's. */
function placeHere(state: GameState, content: Content): Place | null {
  const domain = domainHere(state)
  const site = own(content.settlements, domain)
  if (!domain || !site) return null
  const poi = own(state.world.pois, state.location)
  const spot = own(content.landSpots, poi?.spot)
  const biome = spot?.terrain ?? domainTerrain(content, domain)
  return biome ? { biome, land: site.region, domain } : null
}

/**
 * Exploring the domain the party is in (a settlement or a POI): null on the road, during an
 * encounter, or when no one can act. It is offered even when nothing is left to find; only a
 * successful search then says so (PICKED_CLEAN).
 */
export function exploreOption(state: GameState, content: Content): ExploreOption | null {
  if (inProgress(state)) return null
  const domain = domainHere(state)
  const terrain = domain ? domainTerrain(content, domain) : null
  if (!terrain || terrain === 'sea') return null
  const [best] = EXPLORE_SKILLS.flatMap((skill) => {
    const actor = chooseLead(state.party, skill, 'explore')
    return actor ? [{ skill, actor }] : []
  }).sort((a, b) => b.actor.modifier - a.actor.modifier)
  if (!best) return null
  const dc = FORAGE_DC[terrain] + EXPLORE_DC_BONUS
  const chances = tierOdds(best.actor.modifier, dc)
  return {
    actorId: best.actor.characterId,
    skill: best.skill,
    modifier: best.actor.modifier,
    dc,
    days: EXPLORE_DAYS,
    chances,
    findChance: TIERS.filter((tier) => EXPLORE_FINDS[tier].found > 0).reduce(
      (p, t) => p + chances[t],
      0
    ),
    outcomes: TIERS.map((tier) => EXPLORE_OUTCOMES[tier]),
    finds: Object.fromEntries(
      TIERS.map((tier) => [
        tier,
        { found: EXPLORE_FINDS[tier].found, days: EXPLORE_DAYS + EXPLORE_FINDS[tier].extraDays },
      ])
    ) as Record<Tier, { found: number; days: number }>,
  }
}

/**
 * Searches the domain for undiscovered sites: the explorer rolls (it counts toward Strain; a
 * natural 20 grants Inspiration), then the party camps EXPLORE_DAYS days (one more on a partial),
 * foraging and eating its own food even in town. Then it finds the nearest undiscovered sites the
 * tier allows (EXPLORE_FINDS). A critical failure draws a hostile road encounter for the place instead.
 */
export function explore(state: GameState, content: Content): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const option = exploreOption(state, content)
  const domain = domainHere(state)
  if (!option || !domain) {
    return appendLog(
      state,
      state.party.some(canAct)
        ? 'There is nowhere to explore from here.'
        : 'No one is able to act.',
      'bad'
    )
  }
  const name = state.party.find((c) => c.id === option.actorId)?.name ?? '?'
  const [roll, rng] = rollCheck(state.rng, option.modifier, option.dc)
  const { party, skillUses, strained } = useSkill(state, option.actorId, option.skill)
  const inspired = roll.tier === 'critSuccess'
  const finds = EXPLORE_FINDS[roll.tier]
  const days = option.days + finds.extraDays
  let next = appendLog(
    {
      ...state,
      rng,
      party,
      skillUses,
      inspiration: state.inspiration + (inspired ? 1 : 0),
      lastRoll: { ...roll, stat: option.skill, actorId: option.actorId },
    },
    `${name} leads a search around ${settlementName(state, domain)} for ${days} days: ` +
      `${statLabel(option.skill)} ${roll.kept} ${formatModifier(roll.modifier)} = ${roll.total} ` +
      `vs DC ${option.dc}. ${TIER_LABELS[roll.tier]}.` +
      (inspired ? ' Inspiration gained!' : ''),
    TIER_TONE[roll.tier]
  )
  if (strained > 0) {
    next = appendLog(
      next,
      `${name} is strained: ${statLabel(option.skill)} −${strained} until it fades.`,
      'bad'
    )
  }
  const terrain = domainTerrain(content, domain)
  for (let day = 0; day < days; day++) {
    next = forageDay(next, terrain, DEFAULT_PACE).state
    next = passDay(next, terrain, DEFAULT_PACE, content)
  }
  if (finds.found > 0) {
    const search = { count: finds.found, scope: 'domain' } as const
    const ids = poisToDiscover(next.world, content, domain, search, crisisHidden(next, domain))
    return ids.length > 0 ? revealPois(next, content, ids) : appendLog(next, PICKED_CLEAN, 'info')
  }
  if (roll.tier !== 'critFail') return appendLog(next, 'The search turns up nothing.', 'info')
  return ambush(next, content)
}

/** A critical failure: a hostile road situation that fits the place, if any, finds the party. */
const ambush = (state: GameState, content: Content): GameState =>
  drawAmbush(state, content) ??
  appendLog(state, 'The search turns up nothing but sore feet.', 'bad')

/** The hostile road situations that fit where the party is: what drawAmbush picks from. */
export function ambushCandidates(state: GameState, content: Content) {
  const place = placeHere(state, content)
  if (!place) return []
  return allSituations(content).filter(
    (s) =>
      s.disposition === 'hostile' &&
      !s.followUpOnly &&
      !s.site &&
      s.weight > 0 &&
      fitsPlace(s, place) &&
      omenFactor(state, content, s, place) > 0
  )
}

/**
 * Trouble finds a party working the land where it is (a search or a day's gathering gone badly):
 * a hostile road situation that fits the place starts, picked by weight. Null when none fits or
 * no one can act.
 */
export function drawAmbush(state: GameState, content: Content): GameState | null {
  const place = placeHere(state, content)
  const hostile = ambushCandidates(state, content)
  if (!place || hostile.length === 0 || !state.party.some(canAct)) return null
  const [picked, rng] = withRng(state.rng, (d) => d.weighted(hostile, (s) => s.weight).id)
  return startEncounter({ ...state, rng }, content, picked, place)
}

/**
 * Plays one of the POI's situations, picked by the seeded RNG, when the party is at a discovered
 * POI it hasn't visited since arriving, and that isn't a dungeon or lair lying empty. A site that
 * has grown stronger (siteStatus power) raises every check's DC by POWER_DC per level: startEncounter
 * hardens the snapshot with it, along with the day's danger (world/danger.ts).
 */
export function visitPoi(state: GameState, content: Content): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const id = state.travel ? null : state.location
  const poi = own(state.world.pois, id)
  if (!id || !poi || !poi.discovered) {
    return appendLog(state, 'There is no site to visit here.', 'bad')
  }
  const refused = visitRefusal(state, id, poi)
  if (refused) return appendLog(state, refused.text, 'bad')
  // An authored dungeon is delved room by room (world/delve.ts).
  if (dungeonOf(content, poi)) return enterDungeon(state, content, id)
  const type = own(content.poiTypes, poi.type)
  const known = new Set(allSituations(content).map((s) => s.id))
  const situations = type?.situations.filter((s) => known.has(s)) ?? []
  if (situations.length === 0) return appendLog(state, `Nothing happens at ${poi.name}.`, 'bad')
  const [situation, rng] = withRng(state.rng, (d) => d.pick(situations))
  const place = placeHere(state, content) ?? undefined
  // The current Crisis act's site is played at its challenge rating, with the Edge once the
  // villain's weakness is known.
  const crisis = crisisVisit(state, content, id)
  // A lair (or any hostile site) plays at its CR, or a held contract's on it when higher.
  const cr = siteCr(state.world, content, id, state.day)
  const jobs = state.contracts.filter((c) => c.poi === id && !c.met).map((c) => contractDc(c.level))
  const dcBonus = Math.max(cr === null ? 0 : crOffset(cr), ...jobs)
  const options = crisis.cr === undefined && dcBonus !== 0 ? { ...crisis, dcBonus } : crisis
  const started = startEncounter(
    { ...state, rng, visited: true },
    content,
    situation,
    place,
    id,
    options
  )
  // An errand to this site is done by going there (town/contracts.ts).
  return siteContractsMet(started, 'errand', id)
}

/**
 * Why a site can't be visited now: busy, lying empty (cleared), visited since the party arrived,
 * or a Crisis site where nothing more happens (quiet: crisis/progress.ts).
 */
export type VisitBlock = 'busy' | 'cleared' | 'visited' | 'quiet'

/** Why the party can't visit this (discovered) POI right now, or null when it can. */
function visitRefusal(
  state: GameState,
  id: string,
  poi: PoiState
): { code: VisitBlock; text: string } | null {
  if (inProgress(state)) return { code: 'busy', text: BUSY }
  const quiet = crisisRefusal(state, id)
  if (quiet) return { code: 'quiet', text: quiet }
  const status = siteStatus(state.world.seed, id, poi, state.day)
  if (status?.phase === 'empty') {
    return { code: 'cleared', text: `${poi.name} lies empty for now.` }
  }
  if (state.visited) {
    return {
      code: 'visited',
      text: `You have already visited ${poi.name}. Leave and come back another time.`,
    }
  }
  return null
}

/** The site actions open where the party is, with their previews. */
export type SiteAction =
  | { type: 'explore'; option: ExploreOption }
  /** Listening for rumours at the tavern here (town/rumours.ts), once per arrival. */
  | { type: 'listenRumours'; option: RumourOption }
  | {
      type: 'visitPoi'
      poiId: string
      available: boolean
      /** Why not (English), and the same as a code for the UI; null when available. */
      reason: string | null
      code: VisitBlock | null
    }

/**
 * Exploring (with its preview), visiting when the party is at a discovered POI, and listening for
 * rumours when there is a tavern here that hasn't been heard this arrival.
 */
export function siteActions(state: GameState, content: Content): SiteAction[] {
  const actions: SiteAction[] = []
  const poi = state.travel ? undefined : own(state.world.pois, state.location)
  if (poi?.discovered && state.location) {
    const refused = visitRefusal(state, state.location, poi)
    actions.push({
      type: 'visitPoi',
      poiId: state.location,
      available: !refused,
      reason: refused?.text ?? null,
      code: refused?.code ?? null,
    })
  }
  const option = exploreOption(state, content)
  if (option) actions.push({ type: 'explore', option })
  const rumours = rumourOption(state, content)
  if (rumours) actions.push({ type: 'listenRumours', option: rumours })
  return actions
}
