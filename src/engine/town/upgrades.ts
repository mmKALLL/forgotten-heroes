import { sortedEntries, type Content } from '../../content/build'
import { UPGRADES, UPGRADE_MAX_LEVEL, type UpgradeId } from '../../schema/types'
import type { GameState } from '../../schema/state'
import type { UpgradeDef } from '../../schema/upgrades'
import { inProgress } from '../encounters/run'
import { appendLog } from '../log'
import { inSettlement, notHere } from '../travel/where'
import { upgradeLevel } from '../rules/upgrades'
import {
  BANNER_SOFTEN,
  CAMP_KIT_CHEER,
  CAMP_KIT_CHEER_LEVEL,
  CAMP_KIT_HP,
  DELVING_GEAR_BONUS,
  DELVING_GEAR_CHALLENGE_LEVEL,
  MAPS_EXPLORE,
  SCOUT_CHECK_BONUS,
  SCOUT_HOSTILE_PER_LEVEL,
  SMUGGLE_SHARE,
} from '../constants'

// Party upgrades (Plan 6c; design §4 "Party upgrades"): lasting purchases owned by the party, each
// bought level by level (0–UPGRADE_MAX_LEVEL) where a service that sells it is
// (data/claude/upgrades.json `soldBy`). Level n costs `basePrice` × n. They weigh nothing and
// are never lost. What each level does is rules/upgrades.ts.

export type BuyUpgrade = { type: 'buyUpgrade'; upgrade: UpgradeId }

const own = <T>(table: Record<string, T>, id: string | null): T | undefined =>
  id !== null && Object.hasOwn(table, id) ? table[id] : undefined

const NUMERALS = ['0', 'I', 'II', 'III', 'IV', 'V'] as const

/** A level as a roman numeral (I–V), as names show it: "Surveyor's maps II". */
export const levelNumeral = (level: number): string => NUMERALS[level] ?? String(level)

/** What a level costs: the type's basePrice × the level. */
export const upgradePrice = (def: Pick<UpgradeDef, 'basePrice'>, level: number): number =>
  def.basePrice * level

/** What owning `level` of an upgrade does, in one short line (English). */
export function upgradeEffect(id: UpgradeId, level: number): string {
  switch (id) {
    case 'camp-kit': {
      const hp = `A rest in camp heals +${CAMP_KIT_HP * level} HP each`
      return level >= CAMP_KIT_CHEER_LEVEL
        ? `${hp}, and lifts camaraderie +${CAMP_KIT_CHEER} once a stop`
        : hp
    }
    case 'smugglers-compartment':
      return `Hides ${Math.round(Math.min(1, SMUGGLE_SHARE * level) * 100)}% of the precious goods from tolls and thieves`
    case 'surveyors-maps':
      return `+${MAPS_EXPLORE * level} to explore checks`
    case 'delving-gear': {
      const gear = `+${DELVING_GEAR_BONUS * level} to Athletics, Perception and Acrobatics in dungeon rooms`
      return level >= DELVING_GEAR_CHALLENGE_LEVEL ? `${gear}, +1 to challenge rounds there` : gear
    }
    case 'company-banner':
      return `Every camaraderie loss is ${BANNER_SOFTEN * level} smaller`
    case 'scouts-kit':
      return `+${SCOUT_CHECK_BONUS * level} to surprise checks; ${Math.round(SCOUT_HOSTILE_PER_LEVEL * level * 100)}% fewer hostile road encounters`
  }
}

/** How the upgrade grows (English), for tooltips: what each level adds, and the top level. */
export function upgradeGrowth(id: UpgradeId): string {
  const top = `Levels I–${levelNumeral(UPGRADE_MAX_LEVEL)}`
  switch (id) {
    case 'camp-kit':
      return `${top}: +${CAMP_KIT_HP} HP a camp rest per level; from ${levelNumeral(CAMP_KIT_CHEER_LEVEL)} a camp rest also lifts camaraderie +${CAMP_KIT_CHEER}, once per stop or journey.`
    case 'smugglers-compartment':
      return `${top}: ${Math.round(SMUGGLE_SHARE * 100)}% more of each precious good hidden per level, from road thieves and tolls, and from the eyes that judge the party's wealth.`
    case 'surveyors-maps':
      return `${top}: +${MAPS_EXPLORE} to explore checks per level.`
    case 'delving-gear':
      return `${top}: +${DELVING_GEAR_BONUS} per level to Athletics, Perception and Acrobatics checks in dungeon rooms; at ${levelNumeral(DELVING_GEAR_CHALLENGE_LEVEL)} also +1 to every skill-challenge round there.`
    case 'company-banner':
      return `${top}: every camaraderie loss is ${BANNER_SOFTEN} smaller per level (never below 0).`
    case 'scouts-kit':
      return `${top}: +${SCOUT_CHECK_BONUS} per level to checks against an ambush or being caught unawares, and to any check rolled with disadvantage (once, if both); ${Math.round(SCOUT_HOSTILE_PER_LEVEL * 100)}% fewer of the road's encounters are hostile per level.`
  }
}

/** The next level of an upgrade for sale here, as a service tile offers it. */
export type UpgradeOffer = {
  id: UpgradeId
  name: string
  /** The level it buys (the party owns one less). */
  level: number
  price: number
  /** What owning that level does (upgradeEffect). */
  effect: string
  /** The type's flavour and how it grows, for the tooltip. */
  detail: string
  /** The service here whose tile shows it (the first present in its `soldBy`). */
  service: string
  affordable: boolean
}

/**
 * The next level of each upgrade a service here sells, in UPGRADES order; none on the road, during
 * an encounter, or for an upgrade already at its top level.
 */
export function upgradeOffers(state: GameState, content: Content): UpgradeOffer[] {
  if (inProgress(state) || !inSettlement(state)) return []
  const here = own(state.world.settlements, state.location)?.services ?? []
  return UPGRADES.flatMap((id): UpgradeOffer[] => {
    const def = own(content.upgrades, id)
    const service = def?.soldBy.find((s) => here.includes(s))
    const level = upgradeLevel(state, id) + 1
    if (!def || !service || level > UPGRADE_MAX_LEVEL) return []
    const price = upgradePrice(def, level)
    return [
      {
        id,
        name: def.name,
        level,
        price,
        effect: upgradeEffect(id, level),
        detail: `${def.description} ${upgradeGrowth(id)}`,
        service,
        affordable: state.gold >= price,
      },
    ]
  })
}

/** An upgrade the party owns, for the party panel. */
export type OwnedUpgrade = { id: UpgradeId; name: string; level: number; effect: string }

/** The upgrades the party owns (level 1+), in UPGRADES order. */
export const ownedUpgrades = (state: GameState, content: Content): OwnedUpgrade[] =>
  sortedEntries(content.upgrades)
    .sort((a, b) => UPGRADES.indexOf(a.id) - UPGRADES.indexOf(b.id))
    .flatMap((def) => {
      const level = upgradeLevel(state, def.id)
      return level > 0
        ? [{ id: def.id, name: def.name, level, effect: upgradeEffect(def.id, level) }]
        : []
    })

/** Buys the next level of an upgrade from a service here that sells it. */
export function buyUpgrade(state: GameState, content: Content, id: UpgradeId): GameState {
  if (inProgress(state)) return appendLog(state, 'Finish the current encounter first.', 'bad')
  if (!inSettlement(state)) {
    return appendLog(state, notHere(state, 'Upgrades can only be bought in a settlement.'), 'bad')
  }
  const def = own(content.upgrades, id)
  if (!def) return appendLog(state, `Unknown upgrade "${id}".`, 'bad')
  if (upgradeLevel(state, id) >= UPGRADE_MAX_LEVEL) {
    return appendLog(state, `${def.name} is already at its best.`, 'bad')
  }
  const offer = upgradeOffers(state, content).find((o) => o.id === id)
  if (!offer) return appendLog(state, `No one here sells ${def.name.toLowerCase()}.`, 'bad')
  const name = `${def.name} ${levelNumeral(offer.level)}`
  if (!offer.affordable) return appendLog(state, `${name} costs ${offer.price} gp.`, 'bad')
  return appendLog(
    {
      ...state,
      gold: state.gold - offer.price,
      upgrades: { ...state.upgrades, [id]: offer.level },
    },
    `Bought ${name} for ${offer.price} gp: ${offer.effect.charAt(0).toLowerCase()}${offer.effect.slice(1)}.`,
    'good'
  )
}
