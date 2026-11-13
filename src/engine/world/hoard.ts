import type { Content } from '../../content/build'
import type { Dungeon } from '../../schema/dungeon'
import type { Effect } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { changeGoods } from '../economy/goods'
import { describeAccessory, lootAccessory } from '../gear/accessories'
import { appendLog } from '../log'
import { withRng } from '../rng'
import { crLevel } from '../rules/challenge'
import { typicalPay } from '../rules/levels'
import { gainXp, xpLine } from '../rules/progression'
import { siteContractsMet } from '../town/contract-hooks'
import { DELVE_FINE_CR, DELVE_REWARD, XP_CLEAR } from '../constants'

// A dungeon's hoard (Plan 6 D3): what clearing its last room pays. The `hoard` effect carries the
// whole of it, worked out when the last room starts, so its chip shows what it will pay.

export type HoardEffect = Extract<Effect, { effect: 'hoard' }>

/**
 * The hoard of a dungeon: DELVE_REWARD × a same-level contract's pay (typicalPay at the level its
 * CR is meant for) in gold, its authored precious goods and accessories (tier 2 from
 * DELVE_FINE_CR), and XP_CLEAR × (1 + the site's power) XP, as for any cleared site.
 */
export function hoardOf(dungeon: Pick<Dungeon, 'cr' | 'hoard'>, power: number): HoardEffect {
  const pay = typicalPay(crLevel(dungeon.cr))
  return {
    effect: 'hoard',
    gold: { min: Math.floor(DELVE_REWARD[0] * pay), max: Math.ceil(DELVE_REWARD[1] * pay) },
    precious: dungeon.hoard.precious,
    accessories: dungeon.hoard.accessory,
    tier: dungeon.cr >= DELVE_FINE_CR ? 2 : 1,
    xp: XP_CLEAR * (1 + power),
  }
}

/** The hoard's chip, e.g. "the hoard: 60–80 gp, 2 precious goods, an accessory, +150 XP". */
export function describeHoard(h: HoardEffect): string {
  const parts = [`${h.gold.min}–${h.gold.max} gp`]
  if (h.precious > 0) parts.push(`${h.precious} precious good${h.precious === 1 ? '' : 's'}`)
  if (h.accessories > 0) {
    const fine = h.tier === 2 ? 'fine ' : ''
    parts.push(h.accessories === 1 ? `a ${fine}accessory` : `${h.accessories} ${fine}accessories`)
  }
  if (h.xp > 0) parts.push(`+${h.xp} XP`)
  return `clears it: the hoard, ${parts.join(', ')}`
}

/**
 * Pays a hoard at the site being visited: the site is cleared (it lies empty, as clearPoi), the
 * gold is rolled in its range, the precious goods are added (most valuable first), each accessory
 * is rolled into the gear, the XP is shared, a bounty on the site is met, and the delve (if any)
 * ends cleared. One journal line (and one in the encounter's log) says what was found.
 */
export function payHoard(
  state: GameState,
  content: Content | undefined,
  h: HoardEffect
): GameState {
  const id = state.encounter?.poi
  if (!id || !Object.hasOwn(state.world.pois, id)) return state
  const poi = state.world.pois[id]
  const [gold, rng] = withRng(state.rng, (d) => d.int(h.gold.min, Math.max(h.gold.min, h.gold.max)))
  const pois = { ...state.world.pois, [id]: { ...poi, clearedDay: state.day } }
  let next: GameState = {
    ...state,
    rng,
    gold: state.gold + gold,
    world: { ...state.world, pois },
    goods:
      content && h.precious > 0
        ? changeGoods(state.goods, content, { category: 'precious', amount: h.precious })
        : state.goods,
    delve:
      state.delve && state.delve.poi === id ? { ...state.delve, ended: 'cleared' } : state.delve,
  }
  const found: string[] = [`${gold} gp`]
  if (h.precious > 0) found.push(`${h.precious} precious goods`)
  for (let i = 0; content && i < h.accessories; i++) {
    const looted = lootAccessory(next, content, h.tier)
    if (!looted) break
    next = looted.state
    found.push(describeAccessory(looted.accessory))
  }
  const lines = [
    { text: `${poi.name} is cleared. Its hoard: ${found.join(', ')}.`, tone: 'good' as const },
    ...(h.xp > 0 ? [{ text: xpLine(h.xp, `${poi.name} cleared`), tone: 'good' as const }] : []),
  ]
  next = gainXp(next, h.xp)
  for (const line of lines) {
    next = appendLog(next, line.text, line.tone)
    if (next.encounter) {
      next = { ...next, encounter: { ...next.encounter, log: [...next.encounter.log, line] } }
    }
  }
  return siteContractsMet(next, 'bounty', id)
}
