import { formatDate } from '../engine/calendar'
import type { CrisisInfo } from '../engine/crisis/status'
import { dangerInfo } from '../engine/world/danger'
import { actPressing, currentAct } from './CrisisPanel'
import { useI18n } from './i18n/I18n'
import { Tip } from './Tip'

/**
 * The day in the top bar, with its date and the world's danger on hover or tap (design §10b,
 * Plan 5a U3), and a small "⚠ +20%" after it once the danger has risen. While an act of the
 * Crisis is under way (its plan learned), a small "Act I · 37d" follows (Plan 5b U2), in the bad
 * tone when it is near or past due, with the act on hover or tap.
 */
export function DayMark({ day, crisis = null }: { day: number; crisis?: CrisisInfo | null }) {
  const { t } = useI18n()
  const danger = dangerInfo(day)
  const tip = [
    formatDate(day),
    danger.text +
      (danger.nextDay === null ? '' : ` · ${t('top.dangerNext', { day: danger.nextDay })}`),
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
          className={`crisis-mark small${actPressing(act) ? ' tone-bad' : ''}`}
          tip={[
            t('crisis.markTip', { numeral: act.numeral, name: crisis.short ?? '', act: act.name }),
            act.poi ? act.where : act.where && t('crisis.somewhere', { land: act.where }),
            act.late > 0
              ? t('crisis.late', { days: act.late, dc: act.lateDc, failsOn: act.failsOn })
              : t('crisis.due', { due: act.due, days: act.daysLeft }),
          ]
            .filter(Boolean)
            .join('\n')}
        >
          {act.late > 0
            ? t('crisis.markLate', { numeral: act.numeral, days: act.late })
            : t('crisis.mark', { numeral: act.numeral, days: act.daysLeft })}
        </Tip>
      )}
    </span>
  )
}
