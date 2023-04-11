import type { Action, Event, EventHandler, GameState, Outcome, Participant } from '../types'

const listFormatter = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })
const joinLine = (arr: (string | number)[]) => arr.filter(Boolean).join(' ')
const joinList = (arr: string[]) => listFormatter.format(arr.filter(Boolean))

const participantLogEntry = (wis: number) => (participant: Participant) =>
  joinLine([
    participant.amount > 1 ? participant.amount : 'a',
    wis >= 18 && `level ${participant.level}`,
    participant.race,
    wis >= 13 && participant.class,
  ])

export const handleEvent = (gs: GameState, event: Event): GameState => {
  const wis = gs.player.leader.wis
  const participantLog =
    !event.participantsHidden &&
    event.participants.length > 1 &&
    wis >= 11 &&
    `(You see ${joinList(event.participants.map(participantLogEntry(wis)))}`

  // TODO: Lots of handling needed for handling actions and callbacks
  if (typeof event === 'string') {
    return { ...gs, currentEvent: { message: event, options: null } }
  }
  return {
    ...gs,
    currentEvent: {
      message: event.message,
      options: event.options.length > 0 ? event.options.map((op) => ({ ...(op as any) })) : null, // TODO: Fix the typing
    },
    gameLog: gs.gameLog.concat(event.message, participantLog),
  }
}

export const handleOutcome = (gs: GameState, outcome: Outcome) => {
  return gs // TODO
}

export const handlers: Record<string, <I>(data?: I) => EventHandler> = {
  triggerCombat: () => null,
}
