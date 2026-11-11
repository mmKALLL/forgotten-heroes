import { useState } from 'react'
import { formatModifier, formatPercent } from '../engine/format'
import { ABILITIES, SKILLS, statLabel, type CheckStat } from '../engine/rules/abilities'
import { rankActors } from '../engine/rules/character'
import { TIER_LABELS, successChance, type RollMode } from '../engine/rules/checks'
import { previewCheck, type Action } from '../engine/state'
import type { GameState } from '../schema/state'
import { OddsBar } from './OddsBar'

const STATS: CheckStat[] = [...SKILLS, ...ABILITIES]

export function CheckPanel({ state, onAction }: { state: GameState; onAction: (a: Action) => void }) {
  const [stat, setStat] = useState<CheckStat>('persuasion')
  const [dc, setDc] = useState(13)
  const [mode, setMode] = useState<RollMode>('normal')
  const [actorId, setActorId] = useState('')
  const preview = previewCheck(state, stat, dc, mode, actorId || undefined)
  const nameOf = (id: string) => state.party.find((c) => c.id === id)?.name ?? '?'
  const roll = state.lastRoll

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
          <input type="number" min={1} max={35} value={dc} onChange={(e) => setDc(Number(e.target.value) || 1)} />
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
          <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
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
            {preview.actorName} rolls {statLabel(stat)} {formatModifier(preview.modifier)} vs DC {dc}:{' '}
            <strong>{formatPercent(successChance(preview.odds))}</strong> to succeed
          </p>
          <OddsBar odds={preview.odds} />
        </>
      ) : (
        <p className="muted">No one is able to act.</p>
      )}

      <button
        className="primary"
        disabled={!preview}
        onClick={() => onAction({ type: 'practiceCheck', stat, dc, mode, actorId: actorId || undefined })}
      >
        Roll
      </button>

      {roll && (
        <div className={`roll tier-${roll.tier}`} aria-live="polite">
          <span className="dice">
            {roll.dice.map((d, i) => (
              <span key={i} className={d === roll.kept && (i === 0 || roll.dice[0] !== d) ? 'die kept' : 'die'}>
                {d}
              </span>
            ))}
          </span>
          <span>
            {formatModifier(roll.modifier)} = {roll.total} vs DC {roll.dc}: <strong>{TIER_LABELS[roll.tier]}</strong>
          </span>
        </div>
      )}
    </section>
  )
}
