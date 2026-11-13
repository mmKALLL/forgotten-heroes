import type { Content } from '../../content/build'
import type { Situation } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { revealPois } from '../encounters/effects'
import type { Place } from '../encounters/run'
import { appendLog } from '../log'
import { personDisplayName } from '../town/people'
import { compass } from '../world/geo'
import { crisisClue } from './progress'
import { actOpen, crisisDecided, crisisStatus, planKnown } from './status'
import { crisisText, shortName, siteLand, villainOf } from './text'
import { CRISIS_OMEN_FAVOUR, CRISIS_RUMOUR_CLUES, CRISIS_WEAKNESS_CLUES } from '../constants'

// How word of the Crisis reaches the party (Plans 5b and 6, design §10b): tavern rumours, a
// summons on arriving somewhere once act I has opened, and omens met on the road. Each follows the
// open act, pointing to where it is played (its lead site, then its key site).

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/**
 * What a rumour success in `here` adds about the Crisis, while an act is open:
 * - reveal: act I's plan is unknown and its lead site hidden, so the site heard of is the lead;
 * - clue: `here` is in the land of the act's site (its lead, then its key site): a clue
 *   (CRISIS_RUMOUR_CLUES, +1 on a critical success), unless it already has CRISIS_WEAKNESS_CLUES
 *   (then null: nothing new);
 * - direction: elsewhere, a line pointing the way, no clue.
 * Null with no Crisis, while no act is open, or once it is decided.
 */
export type CrisisRumour = 'reveal' | 'clue' | 'direction'

export function crisisRumour(
  state: GameState,
  content: Content,
  here: string
): CrisisRumour | null {
  const crisis = state.crisis
  if (!crisis || !villainOf(content, crisis)) return null
  const status = crisisStatus(crisis, state.day)
  if (!actOpen(status.phase)) return null
  if (!planKnown(crisis)) {
    if (own(state.world.pois, crisis.acts[0].lead)?.discovered === false) return 'reveal'
  }
  const land = siteLand(state, content, status.target!)
  if (land === undefined || own(content.settlements, here)?.region !== land) return 'direction'
  return status.clues >= CRISIS_WEAKNESS_CLUES ? null : 'clue'
}

/** How a rumour success's preview says what it adds about the Crisis (English), or ''. */
export function crisisRumourText(state: GameState, content: Content, here: string): string {
  const kind = crisisRumour(state, content, here)
  const name = state.crisis ? shortName(state.crisis.name) : ''
  switch (kind) {
    case 'reveal':
      return ', where something stirs'
    case 'clue':
      return `, and a clue to ${name}'s plot`
    case 'direction':
      return `, and talk of ${name}'s doings`
    case null:
      return ''
  }
}

/**
 * Applies a rumour success's Crisis news in `here` (see crisisRumour): the omen and act I's lead
 * site (which the caller hears in place of an ordinary site), a clue, or the way to the act's land.
 */
export function hearCrisisRumour(
  state: GameState,
  content: Content,
  here: string,
  critical: boolean
): GameState {
  const crisis = state.crisis!
  switch (crisisRumour(state, content, here)) {
    case 'reveal': {
      const villain = villainOf(content, crisis)!
      const told = appendLog(
        state,
        `Over the ale, someone says: "${crisisText(state, content, crisis, villain.omen)}"`,
        'info'
      )
      return revealPois(told, content, [crisis.acts[0].lead])
    }
    case 'clue':
      return crisisClue(state, content, CRISIS_RUMOUR_CLUES + (critical ? 1 : 0))
    case 'direction': {
      const status = crisisStatus(crisis, state.day)
      const land = siteLand(state, content, status.target!)
      const region = own(content.regions, land)
      const from = own(content.settlements, here)
      if (!region || !from) return state
      return appendLog(
        state,
        `Talk of ${shortName(crisis.name)}'s doings comes from the ` +
          `${compass(from.at, region.label)}, out of ${region.name}.`,
        'info'
      )
    }
    case null:
      return state
  }
}

/** Who tells the party of the Crisis, in this order of the notable people living there. */
export const SUMMONS_ROLES = [
  'elder',
  'reeve',
  'mayor',
  'priest',
  'watch-captain',
  'sage',
  'innkeeper',
] as const

/**
 * The summons, the guaranteed way to hear of the Crisis: once act I has opened, arriving in a
 * settlement while the plan is unknown and act I's lead site hidden, a notable person who lives
 * there (by SUMMONS_ROLES), or else a frightened traveller, tells the villain's omen and of the
 * lead site, which is revealed. It happens once: the site is then known.
 */
export function summonsOnArrival(state: GameState, content: Content): GameState {
  const crisis = state.crisis
  const villain = crisis && villainOf(content, crisis)
  const here = state.travel ? null : state.location
  if (!crisis || !villain || !here || !Object.hasOwn(state.world.settlements, here)) return state
  const status = crisisStatus(crisis, state.day)
  if (status.phase !== 'investigation' || status.act !== 0 || planKnown(crisis)) return state
  const site = own(state.world.pois, crisis.acts[0].lead)
  if (!site || site.discovered) return state
  const people = Object.entries(state.world.people).filter(([, p]) => p.settlement === here)
  const teller = SUMMONS_ROLES.flatMap((role) => people.filter(([, p]) => p.role === role))[0]
  const who = teller ? personDisplayName(state.world, content, teller[0]) : 'A frightened traveller'
  const told = appendLog(
    state,
    `${who} takes you aside: "${crisisText(state, content, crisis, villain.omen)}" ` +
      `They tell you of ${site.name}.`,
    'bad'
  )
  return revealPois(told, content, [crisis.acts[0].lead])
}

/**
 * An omen's draw weight factor on the road: 0 (never drawn) unless the Crisis of one of its
 * villains is undecided; CRISIS_OMEN_FAVOUR on a road touching the land of the open act's site;
 * else 1. Situations that name no villain are 1.
 */
export function omenFactor(
  state: GameState,
  content: Content,
  situation: Pick<Situation, 'villains'>,
  place?: Pick<Place, 'land'>
): number {
  if (situation.villains.length === 0) return 1
  const crisis = state.crisis
  if (!crisis || !situation.villains.includes(crisis.villain)) return 0
  if (crisisDecided(crisis, state.day)) return 0
  const status = crisisStatus(crisis, state.day)
  if (status.target === null) return 1
  const land = siteLand(state, content, status.target)
  const ends = state.travel
    ? [state.travel.from, state.travel.to].map(
        (id) => own(content.settlements, own(state.world.pois, id)?.domain ?? id)?.region
      )
    : []
  return land !== undefined && (place?.land === land || ends.includes(land))
    ? CRISIS_OMEN_FAVOUR
    : 1
}
