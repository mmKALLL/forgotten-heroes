import { useId, useState, type ReactNode } from 'react'
import { useI18n } from './i18n/I18n'

export const DEV_EXPANDED_KEY = 'forgotten-heroes/ui/dev-expanded'

/** Whether this viewer last left the developer tools open; collapsed by default. */
function loadExpanded(): boolean {
  try {
    return localStorage.getItem(DEV_EXPANDED_KEY) === 'true'
  } catch {
    return false
  }
}

function saveExpanded(expanded: boolean) {
  try {
    localStorage.setItem(DEV_EXPANDED_KEY, String(expanded))
  } catch {
    // Storage unavailable (private mode, quota): the choice just won't persist.
  }
}

/**
 * The dev panels (practice check, Encounter Deck), out of the way below the journal. Collapsed
 * by default; the panels stay mounted while hidden, so their settings survive a toggle.
 */
export function DevArea({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(loadExpanded)
  const id = useId()
  const toggle = () => {
    setExpanded(!expanded)
    saveExpanded(!expanded)
  }
  return (
    <div className="dev-area">
      <button
        type="button"
        className="dev-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={toggle}
      >
        {expanded ? t('dev.hide') : t('dev.show')}
      </button>
      <div
        id={id}
        className="dev-panels"
        role="region"
        aria-label={t('dev.heading')}
        hidden={!expanded}
      >
        {children}
      </div>
    </div>
  )
}
