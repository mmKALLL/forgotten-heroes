import { useEffect, useRef, type ReactNode } from 'react'
import type { Content } from '../../content/build'
import { WEAPON_FAMILY_RULES, WEAPON_QUALITY_BONUS, ARMOUR_AC } from '../../engine/constants'
import { formatModifier } from '../../engine/format'
import { armsOffers, armsSales, type ArmsPiece } from '../../engine/town/arms'
import type { Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { useI18n, type I18n } from '../i18n/I18n'
import { ReasonButton } from '../ReasonButton'

type Props = {
  content: Content
  state: GameState
  /** The service whose shop is open (one with an `arms` block). */
  service: string
  onAction: (a: Action) => void
  onClose: () => void
}

/**
 * An arms shop (Plan 7 Track C): the weapons and armour it sells, each with what it does, its
 * weight and Buy (a refusal stays focusable with its reason), then the stash's pieces with what
 * the shop pays. Bought pieces go to the stash; members wear them from their sheet. It replaces
 * the service tiles until closed, like the accessory shop.
 */
export function ArmsShop({ content, state, service, onAction, onClose }: Props) {
  const { t, name } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const here = state.location
  const offers = (here === null ? [] : armsOffers(state, content, here)).filter(
    (o) => o.service === service
  )
  const sales = armsSales(state, content)
  const serviceName = name('services', service, content.services[service]?.name ?? service)
  const act = (a: Action) => {
    onAction(a)
    heading.current?.focus()
  }
  return (
    <section
      className="accessory-shop"
      aria-label={t('arms.heading', { service: serviceName })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="zone-head">
        <h3 ref={heading} tabIndex={-1}>
          {t('arms.heading', { service: serviceName })}
        </h3>
        <button onClick={onClose}>{t('recruits.close')}</button>
      </div>
      {offers.length === 0 ? (
        <p className="muted small">{t('arms.none')}</p>
      ) : (
        <ul className="shop-list">
          {offers.map((o) => (
            <PieceRow key={o.id} piece={o.piece}>
              <ReasonButton
                available={o.available}
                reason={o.reason}
                onClick={() => act({ type: 'buyArms', id: o.id })}
              >
                {t('shop.buy', { gp: o.price })}
              </ReasonButton>
            </PieceRow>
          ))}
        </ul>
      )}
      {sales.length > 0 && (
        <>
          <h4 className="shop-sell-head">{t('arms.sellHeading')}</h4>
          <ul className="shop-list">
            {sales.map((s, i) => (
              <PieceRow key={`${s.id}-${i}`} piece={s.piece}>
                <ReasonButton
                  available={s.available}
                  reason={s.reason}
                  onClick={() => act({ type: 'sellArms', id: s.id })}
                >
                  {t('shop.sell', { gp: s.price })}
                </ReasonButton>
              </PieceRow>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** "blade, d8, reach 1, +1 to hit · 1.5 kg" or "chain, AC 14 + DEX (max +2) · 8 kg". */
export function pieceText(t: I18n['t'], piece: ArmsPiece): string {
  const kg = t('arms.weight', { kg: piece.item.weight ?? 0 })
  if (piece.kind === 'weapon') {
    const rules = WEAPON_FAMILY_RULES[piece.item.family]
    const bonus = WEAPON_QUALITY_BONUS[piece.item.quality]
    const reach = rules.reach[0] === rules.reach[1] ? `${rules.reach[0]}` : rules.reach.join('–')
    const parts = [
      t(`arms.family.${piece.item.family}`),
      `d${rules.die}${bonus.damage > 0 ? formatModifier(bonus.damage) : ''}`,
      `reach ${reach}`,
      ...(bonus.toHit > 0 ? [`${formatModifier(bonus.toHit)} to hit`] : []),
    ]
    return `${parts.join(', ')} · ${kg}`
  }
  const { base, dexCap } = ARMOUR_AC[piece.item.grade]
  const dex = dexCap === null ? ' + DEX' : dexCap > 0 ? ` + DEX (max +${dexCap})` : ''
  return `${t(`arms.grade.${piece.item.grade}`)}, AC ${base}${dex} · ${kg}`
}

function PieceRow({ piece, children }: { piece: ArmsPiece; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <li className="shop-row" aria-label={piece.item.name}>
      <span className="shop-text">
        <strong>{piece.item.name}</strong>
        <span className="small shop-effect">{pieceText(t, piece)}</span>
      </span>
      {children}
    </li>
  )
}
