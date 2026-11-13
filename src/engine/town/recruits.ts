import { sortedEntries, type Content } from '../../content/build'
import type { ClassDef } from '../../schema/content'
import type { RecruitsBlock } from '../../schema/economy'
import type { Accessory } from '../../schema/gear'
import type { Character, GameState } from '../../schema/state'
import { MAX_LEVEL, type Ability } from '../../schema/types'
import { inProgress } from '../encounters/run'
import { rollAccessory, wear } from '../gear/accessories'
import { appendLog } from '../log'
import { generateCharacter } from '../party'
import { withRng, type Draw, type Rng } from '../rng'
import { ABILITIES, statLabel } from '../rules/abilities'
import { levelTo } from '../rules/progression'
import { inSettlement } from '../travel/where'
import { isAlive, isHired, livingMembers } from './camaraderie'
import { boardWeek, keyedRng } from './contracts'
import {
  LEVEL0_WOUNDS,
  OLD_WOUND_CHANCE,
  OLD_WOUND_PENALTY,
  OLD_WOUND_QUALITY,
  PARTY_CAP,
  RECRUIT_GEAR_CHANCE,
  RECRUIT_GEAR_PRICE,
  RECRUIT_LEVEL_LEAD,
  RECRUIT_LOCAL_ANCESTRY,
  RECRUIT_OFF_CLASS,
  RECRUIT_SIGNON,
  RECRUIT_STAT_MEAN,
  RECRUIT_STAT_SPAN,
  STARTING_FOOD_DAYS,
} from '../constants'

// Recruits (Plan 5a, B1; Plan 6, A2): taverns, the adventurers' guild and mercenaries hire out.
// Nothing ticks: a service's offers are derived from the world seed, the settlement, the week and
// the service, like a notice board. State keeps only the members hired and the offer ids taken.
// A recruit rolls 3d6 for each ability (the best of the service's `picks` sets) and pays no wage:
// a one-time sign-on fee by level, placed in the level's range by the rolls and any old wound, plus
// the price of any accessory they bring. "Level 0" is a level-1 recruit with two old wounds.

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

export { isAlive, isHired, livingMembers }

/** Someone looking for work at a service here this week. */
export type RecruitOffer = {
  /** "r-<settlement>-w<week>-<service>-<n>"; the hired character gets the same id. */
  id: string
  service: string
  /** The recruit as they would join: levelled, and marked hired. */
  character: Character
  /** The level offered: the character's, or 0 for a level-1 recruit with two old wounds. */
  level: number
  /** gp, the sign-on fee (gear included): paid once on hiring. There are no wages (Plan 6). */
  fee: number
  /** The accessory they bring (worn), or null. */
  gear: Accessory | null
  /** The part of the fee that is the accessory's (RECRUIT_GEAR_PRICE of its price); 0 without. */
  gearPrice: number
  /** Their old wounds ("A badly set leg (−2 DEX)"; two joined by "; "), or null. */
  wound: string | null
  available: boolean
  /** Why not (English), or null. */
  reason: string | null
}

export type RecruitAction =
  | { type: 'hireRecruit'; offerId: string }
  /** Part ways with a hired member (founders stay); it costs nothing. */
  | { type: 'dismissMember'; characterId: string }

/** What sets a recruit's place in their level's fee range. */
export type FeeBasis = {
  /** The level offered, 0–20. */
  level: number
  /** Their six 3d6 ability rolls added up, before any wound. */
  total: number
  /** An old wound beyond what the level implies (level 0's two are priced into its range). */
  wounded: boolean
}

/**
 * A recruit's sign-on fee before gear: within RECRUIT_SIGNON for the level, placed by the ability
 * total against RECRUIT_STAT_MEAN (RECRUIT_STAT_SPAN runs from the low end to the high), and near
 * the low end with an old wound (OLD_WOUND_QUALITY); then × the service's `fee`.
 */
export function signOnFee(basis: FeeBasis, block?: Pick<RecruitsBlock, 'fee'>): number {
  const [low, high] = RECRUIT_SIGNON[Math.min(RECRUIT_SIGNON.length - 1, Math.max(0, basis.level))]
  const place = Math.max(
    0,
    Math.min(1, 0.5 + (basis.total - RECRUIT_STAT_MEAN) / RECRUIT_STAT_SPAN)
  )
  const quality = basis.wounded ? place * OLD_WOUND_QUALITY : place
  return Math.round((low + quality * (high - low)) * (block?.fee ?? 1))
}

/** What an accessory a recruit brings adds to their fee: RECRUIT_GEAR_PRICE of its price. */
export const gearPrice = (a: Pick<Accessory, 'value'>): number =>
  Math.ceil(a.value * RECRUIT_GEAR_PRICE)

/** How an old wound shows, by the ability it lowers. */
const WOUNDS: Readonly<Record<Ability, string>> = {
  str: 'A shoulder that never healed',
  dex: 'A badly set leg',
  con: 'A cough from the mines',
  int: 'A blow to the head',
  wis: 'Nightmares of an old battle',
  cha: 'A scarred face',
}

/** "A badly set leg (−2 DEX)", two joined by "; "; null without a wound. */
export const oldWoundText = (c: Pick<Character, 'oldWounds'>): string | null =>
  c.oldWounds.length === 0
    ? null
    : c.oldWounds.map((a) => `${WOUNDS[a]} (−${OLD_WOUND_PENALTY} ${statLabel(a)})`).join('; ')

/** A class's two key abilities: the two highest of its spread (in ability order on ties). */
const keyAbilities = (cls: ClassDef): Ability[] =>
  [...ABILITIES].sort((a, b) => cls.baseAbilities[b] - cls.baseAbilities[a]).slice(0, 2)

/** A random order of `items` (Fisher–Yates on the draw). */
function shuffled<T>(d: Draw, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = d.int(0, i)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Six 3d6 rolls, best first. */
const rollSet = (d: Draw): number[] =>
  ABILITIES.map(() => d.int(1, 6) + d.int(1, 6) + d.int(1, 6)).sort((a, b) => b - a)
const sum = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0)

/**
 * A recruit's abilities: six 3d6 rolls (the best by total of `picks` such sets: the service's
 * quality), the two best on the class's key abilities (unless, with RECRUIT_OFF_CLASS, they fall
 * anywhere), the rest in a random order. Level 0 has LEVEL0_WOUNDS old wounds on different
 * abilities; any other recruit one with OLD_WOUND_CHANCE. Each is OLD_WOUND_PENALTY lower (never
 * below 3). `total` is the rolls' sum before any wound.
 */
function rollAbilities(d: Draw, cls: ClassDef, picks: number, levelZero: boolean) {
  let rolls = rollSet(d)
  for (let p = 1; p < picks; p++) {
    const other = rollSet(d)
    if (sum(other) > sum(rolls)) rolls = other
  }
  const keys = d.float() < RECRUIT_OFF_CLASS ? [] : keyAbilities(cls)
  const rest = shuffled(
    d,
    ABILITIES.filter((a) => !keys.includes(a))
  )
  const abilities = Object.fromEntries(
    [...keys, ...rest].map((a, i) => [a, rolls[i]])
  ) as Character['abilities']
  const wounds: Ability[] = levelZero
    ? shuffled(d, ABILITIES).slice(0, LEVEL0_WOUNDS)
    : d.float() < OLD_WOUND_CHANCE
      ? [d.pick(ABILITIES)]
      : []
  for (const w of wounds) abilities[w] = Math.max(3, abilities[w] - OLD_WOUND_PENALTY)
  return { abilities, wounds, total: sum(rolls) }
}

/** A recruit as made: the character, the level offered (0 or theirs) and what sets their fee. */
type Made = { character: Character; level: number; total: number }

/**
 * One recruit, from its own keyed stream: class, ancestry, a level within the block's `levels`,
 * then rolled abilities (and any old wounds: level 0 is a level-1 recruit with two). The party
 * plays no part, so an offer never changes within its week.
 */
function makeRecruit(
  rng: Rng,
  content: Content,
  localAncestry: string,
  block: RecruitsBlock
): Made {
  const known = (block.classes ?? []).filter((id) => Object.hasOwn(content.classes, id))
  const classes = known.length > 0 ? known : sortedEntries(content.classes).map((c) => c.id)
  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const [{ classId, ancestryId, level, rolled }, afterPick] = withRng(rng, (d) => {
    const classId = d.pick(classes)
    const local = playable.some((a) => a.id === localAncestry)
    const others = playable.filter((a) => a.id !== localAncestry)
    const stays = local && (others.length === 0 || d.float() < RECRUIT_LOCAL_ANCESTRY)
    const ancestryId = stays ? localAncestry : d.pick(others).id
    const level = d.int(block.levels[0], block.levels[1])
    const rolled = rollAbilities(d, content.classes[classId], block.picks, level === 0)
    return { classId, ancestryId, level, rolled }
  })
  const [fresh, afterGen] = generateCharacter(afterPick, content, {
    classId,
    ancestryId,
    abilities: rolled.abilities,
  })
  const [character] = withRng(afterGen, (d) =>
    levelTo({ ...fresh, oldWounds: rolled.wounds }, Math.max(1, level), d)
  )
  return { character, level, total: rolled.total }
}

/**
 * The tier-1 accessory an offer brings, with the block's `gear` chance (else RECRUIT_GEAR_CHANCE),
 * from its own keyed stream so it doesn't change the recruit; null for most.
 */
function recruitGear(rng: Rng, content: Content, block: RecruitsBlock, id: string) {
  const [gear] = withRng(rng, (d) =>
    d.float() < (block.gear ?? RECRUIT_GEAR_CHANCE)
      ? rollAccessory(d, content, 1, `${id}-gear`)
      : null
  )
  return gear
}

/**
 * The highest level that will sign on: the lowest living member's level + RECRUIT_LEVEL_LEAD
 * (seasoned hands won't join a green party), and the lowest level itself.
 */
export function recruitCap(state: GameState): { lowest: number; cap: number } {
  const lowest = Math.min(...livingMembers(state).map((c) => c.level), MAX_LEVEL)
  return { lowest, cap: lowest + RECRUIT_LEVEL_LEAD }
}

/** Why an offer can't be taken now (English), or null. */
function hireRefusal(
  state: GameState,
  settlementId: string,
  level: number,
  fee: number
): string | null {
  if (inProgress(state)) return 'finish the current encounter first'
  if (!inSettlement(state) || state.location !== settlementId) return 'only in person'
  if (livingMembers(state).length >= PARTY_CAP) return `the party is full (${PARTY_CAP})`
  const { lowest, cap } = recruitCap(state)
  if (level > cap) return `won't join a party with a level ${lowest} member`
  if (state.gold < fee) return 'not enough gold'
  return null
}

/**
 * Who is looking for work in a settlement this week: each service here with a `recruits` block
 * offers a seeded number in its `offers` range, of its `classes` (or any), mostly of the
 * settlement's ancestry (RECRUIT_LOCAL_ANCESTRY). Levels are seeded within the block's `levels`
 * and don't depend on the party, so the week's offers never reshuffle. An offer above the lowest
 * living member's level + RECRUIT_LEVEL_LEAD is listed but refused (recruitCap): it opens when
 * the party's weakest levels up, leaves or dies, and closes again if a green recruit joins.
 * Offers already hired are left out.
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
  const offers: RecruitOffer[] = []
  for (const service of info.services) {
    const block = own(content.serviceRoles, service)?.recruits
    if (!block) continue
    const key = `recruits/${settlementId}/${week}/${service}`
    const [count] = withRng(keyedRng(seed, key), (d) => d.int(block.offers[0], block.offers[1]))
    for (let n = 0; n < count; n++) {
      const id = `r-${settlementId}-w${week}-${service}-${n}`
      if (state.recruitsTaken.includes(id)) continue
      const made = makeRecruit(keyedRng(seed, `${key}/${n}`), content, info.ancestry, block)
      const c = made.character
      const gear = recruitGear(keyedRng(seed, `${key}/${n}/gear`), content, block, id)
      const extra = gear ? gearPrice(gear) : 0
      const wounded = made.level > 0 && c.oldWounds.length > 0
      const fee = signOnFee({ level: made.level, total: made.total, wounded }, block) + extra
      const reason = hireRefusal(state, settlementId, made.level, fee)
      const joined = { ...c, id, hired: true }
      offers.push({
        id,
        service,
        character: gear ? wear(joined, gear) : joined,
        level: made.level,
        fee,
        gear,
        gearPrice: extra,
        wound: oldWoundText(c),
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
 * Hires an offer here: pays the fee, and the recruit joins with STARTING_FOOD_DAYS
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
    `${c.name}, ${describe(content, c)} (level ${offer.level}), signs on for ${offer.fee} gp` +
      (offer.gear ? `, bringing a ${offer.gear.name}.` : '.'),
    'good'
  )
}

/**
 * Parts ways with a hired member (alive or dead); founders are never dismissed. It costs nothing,
 * and their accessory stays with the party's gear.
 */
export function dismissMember(state: GameState, characterId: string): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  const c = state.party.find((m) => m.id === characterId)
  if (!c) return appendLog(state, 'There is no such member.', 'bad')
  if (!isHired(c)) return appendLog(state, `${c.name} is a founder and stays.`, 'bad')
  const next: GameState = {
    ...state,
    party: state.party.filter((m) => m.id !== c.id),
    gear: c.accessory ? [...state.gear, c.accessory] : state.gear,
  }
  const text = isAlive(c)
    ? `${c.name} is dismissed and leaves the party.`
    : `${c.name} is laid to rest and left behind.`
  return appendLog(next, text, 'info')
}

export function stepRecruit(state: GameState, action: RecruitAction, content: Content): GameState {
  switch (action.type) {
    case 'hireRecruit':
      return hireRecruit(state, content, action.offerId)
    case 'dismissMember':
      return dismissMember(state, action.characterId)
  }
}
