import type { EffectComponent, GameState } from '../types'

export function handleEffectComponents<T extends GameState>(gs: T, effects: EffectComponent[]): T {
  return gs // TODO
}
