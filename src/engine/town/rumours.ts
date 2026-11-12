import type { Content } from '../../content/build'
import { GOODS } from '../../schema/types'
import type { GameState, PriceBookEntry } from '../../schema/state'
import { revealPois } from '../encounters/effects'
import { inProgress } from '../encounters/run'
import { wholeGp } from '../economy/market'
import { marketPrices } from '../economy/trade'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { withRng, type Draw } from '../rng'
import { statLabel } from '../rules/abilities'
import { canAct, chooseActor } from '../rules/character'
import { TIERS, TIER_LABELS, normalizeDc, rollCheck, tierOdds, type Tier } from '../rules/checks'
import { useSkill } from '../rules/strain'
import { nearestSettlements } from '../travel/reach'
import { inSettlement, notHere } from '../travel/where'
import { settlementName } from '../world/geo'
import { poisToDiscover } from '../world/pois'
import { serviceWith } from './animals'
import { personStanding, settlementStanding, shopKeeper, standingSteps } from './reputation'
import {
  FALSE_RUMOUR_SKEW,
  RUMOUR_DC,
  RUMOUR_PRICE,
  RUMOUR_PRICES,
  RUMOUR_SKEW,
} from '../constants'

// Rumours at the tavern (design §4, §6; Plan 4 B3): buy a round, listen, and come away with other
// towns' prices (heard, dated by distance and a little off), a clue to a site, or a lead on work.

/** The skills a rumour check can use; the better one rolls (Insight on a tie). */
export const RUMOUR_SKILLS = ['insight', 'persuasion'] as const
/** doneHere keys: rumours heard this arrival, and a lead on work (a bonus offer, contracts.ts). */
export const RUMOURS_DONE = 'rumours'
export const RUMOUR_LEAD = 'lead'

/** What each tier brings (English). Critical tiers stay hidden in previews. */
export const RUMOUR_OUTCOMES: Readonly<Record<Tier, string>> = {
  critFail: 'A false rumour, told with a straight face',
  fail: 'Nothing worth hearing',
  partial: "One nearby town's prices",
  success: "Two nearby towns' prices, and word of a site",
  critSuccess: "Three towns' prices, word of a site, and a lead on work",
}

/** One outcome row of the preview; `text` is null for a critical tier (a surprise). */
export type RumourOutcome = { tier: Tier; text: string | null; hidden: boolean }

/** Listening for rumours here: who listens, with what, the DC, the round's cost and the odds. */
export type RumourOption = {
  service: string
  actorId: string
  skill: (typeof RUMOUR_SKILLS)[number]
  modifier: number
  /** RUMOUR_DC less the party's standing steps here (better standing, easier talk). */
  dc: number
  /** A round for the table: RUMOUR_PRICE per member. */
  cost: number
  chances: Record<Tier, number>
  outcomes: RumourOutcome[]
}

const BUSY = 'Finish the current encounter first.'

/** The better of the settlement's and the tavern keeper's standing, as steps above stranger. */
function standingHere(state: GameState, content: Content, here: string, service: string): number {
  const keeper = shopKeeper(state, content, here, service)
  const steps = standingSteps(settlementStanding(state, here))
  return keeper ? Math.max(steps, standingSteps(personStanding(state, keeper))) : steps
}

/** Why the party can't listen for rumours here now (English), or null. Gold is checked apart. */
export function rumourRefusal(state: GameState, content: Content): string | null {
  if (inProgress(state)) return BUSY
  if (!inSettlement(state)) return notHere(state, 'Rumours are heard in a settlement.')
  if (!serviceWith(state, content, 'rumours')) return 'There is no tavern here.'
  if (state.doneHere.includes(RUMOURS_DONE)) return 'You have heard the talk here already.'
  if (!state.party.some(canAct)) return 'No one is able to act.'
  return null
}

/**
 * The rumour check here, with its odds and the outcome of each tier (the critical ones hidden),
 * or null without a tavern, once heard this arrival, or when no one can act.
 */
export function rumourOption(state: GameState, content: Content): RumourOption | null {
  if (rumourRefusal(state, content)) return null
  const service = serviceWith(state, content, 'rumours')!
  const [best] = RUMOUR_SKILLS.flatMap((skill) => {
    const actor = chooseActor(state.party, skill)
    return actor ? [{ skill, actor }] : []
  }).sort((a, b) => b.actor.modifier - a.actor.modifier)
  if (!best) return null
  const dc = normalizeDc(RUMOUR_DC - standingHere(state, content, state.location!, service))
  return {
    service,
    actorId: best.actor.characterId,
    skill: best.skill,
    modifier: best.actor.modifier,
    dc,
    cost: RUMOUR_PRICE * state.party.length,
    chances: tierOdds(best.actor.modifier, dc),
    outcomes: TIERS.map((tier) => {
      const hidden = tier === 'critFail' || tier === 'critSuccess'
      return { tier, text: hidden ? null : RUMOUR_OUTCOMES[tier], hidden }
    }),
  }
}

/** A heard price, off by up to ±`skew` (seeded), in whole gold like the price book's. */
const skewed = (d: Draw, price: number | null, skew: number, sign?: 1 | -1): number | null => {
  if (price === null) return null
  const factor = sign === undefined ? 1 + (d.float() * 2 - 1) * skew : 1 + sign * skew
  return wholeGp(price * factor)
}

/**
 * Heard prices from up to `count` of the nearest settlements (by road) whose prices the book
 * doesn't know fresher. Each is dated back by the steady days from there, and each price is off by
 * up to ±RUMOUR_SKEW; a false rumour is off by FALSE_RUMOUR_SKEW, up or down, with no tell.
 */
function hearPrices(
  state: GameState,
  content: Content,
  count: number,
  misleading: boolean
): { state: GameState; heard: string[] } {
  if (count <= 0) return { state, heard: [] }
  const here = state.location!
  const picked: { id: string; day: number; prices: PriceBookEntry['prices'] }[] = []
  for (const n of nearestSettlements(content, here)) {
    if (picked.length >= count) break
    if (!Object.hasOwn(state.world.settlements, n.id)) continue
    const day = Math.max(1, state.day - n.days)
    const known = Object.hasOwn(state.priceBook, n.id) ? state.priceBook[n.id] : null
    if (known && known.day >= day) continue
    const prices = marketPrices({ ...state, day }, content, n.id)
    if (Object.keys(prices).length > 0) picked.push({ id: n.id, day, prices })
  }
  const [priceBook, rng] = withRng(state.rng, (d) => {
    const book = { ...state.priceBook }
    for (const n of picked) {
      const prices: PriceBookEntry['prices'] = {}
      for (const good of GOODS) {
        const p = n.prices[good]
        if (!p) continue
        const sign = misleading ? (d.float() < 0.5 ? -1 : 1) : undefined
        const skew = misleading ? FALSE_RUMOUR_SKEW : RUMOUR_SKEW
        prices[good] = { buy: skewed(d, p.buy, skew, sign), sell: skewed(d, p.sell, skew, sign) }
      }
      book[n.id] = { day: n.day, heard: true, prices }
    }
    return book
  })
  return { state: { ...state, rng, priceBook }, heard: picked.map((n) => n.id) }
}

const listNames = (state: GameState, ids: readonly string[]) => {
  const names = ids.map((id) => settlementName(state, id))
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * Buys a round and listens: the best of Insight and Persuasion rolls against the rumour DC (it
 * counts toward Strain; a natural 20 grants Inspiration). No day passes; once per arrival. The
 * tier brings heard prices (RUMOUR_PRICES), and from a success a clue to an undiscovered site in
 * this land, and from a critical success a lead (a bonus offer on the board here).
 */
export function listenRumours(state: GameState, content: Content): GameState {
  const refused = rumourRefusal(state, content)
  if (refused) return appendLog(state, refused, 'bad')
  const option = rumourOption(state, content)
  if (!option) return appendLog(state, 'No one is able to act.', 'bad')
  if (state.gold < option.cost) {
    return appendLog(state, `A round for the table costs ${option.cost} gp.`, 'bad')
  }
  const here = state.location!
  const name = state.party.find((c) => c.id === option.actorId)?.name ?? '?'
  const [roll, rng] = rollCheck(state.rng, option.modifier, option.dc)
  const { party, skillUses, strained } = useSkill(state, option.actorId, option.skill)
  const tier = roll.tier
  const inspired = tier === 'critSuccess'
  let next = appendLog(
    {
      ...state,
      rng,
      party,
      skillUses,
      gold: state.gold - option.cost,
      inspiration: state.inspiration + (inspired ? 1 : 0),
      lastRoll: { ...roll, stat: option.skill, actorId: option.actorId },
      doneHere: [
        ...state.doneHere,
        RUMOURS_DONE,
        ...(tier === 'critSuccess' && !state.doneHere.includes(RUMOUR_LEAD) ? [RUMOUR_LEAD] : []),
      ],
    },
    `You buy a round (${option.cost} gp) and ${name} listens: ${statLabel(option.skill)} ` +
      `${roll.kept} ${formatModifier(roll.modifier)} = ${roll.total} vs DC ${option.dc}. ` +
      `${TIER_LABELS[tier]}.` +
      (inspired ? ' Inspiration gained!' : ''),
    TIER_TONE[tier]
  )
  if (strained > 0) {
    next = appendLog(
      next,
      `${name} is strained: ${statLabel(option.skill)} −${strained} until it fades.`,
      'bad'
    )
  }
  const heard = hearPrices(next, content, RUMOUR_PRICES[tier], tier === 'critFail')
  next = heard.state
  if (heard.heard.length > 0) {
    // A false rumour reads like any other.
    next = appendLog(next, `You hear talk of prices in ${listNames(next, heard.heard)}.`, 'info')
  } else if (tier === 'fail' || tier === 'critFail') {
    next = appendLog(next, 'The talk is all weather and old grudges.', 'info')
  }
  if (tier === 'success' || tier === 'critSuccess') {
    const ids = poisToDiscover(next.world, content, here, { count: 1, scope: 'land' })
    if (ids.length > 0) next = revealPois(next, content, ids)
  }
  if (tier === 'critSuccess') {
    next = appendLog(next, 'Someone mentions work going begging: look at the board here.', 'good')
  }
  return next
}
