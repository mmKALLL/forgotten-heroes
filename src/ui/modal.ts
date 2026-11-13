import { useEffect, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * While a modal is open, everything beside its backdrop (its parent's other children) is inert,
 * so neither a click nor Tab reaches the game behind; on close, focus returns where it was.
 */
export function useInertBehind(backdrop: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const parent = backdrop.current?.parentElement
    const behind = parent
      ? [...parent.children].filter((el) => el !== backdrop.current && !el.hasAttribute('inert'))
      : []
    for (const el of behind) el.setAttribute('inert', '')
    return () => {
      for (const el of behind) el.removeAttribute('inert')
      if (before?.isConnected) before.focus()
    }
  }, [backdrop])
}

/** Keeps Tab and Shift+Tab inside a modal's box, wrapping at either end. */
export function trapTab(e: KeyboardEvent, box: HTMLElement | null) {
  if (e.key !== 'Tab' || !box) return
  const all = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (all.length === 0) return
  const first = all[0]
  const last = all[all.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
