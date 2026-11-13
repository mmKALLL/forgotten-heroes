import type {
  Effect,
  Option,
  Outcome,
  OutcomeBranch,
  Situation,
  Stage,
} from '../../schema/encounter'
import { playsRound } from './challenge'

// A dungeon room's snapshot (Plan 6 D3; world/delve.ts). The room is played like any situation,
// with its rules written into the snapshot when it starts, so the previews show them as chips and
// what is shown is what happens:
// - wounds are `wound` times as deep;
// - a failed or critically failed outcome that ends the room drives the party out (driveOut);
// - in the last room, every other outcome that ends the room pays the hoard (`hoard`).
// In a skill challenge (challenge.ts) the rounds never end the room: its `lose` branch drives the
// party out and its `win` branch pays the hoard (when they end it).

/** How a room is played: the wound factor, and the hoard when it is the last room. */
export type RoomRules = { wound: number; hoard: Extract<Effect, { effect: 'hoard' }> | null }

/** A branch ends the room when it goes nowhere and doesn't stay. */
const ends = (b: OutcomeBranch): boolean => b.goto === undefined && !b.stay

const DRIVE_OUT: Effect = { effect: 'driveOut' }

/** The room's snapshot: deeper wounds, driven out on a failure that ends it, the hoard at the end. */
export function asRoom(situation: Situation, { wound, hoard }: RoomRules): Situation {
  const effect = (e: Effect): Effect =>
    e.effect === 'hp' && e.amount < 0 ? { ...e, amount: e.amount * wound } : e
  const branch = <B extends OutcomeBranch>(b: B, failed: boolean): B => {
    const effects = b.effects.map(effect)
    if (!ends(b)) return { ...b, effects }
    if (failed) return { ...b, effects: [...effects, DRIVE_OUT] }
    return { ...b, effects: hoard ? [...effects, hoard] : effects }
  }
  const outcome = (o: Outcome, failed: boolean): Outcome => ({
    ...branch(o, failed),
    ...(o.twist && { twist: branch(o.twist, failed) }),
  })
  // A challenge round only deepens its wounds: it stays on the stage until the tally decides.
  const round = (o: Outcome): Outcome => ({ ...o, effects: o.effects.map(effect) })
  const roundOption = (o: Option): Option => {
    if (o.kind === 'fixed') return { ...o, outcome: round(o.outcome) }
    const { critFail, fail, partial, success, critSuccess } = o.outcomes
    return {
      ...o,
      outcomes: {
        ...(critFail && { critFail: round(critFail) }),
        fail: round(fail),
        partial: round(partial),
        success: round(success),
        ...(critSuccess && { critSuccess: round(critSuccess) }),
      },
    }
  }
  const option = (o: Option): Option => {
    if (o.kind === 'fixed') return { ...o, outcome: outcome(o.outcome, false) }
    const { critFail, fail, partial, success, critSuccess } = o.outcomes
    return {
      ...o,
      outcomes: {
        ...(critFail && { critFail: outcome(critFail, true) }),
        fail: outcome(fail, true),
        partial: outcome(partial, false),
        success: outcome(success, false),
        ...(critSuccess && { critSuccess: outcome(critSuccess, false) }),
      },
    }
  }
  const stageOf = (stage: Stage): Stage => {
    const challenge = stage.challenge
    if (!challenge) return { ...stage, options: stage.options.map(option) }
    return {
      ...stage,
      options: stage.options.map((o) => (playsRound(o) ? roundOption(o) : option(o))),
      challenge: {
        ...challenge,
        win: branch(challenge.win, false),
        lose: branch(challenge.lose, true),
      },
    }
  }
  const stages = Object.fromEntries(
    Object.entries(situation.stages).map(([id, stage]) => [id, stageOf(stage)])
  )
  return {
    ...situation,
    stages,
    ...(situation.twist && {
      twist: { ...situation.twist, opening: situation.twist.opening.map(effect) },
    }),
  }
}
