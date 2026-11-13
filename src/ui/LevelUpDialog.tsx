import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { ABILITIES } from '../engine/rules/abilities'
import { levelUpCards, type LevelUpCard } from '../engine/rules/progression'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { trapTab, useInertBehind } from './modal'

type Props = {
  state: GameState
  /** Continue: the level-ups are seen (`acknowledgeLevelUps`), and the game goes on. */
  onContinue: () => void
}

/**
 * The level-up dialog (designer call 2026-11-14): open while level-ups wait in the state, and the
 * game waits with it (the engine refuses other actions; auto-travel stops for any open modal). A
 * card per member (name, class, old → new level, and what they gained), stacked on a phone, under
 * a few rising stars and a gilt rule, like the contract reward dialog.
 *
 * Today nothing is chosen, so Continue, Enter, Space and Escape all confirm. A later plan's
 * level-up choices (spells and class abilities, "pick 1 of 3") go in each card below its gains,
 * and Continue then waits until they are made.
 */
export function LevelUpDialog({ state, onContinue }: Props) {
  const { t } = useI18n()
  const backdrop = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const go = useRef<HTMLButtonElement>(null)
  const id = useId()
  useInertBehind(backdrop)
  useEffect(() => {
    go.current?.focus()
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    // A focused button takes Enter and Space itself; elsewhere in the dialog they confirm too.
    const onButton = (e.target as HTMLElement).closest('button') !== null
    if (e.key === 'Escape' || (!onButton && (e.key === 'Enter' || e.key === ' '))) {
      e.preventDefault()
      onContinue()
      return
    }
    trapTab(e, box.current)
  }
  const cards = levelUpCards(state)
  return (
    <div
      ref={backdrop}
      className="end-backdrop levelup-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <div
        ref={box}
        className="reward-dialog levelup-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="levelup-stars" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="0 0 20 20" className={`levelup-star star-${i}`}>
              <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7z" />
            </svg>
          ))}
        </div>
        <h2 id={`${id}-title`}>{t('levelUp.title')}</h2>
        <p className="reward-title">{t('levelUp.subtitle')}</p>
        <div className="reward-rule" aria-hidden="true">
          <span />✦<span />
        </div>
        <ul className={`levelup-cards${cards.length === 1 ? ' single' : ''}`}>
          {cards.map((card) => (
            <LevelUpCardView key={card.characterId} card={card} />
          ))}
        </ul>
        <div className="levelup-actions">
          <button ref={go} className="primary" onClick={onContinue}>
            {t('levelUp.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}

function LevelUpCardView({ card }: { card: LevelUpCard }) {
  const { t, name } = useI18n()
  const raised = ABILITIES.filter((a) => (card.gains.abilities[a] ?? 0) > 0)
  const heading = useId()
  return (
    <li className="levelup-card" aria-labelledby={heading}>
      <h3 id={heading}>{card.name}</h3>
      <div className="muted small">{name('classes', card.classId, card.classId)}</div>
      <div className="levelup-levels">{t('levelUp.levels', { from: card.from, to: card.to })}</div>
      <ul className="levelup-gains small">
        <li>
          {t('levelUp.maxHp', { n: card.gains.maxHp })}{' '}
          <span className="muted">{t('levelUp.now', { value: card.maxHpNow })}</span>
        </li>
        {raised.map((a) => (
          <li key={a}>
            {t('levelUp.ability', { n: card.gains.abilities[a]!, ability: t(`ability.${a}`) })}{' '}
            <span className="muted">{t('levelUp.now', { value: card.scores[a] })}</span>
          </li>
        ))}
        {card.proficiencyTo > card.proficiencyFrom && (
          <li>
            {t('levelUp.proficiency', { from: card.proficiencyFrom, to: card.proficiencyTo })}
          </li>
        )}
      </ul>
    </li>
  )
}
