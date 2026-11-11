import skillsJson from '../../../data/original/skills.json'
import { ABILITIES, SKILLS, type Ability, type CheckStat, type Skill } from '../../schema/constants'
import { contentFileSchema } from '../../schema/content'

export { ABILITIES, SKILLS }
export type { Ability, CheckStat, Skill }

// Skills are content: data/original/skills.json is the single source of truth for each skill's
// default ability and label. It is parsed once at module load so the engine stays synchronous.
const skillsFile = contentFileSchema('skills').parse(skillsJson)
const skillDefs = new Map(skillsFile.entries.map((def) => [def.id, def]))
const missing = SKILLS.filter((id) => !skillDefs.has(id))
if (missing.length > 0 || skillDefs.size !== skillsFile.entries.length) {
  throw new Error(
    `data/original/skills.json must define each skill in SKILLS exactly once (missing: ${missing.join(', ') || 'none'})`
  )
}

export const SKILL_ABILITY: Readonly<Record<Skill, Ability>> = Object.fromEntries(
  SKILLS.map((id) => [id, skillDefs.get(id)!.ability])
) as Record<Skill, Ability>

const SKILL_LABELS: Readonly<Record<Skill, string>> = Object.fromEntries(
  SKILLS.map((id) => [id, skillDefs.get(id)!.name])
) as Record<Skill, string>

export const isSkill = (stat: CheckStat): stat is Skill => Object.hasOwn(SKILL_ABILITY, stat)

export const abilityOf = (stat: CheckStat): Ability => (isSkill(stat) ? SKILL_ABILITY[stat] : stat)

export const statLabel = (stat: CheckStat): string =>
  isSkill(stat) ? SKILL_LABELS[stat] : stat.toUpperCase()

export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2)

export const proficiencyBonus = (level: number): number => 2 + Math.floor((level - 1) / 4)
