import type { Content } from '../../content/build'
import type { Effect, Option, Outcome, OutcomeBranch, Situation } from '../../schema/encounter'
import type { GameState } from '../../schema/state'
import { crisisSurge, crisisWait } from '../crisis/surge'
import { crDc } from '../rules/challenge'
import { normalizeDc } from '../rules/checks'
import { CRISIS_DC_BASE, DANGER_RAMP_DAYS, DANGER_RAMP_MAX, DANGER_RAMP_STEP } from '../constants'

// The world's rising danger (design §10b; Plan 5a A3, Plan 6 C4 and wave 2b). Nothing ticks: the
// danger level follows from the day, plus the Crisis's surge near a due day and its waiting penalty
// while an act's lead goes unfollowed (crisis/surge.ts). It hardens each encounter's
// snapshot once, when it starts: harder checks, worse wounds. It is independent of the party's
// level and wealth, and touches only encounters. Crisis encounters are played at their challenge
// rating instead (atChallenge).

/** Shares are kept to whole percent, so 3 × 0.1 is 0.3 and DCs round as written. */
const toPercent = (share: number): number => Math.round(share * 100)

/** Guards rounding against float error (e.g. 4 × 1.1 = 4.4000000000000004). */
const EPSILON = 1e-9

/** The ramp's share on a day: +DANGER_RAMP_STEP every DANGER_RAMP_DAYS days, up to the cap. */
export function rampLevel(day: number): number {
  const steps = Math.floor(Math.max(0, day - 1) / DANGER_RAMP_DAYS)
  return Math.min(DANGER_RAMP_MAX, toPercent(steps * DANGER_RAMP_STEP) / 100)
}

/** What the danger depends on: the day, and the Crisis (its surge). */
export type DangerAt = Pick<GameState, 'day' | 'crisis'>

/**
 * The danger share: the ramp, plus the Crisis's waiting penalty and, when content is given, its
 * surge (crisis/surge.ts). They stack.
 */
export function dangerLevel(state: DangerAt, content?: Content): number {
  const surge = crisisSurge(state, content)?.share ?? 0
  const wait = crisisWait(state)?.share ?? 0
  return toPercent(rampLevel(state.day) + surge + wait) / 100
}

/** What the top bar says about the danger: the share, as a percent, and the day it next rises. */
export type DangerInfo = {
  share: number
  percent: number
  /** The first day of the ramp's next step, or null at the cap. */
  nextDay: number | null
  /** English, e.g. "The roads grow more dangerous: +20%". */
  text: string
  /** The surge's part, and why (e.g. "Act II, The Bone Choir, is near its day: +10%"); null without one. */
  surge: { percent: number; text: string } | null
  /** The waiting penalty's part, and why ("…its lead goes unfollowed: +4%, …"); null without one. */
  wait: { percent: number; text: string } | null
}

export function dangerInfo(state: DangerAt, content?: Content): DangerInfo {
  const share = dangerLevel(state, content)
  const percent = toPercent(share)
  const ramp = rampLevel(state.day)
  const step = Math.floor(Math.max(0, state.day - 1) / DANGER_RAMP_DAYS)
  const surge = crisisSurge(state, content)
  const wait = crisisWait(state, content)
  return {
    share,
    percent,
    nextDay: ramp >= DANGER_RAMP_MAX ? null : (step + 1) * DANGER_RAMP_DAYS + 1,
    text:
      percent === 0
        ? 'The roads are as they have always been'
        : `The roads grow more dangerous: +${percent}%`,
    surge: surge && { percent: toPercent(surge.share), text: surge.text },
    wait: wait && { percent: toPercent(wait.share), text: wait.text },
  }
}

/** How much harder an encounter is: a flat DC bonus (a site's power) and the danger share. */
export type Hardening = { dcBonus: number; danger: number }

/**
 * The encounter snapshot made harder, every stage included (the twist table's joined stages too):
 * each check's DC becomes `dc + dcBonus + round(dc × danger)` (normalised), and each wound (a
 * negative `hp` effect, the twist's opening hit included) `−ceil(|amount| × (1 + danger))`.
 * Healing, gold and goods are unchanged. With nothing to add, the situation itself is returned.
 */
export function harden(situation: Situation, { dcBonus, danger }: Hardening): Situation {
  if (dcBonus === 0 && danger === 0) return situation
  return mapChecks(
    situation,
    (base) => base + dcBonus + Math.round(base * danger + EPSILON),
    (amount) => -Math.ceil(-amount * (1 + danger) - EPSILON)
  )
}

/**
 * The encounter snapshot at a challenge rating (a Crisis site; Plan 6 C4), in place of harden:
 * each check's written DC w becomes crDc(cr) + (w − CRISIS_DC_BASE) (normalised). The danger ramp
 * and site power don't apply, so the CR is the difficulty; wounds are as written.
 */
export const atChallenge = (situation: Situation, cr: number): Situation =>
  mapChecks(
    situation,
    (base) => crDc(cr) + base - CRISIS_DC_BASE,
    (amount) => amount
  )

/** Every check's DC and every wound (a negative `hp` effect) of a snapshot, mapped. */
function mapChecks(
  situation: Situation,
  toDc: (base: number) => number,
  toWound: (amount: number) => number
): Situation {
  const dc = (value: number | string) => normalizeDc(toDc(Number(value)))
  const effect = (e: Effect): Effect =>
    e.effect === 'hp' && e.amount < 0 ? { ...e, amount: toWound(e.amount) } : e
  const branch = <B extends OutcomeBranch>(b: B): B => ({ ...b, effects: b.effects.map(effect) })
  const outcome = (o: Outcome): Outcome => ({
    ...branch(o),
    ...(o.twist && { twist: branch(o.twist) }),
  })
  const option = (o: Option): Option => {
    if (o.kind === 'fixed') return { ...o, outcome: outcome(o.outcome) }
    const { critFail, fail, partial, success, critSuccess } = o.outcomes
    return {
      ...o,
      check: { ...o.check, dc: dc(o.check.dc) },
      outcomes: {
        ...(critFail && { critFail: outcome(critFail) }),
        fail: outcome(fail),
        partial: outcome(partial),
        success: outcome(success),
        ...(critSuccess && { critSuccess: outcome(critSuccess) }),
      },
    }
  }
  const stages = Object.fromEntries(
    Object.entries(situation.stages).map(([id, stage]) => [
      id,
      {
        ...stage,
        options: stage.options.map(option),
        ...(stage.challenge && {
          challenge: {
            ...stage.challenge,
            win: branch(stage.challenge.win),
            lose: branch(stage.challenge.lose),
          },
        }),
      },
    ])
  )
  return {
    ...situation,
    stages,
    ...(situation.twist && {
      twist: { ...situation.twist, opening: situation.twist.opening.map(effect) },
    }),
  }
}
