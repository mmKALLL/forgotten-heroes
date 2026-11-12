import { useEffect, useRef, useState } from 'react'
import type { Content } from '../content/build'
import type { Action } from '../engine/state'
import { contractRows, type ContractRow } from '../engine/town/contracts'
import type { GameState } from '../schema/state'
import { contractText } from './contractText'
import { useI18n } from './i18n/I18n'
import { leftText } from './world/travelText'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/**
 * The contracts the party holds, under the party (design §8): each with where it goes, the days
 * left, and its text (clamped to two lines, the rest on "more"). Where one can be completed it
 * offers the choice of reward, saying what each gives: the pay (with standing for the patron and
 * their town) or a good word across their kingdom. It can be abandoned, after a second click;
 * focus then moves to the next contract, or the heading.
 */
export function ContractsPanel({ content, state, onAction }: Props) {
  const { t } = useI18n()
  const rows = contractRows(state, content)
  const list = useRef<HTMLUListElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // After an abandon, the contract at this index (or the last one, or the heading) takes focus.
  const [refocus, setRefocus] = useState<number | null>(null)
  useEffect(() => {
    if (refocus === null) return
    const items = list.current?.querySelectorAll<HTMLElement>(':scope > li') ?? []
    const item = items[Math.min(refocus, items.length - 1)]
    ;(item?.querySelector<HTMLElement>('button') ?? heading.current)?.focus()
    setRefocus(null)
  }, [refocus])
  if (rows.length === 0) return null
  return (
    <section className="panel contracts" aria-label={t('contracts.heading')}>
      <h2 ref={heading} tabIndex={-1}>
        {t('contracts.heading')}
      </h2>
      <ul className="contract-list small" ref={list}>
        {rows.map((c, i) => (
          <ContractItem
            key={c.id}
            contract={c}
            here={state.location}
            onAction={onAction}
            onAbandoned={() => setRefocus(i)}
          />
        ))}
      </ul>
    </section>
  )
}

function ContractItem({
  contract: c,
  here,
  onAction,
  onAbandoned,
}: {
  contract: ContractRow
  /** Where the party is: at the destination, it says why it can't complete yet. */
  here: string | null
  onAction: (a: Action) => void
  onAbandoned: () => void
}) {
  const i18n = useI18n()
  const { t, name } = i18n
  const goodName = (g: string) => name('goods', g, g)
  const [abandoning, setAbandoning] = useState(false)
  const [open, setOpen] = useState(false)
  const abandonLink = useRef<HTMLButtonElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const asked = useRef(false)
  // Into the question when it opens, back to the link when it is called off.
  useEffect(() => {
    if (abandoning) keep.current?.focus()
    else if (asked.current) abandonLink.current?.focus()
    asked.current = abandoning
  }, [abandoning])
  const { title, text } = contractText(i18n, c)
  const where = c.poiName ?? c.toName
  const left = c.daysLeft === null ? t('contracts.met', { to: c.toName }) : leftText(t, c.daysLeft)
  const gold = c.rewards.gold
  const word = c.rewards.goodWord
  return (
    <li className="contract">
      <div>
        <strong>{title}</strong>
        {c.urgent && (
          <>
            {' '}
            <span className="badge urgent">{t('board.urgent')}</span>
          </>
        )}
      </div>
      <div className="muted">
        {c.kind === 'procurement' && c.good
          ? t('contracts.procure', {
              amount: c.amount,
              good: goodName(c.good).toLowerCase(),
              to: c.toName,
              source: c.sourceName ?? '?',
              patron: c.patronName,
            })
          : t('contracts.where', { to: where, patron: c.patronName })}{' '}
        ·{' '}
        <span className={c.daysLeft !== null && c.daysLeft <= 1 ? 'tone-bad' : undefined}>
          {left}
        </span>
      </div>
      {text && <ContractBlurb text={text} open={open} onToggle={() => setOpen(!open)} />}
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
              <button
                onClick={() => {
                  onAction({ type: 'abandonContract', id: c.id })
                  onAbandoned()
                }}
              >
                {t('contracts.abandonYes')}
              </button>{' '}
              <button ref={keep} onClick={() => setAbandoning(false)}>
                {t('contracts.abandonNo')}
              </button>
            </>
          ) : (
            <button
              ref={abandonLink}
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

/**
 * Texts wider than this may not fit two lines: they get "more". Wide (CJK) characters count
 * twice.
 */
const LONG_TEXT = 100
const textWidth = (text: string) =>
  [...text].reduce((n, ch) => n + (ch.codePointAt(0)! >= 0x2e80 ? 2 : 1), 0)

/** A contract's or an offer's text: two lines, with "more" for the rest. */
export function ContractBlurb({
  text,
  open,
  onToggle,
}: {
  text: string
  open: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()
  return (
    <p className={`contract-text${open ? ' open' : ''}`}>
      <span className="contract-text-body">{text}</span>
      {textWidth(text) > LONG_TEXT && (
        <button className="link" aria-expanded={open} onClick={onToggle}>
          {open ? t('contracts.less') : t('contracts.more')}
        </button>
      )}
    </p>
  )
}
