import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import type { GameState } from '../../schema/state'
import { createRng } from '../rng'
import { step } from '../state'
import {
  brom,
  fixtureContent,
  lyra,
  makeCharacter,
  makeState,
  testCombatFoes,
} from '../test-fixtures'
import { currentOptions, startEncounter } from './run'
import { encounterOptions } from './preview'
import { FIGHT_OPTION, PARLEY_OPTION, formatCr } from './fights'
import { validateSituation } from './validate'

// Fight and Parley in encounters (Plan 7 Track I): the engine adds them to a hostile stage with a
// fight-like check and known foes, and to a climax's challenge; their endings apply the stage's.

const move = (when: 'desperate' | 'everyOther') => ({
  name: 'Blow',
  text: 'It swings.',
  when,
  kind: 'attack',
})

const situations = [
  {
    id: 'cutthroat-road',
    title: 'Cutthroats',
    disposition: 'hostile',
    foe: 'cutthroat',
    followUpOnly: true,
    stages: {
      start: {
        text: 'Cutthroats block the road.',
        options: [
          {
            id: 'fight',
            kind: 'check',
            label: 'Fight',
            description: 'Quick and bloody.',
            check: { skill: 'athletics', dc: 13, combat: true },
            outcomes: {
              fail: {
                text: 'Beaten.',
                effects: [
                  { effect: 'hp', amount: -4, target: 'all' },
                  { effect: 'gold', amount: -3 },
                ],
              },
              partial: { text: 'A draw.' },
              success: { text: 'They flee.', effects: [{ effect: 'gold', amount: 7 }] },
            },
          },
          {
            id: 'run',
            kind: 'fixed',
            label: 'Run',
            tags: ['retreat'],
            outcome: {
              text: 'You run.',
              effects: [
                { effect: 'hp', amount: -3, target: 'random' },
                { effect: 'inspiration', amount: 1 },
              ],
            },
          },
        ],
      },
    },
  },
  {
    id: 'cutthroat-ambush',
    title: 'Cutthroat ambush',
    disposition: 'hostile',
    tags: ['ambush'],
    foe: 'cutthroat',
    followUpOnly: true,
    stages: {
      start: {
        text: 'Cutthroats leap out.',
        options: [
          {
            id: 'fight',
            kind: 'check',
            label: 'Fight',
            description: 'Quick and bloody.',
            check: { skill: 'athletics', dc: 13, combat: true },
            outcomes: {
              fail: { text: 'Beaten.' },
              partial: { text: 'A draw.' },
              success: { text: 'They flee.' },
            },
          },
          { id: 'run', kind: 'fixed', label: 'Run', outcome: { text: 'You run.' } },
        ],
      },
    },
  },
  {
    id: 'warlord-hall',
    title: 'The warlord',
    disposition: 'hostile',
    followUpOnly: true,
    stages: {
      start: {
        text: 'The warlord rises.',
        challenge: {
          successes: 2,
          failures: 2,
          win: { text: 'He yields.', effects: [{ effect: 'gold', amount: 50 }] },
          lose: {
            text: 'You are thrown out.',
            effects: [
              { effect: 'hp', amount: -5, target: 'all' },
              { effect: 'days', amount: 1 },
            ],
          },
        },
        options: [
          {
            id: 'strike',
            kind: 'check',
            label: 'Strike',
            description: 'Steel.',
            check: { skill: 'athletics', dc: 13, combat: true },
            outcomes: {
              fail: { text: 'Parried.' },
              partial: { text: 'Steel rings.' },
              success: { text: 'A hit.' },
            },
          },
          {
            id: 'talk',
            kind: 'check',
            label: 'Talk',
            description: 'Words.',
            check: { skill: 'persuasion', dc: 13 },
            outcomes: {
              fail: { text: 'No.' },
              partial: { text: 'Maybe.' },
              success: { text: 'Yes.' },
            },
          },
        ],
      },
    },
  },
]

const content: Content = fixtureContent({
  ...testCombatFoes,
  'data/claude/foes-2.json': {
    kind: 'creatures',
    source: 'claude',
    entries: [
      {
        id: 'test-boss',
        name: 'the Test Boss',
        group: 'the Test Boss',
        type: 'humanoid',
        cr: 1,
        description: 'A boss.',
        role: 'leader',
        roads: false,
        signature: move('desperate'),
        trick: move('everyOther'),
      },
    ],
  },
  'data/claude/fight-scenes.json': { kind: 'situations', source: 'claude', entries: situations },
})

const start = (state: GameState, id: string) =>
  step(state, { type: 'startEncounter', situationId: id }, content)
const options = (state: GameState) => currentOptions(state.encounter!)
const fightOf = (state: GameState) => {
  const o = options(state).find((x) => x.id === FIGHT_OPTION)
  return o?.kind === 'fight' ? o.fight : null
}
const choose = (state: GameState, optionId: string) =>
  step(state, { type: 'chooseOption', optionId }, content)
/** Ends the open fight at once: every enemy dead (a win) or every member gone (a retreat). */
const endFight = (state: GameState, how: 'win' | 'retreat'): GameState => {
  const combat = state.combat!
  const units = combat.units.map((u) =>
    how === 'win'
      ? u.side === 'enemy'
        ? { ...u, status: 'dead' as const }
        : u
      : u.side === 'party'
        ? { ...u, status: 'left' as const }
        : u
  )
  return step({ ...state, combat: { ...combat, units } }, { type: 'combatEndTurn' }, content)
}

const leveled = (level: number) => [brom, lyra].map((c) => makeCharacter({ ...c, level }))

describe('Fight on the line in encounters (Plan 7 Track I)', () => {
  test('a hostile stage with a fight-like check offers Fight and Parley after its own options', () => {
    const s = start(makeState({ rng: createRng(3) }), 'cutthroat-road')
    expect(options(s).map((o) => o.id)).toEqual(['fight', 'run', FIGHT_OPTION, PARLEY_OPTION])
    const preview = encounterOptions(s).find((o) => o.id === FIGHT_OPTION)!
    expect(preview.kind).toBe('fight')
    expect(preview.description).toContain(`CR ${formatCr(0.25)}`)
    // The win shows the check's success (and its XP), the loss the failure without its wound.
    expect(preview.fight!.win.effects).toEqual(expect.arrayContaining(['+7 gp']))
    expect(preview.fight!.win.xp).toBeGreaterThan(0)
    expect(preview.fight!.lose.effects.some((e) => /HP/.test(e))).toBe(false)
    expect(preview.fight!.lose.effects).toEqual(expect.arrayContaining(['−3 gp']))
  })

  test('a road group grows with the party: stronger and more members field more foes', () => {
    const count = (state: GameState, id = 'cutthroat-road') =>
      fightOf(start(state, id))!.enemies.reduce((n, e) => n + e.count, 0)
    const novices = count(makeState({ party: leveled(1) }))
    const veterans = count(makeState({ party: leveled(5) }))
    const trio = count(makeState({ party: [...leveled(1), makeCharacter({ id: 'c3' })] }))
    expect(veterans).toBeGreaterThan(novices)
    expect(trio).toBeGreaterThanOrEqual(novices)
    // An ambush is a hard fight and springs from cover.
    const ambush = fightOf(start(makeState({ party: leveled(3) }), 'cutthroat-ambush'))!
    expect(ambush.ambush).toBe(true)
    expect(ambush.enemies[0].count).toBeGreaterThan(count(makeState({ party: leveled(3) })))
  })

  test('choosing Fight opens the fight at the footing; winning applies the success', () => {
    const s = start(makeState({ rng: createRng(5) }), 'cutthroat-road')
    const edged = { ...s, encounter: { ...s.encounter!, position: 'edge' as const } }
    const opened = choose(edged, FIGHT_OPTION)
    expect(opened.combat?.footing).toBe('edge')
    expect(opened.encounter!.stage).toBe('start')
    const won = endFight(opened, 'win')
    expect(won.combat!.result).toBe('victory')
    expect(won.gold).toBe(s.gold + 7)
    expect(won.encounter!.stage).toBeNull()
    // Closing the fight shows the encounter's outcome.
    const closed = step(won, { type: 'closeCombat' }, content)
    expect(closed.combat).toBeNull()
    expect(closed.encounter!.log.at(-1)!.text).toMatch(/They flee/)
  })

  test("retreating applies the stage's flight, without its written wound", () => {
    const s = start(makeState({ rng: createRng(5) }), 'cutthroat-road')
    const fled = endFight(choose(s, FIGHT_OPTION), 'retreat')
    expect(fled.combat!.result).toBe('retreat')
    expect(fled.inspiration).toBe(s.inspiration + 1)
    expect(fled.encounter!.stage).toBeNull()
  })

  test("a climax's Fight is against its boss and henchmen; winning applies the challenge's win", () => {
    const s = startEncounter(
      makeState({ rng: createRng(2) }),
      content,
      'warlord-hall',
      undefined,
      undefined,
      {
        fights: { kind: 'climax', cr: 1, climax: { boss: 'test-boss', henchmen: 'cutthroat' } },
      }
    )
    const fight = fightOf(s)!
    expect(fight.enemies[0]).toMatchObject({ creature: 'test-boss', boss: true, count: 1 })
    expect(options(s).some((o) => o.id === PARLEY_OPTION)).toBe(false)
    const won = endFight(choose(s, FIGHT_OPTION), 'win')
    expect(won.gold).toBe(s.gold + 50)
    expect(won.encounter!.stage).toBeNull()
  })

  test('Parley: the preview names the roll, and every tier does what it shows', () => {
    // Lyra's Persuasion (+5) beats Brom's Intimidation.
    const both = start(makeState(), 'cutthroat-road')
    const named = encounterOptions(both).find((o) => o.id === PARLEY_OPTION)!.check!
    expect([named.autoActorName, named.label]).toEqual(['Lyra', 'Persuasion'])
    // A poor talker alone, so every tier comes up.
    const mute = makeCharacter({
      id: 'mute',
      name: 'Mute',
      hp: 12,
      maxHp: 12,
      abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 6 },
    })
    const seen = new Set<string>()
    for (let seed = 1; seed <= 200 && seen.size < 5; seed++) {
      const s = start(
        makeState({ rng: createRng(seed), gold: 30, party: [mute] }),
        'cutthroat-road'
      )
      const preview = encounterOptions(s).find((o) => o.id === PARLEY_OPTION)!
      const check = preview.check!
      const after = choose(s, PARLEY_OPTION)
      const roll = after.lastRoll!
      expect([roll.actorId, roll.dc, roll.modifier]).toEqual([
        check.actorId,
        check.dc,
        check.modifier,
      ])
      seen.add(roll.tier)
      const row = preview.outcomes.find((o) => o.tier === roll.tier)
      if (roll.tier === 'partial' && row && !row.hidden) {
        const toll = Number(/−(\d+) gp/.exec(row.effects.join(' '))![1])
        expect(after.gold).toBe(s.gold - toll)
        expect(after.encounter!.stage).toBeNull()
      }
      if (roll.tier === 'success' || roll.tier === 'critSuccess') {
        expect(after.gold).toBe(s.gold)
        expect(after.encounter!.stage).toBeNull()
      }
      if (roll.tier === 'fail') {
        expect(after.combat).toBeNull()
        expect(options(after).map((o) => o.id)).toEqual(['fight', 'run', FIGHT_OPTION])
      }
      if (roll.tier === 'critFail') {
        expect(after.combat).not.toBeNull()
        expect(after.combat!.surprise).toBe('enemy')
        expect(options(after).some((o) => o.id === FIGHT_OPTION)).toBe(false)
      }
    }
    expect([...seen].sort()).toEqual(['critFail', 'critSuccess', 'fail', 'partial', 'success'])
  })

  test('a fight from an encounter is deterministic', () => {
    const run = () => {
      let s = choose(start(makeState({ rng: createRng(11) }), 'cutthroat-ambush'), FIGHT_OPTION)
      for (let i = 0; i < 3 && s.combat?.result === null; i++)
        s = step(s, { type: 'combatEndTurn' }, content)
      return s
    }
    expect(run()).toEqual(run())
  })

  test('content may not write Fight options, their ids or the fight effect', () => {
    const issues = validateSituation(
      {
        ...content.situations['cutthroat-road'],
        stages: {
          start: {
            text: 'x',
            options: [
              {
                id: PARLEY_OPTION,
                kind: 'fixed',
                label: 'Talk',
                requires: [],
                outcome: { text: 'x', effects: [{ effect: 'fight' }] },
              },
            ],
          },
        },
      },
      content
    )
    expect(issues.join('\n')).toMatch(/fight is added by the engine only/)
    expect(issues.join('\n')).toMatch(/kept for the engine/)
  })
})
