import { useState } from 'react'
import { formatModifier, formatPercent } from '../engine/format'
import { ABILITIES, SKILLS, isSkill, type CheckStat } from '../engine/rules/abilities'
import { rankActors } from '../engine/rules/character'
import { strainOf } from '../engine/rules/strain'
import { successChance, tierFaces, type RollMode } from '../engine/rules/checks'
import { MAX_DC, MIN_DC, previewCheck, type Action } from '../engine/state'
import type { GameState } from '../schema/state'
import { useI18n } from './i18n/I18n'
import { OddsBar, ROLL_MODE_SUFFIX, neededFace, type OddsLabelMode } from './OddsBar'

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
  const { t, stat: statName, tier: tierName } = useI18n()
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
  const needs = faces ? neededFace(faces) : 20
  const suffix = ROLL_MODE_SUFFIX[mode]

  return (
    <section className="panel" aria-label={t('practice.heading')}>
      <h2>{t('practice.heading')}</h2>
      <div className="controls">
        <label>
          {t('practice.check')}
          <select value={stat} onChange={(e) => setStat(e.target.value as CheckStat)}>
            {STATS.map((s) => (
              <option key={s} value={s}>
                {statName(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('practice.dc')}
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
          {t('practice.position')}
          <select value={mode} onChange={(e) => setMode(e.target.value as RollMode)}>
            <option value="normal">{t('practice.normal')}</option>
            <option value="advantage">{t('practice.edge')}</option>
            <option value="disadvantage">{t('practice.exposed')}</option>
          </select>
        </label>
        <label>
          {t('practice.actor')}
          <select value={selected} onChange={(e) => setActorId(e.target.value)}>
            <option value="">{t('practice.auto')}</option>
            {rankActors(state.party, stat).map((r) => {
              const c = state.party.find((p) => p.id === r.characterId)
              const strain = c && isSkill(stat) ? strainOf(c, stat) : 0
              const name = nameOf(r.characterId)
              const modifier = formatModifier(r.modifier)
              return (
                <option key={r.characterId} value={r.characterId}>
                  {strain > 0
                    ? t('option.actorStrain', { name, modifier, n: strain })
                    : `${name} ${modifier}`}
                </option>
              )
            })}
          </select>
        </label>
      </div>

      {preview ? (
        <>
          <p>
            {t('practice.rolls', {
              actor: preview.actorName,
              stat: statName(stat),
              modifier: formatModifier(preview.modifier),
              dc: preview.dc,
            })}
            {labelMode === 'faces' ? (
              <>
                {t('practice.needsBefore')}
                <strong>{needs}+</strong>
                {t('practice.needsAfter', { suffix: suffix ? t(suffix) : '' })}
              </>
            ) : (
              <>
                <strong>{formatPercent(successChance(preview.odds))}</strong>
                {t('practice.toSucceed')}
              </>
            )}
          </p>
          <div className="odds-row">
            <OddsBar odds={preview.odds} faces={faces ?? undefined} labelMode={labelMode} />
            {showLabelToggle && (
              <div className="seg-toggle" role="group" aria-label={t('practice.oddsLabels')}>
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
        <p className="muted">{t('practice.noOne')}</p>
      )}

      <button
        className="primary"
        disabled={!preview}
        onClick={() =>
          onAction({ type: 'practiceCheck', stat, dc, mode, actorId: selected || undefined })
        }
      >
        {t('practice.roll')}
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
              {t('roll.vsDc', {
                modifier: formatModifier(roll.modifier),
                total: roll.total,
                dc: roll.dc,
              })}
              <strong>{tierName(roll.tier)}</strong>
            </span>
          </>
        )}
      </div>
    </section>
  )
}
