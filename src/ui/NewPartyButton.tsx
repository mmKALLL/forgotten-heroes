import { useState } from 'react'
import { useI18n } from './i18n/I18n'

/**
 * "New party", then a confirmation: the party begins in a random mainland settlement (design §6;
 * designer decision: no choice of start).
 */
export function NewPartyButton({ onStart }: { onStart: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="new-party">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('top.newParty')}
      </button>
      {open && (
        <div className="new-party-menu" role="group" aria-label={t('start.heading')}>
          <p className="small">{t('start.heading')}</p>
          <button
            className="primary"
            onClick={() => {
              setOpen(false)
              onStart()
            }}
          >
            {t('start.go')}
          </button>
          <button onClick={() => setOpen(false)}>{t('start.cancel')}</button>
        </div>
      )}
    </div>
  )
}
