import type { Content } from '../../content/build'
import type { Action } from '../../engine/state'
import { noticeBoard, type Offer } from '../../engine/town/contracts'
import { serviceRows } from '../../engine/town/services'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { daysText } from '../world/travelText'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/** True when a service here posts a notice board (the Hire & Contracts tiles point to it). */
export const hasBoard = (state: GameState, content: Content): boolean =>
  serviceRows(state, content).some((r) => r.actions.some((a) => a.action === 'board'))

/**
 * The notice board here (design §5, §8): each offer with its kind, destination, distance,
 * deadline (and the days it takes at a steady pace), pay and reputation, urgent ones badged.
 * Offers the party lacks the standing for, or can't take now, are disabled with the reason.
 */
export function NoticeBoard({ content, state, onAction }: Props) {
  const { t } = useI18n()
  if (state.location === null || !hasBoard(state, content)) return null
  const offers = noticeBoard(state, content, state.location)
  return (
    <section className="notice-board" aria-label={t('board.heading')}>
      <h3>{t('board.heading')}</h3>
      {offers.length === 0 ? (
        <p className="muted small">{t('board.empty')}</p>
      ) : (
        <ul className="offers small">
          {offers.map((o) => (
            <OfferRow key={o.id} offer={o} state={state} onAction={onAction} />
          ))}
        </ul>
      )}
    </section>
  )
}

function OfferRow({
  offer: o,
  state,
  onAction,
}: {
  offer: Offer
  state: GameState
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const why = o.locked
    ? t('board.locked', { standing: t(`standing.${o.locked}`) })
    : (o.reason ?? null)
  const rep = o.reputation.patron + o.reputation.settlement
  const route =
    o.kind === 'procurement'
      ? t('board.procure', {
          source: o.sourceName ?? '',
          km: o.km,
          day: state.day + o.days,
          steady: daysText(t, o.steadyDays),
        })
      : t('board.route', {
          to: o.poiName ?? o.toName,
          km: o.km,
          day: state.day + o.days,
          steady: daysText(t, o.steadyDays),
        })
  // Two lines each; the whole offer is in the tooltip.
  return (
    <li
      className={o.available ? 'offer' : 'offer unavailable'}
      title={[o.title, o.text, route, why].filter(Boolean).join('\n')}
    >
      <div className="offer-head">
        <span className="badge kind">{t(`contractKind.${o.kind}`)}</span>
        <strong>{o.title}</strong>
        {o.urgent && <span className="badge urgent">{t('board.urgent')}</span>}
        <span className="offer-pay">
          {t('board.pay', { gp: o.pay })}
          {rep > 0 && <span className="muted"> · {t('board.rep', { n: rep })}</span>}
        </span>
        <button
          disabled={!o.available}
          title={why ?? undefined}
          aria-label={t('board.takeLabel', { title: o.title })}
          onClick={() => onAction({ type: 'acceptContract', offerId: o.id })}
        >
          {t('board.take')}
        </button>
      </div>
      <div className="offer-route muted">
        {why && <span className="tone-bad">{why} · </span>}
        {route}
      </div>
    </li>
  )
}
