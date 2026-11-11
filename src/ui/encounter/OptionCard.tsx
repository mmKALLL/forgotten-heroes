import { useId, type KeyboardEvent, type SyntheticEvent } from 'react'
import type { OptionPreview } from '../../engine/encounters/preview'
import { formatModifier } from '../../engine/format'
import { useI18n } from '../i18n/I18n'
import { OddsBar, type OddsLabelMode } from '../OddsBar'

type Props = {
  option: OptionPreview
  onActor: (actorId: string) => void
  onChoose: () => void
  /** Hovering or focusing the card shows its outcomes in the shared panel. */
  onPreview: () => void
  /** True while the shared outcomes panel shows this option (only the border colour changes). */
  previewed: boolean
  /** The shared outcomes panel's id, which describes the card's choose target. */
  outcomesId: string
  /** d20 faces by default, like the practice check; '%' stays available for a future setting. */
  labelMode?: OddsLabelMode
  /** The check's skill in the UI language; the engine's English label when absent. */
  checkLabel?: string
}

/** Keeps the actor picker's clicks and keys from choosing the card around it. */
const stop = (e: SyntheticEvent) => e.stopPropagation()

/**
 * A fixed option's effects as the engine describes them, e.g. "−25 gp, 1 day passes", so the
 * player needn't open the outcomes panel for it. Null for checks, and when nothing is listable.
 */
function fixedSummary(option: OptionPreview): string | null {
  if (option.kind !== 'fixed') return null
  const outcome = option.outcomes[0]
  if (!outcome || outcome.hidden || outcome.effects.length === 0) return null
  return outcome.effects.join(', ')
}

/**
 * A compact option: title and description on the left; skill, DC, any situational modifier and
 * the actor picker on the right; the odds below. Clicking anywhere but the picker chooses it.
 * The keyboard target is the title area (role="button"), which sits beside the picker rather
 * than around it. Its outcome tiers show in the shared OutcomesPanel instead, except that a fixed
 * option's effects also show in the card, after its description (or its label if it has none).
 */
export function OptionCard({
  option,
  onActor,
  onChoose,
  onPreview,
  previewed,
  outcomesId,
  labelMode = 'faces',
  checkLabel,
}: Props) {
  const { t } = useI18n()
  const { check, available } = option
  const descriptionId = useId()
  const summaryId = useId()
  const summary = fixedSummary(option)
  const summaryText = summary && <span className="effect-summary">({summary})</span>
  const hasDescription = Boolean(option.description) || option.unmet.length > 0
  const summaryOnLabel = Boolean(summary) && !option.description
  const choose = () => {
    if (available) onChoose()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    if (!e.repeat) choose()
  }
  const modifier =
    check && check.situationalModifier !== 0
      ? ` · ${formatModifier(check.situationalModifier)} ${check.situationalReason ?? t('option.situational')}`
      : ''
  const position =
    check && check.mode !== 'normal'
      ? ` · ${t(check.mode === 'advantage' ? 'position.edge' : 'position.exposed')}`
      : ''
  const classes = ['option-card', previewed && 'previewed', !available && 'unavailable']
  return (
    // Mouse convenience only: the role="button" area below is the keyboard and screen-reader target.
    <article
      className={classes.filter(Boolean).join(' ')}
      aria-label={option.label}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      onClick={choose}
    >
      <div className="card-row">
        <div
          className="card-choose next"
          role="button"
          tabIndex={0}
          aria-disabled={!available || undefined}
          aria-label={t('option.choose', { label: option.label })}
          aria-describedby={[
            summaryOnLabel && summaryId,
            hasDescription && descriptionId,
            outcomesId,
          ]
            .filter(Boolean)
            .join(' ')}
          onKeyDown={onKeyDown}
        >
          <strong>{option.label}</strong>
          {summaryOnLabel && (
            <span id={summaryId} className="small">
              {' '}
              {summaryText}
            </span>
          )}
          <div id={descriptionId}>
            {option.description && (
              <p className="small">
                {option.description}
                {summaryText && <> {summaryText}</>}
              </p>
            )}
            {option.unmet.length > 0 && <p className="tone-bad small">{option.unmet.join(', ')}</p>}
          </div>
        </div>
        {check && (
          <div className="card-side">
            <span className="small check-line">
              {t('option.vsDc', { check: checkLabel ?? check.label, dc: check.dc })}
              {modifier}
              {position}
            </span>
            <select
              aria-label={t('option.actorFor', { label: option.label })}
              // The engine's actor: the player's pick while they can act, otherwise the best.
              value={check.actorId}
              onChange={(e) => onActor(e.target.value)}
              onClick={stop}
              onKeyDown={stop}
            >
              {check.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {formatModifier(a.modifier)}
                </option>
              ))}
              {check.unableActors.map((a) => (
                <option key={a.id} value={a.id} disabled>
                  {t('option.cantAct', { name: a.name })}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {check && <OddsBar odds={check.odds} faces={check.faces} labelMode={labelMode} />}
    </article>
  )
}
