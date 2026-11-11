import { useEffect, useRef, useState } from 'react'
import { encounterOptions, twistInfo } from '../../engine/encounters/preview'
import { encounterOver } from '../../engine/encounters/run'
import { formatPercent } from '../../engine/format'
import type { Action } from '../../engine/state'
import type { GameState } from '../../schema/state'
import { DiceRoll } from '../dice/DiceRoll'
import { SourceBadge } from '../SourceBadge'
import { OptionCard } from './OptionCard'
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
  const encounter = state.encounter!
  // The first log entry is kept by every step, so a new one means a new encounter started here.
  const first = encounter.log[0]
  const [seen, setSeen] = useState(() => ({ first, baseline: lastRollIndex(encounter) }))
  const [shownRoll, setShownRoll] = useState(seen.baseline)
  const [actorIds, setActorIds] = useState<Record<string, string>>({})
  if (seen.first !== first) {
    const baseline = lastRollIndex(encounter)
    setSeen({ first, baseline })
    setShownRoll(baseline)
    setActorIds({})
  }

  const rollIndex = lastRollIndex(encounter)
  const animating = rollIndex > shownRoll
  const visible = animating ? encounter.log.slice(0, rollIndex + 1) : encounter.log
  const twist = twistInfo(state)
  // Actor overrides are kept per stage and option: another stage may reuse an option id.
  const prefix = `${encounter.stage}/`
  const keyOf = (optionId: string) => prefix + optionId
  const stageActorIds: Record<string, string> = {}
  for (const [key, actorId] of Object.entries(actorIds)) {
    if (key.startsWith(prefix)) stageActorIds[key.slice(prefix.length)] = actorId
  }
  const options = encounterOptions(state, stageActorIds)
  // Ended, or nothing can be chosen any more (e.g. the party is down): it can only close.
  const over = encounterOver(state)

  // A new encounter focuses its title; after each choice (once any dice settle), focus moves to
  // the first option that can be chosen, or to Close. The dice take focus while they roll.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const nextRef = useRef<HTMLDivElement>(null)
  const focusedAt = useRef<{ first: typeof first; length: number } | null>(null)
  const length = encounter.log.length
  useEffect(() => {
    if (animating) return
    const before = focusedAt.current
    focusedAt.current = { first, length }
    if (before?.first === first && before.length === length) return
    const target =
      before?.first === first
        ? nextRef.current?.querySelector<HTMLButtonElement>('button.next:not(:disabled)')
        : null
    ;(target ?? headingRef.current)?.focus()
  }, [first, length, animating])

  return (
    <section className="panel encounter" aria-label="Encounter">
      <header className="card-head">
        <h2 ref={headingRef} tabIndex={-1}>
          {encounter.situation.title}
        </h2>
        <span>
          <SourceBadge source={encounter.source} />
          {encounter.position !== 'normal' && (
            <span className={`badge position-${encounter.position}`}>
              {encounter.position === 'edge' ? 'Edge' : 'Exposed'}
            </span>
          )}
        </span>
      </header>
      {twist && (
        <p className="muted small">
          Possible twist: {twist.what} (chance:{' '}
          {twist.chance === null ? '?' : formatPercent(twist.chance)})
        </p>
      )}
      <ol className="encounter-log" aria-live="polite">
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
            {!(animating && i === rollIndex) && <span>{entry.text}</span>}
          </li>
        ))}
      </ol>
      {animating ? null : over ? (
        <div ref={nextRef}>
          <p className="muted">The encounter is over.</p>
          <button className="primary next" onClick={() => onAction({ type: 'closeEncounter' })}>
            Close
          </button>
        </div>
      ) : (
        <div className="options" ref={nextRef}>
          {options.map((option) => (
            <OptionCard
              key={keyOf(option.id)}
              option={option}
              twistWhat={twist?.what ?? null}
              actorId={stageActorIds[option.id] ?? ''}
              onActor={(id) => setActorIds({ ...actorIds, [keyOf(option.id)]: id })}
              onChoose={() =>
                onAction({
                  type: 'chooseOption',
                  optionId: option.id,
                  actorId: stageActorIds[option.id] || undefined,
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
