import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { journeyInfo, suppliesInfo } from '../../engine/travel/preview'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { biomeText, dangerText, paceChoiceOf } from './travelText'

/**
 * The journey under way: where from and to, how far, the pace (fixed at departure), the
 * supplies, and Continue or make camp.
 */
export function JourneyPanel({
  content,
  state,
  onAction,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const j = journeyInfo(state, content)
  if (!j) return null
  const supplies = suppliesInfo(state, j.terrain)
  const sea = j.terrain === 'sea'
  return (
    <section className="panel journey" aria-label={t('journey.heading')}>
      <h2>{t('journey.heading')}</h2>
      <p>{t('journey.route', { from: j.fromName, to: j.toName })}</p>
      <div
        className="progress"
        role="progressbar"
        aria-label={t('journey.progress')}
        aria-valuemin={0}
        aria-valuemax={j.km}
        aria-valuenow={j.kmDone}
        aria-valuetext={t('journey.progressValue', { done: j.kmDone, km: j.km })}
      >
        <span style={{ width: `${Math.min(100, (100 * j.kmDone) / j.km)}%` }} />
      </div>
      <p className="muted small">
        {t('journey.days', {
          done: j.daysDone,
          days: j.days,
          terrain: biomeText(t, j.terrain),
          danger: dangerText(t, j.danger),
        })}
      </p>
      <p className="small">
        {sea
          ? t('route.seaPace')
          : t('journey.pace', { pace: t(`pace.${paceChoiceOf(j)}`) }) +
            (state.travel?.forage ? t('journey.foraging') : '')}
      </p>
      <p className="small">
        {t('journey.supplies', { food: supplies.foodDays, water: supplies.waterDays })}
      </p>
      <div className="actions">
        <button
          className="primary"
          disabled={!j.canMove}
          onClick={() => onAction({ type: 'continueJourney' })}
        >
          {t('journey.continue')}
        </button>
        <button onClick={() => onAction({ type: 'rest' })}>{t('journey.camp')}</button>
      </div>
    </section>
  )
}
