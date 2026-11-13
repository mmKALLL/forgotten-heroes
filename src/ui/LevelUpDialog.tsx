import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { ABILITIES } from '../engine/rules/abilities'
import type { Content } from '../content/build'
import { abilityAsHeld } from '../engine/combat/uses'
import {
  choiceOptions,
  choicesMade,
  levelUpCards,
  type LevelUpCard,
} from '../engine/rules/progression'
import type { Action } from '../engine/state'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { trapTab, useInertBehind } from './modal'

type Props = {
  content: Content
  state: GameState
  /** Continue: the level-ups are seen (`acknowledgeLevelUps`), and the game goes on. */
  onContinue: () => void
  /** A level's pick (`chooseLevelUp`): a fighter's style, a bard's specialisation. */
  onAction: (a: Action) => void
}

/**
 * The level-up dialog (designer call 2026-11-14): open while level-ups wait in the state, and the
 * game waits with it (the engine refuses other actions; auto-travel stops for any open modal). A
 * card per member (name, class, old → new level, and what they gained), stacked on a phone, under
 * a few rising stars and a gilt rule, like the contract reward dialog.
 *
 * A level that grants a pick (Plan 7 Track C: a fighter's style, a bard's specialisation) shows
 * a choice section in that member's card, below the gains, and Continue (and Enter, Space and
 * Escape) waits until every pick is made. TODO (spell casting): a spell's 1-of-3 pick is a choice
 * section too.
 */
export function LevelUpDialog({ content, state, onContinue, onAction }: Props) {
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
    const onControl = (e.target as HTMLElement).closest('button, input') !== null
    if (e.key === 'Escape' || (!onControl && (e.key === 'Enter' || e.key === ' '))) {
      e.preventDefault()
      if (ready) onContinue()
      return
    }
    trapTab(e, box.current)
  }
  const cards = levelUpCards(state)
  const ready = choicesMade(state)
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
            <LevelUpCardView
              key={card.characterId}
              card={card}
              options={card.choices.map((_, i) =>
                choiceOptions(state, content, card.characterId, i)
              )}
              content={content}
              onAction={onAction}
            />
          ))}
        </ul>
        <div className="levelup-actions">
          <button
            ref={go}
            className="primary"
            onClick={onContinue}
            disabled={!ready}
            title={ready ? undefined : t('levelUp.choose')}
          >
            {t('levelUp.continue')}
          </button>
          {!ready && <p className="muted small">{t('levelUp.choose')}</p>}
        </div>
      </div>
    </div>
  )
}

function LevelUpCardView({
  card,
  options,
  content,
  onAction,
}: {
  card: LevelUpCard
  /** Each choice's options (choiceOptions). */
  options: string[][]
  content: Content
  onAction: (a: Action) => void
}) {
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
      {card.choices.map((choice, i) => (
        <fieldset key={i} className="levelup-choice small">
          <legend>{t(`levelUp.pick.${choice.kind}`, { level: choice.level })}</legend>
          {options[i].map((option) => {
            const ability = Object.hasOwn(content.classAbilities, option)
              ? content.classAbilities[option]
              : null
            const label = ability
              ? ability.name
              : t(`levelUp.style.${option as 'two-attack' | 'single-blow'}`)
            const detail = ability
              ? abilityAsHeld(ability, { picks: [option] }).description
              : t(`levelUp.styleHint.${option as 'two-attack' | 'single-blow'}`)
            return (
              <label key={option} className="levelup-option">
                <input
                  type="radio"
                  name={`${card.characterId}-${i}`}
                  checked={choice.chosen === option}
                  onChange={() =>
                    onAction({
                      type: 'chooseLevelUp',
                      characterId: card.characterId,
                      index: i,
                      option,
                    })
                  }
                />{' '}
                <span>
                  <strong>{label}</strong> <span className="muted">{detail}</span>
                </span>
              </label>
            )
          })}
        </fieldset>
      ))}
    </li>
  )
}
