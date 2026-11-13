import { formatDate } from '../engine/calendar'
import type { CrisisInfo } from '../engine/crisis/status'
import { capitalFirst } from '../engine/format'
import { dangerInfo, type DangerInfo } from '../engine/world/danger'
import { currentAct } from './CrisisPanel'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'

/**
 * The day in the top bar, with its date and the world's danger on hover or tap (design §10b,
 * Plan 5a U3), and a small "⚠ +20%" after it once the danger has risen (with the Crisis's surge,
 * and why, Plan 6). While an act of the Crisis is open (its plan learned), a small "Act I · 37d"
 * follows (Plan 5b U2), in the bad tone from its hurry day, with the act on hover or tap.
 */
export function DayMark({
  day,
  crisis = null,
  danger = dangerInfo({ day, crisis: null }),
}: {
  day: number
  crisis?: CrisisInfo | null
  danger?: DangerInfo
}) {
  const { t } = useI18n()
  const tip = [
    formatDate(day),
    danger.text +
      (danger.nextDay === null ? '' : ` · ${t('top.dangerNext', { day: danger.nextDay })}`),
    ...(danger.surge ? [danger.surge.text] : []),
    ...(danger.wait ? [danger.wait.text] : []),
  ].join('\n')
  const act = currentAct(crisis)
  return (
    <span className="day-mark">
      <Tip tip={tip}>
        {t('top.day', { day })}
        {danger.percent > 0 && (
          <span className="danger-mark small"> {t('top.danger', { percent: danger.percent })}</span>
        )}
      </Tip>
      {act && crisis && (
        <Tip
          className={`crisis-mark small${act.pressing ? ' tone-bad' : ''}`}
          tip={[
            t('crisis.markTip', { numeral: act.numeral, name: crisis.short ?? '', act: act.name }),
            act.poi
              ? capitalFirst(act.where ?? '')
              : act.where && t('crisis.somewhere', { land: act.where }),
            t('crisis.due', { due: act.due, days: act.daysLeft }),
          ]
            .filter(Boolean)
            .join('\n')}
        >
          {t('crisis.mark', { numeral: act.numeral, days: act.daysLeft })}
        </Tip>
      )}
    </span>
  )
}
