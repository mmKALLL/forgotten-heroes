import { useEffect, useRef, useState } from 'react'
import type { RollRecord } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { flickerDelay, settleTimes } from './schedule'

export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Presentation only: the engine decided the roll before this component mounted. */
const randomFace = () => 1 + Math.floor(Math.random() * 20)
const replaced = <T,>(list: T[], index: number, value: T) =>
  list.map((v, i) => (i === index ? value : v))

type Props = {
  /** Mount one DiceRoll per roll (give it a key), so each roll animates once. */
  roll: RollRecord
  highStakes?: boolean
  onDone?: () => void
}

/**
 * Flat d20 outlines whose faces flicker, then settle one after another (at most 1.5 s).
 * Every roll draws the DC line. High-stakes rolls hold back the last die and make it glow while
 * it rolls.
 * Once settled, only a critical keeps a glow: gold on a natural 20, red on a natural 1.
 * A click skips; reduced motion shows the result at once.
 * Layout: one row, the dice beside the DC track; the outcome text goes below it (the caller's).
 */
export function DiceRoll({ roll, highStakes = false, onDone }: Props) {
  const { t } = useI18n()
  const [reduced] = useState(prefersReducedMotion)
  const [settled, setSettled] = useState(() => roll.dice.map(() => reduced))
  const [faces, setFaces] = useState(() => (reduced ? roll.dice : roll.dice.map(randomFace)))
  const buttonRef = useRef<HTMLButtonElement>(null)
  const timers = useRef<number[]>([])
  const done = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const finish = () => {
    if (done.current) return
    done.current = true
    clearTimers()
    setSettled(roll.dice.map(() => true))
    setFaces(roll.dice)
    onDoneRef.current?.()
  }

  useEffect(() => {
    if (reduced) {
      finish()
      return
    }
    buttonRef.current?.focus() // Enter or Space skips
    const times = settleTimes(roll.dice.length, highStakes)
    const last = roll.dice.length - 1
    roll.dice.forEach((face, i) => {
      // Each die settles at its scheduled time from the start, however late the flickers run.
      let landed = false
      timers.current.push(
        window.setTimeout(() => {
          landed = true
          setSettled((s) => replaced(s, i, true))
          setFaces((f) => replaced(f, i, face))
          if (i === last) finish()
        }, times[i])
      )
      const slow = highStakes && i === last
      let elapsed = 0
      const flicker = () => {
        const delay = flickerDelay(times[i] - elapsed, slow)
        if (elapsed + delay >= times[i]) return
        timers.current.push(
          window.setTimeout(() => {
            if (landed) return
            elapsed += delay
            setFaces((f) => replaced(f, i, randomFace()))
            flicker()
          }, delay)
        )
      }
      flicker()
    })
    return clearTimers
    // The roll is fixed for this component's lifetime (callers key it per roll).
  }, [])

  const allSettled = settled.every(Boolean)
  const last = roll.dice.length - 1
  const natural = roll.dice[roll.keptIndex]
  const crit = !allSettled ? null : natural === 20 ? 'success' : natural === 1 ? 'fail' : null
  return (
    <button
      ref={buttonRef}
      type="button"
      className="dice-roll"
      // Once settled it is just the result: focus moves on to what comes next.
      tabIndex={allSettled ? -1 : 0}
      onClick={finish}
      aria-label={
        allSettled ? t('dice.rolled', { dice: roll.dice.join(t('dice.and')) }) : t('dice.skip')
      }
    >
      <span className="dice">
        {roll.dice.map((_, i) => (
          <D20
            key={i}
            face={faces[i]}
            settled={settled[i]}
            kept={allSettled && i === roll.keptIndex}
            glow={highStakes && i === last && !settled[i]}
            crit={crit !== null && i === roll.keptIndex ? crit : null}
          />
        ))}
      </span>
      <DcLine roll={roll} done={allSettled} />
    </button>
  )
}

function D20({
  face,
  settled,
  kept,
  glow,
  crit,
}: {
  face: number
  settled: boolean
  kept: boolean
  /** The held-back high-stakes die, while it rolls. */
  glow: boolean
  /** The settled kept die on a natural 20 or 1. */
  crit: 'success' | 'fail' | null
}) {
  const className = [
    'd20',
    settled && 'settled',
    kept && 'kept',
    glow && 'glow',
    crit && `crit-${crit}`,
  ]
    .filter(Boolean)
    .join(' ')
  // The front face spans the hexagon's top and lower corners, so its incircle (centre ≈ y 20,
  // r ≈ 9) has room for a two-digit face with clearance from the strokes.
  return (
    <svg className={className} viewBox="0 0 40 40" width="60" height="60" aria-hidden="true">
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" />
      <polygon points="20,2 36,29 4,29" />
      <text x="20" y="20.7" textAnchor="middle" dominantBaseline="central">
        {face}
      </text>
    </svg>
  )
}

/** The DC as a line on the range of possible totals; the total appears once the dice settle. */
function DcLine({ roll, done }: { roll: RollRecord; done: boolean }) {
  const { t } = useI18n()
  const min = 1 + roll.modifier
  const max = 20 + roll.modifier
  const at = (n: number) => `${(100 * (Math.min(max, Math.max(min, n)) - min)) / (max - min)}%`
  return (
    <span className="dc-track" aria-hidden="true">
      <span className="dc-line" style={{ left: at(roll.dc) }}>
        {t('dice.dc', { dc: roll.dc })}
      </span>
      {done && <span className="dc-total" style={{ left: at(roll.total) }} />}
    </span>
  )
}
