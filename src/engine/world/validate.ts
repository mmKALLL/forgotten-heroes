import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import { IdSchema } from '../../schema/common'
import { PX_PER_KM } from '../../schema/world'
import { components, straightKm } from './geo'

/** A route may wind, but not to more than twice the straight line. */
export const MAX_WINDING = 2

/** The land-spot grid read off the map (scripts/map/sample_land_spots.py): 100 px, about 21 km. */
export const SPOT_SPACING_PX = 100
/** A settlement links to the spots within this many km (1.6 grid steps), as does a spot. */
export const SPOT_LINK_KM = (1.6 * SPOT_SPACING_PX) / PX_PER_KM

const groupsText = (groups: string[][]): string => groups.map((g) => g.join(', ')).join(' | ')

/**
 * Problems with the world data that the schemas can't see: unknown references, distances that
 * don't fit the map scale, land routes between islands, and settlements that can't be reached.
 */
export function worldIssues(content: Content): string[] {
  const issues: string[] = []
  const { regions, settlements, routes, towns } = content

  for (const s of sortedEntries(settlements)) {
    if (!Object.hasOwn(regions, s.region)) {
      issues.push(`settlement ${s.id}: unknown region "${s.region}"`)
    }
  }
  for (const r of sortedEntries(regions)) {
    if (!Object.values(settlements).some((s) => s.region === r.id)) {
      issues.push(`region ${r.id} has no settlements`)
    }
  }

  const pairs = new Map<string, string>()
  for (const route of sortedEntries(routes)) {
    const unknown = [route.from, route.to].filter((id) => !Object.hasOwn(settlements, id))
    for (const id of unknown) issues.push(`route ${route.id}: unknown settlement "${id}"`)
    if (unknown.length > 0) continue
    if (route.from === route.to) {
      issues.push(`route ${route.id}: starts and ends at ${route.from}`)
      continue
    }
    const pair = [route.from, route.to].sort(byCodeUnit).join(' ')
    if (pairs.has(pair)) issues.push(`route ${route.id}: duplicates route ${pairs.get(pair)}`)
    else pairs.set(pair, route.id)

    const a = settlements[route.from]
    const b = settlements[route.to]
    const straight = straightKm(a.at, b.at)
    const shown = Math.round(straight)
    if (route.km < Math.floor(straight)) {
      issues.push(
        `route ${route.id}: ${route.km} km is shorter than the straight line (${shown} km)`
      )
    }
    if (route.km > Math.max(5, MAX_WINDING * straight)) {
      issues.push(
        `route ${route.id}: ${route.km} km is more than twice the straight line (${shown} km)`
      )
    }
    if (route.terrain === 'sea') {
      if (!a.coastal || !b.coastal) {
        issues.push(`route ${route.id}: sea routes need a coastal settlement at both ends`)
      }
    } else if (a.island !== b.island) {
      issues.push(
        `route ${route.id}: a land route cannot join ${a.island} and ${b.island}; use terrain "sea"`
      )
    }
  }

  const all = components(content)
  if (all.length > 1) {
    issues.push(`the routes split the world into ${all.length} parts: ${groupsText(all)}`)
  }
  const islands = [...new Set(Object.values(settlements).map((s) => s.island))].sort(byCodeUnit)
  for (const island of islands) {
    const members = new Set(
      Object.values(settlements)
        .filter((s) => s.island === island)
        .map((s) => s.id)
    )
    const parts = components(content, (r) => r.terrain !== 'sea', members)
    if (parts.length > 1) {
      issues.push(`island ${island}: land routes leave ${parts.length} parts: ${groupsText(parts)}`)
    }
  }

  const pins = new Map<string, string>()
  for (const town of sortedEntries(towns)) {
    if (!town.site) continue
    if (!Object.hasOwn(settlements, town.site)) {
      issues.push(`town ${town.id}: unknown site "${town.site}"`)
    } else if (pins.has(town.site)) {
      issues.push(`town ${town.id}: ${town.site} is already pinned to ${pins.get(town.site)}`)
    } else {
      pins.set(town.site, town.id)
    }
  }
  issues.push(...landSpotIssues(content), ...poiTypeIssues(content))
  return issues
}

/** Problems with the POI type table: unknown references, and types that can't be what they say. */
export function poiTypeIssues(content: Content): string[] {
  const issues: string[] = []
  const { situations, partsTables, threats } = content
  for (const type of sortedEntries(content.poiTypes)) {
    const at = `poi type ${type.id}`
    for (const id of type.situations) {
      if (!Object.hasOwn(situations, id)) issues.push(`${at}: unknown situation "${id}"`)
      else if (!situations[id].site) issues.push(`${at}: "${id}" is not a site situation`)
      else if (type.category === 'wonder' && !situations[id].wonder) {
        issues.push(`${at}: a wonder plays only wonders, and "${id}" is not one`)
      }
    }
    if (!Object.hasOwn(partsTables, type.names)) {
      issues.push(`${at}: unknown parts table "${type.names}"`)
    }
    for (const id of type.threats) {
      if (!Object.hasOwn(threats, id)) issues.push(`${at}: unknown threat "${id}"`)
    }
    if (type.hostile && type.category !== 'lair' && type.category !== 'dungeon') {
      const article = /^[aeiou]/.test(type.category) ? 'an' : 'a'
      issues.push(
        `${at}: only a lair or a dungeon can be hostile (it is ${article} ${type.category})`
      )
    }
  }
  return issues
}

/**
 * Problems with the land spots. A settlement without a spot nearby is only a warning ("warning:
 * ..."): a one-marker islet may be too small for one, and then its domain has no land.
 */
function landSpotIssues(content: Content): string[] {
  const issues: string[] = []
  const { landSpots, settlements } = content
  const spots = sortedEntries(landSpots)
  for (const [key, spot] of Object.entries(landSpots).sort(([a], [b]) => byCodeUnit(a, b))) {
    if (!IdSchema.safeParse(spot.id).success) issues.push(`spot ${spot.id}: ids must be kebab-case`)
    else if (key !== spot.id) issues.push(`spot ${spot.id}: listed as ${key}`)
  }
  const islands = new Set(Object.values(settlements).map((s) => s.island))
  for (const spot of spots) {
    if (!islands.has(spot.island)) {
      issues.push(`spot ${spot.id}: no settlement on its island "${spot.island}"`)
    }
  }
  for (const s of sortedEntries(settlements)) {
    const near = spots.some(
      (spot) => spot.island === s.island && straightKm(spot.at, s.at) <= SPOT_LINK_KM
    )
    if (!near) {
      issues.push(
        `warning: settlement ${s.id} has no land spot within ${Math.round(SPOT_LINK_KM)} km`
      )
    }
  }
  const min = SPOT_SPACING_PX / 2
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const [a, b] = [spots[i], spots[j]]
      const px = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y)
      if (px < min) {
        issues.push(`spots ${a.id} and ${b.id} are ${Math.round(px)} px apart (under ${min})`)
      }
    }
  }
  return issues
}
