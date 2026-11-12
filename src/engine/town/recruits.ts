import { sortedEntries, type Content } from '../../content/build'
import type { RecruitsBlock } from '../../schema/economy'
import type { Character, GameState } from '../../schema/state'
import { inProgress } from '../encounters/run'
import { formatGp } from '../format'
import { appendLog } from '../log'
import { generateCharacter } from '../party'
import { withRng, type Rng } from '../rng'
import { levelTo } from '../rules/progression'
import { inSettlement } from '../travel/where'
import { isAlive, isHired, livingMembers, owedTo } from './camaraderie'
import { boardWeek, keyedRng } from './contracts'
import {
  PARTY_CAP,
  RECRUIT_FEE_PER_LEVEL,
  RECRUIT_LOCAL_ANCESTRY,
  RECRUIT_WAGE,
  STARTING_FOOD_DAYS,
} from '../constants'

// Recruits (Plan 5a, B1): taverns, the adventurers' guild and mercenaries hire out. Nothing ticks:
// a service's offers are derived from the world seed, the settlement, the week and the service,
// like a notice board. State keeps only the members hired and the offer ids taken.

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

export { isAlive, isHired, livingMembers }

/** Someone looking for work at a service here this week. */
export type RecruitOffer = {
  /** "r-<settlement>-w<week>-<service>-<n>"; the hired character gets the same id. */
  id: string
  service: string
  /** The recruit as they would join: levelled, with their wage set. */
  character: Character
  level: number
  /** gp, paid once on hiring. */
  fee: number
  /** gp a day, paid at the end of each day (town/camaraderie.ts). */
  wage: number
  available: boolean
  /** Why not (English), or null. */
  reason: string | null
}

export type RecruitAction =
  | { type: 'hireRecruit'; offerId: string }
  /** Part ways with a hired member (founders stay), settling or writing off their owed wages. */
  | { type: 'dismissMember'; characterId: string }

/** The hiring fee for a recruit of this level at a service with this block. */
export const recruitFee = (level: number, block: RecruitsBlock): number =>
  Math.ceil(RECRUIT_FEE_PER_LEVEL * level * block.fee)

/** A recruit's daily wage, to the nearest half gp (at least half a gp). */
export const recruitWage = (level: number, block: RecruitsBlock): number =>
  Math.max(0.5, Math.round(RECRUIT_WAGE * (1 + level) * block.wage * 2) / 2)

/**
 * One recruit, from its own keyed stream: class, ancestry, then a level within the block's
 * `levels`, clamped to `cap`. The level is drawn before the clamp, so the same stream gives the
 * same recruit whatever the cap (only the levels above it are cut).
 */
function makeRecruit(
  rng: Rng,
  content: Content,
  localAncestry: string,
  block: RecruitsBlock,
  cap: number
): Character {
  const known = (block.classes ?? []).filter((id) => Object.hasOwn(content.classes, id))
  const classes = known.length > 0 ? known : sortedEntries(content.classes).map((c) => c.id)
  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const [{ classId, ancestryId }, afterPick] = withRng(rng, (d) => {
    const classId = d.pick(classes)
    const local = playable.some((a) => a.id === localAncestry)
    const others = playable.filter((a) => a.id !== localAncestry)
    const stays = local && (others.length === 0 || d.float() < RECRUIT_LOCAL_ANCESTRY)
    return { classId, ancestryId: stays ? localAncestry : d.pick(others).id }
  })
  const [fresh, afterGen] = generateCharacter(afterPick, content, { classId, ancestryId })
  const [character] = withRng(afterGen, (d) => {
    const drawn = d.int(block.levels[0], block.levels[1])
    return levelTo(fresh, Math.max(1, Math.min(drawn, cap)), d)
  })
  return character
}

/** Why an offer can't be taken now (English), or null. */
function hireRefusal(state: GameState, settlementId: string, fee: number): string | null {
  if (inProgress(state)) return 'finish the current encounter first'
  if (!inSettlement(state) || state.location !== settlementId) return 'only in person'
  if (livingMembers(state).length >= PARTY_CAP) return `the party is full (${PARTY_CAP})`
  if (state.gold < fee) return `costs ${fee} gp`
  return null
}

/**
 * Who is looking for work in a settlement this week: each service here with a `recruits` block
 * offers a seeded number in its `offers` range, of its `classes` (or any), mostly of the
 * settlement's ancestry (RECRUIT_LOCAL_ANCESTRY). Levels are seeded within the block's `levels`,
 * but never above the founders' highest level + 1. Only founders set the cap (alive or dead), so
 * hiring, a recruit's level-up or a death doesn't reshuffle the week's offers, and a level-1 party
 * can't climb the ladder by hiring. Offers already hired are left out.
 */
export function recruitOffers(
  state: GameState,
  content: Content,
  settlementId: string
): RecruitOffer[] {
  const info = own(state.world.settlements, settlementId)
  if (!info) return []
  const week = boardWeek(state.day)
  const seed = state.world.seed
  const cap = Math.max(1, ...state.party.filter((c) => !isHired(c)).map((c) => c.level)) + 1
  const offers: RecruitOffer[] = []
  for (const service of info.services) {
    const block = own(content.serviceRoles, service)?.recruits
    if (!block) continue
    const key = `recruits/${settlementId}/${week}/${service}`
    const [count] = withRng(keyedRng(seed, key), (d) => d.int(block.offers[0], block.offers[1]))
    for (let n = 0; n < count; n++) {
      const id = `r-${settlementId}-w${week}-${service}-${n}`
      if (state.recruitsTaken.includes(id)) continue
      const made = makeRecruit(keyedRng(seed, `${key}/${n}`), content, info.ancestry, block, cap)
      const fee = recruitFee(made.level, block)
      const wage = recruitWage(made.level, block)
      const reason = hireRefusal(state, settlementId, fee)
      offers.push({
        id,
        service,
        character: { ...made, id, wage },
        level: made.level,
        fee,
        wage,
        available: reason === null,
        reason,
      })
    }
  }
  return offers
}

/** "a dwarf fighter", "an elf ranger". */
function describe(content: Content, c: Character): string {
  const ancestry = (own(content.ancestries, c.ancestry)?.name ?? c.ancestry).toLowerCase()
  const cls = (own(content.classes, c.classId)?.name ?? c.classId).toLowerCase()
  return `${/^[aeiou]/.test(ancestry) ? 'an' : 'a'} ${ancestry} ${cls}`
}

/**
 * Hires an offer here: pays the fee, and the recruit joins with their wage and STARTING_FOOD_DAYS
 * of their own food (as a founder does), so hiring never starves the party on the first day.
 */
export function hireRecruit(state: GameState, content: Content, offerId: string): GameState {
  const here = state.location
  const offer =
    here === null ? undefined : recruitOffers(state, content, here).find((o) => o.id === offerId)
  if (!offer) return appendLog(state, 'No one here is looking for that work.', 'bad')
  const c = offer.character
  if (!offer.available) return appendLog(state, `You can't hire ${c.name}: ${offer.reason}.`, 'bad')
  const next: GameState = {
    ...state,
    gold: state.gold - offer.fee,
    party: [...state.party, c],
    goods: { ...state.goods, food: (state.goods.food ?? 0) + STARTING_FOOD_DAYS },
    recruitsTaken: [...state.recruitsTaken, offer.id],
  }
  return appendLog(
    next,
    `${c.name}, ${describe(content, c)} (level ${c.level}), signs on for ${offer.fee} gp ` +
      `and ${formatGp(offer.wage)} gp a day.`,
    'good'
  )
}

/**
 * Parts ways with a hired member (alive or dead); founders are never dismissed. Their accessory
 * stays with the party's gear. Their share of the owed wages (owedTo) is settled in whole gp if the
 * purse holds it, else written off, so no debt to the departed lingers.
 */
export function dismissMember(state: GameState, characterId: string): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  const c = state.party.find((m) => m.id === characterId)
  if (!c) return appendLog(state, 'There is no such member.', 'bad')
  if (!isHired(c)) return appendLog(state, `${c.name} is a founder and stays.`, 'bad')
  const share = owedTo(state, [c])
  const settle = Math.ceil(share)
  const pays = share > 0 && state.gold >= settle
  let next: GameState = {
    ...state,
    party: state.party.filter((m) => m.id !== c.id),
    gear: c.accessory ? [...state.gear, c.accessory] : state.gear,
    gold: pays ? state.gold - settle : state.gold,
    wagesOwed: Math.max(0, Math.round((state.wagesOwed - share) * 100) / 100),
  }
  const text = isAlive(c)
    ? `${c.name} is dismissed and leaves the party.`
    : `${c.name} is laid to rest and left behind.`
  next = appendLog(next, text, 'info')
  if (share <= 0) return next
  return pays
    ? appendLog(next, `${settle} gp of owed wages are settled with ${c.name}.`, 'info')
    : appendLog(next, `${formatGp(share)} gp owed to ${c.name} is written off.`, 'bad')
}

export function stepRecruit(state: GameState, action: RecruitAction, content: Content): GameState {
  switch (action.type) {
    case 'hireRecruit':
      return hireRecruit(state, content, action.offerId)
    case 'dismissMember':
      return dismissMember(state, action.characterId)
  }
}
