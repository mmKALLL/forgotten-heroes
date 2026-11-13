import type { Content } from '../../content/build'
import { capitalFirst } from '../../engine/format'
import type { Action } from '../../engine/state'
import { noticeBoard, type Offer } from '../../engine/town/contracts'
import { standingFloor } from '../../engine/town/reputation'
import { serviceRows } from '../../engine/town/services'
import type { GameState } from '../../schema/state'
import { contractText } from '../contractText'
import { useI18n } from '../i18n/I18n'
import { daysText, leftText } from '../world/travelText'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/** True when a service here posts a notice board (the Hire & Contracts tiles point to it). */
export const hasBoard = (state: GameState, content: Content): boolean =>
  serviceRows(state, content).some((r) => r.actions.some((a) => a.action === 'board'))

/**
 * The notice board here (design §5, §8): each offer with its kind, destination, distance, the
 * days left to its deadline (and the days it takes at a steady pace), pay and reputation, urgent
 * ones badged, and its text in full. Offers the party lacks the reputation for (in points, with
 * the town or the patron), or can't take now, are disabled with the reason.
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
            <OfferRow key={o.id} offer={o} today={state.day} onAction={onAction} />
          ))}
        </ul>
      )}
    </section>
  )
}

function OfferRow({
  offer: o,
  today,
  onAction,
}: {
  offer: Offer
  today: number
  onAction: (a: Action) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const { title, text } = contractText(i18n, o)
  // The countdown: days from today to the deadline if taken now. An urgent offer's is bold red
  // (designer call: no separate urgent badge). A marker splits the line around it.
  const left = leftText(t, o.deadline - today)
  const MARK = '\u0000'
  const why = o.locked ? t('board.locked', { n: standingFloor(o.locked) }) : (o.reason ?? null)
  const rep = o.reputation.patron + o.reputation.settlement
  const route =
    o.kind === 'procurement'
      ? t('board.procure', {
          source: o.sourceName ?? '',
          km: o.km,
          left: MARK,
          steady: daysText(t, o.steadyDays),
        })
      : t('board.route', {
          to: capitalFirst(o.poiName ?? o.toName),
          km: o.km,
          left: MARK,
          steady: daysText(t, o.steadyDays),
        })
  const [beforeLeft, afterLeft = ''] = route.split(MARK)
  return (
    <li className={o.available ? 'offer' : 'offer unavailable'}>
      <div className="offer-head">
        <span className="badge kind">{t(`contractKind.${o.kind}`)}</span>
        <strong>{title}</strong>
        <span className="badge level" title={t('board.levelHint')}>
          {t('board.level', { n: o.level })}
        </span>
        <span className="offer-pay">
          {t('board.pay', { gp: o.pay })}
          {rep > 0 && <span className="muted"> · {t('board.rep', { n: rep })}</span>}
        </span>
        <button
          disabled={!o.available}
          title={why ?? undefined}
          aria-label={t('board.takeLabel', { title })}
          onClick={() => onAction({ type: 'acceptContract', offerId: o.id })}
        >
          {t('board.take')}
        </button>
      </div>
      <div className="offer-route muted">
        {why && <span className="tone-bad">{why} · </span>}
        {beforeLeft}
        <span className={o.urgent ? 'urgent-left' : undefined}>{left}</span>
        {afterLeft}
      </div>
      {/* In full (designer call: almost every offer fits; no "more" toggle). */}
      <p className="contract-text">{text}</p>
    </li>
  )
}
