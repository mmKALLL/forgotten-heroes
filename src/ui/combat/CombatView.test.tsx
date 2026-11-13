// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { combatPreview } from '../../engine/combat/preview'
import { unitOf, withFight } from '../../engine/combat/test-fixtures'
import { formatPercent } from '../../engine/format'
import { step, type Action } from '../../engine/state'
import { brom, classFixtureContent, combatFixtureContent } from '../../engine/test-fixtures'
import type { GameState } from '../../schema/state'
import { CombatView } from './CombatView'

const content = combatFixtureContent()

afterEach(cleanup)

/** Brom up front with a blade, Lyra behind; two cutthroats, one next to Brom, one far off. */
const fight = () =>
  withFight([
    unitOf({ id: 'lyra', side: 'party', tile: 0, name: 'Lyra' }),
    unitOf({ id: 'brom', side: 'party', tile: 1, name: 'Brom' }),
    unitOf({
      id: 'e1',
      side: 'enemy',
      tile: 2,
      name: 'Cutthroat',
      intent: { kind: 'attack', from: 2, tile: 1, twice: false },
    }),
    unitOf({
      id: 'e2',
      side: 'enemy',
      tile: 5,
      name: 'Bowman',
      role: 'archer',
      intent: { kind: 'move', from: 5, tile: 4, twice: false },
    }),
  ])

/** Runs the real engine behind the view, like useGame does. */
function Harness({ initial, spy }: { initial: GameState; spy?: (a: Action) => void }) {
  const [state, setState] = useState(initial)
  const onAction = (a: Action) => {
    spy?.(a)
    setState((s) => step(s, a, content))
  }
  return state.combat ? <CombatView state={state} onAction={onAction} /> : <p>closed</p>
}

const preview = () => within(screen.getByRole('region', { name: 'Action' }))

test('draws the line, previews an attack from combatPreview, attacks it, and ends the turn', async () => {
  const state = fight()
  const spy = vi.fn()
  render(<Harness initial={state} spy={spy} />)
  // The line: units, the intents in action order, and the members to pick.
  expect(screen.getByRole('button', { name: 'Select Lyra' })).toBeTruthy()
  const intents = within(screen.getByRole('region', { name: 'Enemy intents' }))
  expect(intents.getByText(/strikes tile 2/)).toBeTruthy()
  expect(intents.getByText(/moves to tile 5/)).toBeTruthy()
  // Lyra is first in order and can't reach; Brom is picked by his card.
  await userEvent.click(screen.getByRole('button', { name: 'Select Brom' }))
  expect(screen.getByText('Brom acts')).toBeTruthy()
  // Hovering the cutthroat previews the engine's own spec.
  const target = screen.getByRole('button', { name: 'Attack Cutthroat' })
  await userEvent.hover(target)
  const spec = combatPreview(state)!.members.find((m) => m.unit === 'brom')!.attacks[0].attack[0]
  expect(preview().getByText('Brom attacks Cutthroat')).toBeTruthy()
  expect(preview().getByText(`${formatPercent(spec.hit)} to hit`)).toBeTruthy()
  expect(preview().getByText(new RegExp(`${spec.damage[0]}–${spec.damage[1]} damage`))).toBeTruthy()
  await userEvent.click(target)
  expect(spy).toHaveBeenLastCalledWith({
    type: 'combatAct',
    unit: 'brom',
    tile: 2,
    target: 'e1',
    full: false,
  })
  await userEvent.click(screen.getByRole('button', { name: 'End turn' }))
  expect(spy).toHaveBeenLastCalledWith({ type: 'combatEndTurn' })
  expect(screen.getByText('Round 2')).toBeTruthy()
})

test('keys 1–9 select an ability slot, and the same key deselects it', async () => {
  render(<Harness initial={fight()} />)
  const slot = (n: number) => screen.getByRole('button', { name: `Slot ${n}: empty` })
  await userEvent.keyboard('3')
  expect(slot(3).getAttribute('aria-pressed')).toBe('true')
  await userEvent.keyboard('5')
  expect(slot(3).getAttribute('aria-pressed')).toBe('false')
  expect(slot(5).getAttribute('aria-pressed')).toBe('true')
  await userEvent.keyboard('5')
  expect(slot(5).getAttribute('aria-pressed')).toBe('false')
})

test('Space acts on the aimed target; ←/→ aim from the keyboard', async () => {
  const spy = vi.fn()
  render(<Harness initial={fight()} spy={spy} />)
  await userEvent.click(screen.getByRole('button', { name: 'Select Brom' }))
  // Focus off the buttons: the fight's heading.
  screen.getByRole('heading', { name: 'Fight' }).focus()
  await userEvent.hover(screen.getByRole('button', { name: 'Attack Cutthroat' }))
  await userEvent.keyboard(' ')
  expect(spy).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'combatAct', unit: 'brom', target: 'e1' })
  )
  // Lyra next (Brom has acted but may still move): the arrows aim at her targets.
  await userEvent.click(screen.getByRole('button', { name: 'Select Lyra' }))
  await userEvent.keyboard('{ArrowRight}')
  expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Move Lyra to tile/)
  await userEvent.keyboard(' ')
  expect(spy).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'combatMove', unit: 'lyra' })
  )
})

test('a decided fight shows its ending, and Close clears it', async () => {
  const won = fight()
  const units = won.combat!.units.map((u) =>
    u.side === 'enemy' ? { ...u, status: 'dead' as const } : u
  )
  render(<Harness initial={{ ...won, combat: { ...won.combat!, result: 'victory', units } }} />)
  expect(screen.getByRole('heading', { name: 'Victory' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByText('closed')).toBeTruthy()
})

test('a wipe offers surrender, struggle and sacrifice with their costs; a choice closes the fight', async () => {
  const doomed = (id: string, name: string) =>
    unitOf({ id, side: 'party', tile: 1, hp: 1, ac: 1, name })
  const killer = (id: string) =>
    unitOf({
      id,
      side: 'enemy',
      tile: 2,
      toHit: 30,
      intent: { kind: 'attack', from: 2, tile: 1, twice: false },
    })
  const start = withFight([
    doomed('brom', 'Brom'),
    doomed('lyra', 'Lyra'),
    killer('e1'),
    killer('e2'),
  ])
  const lost = step({ ...start, gold: 30 }, { type: 'combatEndTurn' }, content)
  render(<Harness initial={lost} />)
  expect(screen.getByRole('heading', { name: 'The party falls' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  expect(screen.getByText(/give up 30 gp/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Struggle' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Leave Brom behind' })).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Surrender' }))
  expect(screen.getByText('closed')).toBeTruthy()
})

test('an ability slot (Track C): its uses in the Action panel, and using one spends it', async () => {
  const classes = classFixtureContent()
  const state = withFight(
    [
      unitOf({ id: 'brom', side: 'party', tile: 1, name: 'Brom', hp: 5, maxHp: 20 }),
      unitOf({ id: 'e1', side: 'enemy', tile: 4, name: 'Cutthroat' }),
    ],
    {},
    1,
    { party: [{ ...brom, hp: 5 }] }
  )
  const spy = vi.fn()
  function WithContent() {
    const [s, setS] = useState(state)
    return (
      <CombatView
        state={s}
        content={classes}
        onAction={(a) => {
          spy(a)
          setS((x) => step(x, a, classes))
        }}
      />
    )
  }
  render(<WithContent />)
  await userEvent.keyboard('1')
  expect(screen.getByRole('button', { name: 'Slot 1: Second Wind (1/1)' })).toBeTruthy()
  expect(preview().getByText('Second Wind · 1/1 until a long rest')).toBeTruthy()
  await userEvent.click(preview().getByRole('button', { name: 'Use: heals 2–11' }))
  expect(spy).toHaveBeenLastCalledWith({
    type: 'combatAbility',
    unit: 'brom',
    ability: 'second-wind',
    tile: 1,
    target: 'brom',
  })
  expect(screen.getByRole('button', { name: 'Slot 1: Second Wind (0/1)' })).toBeTruthy()
})
