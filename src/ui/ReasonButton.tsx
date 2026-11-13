import { useId, type ReactNode } from 'react'
import { NOT_ENOUGH_GOLD } from '../engine/town/services'

/**
 * A button that stays focusable when it can't be used: `aria-disabled` instead of `disabled`, so
 * a keyboard or screen-reader user reaches it and hears why (`aria-describedby` points at the
 * reason shown inline after it). Clicks do nothing while unavailable. "Not enough gold" is not
 * shown inline (designer call: the disabled style says it); it stays in the tooltip and is still
 * announced.
 */
export function ReasonButton({
  available,
  reason,
  onClick,
  children,
}: {
  available: boolean
  /** Why not (shown inline after the button), or null. */
  reason: string | null
  onClick: () => void
  children: ReactNode
}) {
  const id = useId()
  const quiet = reason === NOT_ENOUGH_GOLD
  return (
    <>
      <button
        aria-disabled={!available || undefined}
        aria-describedby={reason ? id : undefined}
        title={quiet ? reason : undefined}
        onClick={() => {
          if (available) onClick()
        }}
      >
        {children}
      </button>
      {reason && (
        <span id={id} className={quiet ? 'sr-only' : 'service-why muted small'}>
          {reason}
        </span>
      )}
    </>
  )
}
