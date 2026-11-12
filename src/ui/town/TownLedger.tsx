import type { ReactNode } from 'react'
import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { settlementStanding } from '../../engine/town/reputation'
import { placeInfo } from '../../engine/travel/preview'
import type { GameState } from '../../schema/state'
import { assetUrl } from '../assets'
import { useI18n } from '../i18n/I18n'
import { ExploreAction } from '../world/ExploreAction'
import { GatherAction } from '../world/GatherAction'
import { RoadsOut } from '../world/RoadsOut'
import { realmText, sizeText, threatLine } from '../world/travelText'
import type { TravelPrefs } from '../world/travelPrefs'
import { MarketPanel } from './MarketPanel'
import { NoticeBoard } from './NoticeBoard'
import { PeoplePanel, RumoursLine, StandingBadge } from './PeoplePanel'

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
 * (town · land · kingdom · threat · the party's standing here); the Market; the Services; the
 * People under them; Explore, then the roads out with the pace chooser; then
 * talk and work: rumours and the notice board. In the DOM the zones run market, services, people,
 * roads, talk (for the keyboard and narrow screens); on wide screens they make two columns: market,
 * services and people, then roads and talk.
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
        <span className="small">
          {t('ledger.standing')} <StandingBadge standing={settlementStanding(state, here.id)} />
        </span>
      </header>
      <div className="ledger-main">
        <section className="zone zone-market" aria-label={t('ledger.market')}>
          <MarketPanel content={content} state={state} onAction={onAction} />
        </section>
        <section className="zone zone-services" aria-label={t('ledger.services')}>
          {services}
        </section>
        <PeoplePanel content={content} state={state} />
      </div>
      <div className="ledger-side">
        <section className="zone zone-roads" aria-label={t('ledger.roads')}>
          {/* Explore sits above the roads (designer decision). */}
          <ExploreAction content={content} state={state} onAction={onAction} compact />
          <GatherAction content={content} state={state} onAction={onAction} />
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
        <section className="zone zone-talk" aria-label={t('ledger.talk')}>
          <RumoursLine content={content} state={state} onAction={onAction} />
          <NoticeBoard content={content} state={state} onAction={onAction} />
        </section>
      </div>
    </section>
  )
}
