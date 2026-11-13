import { sortedEntries, type Content } from '../../content/build'
import type { ClassDef } from '../../schema/content'
import type { RecruitsBlock } from '../../schema/economy'
import type { Accessory } from '../../schema/gear'
import type { Character, GameState } from '../../schema/state'
import type { Ability } from '../../schema/types'
import { inProgress } from '../encounters/run'
import { rollAccessory, wear } from '../gear/accessories'
import { appendLog } from '../log'
import { generateCharacter } from '../party'
import { withRng, type Draw, type Rng } from '../rng'
import { ABILITIES, statLabel } from '../rules/abilities'
import { levelTo } from '../rules/progression'
import { inSettlement } from '../travel/where'
import { isAlive, isHired, livingMembers, parting } from './camaraderie'
import { boardWeek, keyedRng } from './contracts'
import {
  OLD_WOUND_CHANCE,
  OLD_WOUND_PENALTY,
  OLD_WOUND_QUALITY,
  PARTY_CAP,
  RECRUIT_GEAR_CHANCE,
  RECRUIT_GEAR_PRICE,
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
// A recruit rolls 3d6 for each ability and pays no wage: a one-time sign-on fee by level, placed
// in the level's range by the rolls and any old wound, plus the price of any accessory they bring.

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
  level: number
  /** gp, the sign-on fee (gear included): paid once on hiring. There are no wages (Plan 6). */
  fee: number
  /** The accessory they bring (worn), or null. */
  gear: Accessory | null
  /** The part of the fee that is the accessory's (RECRUIT_GEAR_PRICE of its price); 0 without. */
  gearPrice: number
  /** Their old wound ("A badly set leg (−2 DEX)"), or null. */
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
  level: number
  /** Their six 3d6 ability rolls added up, before any wound. */
  total: number
  wounded: boolean
}

/**
 * A recruit's sign-on fee before gear: within RECRUIT_SIGNON for the level, placed by the ability
 * total against RECRUIT_STAT_MEAN (RECRUIT_STAT_SPAN runs from the low end to the high), and near
 * the low end with an old wound (OLD_WOUND_QUALITY); then × the service's `fee`.
 */
export function signOnFee(basis: FeeBasis, block?: Pick<RecruitsBlock, 'fee'>): number {
  const [low, high] = RECRUIT_SIGNON[Math.min(RECRUIT_SIGNON.length, Math.max(1, basis.level)) - 1]
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

/** "A badly set leg (−2 DEX)"; null without a wound. */
export const oldWoundText = (c: Pick<Character, 'oldWound'>): string | null =>
  c.oldWound ? `${WOUNDS[c.oldWound]} (−${OLD_WOUND_PENALTY} ${statLabel(c.oldWound)})` : null

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

/**
 * A recruit's abilities: 3d6 each, the two best on the class's key abilities (unless, with
 * RECRUIT_OFF_CLASS, they fall anywhere), the rest in a random order. With OLD_WOUND_CHANCE one
 * ability is OLD_WOUND_PENALTY lower (never below 3). `total` is the rolls' sum before the wound.
 */
function rollAbilities(d: Draw, cls: ClassDef) {
  const rolls = ABILITIES.map(() => d.int(1, 6) + d.int(1, 6) + d.int(1, 6)).sort((a, b) => b - a)
  const keys = d.float() < RECRUIT_OFF_CLASS ? [] : keyAbilities(cls)
  const rest = shuffled(
    d,
    ABILITIES.filter((a) => !keys.includes(a))
  )
  const abilities = Object.fromEntries(
    [...keys, ...rest].map((a, i) => [a, rolls[i]])
  ) as Character['abilities']
  const wound: Ability | null = d.float() < OLD_WOUND_CHANCE ? d.pick(ABILITIES) : null
  if (wound) abilities[wound] = Math.max(3, abilities[wound] - OLD_WOUND_PENALTY)
  return { abilities, wound, total: rolls.reduce((sum, r) => sum + r, 0) }
}

/** A recruit as made: the character and what sets their fee. */
type Made = { character: Character; total: number }

/**
 * One recruit, from its own keyed stream: class, ancestry, rolled abilities (and any old wound),
 * then a level within the block's `levels`, clamped to `cap`. The level is drawn before the
 * clamp, so the same stream gives the same recruit whatever the cap (only the levels above it
 * are cut).
 */
function makeRecruit(
  rng: Rng,
  content: Content,
  localAncestry: string,
  block: RecruitsBlock,
  cap: number
): Made {
  const known = (block.classes ?? []).filter((id) => Object.hasOwn(content.classes, id))
  const classes = known.length > 0 ? known : sortedEntries(content.classes).map((c) => c.id)
  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const [{ classId, ancestryId, rolled }, afterPick] = withRng(rng, (d) => {
    const classId = d.pick(classes)
    const local = playable.some((a) => a.id === localAncestry)
    const others = playable.filter((a) => a.id !== localAncestry)
    const stays = local && (others.length === 0 || d.float() < RECRUIT_LOCAL_ANCESTRY)
    const ancestryId = stays ? localAncestry : d.pick(others).id
    return { classId, ancestryId, rolled: rollAbilities(d, content.classes[classId]) }
  })
  const [fresh, afterGen] = generateCharacter(afterPick, content, {
    classId,
    ancestryId,
    abilities: rolled.abilities,
  })
  const [character] = withRng(afterGen, (d) => {
    const drawn = d.int(block.levels[0], block.levels[1])
    return levelTo({ ...fresh, oldWound: rolled.wound }, Math.max(1, Math.min(drawn, cap)), d)
  })
  return { character, total: rolled.total }
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
      const c = made.character
      const gear = recruitGear(keyedRng(seed, `${key}/${n}/gear`), content, block, id)
      const extra = gear ? gearPrice(gear) : 0
      const fee =
        signOnFee({ level: c.level, total: made.total, wounded: c.oldWound !== null }, block) +
        extra
      const reason = hireRefusal(state, settlementId, fee)
      const joined = { ...c, id, hired: true }
      offers.push({
        id,
        service,
        character: gear ? wear(joined, gear) : joined,
        level: c.level,
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
    `${c.name}, ${describe(content, c)} (level ${c.level}), signs on for ${offer.fee} gp` +
      (offer.gear ? `, bringing a ${offer.gear.name}.` : '.'),
    'good'
  )
}

/**
 * Parts ways with a hired member (alive or dead); founders are never dismissed. It costs nothing,
 * and their accessory stays with the party's gear. A living member's leaving lifts the rest
 * (CAMARADERIE_PARTING, town/camaraderie.ts); laying the dead to rest doesn't.
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
  if (!isAlive(c)) return appendLog(next, `${c.name} is laid to rest and left behind.`, 'info')
  return parting(appendLog(next, `${c.name} is dismissed and leaves the party.`, 'info'), c.name)
}

export function stepRecruit(state: GameState, action: RecruitAction, content: Content): GameState {
  switch (action.type) {
    case 'hireRecruit':
      return hireRecruit(state, content, action.offerId)
    case 'dismissMember':
      return dismissMember(state, action.characterId)
  }
}
