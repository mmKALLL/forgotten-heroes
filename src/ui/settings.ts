import { useState } from 'react'

/** Whether this viewer wants the party to rest on arrival when hurt or strained (off by default). */
export const AUTO_REST_KEY = 'forgotten-heroes/ui/auto-rest'

function load(): boolean {
  try {
    return localStorage.getItem(AUTO_REST_KEY) === 'true'
  } catch {
    return false
  }
}

function save(on: boolean) {
  try {
    localStorage.setItem(AUTO_REST_KEY, String(on))
  } catch {
    // Storage unavailable (private mode, quota): the choice just won't persist.
  }
}

/** The auto-rest setting, remembered per viewer. */
export function useAutoRest(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(load)
  return [
    on,
    (next) => {
      setOn(next)
      save(next)
    },
  ]
}
