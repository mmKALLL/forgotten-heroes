import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import { components, straightKm } from './geo'

/** A route may wind, but not to more than twice the straight line. */
export const MAX_WINDING = 2

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
  return issues
}
