import { useState } from 'react'
import type { Content } from '../content/build'
import type { Action } from '../engine/state'
import { contractRows, type ContractRow } from '../engine/town/contracts'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/**
 * The contracts the party holds, under the party (design §8): each with where it goes and the
 * days left. Where one can be completed it offers the choice of reward, saying what each gives:
 * the pay (with standing for the patron and their town) or a good word across their kingdom. It
 * can be abandoned, after a second click. Nothing when the party holds none.
 */
export function ContractsPanel({ content, state, onAction }: Props) {
  const { t } = useI18n()
  const rows = contractRows(state, content)
  if (rows.length === 0) return null
  return (
    <section className="panel contracts" aria-label={t('contracts.heading')}>
      <h2>{t('contracts.heading')}</h2>
      <ul className="contract-list small">
        {rows.map((c) => (
          <ContractItem key={c.id} contract={c} here={state.location} onAction={onAction} />
        ))}
      </ul>
    </section>
  )
}

function ContractItem({
  contract: c,
  here,
  onAction,
}: {
  contract: ContractRow
  /** Where the party is: at the destination, it says why it can't complete yet. */
  here: string | null
  onAction: (a: Action) => void
}) {
  const { t } = useI18n()
  const [abandoning, setAbandoning] = useState(false)
  const where = c.poiName ?? c.toName
  const left =
    c.daysLeft === null
      ? t('contracts.met', { to: c.toName })
      : c.daysLeft < 0
        ? t('contracts.late')
        : t(c.daysLeft === 1 ? 'contracts.leftOne' : 'contracts.left', {
            n: c.daysLeft,
            day: c.deadline,
          })
  const gold = c.rewards.gold
  const word = c.rewards.goodWord
  return (
    <li className="contract" title={c.text}>
      <div>
        <strong>{c.title}</strong>
        {c.urgent && (
          <>
            {' '}
            <span className="badge urgent">{t('board.urgent')}</span>
          </>
        )}
      </div>
      <div className="muted">
        {t('contracts.where', { to: where, patron: c.patronName })} ·{' '}
        <span className={c.daysLeft !== null && c.daysLeft <= 1 ? 'tone-bad' : undefined}>
          {left}
        </span>
      </div>
      {c.canComplete ? (
        <div className="contract-rewards">
          <button
            className="primary"
            onClick={() => onAction({ type: 'completeContract', id: c.id, reward: 'gold' })}
          >
            {t('contracts.takeGold', { gp: gold.gold })}
          </button>
          <span className="muted">
            {t('contracts.goldGives', { patron: gold.patron, town: gold.settlement })}
          </span>
          <button
            onClick={() => onAction({ type: 'completeContract', id: c.id, reward: 'goodWord' })}
          >
            {t('contracts.goodWord')}
          </button>
          <span className="muted">
            {t('contracts.goodWordGives', {
              points: word.points,
              n: word.settlements,
              kingdom: word.kingdom ?? '—',
              patron: word.patron,
            })}
          </span>
        </div>
      ) : (
        here === c.to && c.reason && <div className="tone-bad">{c.reason}</div>
      )}
      {!c.canComplete && (
        <div className="contract-abandon">
          {abandoning ? (
            <>
              <span className="tone-bad">{t('contracts.abandonSure')}</span>{' '}
              <button onClick={() => onAction({ type: 'abandonContract', id: c.id })}>
                {t('contracts.abandonYes')}
              </button>{' '}
              <button onClick={() => setAbandoning(false)}>{t('contracts.abandonNo')}</button>
            </>
          ) : (
            <button
              className="link"
              title={t('contracts.abandonHint')}
              onClick={() => setAbandoning(true)}
            >
              {t('contracts.abandon')}
            </button>
          )}
        </div>
      )}
    </li>
  )
}
