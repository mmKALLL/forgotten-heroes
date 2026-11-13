import type { Content } from '../../content/build'
import { availableActions, type Action } from '../../engine/state'
import { poiInfo, suppliesInfo } from '../../engine/travel/preview'
import type { GameState } from '../../schema/state'
import { CrisisSiteNote } from '../CrisisPanel'
import { crLevel } from '../../engine/rules/challenge'
import { founderLevel } from '../../engine/rules/levels'
import { delvePreview } from '../../engine/world/delve'
import { siteCr } from '../../engine/world/dungeons'
import { DungeonCard, SiteCr } from './DelveView'
import { useI18n } from '../i18n/I18n'
import { ExploreAction } from './ExploreAction'
import { PoiSummary } from './PoiSummary'
import { RoadsOut } from './RoadsOut'
import type { TravelPrefs } from './travelPrefs'

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
  // An authored dungeon (Plan 6 D3) or a lair's challenge rating (D2).
  const dungeon = delvePreview(state, content, state.location!)
  const cr = siteCr(state.world, content, state.location!, state.day)
  const supplies = suppliesInfo(state)
  const reason = visit?.code ?? null
  return (
    <section className="panel place poi-panel" aria-label={t('poi.heading')}>
      <h2>{info.name}</h2>
      <PoiSummary info={info} />
      {dungeon ? (
        <DungeonCard preview={dungeon} />
      ) : (
        cr !== null && <SiteCr cr={cr} level={crLevel(cr)} party={founderLevel(state.party)} />
      )}
      <CrisisSiteNote content={content} state={state} />
      {visit && (
        <div className="actions">
          <button
            className="primary"
            disabled={!visit.available}
            onClick={() => onAction({ type: 'visitPoi' })}
          >
            {t(info.entered ? 'poi.enter' : 'poi.visit')}
          </button>
        </div>
      )}
      {reason === 'quiet' ? (
        // A Crisis site where nothing more happens: the engine's words (crisis/progress.ts).
        <p className="muted small">{visit?.reason}</p>
      ) : (
        reason && (
          <p className="tone-bad small">
            {reason === 'cleared'
              ? t('poi.clearedReason', { name: info.name })
              : reason === 'visited'
                ? t('poi.visitedReason', { name: info.name })
                : t('roadReason.busy')}
          </p>
        )
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
