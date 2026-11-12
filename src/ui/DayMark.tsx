import { formatDate } from '../engine/calendar'
import { dangerInfo } from '../engine/world/danger'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'

/**
 * The day in the top bar, with its date and the world's danger on hover or tap (design §10b,
 * Plan 5a U3), and a small "⚠ +20%" after it once the danger has risen.
 */
export function DayMark({ day }: { day: number }) {
  const { t } = useI18n()
  const danger = dangerInfo(day)
  const tip = [
    formatDate(day),
    danger.text +
      (danger.nextDay === null ? '' : ` · ${t('top.dangerNext', { day: danger.nextDay })}`),
  ].join('\n')
  return (
    <Tip tip={tip}>
      {t('top.day', { day })}
      {danger.percent > 0 && (
        <span className="danger-mark small"> {t('top.danger', { percent: danger.percent })}</span>
      )}
    </Tip>
  )
}
