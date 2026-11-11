import type { Effect } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { formatModifier } from '../format'
import { appendLog } from '../log'
import { withRng, type Rng } from '../rng'

export const MAX_EXHAUSTION = 6

/** Who "actor" means for this batch of effects: the member who rolled. Fixed options have none. */
export type EffectContext = { actorId?: string }

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function targetIds(state: GameState, target: 'actor' | 'all' | 'random', ctx: EffectContext): [string[], Rng] {
  if (target === 'all') return [state.party.map((c) => c.id), state.rng]
  if (target === 'actor' && state.party.some((c) => c.id === ctx.actorId)) return [[ctx.actorId!], state.rng]
  // "random", or "actor" with no actor (the content validator forbids that in fixed options).
  const conscious = state.party.filter((c) => c.hp > 0)
  if (conscious.length === 0) return [[], state.rng]
  const [id, rng] = withRng(state.rng, (d) => d.pick(conscious).id)
  return [[id], rng]
}

function applyEffect(state: GameState, effect: Effect, ctx: EffectContext): GameState {
  switch (effect.effect) {
    case 'gold':
      return { ...state, gold: Math.max(0, state.gold + effect.amount) }
    case 'hp': {
      const [ids, rng] = targetIds(state, effect.target, ctx)
      const party = state.party.map((c) =>
        ids.includes(c.id) ? { ...c, hp: clamp(c.hp + effect.amount, 0, c.maxHp) } : c
      )
      return { ...state, rng, party }
    }
    case 'exhaustion': {
      const [ids, rng] = targetIds(state, effect.target, ctx)
      const party = state.party.map((c) =>
        ids.includes(c.id) ? { ...c, exhaustion: clamp(c.exhaustion + effect.amount, 0, MAX_EXHAUSTION) } : c
      )
      return { ...state, rng, party }
    }
    case 'inspiration':
      return { ...state, inspiration: state.inspiration + effect.amount }
    case 'days':
      return { ...state, day: state.day + effect.amount }
    case 'position':
      return state.encounter ? { ...state, encounter: { ...state.encounter, position: effect.position } } : state
    case 'followUp':
      return { ...state, followUps: [...state.followUps, { situationId: effect.situation, wait: effect.after }] }
    case 'nextCheckModifier':
      if (!state.encounter) return state
      return {
        ...state,
        encounter: { ...state.encounter, nextCheckModifier: state.encounter.nextCheckModifier + effect.amount },
      }
    case 'revealTwist':
      return state.encounter ? { ...state, encounter: { ...state.encounter, twistRevealed: true } } : state
    case 'log': {
      const next = appendLog(state, effect.text, effect.tone)
      if (!next.encounter) return next
      const log = [...next.encounter.log, { text: effect.text, tone: effect.tone }]
      return { ...next, encounter: { ...next.encounter, log } }
    }
  }
}

/** Pure: applies effects in order. Random targets draw from the state's RNG. */
export function applyEffects(state: GameState, effects: readonly Effect[], ctx: EffectContext = {}): GameState {
  return effects.reduce((current, effect) => applyEffect(current, effect, ctx), state)
}

const WHO = { all: 'everyone', random: 'someone' } as const

/** A short chip for previews and the journal, e.g. "Lyra −3 HP". Log effects return null. */
export function describeEffect(effect: Effect, actorName: string): string | null {
  switch (effect.effect) {
    case 'gold':
      return `${formatModifier(effect.amount)} gp`
    case 'hp':
      return `${effect.target === 'actor' ? actorName : WHO[effect.target]} ${formatModifier(effect.amount)} HP`
    case 'exhaustion':
      return `${effect.target === 'actor' ? actorName : WHO.all} ${formatModifier(effect.amount)} exhaustion`
    case 'inspiration':
      return `+${effect.amount} inspiration`
    case 'days':
      return effect.amount === 1 ? '1 day passes' : `${effect.amount} days pass`
    case 'position':
      return { edge: 'Edge', exposed: 'Exposed', normal: 'normal position' }[effect.position]
    case 'followUp':
      return 'consequences later'
    case 'nextCheckModifier':
      return `${formatModifier(effect.amount)} to the next check`
    case 'revealTwist':
      return 'reveals how likely the twist is'
    case 'log':
      return null
  }
}
