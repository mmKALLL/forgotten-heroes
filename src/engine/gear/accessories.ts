import { sortedEntries, type Content } from '../../content/build'
import type { Accessory, AccessoryPartDef } from '../../schema/gear'
import type { Character, GameState } from '../../schema/state'
import { ACCESSORY_TIERS, HOOK_KINDS, type AccessoryTier, type HookKind } from '../../schema/types'
import { inProgress } from '../encounters/run'
import { appendLog } from '../log'
import { createRng, withRng, type Draw } from '../rng'
import { MAX_EXHAUSTION } from '../rules/character'
import { boardWeek } from '../town/contracts'
import { inSettlement, notHere } from '../travel/where'
import { describeHook, maxHpBonus } from './hooks'
import { ACCESSORY_RESALE, ACCESSORY_SHOP_FINE_CHANCE } from '../constants'

// Accessories (Plan 5a, design §4): one slot per character, rolled from the affix tables of
// `accessoryParts` (a base, then one affix at tier 1, or a prefix and a suffix at tier 2). An
// accessory is a self-contained snapshot, so editing the tables never breaks a save. Shops'
// offers are derived from (world seed, settlement, week, service), like the notice board.

const BUSY = 'Finish the current encounter first.'

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

/** A seeded RNG for a key: the same draws every time it is asked (FNV-1a of the key). */
function keyedRng(seed: number, key: string) {
  let h = 0x811c9dc5 ^ seed
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return createRng(h >>> 0)
}

const affixesFor = (content: Content, base: AccessoryPartDef, tier: AccessoryTier) =>
  sortedEntries(content.accessoryParts).filter(
    (p) =>
      p.part !== 'base' &&
      p.weight > 0 &&
      p.minTier <= tier &&
      (p.bases === undefined || p.bases.includes(base.id))
  )

const basesFor = (content: Content, tier: AccessoryTier) =>
  sortedEntries(content.accessoryParts).filter(
    (p) => p.part === 'base' && p.weight > 0 && p.minTier <= tier
  )

/**
 * Rolls an accessory: a base by weight, then for tier 1 one affix (a prefix or a suffix), for
 * tier 2 a tier-2 affix and an affix of the other part with a different hook kind. Only affixes
 * whose `minTier` allows the tier and whose `bases` allow the base. Its name is "Fox-eyed Ring",
 * "Ring of the Long Road" or "Fox-eyed Ring of the Long Road"; its value the parts' sum. Null
 * when the tables have no base.
 */
export function rollAccessory(
  d: Draw,
  content: Content,
  tier: AccessoryTier,
  id: string
): Accessory | null {
  const bases = basesFor(content, tier)
  if (bases.length === 0) return null
  const base = d.weighted(bases, (p) => p.weight)
  const fits = affixesFor(content, base, tier)
  const chosen: AccessoryPartDef[] = []
  if (fits.length > 0) {
    const fine = fits.filter((p) => p.minTier === 2)
    const first = d.weighted(tier === 2 && fine.length > 0 ? fine : fits, (p) => p.weight)
    chosen.push(first)
    const others = fits.filter((p) => p.part !== first.part && p.hook?.hook !== first.hook?.hook)
    if (tier === 2 && others.length > 0) chosen.push(d.weighted(others, (p) => p.weight))
  }
  const prefix = chosen.find((p) => p.part === 'prefix')
  const suffix = chosen.find((p) => p.part === 'suffix')
  return {
    id,
    name: [prefix?.name, base.name, suffix?.name].filter(Boolean).join(' '),
    tier,
    hooks: [prefix, suffix].flatMap((p) => (p?.hook ? [p.hook] : [])),
    value: base.value + chosen.reduce((sum, p) => sum + p.value, 0),
  }
}

/** "Fox-eyed Ring (+1 Perception)". */
export const describeAccessory = (a: Pick<Accessory, 'name' | 'hooks'>): string =>
  a.hooks.length > 0 ? `${a.name} (${a.hooks.map(describeHook).join(', ')})` : a.name

/**
 * Loot (the `accessory` effect): rolls one into the party's gear with a seeded id, drawing from
 * the state's RNG. Null when the tables have no base.
 */
export function lootAccessory(
  state: GameState,
  content: Content,
  tier: AccessoryTier
): { state: GameState; accessory: Accessory } | null {
  const taken = new Set([
    ...state.gear.map((a) => a.id),
    ...state.party.flatMap((c) => (c.accessory ? [c.accessory.id] : [])),
  ])
  const [accessory, rng] = withRng(state.rng, (d) => {
    let id = `loot-d${state.day}-${d.int(0, 0xffffff).toString(36)}`
    while (taken.has(id)) id += 'x'
    return rollAccessory(d, content, tier, id)
  })
  if (!accessory) return null
  return { state: { ...state, rng, gear: [...state.gear, accessory] }, accessory }
}

/** One accessory for sale at a service this week. */
export type AccessoryOffer = {
  /** "a-<settlement>-w<week>-<service>-<n>". */
  id: string
  service: string
  accessory: Accessory
  /** gp: its value. */
  price: number
  available: boolean
  /** Why it can't be bought now, or null. */
  reason: string | null
}

/** The services at a settlement that sell (and buy back) accessories. */
const sellersAt = (state: Pick<GameState, 'world'>, content: Content, settlementId: string) =>
  (own(state.world.settlements, settlementId)?.services ?? []).filter(
    (s) => own(content.serviceRoles, s)?.accessories !== undefined
  )

/** Why the party can't trade accessories at this settlement now, or null. */
function shopRefusal(
  state: GameState,
  content: Content,
  settlementId: string | null
): string | null {
  if (inProgress(state)) return BUSY
  if (!inSettlement(state)) {
    return notHere(state, 'Accessories are bought and sold in a settlement.')
  }
  if (settlementId === null || state.location !== settlementId) return 'You are not there.'
  return sellersAt(state, content, settlementId).length > 0
    ? null
    : 'No one here deals in accessories.'
}

/**
 * The accessories for sale at a settlement this week: each service with an `accessories` block
 * offers a seeded number in its `offers` range, of tier 2 with ACCESSORY_SHOP_FINE_CHANCE where
 * its `maxTier` allows. Offers already bought are left out.
 */
export function accessoryOffers(
  state: GameState,
  content: Content,
  settlementId: string
): AccessoryOffer[] {
  const week = boardWeek(state.day)
  const refused = shopRefusal(state, content, settlementId)
  return sellersAt(state, content, settlementId)
    .flatMap((service) => {
      const block = content.serviceRoles[service].accessories!
      const key = `gear/${settlementId}/${week}/${service}`
      return withRng(keyedRng(state.world.seed, key), (d) => {
        const n = d.int(block.offers[0], block.offers[1])
        return Array.from({ length: n }, (_, i) => {
          const fine = block.maxTier === 2 && d.float() < ACCESSORY_SHOP_FINE_CHANCE
          const id = `a-${settlementId}-w${week}-${service}-${i}`
          return rollAccessory(d, content, fine ? 2 : 1, id)
        }).flatMap((a) => (a ? [{ service, accessory: a }] : []))
      })[0]
    })
    .filter(({ accessory }) => !state.gearTaken.includes(accessory.id))
    .map(({ service, accessory }) => {
      const price = accessory.value
      const reason = refused ?? (state.gold < price ? `costs ${price} gp` : null)
      return { id: accessory.id, service, accessory, price, available: reason === null, reason }
    })
}

/** What an accessory fetches when sold back: ACCESSORY_RESALE of its value, rounded up. */
export const resalePrice = (a: Pick<Accessory, 'value'>): number =>
  Math.ceil(a.value * ACCESSORY_RESALE)

/** The party's unworn accessories with what a shop here pays for each, and whether it can sell. */
export function accessorySales(
  state: GameState,
  content: Content
): { accessory: Accessory; price: number; available: boolean; reason: string | null }[] {
  const reason = shopRefusal(state, content, state.location)
  return state.gear.map((accessory) => ({
    accessory,
    price: resalePrice(accessory),
    available: reason === null,
    reason,
  }))
}

export type AccessoryAction =
  /** Buy an accessory offered here (accessoryOffers) into the party's gear. */
  | { type: 'buyAccessory'; offerId: string }
  /** Sell an unworn accessory to a shop here that deals in them. */
  | { type: 'sellAccessory'; id: string }
  /** Wear an accessory from the gear; whatever was worn goes back to the gear. */
  | { type: 'equipAccessory'; characterId: string; id: string }
  | { type: 'unequipAccessory'; characterId: string }

/** Puts an accessory on: its `maxHp` hooks raise max HP and HP (a downed member stays down). */
function wear(c: Character, a: Accessory): Character {
  const bonus = maxHpBonus(a.hooks)
  return { ...c, accessory: a, maxHp: c.maxHp + bonus, hp: c.hp > 0 ? c.hp + bonus : 0 }
}

/** Takes the worn accessory off: its max HP goes, but HP never drops below 1 for it. */
function unwear(c: Character): Character {
  const bonus = maxHpBonus(c.accessory?.hooks ?? [])
  const maxHp = Math.max(1, c.maxHp - bonus)
  const hp = c.hp > 0 ? Math.max(1, Math.min(maxHp, c.hp - bonus)) : 0
  return { ...c, accessory: null, maxHp, hp }
}

const withMember = (state: GameState, c: Character): GameState => ({
  ...state,
  party: state.party.map((m) => (m.id === c.id ? c : m)),
})

function buy(state: GameState, content: Content, offerId: string): GameState {
  const here = state.location
  const offer = here ? accessoryOffers(state, content, here).find((o) => o.id === offerId) : null
  if (!offer) return appendLog(state, 'That is no longer for sale.', 'bad')
  if (!offer.available) return appendLog(state, `${offer.accessory.name}: ${offer.reason}.`, 'bad')
  return appendLog(
    {
      ...state,
      gold: state.gold - offer.price,
      gear: [...state.gear, offer.accessory],
      gearTaken: [...state.gearTaken, offer.id],
    },
    `Bought: ${describeAccessory(offer.accessory)}, for ${offer.price} gp.`,
    'info'
  )
}

function sell(state: GameState, content: Content, id: string): GameState {
  const sale = accessorySales(state, content).find((s) => s.accessory.id === id)
  if (!sale) return appendLog(state, 'The party carries no such accessory.', 'bad')
  if (!sale.available) return appendLog(state, sale.reason!, 'bad')
  return appendLog(
    { ...state, gold: state.gold + sale.price, gear: state.gear.filter((a) => a.id !== id) },
    `Sold: ${sale.accessory.name}, for ${sale.price} gp.`,
    'info'
  )
}

function equip(state: GameState, characterId: string, id: string): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const c = state.party.find((m) => m.id === characterId)
  const a = state.gear.find((g) => g.id === id)
  if (!c || !a) return appendLog(state, 'There is no such accessory to put on.', 'bad')
  if (c.exhaustion >= MAX_EXHAUSTION) return appendLog(state, `${c.name} is dead.`, 'bad')
  const old = c.accessory
  const gear = [...state.gear.filter((g) => g.id !== id), ...(old ? [old] : [])]
  return appendLog(
    withMember({ ...state, gear }, wear(old ? unwear(c) : c, a)),
    `${c.name} puts on the ${describeAccessory(a)}.`,
    'info'
  )
}

function unequip(state: GameState, characterId: string): GameState {
  if (inProgress(state)) return appendLog(state, BUSY, 'bad')
  const c = state.party.find((m) => m.id === characterId)
  if (!c?.accessory) return appendLog(state, 'Nothing to take off.', 'bad')
  return appendLog(
    withMember({ ...state, gear: [...state.gear, c.accessory] }, unwear(c)),
    `${c.name} takes off the ${c.accessory.name}.`,
    'info'
  )
}

export function stepAccessory(
  state: GameState,
  action: AccessoryAction,
  content: Content
): GameState {
  switch (action.type) {
    case 'buyAccessory':
      return buy(state, content, action.offerId)
    case 'sellAccessory':
      return sell(state, content, action.id)
    case 'equipAccessory':
      return equip(state, action.characterId, action.id)
    case 'unequipAccessory':
      return unequip(state, action.characterId)
  }
}

/**
 * Problems with the affix tables the schemas can't see: unknown or non-base `bases`, and a base
 * that can't roll an accessory of some tier (tier 2 needs a tier-2 affix with a partner of the
 * other part and another hook kind). The bundled tables must also use every hook kind (a
 * content test checks that, with hookKindsUsed).
 */
export function accessoryIssues(content: Content): string[] {
  const issues: string[] = []
  const parts = sortedEntries(content.accessoryParts)
  if (parts.length === 0) return issues
  for (const p of parts) {
    for (const b of p.bases ?? []) {
      if (own(content.accessoryParts, b)?.part !== 'base') {
        issues.push(`accessoryParts: "${p.id}" names "${b}", which is not a base`)
      }
    }
  }
  for (const tier of ACCESSORY_TIERS) {
    const bases = basesFor(content, tier)
    if (bases.length === 0) issues.push(`accessoryParts: no base can be rolled at tier ${tier}`)
    for (const base of bases) {
      const fits = affixesFor(content, base, tier)
      const fine = fits.filter((p) => p.minTier === tier)
      const paired = fine.some((f) =>
        fits.some((p) => p.part !== f.part && p.hook?.hook !== f.hook?.hook)
      )
      if (fine.length === 0 || (tier === 2 && !paired)) {
        issues.push(`accessoryParts: a tier-${tier} ${base.name} can't be rolled in full`)
      }
    }
  }
  return issues
}

/** The hook kinds the affix tables use, in HOOK_KINDS order. */
export const hookKindsUsed = (content: Content): HookKind[] => {
  const used = new Set(Object.values(content.accessoryParts).flatMap((p) => p.hook?.hook ?? []))
  return HOOK_KINDS.filter((kind) => used.has(kind))
}
