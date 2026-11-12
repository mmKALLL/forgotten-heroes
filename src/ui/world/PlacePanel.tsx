import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { placeInfo } from '../../engine/travel/preview'
import { restOption } from '../../engine/travel/supplies'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { TownLedger } from '../town/TownLedger'
import type { TravelPrefs } from './travelPrefs'

type Props = {
  content: Content
  state: GameState
  selected: string | null
  onSelect: (placeId: string | null) => void
  /** The pace and foraging chosen for the roads out (kept by the caller across journeys). */
  prefs: TravelPrefs
  onPrefs: (p: TravelPrefs) => void
  onAction: (a: Action) => void
}

/** The settlement the party is in: the town ledger (design §5). */
export function PlacePanel(props: Props) {
  return <TownLedger {...props} services={<PlainServices {...props} />} />
}

/** The services here and a day's rest (until the C3 services panel). */
function PlainServices({ content, state, onAction }: Props) {
  const { t } = useI18n()
  const here = state.location ? placeInfo(state, content, state.location) : null
  if (!here) return null
  const rest = restOption(state, content)
  return (
    <>
      {here.services.length > 0 ? (
        <ul className="services">
          {here.services.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('place.noServices')}</p>
      )}
      <div className="actions" title={t('place.restHint')}>
        {rest.lodging && (
          <button onClick={() => onAction({ type: 'rest' })}>
            {t('place.restInn', { gp: rest.lodgingCost })}
          </button>
        )}
        <button onClick={() => onAction({ type: 'rest', lodging: false })}>
          {t('place.restOwn')}
        </button>
      </div>
    </>
  )
}
