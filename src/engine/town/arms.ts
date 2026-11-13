import type { Content } from '../../content/build'
import type { Armour, Weapon } from '../../schema/combat'
import type { Character, GameState } from '../../schema/state'
import { WEAPON_QUALITIES } from '../../schema/types'
import { inProgress } from '../encounters/run'
import { serviceQuality } from '../economy/market'
import { load } from '../economy/capacity'
import { appendLog } from '../log'
import { MAX_EXHAUSTION } from '../rules/character'
import { inSettlement, notHere } from '../travel/where'
import { ARMS_QUALITY_AT, ARMS_RESALE } from '../constants'

// Weapons and armour for members to wear (Plan 7 Track C, combat design §4): the weapons shop,
// the armourer and the blacksmith (service roles with an `arms` block) sell them at their listed
// prices, every plain piece and better weapons from ARMS_QUALITY_AT of the shop's quality, and buy
// them back at ARMS_RESALE. Bought pieces go to the party's stash (`GameState.stash`); a member
// wears one weapon and one armour (`Character.gear`). Worn and stashed pieces weigh on carrying
// (economy/capacity.ts gearWeight).

const BUSY = 'Finish the current encounter first.'

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

export type ArmsPiece = { kind: 'weapon'; item: Weapon } | { kind: 'armour'; item: Armour }

/** A weapon or armour by id, or null. */
export function armsPiece(content: Content, id: string): ArmsPiece | null {
  const weapon = own(content.weapons, id)
  if (weapon) return { kind: 'weapon', item: weapon }
  const armour = own(content.armours, id)
  return armour ? { kind: 'armour', item: armour } : null
}

/** What a shop pays for a piece: ARMS_RESALE of its price, rounded down. */
export const armsResale = (content: Content, id: string): number =>
  Math.floor((armsPiece(content, id)?.item.price ?? 0) * ARMS_RESALE)

/** The services at a settlement that deal in arms, with what each sells. */
function sellersAt(state: Pick<GameState, 'world'>, content: Content, settlementId: string) {
  return (own(state.world.settlements, settlementId)?.services ?? []).flatMap((service) => {
    const arms = own(content.serviceRoles, service)?.arms
    return arms ? [{ service, arms, quality: serviceQuality(state, settlementId, service) }] : []
  })
}

/** Why the party can't deal in arms here now, or null. */
function shopRefusal(state: GameState, content: Content, settlementId: string | null) {
  if (inProgress(state)) return BUSY
  if (!inSettlement(state)) return notHere(state, 'Arms are bought and sold in a settlement.')
  if (settlementId === null || state.location !== settlementId) return 'You are not there.'
  return sellersAt(state, content, settlementId).length > 0 ? null : 'No one here deals in arms.'
}

export type ArmsOffer = {
  /** The weapons or armours id. */
  id: string
  service: string
  piece: ArmsPiece
  price: number
  available: boolean
  reason: string | null
}

/**
 * What the arms shops at a settlement sell: every armour (an armourer, a smith), and the weapons
 * whose quality the shop's quality reaches (ARMS_QUALITY_AT) and its `best` allows. Each piece is
 * listed once, at the first shop that has it. A purchase that would overload the party is refused.
 */
export function armsOffers(state: GameState, content: Content, settlementId: string): ArmsOffer[] {
  const refused = shopRefusal(state, content, settlementId)
  const seen = new Set<string>()
  const offers: ArmsOffer[] = []
  for (const { service, arms, quality } of sellersAt(state, content, settlementId)) {
    const pieces: ArmsPiece[] = [
      ...(arms.sells.includes('weapons')
        ? Object.values(content.weapons)
            .filter(
              (w) =>
                ARMS_QUALITY_AT[w.quality] <= quality &&
                WEAPON_QUALITIES.indexOf(w.quality) <= WEAPON_QUALITIES.indexOf(arms.best)
            )
            .map((item) => ({ kind: 'weapon' as const, item }))
        : []),
      ...(arms.sells.includes('armour')
        ? Object.values(content.armours).map((item) => ({ kind: 'armour' as const, item }))
        : []),
    ]
    for (const piece of pieces) {
      if (seen.has(piece.item.id)) continue
      seen.add(piece.item.id)
      const price = piece.item.price ?? 0
      const heavy =
        load({ ...state, stash: [...state.stash, piece.item.id] }, content).level === 'overloaded'
      const reason =
        refused ?? (state.gold < price ? 'not enough gold' : heavy ? 'too heavy to carry' : null)
      offers.push({ id: piece.item.id, service, piece, price, available: reason === null, reason })
    }
  }
  return offers
}

/** The stash's pieces with what a shop here pays for each, and whether it buys that kind. */
export function armsSales(
  state: GameState,
  content: Content
): { id: string; piece: ArmsPiece; price: number; available: boolean; reason: string | null }[] {
  const refused = shopRefusal(state, content, state.location)
  const sellers = state.location ? sellersAt(state, content, state.location) : []
  return state.stash.flatMap((id) => {
    const piece = armsPiece(content, id)
    if (!piece) return []
    const buys = sellers.some((s) =>
      s.arms.sells.includes(piece.kind === 'weapon' ? 'weapons' : 'armour')
    )
    const reason =
      refused ??
      (buys ? null : `no one here buys ${piece.kind === 'weapon' ? 'weapons' : 'armour'}`)
    return [{ id, piece, price: armsResale(content, id), available: reason === null, reason }]
  })
}

export type ArmsAction =
  /** Buy a weapon or armour offered here into the stash. */
  | { type: 'buyArms'; id: string }
  /** Sell a piece from the stash to a shop here. */
  | { type: 'sellArms'; id: string }
  /** A member wears a piece from the stash; what they wore goes to the stash. */
  | { type: 'equipArms'; characterId: string; id: string }
  /** A member takes off their weapon or armour, into the stash. */
  | { type: 'unequipArms'; characterId: string; slot: 'weapon' | 'armour' }

const withMember = (state: GameState, c: Character): GameState => ({
  ...state,
  party: state.party.map((m) => (m.id === c.id ? c : m)),
})

/** Removes one copy of an id from the stash. */
function takeFromStash(stash: readonly string[], id: string): string[] {
  const i = stash.indexOf(id)
  return i < 0 ? [...stash] : [...stash.slice(0, i), ...stash.slice(i + 1)]
}

function buy(state: GameState, content: Content, id: string): GameState {
  const here = state.location
  const offer = here ? armsOffers(state, content, here).find((o) => o.id === id) : undefined
  if (!offer) return appendLog(state, 'That is not for sale here.', 'bad')
  if (!offer.available) return appendLog(state, `${offer.piece.item.name}: ${offer.reason}.`, 'bad')
  return appendLog(
    { ...state, gold: state.gold - offer.price, stash: [...state.stash, id] },
    `Bought: ${offer.piece.item.name}, for ${offer.price} gp.`,
    'info'
  )
}

function sell(state: GameState, content: Content, id: string): GameState {
  const sale = armsSales(state, content).find((s) => s.id === id)
  if (!sale) return appendLog(state, 'The party carries no such piece.', 'bad')
  if (!sale.available) return appendLog(state, `${sale.piece.item.name}: ${sale.reason}.`, 'bad')
  return appendLog(
    { ...state, gold: state.gold + sale.price, stash: takeFromStash(state.stash, id) },
    `Sold: ${sale.piece.item.name}, for ${sale.price} gp.`,
    'info'
  )
}

/** Why a member can't change their gear now, or null. */
function wearRefusal(state: GameState, c: Character | undefined): string | null {
  if (inProgress(state)) return BUSY
  if (!c) return 'There is no such member.'
  return c.exhaustion >= MAX_EXHAUSTION ? `${c.name} is dead.` : null
}

function equip(state: GameState, content: Content, characterId: string, id: string): GameState {
  const c = state.party.find((m) => m.id === characterId)
  const refused = wearRefusal(state, c)
  if (refused) return appendLog(state, refused, 'bad')
  const piece = armsPiece(content, id)
  if (!piece || !state.stash.includes(id))
    return appendLog(state, 'There is no such piece to wear.', 'bad')
  const slot = piece.kind
  const old = c!.gear[slot]
  const stash = [...takeFromStash(state.stash, id), ...(old ? [old] : [])]
  return appendLog(
    withMember({ ...state, stash }, { ...c!, gear: { ...c!.gear, [slot]: id } }),
    `${c!.name} takes up the ${piece.item.name.toLowerCase()}.`,
    'info'
  )
}

function unequip(
  state: GameState,
  content: Content,
  characterId: string,
  slot: 'weapon' | 'armour'
) {
  const c = state.party.find((m) => m.id === characterId)
  const refused = wearRefusal(state, c)
  if (refused) return appendLog(state, refused, 'bad')
  const id = c!.gear[slot]
  if (!id) return appendLog(state, 'Nothing to take off.', 'bad')
  const name = armsPiece(content, id)?.item.name ?? id
  return appendLog(
    withMember(
      { ...state, stash: [...state.stash, id] },
      { ...c!, gear: { ...c!.gear, [slot]: null } }
    ),
    `${c!.name} puts away the ${name.toLowerCase()}.`,
    'info'
  )
}

export function stepArms(state: GameState, action: ArmsAction, content: Content): GameState {
  switch (action.type) {
    case 'buyArms':
      return buy(state, content, action.id)
    case 'sellArms':
      return sell(state, content, action.id)
    case 'equipArms':
      return equip(state, content, action.characterId, action.id)
    case 'unequipArms':
      return unequip(state, content, action.characterId, action.slot)
  }
}
