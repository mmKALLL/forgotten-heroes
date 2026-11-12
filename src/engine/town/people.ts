import { byCodeUnit, sortedEntries, type Content } from '../../content/build'
import type { PersonState, WorldState } from '../../schema/world'
import { PEOPLE_BY_SIZE, PEOPLE_LOCAL_ANCESTRY } from '../constants'
import { createRng, withRng } from '../rng'
import { personName } from '../world/names'

/** Mixed into the world seed, so people draw from their own stream and change no other world draw. */
export const PEOPLE_SALT = 0x9e0b1e5a

/** A notable person's id: their settlement and role. */
export const personId = (settlement: string, role: string): string => `p-${settlement}-${role}`

/**
 * The notable people of every settlement (design §8), rolled from the world seed: PEOPLE_BY_SIZE
 * of them by size tier, each in a different role that fits (big enough, and its service is
 * there), drawn by weight. Most share their settlement's ancestry. Pure.
 */
export function generatePeople(
  seed: number,
  content: Content,
  world: Pick<WorldState, 'settlements'>
): Record<string, PersonState> {
  const roles = sortedEntries(content.personRoles)
  const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
  const people: Record<string, PersonState> = {}
  withRng(createRng((seed ^ PEOPLE_SALT) >>> 0), (d) => {
    for (const id of Object.keys(world.settlements).sort(byCodeUnit)) {
      const settlement = world.settlements[id]
      let pool = roles.filter(
        (r) =>
          r.weight > 0 &&
          settlement.sizeTier >= r.minSize &&
          (!r.service || settlement.services.includes(r.service))
      )
      const count = PEOPLE_BY_SIZE[settlement.sizeTier] ?? 0
      for (let i = 0; i < count && pool.length > 0; i++) {
        const role = d.weighted(pool, (r) => r.weight)
        pool = pool.filter((r) => r !== role)
        const others = playable.filter((a) => a.id !== settlement.ancestry)
        const local = others.length === 0 || d.float() < PEOPLE_LOCAL_ANCESTRY
        const ancestry = local ? settlement.ancestry : d.pick(others).id
        people[personId(id, role.id)] = {
          settlement: id,
          role: role.id,
          name: personName(d, content, ancestry),
          ancestry,
        }
      }
    }
  })
  return people
}

/** FNV-1a of a string: a stable 32-bit hash, so a person's title needs no stored draw. */
function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

type PeopleWorld = Pick<WorldState, 'seed' | 'people'>

/**
 * A notable person's form of address from their role's titles, e.g. "Mother": derived from the
 * world seed and their id, so it never changes and needs no state. Null when the role has none.
 */
export function personTitle(world: PeopleWorld, content: Content, id: string): string | null {
  if (!Object.hasOwn(world.people, id)) return null
  const role = world.people[id].role
  const titles = Object.hasOwn(content.personRoles, role) ? content.personRoles[role].titles : []
  if (titles.length === 0) return null
  return titles[((hashString(id) ^ world.seed) >>> 0) % titles.length]
}

/** A notable person's name with their title, e.g. "Mother Ada Stone"; the bare id if unknown. */
export function personDisplayName(world: PeopleWorld, content: Content, id: string): string {
  if (!Object.hasOwn(world.people, id)) return id
  const title = personTitle(world, content, id)
  const name = world.people[id].name
  return title ? `${title} ${name}` : name
}
