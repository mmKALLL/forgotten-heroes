import { useEffect, useReducer } from 'react'
import type { Content } from '../content/build'
import { SAVE_KEY, deserialize, serialize } from '../engine/save'
import { newGame, step, type Action } from '../engine/state'
import type { GameState } from '../schema/state'

type UiAction = Action | { type: 'replace'; state: GameState }

const reducer = (state: GameState, action: UiAction): GameState =>
  action.type === 'replace' ? action.state : step(state, action)

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32)

function loadSaved(): GameState | null {
  try {
    const text = localStorage.getItem(SAVE_KEY)
    return text ? deserialize(text) : null
  } catch {
    return null // storage blocked or unavailable
  }
}

export function useGame(content: Content) {
  const [state, dispatch] = useReducer(reducer, null, () => loadSaved() ?? newGame(randomSeed(), content))
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, serialize(state))
    } catch {
      // storage blocked or unavailable: the game still works, it just won't persist
    }
  }, [state])
  const restart = () => dispatch({ type: 'replace', state: newGame(randomSeed(), content) })
  return { state, dispatch, restart }
}
