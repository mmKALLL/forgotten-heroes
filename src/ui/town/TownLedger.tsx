import type { ReactNode } from 'react'
import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { peopleRows } from '../../engine/town/reputation'
import { placeInfo } from '../../engine/travel/preview'
import type { GameState } from '../../schema/state'
import { assetUrl } from '../assets'
import { useI18n } from '../i18n/I18n'
import { ExploreAction } from '../world/ExploreAction'
import { RoadsOut } from '../world/RoadsOut'
import { realmText, sizeText, threatLine } from '../world/travelText'
import type { TravelPrefs } from '../world/travelPrefs'
import { MarketPanel } from './MarketPanel'

type Props = {
  content: Content
  state: GameState
  selected: string | null
  onSelect: (placeId: string | null) => void
  prefs: TravelPrefs
  onPrefs: (p: TravelPrefs) => void
  onAction: (a: Action) => void
  /** The Services zone (ServicesPanel, which heads it). */
  services: ReactNode
}

/**
 * The town ledger (design §5): the settlement on one screen with no modals. A one-line header
 * (town · domain · kingdom · threat); the Market; the Services; the roads out with the pace
 * chooser, and Explore after them; and the People, collapsed. In the DOM the zones run market,
 * services, roads, people (the order a visit goes in, for the keyboard and narrow screens); on
 * wide screens they make two columns: market and services, then roads and people.
 */
export function TownLedger({
  content,
  state,
  selected,
  onSelect,
  prefs,
  onPrefs,
  onAction,
  services,
}: Props) {
  const { t } = useI18n()
  const here = state.location ? placeInfo(state, content, state.location) : null
  if (!here) {
    return (
      <section className="panel place" aria-label={t('place.heading')}>
        <p>{t('place.nowhere')}</p>
      </section>
    )
  }
  const banner = here.banner ? assetUrl(here.banner) : null
  const people = peopleRows(state, content)
  return (
    <section className="panel place ledger" aria-label={t('place.heading')}>
      <header className="ledger-head">
        {banner && (
          <img className="banner-thumb" src={banner} alt={t('place.banner', { name: here.name })} />
        )}
        <h2>{here.name}</h2>
        <span className="small" title={t('place.size', { size: sizeText(t, here.sizeTier) })}>
          {t('place.summary', { type: here.typeName, population: here.population })}
        </span>
        <span className="muted small realm" title={realmText(t, here)}>
          {realmText(t, here)}
        </span>
        <span className="small">{threatLine(t, here)}</span>
      </header>
      <div className="ledger-main">
        <section className="zone zone-market" aria-label={t('ledger.market')}>
          <MarketPanel content={content} state={state} onAction={onAction} />
        </section>
        <section className="zone zone-services" aria-label={t('ledger.services')}>
          {services}
        </section>
      </div>
      <div className="ledger-side">
        <section className="zone zone-roads" aria-label={t('ledger.roads')}>
          <RoadsOut
            content={content}
            state={state}
            selected={selected}
            onSelect={onSelect}
            prefs={prefs}
            onPrefs={onPrefs}
            onAction={onAction}
          />
          <ExploreAction content={content} state={state} onAction={onAction} compact />
        </section>
        <details className="zone zone-people">
          <summary>{t('ledger.people', { n: people.length })}</summary>
          {people.length === 0 ? (
            <p className="muted small">{t('ledger.noPeople')}</p>
          ) : (
            <ul className="people small">
              {people.map((p) => (
                <li key={p.id}>
                  {p.name} <span className="muted">· {p.role}</span>{' '}
                  <span className={`standing standing-${p.standing}`}>
                    {t(`standing.${p.standing}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* C4: the full People panel (rumours, the notice board) takes this place. */}
        </details>
      </div>
    </section>
  )
}
