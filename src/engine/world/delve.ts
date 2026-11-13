import type { Content } from '../../content/build'
import type { Dungeon, DungeonRoom } from '../../schema/dungeon'
import type { DelveState, GameState } from '../../schema/state'
import { checkUpgrades } from '../rules/upgrades'
import { allSituations, compileSituation } from '../encounters/compile'
import { tierOutcome } from '../encounters/outcomes'
import { asRoom, type RoomRules } from '../encounters/room'
import { NO_TALLY, challengeOdds, roundChoices, type Footing } from '../encounters/challenge'
import { encounterOver, inProgress, startEncounter, unmetRequirements } from '../encounters/run'
import { appendLog } from '../log'
import { withRng } from '../rng'
import { crLevel } from '../rules/challenge'
import { canAct, chooseActor } from '../rules/character'
import { TIERS, tierOdds } from '../rules/checks'
import { crOffset, crWound, levelCr } from '../rules/levels'
import { siteContractsMet } from '../town/contract-hooks'
import { dangerLevel, harden } from './danger'
import { dungeonOf } from './dungeons'
import { dungeonXp, hoardOf, milestonePaid, type HoardEffect } from './hoard'
import { siteStatus } from './sites'
import { DELVE_WOUND, POWER_DC } from '../constants'

// Delving an authored dungeon (Plan 6 D3, design §6). Entering starts a delve: the rooms in order,
// each one situation drawn from its own, played in a row without leaving. A room is about twice an
// overworld encounter's risk: its DCs are rebased to the dungeon's CR (rules/levels.ts crOffset,
// on top of the danger ramp and the site's power) and its wounds are DELVE_WOUND × crWound(CR) as
// deep (Plan 6 B: deeper the higher its CR), or DELVE_WOUND × the party's HP factor
// (rules/levels.ts partyWound) when that is larger. A
// failed room that ends drives the party out (no hoard; the site stays, to be tried again on
// another arrival). Between rooms the party presses on or withdraws, keeping what it found
// (withdrawing isn't fleeing: no camaraderie). The last room's end pays the hoard and clears the
// site. All of it is written into each room's snapshot (encounters/room.ts), so the previews
// show it as chips and what they show is what happens.

export type DelveAction =
  /** Enter the next room of the dungeon being delved. */
  | { type: 'pressOn' }
  /** Leave the dungeon between rooms, keeping what was found. */
  | { type: 'withdraw' }

/** Actions that leave a delve as it is; any other withdraws first (state.ts). */
export const DELVE_ACTIONS: readonly string[] = [
  'pressOn',
  'withdraw',
  'chooseOption',
  'closeEncounter',
  'equipAccessory',
  'unequipAccessory',
  'dropGoods',
  'practiceCheck',
  'acknowledgeEnd',
]

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/**
 * The CR a dungeon is played at: its own, or a held contract's on the site when that is higher
 * (rules/levels.ts levelCr).
 */
function playedCr(state: GameState, poiId: string, dungeon: Dungeon): number {
  const jobs = state.contracts.filter((c) => c.poi === poiId && !c.met).map((c) => levelCr(c.level))
  return Math.max(dungeon.cr, ...jobs)
}

/**
 * How the room at `index` is played: its DC bonus over the danger ramp, its CR's wound factor
 * (harden: or the party's HP factor when larger), and its rules (DELVE_WOUND on top).
 */
function roomSetup(
  state: GameState,
  poiId: string,
  dungeon: Dungeon,
  index: number
): { dcBonus: number; wound: number; rules: RoomRules } {
  const last = index === dungeon.rooms.length - 1
  const cr = playedCr(state, poiId, dungeon)
  return {
    dcBonus: crOffset(cr),
    wound: crWound(cr),
    rules: {
      wound: DELVE_WOUND,
      hoard: last ? hoardOf(dungeon, dungeon.cr) : null,
      // A milestone room pays its share once per clearing (Plan 6 B): not when already paid.
      milestone:
        !last && dungeon.rooms[index].milestone && !milestonePaid(state, poiId, index)
          ? { effect: 'milestone', xp: dungeonXp(dungeon, dungeon.cr).milestone }
          : null,
    },
  }
}

/** The situations a room may draw that the content has. */
const roomSituations = (content: Content, room: DungeonRoom): string[] => {
  const known = new Set(allSituations(content).map((s) => s.id))
  return room.situations.filter((id) => known.has(id))
}

/**
 * Starts the delve's room (delve.room): one of its situations, drawn, played as a room. When no
 * encounter opens (broken content: startEncounter logs why), the delve ends with a line saying so,
 * rather than the room passing as if cleared.
 */
function startRoom(state: GameState, content: Content, delve: DelveState): GameState {
  const dungeon = own(content.dungeons, delve.dungeon)
  const room = dungeon?.rooms[delve.room]
  if (!dungeon || !room) return { ...state, delve: null }
  const situations = roomSituations(content, room)
  if (situations.length === 0) {
    return appendLog({ ...state, delve: null }, `Nothing stirs in ${dungeon.name}.`, 'bad')
  }
  const [situation, rng] = withRng(state.rng, (d) => d.pick(situations))
  const { dcBonus, wound, rules } = roomSetup(state, delve.poi, dungeon, delve.room)
  const entered = { ...delve, inRoom: true, ended: null }
  const opened = startEncounter(
    { ...state, rng, delve: entered },
    content,
    situation,
    undefined,
    delve.poi,
    {
      dcBonus,
      wound,
      room: rules,
      // The boss room offers a Fight against its boss beside the challenge (Plan 7).
      ...(rules.hoard && dungeon.climax
        ? {
            fights: {
              kind: 'climax' as const,
              cr: playedCr(state, delve.poi, dungeon),
              climax: dungeon.climax,
            },
          }
        : {}),
      lines: [{ text: `${room.name}. ${room.text}`, tone: 'info' }],
    }
  )
  if (opened.encounter !== null && opened.encounter !== state.encounter) return opened
  return appendLog(
    { ...opened, delve: null },
    `You can go no further into ${dungeon.name} than ${room.name}, and turn back. ` +
      'It can be tried again another time.',
    'bad'
  )
}

/**
 * The sites with these ids known by word (Plan 6 wave 2b): heard of in a rumour or entered, so an
 * authored dungeon's suggested party level shows. Unknown ids are skipped.
 */
export function markKnown(state: GameState, ids: readonly string[]): GameState {
  const fresh = ids.filter(
    (id) => Object.hasOwn(state.world.pois, id) && !state.world.pois[id].known
  )
  if (fresh.length === 0) return state
  const pois = { ...state.world.pois }
  for (const id of fresh) pois[id] = { ...pois[id], known: true }
  return { ...state, world: { ...state.world, pois } }
}

/**
 * The party level an authored dungeon calls for (crLevel of the CR it is played at), once it is
 * known by word; null while it is known only from exploring (or not at all), or for any other site.
 */
export function suggestedLevel(state: GameState, content: Content, poiId: string): number | null {
  const poi = own(state.world.pois, poiId)
  const dungeon = dungeonOf(content, poi)
  return poi?.known && dungeon ? crLevel(playedCr(state, poiId, dungeon)) : null
}

/**
 * Enters the dungeon at the POI the party is at (visitPoi, once the visit is allowed): the delve
 * starts with its first room, and an errand to the site is done by going there.
 */
export function enterDungeon(state: GameState, content: Content, poiId: string): GameState {
  const dungeon = dungeonOf(content, own(state.world.pois, poiId))
  if (!dungeon) return state
  if (!state.party.some(canAct)) return appendLog(state, 'No one is fit to go in.', 'bad')
  const delve: DelveState = { poi: poiId, dungeon: dungeon.id, room: 0, inRoom: false, ended: null }
  // Once entered, the dungeon is known: its suggested level shows from now on.
  const known = markKnown(state, [poiId])
  const entered = appendLog({ ...known, visited: true }, `You enter ${dungeon.name}.`, 'info')
  return siteContractsMet(startRoom(entered, content, delve), 'errand', poiId)
}

/** Why the party can't press on or withdraw now (English), or null. */
function betweenRooms(state: GameState): string | null {
  if (!state.delve) return 'You are not in a dungeon.'
  if (state.delve.inRoom || inProgress(state)) return 'Finish the current encounter first.'
  return null
}

/** Into the next room. */
export function pressOn(state: GameState, content: Content): GameState {
  const refused = betweenRooms(state)
  if (refused) return appendLog(state, refused, 'bad')
  if (!state.party.some(canAct)) return appendLog(state, 'No one is fit to go on.', 'bad')
  return startRoom(state, content, state.delve!)
}

/** Out of the dungeon, keeping what was found; the site can be tried again another time. */
export function withdraw(state: GameState, content: Content): GameState {
  const refused = betweenRooms(state)
  if (refused) return appendLog(state, refused, 'bad')
  const name = own(content.dungeons, state.delve!.dungeon)?.name ?? 'the dungeon'
  return appendLog(
    { ...state, delve: null },
    `You withdraw from ${name} with what you found. It can be tried again another time.`,
    'info'
  )
}

export function stepDelve(state: GameState, action: DelveAction, content: Content): GameState {
  return action.type === 'pressOn' ? pressOn(state, content) : withdraw(state, content)
}

/**
 * After every step: a delve whose party has left the site ends; a room whose encounter is over
 * settles. Cleared (the hoard paid) or driven out (a failure, or no one left standing, or a room
 * where nothing more can be chosen) ends the delve; otherwise the party stands before the next room.
 */
export function settleDelve(state: GameState, content: Content): GameState {
  const delve = state.delve
  if (!delve) return state
  if (state.travel || state.location !== delve.poi) return { ...state, delve: null }
  if (!delve.inRoom || !encounterOver(state)) return state
  const dungeon = own(content.dungeons, delve.dungeon)
  if (delve.ended === 'cleared' || !dungeon) return { ...state, delve: null }
  const stuck = state.encounter !== null && state.encounter.stage !== null
  if (delve.ended === 'driven' || stuck || !state.party.some(canAct)) {
    return appendLog(
      { ...state, delve: null },
      `You are driven out of ${dungeon.name}. It can be tried again another time.`,
      'bad'
    )
  }
  const next = delve.room + 1
  if (next >= dungeon.rooms.length) return { ...state, delve: null }
  return appendLog(
    { ...state, delve: { ...delve, room: next, inRoom: false, ended: null } },
    `Ahead lies ${dungeon.rooms[next].name}. Press on, or withdraw with what you found.`,
    'info'
  )
}

/** What the site panel and the delve view show of a dungeon, before entering and between rooms. */
export type DelvePreview = {
  dungeon: Dungeon
  /** The CR it is played at (a contract's may be higher), and the party level it is meant for. */
  cr: number
  level: number
  /**
   * The party level it calls for as the party knows it: `level` once heard of in a rumour or
   * entered (Plan 6 wave 2b), else null (found only by exploring: the level is unknown). While
   * null the UI doesn't show `hoard`: it comes from the CR and would give it away.
   */
  suggestedLevel: number | null
  /** The best level among the living members. */
  partyLevel: number
  /** What every check here adds over its written DC (CR, power and the day's danger aside). */
  dcBonus: number
  /** Rooms behind the party, the room being played or next (null once none is left), and left. */
  done: number
  current: number | null
  roomsLeft: number
  inRoom: boolean
  hoard: HoardEffect
  /**
   * The chance the next room drives the party out with its best opening choice (an estimate from
   * the first stage of each situation the room may draw); null when the room is being played.
   * For the trader sim only: no UI shows an aggregate prediction (designer call 2026-11-14).
   */
  risk: number | null
}

/**
 * The chance a room drives the party out: for each of its situations, the opening stage's
 * available option with the least chance of an outcome that drives out (by the best actor's
 * odds), or for a skill challenge the chance of losing it (challengeOdds), averaged over the
 * situations it may draw.
 */
function roomRisk(
  state: GameState,
  content: Content,
  poiId: string,
  dungeon: Dungeon,
  index: number
) {
  const room = dungeon.rooms[index]
  const situations = roomSituations(content, room)
  if (situations.length === 0) return 0
  const { dcBonus, rules } = roomSetup(state, poiId, dungeon, index)
  const poi = state.world.pois[poiId]
  const power = (siteStatus(state.world.seed, poiId, poi, state.day)?.power ?? 0) * POWER_DC
  const danger = dangerLevel(state, content)
  const risks = situations.map((id) => {
    const found = allSituations(content).find((s) => s.id === id)!
    const played = asRoom(
      harden(compileSituation(found, content), { dcBonus: dcBonus + power, danger }),
      rules
    )
    const drives = (effects: readonly { effect: string }[]) =>
      effects.some((e) => e.effect === 'driveOut')
    const stage = played.stages[played.start]
    const options = (stage?.options ?? []).filter(
      (o) => unmetRequirements(state, o.requires).length === 0
    )
    // A skill challenge (a boss room): the chance of losing it with the best option every round.
    if (stage?.challenge) {
      const choices = roundChoices(
        state,
        options,
        played.start,
        (option, mode) => checkUpgrades(state, played, option, mode, true).total
      )
      return 1 - challengeOdds(choices, stage.challenge, START).chance
    }
    const each = options.map((o) => {
      if (o.kind === 'fixed') return drives(o.outcome.effects) ? 1 : 0
      if (o.kind === 'fight') return 1
      const actor = chooseActor(state.party, o.check.skill, undefined, o.check.ability)
      if (!actor) return 1
      const gear = checkUpgrades(state, played, o, 'normal', false).total
      const odds = tierOdds(actor.modifier + gear, Number(o.check.dc))
      return TIERS.reduce((sum, t) => sum + (drives(tierOutcome(o, t).effects) ? odds[t] : 0), 0)
    })
    return each.length === 0 ? 1 : Math.min(...each)
  })
  return risks.reduce((a, b) => a + b, 0) / risks.length
}

/** A challenge as a room starts it: no tally, on a normal footing. */
const START: Footing = { tally: NO_TALLY, position: 'normal', modifier: 0, used: [] }

/** The preview of the dungeon at a POI; null when it is not an authored dungeon. */
export function delvePreview(
  state: GameState,
  content: Content,
  poiId: string
): DelvePreview | null {
  const poi = own(state.world.pois, poiId)
  const dungeon = dungeonOf(content, poi)
  if (!poi || !dungeon) return null
  const delve = state.delve?.poi === poiId ? state.delve : null
  const cr = playedCr(state, poiId, dungeon)
  const power = siteStatus(state.world.seed, poiId, poi, state.day)?.power ?? 0
  const current = delve ? delve.room : 0
  const inRoom = delve?.inRoom ?? false
  const living = state.party.filter(canAct)
  return {
    dungeon,
    cr,
    level: crLevel(cr),
    suggestedLevel: poi.known ? crLevel(cr) : null,
    partyLevel: Math.max(1, ...(living.length > 0 ? living : state.party).map((c) => c.level)),
    dcBonus: crOffset(cr) + power * POWER_DC,
    done: current,
    current: current < dungeon.rooms.length ? current : null,
    roomsLeft: dungeon.rooms.length - current,
    inRoom,
    hoard: hoardOf(dungeon, dungeon.cr),
    risk: inRoom ? null : roomRisk(state, content, poiId, dungeon, current),
  }
}
