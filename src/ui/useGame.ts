import { useEffect, useReducer } from 'react'
import type { Content } from '../content/build'
import { SAVE_KEY, UNREADABLE_SAVE_KEY, deserialize, serialize } from '../engine/save'
import { newGame, step, type Action } from '../engine/state'
import type { GameState } from '../schema/state'

type UiAction = Action | { type: 'replace'; state: GameState }

const reducer =
  (content: Content) =>
  (state: GameState, action: UiAction): GameState =>
    action.type === 'replace' ? action.state : step(state, action, content)

export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32)

function loadSaved(): GameState | null {
  let text: string | null
  try {
    text = localStorage.getItem(SAVE_KEY)
  } catch {
    return null // storage blocked or unavailable
  }
  if (!text) return null
  const state = deserialize(text)
  if (!state) {
    // The new game about to start would overwrite it: keep a copy for recovery or a future migration.
    try {
      localStorage.setItem(UNREADABLE_SAVE_KEY, text)
    } catch {
      // storage full or blocked: nothing more we can do
    }
  }
  return state
}

export function useGame(content: Content) {
  const [state, dispatch] = useReducer(reducer(content), null, () => loadSaved() ?? newGame(randomSeed(), content))
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
