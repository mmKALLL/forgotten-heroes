import { useEffect, useRef, type ReactNode } from 'react'
import type { Content } from '../../content/build'
import { accessoryOffers, accessorySales } from '../../engine/gear/accessories'
import { describeHook } from '../../engine/gear/hooks'
import type { Action } from '../../engine/state'
import type { Accessory } from '../../schema/gear'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { ReasonButton } from '../ReasonButton'

type Props = {
  content: Content
  state: GameState
  /** The service whose offers are listed (one with an `accessories` block). */
  service: string
  onAction: (a: Action) => void
  onClose: () => void
}

/**
 * A shop's accessories this week (Plan 5a U2, design §5): each offer's name, hook lines, price
 * and Buy (when refused, still focusable with the engine's reason inline and announced), then the
 * party's unworn gear with what the shop pays. After a purchase or sale, focus returns to the
 * heading. It replaces the service tiles until closed, like the recruits list.
 */
export function AccessoryShop({ content, state, service, onAction, onClose }: Props) {
  const { t, name } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const here = state.location
  const offers = (here === null ? [] : accessoryOffers(state, content, here)).filter(
    (o) => o.service === service
  )
  const sales = accessorySales(state, content)
  const serviceName = name('services', service, content.services[service]?.name ?? service)
  // A bought or sold row goes away: focus returns to the shop's heading.
  const act = (a: Action) => {
    onAction(a)
    heading.current?.focus()
  }
  return (
    <section
      className="accessory-shop"
      aria-label={t('shop.heading', { service: serviceName })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="zone-head">
        <h3 ref={heading} tabIndex={-1}>
          {t('shop.heading', { service: serviceName })}
        </h3>
        <button onClick={onClose}>{t('recruits.close')}</button>
      </div>
      {offers.length === 0 ? (
        <p className="muted small">{t('shop.none')}</p>
      ) : (
        <ul className="shop-list">
          {offers.map((o) => (
            <ShopRow key={o.id} accessory={o.accessory}>
              <ReasonButton
                available={o.available}
                reason={o.reason}
                onClick={() => act({ type: 'buyAccessory', offerId: o.id })}
              >
                {t('shop.buy', { gp: o.price })}
              </ReasonButton>
            </ShopRow>
          ))}
        </ul>
      )}
      {sales.length > 0 && (
        <>
          <h4 className="shop-sell-head">{t('shop.sellHeading')}</h4>
          <ul className="shop-list">
            {sales.map((s) => (
              <ShopRow key={s.accessory.id} accessory={s.accessory}>
                <ReasonButton
                  available={s.available}
                  reason={s.reason}
                  onClick={() => act({ type: 'sellAccessory', id: s.accessory.id })}
                >
                  {t('shop.sell', { gp: s.price })}
                </ReasonButton>
              </ShopRow>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** One line: its name, "fine" for tier 2, what its hooks do, then the button and any reason. */
function ShopRow({ accessory: a, children }: { accessory: Accessory; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <li className="shop-row" aria-label={a.name}>
      <span className="shop-text">
        <strong>{a.name}</strong>
        {a.tier === 2 && <span className="muted small"> {t('shop.fine')}</span>}
        {a.hooks.length > 0 && (
          <span className="small"> · {a.hooks.map(describeHook).join(' · ')}</span>
        )}
      </span>
      {children}
    </li>
  )
}
