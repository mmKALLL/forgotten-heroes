import { generateHumanName } from '../generators/human-names-english'
import { classNames, raceNames, type Character, type Class } from '../types'
import { assertNever, getRandomValue, randomInt } from './general-utils'

// prettier-ignore
const xpByLevel = [
  500, 1500, 3000, 4000, 5000,
  6500, 8000, 9000, 10000, 12000,
  14000, 16000, 18000, 20000, 22500,
  25000, 27500, 30000, 35000, 40000
]
export function getXpTnl({ xp, level }: { xp: number; level: number }) {
  // return xpByLevel.slice(0, level).reduce((acc, cur) => acc + cur) - totalXp // total XP doesn't reset between levels
  return xpByLevel[level - 1] - xp
}

export function gainXp(
  character: Character,
  expGained: number
): {
  character: Character
  effectDescriptions: string[]
} {
  let newCharacter = { ...character, xp: character.xp + expGained }
  return checkLevelUp(newCharacter)
}

export function checkLevelUp(character: Character): {
  character: Character
  effectDescriptions: string[]
} {
  if (getXpTnl(character) > 0) {
    return { character, effectDescriptions: [] }
  }
  let newCharacter = {
    ...character,
    level: character.level + 1,
    xp: character.xp - xpByLevel[character.level - 1],
  }
  let effectDescriptions = [`${newCharacter.name} reached level ${newCharacter.level}!`]

  // TODO: Get effects based on class, etc
  const hpGain = Math.floor(newCharacter.hitDie + (newCharacter.vit - 10) / 2)
  newCharacter.hp += hpGain
  newCharacter.maxHp += hpGain
  effectDescriptions.push(`Gained +${hpGain} max HP!`)

  // PHB gives 2 stats every 4 levels, but in FH we give one random stat every 2 levels from 3rd onwards. No limit at 20.
  if (newCharacter.level % 2 === 1) {
    const statKey = getRandomValue(statSpreadKeys)
    newCharacter[statKey] += 1
    effectDescriptions.push(`Gained +1 ${statKey}!`)
  }
  return {
    character: newCharacter,
    effectDescriptions,
  }
}

const statSpreads: {
  [key: string]: { hitDie: number } & Pick<Character, 'str' | 'dex' | 'vit' | 'int' | 'wis' | 'cha'>
} = {
  fighter: { hitDie: 10, str: 16, dex: 10, vit: 14, int: 10, wis: 12, cha: 8 },
  cleric: { hitDie: 8, str: 14, dex: 8, vit: 12, int: 10, wis: 10, cha: 16 },
  rogue: { hitDie: 8, str: 10, dex: 16, vit: 10, int: 8, wis: 14, cha: 12 },
  wizard: { hitDie: 6, str: 8, dex: 12, vit: 10, int: 16, wis: 14, cha: 10 },
}

const statSpreadKeys = ['str', 'dex', 'vit', 'int', 'wis', 'cha']

export function generateCharacter(): Character {
  const race = getRandomValue(raceNames)
  const className = getRandomValue(classNames)
  const statSpread = { ...statSpreads[className] } // shallow copy
  ;[...Array(3)].forEach(() => (statSpread[getRandomValue(statSpreadKeys)] += 1)) // Distribute extra stat points at random
  const maxHp = statSpread.hitDie * 2 + (statSpread.vit - 10) * 2
  return {
    name: generateHumanName(),
    level: 1,
    race,
    class: className,
    hp: maxHp,
    maxHp,
    buffs: [],
    ...statSpread,
    xp: 0,
    totalXp: 0,
  }
}
