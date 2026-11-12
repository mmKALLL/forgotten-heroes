import { useEffect, useRef } from 'react'
import type { Content } from '../../content/build'
import { accessoryOffers, accessorySales } from '../../engine/gear/accessories'
import { describeHook } from '../../engine/gear/hooks'
import type { Action } from '../../engine/state'
import type { Accessory } from '../../schema/gear'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'

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
 * and Buy (disabled with the engine's reason inline), then the party's unworn gear with what the
 * shop pays. It replaces the service tiles until closed, like the recruits list.
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
        <ul className="recruit-list">
          {offers.map((o) => (
            <li key={o.id} className="recruit" aria-label={o.accessory.name}>
              <AccessoryText accessory={o.accessory} />
              <div className="recruit-hire">
                <button
                  disabled={!o.available}
                  onClick={() => onAction({ type: 'buyAccessory', offerId: o.id })}
                >
                  {t('shop.buy', { gp: o.price })}
                </button>
                {o.reason && <span className="service-why muted small">{o.reason}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {sales.length > 0 && (
        <>
          <h4 className="shop-sell-head">{t('shop.sellHeading')}</h4>
          <ul className="recruit-list">
            {sales.map((s) => (
              <li key={s.accessory.id} className="recruit" aria-label={s.accessory.name}>
                <AccessoryText accessory={s.accessory} />
                <div className="recruit-hire">
                  <button
                    disabled={!s.available}
                    onClick={() => onAction({ type: 'sellAccessory', id: s.accessory.id })}
                  >
                    {t('shop.sell', { gp: s.price })}
                  </button>
                  {s.reason && <span className="service-why muted small">{s.reason}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Its name, tier and what each of its hooks does. */
function AccessoryText({ accessory: a }: { accessory: Accessory }) {
  const { t } = useI18n()
  return (
    <>
      <div>
        <strong>{a.name}</strong>
        {a.tier === 2 && <span className="muted small"> {t('shop.fine')}</span>}
      </div>
      {a.hooks.length > 0 && (
        <ul className="hook-lines small">
          {a.hooks.map((h, i) => (
            <li key={i}>{describeHook(h)}</li>
          ))}
        </ul>
      )}
    </>
  )
}
