import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ContractReward, ContractRow } from '../engine/town/contracts'
import { useI18n } from './i18n/I18n'
import { trapTab, useInertBehind } from './modal'

type Props = {
  contract: ContractRow
  /** The contract's title, as the panel shows it. */
  title: string
  onChoose: (reward: ContractReward) => void
  /** Escape or the close button: back to the panel without choosing. */
  onClose: () => void
}

/**
 * Claiming a contract's reward (designer call 2026-11-14): a modal with a little flourish (coins,
 * a gilt rule), the contract's title, and the two rewards side by side, each with the total it
 * gives (stacked on a phone). Focus starts on the pay, stays inside, and Escape closes.
 */
export function ContractRewardDialog({ contract: c, title, onChoose, onClose }: Props) {
  const { t } = useI18n()
  const backdrop = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  useInertBehind(backdrop)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.reward-choice button')?.focus()
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    trapTab(e, box.current)
  }
  const gold = c.rewards.gold
  const word = c.rewards.goodWord
  return createPortal(
    <div
      ref={backdrop}
      className="end-backdrop reward-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <div
        ref={box}
        className="reward-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-name`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <button className="reward-close link" aria-label={t('contracts.close')} onClick={onClose}>
          ×
        </button>
        <div className="reward-coins" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="0 0 20 20" className={`reward-coin coin-${i}`}>
              <circle cx="10" cy="10" r="8.5" />
              <circle cx="10" cy="10" r="5.5" className="coin-rim" />
            </svg>
          ))}
        </div>
        <h2 id={`${id}-title`}>{t('contracts.fulfilled')}</h2>
        <p id={`${id}-name`} className="reward-title">
          {title}
        </p>
        <div className="reward-rule" aria-hidden="true">
          <span />◆<span />
        </div>
        <div className="reward-choices">
          <div className="reward-choice">
            <button className="primary" onClick={() => onChoose('gold')}>
              {t('contracts.takeGold', { gp: gold.gold })}
            </button>
            <p className="muted small">
              {t('contracts.goldGives', { n: gold.patron + gold.settlement })}
            </p>
          </div>
          <div className="reward-choice">
            <button onClick={() => onChoose('goodWord')}>{t('contracts.goodWord')}</button>
            <p className="muted small">
              {word.kingdom === null
                ? t('contracts.goodWordTown', {
                    points: word.points,
                    town: c.fromName,
                    patron: word.patron,
                  })
                : t('contracts.goodWordGives', {
                    points: word.points,
                    n: word.settlements,
                    kingdom: word.kingdom,
                    patron: word.patron,
                  })}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
