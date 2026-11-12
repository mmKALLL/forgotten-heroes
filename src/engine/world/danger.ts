import type { Effect, Option, Outcome, OutcomeBranch, Situation } from '../../schema/encounter'
import { normalizeDc } from '../rules/checks'
import { DANGER_RAMP_DAYS, DANGER_RAMP_MAX, DANGER_RAMP_STEP } from '../constants'

// The world's rising danger (design §10b; Plan 5a A3). Nothing ticks: the danger level follows from
// the day. It hardens each encounter's snapshot once, when it starts: harder checks, worse wounds.
// It is independent of the party's level and wealth, and touches only encounters.

/** Shares are kept to whole percent, so 3 × 0.1 is 0.3 and DCs round as written. */
const toPercent = (share: number): number => Math.round(share * 100)

/** Guards rounding against float error (e.g. 4 × 1.1 = 4.4000000000000004). */
const EPSILON = 1e-9

/** The danger share on a day: +DANGER_RAMP_STEP every DANGER_RAMP_DAYS days, up to the cap. */
export function dangerLevel(day: number): number {
  const steps = Math.floor(Math.max(0, day - 1) / DANGER_RAMP_DAYS)
  return Math.min(DANGER_RAMP_MAX, toPercent(steps * DANGER_RAMP_STEP) / 100)
}

/** What the top bar says about the danger: the share, as a percent, and the day it next rises. */
export type DangerInfo = {
  share: number
  percent: number
  /** The first day of the next step, or null at the cap. */
  nextDay: number | null
  /** English, e.g. "The roads grow more dangerous: +20%". */
  text: string
}

export function dangerInfo(day: number): DangerInfo {
  const share = dangerLevel(day)
  const percent = toPercent(share)
  const step = Math.floor(Math.max(0, day - 1) / DANGER_RAMP_DAYS)
  return {
    share,
    percent,
    nextDay: share >= DANGER_RAMP_MAX ? null : (step + 1) * DANGER_RAMP_DAYS + 1,
    text:
      percent === 0
        ? 'The roads are as they have always been'
        : `The roads grow more dangerous: +${percent}%`,
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
  const dc = (value: number | string) => {
    const base = Number(value)
    return normalizeDc(base + dcBonus + Math.round(base * danger + EPSILON))
  }
  const effect = (e: Effect): Effect =>
    e.effect === 'hp' && e.amount < 0
      ? { ...e, amount: -Math.ceil(-e.amount * (1 + danger) - EPSILON) }
      : e
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
      { ...stage, options: stage.options.map(option) },
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
