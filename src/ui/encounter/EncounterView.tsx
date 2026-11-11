import { useState } from 'react'
import { encounterOptions, twistInfo } from '../../engine/encounters/preview'
import { formatPercent } from '../../engine/format'
import type { Action } from '../../engine/state'
import type { EncounterState, GameState } from '../../schema/state'
import { DiceRoll } from '../dice/DiceRoll'
import { SourceBadge } from '../SourceBadge'
import { OptionCard } from './OptionCard'

const lastRollIndex = (encounter: EncounterState) => encounter.log.findLastIndex((e) => e.roll)

/**
 * Renders the active encounter. The rules live in the engine: this shows the previews from
 * encounterOptions() and dispatches the player's choice. A new roll animates, and what it led to
 * stays hidden until the dice settle. Rolls already in the log when the view opened don't animate.
 */
export function EncounterView({
  state,
  onAction,
}: {
  state: GameState
  onAction: (a: Action) => void
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
  const options = encounterOptions(state, actorIds)
  // An ended encounter, or a stage that offers nothing (e.g. a save from older content), can only close.
  const over = encounter.stage === null || options.length === 0

  return (
    <section className="panel encounter" aria-label="Encounter">
      <header className="card-head">
        <h2>{encounter.situation.title}</h2>
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
                roll={entry.roll}
                highStakes={entry.highStakes}
                onDone={() => setShownRoll(i)}
              />
            )}
            {!(animating && i === rollIndex) && <span>{entry.text}</span>}
          </li>
        ))}
      </ol>
      {animating ? null : over ? (
        <div>
          <p className="muted">The encounter is over.</p>
          <button className="primary" onClick={() => onAction({ type: 'closeEncounter' })}>
            Close
          </button>
        </div>
      ) : (
        <div className="options">
          {options.map((option) => (
            <OptionCard
              key={`${encounter.stage}/${option.id}`}
              option={option}
              twistWhat={twist?.what ?? null}
              actorId={actorIds[option.id] ?? ''}
              onActor={(id) => setActorIds({ ...actorIds, [option.id]: id })}
              onChoose={() =>
                onAction({
                  type: 'chooseOption',
                  optionId: option.id,
                  actorId: actorIds[option.id] || undefined,
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
