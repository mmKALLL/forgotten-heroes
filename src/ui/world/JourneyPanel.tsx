import { useEffect } from 'react'
import type { Content } from '../../content/build'
import { capitalFirst } from '../../engine/format'
import type { Action } from '../../engine/state'
import { journeyInfo, suppliesInfo } from '../../engine/travel/preview'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { biomeText, campHint, paceText } from './travelText'
import { restOption } from '../../engine/travel/supplies'
import { useGlideKm, type AutoTravel } from './autoTravel'

/** Space pauses or resumes auto-travel while nothing interactive has focus and no modal is open. */
function useSpaceToggle(auto: AutoTravel | undefined) {
  const toggle = auto?.canRun ? auto.toggle : null
  useEffect(() => {
    if (!toggle) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat) return
      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      const at = document.activeElement
      if (at !== null && at !== document.body && at !== document.documentElement) return
      e.preventDefault()
      toggle()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggle])
}

/**
 * The journey under way: where from and to, how far, the pace (fixed at departure), the
 * supplies, and pause or resume auto-travel (design §7), skip ahead, or make camp.
 */
export function JourneyPanel({
  content,
  state,
  onAction,
  autoRest,
  auto,
}: {
  content: Content
  state: GameState
  onAction: (a: Action) => void
  /** The per-viewer auto-rest setting and its toggle (absent: not shown). */
  autoRest?: { on: boolean; set: (on: boolean) => void }
  /** Auto-travel (absent: only Continue walks on). */
  auto?: AutoTravel
}) {
  const { t } = useI18n()
  useSpaceToggle(auto)
  // During auto-travel the km done counts up with the marker, a km at a time.
  const kmDone = useGlideKm(auto?.glide, state)
  const j = journeyInfo(state, content)
  if (!j) return null
  const supplies = suppliesInfo(state, j.terrain, content)
  const sea = j.terrain === 'sea'
  return (
    <section className="panel journey" aria-label={t('journey.heading')}>
      <h2>{t('journey.heading')}</h2>
      <p>{t('journey.route', { from: capitalFirst(j.fromName), to: capitalFirst(j.toName) })}</p>
      {/* The party's marker on the map shows how far along the road it is. */}
      <p className="small">
        {t('journey.days', {
          done: j.daysDone,
          days: j.days,
          kmDone,
          km: j.km,
        })}
      </p>
      <p className="muted small">{biomeText(t, j.terrain)}</p>
      <p className="small">
        {sea
          ? t('route.seaPace')
          : t('journey.pace', { pace: paceText(t, j.pace) }) +
            (state.travel?.forage ? t('journey.foraging') : '')}
      </p>
      <p className="small">
        {t('journey.supplies', { food: supplies.foodDays, water: supplies.waterDays })}
      </p>
      <div className="actions">
        {auto && (
          <button
            className="primary"
            disabled={!auto.canRun}
            title={t('journey.autoHint')}
            onClick={auto.toggle}
          >
            {auto.paused ? t('journey.resume') : t('journey.pause')}
          </button>
        )}
        <button
          className={auto ? undefined : 'primary'}
          disabled={!j.canMove}
          title={t(auto ? 'journey.skipHint' : 'journey.continueHint')}
          onClick={() => onAction({ type: 'continueJourney' })}
        >
          {t(auto ? 'journey.skip' : 'journey.continue')}
        </button>
        <button
          title={campHint(t, restOption(state, content))}
          onClick={() => onAction({ type: 'rest' })}
        >
          {t('journey.camp')}
        </button>
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
