import { useEffect, useReducer } from 'react'
import type { Content } from '../content/build'
import { newGame, step, type Action } from '../engine/state'
import type { GameState } from '../schema/state'
import { STARTING_PARTY_SIZE } from '../engine/constants'
import { activeSlot, backUpIfUnreadable, loadSlot, setActiveSlot, writeSlot } from './saves'

/** The game being played and the save slot it auto-saves to, changed together. */
type Session = { slot: number; state: GameState }

type UiAction = Action | { type: 'replace'; slot: number; state: GameState }

const reducer =
  (content: Content) =>
  (session: Session, action: UiAction): Session =>
    action.type === 'replace'
      ? { slot: action.slot, state: action.state }
      : { ...session, state: step(session.state, action, content) }

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32)

/** A new party in a new world, in a random mainland settlement (design §6). */
const freshGame = (content: Content): GameState =>
  newGame(randomSeed(), content, STARTING_PARTY_SIZE, 'random')

function initial(content: Content): Session {
  const slot = activeSlot()
  return { slot, state: loadSlot(slot, content) ?? newGame(randomSeed(), content) }
}

export function useGame(content: Content) {
  const [session, send] = useReducer(reducer(content), content, initial)
  const { slot, state } = session
  // Auto-save after every change (ironman: no manual save, design §6).
  useEffect(() => {
    writeSlot(slot, state)
    setActiveSlot(slot)
  }, [slot, state])
  const dispatch: (action: Action) => void = send
  /** Plays the game saved in `slot` (a new party there if it is empty or unreadable). */
  const continueIn = (to: number) =>
    send({ type: 'replace', slot: to, state: loadSlot(to, content) ?? freshGame(content) })
  /** A new party in a new world in `slot`, replacing what it held. */
  const restart = (to: number = slot) => {
    backUpIfUnreadable(to, content)
    send({ type: 'replace', slot: to, state: freshGame(content) })
  }
  return { state, slot, dispatch, restart, continueIn }
}
