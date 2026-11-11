import { useId, useMemo, useState } from 'react'
import type { Content } from '../../content/build'
import { allSituations } from '../../engine/encounters/compile'
import { inProgress } from '../../engine/encounters/run'
import { contentIssues } from '../../engine/encounters/validate'
import type { Action } from '../../engine/state'
import { SOURCES, type Source } from '../../schema/common'
import type { GameState } from '../../schema/state'
import { useI18n } from '../i18n/I18n'
import { SourceBadge } from '../SourceBadge'

type Props = {
  content: Content
  state: GameState
  /** A roll is still animating: wait for it, even if it ended the encounter. */
  rolling?: boolean
  onAction: (a: Action) => void
}

const EXPANDED_KEY = 'forgotten-heroes/ui/deck-expanded'

/** Whether this viewer last left the encounter list open; collapsed by default. */
function loadExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === 'true'
  } catch {
    return false
  }
}

function saveExpanded(expanded: boolean) {
  try {
    localStorage.setItem(EXPANDED_KEY, String(expanded))
  } catch {
    // Storage unavailable (private mode, quota): the choice just won't persist.
  }
}

/**
 * Dev panel: every situation by source, playable on demand, plus a filtered random draw. The list
 * of situations starts collapsed; the filter and the draw stay visible either way.
 */
export function EncounterDeck({ content, state, rolling = false, onAction }: Props) {
  const { t, localize } = useI18n()
  const situations = useMemo(() => allSituations(content), [content])
  const issues = useMemo(() => contentIssues(content), [content])
  const [sources, setSources] = useState<Source[]>([...SOURCES])
  const toggle = (source: Source) =>
    setSources(
      sources.includes(source) ? sources.filter((s) => s !== source) : [...sources, source]
    )
  const busy = rolling || inProgress(state)
  const [expanded, setExpanded] = useState(loadExpanded)
  const toggleExpanded = () => {
    setExpanded(!expanded)
    saveExpanded(!expanded)
  }
  const listId = useId()
  const shown = situations.filter((s) => sources.includes(s.source))
  // Collapsed, the toggle keeps the warnings visible: how many shown encounters are broken.
  const invalid = shown.filter((s) => Object.hasOwn(issues, s.id)).length
  const collapsedLabel =
    invalid > 0
      ? t('deck.showWarnings', { n: shown.length, invalid })
      : t('deck.show', { n: shown.length })

  return (
    <section className="panel deck" aria-label={t('deck.heading')}>
      <h2>{t('deck.heading')}</h2>
      <div className="controls">
        {SOURCES.map((source) => (
          <label key={source} className="inline">
            <input
              type="checkbox"
              checked={sources.includes(source)}
              onChange={() => toggle(source)}
            />{' '}
            {t(`source.${source}`)} ({situations.filter((s) => s.source === source).length})
          </label>
        ))}
      </div>
      <button
        className="primary"
        disabled={busy || sources.length === 0}
        onClick={() => onAction({ type: 'drawEncounter', sources })}
      >
        {t('deck.draw')}
      </button>
      {busy && <p className="muted small">{t('deck.busy')}</p>}
      {state.followUps.length > 0 && (
        <p className="muted small">
          {t('deck.followUps')}
          {state.followUps
            .map((f) => t('deck.followUp', { id: f.situationId, n: f.wait }))
            .join(', ')}
        </p>
      )}
      <button
        className="deck-toggle"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={toggleExpanded}
      >
        {expanded ? t('deck.hide') : collapsedLabel}
      </button>
      <div id={listId} hidden={!expanded}>
        {SOURCES.filter((source) => sources.includes(source)).map((source) => {
          const group = shown.filter((s) => s.source === source)
          if (group.length === 0) return null
          return (
            <div key={source}>
              <h3>
                <SourceBadge source={source} />
              </h3>
              <ul className="deck-list">
                {group.map((s) => {
                  // Templates arrive here as situations too; only situations are translated so far.
                  const title = localize(s, 'situations').title
                  return (
                    <li key={`${s.file}/${s.id}`}>
                      <span>
                        {title}
                        {s.wonder && <span className="muted small">{t('deck.wonder')}</span>}
                        {s.followUpOnly && (
                          <span className="muted small">{t('deck.followUpOnly')}</span>
                        )}
                        {s.twist && <span className="muted small">{t('deck.twist')}</span>}
                      </span>
                      {Object.hasOwn(issues, s.id) && (
                        <span className="tone-bad small" title={issues[s.id].join('\n')}>
                          ⚠ {issues[s.id].length}
                        </span>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => onAction({ type: 'startEncounter', situationId: s.id })}
                        aria-label={t('deck.playLabel', { title })}
                      >
                        {t('deck.play')}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
