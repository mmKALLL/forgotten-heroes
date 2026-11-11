import { useMemo, useState } from 'react'
import type { Content } from '../../content/build'
import { allSituations } from '../../engine/encounters/compile'
import { contentIssues } from '../../engine/encounters/validate'
import type { Action } from '../../engine/state'
import { SOURCES, type Source } from '../../schema/common'
import type { GameState } from '../../schema/state'
import { SOURCE_LABELS, SourceBadge } from '../SourceBadge'

type Props = { content: Content; state: GameState; onAction: (a: Action) => void }

/** Dev panel: every situation by source, playable on demand, plus a filtered random draw. */
export function EncounterDeck({ content, state, onAction }: Props) {
  const situations = useMemo(() => allSituations(content), [content])
  const issues = useMemo(() => contentIssues(content), [content])
  const [sources, setSources] = useState<Source[]>([...SOURCES])
  const toggle = (source: Source) =>
    setSources(sources.includes(source) ? sources.filter((s) => s !== source) : [...sources, source])

  return (
    <section className="panel deck" aria-label="Encounter Deck">
      <h2>Encounter Deck</h2>
      <div className="controls">
        {SOURCES.map((source) => (
          <label key={source} className="inline">
            <input type="checkbox" checked={sources.includes(source)} onChange={() => toggle(source)} />{' '}
            {SOURCE_LABELS[source]} ({situations.filter((s) => s.source === source).length})
          </label>
        ))}
      </div>
      <button
        className="primary"
        disabled={sources.length === 0}
        onClick={() => onAction({ type: 'drawEncounter', sources })}
      >
        Random draw
      </button>
      {state.followUps.length > 0 && (
        <p className="muted small">
          Queued follow-ups: {state.followUps.map((f) => `${f.situationId} (after ${f.wait})`).join(', ')}
        </p>
      )}
      {SOURCES.filter((source) => sources.includes(source)).map((source) => {
        const group = situations.filter((s) => s.source === source)
        if (group.length === 0) return null
        return (
          <div key={source}>
            <h3>
              <SourceBadge source={source} />
            </h3>
            <ul className="deck-list">
              {group.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.title}
                    {s.wonder && <span className="muted small"> · wonder</span>}
                    {s.followUpOnly && <span className="muted small"> · follow-up</span>}
                    {s.twist && <span className="muted small"> · twist</span>}
                  </span>
                  {issues[s.id] && (
                    <span className="tone-bad small" title={issues[s.id].join('\n')}>
                      ⚠ {issues[s.id].length}
                    </span>
                  )}
                  <button
                    onClick={() => onAction({ type: 'startEncounter', situationId: s.id })}
                    aria-label={`Play ${s.title}`}
                  >
                    Play
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
