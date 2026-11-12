import { useId, type ReactNode } from 'react'

/**
 * A button that stays focusable when it can't be used: `aria-disabled` instead of `disabled`, so
 * a keyboard or screen-reader user reaches it and hears why (`aria-describedby` points at the
 * reason shown inline after it). Clicks do nothing while unavailable.
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
  return (
    <>
      <button
        aria-disabled={!available || undefined}
        aria-describedby={reason ? id : undefined}
        onClick={() => {
          if (available) onClick()
        }}
      >
        {children}
      </button>
      {reason && (
        <span id={id} className="service-why muted small">
          {reason}
        </span>
      )}
    </>
  )
}
