import { GameStateSchema, type GameState } from '../schema/state'

export const SAVE_KEY = 'forgotten-heroes/save/v1'

export const serialize = (state: GameState): string => JSON.stringify(state)

export function deserialize(text: string): GameState | null {
  try {
    const parsed = GameStateSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
