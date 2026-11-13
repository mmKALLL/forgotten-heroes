import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { challengePreview, encounterOptions, twistInfo } from '../../engine/encounters/preview'
import { currentOptions, encounterOver } from '../../engine/encounters/run'
import type { Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { DiceRoll } from '../dice/DiceRoll'
import { localizeEncounterState } from '../i18n/encounter'
import { useI18n } from '../i18n/I18n'
import { SourceBadge } from '../SourceBadge'
import { ChallengeTally } from './ChallengeTally'
import { OptionCard } from './OptionCard'
import { OutcomesPanel } from './OutcomesPanel'
import { lastRollIndex } from './rolls'

/**
 * Renders the active encounter. The rules live in the engine: this shows the previews from
 * encounterOptions() and dispatches the player's choice. A new roll animates, and what it led to
 * stays hidden until the dice settle. Rolls already in the log when the view opened don't animate.
 */
export function EncounterView({
  state,
  onAction,
  onRevealed,
}: {
  state: GameState
  onAction: (a: Action) => void
  /** Called when a new roll's dice settle or are skipped, so the rest of the page can catch up. */
  onRevealed?: () => void
}) {
  const { t, fields, check: checkName } = useI18n()
  const encounter = state.encounter!
  // What the player reads: the situation and its log lines in the UI language, where translated.
  // The rest of this component keys on `encounter`, which never changes with the language.
  const view = localizeEncounterState(state, fields('situations', encounter.situation.id))
  const shown = view.encounter!
  // The first log entry is kept by every step, so a new one means a new encounter started here.
  const first = encounter.log[0]
  const [seen, setSeen] = useState(() => ({ first, baseline: lastRollIndex(encounter) }))
  const [shownRoll, setShownRoll] = useState(seen.baseline)
  const [actorIds, setActorIds] = useState<Record<string, string>>({})
  // The option (stage/id) whose outcomes the shared panel shows: the last one hovered or focused.
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  // The card focused last (stage/id), which keeps the tab stop among the cards.
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const outcomesId = useId()
  if (seen.first !== first) {
    const baseline = lastRollIndex(encounter)
    setSeen({ first, baseline })
    setShownRoll(baseline)
    setActorIds({})
    setPreviewKey(null)
    setActiveKey(null)
  }

  const rollIndex = lastRollIndex(encounter)
  const animating = rollIndex > shownRoll
  const visible = animating ? shown.log.slice(0, rollIndex + 1) : shown.log
  const twist = twistInfo(view)
  // Actor overrides are kept per stage and option: another stage may reuse an option id.
  const prefix = `${encounter.stage}/`
  const keyOf = (optionId: string) => prefix + optionId
  const stageActorIds: Record<string, string> = {}
  for (const [key, actorId] of Object.entries(actorIds)) {
    if (key.startsWith(prefix)) stageActorIds[key.slice(prefix.length)] = actorId
  }
  const options = encounterOptions(view, stageActorIds)
  const challenge = challengePreview(view)
  const checks = new Map(
    currentOptions(encounter).flatMap((o) => (o.kind === 'check' ? [[o.id, o.check]] : []))
  )
  const previewed = options.find((o) => keyOf(o.id) === previewKey) ?? null
  // Ended, or nothing can be chosen any more (e.g. the party is down): it can only close.
  const over = encounterOver(state)

  // When a stage shows (a new encounter, or after each choice once any dice settle), focus moves
  // to the first option card that can be chosen, or to Close; the title only when neither is
  // there. The dice take focus while they roll.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const nextRef = useRef<HTMLDivElement>(null)
  const focusedAt = useRef<{ first: typeof first; length: number } | null>(null)
  const length = encounter.log.length
  useEffect(() => {
    if (animating) return
    const before = focusedAt.current
    focusedAt.current = { first, length }
    // `before` is null on mount; an empty log has no first entry, so compare against null too.
    const sameEncounter = before !== null && before.first === first
    if (sameEncounter && before.length === length) return
    const target = nextRef.current?.querySelector<HTMLElement>(
      '.next:not(:disabled):not([aria-disabled])'
    )
    ;(target ?? headingRef.current)?.focus()
  }, [first, length, animating])

  // Roving tabindex over the cards: one tab stop (the last card focused, else the first that can
  // be chosen); the arrow keys move to the next or previous card that can be chosen, wrapping, and
  // Home and End to the first and last. The actor pickers keep their own arrow keys.
  const current = options.find((o) => keyOf(o.id) === activeKey) ?? null
  const active = (current?.available ? current : null) ?? options.find((o) => o.available) ?? null
  const onOptionsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = options.length
    // From the card focused last, even one that can't be chosen (it was clicked).
    const base = current ?? active
    const from = base ? options.indexOf(base) : -1
    const step = (dir: 1 | -1) => {
      for (let i = 1; i <= n; i++) {
        const j = (((from + dir * i) % n) + n) % n
        if (options[j].available) return j
      }
      return -1
    }
    const to =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? step(1)
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? step(-1)
          : e.key === 'Home'
            ? options.findIndex((o) => o.available)
            : e.key === 'End'
              ? options.findLastIndex((o) => o.available)
              : null
    if (to === null) return
    e.preventDefault()
    if (to < 0) return
    setActiveKey(keyOf(options[to].id))
    nextRef.current?.querySelectorAll<HTMLElement>('.card-choose')[to]?.focus()
  }

  return (
    <section className="panel encounter" aria-label={t('encounter.heading')}>
      <header className="card-head">
        <h2 ref={headingRef} tabIndex={-1}>
          {shown.situation.title}
        </h2>
        <span>
          <SourceBadge source={encounter.source} />
          {encounter.position !== 'normal' && (
            <span className={`badge position-${encounter.position}`}>
              {t(encounter.position === 'edge' ? 'position.edge' : 'position.exposed')}
            </span>
          )}
        </span>
        {encounter.danger > 0 && (
          <span className="encounter-danger muted small">
            {t('encounter.danger', { percent: Math.round(encounter.danger * 100) })}
          </span>
        )}
      </header>
      <ol className="encounter-log" aria-label={t('encounter.log')} aria-live="polite">
        {visible.map((entry, i) => (
          <li key={i} className={`tone-${entry.tone}`}>
            {entry.roll && i === rollIndex && i > seen.baseline && (
              <DiceRoll
                key={i}
                roll={entry.roll}
                highStakes={entry.highStakes}
                onDone={() => {
                  setShownRoll(i)
                  onRevealed?.()
                }}
              />
            )}
            {/* Below the dice and DC row, full width: never beside the dice. */}
            {!(animating && i === rollIndex) && <p className="log-text">{entry.text}</p>}
          </li>
        ))}
      </ol>
      {animating ? null : over ? (
        <div ref={nextRef}>
          <p className="muted">{t('encounter.over')}</p>
          <button className="primary next" onClick={() => onAction({ type: 'closeEncounter' })}>
            {t('encounter.close')}
          </button>
        </div>
      ) : (
        <>
          {challenge && <ChallengeTally challenge={challenge} />}
          <div className="options" ref={nextRef} onKeyDown={onOptionsKey}>
            {options.map((option) => {
              const check = checks.get(option.id)
              return (
                <OptionCard
                  key={keyOf(option.id)}
                  option={option}
                  checkLabel={check && checkName(check.skill, check.ability)}
                  onActor={(id) => setActorIds({ ...actorIds, [keyOf(option.id)]: id })}
                  onPreview={() => setPreviewKey(keyOf(option.id))}
                  previewed={previewed === option}
                  tabStop={active === option}
                  onFocused={() => setActiveKey(keyOf(option.id))}
                  outcomesId={outcomesId}
                  onChoose={() =>
                    onAction({
                      type: 'chooseOption',
                      optionId: option.id,
                      actorId: stageActorIds[option.id] || undefined,
                    })
                  }
                />
              )
            })}
          </div>
          <OutcomesPanel id={outcomesId} option={previewed} twist={twist} />
        </>
      )}
    </section>
  )
}
