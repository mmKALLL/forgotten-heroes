import { sortedEntries, type Content } from '../content/build'
import type { Character } from '../schema/state'
import { withRng, type Rng } from './rng'
import { ABILITIES } from './rules/abilities'
import { personName } from './world/names'

export type GenerateOptions = { classId?: string; ancestryId?: string }

/** Own-property lookup, so ids like "constructor" don't resolve to Object.prototype members. */
const lookup = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

export function generateCharacter(
  rng: Rng,
  content: Content,
  options: GenerateOptions = {}
): [Character, Rng] {
  return withRng(rng, (d) => {
    const cls = options.classId
      ? lookup(content.classes, options.classId)
      : d.pick(sortedEntries(content.classes))
    if (!cls) throw new Error(`unknown class ${options.classId}`)
    const playable = sortedEntries(content.ancestries).filter((a) => a.playable)
    const ancestry = options.ancestryId
      ? lookup(content.ancestries, options.ancestryId)
      : d.pick(playable)
    if (!ancestry) throw new Error(`unknown ancestry ${options.ancestryId}`)

    const abilities = { ...cls.baseAbilities }
    for (let i = 0; i < 3; i++) abilities[d.pick(ABILITIES)] += 1

    const name = personName(d, content, ancestry.id)

    // Ported from the prototype: generous starting HP, since there is no full combat yet.
    const maxHp = Math.max(1, cls.hitDie * 2 + (abilities.con - 10) * 2)

    return {
      id: `c-${d.int(0, 36 ** 6 - 1).toString(36)}`,
      name,
      ancestry: ancestry.id,
      classId: cls.id,
      level: 1,
      abilities,
      skillProficiencies: [...cls.skillProficiencies],
      hitDie: cls.hitDie,
      hp: maxHp,
      maxHp,
      exhaustion: 0,
      strain: {},
    }
  })
}

export function generateParty(rng: Rng, content: Content, size: number): [Character[], Rng] {
  const classIds = sortedEntries(content.classes).map((c) => c.id)
  const party: Character[] = []
  let current = rng
  for (let i = 0; i < size; i++) {
    const used = new Set(party.map((c) => c.classId))
    const available = classIds.filter((id) => !used.has(id))
    const [classId, afterPick] = withRng(current, (d) =>
      d.pick(available.length > 0 ? available : classIds)
    )
    const [character, afterGen] = generateCharacter(afterPick, content, { classId })
    party.push(character)
    current = afterGen
  }
  return [party, current]
}
