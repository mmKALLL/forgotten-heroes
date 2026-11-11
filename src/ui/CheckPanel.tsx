import { useState } from 'react'
import { formatModifier, formatPercent } from '../engine/format'
import { ABILITIES, SKILLS, statLabel, type CheckStat } from '../engine/rules/abilities'
import { rankActors } from '../engine/rules/character'
import { TIER_LABELS, successChance, tierFaces, type RollMode } from '../engine/rules/checks'
import { MAX_DC, MIN_DC, previewCheck, type Action } from '../engine/state'
import type { GameState } from '../schema/state'
import { OddsBar, type OddsLabelMode } from './OddsBar'

const ODDS_LABEL_KEY = 'forgotten-heroes/ui/odds-label'
const DEFAULT_ODDS_LABEL_MODE: OddsLabelMode = 'faces'

function loadOddsLabelMode(): OddsLabelMode {
  try {
    return localStorage.getItem(ODDS_LABEL_KEY) === 'percent' ? 'percent' : DEFAULT_ODDS_LABEL_MODE
  } catch {
    return DEFAULT_ODDS_LABEL_MODE
  }
}

function saveOddsLabelMode(mode: OddsLabelMode) {
  try {
    localStorage.setItem(ODDS_LABEL_KEY, mode)
  } catch {
    // Storage unavailable (private mode, quota): the choice just won't persist.
  }
}

const MODE_SUFFIX: Record<RollMode, string> = {
  normal: '',
  advantage: ' (best of 2)',
  disadvantage: ' (worst of 2)',
}

const STATS: CheckStat[] = [...SKILLS, ...ABILITIES]

export function CheckPanel({
  state,
  onAction,
  showLabelToggle = false,
}: {
  state: GameState
  onAction: (a: Action) => void
  /** The %/d20 toggle is hidden for now; it will move to a settings view. Hidden, the default applies. */
  showLabelToggle?: boolean
}) {
  const [stat, setStat] = useState<CheckStat>('persuasion')
  // Keep the raw text so the field can be cleared and retyped; the engine normalises the number.
  const [dcText, setDcText] = useState('13')
  const dc = dcText.trim() === '' ? Number.NaN : Number(dcText)
  const [mode, setMode] = useState<RollMode>('normal')
  const [actorId, setActorId] = useState('')
  const [labelMode, setLabelMode] = useState<OddsLabelMode>(() =>
    showLabelToggle ? loadOddsLabelMode() : DEFAULT_ODDS_LABEL_MODE
  )
  const chooseLabelMode = (m: OddsLabelMode) => {
    setLabelMode(m)
    saveOddsLabelMode(m)
  }
  // An override can outlive its character (e.g. after "New party"): fall back to Auto.
  const selected = state.party.some((c) => c.id === actorId) ? actorId : ''
  const preview = previewCheck(state, stat, dc, mode, selected || undefined)
  const nameOf = (id: string) => state.party.find((c) => c.id === id)?.name ?? '?'
  const roll = state.lastRoll
  const faces = preview ? tierFaces(preview.modifier, preview.dc) : null
  // Lowest kept face that succeeds; only the natural 20 when the DC is out of reach.
  const needs = faces ? (faces.success?.min ?? 20) : 20

  return (
    <section className="panel" aria-label="Practice check">
      <h2>Practice check</h2>
      <div className="controls">
        <label>
          Check
          <select value={stat} onChange={(e) => setStat(e.target.value as CheckStat)}>
            {STATS.map((s) => (
              <option key={s} value={s}>
                {statLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          DC
          <input
            type="number"
            min={MIN_DC}
            max={MAX_DC}
            step={1}
            value={dcText}
            onChange={(e) => setDcText(e.target.value)}
          />
        </label>
        <label>
          Position
          <select value={mode} onChange={(e) => setMode(e.target.value as RollMode)}>
            <option value="normal">Normal</option>
            <option value="advantage">Edge (advantage)</option>
            <option value="disadvantage">Exposed (disadvantage)</option>
          </select>
        </label>
        <label>
          Actor
          <select value={selected} onChange={(e) => setActorId(e.target.value)}>
            <option value="">Auto (best)</option>
            {rankActors(state.party, stat).map((r) => (
              <option key={r.characterId} value={r.characterId}>
                {nameOf(r.characterId)} {formatModifier(r.modifier)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {preview ? (
        <>
          <p>
            {preview.actorName} rolls {statLabel(stat)} {formatModifier(preview.modifier)} vs DC {preview.dc}:{' '}
            {labelMode === 'faces' ? (
              <>
                needs <strong>{needs}+</strong> on the d20{MODE_SUFFIX[mode]}
              </>
            ) : (
              <>
                <strong>{formatPercent(successChance(preview.odds))}</strong> to succeed
              </>
            )}
          </p>
          <div className="odds-row">
            <OddsBar odds={preview.odds} faces={faces ?? undefined} labelMode={labelMode} />
            {showLabelToggle && (
              <div className="seg-toggle" role="group" aria-label="Odds labels">
                {(
                  [
                    ['percent', '%'],
                    ['faces', 'd20'],
                  ] as const
                ).map(([m, text]) => (
                  <button key={m} aria-pressed={labelMode === m} onClick={() => chooseLabelMode(m)}>
                    {text}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="muted">No one is able to act.</p>
      )}

      <button
        className="primary"
        disabled={!preview}
        onClick={() => onAction({ type: 'practiceCheck', stat, dc, mode, actorId: selected || undefined })}
      >
        Roll
      </button>

      <div className={roll ? `roll tier-${roll.tier}` : 'roll'} aria-live="polite">
        {roll && (
          <>
            <span className="dice">
              {roll.dice.map((d, i) => (
                <span key={i} className={i === roll.keptIndex ? 'die kept' : 'die'}>
                  {d}
                </span>
              ))}
            </span>
            <span>
              {formatModifier(roll.modifier)} = {roll.total} vs DC {roll.dc}:{' '}
              <strong>{TIER_LABELS[roll.tier]}</strong>
            </span>
          </>
        )}
      </div>
    </section>
  )
}
