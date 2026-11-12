import { useState } from 'react'
import { START_MODES, type StartMode } from '../engine/world/generate'
import { useI18n } from './i18n/I18n'

/** "New party", then where it begins: a small town in a calm region, or anywhere (design §6). */
export function NewPartyButton({ onStart }: { onStart: (mode: StartMode) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const label: Record<StartMode, string> = { calm: t('start.calm'), random: t('start.random') }
  return (
    <div className="new-party">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('top.newParty')}
      </button>
      {open && (
        <div className="new-party-menu" role="group" aria-label={t('start.heading')}>
          <p className="small">{t('start.heading')}</p>
          {START_MODES.map((mode) => (
            <button
              key={mode}
              className={mode === 'calm' ? 'primary' : undefined}
              onClick={() => {
                setOpen(false)
                onStart(mode)
              }}
            >
              {label[mode]}
            </button>
          ))}
          <button onClick={() => setOpen(false)}>{t('start.cancel')}</button>
        </div>
      )}
    </div>
  )
}
