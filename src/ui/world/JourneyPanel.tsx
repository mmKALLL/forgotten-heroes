import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { journeyInfo, suppliesInfo } from '../../engine/travel/preview'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { biomeText, dangerText } from './travelText'

/**
 * The journey under way: where from and to, how far, the pace (fixed at departure), the
 * supplies, and Continue or make camp.
 */
export function JourneyPanel({
  content,
  state,
  onAction,
  autoRest,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
  /** The per-viewer auto-rest setting and its toggle (absent: not shown). */
  autoRest?: { on: boolean; set: (on: boolean) => void }
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
      {/* The party's marker on the map shows how far along the road it is. */}
      <p className="small">
        {t('journey.days', {
          done: j.daysDone,
          days: j.days,
          kmDone: j.kmDone,
          km: j.km,
        })}
      </p>
      <p className="muted small">
        {biomeText(t, j.terrain)} · {dangerText(t, j.danger)}
      </p>
      <p className="small">
        {sea
          ? t('route.seaPace')
          : t('journey.pace', { pace: t(`pace.${j.pace}`) }) +
            (state.travel?.forage ? t('journey.foraging') : '')}
      </p>
      <p className="small">
        {t('journey.supplies', { food: supplies.foodDays, water: supplies.waterDays })}
      </p>
      <div className="actions">
        <button
          className="primary"
          disabled={!j.canMove}
          title={t('journey.continueHint')}
          onClick={() => onAction({ type: 'continueJourney' })}
        >
          {t('journey.continue')}
        </button>
        <button onClick={() => onAction({ type: 'rest' })}>{t('journey.camp')}</button>
      </div>
      {autoRest && (
        <label className="inline small">
          <input
            type="checkbox"
            checked={autoRest.on}
            onChange={(e) => autoRest.set(e.target.checked)}
          />{' '}
          {t('journey.autoRest')}
        </label>
      )}
    </section>
  )
}
