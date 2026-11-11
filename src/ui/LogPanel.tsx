import type { LogEntry } from '../schema/state'
import { useI18n } from './i18n/I18n'

/** The journal's own lines are engine text and stay English for now. */
export function LogPanel({ log }: { log: LogEntry[] }) {
  const { t } = useI18n()
  return (
    <section className="panel" aria-label={t('journal.heading')}>
      <h2>{t('journal.heading')}</h2>
      <ol className="log" role="list" aria-label={t('journal.log')} reversed>
        {[...log].reverse().map((entry, i) => (
          <li key={log.length - i} className={`tone-${entry.tone}`}>
            <span className="muted small">{t('journal.day', { day: entry.day })}</span> {entry.text}
          </li>
        ))}
      </ol>
    </section>
  )
}
