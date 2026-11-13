import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
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
 * (town · land · kingdom · threat · the party's standing here), then two tabs (designer, Plan 6):
 * **Market** (the market beside the services; recruits stay with their inn or guild) and
 * **Travel** (rumours, people and the notice board, beside Explore, Gather and the roads out with
 * the chosen journey's card; designer call: talk on the left). Each tab has two columns on wide screens and stacks on narrow
 * ones. The town's map, when synced, is shown large below the tabs at their full width.
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
  const [tab, setTab] = useLedgerTab()
  const ledger = useRef<HTMLElement>(null)
  const id = useId()
  const tabs = useRef<Record<LedgerTab, HTMLButtonElement | null>>({ market: null, travel: null })
  // Tab switches the tabs while nothing interactive has focus (the page, or the ledger itself), or
  // when the last thing the player did was click (designer call: click a destination, then Tab);
  // while moving about by keyboard, and always with Shift, it moves focus as usual, so the page
  // stays reachable by keyboard.
  useEffect(() => {
    let pointer = false
    const onPointer = () => {
      pointer = true
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {
        // Any other key (Enter, arrows…) means keyboard use: Tab moves focus again.
        if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) pointer = false
        return
      }
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
        pointer = false
        return
      }
      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      const at = document.activeElement
      const idle =
        at === null ||
        at === document.body ||
        at === document.documentElement ||
        at === ledger.current
      if (!idle && !pointer) return
      e.preventDefault()
      setTab((current) => (current === 'market' ? 'travel' : 'market'))
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [setTab])
  // A destination picked (on the map, say) opens the Travel tab, where its journey card is.
  useEffect(() => {
    if (selected !== null) setTab('travel')
  }, [selected, setTab])
  const here = state.location ? placeInfo(state, content, state.location) : null
  if (!here) {
    return (
      <section className="panel place" aria-label={t('place.heading')}>
        <p>{t('place.nowhere')}</p>
      </section>
    )
  }
  const banner = here.banner ? assetUrl(here.banner) : null
  // The tabs' own keys (WAI-ARIA tabs): the arrows, Home and End move to a tab and open it.
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === 'ArrowLeft' || e.key === 'Home'
        ? 'market'
        : e.key === 'ArrowRight' || e.key === 'End'
          ? 'travel'
          : null
    if (!next) return
    e.preventDefault()
    setTab(next)
    tabs.current[next]?.focus()
  }
  const panel = (which: LedgerTab) => ({
    role: 'tabpanel',
    id: `${id}-${which}-panel`,
    'aria-labelledby': `${id}-${which}-tab`,
    hidden: tab !== which,
    className: `ledger-tab ledger-${which}`,
  })
  return (
    <section
      ref={ledger}
      tabIndex={-1}
      className="panel place ledger"
      aria-label={t('place.heading')}
    >
      <header className="ledger-head">
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
      <div
        className="ledger-tabs"
        role="tablist"
        aria-label={t('ledger.tabs')}
        onKeyDown={onTabKey}
      >
        {LEDGER_TABS.map((which) => (
          <button
            key={which}
            ref={(el) => {
              tabs.current[which] = el
            }}
            role="tab"
            id={`${id}-${which}-tab`}
            aria-selected={tab === which}
            aria-controls={`${id}-${which}-panel`}
            tabIndex={tab === which ? 0 : -1}
            title={t('ledger.tabHint')}
            onClick={() => setTab(which)}
          >
            {t(`ledger.tab.${which}`)}
          </button>
        ))}
      </div>
      <div {...panel('market')}>
        <section className="ledger-col zone zone-market" aria-label={t('ledger.market')}>
          <MarketPanel content={content} state={state} onAction={onAction} />
        </section>
        <section className="ledger-col zone zone-services" aria-label={t('ledger.services')}>
          {services}
        </section>
      </div>
      <div {...panel('travel')}>
        <section className="ledger-col zone zone-talk" aria-label={t('ledger.talk')}>
          <RumoursLine content={content} state={state} onAction={onAction} />
          <PeoplePanel content={content} state={state} />
          <NoticeBoard content={content} state={state} onAction={onAction} />
        </section>
        <section className="ledger-col zone zone-roads" aria-label={t('ledger.roads')}>
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
      </div>
      {banner && (
        <figure className="town-picture">
          <img src={banner} alt={t('place.banner', { name: here.name })} loading="lazy" />
        </figure>
      )}
    </section>
  )
}

const LEDGER_TABS = ['market', 'travel'] as const
type LedgerTab = (typeof LEDGER_TABS)[number]

/** The ledger tab this viewer chose last (Market by default). */
export const LEDGER_TAB_KEY = 'forgotten-heroes/ui/ledger-tab'

function loadTab(): LedgerTab {
  try {
    return localStorage.getItem(LEDGER_TAB_KEY) === 'travel' ? 'travel' : 'market'
  } catch {
    return 'market'
  }
}

/** The ledger's tab, remembered per viewer (when storage fails it is just forgotten). */
function useLedgerTab(): [LedgerTab, Dispatch<SetStateAction<LedgerTab>>] {
  const [tab, setTab] = useState<LedgerTab>(loadTab)
  useEffect(() => {
    try {
      localStorage.setItem(LEDGER_TAB_KEY, tab)
    } catch {
      // Storage unavailable (private mode, quota): the choice just won't persist.
    }
  }, [tab])
  return [tab, setTab]
}
