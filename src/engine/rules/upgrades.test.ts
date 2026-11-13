import { describe, expect, test } from 'vitest'
import { SituationSchema } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { createRng } from '../rng'
import { step } from '../state'
import { brom, fixtureContent, makeEncounter, makeState } from '../test-fixtures'
import { challengePreview, encounterOptions, type ShownOutcome } from '../encounters/preview'
import { visibleWealth } from '../economy/wealth'
import { wentWithout } from '../town/camaraderie'
import { restOption } from '../travel/supplies'
import { exploreOption } from '../world/explore'
import { tierOdds } from './checks'

// Each upgrade's effect as its preview shows it and as it happens (Plan 6c: preview == actual).

const content = fixtureContent()

const outcomes = {
  fail: { text: 'No.' },
  partial: { text: 'Nearly.' },
  success: { text: 'Yes.' },
}
const check = (id: string, skill: string) => ({
  id,
  kind: 'check',
  label: id,
  check: { skill, dc: 13 },
  outcomes,
})

/** A state in an encounter with these stages, at a seed. */
function meeting(situation: unknown, overrides: Partial<GameState> = {}, seed = 3): GameState {
  const parsed = SituationSchema.parse(situation)
  return {
    ...makeState({ encounter: makeEncounter({ situation: parsed }), ...overrides }),
    rng: createRng(seed),
  }
}
const choose = (state: GameState, optionId: string) =>
  step(state, { type: 'chooseOption', optionId }, content)

/** The signed amounts of the "±n camaraderie" chips. */
const camaraderieChips = (chips: string[]): number[] =>
  chips.flatMap((c) => {
    const m = /^([+−])(\d+) camaraderie/.exec(c)
    return m ? [(m[1] === '−' ? -1 : 1) * Number(m[2])] : []
  })

describe("surveyor's maps", () => {
  test('add to the search as shown, and the roll uses it', () => {
    const plain = makeState({ location: 'greenvale-1' })
    const mapped = { ...plain, upgrades: { 'surveyors-maps': 2 } }
    const without = exploreOption(plain, content)!
    const option = exploreOption(mapped, content)!
    expect(option.maps).toBeGreaterThan(0)
    expect(option.modifier).toBe(without.modifier + option.maps)
    expect(option.findChance).toBeGreaterThan(without.findChance)
    const searched = step(mapped, { type: 'explore' }, content)
    expect(searched.lastRoll?.modifier).toBe(option.modifier)
  })
})

describe('camp kit', () => {
  test('a rest in camp heals the shown extra HP, and from level III lifts camaraderie once', () => {
    const poi = Object.keys(makeState().world.pois)[0]
    const hurt = makeState({
      location: poi,
      party: [{ ...brom, hp: 2 }],
      goods: { food: 10, water: 10 },
      upgrades: { 'camp-kit': 3 },
    })
    const option = restOption(hurt, content, false)
    expect(option.inTown).toBe(false)
    expect(option.kitHp).toBeGreaterThan(0)
    expect(option.cheer).toBeGreaterThan(0)
    const rested = step(hurt, { type: 'rest', lodging: false }, content)
    const heal = Math.ceil(brom.maxHp * option.healShare) + option.kitHp
    expect(rested.party[0].hp).toBe(Math.min(brom.maxHp, 2 + heal))
    expect(rested.camaraderie).toBe(hurt.camaraderie + option.cheer)
    // Once a stop: the next rest here brings no more.
    expect(restOption(rested, content, false).cheer).toBe(0)
    const again = step(rested, { type: 'rest', lodging: false }, content)
    expect(again.camaraderie).toBe(rested.camaraderie)
    // Below level III, no camaraderie.
    expect(restOption({ ...hurt, upgrades: { 'camp-kit': 2 } }, content, false).cheer).toBe(0)
  })
})

describe("smuggler's compartment", () => {
  const thieves = {
    id: 'cutpurse',
    title: 'Cutpurse',
    tags: ['road', 'thieves'],
    stages: {
      start: {
        text: 'A hand in your pack.',
        options: [
          {
            id: 'shrug',
            kind: 'fixed',
            label: 'Shrug',
            outcome: {
              text: 'Gone.',
              effects: [{ effect: 'goods', category: 'precious', fraction: 0.5 }],
            },
          },
        ],
      },
    },
  }

  test('the hidden share is out of reach of thieves, as the chip says', () => {
    const hidden = meeting(thieves, {
      goods: { gems: 10 },
      upgrades: { 'smugglers-compartment': 1 },
    })
    const chips = (encounterOptions(hidden)[0].outcomes[0] as ShownOutcome).effects
    expect(chips.some((c) => c.includes('(2 hidden)'))).toBe(true)
    // Half of the 8 in sight goes; the 2 hidden stay.
    expect(choose(hidden, 'shrug').goods.gems).toBe(6)
    const plain = meeting(thieves, { goods: { gems: 10 } })
    expect(choose(plain, 'shrug').goods.gems).toBe(5)
    const all = meeting(thieves, { goods: { gems: 10 }, upgrades: { 'smugglers-compartment': 5 } })
    expect(choose(all, 'shrug').goods.gems).toBe(10)
  })

  test('hidden goods are not visible wealth, and other encounters see everything', () => {
    const state = makeState({ goods: { gems: 10 } })
    const hiding = { ...state, upgrades: { 'smugglers-compartment': 3 } }
    expect(visibleWealth(hiding, content).precious).toBeLessThan(
      visibleWealth(state, content).precious
    )
    const toll = meeting(
      { ...thieves, tags: ['road'] },
      { goods: { gems: 10 }, upgrades: { 'smugglers-compartment': 5 } }
    )
    expect(choose(toll, 'shrug').goods.gems).toBe(5)
  })
})

describe('delving gear', () => {
  const room = (extra: object = {}) => ({
    id: 'wall',
    title: 'A wall',
    site: true,
    room: true,
    stages: {
      start: {
        text: 'A wall.',
        options: [check('climb', 'athletics'), check('talk', 'persuasion')],
        ...extra,
      },
    },
  })

  test('adds to Athletics in a dungeon room as the preview says, not to other skills', () => {
    const geared = meeting(room(), { upgrades: { 'delving-gear': 2 } })
    const [climb, talk] = encounterOptions(geared)
    expect(climb.check!.upgradeModifier).toBe(2)
    expect(talk.check!.upgradeModifier).toBe(0)
    const rolled = choose(geared, 'climb')
    expect(rolled.lastRoll!.modifier).toBe(climb.check!.modifier + 2)
    expect(climb.check!.odds).toEqual(tierOdds(rolled.lastRoll!.modifier, 13))
    // Outside a dungeon room it does nothing.
    const road = meeting(
      { ...room(), site: false, room: false },
      { upgrades: { 'delving-gear': 2 } }
    )
    expect(encounterOptions(road)[0].check!.upgradeModifier).toBe(0)
  })

  test('at level V every challenge round gains 1 more, and the odds of winning show it', () => {
    const challenge = {
      challenge: {
        successes: 3,
        failures: 2,
        win: { text: 'Over.' },
        lose: { text: 'Beaten.' },
      },
    }
    const top = meeting(room(challenge), { upgrades: { 'delving-gear': 5 } })
    const [climb, talk] = encounterOptions(top)
    expect(climb.check!.upgradeModifier).toBe(6)
    expect(talk.check!.upgradeModifier).toBe(1)
    expect(choose(top, 'talk').lastRoll!.modifier).toBe(talk.check!.modifier + 1)
    const bare = meeting(room(challenge))
    expect(challengePreview(top)!.chance).toBeGreaterThan(challengePreview(bare)!.chance)
  })
})

describe('company banner', () => {
  const quarrel = {
    id: 'quarrel',
    title: 'A quarrel',
    stages: {
      start: {
        text: 'Words are said.',
        options: [
          {
            id: 'leave',
            kind: 'fixed',
            label: 'Walk away',
            tags: ['retreat'],
            outcome: { text: 'Sulking.', effects: [{ effect: 'camaraderie', amount: -3 }] },
          },
        ],
      },
    },
  }

  test('every loss is smaller as the chips say, and what is left is what happens', () => {
    for (const level of [0, 2, 5]) {
      const state = meeting(quarrel, { upgrades: { 'company-banner': level } })
      const chips = (encounterOptions(state)[0].outcomes[0] as ShownOutcome).effects
      const shown = camaraderieChips(chips).reduce((a, b) => a + b, 0)
      expect(choose(state, 'leave').camaraderie - state.camaraderie).toBe(shown)
    }
    const plain = meeting(quarrel)
    const flown = meeting(quarrel, { upgrades: { 'company-banner': 2 } })
    expect(choose(flown, 'leave').camaraderie).toBeGreaterThan(choose(plain, 'leave').camaraderie)
  })

  test('hunger costs less too, and never turns into a gain', () => {
    const state = makeState()
    const plainLoss = state.camaraderie - wentWithout(state).camaraderie
    const flown = { ...state, upgrades: { 'company-banner': 3 } }
    expect(flown.camaraderie - wentWithout(flown).camaraderie).toBe(plainLoss - 3)
    const huge = { ...state, upgrades: { 'company-banner': 5 } }
    expect(wentWithout(huge).camaraderie).toBeLessThanOrEqual(state.camaraderie)
  })
})
