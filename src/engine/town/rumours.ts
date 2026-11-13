import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { revealPois } from '../encounters/effects'
import { allSituations } from '../encounters/compile'
import { inProgress, startEncounter } from '../encounters/run'
import { heardPrices, marketTalk, pricesOn } from '../economy/trade'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { withRng } from '../rng'
import { statLabel } from '../rules/abilities'
import { canAct, chooseLead } from '../rules/character'
import { TIERS, TIER_LABELS, normalizeDc, rollCheck, tierOdds, type Tier } from '../rules/checks'
import { useSkill } from '../rules/strain'
import { nearestSettlements } from '../travel/reach'
import { inSettlement, notHere } from '../travel/where'
import { settlementName } from '../world/geo'
import { poisToDiscover } from '../world/pois'
import { crisisHidden } from '../crisis/sites'
import {
  crisisRumour,
  crisisRumourText,
  hearCrisisRumour,
  type CrisisRumour,
} from '../crisis/clues'
import { serviceWith } from './animals'
import { personStanding, settlementStanding, shopKeeper, standingSteps } from './reputation'
import {
  PICKPOCKET_GP,
  RUMOUR_DC,
  RUMOUR_PRICE,
  RUMOUR_PRICE_DAYS,
  RUMOUR_PRICE_STEP,
  RUMOUR_PRICES,
  RUMOUR_TROUBLE_FIGHT,
} from '../constants'

// Rumours at the tavern (design §4, §6; Plan 4 B3): buy a round, listen, and come away with other
// towns' prices (heard, dated by distance and a little off), a clue to a site, or a lead on work.
// What is heard is never false: a partial is idle gossip, and a critical failure is trouble.

/** The skills a rumour check can use; the better one rolls (Insight on a tie). */
export const RUMOUR_SKILLS = ['insight', 'persuasion'] as const
/** doneHere keys: rumours heard this arrival, and a lead on work (a bonus offer, contracts.ts). */
export const RUMOURS_DONE = 'rumours'
export const RUMOUR_LEAD = 'lead'

/** A critical failure starts a hostile situation with this tag (a tavern brawl), if one exists. */
export const RUMOUR_TROUBLE_TAG = 'tavern-trouble'

/** What each tier brings (English). Critical tiers stay hidden in previews. */
export const RUMOUR_OUTCOMES: Readonly<Record<Tier, string>> = {
  critFail: 'Trouble: a pickpocket, or a fight',
  fail: 'Nothing worth hearing',
  partial: 'Idle gossip and old news, of no use',
  success: "Two nearby towns' prices, and word of a site",
  critSuccess: "Three towns' prices, word of a site, and a lead on work",
}

/** One outcome row of the preview; `text` is null for a critical tier (a surprise). */
export type RumourOutcome = { tier: Tier; text: string | null; hidden: boolean }

/** A round for the table: RUMOUR_PRICE, rising linearly by RUMOUR_PRICE_STEP per RUMOUR_PRICE_DAYS, to the nearest gp. */
export const rumourPrice = (day: number): number =>
  Math.round(RUMOUR_PRICE + (RUMOUR_PRICE_STEP * Math.max(0, day - 1)) / RUMOUR_PRICE_DAYS)

/** Listening for rumours here: who listens, with what, the DC, the round's cost and the odds. */
export type RumourOption = {
  service: string
  actorId: string
  skill: (typeof RUMOUR_SKILLS)[number]
  modifier: number
  /** RUMOUR_DC less the party's standing steps here (better standing, easier talk). */
  dc: number
  /** A round for the table: rumourPrice(day). */
  cost: number
  chances: Record<Tier, number>
  outcomes: RumourOutcome[]
  /** What a success adds about the Crisis (crisis/clues.ts), also said in its outcome text. */
  crisis: CrisisRumour | null
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
    const actor = chooseLead(state.party, skill, 'rumours')
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
    cost: rumourPrice(state.day),
    chances: tierOdds(best.actor.modifier, dc),
    outcomes: TIERS.map((tier) => {
      const hidden = tier === 'critFail' || tier === 'critSuccess'
      const crisis = tier === 'success' ? crisisRumourText(state, content, state.location!) : ''
      return { tier, text: hidden ? null : RUMOUR_OUTCOMES[tier] + crisis, hidden }
    }),
    crisis: crisisRumour(state, content, state.location!),
  }
}

/**
 * Heard prices from up to `count` of the nearest settlements (by road) whose prices the book
 * doesn't know fresher. Each is dated back by the steady days from there, and each price is off by
 * up to ±RUMOUR_SKEW.
 */
function hearPrices(
  state: GameState,
  content: Content,
  count: number
): { state: GameState; heard: string[] } {
  if (count <= 0) return { state, heard: [] }
  const here = state.location!
  const picked: { id: string; day: number }[] = []
  for (const n of nearestSettlements(content, here)) {
    if (picked.length >= count) break
    if (!Object.hasOwn(state.world.settlements, n.id)) continue
    const day = Math.max(1, state.day - n.days)
    const known = Object.hasOwn(state.priceBook, n.id) ? state.priceBook[n.id] : null
    if (known && known.day >= day) continue
    if (Object.keys(pricesOn(state, content, n.id, day)).length > 0) picked.push({ id: n.id, day })
  }
  const [priceBook, rng] = withRng(state.rng, (d) => {
    const book = { ...state.priceBook }
    for (const n of picked) {
      book[n.id] = { day: n.day, heard: true, prices: heardPrices(d, state, content, n.id, n.day) }
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

/** Harmless talk for a partial: nothing about prices, sites or work (seeded pick). */
const GOSSIP: readonly string[] = [
  "The talk is of the miller's daughter and the tinker, and who saw what behind the granary.",
  'An old soldier tells the war of his youth again, battle by battle, to anyone who will listen.',
  'Everyone has an opinion on last spring’s flood, and none of them agree.',
  'A long argument about whose grandfather built the bridge, settled by nobody.',
  'Talk of a two-headed calf born three valleys over, years ago now.',
]

/** Hostile situations tagged RUMOUR_TROUBLE_TAG (a tavern brawl), never drawn on the road. */
export const troubleCandidates = (content: Content) =>
  allSituations(content).filter(
    (s) => s.disposition === 'hostile' && s.tags.includes(RUMOUR_TROUBLE_TAG) && !s.site
  )

/**
 * A critical failure: trouble (seeded). With chance RUMOUR_TROUBLE_FIGHT a fight breaks out (a
 * situation tagged RUMOUR_TROUBLE_TAG starts); otherwise, or when there is none, a pickpocket
 * lifts PICKPOCKET_GP (1d6) gp, as far as the purse goes.
 */
function trouble(state: GameState, content: Content): GameState {
  const fights = troubleCandidates(content)
  const [{ fight, gp }, rng] = withRng(state.rng, (d) => {
    const fight = fights.length > 0 && d.float() < RUMOUR_TROUBLE_FIGHT ? d.pick(fights) : null
    return { fight, gp: fight ? 0 : d.int(...PICKPOCKET_GP) }
  })
  const next = { ...state, rng }
  if (fight) return startEncounter(next, content, fight.id)
  const lifted = Math.min(gp, Math.max(0, next.gold))
  return appendLog(
    { ...next, gold: next.gold - lifted },
    lifted > 0
      ? `Too busy listening, you miss the hand in your purse: a pickpocket lifts ${lifted} gp.`
      : 'A hand slips into your purse and finds it empty.',
    'bad'
  )
}

/**
 * Buys a round and listens: the best of Insight and Persuasion rolls against the rumour DC (it
 * counts toward Strain; a natural 20 grants Inspiration). No day passes; once per arrival. A
 * success brings heard prices (RUMOUR_PRICES), a clue to an undiscovered site in this land (the
 * Crisis's reveal site while its plan is unknown) and any news of the Crisis (crisis/clues.ts),
 * and a critical success a lead too (a bonus offer on the board here). A partial is idle gossip, a
 * failure nothing worth hearing, and a critical failure trouble: a pickpocket or a fight.
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
  const heard = hearPrices(next, content, RUMOUR_PRICES[tier])
  next = heard.state
  if (heard.heard.length > 0) {
    next = appendLog(next, `You hear talk of prices in ${listNames(next, heard.heard)}.`, 'info')
    // ...and of what each is short of or awash with, as it was when the news left.
    for (const id of heard.heard) {
      const talk = marketTalk(next, content, id, next.priceBook[id]?.day ?? next.day)
      if (talk) next = appendLog(next, talk, 'info')
    }
  } else if (tier === 'partial') {
    const [line, rng] = withRng(next.rng, (d) => d.pick(GOSSIP))
    next = appendLog({ ...next, rng }, line, 'info')
  } else if (tier === 'fail') {
    next = appendLog(next, 'The talk is all weather and old grudges.', 'info')
  }
  if (tier === 'success' || tier === 'critSuccess') {
    // While the plan is unknown, the site heard of is the Crisis's reveal site (crisis/clues.ts).
    if (crisisRumour(next, content, here) !== 'reveal') {
      const search = { count: 1, scope: 'land' } as const
      const ids = poisToDiscover(next.world, content, here, search, crisisHidden(next))
      if (ids.length > 0) next = revealPois(next, content, ids)
    }
    next = hearCrisisRumour(next, content, here, tier === 'critSuccess')
  }
  if (tier === 'critSuccess') {
    next = appendLog(next, 'Someone mentions work going begging: look at the board here.', 'good')
  }
  return tier === 'critFail' ? trouble(next, content) : next
}
