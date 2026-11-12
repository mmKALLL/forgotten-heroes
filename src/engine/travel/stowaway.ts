import type { Content } from '../../content/build'
import type { Tier } from '../../schema/types'
import type { GameState } from '../../schema/state'
import type { Route } from '../../schema/world'
import { allSituations } from '../encounters/compile'
import { MAX_EXHAUSTION } from '../encounters/effects'
import { fitsPlace, type Place } from '../encounters/run'
import { formatModifier } from '../format'
import { TIER_TONE, appendLog } from '../log'
import { withRng } from '../rng'
import { chooseActor } from '../rules/character'
import { TIER_LABELS, rollCheck, tierOdds } from '../rules/checks'
import { fadeStrainAfter, useSkill } from '../rules/strain'
import { fareFor } from './routes'
import {
  STOWAWAY_BRAWL_DAMAGE,
  STOWAWAY_BRAWL_TAG,
  STOWAWAY_DC,
  STOWAWAY_WORK_DAYS,
  STOWAWAY_WORK_EXHAUSTION,
} from './tuning'

// Stowing away (design §7, desperate measures): a party that can't pay a ship's fare may sneak
// aboard. depart() calls stowAway, then sets out with no fare.

export const STOWAWAY_SKILL = 'stealth' as const

/**
 * What a stowaway roll's tier leads to (stowAway): slipping aboard unseen, being put to work for
 * the passage (days lost, and exhaustion for the one caught), a fine of all the party's coin, or
 * a brawl.
 */
export type StowawayTierOutcome =
  | { code: 'unseen' }
  | { code: 'worked'; params: { days: number; exhaustion: number } }
  | { code: 'fined'; params: { gold: number } }
  | { code: 'brawl' }

/** Who would sneak the party aboard, against what DC, the odds of every tier and what follows. */
export type StowawayCheck = {
  actorId: string
  skill: typeof STOWAWAY_SKILL
  dc: number
  modifier: number
  odds: Record<Tier, number>
  outcomes: Record<Tier, StowawayTierOutcome>
}

const WORKED: StowawayTierOutcome = {
  code: 'worked',
  params: { days: STOWAWAY_WORK_DAYS, exhaustion: STOWAWAY_WORK_EXHAUSTION },
}

/**
 * What each tier leads to for a party with this much coin: a success slips aboard; a partial is
 * put to work; a failure is fined all its coin, or put to work with none; a critical failure is
 * a brawl.
 */
export function stowawayOutcomes(gold: number): Record<Tier, StowawayTierOutcome> {
  return {
    critSuccess: { code: 'unseen' },
    success: { code: 'unseen' },
    partial: WORKED,
    fail: gold > 0 ? { code: 'fined', params: { gold } } : WORKED,
    critFail: { code: 'brawl' },
  }
}

/** Why the party can't stow away on this route, or null if it can. */
export function stowawayRefusal(
  state: Pick<GameState, 'gold' | 'party'>,
  route: Pick<Route, 'km' | 'terrain'>
): string | null {
  if (route.terrain !== 'sea') return 'Only a ship can be stowed away on.'
  if (state.gold >= fareFor(route, state.party.length)) return 'The party can pay its passage.'
  if (!chooseActor(state.party, STOWAWAY_SKILL)) return 'No one is fit to sneak aboard.'
  return null
}

/** The stowaway check on a sea route the party can't pay for; null when it isn't an option. */
export function stowawayCheck(
  state: Pick<GameState, 'gold' | 'party'>,
  route: Pick<Route, 'km' | 'terrain'>
): StowawayCheck | null {
  if (stowawayRefusal(state, route) !== null) return null
  const actor = chooseActor(state.party, STOWAWAY_SKILL)!
  return {
    actorId: actor.characterId,
    skill: STOWAWAY_SKILL,
    dc: STOWAWAY_DC,
    modifier: actor.modifier,
    odds: tierOdds(actor.modifier, STOWAWAY_DC),
    outcomes: stowawayOutcomes(state.gold),
  }
}

/** What happened on the gangplank, for depart's own departure line. */
export type StowawayOutcome = StowawayTierOutcome['code']

/** The party works its passage off in port: days pass (the crew feeds it) and the caught one tires. */
function putToWork(state: GameState, actorId: string): GameState {
  const party = state.party.map((c) => {
    let next = c
    for (let d = 0; d < STOWAWAY_WORK_DAYS; d++)
      next = fadeStrainAfter(next, state.skillUses, state.day + d)
    return c.id === actorId
      ? {
          ...next,
          exhaustion: Math.min(MAX_EXHAUSTION, next.exhaustion + STOWAWAY_WORK_EXHAUSTION),
        }
      : next
  })
  return { ...state, party, day: state.day + STOWAWAY_WORK_DAYS }
}

/**
 * Rolls the stowaway check (Stealth, the best fit member, DC STOWAWAY_DC; it counts toward
 * Strain) and applies what follows:
 * - success: the party slips aboard unseen;
 * - partial: caught at the gangplank, and put to work for its passage;
 * - failure: caught and fined all its coin, or put to work if it has none;
 * - critical failure: a brawl. depart() starts a hostile sea situation tagged STOWAWAY_BRAWL_TAG
 *   if one exists (brawlCandidates); otherwise the one caught takes STOWAWAY_BRAWL_DAMAGE.
 * Whatever happens, the ship sails with the party aboard. Call only when stowawayRefusal is null.
 */
export function stowAway(
  state: GameState,
  content: Content,
  place: Place | null
): { state: GameState; outcome: StowawayOutcome; brawl: string | null } {
  const actor = chooseActor(state.party, STOWAWAY_SKILL)!
  const name = state.party.find((c) => c.id === actor.characterId)?.name ?? '?'
  const [roll, rng] = rollCheck(state.rng, actor.modifier, STOWAWAY_DC)
  const { party, skillUses, strained } = useSkill(state, actor.characterId, STOWAWAY_SKILL)
  const inspired = roll.tier === 'critSuccess'
  let next = appendLog(
    {
      ...state,
      rng,
      party,
      skillUses,
      inspiration: state.inspiration + (inspired ? 1 : 0),
      lastRoll: { ...roll, stat: STOWAWAY_SKILL, actorId: actor.characterId },
    },
    `${name} rolls Stealth to stow away: ${roll.kept} ${formatModifier(roll.modifier)} = ` +
      `${roll.total} vs DC ${STOWAWAY_DC}. ${TIER_LABELS[roll.tier]}.` +
      (inspired ? ' Inspiration gained!' : ''),
    TIER_TONE[roll.tier]
  )
  if (strained > 0) {
    next = appendLog(next, `${name} is strained: Stealth −${strained} until it fades.`, 'bad')
  }
  const work = (s: GameState, why: string): GameState =>
    appendLog(
      putToWork(s, actor.characterId),
      `${why} The captain puts the party to work for its passage: ${STOWAWAY_WORK_DAYS} days ` +
        `hauling cargo, and ${name} gains a level of exhaustion.`,
      'bad'
    )

  const outcome = stowawayOutcomes(next.gold)[roll.tier]
  switch (outcome.code) {
    case 'unseen':
      return {
        state: appendLog(next, 'The party slips aboard unseen.', 'good'),
        outcome: 'unseen',
        brawl: null,
      }
    case 'worked':
      return {
        state: work(
          next,
          roll.tier === 'partial'
            ? 'The party is caught at the gangplank.'
            : 'The party is caught sneaking aboard with no coin for a fine.'
        ),
        outcome: 'worked',
        brawl: null,
      }
    case 'fined':
      return {
        state: appendLog(
          { ...next, gold: 0 },
          `The party is caught sneaking aboard and fined all its coin (${outcome.params.gold} gp), ` +
            'then sails below decks.',
          'bad'
        ),
        outcome: 'fined',
        brawl: null,
      }
    case 'brawl': {
      const caught = appendLog(next, 'A sailor raises the alarm, and a brawl breaks out.', 'bad')
      const [{ brawl, damage }, rolled] = withRng(caught.rng, (d) => {
        const candidates = brawlCandidates(content, place)
        if (candidates.length > 0) {
          return { brawl: d.weighted(candidates, (s) => s.weight).id, damage: 0 }
        }
        return { brawl: null, damage: d.int(...STOWAWAY_BRAWL_DAMAGE) }
      })
      if (brawl) return { state: { ...caught, rng: rolled }, outcome: 'brawl', brawl }
      const hurt = {
        ...caught,
        rng: rolled,
        party: caught.party.map((c) =>
          c.id === actor.characterId ? { ...c, hp: Math.max(0, c.hp - damage) } : c
        ),
      }
      return {
        state: appendLog(
          hurt,
          `${name} takes ${damage} damage before the crew lets the party sail on below decks.`,
          'bad'
        ),
        outcome: 'brawl',
        brawl: null,
      }
    }
  }
}

/** Hostile situations tagged STOWAWAY_BRAWL_TAG that can happen aboard a ship here. */
export function brawlCandidates(content: Content, place: Place | null) {
  return allSituations(content).filter(
    (s) =>
      s.disposition === 'hostile' &&
      s.tags.includes(STOWAWAY_BRAWL_TAG) &&
      !s.followUpOnly &&
      !s.site &&
      s.weight > 0 &&
      place !== null &&
      fitsPlace(s, place)
  )
}
