import { useId, useRef, useState, type ReactNode } from 'react'

/** The popover's width in px; it stays this far inside the viewport's edges. */
const WIDTH = 260
const MARGIN = 8

type Place = { left: number; top?: number; bottom?: number }

/**
 * A short explanation shown on hover or focus (a tap focuses on touch screens), unlike a native
 * title, which shows on neither focus nor touch. The popover is fixed to the viewport, so a
 * scrolling table doesn't clip it, and it is always in the DOM for screen readers
 * (aria-describedby).
 */
export function Tip({
  tip,
  children,
  className,
  label,
}: {
  tip: string
  children: ReactNode
  className?: string
  /** An accessible name for the trigger, when its content is only symbols (pips). */
  label?: string
}) {
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const show = () => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - WIDTH / 2, vw - WIDTH - MARGIN))
    // Above the trigger when there is room, else below it.
    setPlace(
      r.top > 160 ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 }
    )
  }
  const hide = () => setPlace(null)
  return (
    <span
      ref={ref}
      className={`tip${className ? ` ${className}` : ''}`}
      tabIndex={0}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-describedby={id}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => e.key === 'Escape' && hide()}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className="tip-pop"
        hidden={place === null}
        style={place ? { ...place, width: WIDTH } : undefined}
      >
        {tip}
      </span>
    </span>
  )
}
