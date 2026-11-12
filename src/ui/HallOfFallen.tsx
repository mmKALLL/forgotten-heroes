import { useState } from 'react'
import type { RunRecord } from '../schema/crisis'
import { readHall } from './hall'
import { useI18n } from './i18n/I18n'

/**
 * The Hall of the Fallen in the Saves menu (Plan 5b U3): every run that ended, newest first, with
 * its party (classes and levels, who fell), the day it ended, the ending and the villain.
 * Collapsed until asked for; read from storage each time it opens.
 */
export function HallOfFallen() {
  const { t, name } = useI18n()
  const [open, setOpen] = useState(false)
  const hall = readHall()
  return (
    <section className="hall" aria-label={t('hall.heading')}>
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('hall.button', { n: hall.length })}
      </button>
      {open &&
        (hall.length === 0 ? (
          <p className="muted small">{t('hall.empty')}</p>
        ) : (
          <ol className="hall-list">
            {hall.map((r) => (
              <li key={r.id} className="small">
                <p>
                  {r.party
                    .map((m) =>
                      t(m.fallen ? 'hall.memberFell' : 'hall.member', {
                        name: m.name,
                        class: name('classes', m.classId, m.classId),
                        level: m.level,
                      })
                    )
                    .join(', ')}
                </p>
                <p className="muted">
                  {[
                    t('hall.line', {
                      day: r.day,
                      ending: r.ending ? t(`saves.ending.${r.ending}`) : '',
                    }),
                    r.ending === 'fallen' &&
                      crisisOutcome(r) &&
                      t(`saves.ending.${crisisOutcome(r)!}`),
                    r.villain && t('hall.villain', { villain: r.villain }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ol>
        ))}
    </section>
  )
}

/** A fallen party may have decided the Crisis first: a failed act lost it, three thwarted won it. */
function crisisOutcome(r: RunRecord): 'won' | 'lost' | null {
  if (r.acts.includes('failed')) return 'lost'
  return r.acts.length > 0 && r.acts.every((a) => a === 'thwarted') ? 'won' : null
}
