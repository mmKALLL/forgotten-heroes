import type { Content } from '../../content/build'
import { availableActions, type Action } from '../../engine/state'
import { poiInfo, suppliesInfo } from '../../engine/travel/preview'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { ExploreAction } from './ExploreAction'
import { PoiSummary } from './PoiSummary'
import { RoadsOut } from './RoadsOut'
import type { TravelPrefs } from './travelPrefs'

/** Categories whose sites are entered rather than visited. */
const ENTERED = new Set(['dungeon', 'lair'])

type Props = {
  content: Content
  state: GameState
  selected: string | null
  onSelect: (placeId: string | null) => void
  /** The pace and foraging chosen for the paths out (kept by the caller across journeys). */
  prefs: TravelPrefs
  onPrefs: (p: TravelPrefs) => void
  onAction: (a: Action) => void
}

/**
 * The point of interest the party is at: what it is, who owns it and what it does to the
 * domain's threat; visiting it (its site situation), a camp-only rest (no inn, and nothing to buy
 * or sell here), exploring the domain, and the paths out with their forecasts.
 */
export function PoiPanel({ content, state, selected, onSelect, prefs, onPrefs, onAction }: Props) {
  const { t } = useI18n()
  const info = state.location && !state.travel ? poiInfo(state, content, state.location) : null
  if (!info) {
    return (
      <section className="panel place poi-panel" aria-label={t('poi.heading')}>
        <p>{t('place.nowhere')}</p>
      </section>
    )
  }
  const visit = availableActions(state, content).find((a) => a.type === 'visitPoi')
  const supplies = suppliesInfo(state)
  const reason = !visit || visit.available ? null : info.cleared ? 'cleared' : 'busy'
  return (
    <section className="panel place poi-panel" aria-label={t('poi.heading')}>
      <h2>{info.name}</h2>
      <PoiSummary info={info} />
      {visit && (
        <div className="actions">
          <button
            className="primary"
            disabled={!visit.available}
            onClick={() => onAction({ type: 'visitPoi' })}
          >
            {t(info.category && ENTERED.has(info.category) ? 'poi.enter' : 'poi.visit')}
          </button>
        </div>
      )}
      {reason && (
        <p className="tone-bad small">
          {reason === 'cleared'
            ? t('poi.clearedReason', { name: info.name })
            : t('roadReason.busy')}
        </p>
      )}
      <h3>{t('place.supplies')}</h3>
      <p className="small">
        {t('place.carried', {
          food: supplies.food,
          water: supplies.water,
          capacity: supplies.waterCapacity,
          skins: state.waterskins,
        })}
      </p>
      <div className="actions" title={t('poi.restHint')}>
        <button onClick={() => onAction({ type: 'rest', lodging: false })}>{t('poi.rest')}</button>
      </div>
      <p className="muted small">{t('poi.noTrade')}</p>
      <ExploreAction content={content} state={state} onAction={onAction} />
      <RoadsOut
        content={content}
        state={state}
        selected={selected}
        onSelect={onSelect}
        prefs={prefs}
        onPrefs={onPrefs}
        onAction={onAction}
      />
    </section>
  )
}
