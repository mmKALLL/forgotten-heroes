import type { Content } from '../../content/build'
import { FightSchema, type Fight } from '../../schema/encounter'

// The developer tools' test fight (Plan 7 Track U): bandits on the line, to playtest the combat
// UI before road encounters offer Fight (Track I). With no encounter open, its endings apply to
// nothing beyond the fight itself (camaraderie, injuries, a wipe's robbery).

const BANDITS = [
  { creature: 'bandit', count: 3 },
  { creature: 'thug', count: 1 },
]

/** The test fight, or its ambush; null when the bundled creatures lack its foes. */
export function testFight(content: Content, ambush: boolean): Fight | null {
  if (!BANDITS.every((e) => Object.hasOwn(content.creatures, e.creature))) return null
  return FightSchema.parse({ enemies: BANDITS, ambush })
}
