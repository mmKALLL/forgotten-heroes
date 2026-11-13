import type { Content } from '../../content/build'
import type { Biome, Good, LogTone, Pace } from '../../schema/types'
import type { Character, GameState, Goods } from '../../schema/state'
import { formatModifier } from '../format'
import { appendLog } from '../log'
import { spoilDay } from '../economy/goods'
import { animalWater } from '../town/animals'
import type { Rng } from '../rng'
import { MAX_EXHAUSTION, statModifier } from '../rules/character'
import { rollCheck } from '../rules/checks'
import { fadeStrainAfter } from '../rules/strain'
import { enduranceBonus } from '../gear/hooks'
import { rationMultiplier } from './pace'
import { escortPassengers } from '../town/contract-hooks'
import { isAlive, wentWithout } from '../town/camaraderie'
import { DEFAULT_PACE, FORCED_MARCH_DC, HUNGER_DC, THIRST_DC } from '../constants'

// A day passing: eating, drinking and going without (design §7). Kept apart from supplies.ts so
// encounter effects (a `days` effect) can pass days without importing the travel actions.

export const goodsOf = (goods: Goods, good: Good): number => goods[good] ?? 0
/** Water per member per day: the desert takes twice as much. */
export const waterNeed = (terrain: Biome | null): number => (terrain === 'desert' ? 2 : 1)
/** The party's extra on top of the daily rations at this pace (a forced march eats more). */
const extraFor = (ration: number, pace: Pace): number =>
  Math.ceil(ration * (rationMultiplier(pace) - 1))

/** What the whole party eats and drinks in one day at this pace. */
export function dailyNeed(
  members: number,
  terrain: Biome | null,
  pace: Pace = DEFAULT_PACE
): { food: number; water: number } {
  const food = members
  const water = waterNeed(terrain) * members
  return { food: food + extraFor(food, pace), water: water + extraFor(water, pace) }
}

type Line = { text: string; tone: LogTone }

/**
 * A CON check against a level of exhaustion (an `endurance` hook helps, gear/hooks.ts); returns
 * the character after it, and a log line.
 */
function endure(
  rng: Rng,
  c: Character,
  dc: number,
  what: string
): { rng: Rng; character: Character; line: Line } {
  const [roll, next] = rollCheck(rng, statModifier(c, 'con') + enduranceBonus(c), dc)
  const holds = roll.tier === 'success' || roll.tier === 'critSuccess'
  const line =
    `${c.name} ${what}: CON ${roll.kept} ${formatModifier(roll.modifier)} = ` +
    `${roll.total} vs DC ${dc}, ${holds ? 'holds up' : 'gains a level of exhaustion'}.`
  const character = holds ? c : { ...c, exhaustion: Math.min(MAX_EXHAUSTION, c.exhaustion + 1) }
  return { rng: next, character, line: { text: line, tone: holds ? 'info' : 'bad' } }
}

/**
 * One day passes. Members eat and drink in party order. Whoever goes without makes a CON check
 * (DC 10 without food, 15 without water) or gains a level of exhaustion. On a forced march the
 * party then eats its extra rations (what is left of them), and every member makes a CON check
 * (FORCED_MARCH_DC) or gains a level of exhaustion. Strain fades (faster with a `strainFade` hook),
 * except stacks gained today.
 * With `content`, goods then spoil (spoilDay). Returns the ids of those who went without, for rest.
 */
export function consumeDay(
  state: GameState,
  terrain: Biome | null,
  pace: Pace,
  content?: Content
): { state: GameState; unfed: string[] } {
  let food = goodsOf(state.goods, 'food')
  let water = goodsOf(state.goods, 'water')
  const need = waterNeed(terrain)
  let rng = state.rng
  const unfed: string[] = []
  const lines: Line[] = []
  const party = state.party.map((c) => {
    const fed = food >= 1
    if (fed) food -= 1
    const watered = water >= need
    if (watered) water -= need
    let character = fadeStrainAfter(c, state.skillUses, state.day)
    if (!fed || !watered) {
      unfed.push(c.id)
      const lack = !fed && !watered ? 'food and water' : fed ? 'water' : 'food'
      const dc = watered ? HUNGER_DC : THIRST_DC
      const result = endure(rng, character, dc, `goes without ${lack}`)
      rng = result.rng
      character = result.character
      lines.push(result.line)
    }
    return character
  })
  // Escorted passengers eat and drink after the members, and go without quietly.
  const guests = escortPassengers(state)
  food = Math.max(0, food - guests)
  water = Math.max(0, water - guests * need)
  const eaters = state.party.length + guests
  const extra = dailyNeed(eaters, terrain, pace)
  food = Math.max(0, food - (extra.food - eaters))
  water = Math.max(0, water - (extra.water - need * eaters))
  // Animals drink from the carried water too (in town the water is free).
  if (content && terrain !== null) water = Math.max(0, water - animalWater(state, content) * need)
  const marched =
    pace === 'forced'
      ? party.map((c) => {
          const result = endure(rng, c, FORCED_MARCH_DC, 'pushes on')
          rng = result.rng
          lines.push(result.line)
          return result.character
        })
      : party
  let next: GameState = {
    ...state,
    rng,
    party: marched,
    day: state.day + 1,
    goods: { ...state.goods, food, water },
  }
  for (const line of lines) next = appendLog(next, line.text, line.tone)
  // Camaraderie suffers once for a day on which a living member went without.
  if (state.party.some((c) => unfed.includes(c.id) && isAlive(c))) next = wentWithout(next)
  return { state: content ? endOfDay(next, content) : next, unfed }
}

/** A day ends: goods spoil (spoilDay). Owned animals cost nothing to keep (designer call). */
export const endOfDay = (state: GameState, content: Content): GameState => spoilDay(state, content)

/** A day on the road at this pace (goods spoil when `content` is given). */
export const passDay = (
  state: GameState,
  terrain: Biome | null,
  pace: Pace = DEFAULT_PACE,
  content?: Content
): GameState => consumeDay(state, terrain, pace, content).state
