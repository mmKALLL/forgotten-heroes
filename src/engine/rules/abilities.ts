import { ABILITIES, SKILLS, type Ability, type CheckStat, type Skill } from '../../schema/constants'

export { ABILITIES, SKILLS }
export type { Ability, CheckStat, Skill }

export const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
}

const SKILL_LABELS: Record<Skill, string> = {
  acrobatics: 'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
}

export const isSkill = (stat: CheckStat): stat is Skill => Object.hasOwn(SKILL_ABILITY, stat)

export const abilityOf = (stat: CheckStat): Ability => (isSkill(stat) ? SKILL_ABILITY[stat] : stat)

export const statLabel = (stat: CheckStat): string =>
  isSkill(stat) ? SKILL_LABELS[stat] : stat.toUpperCase()

export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2)

export const proficiencyBonus = (level: number): number => 2 + Math.floor((level - 1) / 4)
