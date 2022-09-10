import { classNames, raceNames, type Character, type Class } from '../types'
import { assertNever, getRandomValue, randomInt } from './general-utils'

// prettier-ignore
const xpByLevel = [
  500, 1500, 3000, 4000, 5000,
  6500, 8000, 9000, 10000, 12000,
  14000, 16000, 18000, 20000, 22500,
  25000, 27500, 30000, 35000, 40000
]
export function getXpTnl(totalXp: number, level: number) {
  return xpByLevel.slice(0, level).reduce((acc, cur) => acc + cur) - totalXp // total XP doesn't reset between levels
}

export function generateCharacter(level: number = 1): Character {
  const race = getRandomValue(raceNames)
  const className = getRandomValue(classNames)
  const statSpread = { ...statSpreads[className] } // shallow copy
  const statSpreadKeys = Object.keys(statSpread).slice(1)
  ;[...Array(4)].forEach(() => (statSpread[getRandomValue(statSpreadKeys)] += 1)) // Distribute 4 extra points at random
  const maxHp = statSpread.hitDie * 2 + (statSpread.vit - 10) * 3
  return {
    level: 1,
    hp: maxHp,
    maxHp,
    race,
    class: className,
    ...statSpread,
    xp: 0,
    totalXp: 0,
    xpToNextLevel: 1,
  }
}

const statSpreads: {
  [key: string]: { hitDie: number } & Pick<Character, 'str' | 'dex' | 'vit' | 'int' | 'wis' | 'cha'>
} = {
  fighter: { hitDie: 12, str: 16, dex: 10, vit: 14, int: 10, wis: 12, cha: 8 },
  cleric: { hitDie: 10, str: 14, dex: 8, vit: 12, int: 10, wis: 10, cha: 16 },
  rogue: { hitDie: 8, str: 10, dex: 16, vit: 10, int: 8, wis: 14, cha: 12 },
  wizard: { hitDie: 6, str: 8, dex: 10, vit: 12, int: 16, wis: 14, cha: 10 },
}
