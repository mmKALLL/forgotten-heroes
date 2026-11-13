import type { Content } from '../../content/build'
import type { CrisisState, Villain } from '../../schema/crisis'
import type { GameState } from '../../schema/state'
import { fillText } from '../encounters/slots'

// Names and text slots of the Crisis: {villain}, {land}, {site} and {seat} (schema/crisis.ts).

const own = <T>(table: Record<string, T>, id: string | null | undefined): T | undefined =>
  id != null && Object.hasOwn(table, id) ? table[id] : undefined

/**
 * How texts name the villain: the rolled own name ("Morvaine" of "Morvaine, the Ashen Prophet"),
 * or the title in running text ("the Ashen Prophet") when it has none.
 */
export const shortName = (name: string): string =>
  name.includes(', ') ? name.slice(0, name.indexOf(', ')) : name.replace(/^The /, 'the ')

/** The act's number as the panel and the journal write it. */
export const ACT_NUMERALS = ['I', 'II', 'III'] as const
export const actNumeral = (i: number): string => ACT_NUMERALS[i] ?? String(i + 1)

/** The Crisis's villain in the content, or undefined when the content no longer has it. */
export const villainOf = (content: Content, crisis: CrisisState): Villain | undefined =>
  own(content.villains, crisis.villain)

/** The land (a region's name) and domain settlement of a POI, for text slots. */
export function siteWhere(
  state: Pick<GameState, 'world'>,
  content: Content,
  poiId: string
): { land: string; seat: string; site: string } {
  const poi = own(state.world.pois, poiId)
  const region = own(content.settlements, poi?.domain)?.region
  return {
    land: own(content.regions, region)?.name ?? region ?? '',
    seat: own(state.world.settlements, poi?.domain)?.name ?? poi?.domain ?? '',
    site: poi?.name ?? poiId,
  }
}

/** The land (a `regions` id) a POI stands in. */
export const siteLand = (
  state: Pick<GameState, 'world'>,
  content: Content,
  poiId: string
): string | undefined => own(content.settlements, own(state.world.pois, poiId)?.domain)?.region

/**
 * A villain or act text with its slots filled: {villain}, and {land}, {site} and {seat} from the
 * site (the act's own, or act I's lead site for villain texts).
 */
export function crisisText(
  state: Pick<GameState, 'world'>,
  content: Content,
  crisis: CrisisState,
  text: string,
  poiId: string = crisis.acts[0].lead
): string {
  return fillText(text, { villain: shortName(crisis.name), ...siteWhere(state, content, poiId) })
}
