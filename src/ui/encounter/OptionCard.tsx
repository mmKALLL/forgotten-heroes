import type { OptionPreview } from '../../engine/encounters/preview'
import { formatModifier, formatPercent } from '../../engine/format'
import { OddsBar, ROLL_MODE_SUFFIX, neededFace, type OddsLabelMode } from '../OddsBar'

type Props = {
  option: OptionPreview
  onActor: (actorId: string) => void
  onChoose: () => void
  /** Hovering or focusing the card shows its outcomes in the shared panel. */
  onPreview: () => void
  /** True while the shared outcomes panel shows this option (only the border colour changes). */
  previewed: boolean
  /** The shared outcomes panel's id, which describes the Choose button. */
  outcomesId: string
  /** d20 faces by default, like the practice check; '%' stays available for a future setting. */
  labelMode?: OddsLabelMode
}

/**
 * A compact option: title with skill and DC, description, the face it needs, the odds, and a row
 * with Choose and the actor picker. Its outcome tiers show in the shared OutcomesPanel instead.
 */
export function OptionCard({
  option,
  onActor,
  onChoose,
  onPreview,
  previewed,
  outcomesId,
  labelMode = 'faces',
}: Props) {
  const { check } = option
  return (
    <article
      className={previewed ? 'option-card previewed' : 'option-card'}
      aria-label={option.label}
      onMouseEnter={onPreview}
      onFocus={onPreview}
    >
      <header className="card-head">
        <strong>{option.label}</strong>
        {check && (
          <span>
            {check.label} vs DC {check.dc}
            {check.mode !== 'normal' && ` · ${check.mode === 'advantage' ? 'Edge' : 'Exposed'}`}
          </span>
        )}
      </header>
      {option.description && <p className="small">{option.description}</p>}
      {check && (
        <>
          <p className="muted small">
            {check.situationalModifier !== 0 &&
              `${formatModifier(check.situationalModifier)} (${check.situationalReason ?? 'situational'}) · `}
            {labelMode === 'faces' ? (
              <>
                needs <strong>{neededFace(check.faces)}+</strong> on the d20
                {ROLL_MODE_SUFFIX[check.mode]}
              </>
            ) : (
              <>
                <strong>{formatPercent(check.successChance)}</strong> to succeed
              </>
            )}
          </p>
          <OddsBar odds={check.odds} faces={check.faces} labelMode={labelMode} />
        </>
      )}
      {option.unmet.length > 0 && <p className="tone-bad small">{option.unmet.join(', ')}</p>}
      <div className="choose-row">
        <button
          className="primary next"
          disabled={!option.available}
          onClick={onChoose}
          aria-label={`Choose ${option.label}`}
          aria-describedby={outcomesId}
        >
          Choose
        </button>
        {check && (
          <select
            aria-label={`Actor for ${option.label}`}
            // The engine's actor: the player's pick while they can act, otherwise the best.
            value={check.actorId}
            onChange={(e) => onActor(e.target.value)}
          >
            {check.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {formatModifier(a.modifier)}
              </option>
            ))}
            {check.unableActors.map((a) => (
              <option key={a.id} value={a.id} disabled>
                {a.name} (can't act)
              </option>
            ))}
          </select>
        )}
      </div>
    </article>
  )
}
