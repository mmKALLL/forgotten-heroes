import { describe, expect, test } from 'vitest'
import type { Content } from '../../content/build'
import { FightSchema } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { encounterOptions } from '../encounters/preview'
import { createRng } from '../rng'
import { step, type Action } from '../state'
import {
  brom,
  combatFixtureContent,
  lyra,
  makeCharacter,
  makeState,
  testFight,
} from '../test-fixtures'
import { FUEL_PER_DARK_ROOM, REINHABIT_DAYS } from '../constants'
import { darkFooting, darkMode, seesInDark } from './dark'
import { delvePreview } from './delve'

/** The fixture content with the Test Vault's first two rooms dark, and elves that see in the dark. */
function darkContent(): Content {
  const base = combatFixtureContent()
  const vault = base.dungeons['test-vault']
  return {
    ...base,
    ancestries: {
      ...base.ancestries,
      elf: { ...base.ancestries.dwarf, id: 'elf', name: 'Elf', darkvision: true },
    },
    dungeons: {
      ...base.dungeons,
      'test-vault': {
        ...vault,
        rooms: vault.rooms.map((r, i) => (i < 2 ? { ...r, dark: true } : r)),
      },
    },
  }
}

const content = darkContent()
const act = (s: GameState, a: Action) => step(s, a, content)
const creep = (s: GameState) => act(s, { type: 'chooseOption', optionId: 'sneak' })

/** The party at the Test Vault (three rooms, the first two dark) with this much fuel. */
function atVault(fuel: number, overrides: Partial<GameState> = {}) {
  const base = makeState({ goods: { fuel }, ...overrides })
  const id = Object.keys(base.world.pois).find((p) => base.world.pois[p].dungeon === 'test-vault')!
  const poi = {
    ...base.world.pois[id],
    discovered: true,
    clearedDay: base.day - REINHABIT_DAYS - 1,
  }
  const world = { ...base.world, pois: { ...base.world.pois, [id]: poi } }
  return { state: { ...base, world, location: id }, id }
}

const human = (id: string) => makeCharacter({ id, name: id, ancestry: 'human' })
const dwarf = (id: string) => makeCharacter({ id, name: id, ancestry: 'dwarf' })

describe('dark rooms and fuel (combat design §7b)', () => {
  test('entering a dark room burns fuel and plays it lit; the preview said so beforehand', () => {
    const { state, id } = atVault(1)
    const before = delvePreview(state, content, id)!
    expect(before.light).toEqual(['lit', 'unlit', null])
    expect(before.fuel).toMatchObject({ darkAhead: 2, needed: 2, have: 1, unlitAhead: 1 })
    const entered = act(state, { type: 'visitPoi' })
    expect(entered.goods.fuel).toBe(1 - FUEL_PER_DARK_ROOM)
    expect(entered.delve!.unlit).toBe(false)
    expect(encounterOptions(entered).find((o) => o.id === 'fight')!.check!.mode).toBe('normal')
    // Out of fuel, the next dark room is played unlit, as the preview said.
    const between = creep(entered)
    expect(between.delve!.unlit).toBe(false)
    expect(delvePreview(between, content, id)!.light[1]).toBe('unlit')
    const on = act(between, { type: 'pressOn' })
    expect(on.goods.fuel).toBe(0)
    expect(on.delve!.unlit).toBe(true)
    expect(on.encounter!.log.some((l) => /no fuel/.test(l.text))).toBe(true)
  })

  test('without fuel every check in the room is Exposed, the preview and the roll alike', () => {
    const { state } = atVault(0)
    const entered = act(state, { type: 'visitPoi' })
    expect(entered.delve!.unlit).toBe(true)
    const shown = encounterOptions(entered).find((o) => o.id === 'fight')!.check!
    expect(shown.mode).toBe('disadvantage')
    const rolled = act(
      { ...entered, rng: createRng(7) },
      { type: 'chooseOption', optionId: 'fight' }
    )
    expect(rolled.lastRoll!.mode).toBe('disadvantage')
    expect(rolled.lastRoll!.dice).toHaveLength(2)
    // A room that isn't dark is never Exposed for it.
    const lit = atVault(0).state
    const plain = { ...content, dungeons: combatFixtureContent().dungeons }
    const normal = step(lit, { type: 'visitPoi' }, plain)
    expect(normal.delve!.unlit).toBe(false)
  })

  test('a fight in an unlit room starts Exposed; in a lit one on its footing', () => {
    const fight = FightSchema.parse(testFight)
    const unlit = act(atVault(0).state, { type: 'visitPoi' })
    expect(act(unlit, { type: 'startCombat', fight }).combat!.footing).toBe('exposed')
    const lit = act(atVault(1).state, { type: 'visitPoi' })
    expect(act(lit, { type: 'startCombat', fight }).combat!.footing).toBe('normal')
    // An Edge cancels the dark, as with checks.
    expect(darkFooting('edge', true)).toBe('normal')
    expect(darkMode('advantage', true)).toBe('normal')
    expect(darkMode('normal', false)).toBe('normal')
  })

  test('darkvision: every member but one, or a lone member, sees in the dark; no fuel burns', () => {
    const elf = makeCharacter({ id: 'elf', name: 'Elf', ancestry: 'elf' })
    const sees = (party: GameState['party']) => seesInDark({ party }, content)
    expect(sees([dwarf('a'), dwarf('b'), human('c')])).toBe(true)
    expect(sees([dwarf('a'), human('b'), human('c')])).toBe(false)
    expect(sees([elf])).toBe(true)
    expect(sees([human('a')])).toBe(false)
    expect(sees([brom, lyra])).toBe(false)

    const { state, id } = atVault(3, { party: [dwarf('a'), dwarf('b'), human('c')] })
    const preview = delvePreview(state, content, id)!
    expect(preview.light).toEqual(['darkvision', 'darkvision', null])
    expect(preview.fuel).toMatchObject({ darkAhead: 2, needed: 0, darkvision: true })
    const entered = act(state, { type: 'visitPoi' })
    expect(entered.goods.fuel).toBe(3)
    expect(entered.delve!.unlit).toBe(false)
    const alone = act(atVault(0, { party: [elf] }).state, { type: 'visitPoi' })
    expect(alone.delve!.unlit).toBe(false)
  })

  test('the preview of the rooms ahead is what entering them does, room by room', () => {
    for (const fuel of [0, 1, 2]) {
      const at = atVault(fuel)
      const id = at.id
      let s: GameState = at.state
      const planned = delvePreview(s, content, id)!.light
      const played: (string | null)[] = []
      s = act(s, { type: 'visitPoi' })
      for (let room = 0; room < 3 && s.delve; room++) {
        const dark = content.dungeons['test-vault'].rooms[room].dark
        played.push(dark ? (s.delve.unlit ? 'unlit' : 'lit') : null)
        s = creep(s)
        if (s.delve && !s.delve.inRoom) s = act(s, { type: 'pressOn' })
      }
      expect(played).toEqual(planned)
    }
  })
})
