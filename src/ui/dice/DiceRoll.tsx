import { useEffect, useRef, useState } from 'react'
import type { RollRecord } from '../../schema/state'
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
 * High-stakes rolls hold back the last die, make it glow and draw the DC line.
 * A click skips; reduced motion shows the result at once.
 */
export function DiceRoll({ roll, highStakes = false, onDone }: Props) {
  const [reduced] = useState(prefersReducedMotion)
  const [settled, setSettled] = useState(() => roll.dice.map(() => reduced))
  const [faces, setFaces] = useState(() => (reduced ? roll.dice : roll.dice.map(randomFace)))
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
    const times = settleTimes(roll.dice.length, highStakes)
    const last = roll.dice.length - 1
    roll.dice.forEach((face, i) => {
      const slow = highStakes && i === last
      let elapsed = 0
      const tick = () => {
        const delay = flickerDelay(times[i] - elapsed, slow)
        if (elapsed + delay >= times[i]) {
          const settle = () => {
            setSettled((s) => replaced(s, i, true))
            setFaces((f) => replaced(f, i, face))
            if (i === last) finish()
          }
          timers.current.push(window.setTimeout(settle, times[i] - elapsed))
          return
        }
        timers.current.push(
          window.setTimeout(() => {
            elapsed += delay
            setFaces((f) => replaced(f, i, randomFace()))
            tick()
          }, delay)
        )
      }
      tick()
    })
    return clearTimers
    // The roll is fixed for this component's lifetime (callers key it per roll).
  }, [])

  const allSettled = settled.every(Boolean)
  return (
    <button
      type="button"
      className="dice-roll"
      onClick={finish}
      aria-label={allSettled ? `Rolled ${roll.dice.join(' and ')}` : 'Skip dice animation'}
    >
      <span className="dice">
        {roll.dice.map((_, i) => (
          <D20
            key={i}
            face={faces[i]}
            settled={settled[i]}
            kept={allSettled && i === roll.keptIndex}
            glow={highStakes && i === roll.dice.length - 1 && settled[i]}
          />
        ))}
      </span>
      {highStakes && <DcLine roll={roll} done={allSettled} />}
    </button>
  )
}

function D20({
  face,
  settled,
  kept,
  glow,
}: {
  face: number
  settled: boolean
  kept: boolean
  glow: boolean
}) {
  const className = ['d20', settled && 'settled', kept && 'kept', glow && 'glow']
    .filter(Boolean)
    .join(' ')
  return (
    <svg className={className} viewBox="0 0 40 40" width="44" height="44" aria-hidden="true">
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" />
      <polygon points="20,8 31,27 9,27" />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="middle">
        {face}
      </text>
    </svg>
  )
}

/** The DC as a line on the range of possible totals; the total appears once the dice settle. */
function DcLine({ roll, done }: { roll: RollRecord; done: boolean }) {
  const min = 1 + roll.modifier
  const max = 20 + roll.modifier
  const at = (n: number) => `${(100 * (Math.min(max, Math.max(min, n)) - min)) / (max - min)}%`
  return (
    <span className="dc-track" aria-hidden="true">
      <span className="dc-line" style={{ left: at(roll.dc) }}>
        DC {roll.dc}
      </span>
      {done && <span className="dc-total" style={{ left: at(roll.total) }} />}
    </span>
  )
}
